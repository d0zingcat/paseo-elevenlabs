import { randomBytes } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  getDictationStt,
  hasPreviousSnapshot,
  isOurEndpoint,
  patchDictationStt,
  readDaemonConfig,
  restoreDictationIfOurs,
  takeOverDictation,
} from "./server/config-manager";
import { getVoiceSttProvider } from "./server/providers";
import { type StartedShim, startShim } from "./server/shim";
import {
  clearProviderApiKey,
  readProviderApiKey,
  readShimToken,
  writeProviderApiKey,
  writeShimToken,
} from "./server/store";
import {
  clearApiKeyRpc,
  DEFAULT_SHIM_PORT,
  DEFAULT_TRANSCRIPT_EDIT_PROMPT,
  enableDictationRpc,
  getStatusRpc,
  MAX_TRANSCRIPT_EDIT_CHARS,
  restorePreviousRpc,
  setApiKeyRpc,
  testKeyRpc,
  VOICE_PROVIDERS,
  voicePreferences,
  type VoicePreferences,
  type VoiceProviderId,
} from "./shared/voice";

const DEFAULT_PREFS: VoicePreferences = {
  provider: "elevenlabs",
  modelId: "scribe_v3",
  language: "",
  secondaryLanguages: "",
  numbersAsDigits: true,
  transcriptEditEnabled: false,
  transcriptEditPrompt: DEFAULT_TRANSCRIPT_EDIT_PROMPT,
  port: DEFAULT_SHIM_PORT,
  manageDictation: true,
};

interface RuntimeState {
  shim: StartedShim | null;
  token: string;
  baseUrl: string;
  lastError: string | null;
  needsConfigSync: boolean;
  stopping: boolean;
  paseo: PaseoApi | null;
}

function createState(): RuntimeState {
  return {
    shim: null,
    token: "",
    baseUrl: "",
    lastError: null,
    needsConfigSync: false,
    stopping: false,
    paseo: null,
  };
}

async function syncActiveShimConfig(
  paseo: PaseoApi,
  baseUrl: string,
  token: string,
  model: string,
): Promise<boolean> {
  const currentStt = getDictationStt(await readDaemonConfig(paseo));
  if (!currentStt || typeof currentStt !== "object" || !isOurEndpoint(currentStt, baseUrl)) {
    return false;
  }
  await patchDictationStt(paseo, {
    ...(currentStt as Record<string, unknown>),
    apiKey: token,
    model,
  });
  await writeShimToken(token);
  return true;
}

async function readPrefs(read: () => Promise<{ status: string; values?: unknown }>): Promise<VoicePreferences> {
  try {
    const state = await read();
    if (state.status === "ready" && state.values && typeof state.values === "object") {
      const values = state.values as Partial<VoicePreferences>;
      const provider: VoiceProviderId =
        typeof values.provider === "string" && (VOICE_PROVIDERS as readonly string[]).includes(values.provider)
          ? (values.provider as VoiceProviderId)
          : "elevenlabs";
      const adapter = getVoiceSttProvider(provider);
      const validModel =
        typeof values.modelId === "string" && adapter.models.some((model) => model.id === values.modelId)
          ? values.modelId
          : adapter.defaultModelId;
      return {
        provider,
        modelId: validModel,
        language: typeof values.language === "string" ? values.language : "",
        secondaryLanguages: typeof values.secondaryLanguages === "string" ? values.secondaryLanguages : "",
        numbersAsDigits: values.numbersAsDigits !== false,
        transcriptEditEnabled: values.transcriptEditEnabled === true,
        transcriptEditPrompt:
          typeof values.transcriptEditPrompt === "string"
            ? values.transcriptEditPrompt.slice(0, MAX_TRANSCRIPT_EDIT_CHARS)
            : DEFAULT_TRANSCRIPT_EDIT_PROMPT,
        port:
          typeof values.port === "number" && Number.isInteger(values.port) && values.port >= 1024 && values.port <= 65535
            ? values.port
            : DEFAULT_SHIM_PORT,
        manageDictation: values.manageDictation !== false,
      };
    }
  } catch {
    // Fall through to defaults.
  }
  return { ...DEFAULT_PREFS };
}

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(voicePreferences);
  const readSettings = () => settings.read() as unknown as Promise<{ status: string; values?: unknown }>;
  const state = createState();
  const remember = (paseo: PaseoApi) => {
    state.paseo = paseo;
  };
  let currentPrefs: VoicePreferences = { ...DEFAULT_PREFS };
  settings.subscribe((next) => {
    if (next.status === "ready") {
      void readPrefs(readSettings).then((prefs) => {
        currentPrefs = prefs;
      });
    }
  });

  async function ensureShim(
    prefs: VoicePreferences,
    options: { reusePersistedToken?: boolean } = {},
  ): Promise<{ shim: StartedShim; reusedToken: boolean }> {
    if (state.shim && state.baseUrl !== "") {
      const currentPort = new URL(state.baseUrl).port;
      if (Number(currentPort) === prefs.port) return { shim: state.shim, reusedToken: true };
      state.stopping = true;
      try {
        await state.shim.stop();
      } finally {
        state.stopping = false;
      }
      state.shim = null;
    }
    const persisted = options.reusePersistedToken ? await readShimToken() : null;
    const reusedToken = persisted !== null;
    state.token = persisted ?? randomBytes(32).toString("hex");
    const shim = await startShim(prefs.port, {
      getProviderId: () => currentPrefs.provider,
      getToken: () => state.token,
      getModelId: () => currentPrefs.modelId,
      getLanguage: () => currentPrefs.language,
      getSecondaryLanguages: () => currentPrefs.secondaryLanguages,
      getNumbersAsDigits: () => currentPrefs.numbersAsDigits,
      getTranscriptEdit: () =>
        currentPrefs.transcriptEditEnabled ? currentPrefs.transcriptEditPrompt : undefined,
      getApiKey: (provider) => readProviderApiKey(provider),
      onError: (message: string) => {
        state.lastError = message;
        console.error("[paseo-voice]", message);
      },
    });
    state.shim = shim;
    state.baseUrl = shim.baseUrl;
    state.lastError = null;
    shim.server.on("close", () => {
      if (!state.stopping && state.shim === shim) {
        state.shim = null;
        state.lastError = "Gateway stopped unexpectedly. Use Restore to return to the previous voice setting.";
        console.error("[paseo-voice] shim closed unexpectedly; restoring previous dictation setting.");
        if (state.paseo) {
          restoreDictationIfOurs(state.paseo, state.baseUrl).catch((error: unknown) => {
            console.error("[paseo-voice] auto-restore failed:", error instanceof Error ? error.message : error);
          });
        }
      }
    });
    console.log("[paseo-voice] shim listening on " + shim.baseUrl);
    return { shim, reusedToken };
  }

  server.handle(getStatusRpc, async (_, { paseo }) => {
    remember(paseo);
    currentPrefs = await readPrefs(readSettings);
    if (state.needsConfigSync && state.shim && state.baseUrl !== "" && currentPrefs.manageDictation) {
      try {
        await syncActiveShimConfig(paseo, state.baseUrl, state.token, currentPrefs.modelId);
        state.needsConfigSync = false;
        state.lastError = null;
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
      }
    }
    const key = await readProviderApiKey(currentPrefs.provider);
    let managing = state.baseUrl !== "" && state.shim !== null;
    if (managing) {
      try {
        managing = isOurEndpoint(getDictationStt(await readDaemonConfig(paseo)), state.baseUrl);
      } catch {
        // Keep runtime shim assumption if config read temporarily fails.
      }
    }
    let previousSaved = false;
    try {
      previousSaved = await hasPreviousSnapshot();
    } catch {
      previousSaved = false;
    }
    return {
      provider: currentPrefs.provider,
      running: state.shim !== null,
      baseUrl: state.baseUrl,
      port: currentPrefs.port,
      modelId: currentPrefs.modelId,
      language: currentPrefs.language,
      manageDictation: currentPrefs.manageDictation,
      hasKey: key !== null,
      managing,
      previousSaved,
      lastError: state.lastError,
    };
  });

  server.handle(setApiKeyRpc, async ({ provider, key }) => {
    const trimmed = key.trim();
    if (trimmed.length < 10) throw new Error("That key looks too short to be an API key.");
    await writeProviderApiKey(provider, trimmed);
    return { ok: true };
  });

  server.handle(clearApiKeyRpc, async ({ provider }) => {
    await clearProviderApiKey(provider);
    return { ok: true };
  });

  server.handle(testKeyRpc, async ({ provider }) => {
    const adapter = getVoiceSttProvider(provider);
    const key = await readProviderApiKey(provider);
    if (!key) return { ok: false, message: "No " + adapter.label + " API key is saved yet." };
    return adapter.testApiKey(key);
  });

  server.handle(enableDictationRpc, async (_, { paseo }) => {
    remember(paseo);
    currentPrefs = await readPrefs(readSettings);
    const adapter = getVoiceSttProvider(currentPrefs.provider);
    const key = await readProviderApiKey(currentPrefs.provider);
    if (!key) throw new Error("Save a " + adapter.label + " API key first.");
    if (!currentPrefs.manageDictation) throw new Error("Dictation management is turned off in preferences.");
    const { shim } = await ensureShim(currentPrefs);
    try {
      const { alreadyManaged } = await takeOverDictation(paseo, shim.baseUrl, state.token, currentPrefs.modelId);
      if (alreadyManaged) {
        // Same endpoint, but the token rotates on every shim start: refresh it.
        await syncActiveShimConfig(paseo, shim.baseUrl, state.token, currentPrefs.modelId);
      } else {
        await writeShimToken(state.token);
      }
      state.needsConfigSync = false;
      state.lastError = null;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    return {
      ok: true,
      baseUrl: shim.baseUrl,
      message: "Dictation now uses " + adapter.label + " (" + currentPrefs.modelId + ").",
    };
  });

  server.handle(restorePreviousRpc, async (_, { paseo }) => {
    remember(paseo);
    currentPrefs = await readPrefs(readSettings);
    const target = state.baseUrl || "http://127.0.0.1:" + currentPrefs.port + "/v1";
    const result = await restoreDictationIfOurs(paseo, target);
    return { ok: result.restored, restored: result.restored, message: result.reason };
  });

  // Resume management across daemon restarts: when a previous snapshot or
  // persisted shim token exists, the user was using Paseo Voice, so restart the
  // shim and reuse/refresh the token. Fresh installs wait for an explicit Enable.
  void (async () => {
    try {
      currentPrefs = await readPrefs(readSettings);
      if (!currentPrefs.manageDictation) return;
      const hasSnapshot = await hasPreviousSnapshot();
      const hasToken = (await readShimToken()) !== null;
      if (!hasSnapshot && !hasToken) return;
      const adapter = getVoiceSttProvider(currentPrefs.provider);
      const key = await readProviderApiKey(currentPrefs.provider);
      if (!key) {
        state.lastError = adapter.label + " API key is missing after restart; dictation was left as-is.";
        return;
      }
      const { shim, reusedToken } = await ensureShim(currentPrefs, { reusePersistedToken: true });
      if (state.paseo) {
        const { alreadyManaged } = await takeOverDictation(state.paseo, shim.baseUrl, state.token, currentPrefs.modelId);
        if (alreadyManaged) {
          await syncActiveShimConfig(state.paseo, shim.baseUrl, state.token, currentPrefs.modelId);
        } else {
          await writeShimToken(state.token);
        }
        state.needsConfigSync = false;
      } else if (!reusedToken) {
        state.needsConfigSync = true;
        state.lastError = "Gateway restarted with a new token; open the Paseo Voice screen once to sync dictation.";
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      console.error("[paseo-voice] startup resume failed:", state.lastError);
    }
  })();

  return async () => {
    state.stopping = true;
    if (state.shim) {
      try {
        await state.shim.stop();
      } catch {
        // Shutting down anyway.
      }
      state.shim = null;
    }
    // Best effort: leave dictation working after disable/remove. Guarded to
    // only touch the config when it still points at our shim.
    if (state.paseo && state.baseUrl !== "") {
      try {
        await restoreDictationIfOurs(state.paseo, state.baseUrl);
      } catch (error) {
        console.error("[paseo-voice] restore on unload failed:", error instanceof Error ? error.message : error);
      }
    }
  };
}

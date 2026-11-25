import type { PaseoApi } from "@getpaseo/client";
import {
  clearPreviousDictationStt,
  clearShimToken,
  readPreviousDictationStt,
  writePreviousDictationStt,
} from "./store";

export interface DictationSttSnapshot {
  raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

export function getDictationStt(config: unknown): unknown {
  const root = asRecord(config);
  const features = root ? asRecord(root.features) : null;
  const dictation = features ? asRecord(features.dictation) : null;
  return dictation ? (dictation.stt ?? null) : null;
}

export function isOurEndpoint(stt: unknown, baseUrl: string): boolean {
  const record = asRecord(stt);
  return record !== null && record.provider === "openai" && record.baseUrl === baseUrl;
}

function omitKeys(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!keys.includes(key)) clean[key] = value;
  }
  return clean;
}

function sanitizeForRestore(snapshot: unknown): Record<string, unknown> | null {
  const record = asRecord(snapshot);
  if (!record) return null;
  // hasApiKey is a read-only marker; never write it back. The daemon keeps
  // the stored secret when a patch omits apiKey.
  const clean = omitKeys(record, ["hasApiKey", "apiKey"]);
  if (typeof clean.provider !== "string") return null;
  return clean;
}

export async function readDaemonConfig(paseo: PaseoApi): Promise<unknown> {
  const result = await paseo.config.get();
  return result.config as unknown;
}

export async function patchDictationStt(paseo: PaseoApi, stt: Record<string, unknown>): Promise<void> {
  // hasApiKey is read-only in config reads and rejected in config patches.
  // Patch only features.dictation.stt so sibling sections with read-only markers are not sent back.
  const cleanStt = omitKeys(stt, ["hasApiKey"]);
  await paseo.config.patch({
    features: {
      dictation: { stt: cleanStt },
    },
  });
}

/**
 * Save the current dictation STT unless it already points at our shim,
 * then switch dictation to the shim endpoint.
 */
export async function takeOverDictation(
  paseo: PaseoApi,
  baseUrl: string,
  token: string,
  model: string,
): Promise<{ alreadyManaged: boolean }> {
  const current = getDictationStt(await readDaemonConfig(paseo));
  if (isOurEndpoint(current, baseUrl)) return { alreadyManaged: true };
  await writePreviousDictationStt(current);
  await patchDictationStt(paseo, {
    provider: "openai",
    baseUrl,
    apiKey: token,
    model,
  });
  return { alreadyManaged: false };
}

/**
 * Restore the previously saved dictation STT, but only when the live config
 * still points at our shim. Returns false when there is nothing to restore
 * or the user has moved on to another configuration (we leave it alone).
 */
export async function restoreDictationIfOurs(
  paseo: PaseoApi,
  baseUrl: string,
): Promise<{ restored: boolean; reason: string }> {
  const current = getDictationStt(await readDaemonConfig(paseo));
  if (!isOurEndpoint(current, baseUrl)) {
    return { restored: false, reason: "Dictation no longer points at ElevenLabs; leaving it alone." };
  }
  const previous = await readPreviousDictationStt();
  if (previous === null || previous === undefined) {
    return { restored: false, reason: "No previous dictation setting was saved." };
  }
  const clean = sanitizeForRestore(previous);
  if (!clean) {
    return { restored: false, reason: "Saved dictation setting is unreadable; leaving the shim endpoint in place." };
  }
  await patchDictationStt(paseo, clean);
  await clearPreviousDictationStt();
  await clearShimToken();
  return { restored: true, reason: "Previous dictation setting restored." };
}

export async function hasPreviousSnapshot(): Promise<boolean> {
  const previous = await readPreviousDictationStt();
  return previous !== null && previous !== undefined;
}

import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const ELEVENLABS_STT_MODELS = ["scribe_v2", "scribe_v3"] as const;
export type ElevenlabsSttModel = (typeof ELEVENLABS_STT_MODELS)[number];

export const DEFAULT_SHIM_PORT = 8765;
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

export const elevenlabsPreferences = defineSettings({
  id: "elevenlabs",
  scope: "host",
  version: 1,
  schema: z.object({
    modelId: z.enum(ELEVENLABS_STT_MODELS).default("scribe_v2"),
    // BCP-47 / ISO-639-1 code such as "en" or "zh". Empty means auto-detect.
    language: z.string().default(""),
    // Comma-separated secondary language codes (e.g. "en") passed alongside language on Scribe v3.
    secondaryLanguages: z.string().default(""),
    numbersAsDigits: z.boolean().default(true),
    port: z.number().int().min(1024).max(65535).default(DEFAULT_SHIM_PORT),
    manageDictation: z.boolean().default(true),
  }),
});

export function parseSecondaryLanguages(raw: string, primary?: string): string[] {
  const primaryLower = primary?.trim().toLowerCase() ?? "";
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const code = part.trim();
    if (!code) continue;
    const lower = code.toLowerCase();
    if (lower === primaryLower || seen.has(lower)) continue;
    seen.add(lower);
    result.push(code);
  }
  return result;
}

export type ElevenlabsPreferences = z.output<typeof elevenlabsPreferences.schema>;

export const getStatusRpc = defineRpc({
  name: "elevenlabs.status.get",
  input: z.object({}),
  output: z.object({
    running: z.boolean(),
    baseUrl: z.string(),
    port: z.number(),
    modelId: z.string(),
    language: z.string(),
    manageDictation: z.boolean(),
    hasKey: z.boolean(),
    managing: z.boolean(),
    previousSaved: z.boolean(),
    lastError: z.string().nullable(),
  }),
});

export const setApiKeyRpc = defineRpc({
  name: "elevenlabs.key.set",
  input: z.object({ key: z.string().min(1).max(500) }),
  output: z.object({ ok: z.boolean() }),
});

export const clearApiKeyRpc = defineRpc({
  name: "elevenlabs.key.clear",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
});

export const testKeyRpc = defineRpc({
  name: "elevenlabs.key.test",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), message: z.string() }),
});

export const enableDictationRpc = defineRpc({
  name: "elevenlabs.dictation.enable",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), baseUrl: z.string(), message: z.string() }),
});

export const restorePreviousRpc = defineRpc({
  name: "elevenlabs.dictation.restore",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), restored: z.boolean(), message: z.string() }),
});

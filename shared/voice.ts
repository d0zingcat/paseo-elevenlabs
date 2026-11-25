import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const VOICE_PROVIDERS = ["elevenlabs"] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export const ELEVENLABS_STT_MODELS = ["scribe_v2", "scribe_v3"] as const;
export type ElevenlabsSttModel = (typeof ELEVENLABS_STT_MODELS)[number];

export const DEFAULT_SHIM_PORT = 8765;
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
export const MAX_TRANSCRIPT_EDIT_CHARS = 2000;
export const DEFAULT_TRANSCRIPT_EDIT_PROMPT =
  "Fix Chinese homophone typos and obvious speech-to-text errors, remove filler words or stutters, and normalize mixed Chinese/English spacing and software terms (e.g. Paseo, OpenAI, GitHub, API, TypeScript). Keep the original meaning and language; do not translate, expand, or answer.";

export const voicePreferences = defineSettings({
  id: "voice",
  scope: "host",
  version: 1,
  schema: z.object({
    provider: z.enum(VOICE_PROVIDERS).default("elevenlabs"),
    modelId: z.string().default("scribe_v3"),
    // BCP-47 / ISO-639-1 code such as "en" or "zh". Empty means auto-detect.
    language: z.string().default(""),
    // Comma-separated secondary language codes (e.g. "en") passed alongside language when supported.
    secondaryLanguages: z.string().default(""),
    numbersAsDigits: z.boolean().default(true),
    transcriptEditEnabled: z.boolean().default(false),
    transcriptEditPrompt: z.string().max(MAX_TRANSCRIPT_EDIT_CHARS).default(DEFAULT_TRANSCRIPT_EDIT_PROMPT),
    port: z.number().int().min(1024).max(65535).default(DEFAULT_SHIM_PORT),
    manageDictation: z.boolean().default(true),
  }),
});

export type VoicePreferences = z.output<typeof voicePreferences.schema>;

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

export const getStatusRpc = defineRpc({
  name: "voice.status.get",
  input: z.object({}),
  output: z.object({
    provider: z.enum(VOICE_PROVIDERS),
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
  name: "voice.key.set",
  input: z.object({
    provider: z.enum(VOICE_PROVIDERS).default("elevenlabs"),
    key: z.string().min(1).max(500),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const clearApiKeyRpc = defineRpc({
  name: "voice.key.clear",
  input: z.object({
    provider: z.enum(VOICE_PROVIDERS).default("elevenlabs"),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const testKeyRpc = defineRpc({
  name: "voice.key.test",
  input: z.object({
    provider: z.enum(VOICE_PROVIDERS).default("elevenlabs"),
  }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
});

export const enableDictationRpc = defineRpc({
  name: "voice.dictation.enable",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), baseUrl: z.string(), message: z.string() }),
});

export const restorePreviousRpc = defineRpc({
  name: "voice.dictation.restore",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), restored: z.boolean(), message: z.string() }),
});

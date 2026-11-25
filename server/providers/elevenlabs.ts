import { ELEVENLABS_API_BASE, MAX_TRANSCRIPT_EDIT_CHARS } from "../../shared/voice";
import { buildMultipartBody, describeError } from "./http";
import type { SttTranscribeArgs, SttTranscribeResult, VoiceSttProvider } from "./types";

const KEY_CHECK_TIMEOUT_MS = 15_000;

export const elevenlabsProvider: VoiceSttProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",
  defaultModelId: "scribe_v3",
  models: [
    { id: "scribe_v2", label: "Scribe v2 (stable)" },
    { id: "scribe_v3", label: "Scribe v3 (newer)" },
  ],

  async testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_CHECK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(ELEVENLABS_API_BASE + "/v1/user/subscription", {
        headers: { "xi-api-key": key },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, message: "Could not reach ElevenLabs: Request timed out after 15s." };
      }
      return { ok: false, message: "Could not reach ElevenLabs: " + describeError(error) };
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      let tier = "";
      try {
        const json = (await res.json()) as { tier?: unknown };
        if (typeof json.tier === "string" && json.tier.length > 0) tier = " (tier: " + json.tier + ")";
      } catch {
        // Tier is informational only.
      }
      return { ok: true, message: "ElevenLabs key is valid" + tier + "." };
    }
    if (res.status === 401)
      return { ok: false, message: "ElevenLabs rejected the key (HTTP 401). Check the key and try again." };
    return { ok: false, message: "ElevenLabs returned HTTP " + res.status + " for the key check." };
  },

  async transcribe(key: string, args: SttTranscribeArgs): Promise<SttTranscribeResult> {
    const fields: Array<[string, string]> = [["model_id", args.modelId]];
    if (args.language && args.language.length > 0) {
      fields.push(["language_code", args.language]);
      if (args.modelId === "scribe_v3" && args.secondaryLanguages) {
        for (const code of args.secondaryLanguages) {
          fields.push(["secondary_language_codes", code]);
        }
      }
    }
    if (args.modelId === "scribe_v3" && args.numbersAsDigits) {
      fields.push(["numbers_format", "digits"]);
    }
    const transcriptEdit = args.transcriptEdit?.trim().slice(0, MAX_TRANSCRIPT_EDIT_CHARS);
    if (transcriptEdit) {
      fields.push(["transcript_edit", transcriptEdit]);
    }
    const { body, contentType } = buildMultipartBody(fields, "file", args.filename, args.mimeType, args.audio);

    let res: Response;
    try {
      res = await fetch(ELEVENLABS_API_BASE + "/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": contentType },
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      });
    } catch (error) {
      throw new Error("Could not reach ElevenLabs: " + describeError(error));
    }
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("ElevenLabs rejected the API key (HTTP 401).");
      throw new Error("ElevenLabs transcription failed (HTTP " + res.status + "): " + responseBody.slice(0, 300));
    }
    const json = (await res.json()) as {
      text?: unknown;
      edited_transcript?: unknown;
      language_code?: unknown;
    };
    const edited = typeof json.edited_transcript === "string" ? json.edited_transcript.trim() : "";
    const rawText = typeof json.text === "string" ? json.text : "";
    const text = edited.length > 0 ? edited : rawText;
    if (typeof json.text !== "string" && edited.length === 0) {
      throw new Error("ElevenLabs response had no text field.");
    }
    return {
      text,
      language: typeof json.language_code === "string" ? json.language_code : undefined,
    };
  },
};

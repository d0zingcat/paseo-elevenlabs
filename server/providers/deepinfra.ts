import { DEEPINFRA_API_BASE } from "../../shared/voice";
import { buildMultipartBody, describeError } from "./http";
import type { SttTranscribeArgs, SttTranscribeResult, VoiceSttProvider } from "./types";

const KEY_CHECK_TIMEOUT_MS = 15_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export const deepinfraProvider: VoiceSttProvider = {
  id: "deepinfra",
  label: "DeepInfra",
  defaultModelId: "openai/whisper-large-v3-turbo",
  models: [
    { id: "openai/whisper-large-v3-turbo", label: "Whisper large-v3 turbo (fast)" },
    { id: "openai/whisper-large-v3", label: "Whisper large-v3 (best accuracy)" },
  ],

  async testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_CHECK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(DEEPINFRA_API_BASE + "/v1/openai/models", {
        headers: { authorization: "Bearer " + key },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, message: "Could not reach DeepInfra: Request timed out after 15s." };
      }
      return { ok: false, message: "Could not reach DeepInfra: " + describeError(error) };
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return { ok: true, message: "DeepInfra key is valid." };
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: "DeepInfra rejected the key (HTTP " + res.status + "). Check the key and try again." };
    return { ok: false, message: "DeepInfra returned HTTP " + res.status + " for the key check." };
  },

  async transcribe(key: string, args: SttTranscribeArgs): Promise<SttTranscribeResult> {
    const fields: Array<[string, string]> = [
      ["model", args.modelId],
      ["response_format", "json"],
    ];
    if (args.language && args.language.length > 0) {
      fields.push(["language", args.language]);
    }
    const { body, contentType } = buildMultipartBody(fields, "file", args.filename, args.mimeType, args.audio);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(DEEPINFRA_API_BASE + "/v1/openai/audio/transcriptions", {
        method: "POST",
        headers: { authorization: "Bearer " + key, "content-type": contentType },
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("DeepInfra transcription timed out after 60s.");
      throw new Error("Could not reach DeepInfra: " + describeError(error));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403)
        throw new Error("DeepInfra rejected the API key (HTTP " + res.status + ").");
      throw new Error("DeepInfra transcription failed (HTTP " + res.status + "): " + responseBody.slice(0, 300));
    }
    const json = (await res.json()) as { text?: unknown; language?: unknown };
    if (typeof json.text !== "string") throw new Error("DeepInfra response had no text field.");
    return {
      text: json.text.trim(),
      language: typeof json.language === "string" ? json.language : undefined,
    };
  },
};

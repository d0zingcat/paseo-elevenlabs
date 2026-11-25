import { QIANWEN_API_BASE } from "../../shared/voice";
import { describeError } from "./http";
import type { SttTranscribeArgs, SttTranscribeResult, VoiceSttProvider } from "./types";

const KEY_CHECK_TIMEOUT_MS = 15_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export const qianwenProvider: VoiceSttProvider = {
  id: "qianwen",
  label: "Qianwen AI",
  defaultModelId: "qwen3-asr-flash",
  models: [{ id: "qwen3-asr-flash", label: "Qwen3-ASR Flash (fast)" }],

  async testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_CHECK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(QIANWEN_API_BASE + "/models", {
        headers: { authorization: "Bearer " + key },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return { ok: false, message: "Could not reach Qianwen AI: Request timed out after 15s." };
      }
      return { ok: false, message: "Could not reach Qianwen AI: " + describeError(error) };
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return { ok: true, message: "Qianwen AI key is valid." };
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: "Qianwen AI rejected the key (HTTP " + res.status + "). Check the key and try again." };
    return { ok: false, message: "Qianwen AI returned HTTP " + res.status + " for the key check." };
  },

  // Qwen3-ASR has no /audio/transcriptions endpoint; audio goes through chat completions as input_audio.
  async transcribe(key: string, args: SttTranscribeArgs): Promise<SttTranscribeResult> {
    const mimeType = args.mimeType || "audio/wav";
    const dataUrl = "data:" + mimeType + ";base64," + args.audio.toString("base64");
    const asrOptions: Record<string, unknown> = { enable_itn: args.numbersAsDigits !== false };
    if (args.language) asrOptions.language = args.language;
    const payload = {
      model: args.modelId,
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: dataUrl } }] }],
      stream: false,
      asr_options: asrOptions,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(QIANWEN_API_BASE + "/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer " + key, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Qianwen AI transcription timed out after 60s.");
      throw new Error("Could not reach Qianwen AI: " + describeError(error));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403)
        throw new Error("Qianwen AI rejected the API key (HTTP " + res.status + ").");
      throw new Error("Qianwen AI transcription failed (HTTP " + res.status + "): " + responseBody.slice(0, 300));
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown; annotations?: Array<{ language?: unknown }> } }>;
    };
    const message = json.choices?.[0]?.message;
    if (typeof message?.content !== "string") throw new Error("Qianwen AI response had no text content.");
    const language = message.annotations?.find((a) => typeof a.language === "string")?.language;
    return { text: message.content.trim(), language: typeof language === "string" ? language : undefined };
  },
};

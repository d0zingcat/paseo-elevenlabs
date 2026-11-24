import { randomBytes } from "node:crypto";
import { ELEVENLABS_API_BASE } from "../shared/elevenlabs";

export interface TranscribeArgs {
  audio: Buffer;
  filename: string;
  mimeType: string;
  modelId: string;
  language?: string;
}

export interface TranscribeResult {
  text: string;
  language?: string;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || "audio.webm";
  return trimmed.replace(/["\r\n]/g, "_").slice(0, 128);
}

/** Build a multipart/form-data body without DOM FormData. */
function buildMultipartBody(
  fields: Record<string, string>,
  fileField: string,
  filename: string,
  mimeType: string,
  data: Buffer,
): { body: Buffer; contentType: string } {
  const boundary = "----elevenlabs-stt-" + randomBytes(16).toString("hex");
  const chunks: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from("--" + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + value + "\r\n"),
    );
  }
  const safeName = sanitizeFilename(filename);
  chunks.push(
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="' +
        fileField +
        '"; filename="' +
        safeName +
        '"\r\nContent-Type: ' +
        (mimeType || "application/octet-stream") +
        "\r\n\r\n",
    ),
  );
  chunks.push(data);
  chunks.push(Buffer.from("\r\n--" + boundary + "--\r\n"));
  return { body: Buffer.concat(chunks), contentType: "multipart/form-data; boundary=" + boundary };
}

export async function testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  let res: Response;
  try {
    res = await fetch(ELEVENLABS_API_BASE + "/v1/user/subscription", {
      headers: { "xi-api-key": key },
    });
  } catch (error) {
    return { ok: false, message: "Could not reach ElevenLabs: " + describeError(error) };
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
}

export async function transcribeWithScribe(key: string, args: TranscribeArgs): Promise<TranscribeResult> {
  const fields: Record<string, string> = { model_id: args.modelId };
  if (args.language && args.language.length > 0) fields.language_code = args.language;
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
  const json = (await res.json()) as { text?: unknown; language_code?: unknown };
  if (typeof json.text !== "string") throw new Error("ElevenLabs response had no text field.");
  return {
    text: json.text,
    language: typeof json.language_code === "string" ? json.language_code : undefined,
  };
}

export const __test__ = { buildMultipartBody, sanitizeFilename };

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

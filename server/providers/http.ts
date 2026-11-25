import { randomBytes } from "node:crypto";

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || "audio.webm";
  return trimmed.replace(/["\r\n]/g, "_").slice(0, 128);
}

/** Build a multipart/form-data body without DOM FormData. */
export function buildMultipartBody(
  fields: ReadonlyArray<readonly [string, string]>,
  fileField: string,
  filename: string,
  mimeType: string,
  data: Buffer,
): { body: Buffer; contentType: string } {
  const boundary = "----paseo-voice-" + randomBytes(16).toString("hex");
  const chunks: Buffer[] = [];
  for (const [key, value] of fields) {
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

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const __test__ = { buildMultipartBody, sanitizeFilename };

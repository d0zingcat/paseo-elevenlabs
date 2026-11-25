import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { parseSecondaryLanguages } from "../shared/elevenlabs";
import { transcribeWithScribe } from "./elevenlabs-api";
import { extractBoundary, firstField, firstFile, parseMultipart } from "./multipart";

const MAX_BODY_BYTES = 25 * 1024 * 1024;

export interface ShimCallbacks {
  getToken: () => string;
  getModelId: () => string;
  getLanguage: () => string;
  getSecondaryLanguages: () => string;
  getNumbersAsDigits: () => boolean;
  getApiKey: () => Promise<string | null>;
  onError: (message: string) => void;
}

export interface StartedShim {
  server: Server;
  port: number;
  baseUrl: string;
  stop: () => Promise<void>;
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function openAiError(message: string): unknown {
  return { error: { message, type: "server_error", code: "elevenlabs_stt_error" } };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function checkAuth(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match !== null && match[1].trim() === token;
}

export async function startShim(preferredPort: number, callbacks: ShimCallbacks): Promise<StartedShim> {
  const server = createServer((req, res) => {
    void handleRequest(req, res, callbacks).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      callbacks.onError(message);
      if (!res.headersSent) sendJson(res, 500, openAiError(message));
    });
  });
  server.listen(preferredPort, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (error) => reject(error));
  }).catch(async (error: unknown) => {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code !== "EADDRINUSE") throw error;
    // Fall back to an ephemeral loopback port so a stale config never blocks us.
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", (err) => reject(err));
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : preferredPort;
  const stop = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  return { server, port, baseUrl: "http://127.0.0.1:" + port + "/v1", stop };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  callbacks: ShimCallbacks,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "elevenlabs-stt-shim" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/models") {
    sendJson(res, 200, {
      object: "list",
      data: [
        { id: "scribe_v2", object: "model", owned_by: "elevenlabs" },
        { id: "scribe_v3", object: "model", owned_by: "elevenlabs" },
      ],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/audio/transcriptions") {
    if (!checkAuth(req, callbacks.getToken())) {
      sendJson(res, 401, openAiError("Invalid shim credentials."));
      return;
    }
    const boundary = extractBoundary(req.headers["content-type"]);
    if (!boundary) {
      sendJson(res, 400, openAiError("Expected multipart/form-data."));
      return;
    }
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 413, openAiError(message));
      return;
    }
    const parsed = parseMultipart(body, boundary);
    const file = firstFile(parsed, "file");
    if (!file || file.data.length === 0) {
      sendJson(res, 400, openAiError("Missing audio file field."));
      return;
    }
    const apiKey = await callbacks.getApiKey();
    if (!apiKey) {
      sendJson(res, 500, openAiError("ElevenLabs API key is not configured. Open the plugin and save a key."));
      return;
    }
    // Paseo sends ISO-639-1 (for example "en"); ElevenLabs accepts it as language_code.
    const requestedLanguage = (firstField(parsed, "language") ?? "").trim();
    const fallbackLanguage = callbacks.getLanguage().trim();
    const responseFormat = (firstField(parsed, "response_format") ?? "json").trim().toLowerCase();
    try {
      const primaryLanguage = fallbackLanguage || requestedLanguage || undefined;
      const secondaryLanguages = primaryLanguage
        ? parseSecondaryLanguages(callbacks.getSecondaryLanguages(), primaryLanguage)
        : undefined;
      const modelId = callbacks.getModelId();
      const numbersAsDigits = callbacks.getNumbersAsDigits();
      console.log("[elevenlabs-stt] transcribe", {
        modelId,
        requestedLanguage: requestedLanguage || null,
        configuredLanguage: fallbackLanguage || null,
        primaryLanguage: primaryLanguage ?? null,
        secondaryLanguages: secondaryLanguages ?? [],
        numbersAsDigits,
      });
      const result = await transcribeWithScribe(apiKey, {
        audio: file.data,
        filename: file.filename,
        mimeType: file.contentType,
        modelId,
        language: primaryLanguage,
        secondaryLanguages,
        numbersAsDigits,
      });
      if (responseFormat === "text") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(result.text);
        return;
      }
      if (responseFormat === "verbose_json") {
        sendJson(res, 200, {
          text: result.text,
          language: result.language ?? fallbackLanguage ?? requestedLanguage ?? undefined,
        });
        return;
      }
      sendJson(res, 200, { text: result.text });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      callbacks.onError(message);
      sendJson(res, 502, openAiError(message));
    }
    return;
  }

  sendJson(res, 404, openAiError("Not found: " + (req.method ?? "") + " " + url.pathname));
}

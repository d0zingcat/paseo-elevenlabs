import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PLUGIN_DIR_NAME = "elevenlabs-stt";
const KEY_FILE = "elevenlabs.key";
const SHIM_TOKEN_FILE = "shim.token";
const PREVIOUS_FILE = "previous-dictation-stt.json";

export function pluginDataDir(): string {
  const home = process.env.PASEO_HOME?.trim() || path.join(os.homedir(), ".paseo");
  return path.join(home, "plugin-data", PLUGIN_DIR_NAME);
}

async function ensureDir(): Promise<string> {
  const dir = pluginDataDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function readSecretFile(fileName: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(pluginDataDir(), fileName), "utf8");
    const value = raw.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function writeSecretFile(fileName: string, value: string, label: string): Promise<void> {
  const dir = await ensureDir();
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(label + " is empty.");
  await fs.writeFile(path.join(dir, fileName), trimmed + "\n", { mode: 0o600 });
}

async function clearSecretFile(fileName: string): Promise<void> {
  try {
    await fs.unlink(path.join(pluginDataDir(), fileName));
  } catch {
    // Already absent.
  }
}

export function readApiKey(): Promise<string | null> {
  return readSecretFile(KEY_FILE);
}

export function writeApiKey(key: string): Promise<void> {
  return writeSecretFile(KEY_FILE, key, "API key");
}

export function clearApiKey(): Promise<void> {
  return clearSecretFile(KEY_FILE);
}

export function readShimToken(): Promise<string | null> {
  return readSecretFile(SHIM_TOKEN_FILE);
}

export function writeShimToken(token: string): Promise<void> {
  return writeSecretFile(SHIM_TOKEN_FILE, token, "Shim token");
}

export function clearShimToken(): Promise<void> {
  return clearSecretFile(SHIM_TOKEN_FILE);
}

export async function readPreviousDictationStt(): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(path.join(pluginDataDir(), PREVIOUS_FILE), "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function writePreviousDictationStt(value: unknown): Promise<void> {
  const dir = await ensureDir();
  await fs.writeFile(path.join(dir, PREVIOUS_FILE), JSON.stringify(value ?? null), {
    mode: 0o600,
  });
}

export async function clearPreviousDictationStt(): Promise<void> {
  try {
    await fs.unlink(path.join(pluginDataDir(), PREVIOUS_FILE));
  } catch {
    // Already absent.
  }
}

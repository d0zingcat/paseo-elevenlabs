import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PLUGIN_DIR_NAME = "elevenlabs-stt";
const KEY_FILE = "elevenlabs.key";
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

export async function readApiKey(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(pluginDataDir(), KEY_FILE), "utf8");
    const key = raw.trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

export async function writeApiKey(key: string): Promise<void> {
  const dir = await ensureDir();
  const trimmed = key.trim();
  if (trimmed.length === 0) throw new Error("API key is empty.");
  await fs.writeFile(path.join(dir, KEY_FILE), trimmed + "\n", { mode: 0o600 });
}

export async function clearApiKey(): Promise<void> {
  try {
    await fs.unlink(path.join(pluginDataDir(), KEY_FILE));
  } catch {
    // Already absent.
  }
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

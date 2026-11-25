# paseo-voice

Multi-provider voice gateway for Paseo through a loopback OpenAI-compatible
endpoint on the daemon machine.

## What it does

- Runs a `127.0.0.1` loopback gateway accepting Paseo's `POST /v1/audio/transcriptions`
  and dispatching through modular provider adapters (`server/providers/`).
- Providers: **ElevenLabs Scribe** (`scribe_v2`, `scribe_v3`), **DeepInfra** (Whisper large-v3 / turbo) and **Qianwen AI** (Qwen3-ASR Flash). Scribe supports
  primary/secondary language hints, `numbers_format=digits`, and optional `transcript_edit`.
- Saves the current dictation setting before switching and restores it on demand,
  on unexpected exit, or on plugin disable/remove (only when still pointing at the gateway).
- Stores upstream API keys and the gateway token in daemon-only `0600` files under
  `~/.paseo/plugin-data/paseo-voice/`.

## Install (run on the daemon machine)

```bash
npm run typecheck
paseo plugin install /absolute/path/to/paseo-voice
paseo plugin ls
```

Open **Paseo Voice** (sidebar footer, `/voice`, Settings, or Command Center), save
an API key for your provider, test it, and choose **Use Paseo Voice for dictation**.

## Develop

```bash
npm install
npm run typecheck
```

# elevenlabs-stt

Use ElevenLabs Scribe for Paseo dictation through a loopback OpenAI-compatible
endpoint on the daemon machine.

## What it does

- Runs a 127.0.0.1 shim that accepts Paseo's `POST /v1/audio/transcriptions`
  and forwards audio to ElevenLabs `POST /v1/speech-to-text`.
- Maps `Authorization: Bearer` to `xi-api-key`, `model` to `model_id`, and
  `language` to `language_code`; returns OpenAI-shaped `{ text }` (plus `text`
  and `verbose_json` variants).
- Saves the current dictation setting before switching, restores it on demand,
  on unexpected shim exit, and on plugin disable/remove (guarded: only touches
  the config while it still points at the shim).
- Keeps the ElevenLabs API key in a daemon-only file (`0600`); it is never sent
  back to any app.

Scope is dictation only. Voice mode listening/speaking are untouched.

## Install (run on the daemon machine)

```bash
npm run typecheck
paseo plugin install /absolute/path/to/elevenlabs-stt
paseo plugin ls
```

`ls` should report `elevenlabs-stt` as `running`. Then open the **ElevenLabs**
screen (sidebar footer, `/elevenlabs`, or Command Center), save an ElevenLabs
API key, test it, and choose **Use ElevenLabs for dictation**. Dictate
something short and confirm the text lands as expected. **Restore previous
dictation** returns to the earlier provider.

## Settings

Model (`scribe_v2` default, `scribe_v3` optional), language (blank is
auto-detect), loopback port (default `8765`, ephemeral fallback when busy),
and whether dictation is managed.

## Develop

```bash
npm install
npm run typecheck
```

Protocol loopback test (no network, no API key): compile the server entries to
CommonJS and run the stubbed-fetch suite that checks the OpenAI to ElevenLabs
mapping, auth, error shapes, and multipart handling.

```bash
npx tsc server/*.ts shared/*.ts --outDir /tmp/el-build --module commonjs \
  --target es2020 --moduleResolution node --strict --skipLibCheck \
  --esModuleInterop --types node
NODE_PATH=$PWD/node_modules node /tmp/el-build-test.cjs
```

No runtime dependencies are added, so no shrinkwrap is needed for publishing.
Add a license file before publishing to the registry.

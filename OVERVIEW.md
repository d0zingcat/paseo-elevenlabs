Multi-provider voice gateway for Paseo.

This plugin routes Paseo speech features through upstream voice providers via a small
OpenAI-compatible endpoint running on 127.0.0.1 on the daemon machine. Because Paseo
already supports OpenAI speech endpoints, dictation works identically across the
desktop app, the web app, and the iOS and Android apps.

Supported upstream providers: ElevenLabs Scribe (`scribe_v2`, `scribe_v3`), DeepInfra
(Whisper large-v3 and large-v3 turbo) and Qianwen AI (Qwen3-ASR Flash). Each provider is
a separate adapter, so more speech-to-text, text-to-speech, and realtime voice services can be added.

How it works: when you enable dictation management, the plugin saves the previous
dictation speech setting, points dictation at the local loopback endpoint with a
daemon-persisted token, and routes audio to the selected upstream provider. If the
endpoint stops or the plugin is disabled or removed while still managing dictation,
it tries to restore the saved setting. Changing dictation manually in Settings,
Voice leaves it under your manual control.

Setup: open the Paseo Voice screen, save an API key for the selected provider (stored
in a daemon-only 0600 file and never shown back in any app), test the key, configure
options such as model and language hints, and enable dictation. Requires Paseo 0.15.4
or later with plugins enabled and internet access from the daemon machine to reach
the selected upstream provider.

Data and limits: audio you dictate is sent to the provider you select, and the returned text
enters Paseo as your message. ElevenLabs audio goes to api.elevenlabs.io, DeepInfra audio to
api.deepinfra.com, and Qianwen AI audio to maas.qianwenaiapi.com. Provider API keys are stored
only on the daemon machine. Secondary languages and `transcript_edit` (off by default) apply to
ElevenLabs Scribe v3 only. Numbers as digits applies to Scribe v3 and Qianwen AI. DeepInfra
and Qianwen AI use the primary language hint when set.

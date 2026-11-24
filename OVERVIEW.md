Dictation with ElevenLabs Scribe.

This plugin routes Paseo dictation through ElevenLabs speech-to-text. It runs a small
endpoint on the daemon machine that speaks the OpenAI transcription protocol on
127.0.0.1 and forwards audio to ElevenLabs Scribe. Paseo keeps working with its
OpenAI voice settings, so dictation behaves the same in the desktop app, the web
app, and the iOS and Android apps.

How it works: when you choose to use ElevenLabs for dictation, the plugin saves
the current dictation speech setting, points dictation at the local endpoint, and
uses a fresh token that exists only while the plugin runs. If the endpoint stops,
the plugin tries to put the saved setting back. Disabling or removing the plugin
does the same when dictation still points at it. Changing dictation yourself in
Settings, Voice tells the plugin to stop managing that feature.

Setup: an ElevenLabs API key, entered on the plugin screen and stored in a file
only your daemon user can read. The key is never shown back in any app. The
plugin needs Paseo 0.15.4 or later with plugins enabled. It runs on any machine
the daemon runs on and needs internet access to reach ElevenLabs.

Options: Scribe model (scribe_v2 or scribe_v3), spoken language (blank means
auto-detect), loopback port (defaults to 8765, an ephemeral port is used when
busy), and whether dictation is managed at all.

Data and limits: audio you dictate is sent to ElevenLabs for transcription, and
the returned text enters Paseo as your message like typed text. Nothing else
leaves the machine. This version covers dictation only; voice mode listening
and speaking keep their current providers. Realtime Scribe models are not used.

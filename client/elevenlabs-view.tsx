import { useRpc, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text } from "react-native";
import {
  clearApiKeyRpc,
  DEFAULT_TRANSCRIPT_EDIT_PROMPT,
  ELEVENLABS_STT_MODELS,
  elevenlabsPreferences,
  enableDictationRpc,
  getStatusRpc,
  MAX_TRANSCRIPT_EDIT_CHARS,
  parseSecondaryLanguages,
  restorePreviousRpc,
  setApiKeyRpc,
  testKeyRpc,
} from "../shared/elevenlabs";

type Theme = PluginScreenProps["theme"];
type Layout = PluginScreenProps["layout"];

interface Notice {
  kind: "ok" | "error";
  text: string;
}

export function ElevenLabsView({ theme, layout }: { theme: Theme; layout: Layout }) {
  const styles = useMemo(
    () => ({
      root: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 16 : 24, gap: layout.compact ? 12 : 16 },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 20 : 24, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      section: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      ok: { color: theme.colors.accent, fontSize: 13 },
      error: { color: "#e5484d", fontSize: 13 },
    }),
    [theme, layout.compact],
  );

  const prefs = useSettings(elevenlabsPreferences);
  const fetchStatus = useRpc(getStatusRpc);
  const callSetKey = useRpc(setApiKeyRpc);
  const callClearKey = useRpc(clearApiKeyRpc);
  const callTestKey = useRpc(testKeyRpc);
  const callEnable = useRpc(enableDictationRpc);
  const callRestore = useRpc(restorePreviousRpc);

  const statusQuery = useQuery({
    queryKey: ["elevenlabs-stt-status"],
    queryFn: () => fetchStatus({}),
    refetchInterval: 10000,
  });

  const toast = useToast();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [keyCheckNotice, setKeyCheckNotice] = useState<Notice | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState<string>("scribe_v2");
  const [languageDraft, setLanguageDraft] = useState("");
  const [secondaryLanguagesDraft, setSecondaryLanguagesDraft] = useState("");
  const [numbersAsDigitsDraft, setNumbersAsDigitsDraft] = useState(true);
  const [transcriptEditEnabledDraft, setTranscriptEditEnabledDraft] = useState(false);
  const [transcriptEditPromptDraft, setTranscriptEditPromptDraft] = useState(DEFAULT_TRANSCRIPT_EDIT_PROMPT);
  const [portDraft, setPortDraft] = useState("8765");
  const [manageDraft, setManageDraft] = useState(true);
  const [draftsSeeded, setDraftsSeeded] = useState(false);

  useEffect(() => {
    if (prefs.status === "ready" && !draftsSeeded) {
      setModelDraft(prefs.values.modelId);
      setLanguageDraft(prefs.values.language);
      setSecondaryLanguagesDraft(prefs.values.secondaryLanguages);
      setNumbersAsDigitsDraft(prefs.values.numbersAsDigits);
      setTranscriptEditEnabledDraft(prefs.values.transcriptEditEnabled);
      setTranscriptEditPromptDraft(prefs.values.transcriptEditPrompt);
      setPortDraft(String(prefs.values.port));
      setManageDraft(prefs.values.manageDictation);
      setDraftsSeeded(true);
    }
  }, [prefs, draftsSeeded]);

  const notify = (kind: Notice["kind"], text: string) => {
    setNotice({ kind, text });
    if (kind === "ok") {
      toast.show(text, { variant: "success" });
    } else {
      toast.error(text);
    }
  };
  const notifyError = (error: unknown) => notify("error", error instanceof Error ? error.message : String(error));

  const saveKey = useMutation({
    mutationFn: () => callSetKey({ key: keyDraft }),
    onSuccess: () => {
      setKeyDraft("");
      setKeyCheckNotice(null);
      notify("ok", "API key saved on the daemon. It is never shown back in the app.");
      void statusQuery.refetch();
    },
    onError: notifyError,
  });
  const clearKey = useMutation({
    mutationFn: () => callClearKey({}),
    onSuccess: () => {
      setKeyCheckNotice(null);
      notify("ok", "API key removed from the daemon.");
      void statusQuery.refetch();
    },
    onError: notifyError,
  });
  const testKey = useMutation({
    mutationFn: () => callTestKey({}),
    onMutate: () => setKeyCheckNotice(null),
    onSuccess: (result) => {
      const kind = result.ok ? "ok" : "error";
      setKeyCheckNotice({ kind, text: result.message });
      notify(kind, result.message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      setKeyCheckNotice({ kind: "error", text: message });
      notify("error", message);
    },
  });
  const enable = useMutation({
    mutationFn: () => callEnable({}),
    onSuccess: (result) => {
      notify(result.ok ? "ok" : "error", result.message + " Endpoint: " + result.baseUrl);
      void statusQuery.refetch();
    },
    onError: notifyError,
  });
  const restore = useMutation({
    mutationFn: () => callRestore({}),
    onSuccess: (result) => {
      notify(result.restored ? "ok" : "error", result.message);
      void statusQuery.refetch();
    },
    onError: notifyError,
  });

  const savePrefs = async () => {
    if (prefs.status !== "ready") return;
    const port = Number.parseInt(portDraft, 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      notify("error", "Port must be an integer between 1024 and 65535.");
      return;
    }
    const primaryLanguage = languageDraft.trim();
    const secondaryLanguages = parseSecondaryLanguages(secondaryLanguagesDraft, primaryLanguage).join(", ");
    const transcriptEditPrompt = transcriptEditPromptDraft.trim();
    if (transcriptEditPrompt.length > MAX_TRANSCRIPT_EDIT_CHARS) {
      notify("error", "Edit instruction must be at most " + MAX_TRANSCRIPT_EDIT_CHARS + " characters.");
      return;
    }
    const ok = await prefs.save(
      {
        modelId: (ELEVENLABS_STT_MODELS as readonly string[]).includes(modelDraft)
          ? (modelDraft as "scribe_v2" | "scribe_v3")
          : "scribe_v2",
        language: primaryLanguage,
        secondaryLanguages,
        numbersAsDigits: numbersAsDigitsDraft,
        transcriptEditEnabled: transcriptEditEnabledDraft,
        transcriptEditPrompt,
        port,
        manageDictation: manageDraft,
      },
      prefs.revision,
    );
    notify(ok ? "ok" : "error", ok ? "Options saved." : (prefs.saveError ?? "Could not save options."));
  };

  const status = statusQuery.data;
  const busy = saveKey.isPending || clearKey.isPending || testKey.isPending || enable.isPending || restore.isPending;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ElevenLabs speech-to-text</Text>
      <Text style={styles.muted}>
        Routes Paseo dictation through ElevenLabs Scribe via a loopback OpenAI-compatible endpoint on the daemon
        machine. Audio goes to ElevenLabs; the API key stays in a daemon-only file.
      </Text>

      {prefs.saveError ? <Text style={styles.error}>{prefs.saveError}</Text> : null}
      {notice ? <Text style={notice.kind === "ok" ? styles.ok : styles.error}>{notice.text}</Text> : null}

      <SettingsSection title="Status">
        <SettingsCard>
          {statusQuery.isLoading ? (
            <Loading />
          ) : statusQuery.isError || !status ? (
            <SettingsRow label="Shim status" hint="Could not read status. The plugin may still be starting." />
          ) : (
            <>
              <SettingsRow
                label="Shim"
                hint={status.running ? "Listening on " + status.baseUrl : "Stopped"}
              />
              <SettingsRow label="API key" hint={status.hasKey ? "Saved on the daemon" : "Not saved"} />
              <SettingsRow
                label="Dictation"
                hint={status.managing ? "Using ElevenLabs (" + status.modelId + ")" : "Not managed by this plugin"}
              />
              <SettingsRow
                label="Previous setting"
                hint={status.previousSaved ? "Saved, can be restored" : "None saved"}
              />
              {status.lastError ? <SettingsRow label="Last error" hint={status.lastError} /> : null}
            </>
          )}
          <SettingsAction
            label="Status"
            actionLabel="Refresh status"
            onPress={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="ElevenLabs API key">
        <SettingsCard>
          <SettingsInput
            label="Key"
            hint="Stored daemon-side only. Saving replaces the previous key."
            initialValue=""
            placeholder="xi-…"
            secureTextEntry
            onChangeText={setKeyDraft}
          />
          <SettingsAction
            label="Save"
            actionLabel={saveKey.isPending ? "Saving…" : "Save key"}
            onPress={() => saveKey.mutate()}
            disabled={busy || keyDraft.trim().length === 0}
          />
          <SettingsAction
            label="Check"
            hint={keyCheckNotice?.kind === "ok" ? keyCheckNotice.text : undefined}
            error={keyCheckNotice?.kind === "error" ? keyCheckNotice.text : undefined}
            actionLabel={testKey.isPending ? "Testing…" : "Test saved key"}
            onPress={() => testKey.mutate()}
            disabled={busy}
          />
          <SettingsAction
            label="Remove"
            actionLabel={clearKey.isPending ? "Removing…" : "Remove saved key"}
            onPress={() => clearKey.mutate()}
            disabled={busy}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Options">
        <SettingsCard>
          {prefs.status === "loading" ? (
            <Loading />
          ) : prefs.status === "ready" ? (
            <>
              <SettingsSelect
                label="Model"
                value={modelDraft}
                options={[
                  { label: "Scribe v2 (stable)", value: "scribe_v2" },
                  { label: "Scribe v3 (newer)", value: "scribe_v3" },
                ]}
                onValueChange={setModelDraft}
              />
              <SettingsInput
                label="Language"
                hint="Primary ISO-639-1 code such as zh or en. Empty means auto-detect."
                initialValue={prefs.values.language}
                placeholder="auto"
                onChangeText={setLanguageDraft}
              />
              <SettingsInput
                label="Secondary languages"
                hint="Comma-separated (e.g. en). Used alongside Language on Scribe v3."
                initialValue={prefs.values.secondaryLanguages}
                placeholder="en"
                onChangeText={setSecondaryLanguagesDraft}
              />
              <SettingsSwitch
                label="Numbers as digits"
                hint="Format numbers as 42 instead of forty-two (Scribe v3 only)."
                value={numbersAsDigitsDraft}
                onValueChange={setNumbersAsDigitsDraft}
              />
              <SettingsSwitch
                label="Transcript edit"
                hint="Off by default. Clean up typos with the instruction below (+30% cost, 10s min per call)."
                value={transcriptEditEnabledDraft}
                onValueChange={setTranscriptEditEnabledDraft}
              />
              <SettingsInput
                label="Edit instruction"
                hint="Up to 2000 chars. Applied only when Transcript edit is on."
                initialValue={prefs.values.transcriptEditPrompt}
                placeholder={DEFAULT_TRANSCRIPT_EDIT_PROMPT}
                onChangeText={setTranscriptEditPromptDraft}
              />
              <SettingsInput
                label="Loopback port"
                hint="127.0.0.1 only. Falls back to an ephemeral port when busy."
                initialValue={String(prefs.values.port)}
                placeholder="8765"
                onChangeText={setPortDraft}
              />
              <SettingsSwitch
                label="Manage dictation"
                hint="Switch Paseo dictation to the shim when enabled."
                value={manageDraft}
                onValueChange={setManageDraft}
              />
              <SettingsAction
                label="Options"
                actionLabel={prefs.saving ? "Saving…" : "Save options"}
                onPress={() => void savePrefs()}
                disabled={busy || prefs.saving}
              />
            </>
          ) : (
            <SettingsRow
              label="Preferences unavailable"
              hint={prefs.status === "error" ? prefs.error : "Stored preferences are invalid."}
            />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Dictation">
        <SettingsCard>
          <SettingsAction
            label="Enable"
            actionLabel={enable.isPending ? "Enabling…" : "Use ElevenLabs for dictation"}
            onPress={() => enable.mutate()}
            disabled={busy}
          />
          <SettingsAction
            label="Restore"
            actionLabel={restore.isPending ? "Restoring…" : "Restore previous dictation"}
            onPress={() => restore.mutate()}
            disabled={busy}
          />
        </SettingsCard>
      </SettingsSection>

      <Text style={styles.section}>Limits in this version</Text>
      <Text style={styles.muted}>
        Dictation only. Voice mode listening and speaking keep their current providers. Realtime Scribe models are not
        used. Disabling or removing the plugin restores the previous dictation setting when it still points at this
        plugin.
      </Text>
    </ScrollView>
  );
}

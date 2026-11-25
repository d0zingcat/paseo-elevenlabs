import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { VoiceView } from "./client/voice-view";

function VoiceSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Mic"
      label="Voice"
      active={currentScreen?.screenId === "voice"}
      onPress={() => openScreen({ screenId: "voice" })}
    />
  );
}

function VoiceScreen({ theme, layout, params }: PluginScreenProps) {
  void params;
  return <VoiceView theme={theme} layout={layout} />;
}

function VoiceSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  return <VoiceView theme={theme} layout={layout} />;
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "voice", title: "Paseo Voice", Component: VoiceScreen });
  client.addSidebarFooterItem({ id: "voice", title: "Voice", Component: VoiceSidebarItem });
  client.addSettingsScreen({
    id: "voice-settings",
    title: "Paseo Voice",
    icon: "Mic",
    Component: VoiceSettingsScreen,
  });
  client.addCommandCenterItem({
    id: "open-voice",
    title: "Open Paseo Voice",
    icon: "Mic",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "voice" });
    },
  });
  client.addSlashCommand({
    name: "voice",
    description: "Open Paseo Voice settings",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openScreen }) {
      openScreen({ screenId: "voice" });
    },
  });
  return () => {};
}

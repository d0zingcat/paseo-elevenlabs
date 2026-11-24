import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { ElevenLabsView } from "./client/elevenlabs-view";

function ElevenLabsSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Mic"
      label="ElevenLabs"
      active={currentScreen?.screenId === "elevenlabs"}
      onPress={() => openScreen({ screenId: "elevenlabs" })}
    />
  );
}

function ElevenLabsScreen({ theme, layout, params }: PluginScreenProps) {
  void params;
  return <ElevenLabsView theme={theme} layout={layout} />;
}

function ElevenLabsSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  return <ElevenLabsView theme={theme} layout={layout} />;
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "elevenlabs", title: "ElevenLabs STT", Component: ElevenLabsScreen });
  client.addSidebarFooterItem({ id: "elevenlabs", title: "ElevenLabs", Component: ElevenLabsSidebarItem });
  client.addSettingsScreen({
    id: "elevenlabs-settings",
    title: "ElevenLabs STT",
    icon: "Mic",
    Component: ElevenLabsSettingsScreen,
  });
  client.addCommandCenterItem({
    id: "open-elevenlabs",
    title: "Open ElevenLabs STT",
    icon: "Mic",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "elevenlabs" });
    },
  });
  client.addSlashCommand({
    name: "elevenlabs",
    description: "Open ElevenLabs speech-to-text settings",
    argumentHint: "",
    context: "workspace",
    onSubmit({ openScreen }) {
      openScreen({ screenId: "elevenlabs" });
    },
  });
  return () => {};
}

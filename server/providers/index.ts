import { qianwenProvider } from "./qianwen";
import type { VoiceProviderId } from "../../shared/voice";
import { deepinfraProvider } from "./deepinfra";
import { elevenlabsProvider } from "./elevenlabs";
import type { VoiceSttProvider } from "./types";

const PROVIDERS: Record<VoiceProviderId, VoiceSttProvider> = {
  elevenlabs: elevenlabsProvider,
  deepinfra: deepinfraProvider,
  qianwen: qianwenProvider,
};

export function getVoiceSttProvider(id: VoiceProviderId): VoiceSttProvider {
  return PROVIDERS[id] ?? elevenlabsProvider;
}

export const VOICE_PROVIDER_OPTIONS: ReadonlyArray<{ label: string; value: VoiceProviderId }> = [
  { label: elevenlabsProvider.label, value: elevenlabsProvider.id },
  { label: deepinfraProvider.label, value: deepinfraProvider.id },
  { label: qianwenProvider.label, value: qianwenProvider.id },
];

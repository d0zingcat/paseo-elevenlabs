import type { VoiceProviderId } from "../../shared/voice";

export interface SttModelOption {
  readonly id: string;
  readonly label: string;
}

export interface SttTranscribeArgs {
  audio: Buffer;
  filename: string;
  mimeType: string;
  modelId: string;
  language?: string;
  secondaryLanguages?: string[];
  numbersAsDigits?: boolean;
  transcriptEdit?: string;
}

export interface SttTranscribeResult {
  text: string;
  language?: string;
}

export interface VoiceSttProvider {
  readonly id: VoiceProviderId;
  readonly label: string;
  readonly defaultModelId: string;
  readonly models: readonly SttModelOption[];
  testApiKey(key: string): Promise<{ ok: boolean; message: string }>;
  transcribe(key: string, args: SttTranscribeArgs): Promise<SttTranscribeResult>;
}

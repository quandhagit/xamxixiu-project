export type VoiceStyle =
  | "male-casual"
  | "male-energetic"
  | "male-deep"
  | "female-young"
  | "female-calm"
  | "female-energetic";

export type VoiceGender =
  | "male"
  | "female";

export interface Voice {
  id: string;
  gender: VoiceGender;
  style: VoiceStyle;
  voiceCode: string;
}

export interface TTSRequest {
  text: string;
  voice: Voice;
  outputFile: string;
}

export interface TTSProvider {
  synthesize(request: TTSRequest): Promise<void>;
}
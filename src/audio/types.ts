export type SupportedAudioFormat = "WAV" | "MP3";
export interface AudioMetadata {
  name: string;
  size: number;
  format: SupportedAudioFormat;
  duration: number;
  sampleRate: number;
  channels: number;
}
export interface LoadedAudio {
  metadata: AudioMetadata;
  objectUrl: string;
  /** Local decoded PCM for future analysis. Never serialize or upload this buffer. */
  buffer: AudioBuffer;
  waveform: number[];
}

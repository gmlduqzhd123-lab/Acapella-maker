import type { AnalysisInput, AnalysisProgress } from "../analysis/types";
import type { NoteEvent } from "../music/types";
export interface PitchMetadata {
  backend: string;
  modelLoadMs: number;
  inferenceMs: number;
  mappingMs: number;
  modelReused: boolean;
  windowSeconds: number;
  tensorsBefore: number;
  tensorsAfter: number;
}
export interface PitchResult {
  notes: NoteEvent[];
  metadata: PitchMetadata;
}
export interface RawPitchNote {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
}
export type PitchRequest = {
  type: "pitch";
  id: string;
  input: AnalysisInput;
  modelUrl: string;
};
export type PitchResponse =
  | { type: "progress"; id: string; progress: AnalysisProgress }
  | { type: "complete"; id: string; result: PitchResult }
  | { type: "error"; id: string; message: string };
export const PITCH_SETTINGS = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteFrames: 5,
  windowSeconds: 30,
  contextSeconds: 0.5,
} as const;

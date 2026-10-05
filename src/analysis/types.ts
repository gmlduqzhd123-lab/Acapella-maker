import type { MusicalKey, NoteEvent } from "../music/types";
export interface AnalysisInput {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}
export interface AnalysisResult {
  bpm: number;
  bpmConfidence: number;
  key: MusicalKey;
  notes: NoteEvent[];
}
export type AnalysisStatus =
  "idle" | "loading" | "running" | "complete" | "error";
export interface AnalysisProgress {
  phase: "bpm" | "key" | "pitch";
  fraction: number;
}

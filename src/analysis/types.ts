import type { MusicalKey, NoteEvent } from "../music/types";
import type { PitchMetadata } from "../pitch/pitchTypes";
export interface AnalysisInput {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}
export interface AnalysisResult {
  /** null means insufficient rhythmic/tonal evidence, never a fabricated default. */
  bpm: number | null;
  bpmConfidence: number;
  key: MusicalKey | null;
  notes: NoteEvent[];
  pitch?: PitchMetadata;
  tempoCandidates: TempoCandidate[];
  keyCandidates: KeyCandidate[];
  chroma: number[];
  warnings: string[];
}
export type AnalysisStatus =
  | "idle"
  | "loading"
  | "preparing"
  | "running"
  | "complete"
  | "cancelled"
  | "error";
export interface AnalysisProgress {
  phase: "preparing" | "bpm" | "key" | "model" | "pitch" | "notes" | "complete";
  /** Overall completion, always 0–1. */
  fraction: number;
}
export interface TempoCandidate {
  bpm: number;
  confidence: number;
}
export interface TempoAnalysis {
  bpm: number | null;
  confidence: number;
  candidates: TempoCandidate[];
}
export interface KeyCandidate {
  tonic: number;
  mode: MusicalKey["mode"];
  correlation: number;
}
export interface KeyAnalysis {
  key: MusicalKey | null;
  candidates: KeyCandidate[];
  chroma: number[];
}
export interface AnalysisOverrides {
  bpm: number | null;
  key: Pick<MusicalKey, "tonic" | "mode"> | null;
}
export type AnalysisWorkerRequest = {
  type: "analyze";
  id: string;
  input: AnalysisInput;
};
export type AnalysisWorkerResponse =
  | { type: "progress"; id: string; progress: AnalysisProgress }
  | {
      type: "complete";
      id: string;
      result: AnalysisResult;
      input: AnalysisInput;
    }
  | { type: "error"; id: string; message: string };

import type { NoteEvent } from "../music/types";
import type { NoteMetadata } from "../editor/editorTypes";
export const PPQ = 960;
export type TimeSignatureName = "4/4" | "3/4" | "6/8";
export type BpmUnit = "quarter" | "dottedQuarter";
export type QuantizationResolution =
  "quarter" | "eighth" | "sixteenth" | "thirtySecond";
export type QuantizationStrength = "weak" | "standard" | "strong";
export interface RhythmSettings {
  bpm: number | null;
  timeSignature: TimeSignatureName;
  bpmUnit: BpmUnit;
  gridOriginSeconds: number;
  resolution: QuantizationResolution;
  strength: QuantizationStrength;
}
export interface MusicalPosition {
  tick: number;
  measure: number;
  beat: number;
  tickInMeasure: number;
  pickup: boolean;
}
export interface QuantizedNote extends MusicalPosition {
  id: string;
  midi: number;
  sourceStart: number;
  sourceDuration: number;
  startTick: number;
  durationTicks: number;
  startSeconds: number;
  durationSeconds: number;
  origin: NoteMetadata["origin"];
  edited: boolean;
  movementMs: number;
}
export interface NoteSegment {
  sourceNoteId: string;
  measure: number;
  startTick: number;
  durationTicks: number;
  tieFromPrevious: boolean;
  tieToNext: boolean;
}
export type IssueKind =
  "zeroDuration" | "overlap" | "bounds" | "short" | "crowded" | "barline";
export interface QuantizationIssue {
  kind: IssueKind;
  noteIds: string[];
  message: string;
  deletionCandidate?: boolean;
}
export interface QuantizationResult {
  /** Settings provenance prevents exporting ticks under a different meter/grid. */
  settings: RhythmSettings;
  notes: QuantizedNote[];
  workingNotes: NoteEvent[];
  segments: NoteSegment[];
  issues: QuantizationIssue[];
  stats: {
    total: number;
    changed: number;
    unchanged: number;
    averageMovementMs: number;
    maxMovementMs: number;
    reviewNotes: number;
    shortNotes: number;
    overlappingNotes: number;
    calculationMs: number;
  };
}

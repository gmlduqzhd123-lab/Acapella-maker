import type { NoteEvent } from "../music/types";
import type { QuantizedNote, RhythmSettings } from "../quantization/types";
export const VOICES = ["soprano", "alto", "tenor", "bass"] as const;
export type Part = (typeof VOICES)[number];
export type VoiceRole = Part | "unassigned";
export const VOICE_NAMES: Record<VoiceRole, string> = {
  soprano: "Soprano",
  alto: "Alto",
  tenor: "Tenor",
  bass: "Bass",
  unassigned: "미분류",
};
export const VOICE_LABELS: Record<VoiceRole, string> = {
  soprano: "S",
  alto: "A",
  tenor: "T",
  bass: "B",
  unassigned: "?",
};
export interface VoiceRange {
  low: number;
  high: number;
}
export type VoiceRanges = Record<Part, VoiceRange>;
export interface VoiceMetadata {
  voice: VoiceRole;
  origin: "auto" | "manual";
  confidence: number | null;
}
export interface AssignmentReasons {
  range: number;
  leap: number;
  continuity: number;
  crossing: number;
  chordPosition: number;
  strength: number;
  overlap: number;
  sustain: number;
}
export interface AssignedNote extends VoiceMetadata {
  noteId: string;
  reasons: AssignmentReasons;
}
export interface VoiceAssignmentIssue {
  kind: "range" | "leap" | "crossing" | "overlap";
  noteIds: string[];
  voice: Part;
  start: number;
  message: string;
}
export interface VoiceAssignmentResult {
  assignments: AssignedNote[];
  tracks: Record<Part, NoteEvent[]>;
  unassigned: NoteEvent[];
  issues: VoiceAssignmentIssue[];
  stats: {
    total: number;
    counts: Record<VoiceRole, number>;
    ranges: Record<Part, VoiceRange | null>;
    calculationMs: number;
    beamWidth: number;
    maxCandidates: number;
    peakCandidates: number;
    clusters: number;
  };
}
export interface AssignmentInput {
  notes: NoteEvent[];
  quantized: QuantizedNote[];
  settings: RhythmSettings;
  ranges: VoiceRanges;
  manual?: Record<string, VoiceMetadata>;
}

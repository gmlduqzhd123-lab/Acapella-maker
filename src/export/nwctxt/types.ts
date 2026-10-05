import type {
  QuantizedNote,
  TimeSignatureName,
} from "../../quantization/types";
import type { KeyDefinition } from "./keySignature";
export type NwcClef = "Treble" | "Bass";
export interface NwcEvent {
  id: string;
  startTick: number;
  durationTicks: number;
  notes: QuantizedNote[];
}
export interface NotationLane {
  name: string;
  clef: NwcClef;
  events: NwcEvent[];
}
export interface NwcPitch {
  noteId: string;
  midi: number;
  pos: number;
  accidental: string;
}
export interface NwcItem {
  kind: "Note" | "Chord" | "Rest";
  startTick: number;
  durationTicks: number;
  duration: string;
  pitches: NwcPitch[];
  tieFromPrevious: boolean;
  tieToNext: boolean;
}
export interface NwcMeasure {
  number: number;
  startTick: number;
  endTick: number;
  items: NwcItem[];
}
export interface NwcStaff {
  name: string;
  clef: NwcClef;
  key: KeyDefinition;
  measures: NwcMeasure[];
}
export interface NwcReport {
  staff: number;
  notes: number;
  measures: number;
  chords: number;
  ties: number;
  warnings: string[];
}
export interface NwcDocument {
  title: string;
  bpm: number;
  tempoBase: "Quarter" | "Quarter Dotted";
  timeSignature: TimeSignatureName;
  staffs: NwcStaff[];
  report: NwcReport;
}

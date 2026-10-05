/** All timing values are seconds; MIDI pitch is 0–127. */
export interface NoteEvent {
  id: string;
  start: number;
  duration: number;
  midi: number;
  velocity: number;
  confidence: number;
}
export type KeyMode = "major" | "minor";
export interface MusicalKey {
  tonic: number;
  mode: KeyMode;
  confidence: number;
}
export type Quantization =
  "whole" | "half" | "quarter" | "eighth" | "sixteenth";

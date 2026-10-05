import type { MusicalKey, NoteEvent, Quantization } from "../music/types";
export interface ScoreData {
  title: string;
  bpm: number;
  key: MusicalKey;
  timeSignature: { numerator: number; denominator: number };
  quantization: Quantization;
  notes: NoteEvent[];
}

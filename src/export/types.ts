import type { ScoreData } from "../score/types";
export interface ExportedFile {
  name: string;
  blob: Blob;
}
export type ScoreExporter = (score: ScoreData) => ExportedFile;
// MIDI and NWCTXT exporters belong to later MVP stages. No placeholder files are emitted.

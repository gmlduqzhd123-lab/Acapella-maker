import type { ScoreData } from "../score/types";
export interface ExportedFile {
  name: string;
  blob: Blob;
}
export type ScoreExporter = (score: ScoreData) => ExportedFile;
// Future score-renderer contract. Phase6 MIDI/NWCTXT consume ExportSnapshot directly.

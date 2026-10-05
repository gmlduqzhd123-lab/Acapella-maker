import type { MusicalKey, NoteEvent } from "../music/types";
import type { ScoreData } from "../score/types";
/** IndexedDB implementation is planned for a later MVP stage. Audio is optional. */
export interface ProjectData {
  schemaVersion: 1;
  id: string;
  name: string;
  updatedAt: string;
  bpm: number | null;
  key: MusicalKey | null;
  notes: NoteEvent[];
  editedScore: ScoreData | null;
}

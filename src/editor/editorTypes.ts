import type { NoteEvent } from "../music/types";
export interface NoteMetadata {
  origin: "ai" | "manual";
  edited: boolean;
}
export interface EditorSnapshot {
  notes: NoteEvent[];
  metadata: Record<string, NoteMetadata>;
}
export interface EditorState extends EditorSnapshot {
  selectedNoteId: string | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  manualCounter: number;
}

import type { EditorSnapshot, EditorState } from "./editorTypes";
import type { NoteEvent } from "../music/types";
import { constrainNote, sameNotes, sortNotes } from "./noteMath.ts";
export const HISTORY_LIMIT = 50;
export function initializeEditor(notes: NoteEvent[], counter = 0): EditorState {
  return {
    notes: sortNotes(structuredClone(notes)),
    metadata: Object.fromEntries(
      notes.map((note) => [note.id, { origin: "ai", edited: false }]),
    ),
    selectedNoteId: null,
    past: [],
    future: [],
    manualCounter: counter,
  };
}
export type EditorAction =
  | { type: "initialize"; notes: NoteEvent[]; preserveCounter?: boolean }
  | { type: "select"; id: string | null }
  | {
      type: "update";
      id: string;
      patch: Partial<Pick<NoteEvent, "midi" | "start" | "duration">>;
      duration: number;
    }
  | { type: "add"; start: number; midi: number; duration: number }
  | { type: "delete"; id: string }
  | { type: "undo" }
  | { type: "redo" };
const snapshot = (state: EditorState): EditorSnapshot => ({
  notes: state.notes,
  metadata: state.metadata,
});
function commit(state: EditorState, next: EditorSnapshot): EditorState {
  if (sameNotes(state.notes, next.notes)) return state;
  return {
    ...state,
    ...next,
    past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
    selectedNoteId: next.notes.some((note) => note.id === state.selectedNoteId)
      ? state.selectedNoteId
      : null,
  };
}
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  if (action.type === "initialize")
    return initializeEditor(
      action.notes,
      action.preserveCounter ? state.manualCounter : 0,
    );
  if (action.type === "select") return { ...state, selectedNoteId: action.id };
  if (action.type === "undo" || action.type === "redo") {
    const stack = action.type === "undo" ? state.past : state.future;
    const next = stack.at(-1);
    if (!next) return state;
    return {
      ...state,
      ...next,
      selectedNoteId: next.notes.some(
        (note) => note.id === state.selectedNoteId,
      )
        ? state.selectedNoteId
        : null,
      past:
        action.type === "undo"
          ? state.past.slice(0, -1)
          : [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future:
        action.type === "redo"
          ? state.future.slice(0, -1)
          : [...state.future, snapshot(state)].slice(-HISTORY_LIMIT),
    };
  }
  if (action.type === "add") {
    if (!(action.duration > 0)) return state;
    const counter = state.manualCounter + 1;
    const id = `manual-${String(counter).padStart(6, "0")}`;
    const note = constrainNote(
      {
        id,
        start: action.start,
        duration: Math.min(0.5, Math.max(0.03, action.duration - action.start)),
        midi: action.midi,
        velocity: 90,
        confidence: 1,
      },
      action.duration,
    );
    return {
      ...commit(state, {
        notes: sortNotes([...state.notes, note]),
        metadata: {
          ...state.metadata,
          [id]: { origin: "manual", edited: false },
        },
      }),
      manualCounter: counter,
      selectedNoteId: id,
    };
  }
  if (action.type === "delete") {
    const metadata = { ...state.metadata };
    delete metadata[action.id];
    return commit(state, {
      notes: state.notes.filter((note) => note.id !== action.id),
      metadata,
    });
  }
  const existing = state.notes.find((note) => note.id === action.id);
  if (!existing || !(action.duration > 0)) return state;
  const patch = { ...action.patch };
  if (patch.duration !== undefined)
    patch.duration = Math.min(patch.duration, action.duration - existing.start);
  const note = constrainNote({ ...existing, ...patch }, action.duration);
  const metadata = {
    ...state.metadata,
    [action.id]: { ...state.metadata[action.id], edited: true },
  };
  return commit(state, {
    notes: sortNotes(
      state.notes.map((value) => (value.id === action.id ? note : value)),
    ),
    metadata,
  });
}

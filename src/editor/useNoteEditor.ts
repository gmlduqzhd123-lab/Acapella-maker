import { useEffect, useMemo, useReducer } from "react";
import type { NoteEvent } from "../music/types";
import { editorReducer, initializeEditor } from "./noteHistory";
import { sameNotes, sortNotes } from "./noteMath";
export function useNoteEditor(original: NoteEvent[] | null, duration: number) {
  const [state, dispatch] = useReducer(editorReducer, [], initializeEditor);
  useEffect(() => {
    dispatch({ type: "initialize", notes: original ?? [] });
  }, [original]);
  const source = useMemo(() => sortNotes(original ?? []), [original]);
  const dirty = !sameNotes(state.notes, source);
  return {
    ...state,
    dirty,
    original: source,
    duration,
    dispatch,
    update: (
      id: string,
      patch: Partial<Pick<NoteEvent, "midi" | "start" | "duration">>,
    ) => dispatch({ type: "update", id, patch, duration }),
    reset: () =>
      dispatch({ type: "initialize", notes: source, preserveCounter: true }),
  };
}
export type NoteEditor = ReturnType<typeof useNoteEditor>;

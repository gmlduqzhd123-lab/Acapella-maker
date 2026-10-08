import { useMemo, useState } from "react";
import type { NoteEditor } from "../editor/useNoteEditor";
import type { NoteEvent } from "../music/types";
import { sameNotes, sortNotes } from "../editor/noteMath";
import type {
  QuantizationResult,
  QuantizationResolution,
  RhythmSettings,
} from "./types";
import { quantize } from "./quantize";
const defaults: Omit<RhythmSettings, "bpm"> = {
  timeSignature: "4/4",
  bpmUnit: "quarter",
  gridOriginSeconds: 0,
  resolution: "sixteenth",
  strength: "standard",
};
interface Preview {
  result: QuantizationResult;
  settings: RhythmSettings;
  source: NoteEvent[];
  original: NoteEvent[];
  session: string;
}
export function useRhythm(
  editor: NoteEditor,
  bpm: number | null,
  session: string,
) {
  const [config, setConfig] = useState(defaults);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lastApplied, setLastApplied] = useState<Preview | null>(null);
  const [snap, setSnap] = useState<QuantizationResolution | "off">("off");
  const [showGrid, setShowGrid] = useState(true);
  const [error, setError] = useState("");
  const [previousSession, setPreviousSession] = useState(session);
  if (previousSession !== session) {
    setPreviousSession(session);
    setConfig(defaults);
    setPreview(null);
    setLastApplied(null);
    setSnap("off");
    setShowGrid(true);
    setError("");
  }
  const settings = useMemo(() => ({ ...config, bpm }), [config, bpm]);
  const valid = (value: Preview | null) =>
    value?.session === session &&
    value.settings === settings &&
    value.original === editor.original;
  const visiblePreview =
    valid(preview) && preview!.source === editor.notes ? preview!.result : null;
  const applied =
    valid(lastApplied) && sameNotes(editor.notes, lastApplied!.source)
      ? lastApplied!.result
      : null;
  return {
    settings,
    snap,
    setSnap,
    showGrid,
    setShowGrid,
    applyCurrent: () => {
      const result = quantize(
        editor.notes,
        editor.metadata,
        settings,
        editor.duration,
      );
      editor.dispatch({
        type: "replaceNotes",
        notes: result.workingNotes,
        duration: editor.duration,
      });
      setLastApplied({
        result,
        settings,
        source: sortNotes(result.workingNotes),
        original: editor.original,
        session,
      });
      setPreview(null);
      setError("");
      return result;
    },
    preview: visiblePreview,
    applied,
    error,
    configure: (patch: Partial<Omit<RhythmSettings, "bpm">>) => {
      setConfig((value) => ({ ...value, ...patch }));
      setError("");
    },
    createPreview: () => {
      try {
        const result = quantize(
          editor.notes,
          editor.metadata,
          settings,
          editor.duration,
        );
        setPreview({
          result,
          settings,
          source: editor.notes,
          original: editor.original,
          session,
        });
        setError("");
      } catch (reason) {
        setPreview(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "박자 정리 미리보기를 만들지 못했습니다.",
        );
      }
    },
    cancelPreview: () => setPreview(null),
    apply: () => {
      if (!visiblePreview) return;
      editor.dispatch({
        type: "replaceNotes",
        notes: visiblePreview.workingNotes,
        duration: editor.duration,
      });
      setLastApplied({
        result: visiblePreview,
        settings,
        source: sortNotes(visiblePreview.workingNotes),
        original: editor.original,
        session,
      });
      setPreview(null);
    },
  };
}
export type RhythmController = ReturnType<typeof useRhythm>;

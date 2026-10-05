import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NoteEditor } from "../editor/useNoteEditor";
import type { RhythmController } from "../quantization/useRhythm";
import type {
  VoiceAssignmentResult,
  VoiceMetadata,
  VoiceRanges,
  VoiceRole,
} from "./types";
import { DEFAULT_RANGES, validateRanges } from "./ranges";
import { buildVoiceResult } from "./statistics";
import { EMPTY_REASONS } from "./cost";
export function useVoices(editor: NoteEditor, rhythm: RhythmController) {
  const [ranges, setRanges] = useState<VoiceRanges>(() =>
    structuredClone(DEFAULT_RANGES),
  );
  const [keepManual, setKeepManual] = useState(true);
  const [manual, setManual] = useState<Record<string, VoiceMetadata>>({});
  const [previous, setPrevious] = useState(editor.original);
  const [saved, setSaved] = useState<{
    result: VoiceAssignmentResult;
    notes: typeof editor.notes;
    q: typeof rhythm.applied;
    ranges: VoiceRanges;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const job = useRef<Worker | null>(null);
  const latest = useRef({
    notes: editor.notes,
    q: rhythm.applied,
    ranges,
    original: editor.original,
  });
  useLayoutEffect(() => {
    latest.current = {
      notes: editor.notes,
      q: rhythm.applied,
      ranges,
      original: editor.original,
    };
  }, [editor.notes, rhythm.applied, ranges, editor.original]);
  const [jobSource, setJobSource] = useState({
    notes: editor.notes,
    q: rhythm.applied,
    ranges,
  });
  if (
    jobSource.notes !== editor.notes ||
    jobSource.q !== rhythm.applied ||
    jobSource.ranges !== ranges
  ) {
    setJobSource({ notes: editor.notes, q: rhythm.applied, ranges });
    setBusy(false);
  }
  if (previous !== editor.original) {
    setPrevious(editor.original);
    setManual({});
    setSaved(null);
    setRanges(structuredClone(DEFAULT_RANGES));
    setError("");
  }
  useEffect(() => {
    job.current?.terminate();
    job.current = null;
    return () => {
      job.current?.terminate();
      job.current = null;
    };
  }, [editor.notes, rhythm.applied, ranges, editor.original]);
  const fresh =
    !!saved &&
    saved.notes === editor.notes &&
    saved.q === rhythm.applied &&
    saved.ranges === ranges &&
    !!rhythm.applied;
  const result = fresh ? saved!.result : null;
  const map: Record<string, VoiceMetadata> = useMemo(
    () =>
      result
        ? Object.fromEntries(result.assignments.map((a) => [a.noteId, a]))
        : {},
    [result],
  );
  function analyze() {
    const q = rhythm.applied;
    if (!q || busy) return;
    try {
      validateRanges(ranges);
      const captured = latest.current;
      const worker = new Worker(
        new URL("../workers/voices.worker.ts", import.meta.url),
        { type: "module" },
      );
      job.current = worker;
      setBusy(true);
      setError("");
      worker.onmessage = (
        event: MessageEvent<{ result?: VoiceAssignmentResult; error?: string }>,
      ) => {
        worker.terminate();
        if (job.current !== worker) return;
        job.current = null;
        setBusy(false);
        if (
          captured.notes !== latest.current.notes ||
          captured.q !== latest.current.q ||
          captured.ranges !== latest.current.ranges ||
          captured.original !== latest.current.original
        )
          return;
        if (event.data.error) setError(event.data.error);
        else if (event.data.result) {
          setSaved({
            result: event.data.result,
            notes: captured.notes,
            q: captured.q,
            ranges: captured.ranges,
          });
          if (!keepManual) setManual({});
        }
      };
      worker.onerror = () => {
        worker.terminate();
        if (job.current === worker) {
          job.current = null;
          setBusy(false);
          setError(
            "성부 분석 Worker를 실행하지 못했습니다. 다시 시도해 주세요.",
          );
        }
      };
      worker.postMessage({
        notes: editor.notes,
        quantized: q.notes,
        settings: rhythm.settings,
        ranges,
        manual: keepManual ? manual : {},
      });
    } catch (reason) {
      setBusy(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "성부 분석을 시작하지 못했습니다.",
      );
    }
  }
  function override(ids: string[], voice: VoiceRole) {
    if (!result) return;
    const target = new Set(ids),
      assignments = result.assignments.map((a) =>
        target.has(a.noteId)
          ? {
              ...a,
              voice,
              origin: "manual" as const,
              confidence: null,
              reasons: { ...EMPTY_REASONS },
            }
          : a,
      );
    const patch = Object.fromEntries(
      ids
        .filter((id) => map[id])
        .map((id) => [
          id,
          { voice, origin: "manual" as const, confidence: null },
        ]),
    );
    setManual((value) => ({ ...value, ...patch }));
    setSaved({
      ...saved!,
      result: buildVoiceResult(editor.notes, assignments, ranges, {
        ...result.stats,
      }),
    });
  }
  return {
    ranges,
    setRanges,
    keepManual,
    setKeepManual,
    result,
    map,
    busy,
    error,
    analyze,
    override,
    stale: !!saved && !fresh,
    ready: !!rhythm.applied && !busy,
    cancel: () => {
      job.current?.terminate();
      job.current = null;
      setBusy(false);
    },
  };
}
export type VoiceController = ReturnType<typeof useVoices>;

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LoadedAudio } from "../audio/types";
import type { useMusicAnalysis } from "../analysis/useMusicAnalysis";
import type { NoteEditor } from "../editor/useNoteEditor";
import type { RhythmController } from "../quantization/useRhythm";
import { sameNotes, sortNotes } from "../editor/noteMath";
import type { TeamSettings } from "./team";
type Analysis = ReturnType<typeof useMusicAnalysis>;
export function useQuickDraft(
  audio: LoadedAudio | null,
  analysis: Analysis,
  editor: NoteEditor,
  rhythm: RhythmController,
) {
  const [phase, setPhase] = useState<
    | "idle"
    | "analyzing"
    | "preparing"
    | "tempo"
    | "ready"
    | "error"
    | "cancelled"
  >("idle");
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const latest = useRef({ audio, analysis, editor, rhythm });
  useLayoutEffect(() => {
    latest.current = { audio, analysis, editor, rhythm };
  });
  useEffect(() => () => job.current?.abort(), []);
  async function waitUntil(predicate: () => boolean, signal: AbortSignal) {
    const deadline = performance.now() + 10000;
    while (!predicate()) {
      signal.throwIfAborted();
      if (performance.now() > deadline)
        throw new Error("편집본 준비가 지연되었습니다. 다시 시도해 주세요.");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
    }
    signal.throwIfAborted();
  }
  async function prepare(team: TeamSettings, controller: AbortController) {
    setPhase("preparing");
    const previous = latest.current.rhythm.settings;
    latest.current.rhythm.configure({
      timeSignature: "4/4",
      bpmUnit: "quarter",
      gridOriginSeconds: 0,
      resolution: team.difficulty === "easy" ? "eighth" : "sixteenth",
      strength: "standard",
    });
    await waitUntil(
      () => latest.current.rhythm.settings !== previous,
      controller.signal,
    );
    latest.current.rhythm.applyCurrent();
    await waitUntil(() => !!latest.current.rhythm.applied, controller.signal);
    setPhase("ready");
  }
  async function run(team: TeamSettings, bpm?: number) {
    if (!audio || job.current || analysis.busy) return;
    const controller = new AbortController();
    job.current = controller;
    setError("");
    try {
      if (bpm !== undefined) {
        if (
          !latest.current.analysis.result?.pitch ||
          !latest.current.editor.notes.length
        )
          throw new Error("먼저 음표 초안을 생성해 주세요.");
        if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240)
          throw new Error("BPM은 40~240 사이로 입력해 주세요.");
        latest.current.analysis.setOverrides((value) => ({ ...value, bpm }));
        await waitUntil(
          () => latest.current.analysis.effective?.bpm === bpm,
          controller.signal,
        );
      } else {
        setPhase("analyzing");
        const result = await latest.current.analysis.start(audio.buffer);
        controller.signal.throwIfAborted();
        if (!result) {
          setPhase("error");
          return;
        }
        if (!result.notes.length)
          throw new Error(
            "감지된 음표가 없습니다. 선율이 선명한 음원으로 다시 시도해 주세요.",
          );
        const original = sortNotes(result.notes);
        await waitUntil(
          () =>
            latest.current.analysis.result === result &&
            sameNotes(latest.current.editor.notes, original) &&
            sameNotes(latest.current.editor.original, original),
          controller.signal,
        );
      }
      if (latest.current.analysis.effective?.bpm === null) {
        setPhase("tempo");
        return;
      }
      await prepare(team, controller);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setPhase("error");
        setError(
          reason instanceof Error
            ? reason.message
            : "초안을 만들지 못했습니다.",
        );
      }
    } finally {
      if (job.current === controller) job.current = null;
    }
  }
  function cancel() {
    job.current?.abort();
    job.current = null;
    analysis.cancel();
    setPhase("cancelled");
    setError("");
  }
  return {
    phase,
    error,
    run,
    cancel,
    reset: () => {
      cancel();
      setPhase("idle");
    },
    busy: phase === "analyzing" || phase === "preparing",
  };
}
export type QuickDraftController = ReturnType<typeof useQuickDraft>;

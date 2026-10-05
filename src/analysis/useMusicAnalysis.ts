import { useEffect, useRef, useState } from "react";
import { createAnalysisInput } from "./createAnalysisInput";
import { runAnalysisWorker } from "./runAnalysisWorker";
import { effectiveResult } from "./effectiveResult";
import { PitchWorkerClient } from "../pitch/pitchWorkerClient";
import type {
  AnalysisOverrides,
  AnalysisProgress,
  AnalysisResult,
  AnalysisStatus,
} from "./types";

export function useMusicAnalysis() {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [progress, setProgress] = useState<AnalysisProgress>({
    phase: "preparing",
    fraction: 0,
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [overrides, setOverrides] = useState<AnalysisOverrides>({
    bpm: null,
    key: null,
  });
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const pitch = useRef<PitchWorkerClient | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      job.current?.abort();
      job.current = null;
      pitch.current?.dispose();
      pitch.current = null;
    },
    [],
  );

  function cancel() {
    if (!job.current) return;
    generation.current++;
    job.current.abort();
    job.current = null;
    setStatus("cancelled");
    setProgress({ phase: "preparing", fraction: 0 });
    setError("");
  }
  function reset() {
    generation.current++;
    job.current?.abort();
    job.current = null;
    setStatus("idle");
    setProgress({ phase: "preparing", fraction: 0 });
    setResult(null);
    setOverrides({ bpm: null, key: null });
    setError("");
  }
  async function start(buffer: AudioBuffer) {
    if (job.current) return;
    const controller = new AbortController(),
      version = ++generation.current;
    job.current = controller;
    setStatus("preparing");
    setProgress({ phase: "preparing", fraction: 0 });
    setError("");
    try {
      const input = await createAnalysisInput(
        buffer,
        controller.signal,
        (fraction) => {
          if (version === generation.current)
            setProgress({ phase: "preparing", fraction: fraction * 0.05 });
        },
      );
      if (version !== generation.current) return;
      setStatus("running");
      const next = await runAnalysisWorker(
        input,
        controller.signal,
        (value) => {
          if (version === generation.current)
            setProgress({
              phase: value.phase === "complete" ? "key" : value.phase,
              fraction: 0.05 + 0.3 * value.fraction,
            });
        },
      );
      if (version !== generation.current) return;
      // BPM/Key remain usable if the AI model fails. Reanalysis preserves manual choices.
      setResult((current) => current ?? next.result);
      pitch.current ??= new PitchWorkerClient();
      const detected = await pitch.current.run(
        next.input,
        controller.signal,
        (value) => {
          if (version === generation.current) setProgress(value);
        },
      );
      if (version !== generation.current) return;
      setResult({
        ...next.result,
        notes: detected.notes,
        pitch: detected.metadata,
      });
      setStatus("complete");
      setProgress({ phase: "complete", fraction: 1 });
    } catch (reason) {
      if (controller.signal.aborted || version !== generation.current) return;
      setStatus("error");
      setError(
        reason instanceof RangeError
          ? "분석 메모리가 부족합니다. 더 짧은 음원으로 다시 시도해 주세요."
          : reason instanceof Error
            ? reason.message
            : "음악을 분석하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      if (version === generation.current) job.current = null;
    }
  }
  return {
    status,
    progress,
    result,
    overrides,
    error,
    busy: status === "preparing" || status === "running",
    effective: result ? effectiveResult(result, overrides) : null,
    start,
    cancel,
    reset,
    setOverrides,
  };
}

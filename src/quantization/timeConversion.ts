import { PPQ } from "./types.ts";
import type { RhythmSettings } from "./types";
export function secondsPerQuarter(settings: RhythmSettings): number {
  if (
    settings.bpm === null ||
    !Number.isFinite(settings.bpm) ||
    settings.bpm <= 0
  )
    throw new RangeError(
      "박자를 찾지 못했습니다. BPM을 직접 입력한 뒤 다시 시도해 주세요.",
    );
  return (
    60 /
    settings.bpm /
    (settings.timeSignature === "6/8" && settings.bpmUnit === "dottedQuarter"
      ? 1.5
      : 1)
  );
}
/** Signed, fractional ticks relative to measure 1 beat 1. Round only at the musical transform boundary. */
export function secondsToTicks(
  seconds: number,
  settings: RhythmSettings,
): number {
  return (
    ((seconds - settings.gridOriginSeconds) / secondsPerQuarter(settings)) * PPQ
  );
}
export function ticksToSeconds(
  ticks: number,
  settings: RhythmSettings,
): number {
  return (
    settings.gridOriginSeconds + (ticks / PPQ) * secondsPerQuarter(settings)
  );
}

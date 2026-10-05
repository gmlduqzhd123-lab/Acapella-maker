import { PPQ } from "./types.ts";
import type {
  MusicalPosition,
  QuantizationResolution,
  RhythmSettings,
  TimeSignatureName,
} from "./types";
import { secondsToTicks, ticksToSeconds } from "./timeConversion.ts";
export const RESOLUTION_TICKS: Record<QuantizationResolution, number> = {
  quarter: PPQ,
  eighth: PPQ / 2,
  sixteenth: PPQ / 4,
  thirtySecond: PPQ / 8,
};
export const TIME_SIGNATURES: Record<
  TimeSignatureName,
  { numerator: number; denominator: number }
> = {
  "4/4": { numerator: 4, denominator: 4 },
  "3/4": { numerator: 3, denominator: 4 },
  "6/8": { numerator: 6, denominator: 8 },
};
export function measureTicks(signature: TimeSignatureName) {
  const meter = TIME_SIGNATURES[signature];
  return ((PPQ * 4) / meter.denominator) * meter.numerator;
}
export function musicalPosition(
  tick: number,
  signature: TimeSignatureName,
): MusicalPosition {
  const length = measureTicks(signature),
    index = Math.floor(tick / length),
    within = tick - index * length;
  return {
    tick,
    measure: index + 1,
    beat: 1 + within / ((PPQ * 4) / TIME_SIGNATURES[signature].denominator),
    tickInMeasure: within,
    pickup: tick < 0,
  };
}
/** Nearest grid, ties away from zero so pickup half-grid notes stay before the origin. */
export function snapTick(tick: number, resolution: QuantizationResolution) {
  const grid = RESOLUTION_TICKS[resolution];
  return Math.sign(tick) * Math.round(Math.abs(tick) / grid) * grid;
}
export function snapSeconds(
  seconds: number,
  settings: RhythmSettings,
  resolution: QuantizationResolution,
) {
  return ticksToSeconds(
    snapTick(secondsToTicks(seconds, settings), resolution),
    settings,
  );
}
export function visibleGridMarks(
  leftSeconds: number,
  rightSeconds: number,
  pixelsPerSecond: number,
  settings: RhythmSettings,
) {
  const beat = (PPQ * 4) / TIME_SIGNATURES[settings.timeSignature].denominator,
    measure = measureTicks(settings.timeSignature),
    division = RESOLUTION_TICKS[settings.resolution];
  const pixelsPerTick =
    (pixelsPerSecond *
      (ticksToSeconds(PPQ, settings) - settings.gridOriginSeconds)) /
    PPQ;
  let step =
    division * pixelsPerTick >= 6
      ? Math.min(division, beat)
      : beat * pixelsPerTick >= 8
        ? beat
        : measure;
  while (
    ((rightSeconds - leftSeconds) * pixelsPerSecond) / (step * pixelsPerTick) >
    400
  )
    step *= 2;
  const start = Math.ceil(secondsToTicks(leftSeconds, settings) / step) * step,
    end = secondsToTicks(rightSeconds, settings);
  const marks: Array<
    MusicalPosition & {
      seconds: number;
      kind: "measure" | "beat" | "subdivision";
    }
  > = [];
  for (let tick = start; tick <= end + 1e-7 && marks.length < 402; tick += step)
    marks.push({
      ...musicalPosition(tick, settings.timeSignature),
      seconds: ticksToSeconds(tick, settings),
      kind:
        tick % measure === 0
          ? "measure"
          : tick % beat === 0
            ? "beat"
            : "subdivision",
    });
  return marks;
}

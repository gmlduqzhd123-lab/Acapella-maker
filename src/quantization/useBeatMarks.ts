import { useMemo } from "react";
import type { RhythmSettings } from "./types";
import { visibleGridMarks } from "./grid";
export function useBeatMarks(
  left: number,
  width: number,
  zoom: number,
  duration: number,
  settings: RhythmSettings,
  shown: boolean,
) {
  return useMemo(
    () =>
      shown && settings.bpm
        ? visibleGridMarks(
            Math.max(0, (left - 64) / zoom),
            Math.min(duration, (left + width - 64) / zoom),
            zoom,
            settings,
          )
        : [],
    [left, width, zoom, duration, settings, shown],
  );
}

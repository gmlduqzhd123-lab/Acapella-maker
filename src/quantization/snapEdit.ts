import type { NoteEvent } from "../music/types";
import type { QuantizationResolution, RhythmSettings } from "./types";
import { RESOLUTION_TICKS, snapSeconds } from "./grid.ts";
import { secondsPerQuarter } from "./timeConversion.ts";
export function snapEditingNote(
  note: NoteEvent,
  original: NoteEvent,
  edge: string | undefined,
  settings: RhythmSettings,
  resolution: QuantizationResolution,
  audioDuration: number,
): NoteEvent {
  const minimum =
    (RESOLUTION_TICKS[resolution] / 960) * secondsPerQuarter(settings);
  const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(high, value));
  if (edge === "right") {
    const end = clamp(
      snapSeconds(note.start + note.duration, settings, resolution),
      original.start + Math.min(minimum, audioDuration - original.start),
      audioDuration,
    );
    return { ...note, start: original.start, duration: end - original.start };
  }
  if (edge === "left") {
    const end = original.start + original.duration;
    const start = clamp(
      snapSeconds(note.start, settings, resolution),
      0,
      end - Math.min(minimum, end),
    );
    return { ...note, start, duration: end - start };
  }
  return {
    ...note,
    start: clamp(
      snapSeconds(note.start, settings, resolution),
      0,
      audioDuration - note.duration,
    ),
  };
}

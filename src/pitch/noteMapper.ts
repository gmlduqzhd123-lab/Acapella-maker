import type { NoteEvent } from "../music/types.ts";
import type { RawPitchNote } from "./pitchTypes.ts";
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
/** Amplitude is an activation strength, NOT a calibrated correctness probability. */
export function mapPitchNotes(
  raw: RawPitchNote[],
  audioDuration: number,
): NoteEvent[] {
  if (!Number.isFinite(audioDuration) || audioDuration <= 0)
    throw new Error("Invalid audio duration");
  const valid = raw
    .flatMap((note) => {
      const {
        startTimeSeconds: start,
        durationSeconds: duration,
        pitchMidi: midi,
        amplitude,
      } = note;
      if (
        ![start, duration, midi, amplitude].every(Number.isFinite) ||
        duration <= 0 ||
        !Number.isInteger(midi) ||
        midi < 0 ||
        midi > 127 ||
        start < -0.05 ||
        start >= audioDuration ||
        start + duration > audioDuration + 0.25
      )
        return [];
      const safeStart = Math.max(0, start),
        safeEnd = Math.min(audioDuration, start + duration);
      if (safeEnd <= safeStart) return [];
      const confidence = clamp(amplitude, 0, 1);
      return [
        {
          start: safeStart,
          duration: safeEnd - safeStart,
          midi,
          velocity: Math.round(confidence * 127),
          confidence,
        },
      ];
    })
    .sort(
      (a, b) => a.start - b.start || a.midi - b.midi || a.duration - b.duration,
    );
  return valid.map((note, index) => ({
    id: `bp-${String(index + 1).padStart(6, "0")}`,
    ...note,
  }));
}

import type { NoteSegment, QuantizedNote, TimeSignatureName } from "./types";
import { measureTicks, musicalPosition } from "./grid.ts";
export function splitNotesAcrossMeasures(
  notes: Pick<QuantizedNote, "id" | "startTick" | "durationTicks">[],
  signature: TimeSignatureName,
): NoteSegment[] {
  const length = measureTicks(signature),
    segments: NoteSegment[] = [];
  for (const note of notes) {
    if (
      !Number.isSafeInteger(note.startTick) ||
      !Number.isSafeInteger(note.durationTicks) ||
      note.durationTicks <= 0
    )
      throw new RangeError("음가 tick이 올바르지 않습니다.");
    const end = note.startTick + note.durationTicks;
    for (let start = note.startTick; start < end;) {
      const position = musicalPosition(start, signature),
        next = Math.min(end, Math.floor(start / length) * length + length);
      segments.push({
        sourceNoteId: note.id,
        measure: position.measure,
        startTick: start,
        durationTicks: next - start,
        tieFromPrevious: start !== note.startTick,
        tieToNext: next !== end,
      });
      start = next;
    }
  }
  return segments;
}
/** Explicit single voice only. Reject polyphony rather than inventing voice rests. */
export function findGaps(
  notes: Pick<QuantizedNote, "startTick" | "durationTicks">[],
  startTick: number,
  endTick: number,
) {
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick),
    gaps: Array<{ startTick: number; durationTicks: number }> = [];
  let cursor = startTick,
    previousEnd = -Infinity;
  for (const note of sorted) {
    if (note.durationTicks <= 0 || note.startTick < previousEnd)
      throw new RangeError(
        "findGaps는 겹치지 않는 단일 성부에만 사용할 수 있습니다.",
      );
    previousEnd = note.startTick + note.durationTicks;
    const start = Math.max(startTick, note.startTick),
      end = Math.min(endTick, note.startTick + note.durationTicks);
    if (end <= startTick || start >= endTick) continue;
    if (start > cursor)
      gaps.push({ startTick: cursor, durationTicks: start - cursor });
    cursor = Math.max(cursor, end);
  }
  if (cursor < endTick)
    gaps.push({ startTick: cursor, durationTicks: endTick - cursor });
  return gaps;
}

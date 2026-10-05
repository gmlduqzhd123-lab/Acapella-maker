import type { NoteEvent } from "../music/types";
export const MIN_DURATION = 0.03;
export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export function constrainNote(
  note: NoteEvent,
  duration: number,
  minimum = MIN_DURATION,
): NoteEvent {
  const length = clamp(
    Number.isFinite(note.duration) ? note.duration : MIN_DURATION,
    Math.min(minimum, duration),
    duration,
  );
  return {
    ...note,
    midi: Math.round(
      clamp(Number.isFinite(note.midi) ? note.midi : 60, 0, 127),
    ),
    start: clamp(
      Number.isFinite(note.start) ? note.start : 0,
      0,
      duration - length,
    ),
    duration: length,
  };
}
export function sortNotes(notes: NoteEvent[]) {
  return [...notes].sort(
    (a, b) => a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id),
  );
}
export function sameNotes(a: NoteEvent[], b: NoteEvent[]) {
  return (
    a.length === b.length &&
    a.every((note, index) => {
      const other = b[index];
      return (
        note.id === other.id &&
        note.start === other.start &&
        note.duration === other.duration &&
        note.midi === other.midi &&
        note.velocity === other.velocity &&
        note.confidence === other.confidence
      );
    })
  );
}
export function pitchRange(notes: NoteEvent[]) {
  const pitches = notes.map((note) => note.midi);
  let low = pitches.length
    ? Math.max(0, Math.floor((Math.min(...pitches) - 3) / 12) * 12)
    : 48;
  let high = pitches.length
    ? Math.min(127, Math.ceil((Math.max(...pitches) + 3) / 12) * 12)
    : 84;
  if (high - low < 24) {
    low = Math.max(0, high - 24);
    high = Math.min(127, low + 24);
  }
  return { low, high };
}

import type { AssignmentReasons, Part, VoiceRanges } from "./types";
import { VOICES } from "./types.ts";
import type { NoteEvent } from "../music/types";
export function continuityFactor(gap: number) {
  return 0.2 + 0.8 * Math.exp(-Math.max(0, gap) / 2);
}
export function leapPenalty(distance: number, gap: number) {
  const cost =
    distance <= 4
      ? distance * 0.08
      : distance <= 7
        ? 0.32 + (distance - 4) * 0.5
        : distance <= 12
          ? 1.82 + (distance - 7) * 1.5
          : 9.32 + (distance - 12) * 3;
  return cost * continuityFactor(gap);
}
export function assignmentCost(
  note: NoteEvent,
  voice: Part,
  last: Array<NoteEvent | null>,
  ranges: VoiceRanges,
  cluster: NoteEvent[],
  prior: Array<NoteEvent | null> = [null, null, null, null],
): AssignmentReasons {
  const index = VOICES.indexOf(voice),
    previous = last[index],
    range = ranges[voice];
  const outside = Math.max(range.low - note.midi, 0, note.midi - range.high);
  const plausible = cluster
    .filter((n) => n.confidence >= 0.25)
    .sort((a, b) => b.midi - a.midi || a.id.localeCompare(b.id))
    .slice(0, 4);
  const rank = plausible.findIndex((n) => n.id === note.id);
  const reasons: AssignmentReasons = {
    range:
      outside * 4 + Math.abs(note.midi - (range.low + range.high) / 2) * 0.12,
    leap: previous
      ? leapPenalty(
          Math.abs(note.midi - previous.midi),
          note.start - previous.start - previous.duration,
        )
      : 0,
    continuity:
      !previous && last.some(Boolean)
        ? 2
        : previous && prior[index]
          ? Math.abs(
              note.midi - previous.midi - (previous.midi - prior[index]!.midi),
            ) *
            continuityFactor(note.start - previous.start - previous.duration)
          : 0,
    crossing: 0,
    chordPosition:
      plausible.length >= 3 && rank >= 0
        ? Math.abs(index - (rank * 3) / (plausible.length - 1)) * 0.35
        : 0,
    strength: (1 - Math.max(0, Math.min(1, note.confidence))) * 5,
    overlap: 0,
    sustain: 0,
  };
  if (previous && previous.start + previous.duration > note.start + 1e-8) {
    reasons.overlap = Infinity;
    reasons.sustain = Infinity;
  }
  for (let other = 0; other < 4; other++) {
    const active = last[other];
    if (
      other === index ||
      !active ||
      active.start + active.duration <= note.start + 1e-8
    )
      continue;
    const crossing =
      index < other ? active.midi - note.midi : note.midi - active.midi;
    reasons.crossing += Math.max(0, crossing) * 0.2;
  }
  return reasons;
}
export function totalCost(reasons: AssignmentReasons) {
  return Object.values(reasons).reduce((sum, x) => sum + x, 0);
}
export function unassignedCost(note: NoteEvent) {
  return 2 + 14 * Math.max(0, Math.min(1, note.confidence));
}
export const EMPTY_REASONS: AssignmentReasons = {
  range: 0,
  leap: 0,
  continuity: 0,
  crossing: 0,
  chordPosition: 0,
  strength: 0,
  overlap: 0,
  sustain: 0,
};

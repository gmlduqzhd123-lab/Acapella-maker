import type { NoteEvent } from "../music/types";
import type {
  AssignedNote,
  VoiceAssignmentIssue,
  VoiceAssignmentResult,
  VoiceRanges,
} from "./types";
import { VOICES, VOICE_NAMES } from "./types.ts";
export function buildVoiceResult(
  notes: NoteEvent[],
  assignments: AssignedNote[],
  ranges: VoiceRanges,
  measurements = {
    calculationMs: 0,
    beamWidth: 32,
    maxCandidates: 64,
    peakCandidates: 0,
    clusters: 0,
  },
): VoiceAssignmentResult {
  const tracks: VoiceAssignmentResult["tracks"] = {
      soprano: [],
      alto: [],
      tenor: [],
      bass: [],
    },
    unassigned: NoteEvent[] = [],
    issues: VoiceAssignmentIssue[] = [];
  const map = new Map(assignments.map((a) => [a.noteId, a]));
  if (
    map.size !== notes.length ||
    assignments.length !== notes.length ||
    notes.some((n) => !map.has(n.id))
  )
    throw new Error("성부 결과의 음표 ID가 일치하지 않습니다.");
  for (const note of notes) {
    const role = map.get(note.id)!.voice;
    if (role === "unassigned") unassigned.push({ ...note });
    else if (VOICES.includes(role)) tracks[role].push({ ...note });
    else throw new Error("지원하지 않는 성부입니다.");
  }
  for (const voice of VOICES) {
    tracks[voice].sort(
      (a, b) =>
        a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id),
    );
    let active: NoteEvent | undefined;
    for (const [i, note] of tracks[voice].entries()) {
      const range = ranges[voice];
      if (note.midi < range.low || note.midi > range.high)
        issues.push({
          kind: "range",
          voice,
          start: note.start,
          noteIds: [note.id],
          message: `${VOICE_NAMES[voice]} MIDI ${note.midi}: 설정한 soft range 밖입니다.`,
        });
      if (active && active.start + active.duration > note.start + 1e-8)
        issues.push({
          kind: "overlap",
          voice,
          start: note.start,
          noteIds: [active.id, note.id],
          message: `${VOICE_NAMES[voice]} 음표가 겹칩니다. 성부를 직접 수정해 주세요.`,
        });
      if (
        !active ||
        active.start + active.duration < note.start + note.duration
      )
        active = note;
      const previous = tracks[voice][i - 1];
      if (previous && Math.abs(note.midi - previous.midi) >= 8)
        issues.push({
          kind: "leap",
          voice,
          start: note.start,
          noteIds: [previous.id, note.id],
          message: `${VOICE_NAMES[voice]} MIDI ${previous.midi} → ${note.midi}, ${Math.abs(note.midi - previous.midi)} semitone 도약`,
        });
    }
  }
  // Monophonic automatic tracks make pairwise interval sweeps linear; manual
  // overlap is reported independently and invalidates export.
  for (let high = 0; high < 4; high++)
    for (let low = high + 1; low < 4; low++) {
      const a = tracks[VOICES[high]],
        b = tracks[VOICES[low]];
      let i = 0,
        j = 0;
      while (i < a.length && j < b.length) {
        const x = a[i],
          y = b[j];
        if (
          Math.min(x.start + x.duration, y.start + y.duration) >
            Math.max(x.start, y.start) + 1e-8 &&
          x.midi < y.midi
        )
          issues.push({
            kind: "crossing",
            voice: VOICES[high],
            start: Math.max(x.start, y.start),
            noteIds: [x.id, y.id],
            message: `${VOICE_NAMES[VOICES[high]]} / ${VOICE_NAMES[VOICES[low]]} 성부 교차`,
          });
        if (x.start + x.duration <= y.start + y.duration) i++;
        else j++;
      }
    }
  const counts = {
    soprano: tracks.soprano.length,
    alto: tracks.alto.length,
    tenor: tracks.tenor.length,
    bass: tracks.bass.length,
    unassigned: unassigned.length,
  };
  const actualRanges = Object.fromEntries(
    VOICES.map((v) => [
      v,
      tracks[v].length
        ? {
            low: Math.min(...tracks[v].map((n) => n.midi)),
            high: Math.max(...tracks[v].map((n) => n.midi)),
          }
        : null,
    ]),
  ) as VoiceAssignmentResult["stats"]["ranges"];
  return {
    assignments: structuredClone(assignments),
    tracks,
    unassigned,
    issues,
    stats: {
      ...measurements,
      total: notes.length,
      counts,
      ranges: actualRanges,
    },
  };
}

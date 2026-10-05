import type { AssignmentInput, AssignedNote, VoiceRole } from "./types";
import { VOICES } from "./types.ts";
import { harmonicClusters } from "./clusters.ts";
import { validateRanges } from "./ranges.ts";
import {
  assignmentCost,
  totalCost,
  unassignedCost,
  EMPTY_REASONS,
} from "./cost.ts";
import { buildVoiceResult } from "./statistics.ts";
import type { NoteEvent } from "../music/types";
export const BEAM_WIDTH = 32,
  MAX_CANDIDATES = 64;
interface Trail {
  assignment: AssignedNote;
  previous: Trail | null;
}
interface State {
  last: Array<NoteEvent | null>;
  prior: Array<NoteEvent | null>;
  cost: number;
  trail: Trail | null;
  serial: number;
}
export function assignVoices(input: AssignmentInput) {
  const began = performance.now();
  validateRanges(input.ranges);
  const ids = new Set<string>();
  for (const n of input.notes) {
    if (
      ids.has(n.id) ||
      !n.id ||
      !Number.isInteger(n.midi) ||
      n.midi < 0 ||
      n.midi > 127 ||
      !Number.isFinite(n.start) ||
      !Number.isFinite(n.duration) ||
      n.start < 0 ||
      n.duration <= 0 ||
      !Number.isFinite(n.confidence)
    )
      throw new Error("유효하지 않은 성부 분석 음표입니다.");
    ids.add(n.id);
  }
  const clusters = harmonicClusters(input),
    manual = input.manual ?? {};
  const locks = input.notes.filter(
    (n) =>
      manual[n.id]?.origin === "manual" && manual[n.id].voice !== "unassigned",
  );
  let beam: State[] = [
      {
        last: [null, null, null, null],
        prior: [null, null, null, null],
        cost: 0,
        trail: null,
        serial: 0,
      },
    ],
    serial = 0,
    peakCandidates = 0;
  for (const cluster of clusters) {
    // Onset order first protects sustain; exact simultaneous notes use strength
    // then ID ordering, not a hard pitch rank assignment.
    const ordered = [...cluster].sort(
      (a, b) =>
        a.start - b.start ||
        b.confidence - a.confidence ||
        a.id.localeCompare(b.id),
    );
    for (const note of ordered) {
      const next: State[] = [];
      for (const state of beam) {
        const forced =
          manual[note.id]?.origin === "manual" ? manual[note.id].voice : null;
        const candidates = VOICES.map((voice) => ({
          voice,
          reasons: assignmentCost(
            note,
            voice,
            state.last,
            input.ranges,
            cluster,
            state.prior,
          ),
        })).filter(
          (c) =>
            !locks.some(
              (lock) =>
                lock.id !== note.id &&
                manual[lock.id].voice === c.voice &&
                Math.min(
                  note.start + note.duration,
                  lock.start + lock.duration,
                ) >
                  Math.max(note.start, lock.start) + 1e-8,
            ),
        );
        const costs = [
          ...candidates.map((c) => totalCost(c.reasons)),
          unassignedCost(note),
        ]
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
        for (const voice of [...VOICES, "unassigned"] as VoiceRole[]) {
          if (forced && forced !== voice) continue;
          const reasons =
            voice === "unassigned"
              ? { ...EMPTY_REASONS }
              : assignmentCost(
                  note,
                  voice,
                  state.last,
                  input.ranges,
                  cluster,
                  state.prior,
                );
          const allowed =
            voice === "unassigned" || candidates.some((c) => c.voice === voice);
          const cost =
            voice === "unassigned" ? unassignedCost(note) : totalCost(reasons);
          if (!forced && (!allowed || !Number.isFinite(cost))) continue;
          const last = [...state.last];
          const prior = [...state.prior];
          if (voice !== "unassigned")
            prior[VOICES.indexOf(voice)] = state.last[VOICES.indexOf(voice)];
          if (voice !== "unassigned") last[VOICES.indexOf(voice)] = note;
          const selectedCost = Number.isFinite(cost) ? cost : 0; // manual conflicts stay explicit warnings
          const gap = Math.max(
            0,
            selectedCost > costs[0] + 1e-8
              ? 0
              : (costs[1] ?? costs[0]) - costs[0],
          );
          const confidence = forced ? null : gap / (gap + 3);
          const assignment: AssignedNote = {
            noteId: note.id,
            voice,
            origin: forced ? "manual" : "auto",
            confidence,
            reasons: {
              ...reasons,
              overlap: Number.isFinite(reasons.overlap) ? reasons.overlap : 1e6,
              sustain: Number.isFinite(reasons.sustain) ? reasons.sustain : 1e6,
            },
          };
          next.push({
            last,
            prior,
            cost: state.cost + selectedCost,
            trail: { assignment, previous: state.trail },
            serial: ++serial,
          });
        }
      }
      next.sort((a, b) => a.cost - b.cost || a.serial - b.serial);
      const seen = new Set<string>();
      beam = [];
      for (const state of next) {
        const key = [...state.last, ...state.prior]
          .map((n) => n?.id ?? "")
          .join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        beam.push(state);
        if (beam.length >= MAX_CANDIDATES) break;
      }
      peakCandidates = Math.max(peakCandidates, beam.length);
      if (!beam.length) throw new Error("성부 추정 후보를 만들지 못했습니다.");
    }
    beam = beam.slice(0, BEAM_WIDTH);
  }
  const assignments: AssignedNote[] = [];
  for (let trail = beam[0].trail; trail; trail = trail.previous)
    assignments.push(trail.assignment);
  assignments.reverse();
  return buildVoiceResult(input.notes, assignments, input.ranges, {
    calculationMs: performance.now() - began,
    beamWidth: BEAM_WIDTH,
    maxCandidates: MAX_CANDIDATES,
    peakCandidates,
    clusters: clusters.length,
  });
}

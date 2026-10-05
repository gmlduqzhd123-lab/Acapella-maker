import type { AssignmentInput } from "./types";
import type { NoteEvent } from "../music/types";
import { secondsPerQuarter } from "../quantization/timeConversion.ts";
export function harmonicClusters(input: AssignmentInput): NoteEvent[][] {
  const ticks = new Map(input.quantized.map((n) => [n.id, n.startTick]));
  if (
    ticks.size !== input.notes.length ||
    input.notes.some((n) => !ticks.has(n.id))
  )
    throw new Error("최신 박자 정리 결과가 필요합니다.");
  const sorted = [...input.notes].sort(
    (a, b) =>
      ticks.get(a.id)! - ticks.get(b.id)! ||
      a.midi - b.midi ||
      a.id.localeCompare(b.id),
  );
  const tolerance = (0.05 / secondsPerQuarter(input.settings)) * 960;
  const clusters: NoteEvent[][] = [];
  let onset = -Infinity;
  for (const note of sorted) {
    const tick = ticks.get(note.id)!;
    if (tick - onset > tolerance) {
      clusters.push([]);
      onset = tick;
    }
    clusters.at(-1)!.push(note);
  }
  return clusters;
}

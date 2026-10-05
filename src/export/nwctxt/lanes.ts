import type { QuantizedNote } from "../../quantization/types";
import type { KeyDefinition } from "./keySignature";
import type { NwcEvent, NotationLane } from "./types";
import { chooseClef, spellPitch } from "./pitch.ts";
export const MAX_NWC_LANES = 8;
export const TOO_MANY_LANES =
  "동시에 너무 많은 음표가 감지되었습니다. Piano Roll에서 불필요한 음표를 정리해 주세요.";
export function partitionLanes(
  notes: QuantizedNote[],
  key: KeyDefinition,
): NotationLane[] {
  const groups = new Map<string, NwcEvent[]>();
  const sorted = [...notes].sort(
    (a, b) =>
      a.startTick - b.startTick ||
      b.durationTicks - a.durationTicks ||
      a.midi - b.midi ||
      a.id.localeCompare(b.id),
  );
  for (const note of sorted) {
    const name = `${note.startTick}:${note.durationTicks}`;
    const candidates = groups.get(name) ?? [];
    const position = spellPitch(note.midi, key).diatonic;
    // Duplicate/unison chromatic positions cannot be a reliable NWC chord.
    // Preserve them as separate concurrent candidates, never deduplicate notes.
    let event = candidates.find((group) =>
      group.notes.every(
        (member) => spellPitch(member.midi, key).diatonic !== position,
      ),
    );
    if (!event) {
      event = {
        id: note.id,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        notes: [],
      };
      candidates.push(event);
      groups.set(name, candidates);
    }
    event.notes.push(note);
  }
  const events = [...groups.values()]
    .flat()
    .sort(
      (a, b) =>
        a.startTick - b.startTick ||
        b.durationTicks - a.durationTicks ||
        a.id.localeCompare(b.id),
    );
  const lanes: NotationLane[] = [],
    ends: number[] = [];
  for (const event of events) {
    let index = ends.findIndex((end) => end <= event.startTick);
    if (index < 0) {
      index = lanes.length;
      if (index >= MAX_NWC_LANES) throw new Error(TOO_MANY_LANES);
      lanes.push({
        name: `Draft Voice ${index + 1}`,
        clef: "Treble",
        events: [],
      });
    }
    lanes[index].events.push(event);
    ends[index] = event.startTick + event.durationTicks;
  }
  for (const lane of lanes)
    lane.clef = chooseClef(
      lane.events.flatMap((event) => event.notes.map((note) => note.midi)),
    );
  return lanes;
}

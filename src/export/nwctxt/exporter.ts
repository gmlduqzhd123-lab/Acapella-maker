import type { ExportSnapshot } from "../snapshot";
import { validateExportSnapshot } from "../snapshot.ts";
import { measureTicks } from "../../quantization/grid.ts";
import {
  findGaps,
  splitNotesAcrossMeasures,
} from "../../quantization/measures.ts";
import { keySignature } from "./keySignature.ts";
import { partitionLanes } from "./lanes.ts";
import { accidentalPitch } from "./pitch.ts";
import { decomposeDuration } from "./durations.ts";
import { serializeNwc } from "./serializer.ts";
import { validateNwctxt } from "./validator.ts";
import type {
  NwcDocument,
  NwcEvent,
  NwcItem,
  NwcMeasure,
  NwcStaff,
} from "./types";

export function buildNwcDocument(snapshot: ExportSnapshot): NwcDocument {
  validateExportSnapshot(snapshot);
  const key = keySignature(snapshot.key),
    lanes = partitionLanes(snapshot.quantization.notes, key);
  const length = measureTicks(snapshot.timeSignature);
  const start = Math.min(
    0,
    ...snapshot.quantization.notes.map((note) => note.startTick),
  );
  const end = Math.max(
    0,
    Math.ceil(
      Math.max(
        ...snapshot.quantization.notes.map(
          (note) => note.startTick + note.durationTicks,
        ),
      ) / length,
    ) * length,
  );
  const staffs: NwcStaff[] = [];
  for (const lane of lanes) {
    const gaps = findGaps(lane.events, start, end);
    const events: NwcEvent[] = [
      ...lane.events,
      ...gaps.map((gap, index) => ({ id: `rest-${index}`, ...gap, notes: [] })),
    ].sort((a, b) => a.startTick - b.startTick);
    const sources = new Map(events.map((event) => [event.id, event]));
    const segments = splitNotesAcrossMeasures(events, snapshot.timeSignature);
    const measures: NwcMeasure[] = [];
    for (let tick = start; tick < end;) {
      const next = Math.min(end, (Math.floor(tick / length) + 1) * length);
      measures.push({
        number: Math.floor(tick / length) + 1,
        startTick: tick,
        endTick: next,
        items: [],
      });
      tick = next;
    }
    const lookup = new Map(
      measures.map((measure) => [measure.number, measure]),
    );
    let currentMeasure = Infinity,
      accidentalState = new Map<number, number>();
    for (const segment of segments) {
      if (currentMeasure !== segment.measure) {
        currentMeasure = segment.measure;
        accidentalState = new Map();
      }
      const event = sources.get(segment.sourceNoteId)!;
      let tick = segment.startTick;
      const durations = decomposeDuration(segment.durationTicks);
      durations.forEach((duration, index) => {
        const item: NwcItem = {
          kind:
            event.notes.length > 1
              ? "Chord"
              : event.notes.length
                ? "Note"
                : "Rest",
          startTick: tick,
          durationTicks: duration.ticks,
          duration: duration.syntax,
          pitches: event.notes.map((note) =>
            accidentalPitch(
              note.id,
              note.midi,
              lane.clef,
              key,
              accidentalState,
            ),
          ),
          tieFromPrevious:
            !!event.notes.length && (segment.tieFromPrevious || index > 0),
          tieToNext:
            !!event.notes.length &&
            (segment.tieToNext || index < durations.length - 1),
        };
        lookup.get(segment.measure)!.items.push(item);
        tick += duration.ticks;
      });
    }
    staffs.push({ name: lane.name, clef: lane.clef, key, measures });
  }
  const items = staffs.flatMap((staff) =>
    staff.measures.flatMap((measure) => measure.items),
  );
  const warnings = [
    ...new Set(snapshot.quantization.issues.map((issue) => issue.message)),
  ];
  if (!snapshot.key)
    warnings.push(
      "조성이 미지정되어 무조표와 임시표로 기록했습니다. 조성을 직접 확인해 주세요.",
    );
  warnings.push(
    "NWCTXT Beta: 실제 NoteWorthy Composer에서 악보와 재생을 수동 확인해 주세요.",
  );
  return {
    title: snapshot.title,
    bpm: snapshot.bpm,
    tempoBase:
      snapshot.timeSignature === "6/8" && snapshot.bpmUnit === "dottedQuarter"
        ? "Quarter Dotted"
        : "Quarter",
    timeSignature: snapshot.timeSignature,
    staffs,
    report: {
      staff: staffs.length,
      notes: snapshot.notes.length,
      measures: staffs[0]?.measures.length ?? 0,
      chords: items.filter((item) => item.kind === "Chord").length,
      ties: items.reduce(
        (sum, item) => sum + (item.tieToNext ? item.pitches.length : 0),
        0,
      ),
      warnings,
    },
  };
}
export function exportNwctxt(snapshot: ExportSnapshot) {
  const document = buildNwcDocument(snapshot);
  const text = serializeNwc(document);
  const validation = validateNwctxt(text, document, snapshot);
  if (!validation.valid)
    throw new Error(
      `NWC 내보내기 검증 실패: ${validation.errors.slice(0, 3).join(" / ")}`,
    );
  return { text, document, report: document.report };
}

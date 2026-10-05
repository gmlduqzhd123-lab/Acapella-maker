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
import type { VoiceExport } from "../../voices/exportVoices";
import { prepareVoiceExport, SATB_CLEFS } from "../../voices/exportVoices.ts";
import { VOICE_NAMES } from "../../voices/types.ts";
import type {
  NwcDocument,
  NwcEvent,
  NwcItem,
  NwcMeasure,
  NwcStaff,
} from "./types";

export function buildNwcDocument(
  snapshot: ExportSnapshot,
  voices?: VoiceExport,
): NwcDocument {
  validateExportSnapshot(snapshot);
  const satb = voices ? prepareVoiceExport(snapshot, voices) : null;
  if (satb) snapshot = satb.snapshot;
  const key = keySignature(snapshot.key),
    lanes = satb
      ? satb.groups.map((group) => ({
          name: VOICE_NAMES[group.role],
          clef: SATB_CLEFS[group.role],
          events: snapshot.quantization.notes
            .filter((n) => satb.map.map[n.id].voice === group.role)
            .map((n) => ({
              id: n.id,
              startTick: n.startTick,
              durationTicks: n.durationTicks,
              notes: [n],
            }))
            .sort(
              (a, b) =>
                a.startTick - b.startTick ||
                a.notes[0].midi - b.notes[0].midi ||
                a.id.localeCompare(b.id),
            ),
        }))
      : partitionLanes(snapshot.quantization.notes, key);
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
  if (satb?.omitted)
    warnings.push(
      `사용자 선택에 따라 미분류 음표 ${satb.omitted}개를 제외했습니다.`,
    );
  return {
    ...(satb ? { voiceMode: "satb" as const } : {}),
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
export function exportNwctxt(snapshot: ExportSnapshot, voices?: VoiceExport) {
  const document = buildNwcDocument(snapshot, voices);
  const text = serializeNwc(document);
  const satb = voices ? prepareVoiceExport(snapshot, voices) : null;
  const validation = validateNwctxt(
    text,
    document,
    satb?.snapshot ?? snapshot,
    satb?.map,
  );
  if (!validation.valid)
    throw new Error(
      `NWC 내보내기 검증 실패: ${validation.errors.slice(0, 3).join(" / ")}`,
    );
  return { text, document, report: document.report };
}

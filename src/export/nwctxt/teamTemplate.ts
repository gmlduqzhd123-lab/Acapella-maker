import type { TeamSettings } from "../../creation/team";
import { teamParts } from "../../creation/team.ts";
import { keySignature } from "./keySignature.ts";
import { accidentalPitch } from "./pitch.ts";
import { serializeNwc, parseNwcLine } from "./serializer.ts";
import type { NwcDocument, NwcItem, NwcStaff } from "./types";

/** Empty composition scaffolding, never an arrangement inferred from uploaded audio. */
export function buildTeamTemplate(team: TeamSettings, sample = false): NwcDocument {
  const key = keySignature(null);
  const staffs: NwcStaff[] = teamParts(team).map((part, index) => {
    const percussion = index === 4;
    const clef = index >= 2 ? "Bass" as const : "Treble" as const;
    const measures = Array.from({ length: sample ? 1 : 4 }, (_, bar) => {
      const items: NwcItem[] = sample ? [0, 1, 2, 3].map((beat) => {
        const midi = percussion ? [36, 42, 38, 42][beat] : [72, 64, 55, 43, 0, 60][index];
        return {
          kind: "Note", startTick: beat * 960, durationTicks: 960,
          duration: "4th", pitches: [accidentalPitch(
            `sample-${index}-${beat}`, midi, clef, key, new Map(),
          )], tieFromPrevious: false, tieToNext: false,
          ...(percussion ? { label: ["B", "ts", "K", "ts"][beat] } : {}),
        };
      }) : [{
        kind: "Rest", startTick: bar * 3840, durationTicks: 3840,
        duration: "Whole", pitches: [], tieFromPrevious: false, tieToNext: false,
      }];
      return { number: bar + 1, startTick: bar * 3840, endTick: (bar + 1) * 3840, items };
    });
    return {
      name: `${index + 1}. ${part.name}`, clef, key, measures,
      midiChannel: percussion ? 10 : index + 1,
      instrumentPatch: percussion ? 0 : 52,
      ...(percussion ? { displayClef: "Percussion" as const } : {}),
    };
  });
  return {
    title: `AcaScore ${team.singers}인 ${sample ? "표기 검증 샘플 (음원 분석 결과 아님)" : "빈 팀 악보 (편곡 아님)"}`,
    bpm: 100, tempoBase: "Quarter", timeSignature: "4/4", staffs,
    report: { staff: staffs.length, notes: sample ? staffs.length * 4 : 0,
      measures: sample ? 1 : 4, chords: 0, ties: 0,
      warnings: ["빈 틀/검증 샘플입니다. 업로드한 곡의 편곡이 아닙니다.",
        "B=킥(36), K=스네어(38), ts=하이햇(42). 재생은 GM 드럼이며 사람의 보컬 퍼커션 음성이 아닙니다."] },
  };
}

export function exportTeamTemplate(team: TeamSettings, sample = false) {
  const document = buildTeamTemplate(team, sample);
  const text = serializeNwc(document);
  // Independently parse the public text representation to catch channel/staff regressions.
  const objects = text.split(/\r?\n/).filter(line => line.startsWith("|")).map(parseNwcLine);
  const staffs = objects.filter(o => o.type === "AddStaff");
  const channels = objects.filter(o => o.type === "StaffProperties" && o.props.Channel).map(o => Number(o.props.Channel));
  if (staffs.length !== team.singers || channels.length !== team.singers ||
      channels[4] !== 10 || new Set(channels).size !== team.singers)
    throw new Error("팀 악보 파트/채널 검증 실패");
  return { text, document };
}

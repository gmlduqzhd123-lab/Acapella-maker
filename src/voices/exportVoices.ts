import type { ExportSnapshot } from "../export/snapshot";
import type { VoiceMetadata, Part } from "./types";
import { VOICES } from "./types.ts";
export interface VoiceExport {
  map: Record<string, VoiceMetadata>;
  excludeUnassigned: boolean;
}
export function prepareVoiceExport(
  source: ExportSnapshot,
  voices: VoiceExport,
) {
  const ids = new Set(source.notes.map((n) => n.id));
  if (
    Object.keys(voices.map).length !== ids.size ||
    [...ids].some(
      (id) =>
        !voices.map[id] ||
        ![...VOICES, "unassigned"].includes(voices.map[id].voice),
    )
  )
    throw new Error("성부 분석을 다시 실행해 주세요.");
  const omitted = source.notes.filter(
    (n) => voices.map[n.id].voice === "unassigned",
  );
  if (omitted.length && !voices.excludeUnassigned)
    throw new Error(
      "미분류 음표가 있습니다. 직접 성부를 지정하거나 ‘미분류 음표 제외하고 내보내기’를 명시적으로 선택해 주세요.",
    );
  const snapshot = structuredClone(source);
  snapshot.notes = snapshot.notes.filter(
    (n) => voices.map[n.id].voice !== "unassigned",
  );
  if (!snapshot.notes.length)
    throw new Error("내보낼 SATB 성부 음표가 없습니다.");
  const included = new Set(snapshot.notes.map((n) => n.id));
  snapshot.quantization.notes = snapshot.quantization.notes.filter((n) =>
    included.has(n.id),
  );
  snapshot.quantization.workingNotes =
    snapshot.quantization.workingNotes.filter((n) => included.has(n.id));
  snapshot.quantization.segments = snapshot.quantization.segments.filter((n) =>
    included.has(n.sourceNoteId),
  );
  const groups = VOICES.map((role) => ({
    role,
    notes: snapshot.notes
      .filter((n) => voices.map[n.id].voice === role)
      .sort(
        (a, b) =>
          a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id),
      ),
  })).filter((g) => g.notes.length);
  for (const group of groups)
    for (let i = 1; i < group.notes.length; i++)
      if (
        group.notes[i - 1].start + group.notes[i - 1].duration >
        group.notes[i].start + 1e-8
      )
        throw new Error(
          `${group.role} 성부 안에 겹친 음표가 있습니다. 직접 수정하거나 Draft Voice로 내보내세요.`,
        );
  const normalized: VoiceExport = {
    map: Object.fromEntries(
      snapshot.notes.map((n) => [n.id, { ...voices.map[n.id] }]),
    ),
    excludeUnassigned: false,
  };
  return { snapshot, groups, map: normalized, omitted: omitted.length };
}
export const SATB_CLEFS: Record<Part, "Treble" | "Bass"> = {
  soprano: "Treble",
  alto: "Treble",
  tenor: "Treble",
  bass: "Bass",
};

import type { NoteEvent, MusicalKey } from "../music/types";
import type { QuantizationResult, RhythmSettings } from "../quantization/types";
import { PPQ } from "../quantization/types.ts";
import { sameNotes, sortNotes } from "../editor/noteMath.ts";
import {
  secondsPerQuarter,
  secondsToTicks,
} from "../quantization/timeConversion.ts";

export const STALE_EXPORT =
  "현재 편집 내용에 맞게 박자 정리를 다시 적용해 주세요.";
export interface ExportSnapshot extends Omit<RhythmSettings, "bpm"> {
  title: string;
  bpm: number;
  key: MusicalKey | null;
  ppq: 960;
  notes: NoteEvent[];
  quantization: QuantizationResult;
  durationSeconds: number;
}
export function validateExportSnapshot(snapshot: ExportSnapshot) {
  if (snapshot.ppq !== PPQ || !snapshot.notes.length)
    throw new Error("내보낼 음표가 없습니다.");
  secondsPerQuarter(snapshot);
  for (const field of [
    "bpm",
    "timeSignature",
    "bpmUnit",
    "gridOriginSeconds",
    "resolution",
    "strength",
  ] as const)
    if (snapshot[field] !== snapshot.quantization.settings[field])
      throw new Error(STALE_EXPORT);
  if (
    !Number.isFinite(snapshot.durationSeconds) ||
    snapshot.durationSeconds <= 0 ||
    !Number.isFinite(snapshot.gridOriginSeconds) ||
    snapshot.gridOriginSeconds < 0 ||
    snapshot.gridOriginSeconds > snapshot.durationSeconds
  )
    throw new Error("음원 시간 범위가 올바르지 않습니다.");
  const ids = new Set<string>();
  const musical = new Map(
    snapshot.quantization.notes.map((note) => [note.id, note]),
  );
  if (
    !sameNotes(
      sortNotes(snapshot.notes),
      sortNotes(snapshot.quantization.workingNotes),
    ) ||
    musical.size !== snapshot.notes.length ||
    snapshot.quantization.notes.length !== snapshot.notes.length
  )
    throw new Error(STALE_EXPORT);
  for (const note of snapshot.notes) {
    if (
      ids.has(note.id) ||
      !note.id ||
      !Number.isInteger(note.midi) ||
      note.midi < 0 ||
      note.midi > 127 ||
      !Number.isInteger(note.velocity) ||
      note.velocity < 0 ||
      note.velocity > 127 ||
      !Number.isFinite(note.start) ||
      !Number.isFinite(note.duration) ||
      note.start < 0 ||
      note.duration <= 0 ||
      note.start + note.duration > snapshot.durationSeconds + 1e-8
    )
      throw new Error("음표 ID·음높이·velocity·시간 범위를 확인해 주세요.");
    ids.add(note.id);
    const quantized = musical.get(note.id)!;
    if (
      !quantized ||
      quantized.midi !== note.midi ||
      !Number.isSafeInteger(quantized.startTick) ||
      !Number.isSafeInteger(quantized.durationTicks) ||
      quantized.durationTicks <= 0 ||
      Math.abs(secondsToTicks(note.start, snapshot) - quantized.startTick) >
        1e-5 ||
      Math.abs(
        secondsToTicks(note.start + note.duration, snapshot) -
          quantized.startTick -
          quantized.durationTicks,
      ) > 1e-5
    )
      throw new Error(STALE_EXPORT);
  }
}
export function createExportSnapshot(
  title: string,
  notes: NoteEvent[],
  settings: RhythmSettings,
  key: MusicalKey | null,
  quantization: QuantizationResult | null,
  durationSeconds: number,
): ExportSnapshot {
  if (!quantization || !settings.bpm) throw new Error(STALE_EXPORT);
  const snapshot: ExportSnapshot = structuredClone({
    ...settings,
    bpm: settings.bpm,
    title,
    key,
    ppq: PPQ,
    notes,
    quantization,
    durationSeconds,
  });
  validateExportSnapshot(snapshot);
  return snapshot;
}

import type { NoteEvent } from "../music/types";
import type { NoteMetadata } from "../editor/editorTypes";
import type {
  QuantizedNote,
  QuantizationResult,
  RhythmSettings,
} from "./types";
import { musicalPosition, RESOLUTION_TICKS, snapTick } from "./grid.ts";
import {
  secondsPerQuarter,
  secondsToTicks,
  ticksToSeconds,
} from "./timeConversion.ts";
import { splitNotesAcrossMeasures } from "./measures.ts";
import { detectIssues } from "./issues.ts";
export function quantize(
  notes: NoteEvent[],
  metadata: Record<string, NoteMetadata>,
  settings: RhythmSettings,
  audioDuration: number,
): QuantizationResult {
  const began = performance.now();
  secondsPerQuarter(settings);
  if (
    !Number.isFinite(audioDuration) ||
    audioDuration <= 0 ||
    !Number.isFinite(settings.gridOriginSeconds) ||
    settings.gridOriginSeconds < 0 ||
    settings.gridOriginSeconds > audioDuration
  )
    throw new RangeError("1마디 1박 위치는 음원 범위 안에 있어야 합니다.");
  const grid = RESOLUTION_TICKS[settings.resolution],
    weight = settings.strength === "weak" ? 0.5 : 1;
  const lower = Math.ceil(secondsToTicks(0, settings) - 1e-8),
    upper = Math.floor(secondsToTicks(audioDuration, settings) + 1e-8);
  if (upper <= lower)
    throw new RangeError("음원이 음악 tick 한 개보다 짧습니다.");
  const clampTick = (tick: number, low: number, high: number) =>
    Math.max(low, Math.min(high, tick));
  const musical: QuantizedNote[] = notes.map((note) => {
    if (
      !Number.isFinite(note.start) ||
      !Number.isFinite(note.duration) ||
      note.start < 0 ||
      note.duration <= 0 ||
      note.start + note.duration > audioDuration + 1e-8 ||
      !Number.isInteger(note.midi) ||
      note.midi < 0 ||
      note.midi > 127
    )
      throw new RangeError(
        "유효하지 않은 음표가 있습니다. 시작·길이·음높이를 확인해 주세요.",
      );
    const rawStart = secondsToTicks(note.start, settings),
      rawEnd = secondsToTicks(note.start + note.duration, settings);
    let start = Math.round(
      rawStart + (snapTick(rawStart, settings.resolution) - rawStart) * weight,
    );
    if (rawStart < 0 && start >= 0)
      start = settings.strength === "weak" ? -1 : -grid;
    start = clampTick(start, lower, upper - Math.min(grid, upper - lower));
    let end = Math.round(
      rawEnd + (snapTick(rawEnd, settings.resolution) - rawEnd) * weight,
    );
    end = clampTick(Math.max(start + grid, end), start + 1, upper);
    const startSeconds = Math.max(0, ticksToSeconds(start, settings)),
      endSeconds = Math.min(audioDuration, ticksToSeconds(end, settings));
    return {
      id: note.id,
      midi: note.midi,
      sourceStart: note.start,
      sourceDuration: note.duration,
      startTick: start,
      durationTicks: end - start,
      startSeconds,
      durationSeconds: endSeconds - startSeconds,
      ...musicalPosition(start, settings.timeSignature),
      origin: metadata[note.id]?.origin ?? "ai",
      edited:
        (metadata[note.id]?.edited ?? false) ||
        Math.abs(startSeconds - note.start) > 1e-9 ||
        Math.abs(endSeconds - startSeconds - note.duration) > 1e-9,
      movementMs: Math.abs(startSeconds - note.start) * 1000,
    };
  });
  const issues = detectIssues(musical, settings, audioDuration);
  for (const note of musical)
    if (
      settings.strength !== "weak" &&
      (note.startTick % grid !== 0 ||
        (note.startTick + note.durationTicks) % grid !== 0)
    )
      issues.push({
        kind: "bounds",
        noteIds: [note.id],
        message:
          "음원 시작·끝 경계에서 grid 정렬이 잘렸습니다. 음가를 확인해 주세요.",
      });
  const workingNotes = notes.map((note, index) => ({
    ...note,
    start: musical[index].startSeconds,
    duration: musical[index].durationSeconds,
  }));
  const changed = workingNotes.filter(
    (note, index) =>
      Math.abs(note.start - notes[index].start) > 1e-9 ||
      Math.abs(note.duration - notes[index].duration) > 1e-9,
  ).length;
  return {
    notes: musical,
    workingNotes,
    issues,
    segments: splitNotesAcrossMeasures(musical, settings.timeSignature),
    stats: {
      total: notes.length,
      changed,
      unchanged: notes.length - changed,
      averageMovementMs:
        musical.reduce((sum, note) => sum + note.movementMs, 0) /
        (notes.length || 1),
      maxMovementMs: musical.reduce(
        (max, note) => Math.max(max, note.movementMs),
        0,
      ),
      reviewNotes: new Set(issues.flatMap((issue) => issue.noteIds)).size,
      shortNotes: new Set(
        issues
          .filter((issue) => issue.kind === "short")
          .flatMap((issue) => issue.noteIds),
      ).size,
      overlappingNotes: new Set(
        issues
          .filter((issue) => issue.kind === "overlap")
          .flatMap((issue) => issue.noteIds),
      ).size,
      calculationMs: performance.now() - began,
    },
  };
}

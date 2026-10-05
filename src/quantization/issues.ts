import type { QuantizedNote, QuantizationIssue, RhythmSettings } from "./types";
import { measureTicks, RESOLUTION_TICKS } from "./grid.ts";
import { secondsPerQuarter, secondsToTicks } from "./timeConversion.ts";
export function detectIssues(
  notes: QuantizedNote[],
  settings: RhythmSettings,
  audioDuration: number,
): QuantizationIssue[] {
  const issues: QuantizationIssue[] = [],
    grid = RESOLUTION_TICKS[settings.resolution],
    gridSeconds = (grid / 960) * secondsPerQuarter(settings),
    measure = measureTicks(settings.timeSignature);
  const byPitch = new Map<number, QuantizedNote[]>(),
    onsets = new Map<number, string[]>();
  for (const note of notes) {
    if (note.durationTicks <= 0)
      issues.push({
        kind: "zeroDuration",
        noteIds: [note.id],
        message: "길이가 0인 음표입니다.",
      });
    if (
      note.startSeconds < -1e-8 ||
      note.startSeconds + note.durationSeconds > audioDuration + 1e-8 ||
      note.durationTicks < grid
    )
      issues.push({
        kind: "bounds",
        noteIds: [note.id],
        message: "음원 경계 때문에 최소 음가 또는 grid 정렬을 확인해 주세요.",
      });
    if (note.sourceDuration < gridSeconds / 2)
      issues.push({
        kind: "short",
        noteIds: [note.id],
        message: "매우 짧은 음표입니다. 직접 듣고 확인해 주세요.",
        deletionCandidate:
          settings.strength === "strong" && note.origin === "ai",
      });
    const raw = secondsToTicks(note.sourceStart, settings),
      within = ((raw % measure) + measure) % measure;
    if (
      Math.min(within, measure - within) < grid * 0.2 &&
      Math.abs(raw - note.startTick) > 1
    )
      issues.push({
        kind: "barline",
        noteIds: [note.id],
        message: "마디선 근처의 시작 위치를 확인해 주세요.",
      });
    const pitch = byPitch.get(note.midi) ?? [];
    pitch.push(note);
    byPitch.set(note.midi, pitch);
    const key = Math.round(note.startTick / grid),
      onset = onsets.get(key) ?? [];
    onset.push(note.id);
    onsets.set(key, onset);
  }
  for (const [midi, values] of byPitch) {
    values.sort((a, b) => a.startTick - b.startTick);
    let active: QuantizedNote | undefined;
    const ids = new Set<string>();
    for (const note of values) {
      if (active && note.startTick < active.startTick + active.durationTicks) {
        ids.add(active.id);
        ids.add(note.id);
      }
      if (
        !active ||
        note.startTick + note.durationTicks >
          active.startTick + active.durationTicks
      )
        active = note;
    }
    if (ids.size)
      issues.push({
        kind: "overlap",
        noteIds: [...ids],
        message: `MIDI ${midi} 음표 ${ids.size}개가 같은 시간에 겹칩니다.`,
      });
  }
  for (const ids of onsets.values())
    if (ids.length > 8)
      issues.push({
        kind: "crowded",
        noteIds: ids,
        message: `한 grid에 ${ids.length}개 시작점이 몰려 있습니다.`,
      });
  return issues;
}

import type { NoteEvent, MusicalKey } from "../src/music/types";
import type { RhythmSettings } from "../src/quantization/types";
import { quantize } from "../src/quantization/quantize.ts";
import { createExportSnapshot } from "../src/export/snapshot.ts";
export const exportSettings: RhythmSettings = {
  bpm: 120,
  timeSignature: "4/4",
  bpmUnit: "quarter",
  gridOriginSeconds: 0,
  resolution: "sixteenth",
  strength: "standard",
};
export function exportNote(
  id = "bp-000001",
  start = 0.25,
  duration = 0.5,
  midi = 60,
  velocity = 100,
): NoteEvent {
  return { id, start, duration, midi, velocity, confidence: 0.8 };
}
export function fixtureSnapshot(
  notes = [exportNote()],
  settings: RhythmSettings = exportSettings,
  key: MusicalKey | null = { tonic: 0, mode: "major", confidence: 1 },
  duration = 10,
) {
  const quantization = quantize(notes, {}, settings, duration);
  return createExportSnapshot(
    '테스트 "곡" | \\ title',
    quantization.workingNotes,
    settings,
    key,
    quantization,
    duration,
  );
}

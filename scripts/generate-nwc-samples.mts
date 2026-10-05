import { mkdir, writeFile } from "node:fs/promises";
import { quantize } from "../src/quantization/quantize.ts";
import { createExportSnapshot } from "../src/export/snapshot.ts";
import { exportNwctxt } from "../src/export/nwctxt/exporter.ts";
import { ticksToSeconds } from "../src/quantization/timeConversion.ts";
import type {
  RhythmSettings,
  TimeSignatureName,
} from "../src/quantization/types.ts";
import type { NoteEvent } from "../src/music/types.ts";

// Explicit synthetic acceptance scores, never substituted for analysis results.
await mkdir("public/examples", { recursive: true });
for (const timeSignature of ["4/4", "3/4", "6/8"] as TimeSignatureName[]) {
  const settings: RhythmSettings = {
    bpm: 120,
    timeSignature,
    bpmUnit: timeSignature === "6/8" ? "dottedQuarter" : "quarter",
    gridOriginSeconds: 0.5,
    resolution: "thirtySecond",
    strength: "standard",
  };
  const notes: NoteEvent[] = [];
  const add = (midi: number, tick: number, length: number) =>
    notes.push({
      id: `sample-${notes.length + 1}`,
      midi,
      start: ticksToSeconds(tick, settings),
      duration:
        ticksToSeconds(tick + length, settings) -
        ticksToSeconds(tick, settings),
      velocity: 90,
      confidence: 1,
    });
  add(48, -480, 480); // pickup bass eighth
  add(48, 0, 19200); // sustained bass keeps a Bass-clef lane through all examples
  [60, 62, 64, 65, 67, 69, 71, 72].forEach((midi, i) =>
    add(midi, i * 960, 960),
  );
  add(64, 0, 960);
  add(67, 0, 960); // C major chord
  add(61, 8160, 240);
  add(61, 8400, 240);
  add(60, 8640, 240); // repeated sharp then natural
  add(63, 9120, 720);
  add(64, 10080, 360); // dotted eighth / sixteenth, rests
  add(67, 11040, 5760);
  add(72, 11040, 5760); // long chord, decomposition + bar ties
  const duration = ticksToSeconds(19200, settings);
  const q = quantize(notes, {}, settings, duration);
  const snapshot = createExportSnapshot(
    `AcaScore NWC ${timeSignature} 검증 "음계"`,
    q.workingNotes,
    settings,
    { tonic: 0, mode: "major", confidence: 1 },
    q,
    duration,
  );
  const result = exportNwctxt(snapshot);
  const file = `public/examples/acascore-nwc-test-${timeSignature.replace("/", "-")}.nwctxt`;
  await writeFile(file, result.text, "utf8");
  console.log(JSON.stringify({ file, report: result.report }));
}

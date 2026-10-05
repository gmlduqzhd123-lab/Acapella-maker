import { test } from "node:test";
import assert from "node:assert/strict";
import MidiPackage from "@tonejs/midi";
import { assignVoices } from "../src/voices/assignVoices.ts";
import { harmonicClusters } from "../src/voices/clusters.ts";
import { DEFAULT_RANGES, validateRanges } from "../src/voices/ranges.ts";
import { assignmentCost, leapPenalty, totalCost } from "../src/voices/cost.ts";
import { buildVoiceResult } from "../src/voices/statistics.ts";
import { prepareVoiceExport } from "../src/voices/exportVoices.ts";
import { VOICES } from "../src/voices/types.ts";
import type { AssignmentInput, VoiceMetadata } from "../src/voices/types";
import { quantize } from "../src/quantization/quantize.ts";
import {
  exportSettings,
  fixtureSnapshot,
  exportNote,
} from "./exportFixtures.ts";
import { exportMidi } from "../src/export/midiExporter.ts";
import { exportNwctxt } from "../src/export/nwctxt/exporter.ts";
import { satbNotes, assignmentAccuracy } from "./voiceSignals.ts";
import type { NoteEvent } from "../src/music/types";
function input(
  notes: NoteEvent[],
  manual: Record<string, VoiceMetadata> = {},
): AssignmentInput {
  const q = quantize(
    notes,
    {},
    exportSettings,
    Math.max(10, ...notes.map((n) => n.start + n.duration + 1)),
  );
  return {
    notes: q.workingNotes,
    quantized: q.notes,
    settings: exportSettings,
    ranges: structuredClone(DEFAULT_RANGES),
    manual,
  };
}
test("bounded beam clean4-bar SATB: ID/time/pitch immutable and expected musical tracks", () => {
  const truth = satbNotes(),
    data = input(truth),
    copy = structuredClone(data),
    result = assignVoices(data);
  assert.deepEqual(data, copy);
  const map = new Map(result.assignments.map((a) => [a.noteId, a.voice]));
  const accuracy = assignmentAccuracy(
    data.notes.map((n) => ({ ...n, voice: map.get(n.id)! })),
    truth,
  );
  console.log(
    JSON.stringify({ syntheticSatbUnit: accuracy, stats: result.stats }),
  );
  assert.ok(accuracy.accuracy >= 0.85);
  assert.equal(result.assignments.length, 32);
  assert.equal(result.issues.filter((i) => i.kind === "overlap").length, 0);
  assert.ok(result.stats.peakCandidates <= 64);
  assert.equal(result.stats.beamWidth, 32);
  assert.deepEqual(
    assignVoices({ ...data, notes: [...data.notes].reverse() }).assignments,
    result.assignments,
  );
});
test("monophonic melody keeps one voice without hard Soprano rule; configurable soft ranges", () => {
  const data = input(
    [60, 62, 64, 65, 67].map((midi, i) => exportNote(`m${i}`, i, 0.75, midi)),
  );
  const result = assignVoices(data);
  assert.equal(new Set(result.assignments.map((a) => a.voice)).size, 1);
  assert.notEqual(result.assignments[0].voice, "unassigned");
  data.ranges = {
    soprano: { low: 80, high: 84 },
    alto: { low: 80, high: 84 },
    tenor: { low: 55, high: 72 },
    bass: { low: 30, high: 40 },
  };
  assert.ok(assignVoices(data).assignments.every((a) => a.voice === "tenor"));
  const cost = assignmentCost(
    exportNote("out", 0, 1, 85),
    "soprano",
    [null, null, null, null],
    DEFAULT_RANGES,
    [],
  );
  assert.ok(Number.isFinite(totalCost(cost)));
  assert.ok(cost.range > 0);
  assert.throws(() =>
    validateRanges({ ...DEFAULT_RANGES, alto: { low: 77, high: 50 } }),
  );
});
test("smooth temporary Alto/Tenor crossing preserves motion rather than swapping pitch ranks", () => {
  const lines = {
    soprano: [72, 72, 72],
    alto: [65, 64, 63],
    tenor: [60, 62, 64],
    bass: [48, 48, 48],
  };
  const data = input(
    VOICES.flatMap((v) =>
      lines[v].map((midi, i) => exportNote(`${v}${i}`, i, 0.75, midi)),
    ),
  );
  const result = assignVoices(data),
    map = new Map(result.assignments.map((a) => [a.noteId, a.voice]));
  assert.equal(map.get("alto2"), "alto");
  assert.equal(map.get("tenor2"), "tenor");
  assert.ok(result.issues.some((i) => i.kind === "crossing"));
});
test("leaps decay with rest, nearest continuation preferred, sustain blocks reused active part", () => {
  assert.ok(leapPenalty(12, 0.05) > leapPenalty(12, 5));
  assert.ok(leapPenalty(2, 0) < leapPenalty(11, 0));
  const data = input([
    exportNote("held", 0, 3, 60),
    exportNote("other", 1, 0.5, 64),
  ]);
  const result = assignVoices(data);
  assert.notEqual(
    result.assignments.find((a) => a.noteId === "held")!.voice,
    result.assignments.find((a) => a.noteId === "other")!.voice,
  );
  const rest = input([
    exportNote("a", 0, 0.5, 48),
    exportNote("b", 5, 0.5, 48),
  ]);
  assert.equal(
    assignVoices(rest).assignments[0].voice,
    assignVoices(rest).assignments[1].voice,
  );
});
test("ticks group nearby onsets; five-note noise retained as unassigned; extreme pitch not deleted", () => {
  const notes = [48, 60, 64, 67].map((midi, i) =>
    exportNote(`c${i}`, 0, 0.75, midi),
  );
  notes.push({ ...exportNote("noise", 0, 0.75, 100), confidence: 0.02 });
  const data = input(notes),
    result = assignVoices(data);
  assert.equal(
    result.assignments.find((a) => a.noteId === "noise")!.voice,
    "unassigned",
  );
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.stats.total, 5);
  assert.ok(
    result.assignments.every(
      (a) =>
        a.confidence !== null &&
        Number.isFinite(a.confidence) &&
        a.confidence >= 0 &&
        a.confidence <= 1,
    ),
  );
  const grouped = {
    ...data,
    quantized: data.quantized.map((n, i) => ({ ...n, startTick: i * 10 })),
  };
  assert.equal(harmonicClusters(grouped).length, 1);
  assert.equal(
    assignVoices(input([exportNote("extreme", 0, 1, 127)])).unassigned.length,
    1,
  );
});
test("manual constraints survive beam, reserve sustained intervals, expose conflicts and null confidence", () => {
  const notes = [exportNote("manual", 1, 2, 60), exportNote("early", 0, 2, 62)];
  const data = input(notes, {
      manual: { voice: "alto", origin: "manual", confidence: null },
    }),
    result = assignVoices(data);
  assert.equal(
    result.assignments.find((a) => a.noteId === "manual")!.voice,
    "alto",
  );
  assert.equal(
    result.assignments.find((a) => a.noteId === "manual")!.confidence,
    null,
  );
  assert.notEqual(
    result.assignments.find((a) => a.noteId === "early")!.voice,
    "alto",
  );
  data.manual!.early = { voice: "alto", origin: "manual", confidence: null };
  assert.ok(assignVoices(data).issues.some((i) => i.kind === "overlap"));
});
test("SATB MIDI names/channels and NWCTXT names/clefs; explicit unassigned exclusion and Draft fallback", () => {
  const notes = VOICES.map((v, i) => exportNote(v, 0, 1, [72, 64, 60, 48][i]));
  notes.push(exportNote("noise", 0, 1, 100));
  const snapshot = fixtureSnapshot(notes),
    map = Object.fromEntries(
      notes.map((n) => [
        n.id,
        {
          voice: n.id === "noise" ? "unassigned" : n.id,
          origin: "manual",
          confidence: null,
        },
      ]),
    ) as Record<string, VoiceMetadata>;
  assert.throws(
    () => exportMidi(snapshot, { map, excludeUnassigned: false }),
    /미분류/,
  );
  const voices = { map, excludeUnassigned: true },
    midi = new MidiPackage.Midi(exportMidi(snapshot, voices));
  assert.deepEqual(
    midi.tracks.map((t) => t.name),
    ["Soprano", "Alto", "Tenor", "Bass"],
  );
  assert.equal(new Set(midi.tracks.map((t) => t.channel)).size, 4);
  assert.equal(midi.tracks.flatMap((t) => t.notes).length, 4);
  const nwc = exportNwctxt(snapshot, voices);
  assert.deepEqual(
    nwc.document.staffs.map((s) => [s.name, s.clef]),
    [
      ["Soprano", "Treble"],
      ["Alto", "Treble"],
      ["Tenor", "Treble"],
      ["Bass", "Bass"],
    ],
  );
  assert.ok(!nwc.text.includes("Draft Voice"));
  assert.ok(nwc.report.warnings.some((w) => w.includes("미분류")));
  assert.ok(exportNwctxt(snapshot).text.includes("Draft Voice"));
  assert.equal(
    new MidiPackage.Midi(exportMidi(snapshot)).tracks.flatMap((t) => t.notes)
      .length,
    5,
  );
  const overlap = fixtureSnapshot([
    exportNote("a", 0, 2),
    exportNote("b", 1, 1),
  ]);
  assert.throws(
    () =>
      prepareVoiceExport(overlap, {
        map: {
          a: { voice: "alto", origin: "manual", confidence: null },
          b: { voice: "alto", origin: "manual", confidence: null },
        },
        excludeUnassigned: false,
      }),
    /겹친/,
  );
  assert.throws(
    () => prepareVoiceExport(snapshot, { map: {}, excludeUnassigned: true }),
    /다시 실행/,
  );
});
test("2000-note bounded beam performance, no ID loss; warnings and summary recompute after manual change", () => {
  const data = input(satbNotes(63).slice(0, 2000)),
    result = assignVoices(data);
  console.log(
    JSON.stringify({ voicePerformance: true, notes: 2000, ...result.stats }),
  );
  assert.equal(result.stats.total, 2000);
  assert.ok(result.stats.calculationMs < 10000);
  assert.ok(result.stats.peakCandidates <= 64);
  assert.equal(result.assignments.length, 2000);
  const assignments = result.assignments.map((a, i) =>
    i === 0
      ? {
          ...a,
          voice: "unassigned" as const,
          origin: "manual" as const,
          confidence: null,
        }
      : a,
  );
  const changed = buildVoiceResult(
    data.notes,
    assignments,
    DEFAULT_RANGES,
    result.stats,
  );
  assert.equal(
    changed.stats.counts.unassigned,
    result.stats.counts.unassigned + 1,
  );
});

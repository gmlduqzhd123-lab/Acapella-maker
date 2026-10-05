import { test } from "node:test";
import assert from "node:assert/strict";
import { PPQ } from "../src/quantization/types.ts";
import type { RhythmSettings } from "../src/quantization/types";
import {
  secondsPerQuarter,
  secondsToTicks,
  ticksToSeconds,
} from "../src/quantization/timeConversion.ts";
import {
  measureTicks,
  musicalPosition,
  snapTick,
  visibleGridMarks,
} from "../src/quantization/grid.ts";
import { quantize } from "../src/quantization/quantize.ts";
import { ticksToDurationName } from "../src/quantization/duration.ts";
import {
  splitNotesAcrossMeasures,
  findGaps,
} from "../src/quantization/measures.ts";
import { snapEditingNote } from "../src/quantization/snapEdit.ts";
import { editorReducer, initializeEditor } from "../src/editor/noteHistory.ts";
const settings: RhythmSettings = {
  bpm: 120,
  timeSignature: "4/4",
  bpmUnit: "quarter",
  gridOriginSeconds: 0,
  resolution: "sixteenth",
  strength: "standard",
};
const note = (
  id = "bp-000001",
  start = 1.237,
  duration = 0.447,
  midi = 60,
) => ({ id, start, duration, midi, confidence: 0.82, velocity: 104 });
test("PPQ 960; 120/60/180 BPM seconds/tick conversions and signed pickup round trip", () => {
  assert.equal(PPQ, 960);
  assert.equal(secondsToTicks(0.5, settings), 960);
  assert.equal(secondsToTicks(0.25, settings), 480);
  assert.equal(secondsToTicks(0.125, settings), 240);
  assert.equal(secondsToTicks(1, { ...settings, bpm: 60 }), 960);
  for (const value of [-1.27, 0, 0.125, 0.987, 200.5]) {
    const rhythm = { ...settings, bpm: 180, gridOriginSeconds: 1.12 };
    assert.ok(
      Math.abs(ticksToSeconds(secondsToTicks(value, rhythm), rhythm) - value) <
        1e-10,
    );
  }
  assert.throws(() => secondsPerQuarter({ ...settings, bpm: null }), /BPM/);
});
test("4/4, 3/4, 6/8 measure mapping, six eighth beats and dotted-quarter BPM interpretation", () => {
  assert.equal(measureTicks("4/4"), 3840);
  assert.equal(measureTicks("3/4"), 2880);
  assert.equal(measureTicks("6/8"), 2880);
  assert.equal(musicalPosition(3840, "4/4").measure, 2);
  assert.equal(musicalPosition(2400, "6/8").beat, 6);
  assert.equal(musicalPosition(-480, "6/8").measure, 0);
  const six = {
    ...settings,
    timeSignature: "6/8" as const,
    bpm: 60,
    bpmUnit: "dottedQuarter" as const,
  };
  assert.equal(secondsToTicks(1, six), 1440);
  assert.equal(ticksToSeconds(2880, six), 2);
  assert.equal(secondsToTicks(1, { ...six, bpmUnit: "quarter" }), 960);
});
test("all resolutions snap both start and end; minimum one grid, weak 50%, strong proposes without deletion", () => {
  const source = [note()];
  const copy = structuredClone(source);
  for (const [resolution, grid] of [
    ["quarter", 960],
    ["eighth", 480],
    ["sixteenth", 240],
    ["thirtySecond", 120],
  ] as const) {
    const result = quantize(source, {}, { ...settings, resolution }, 10)
      .notes[0];
    assert.equal(result.startTick % grid, 0);
    assert.equal((result.startTick + result.durationTicks) % grid, 0);
    assert.ok(result.durationTicks >= grid);
  }
  const result = quantize(source, {}, settings, 10).notes[0];
  assert.equal(result.startSeconds, 1.25);
  assert.equal(result.durationTicks, 720);
  assert.equal(result.durationSeconds, 0.375);
  const weak = quantize(source, {}, { ...settings, strength: "weak" }, 10)
    .notes[0];
  assert.ok(Math.abs(weak.startSeconds - (1.237 + 1.25) / 2) < 0.0003);
  const strong = quantize(
    [note("short", 1.01, 0.02)],
    {},
    { ...settings, strength: "strong" },
    10,
  );
  assert.equal(strong.notes.length, 1);
  assert.ok(strong.issues.some((issue) => issue.deletionCandidate));
  assert.equal(strong.notes[0].durationTicks, 240);
  assert.deepEqual(source, copy);
});
test("pickup survives, including near-zero snapping; actual audio bounds remain valid and report clipping", () => {
  const rhythm = { ...settings, gridOriginSeconds: 1 };
  const result = quantize(
    [note("pickup", 0.5, 0.3), note("latePickup", 0.99, 0.02)],
    {},
    rhythm,
    10,
  );
  assert.equal(result.notes.length, 2);
  assert.ok(result.notes.every((note) => note.pickup));
  assert.equal(result.notes[0].measure, 0);
  const end = quantize([note("end", 0.31, 0.03)], {}, settings, 0.34);
  assert.ok(end.workingNotes[0].start >= 0);
  assert.ok(end.workingNotes[0].start + end.workingNotes[0].duration <= 0.34);
  assert.ok(end.issues.some((issue) => issue.kind === "bounds"));
  assert.throws(() => quantize([note("zero", 0, 0)], {}, settings, 10), /음표/);
});
test("duration names include whole/half/quarter/eighth/sixteenth/32nd and dotted values; arbitrary weak length custom", () => {
  for (const [ticks, name] of [
    [3840, "whole"],
    [1920, "half"],
    [960, "quarter"],
    [480, "eighth"],
    [240, "sixteenth"],
    [120, "thirtySecond"],
    [2880, "dottedHalf"],
    [1440, "dottedQuarter"],
    [720, "dottedEighth"],
    [241, "custom"],
  ] as const)
    assert.equal(ticksToDurationName(ticks), name);
});
test("tie splits measures without cutting working notes; pickup ties, no zero-length segments", () => {
  const notes = [{ id: "tie", startTick: 3360, durationTicks: 960 }];
  const segments = splitNotesAcrossMeasures(notes, "4/4");
  assert.deepEqual(
    segments.map((segment) => [
      segment.measure,
      segment.durationTicks,
      segment.tieFromPrevious,
      segment.tieToNext,
    ]),
    [
      [1, 480, false, true],
      [2, 480, true, false],
    ],
  );
  assert.equal(notes.length, 1);
  assert.equal(notes[0].durationTicks, 960);
  assert.deepEqual(
    splitNotesAcrossMeasures(
      [{ id: "pickup", startTick: -240, durationTicks: 480 }],
      "3/4",
    ).map((segment) => segment.measure),
    [0, 1],
  );
  assert.equal(
    splitNotesAcrossMeasures(
      [{ id: "bar", startTick: 3840, durationTicks: 960 }],
      "4/4",
    ).length,
    1,
  );
});
test("polyphonic onset aligns without merging; same-pitch overlap/crowding warns without removal; gaps refuse polyphony", () => {
  const chord = [
    note("c", 1.239, 0.5, 60),
    note("e", 1.241, 0.5, 64),
    note("g", 1.242, 0.5, 67),
  ];
  const result = quantize(chord, {}, settings, 10);
  assert.equal(new Set(result.notes.map((note) => note.startTick)).size, 1);
  assert.equal(result.notes.length, 3);
  assert.equal(result.stats.overlappingNotes, 0);
  const overlap = quantize(
    [note("a", 1, 0.5), note("b", 1.1, 0.5)],
    {},
    settings,
    10,
  );
  assert.equal(overlap.stats.overlappingNotes, 2);
  assert.equal(overlap.notes.length, 2);
  const crowded = quantize(
    Array.from({ length: 10 }, (_, index) =>
      note(`n-${index}`, 1, 0.5, 60 + index),
    ),
    {},
    settings,
    10,
  );
  assert.ok(crowded.issues.some((issue) => issue.kind === "crowded"));
  assert.throws(() => findGaps(result.notes, 0, 3840), /단일 성부/);
  assert.deepEqual(
    findGaps([{ startTick: 960, durationTicks: 960 }], 0, 3840),
    [
      { startTick: 0, durationTicks: 960 },
      { startTick: 1920, durationTicks: 1920 },
    ],
  );
});
test("bulk quantization is one undo; redo/activation/manual metadata and AI original remain exact", () => {
  const source = [note(), note("bp-000002", 2.31, 0.7, 64)];
  const copy = structuredClone(source);
  let state = initializeEditor(source);
  state = editorReducer(state, {
    type: "add",
    start: 3.31,
    midi: 67,
    duration: 10,
  });
  const before = structuredClone(state),
    result = quantize(state.notes, state.metadata, settings, 10);
  state = editorReducer(state, {
    type: "replaceNotes",
    notes: result.workingNotes,
    duration: 10,
  });
  assert.equal(state.past.length, before.past.length + 1);
  assert.equal(state.metadata["manual-000001"].origin, "manual");
  const applied = structuredClone(state.notes);
  state = editorReducer(state, { type: "undo" });
  assert.deepEqual(state.notes, before.notes);
  assert.deepEqual(state.metadata, before.metadata);
  state = editorReducer(state, { type: "redo" });
  assert.deepEqual(state.notes, applied);
  assert.deepEqual(source, copy);
  const invalid = editorReducer(state, {
    type: "replaceNotes",
    notes: [note("unknown")],
    duration: 10,
  });
  assert.equal(invalid, state);
});
test("snap is independent from existing notes: body start, both resize edges, all grids", () => {
  const source = note();
  for (const resolution of [
    "quarter",
    "eighth",
    "sixteenth",
    "thirtySecond",
  ] as const) {
    const result = snapEditingNote(
      { ...source, start: 1.31 },
      source,
      undefined,
      settings,
      resolution,
      10,
    );
    assert.ok(
      Math.abs(
        secondsToTicks(result.start, settings) -
          snapTick(secondsToTicks(1.31, settings), resolution),
      ) < 1e-8,
    );
    assert.equal(result.duration, source.duration);
  }
  assert.equal(
    snapEditingNote(
      { ...source, duration: 0.6 },
      source,
      "right",
      settings,
      "sixteenth",
      10,
    ).start,
    source.start,
  );
  assert.ok(
    Math.abs(
      snapEditingNote(
        { ...source, start: 1.3 },
        source,
        "left",
        settings,
        "sixteenth",
        10,
      ).start - 1.25,
    ) < 1e-8,
  );
  assert.equal(source.start, 1.237);
});
test("2000/10000 note pure preview timing and bounded viewport marks, no dropped notes", () => {
  for (const count of [2000, 10000]) {
    const source = Array.from({ length: count }, (_, index) =>
      note(`n-${index}`, index * 0.025, 0.07, 48 + (index % 36)),
    );
    const result = quantize(source, {}, settings, count * 0.025 + 1);
    assert.equal(result.notes.length, count);
    assert.ok(result.stats.calculationMs < 2000);
    console.log(
      JSON.stringify({
        quantizationPerformance: true,
        notes: count,
        calculationMs: result.stats.calculationMs,
      }),
    );
  }
  assert.ok(visibleGridMarks(0, 600, 0.1, settings).length <= 402);
});

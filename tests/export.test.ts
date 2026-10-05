import { test } from "node:test";
import assert from "node:assert/strict";
import MidiPackage from "@tonejs/midi";
import { exportMidi } from "../src/export/midiExporter.ts";
import {
  createExportSnapshot,
  validateExportSnapshot,
} from "../src/export/snapshot.ts";
import { exportFilename, exportTitle } from "../src/export/filename.ts";
import { exportNwctxt } from "../src/export/nwctxt/exporter.ts";
import { validateNwctxt } from "../src/export/nwctxt/validator.ts";
import { partitionLanes } from "../src/export/nwctxt/lanes.ts";
import {
  keySignature,
  KEY_MAPPING,
} from "../src/export/nwctxt/keySignature.ts";
import {
  pitchPosition,
  spellPitch,
  positionToMidi,
} from "../src/export/nwctxt/pitch.ts";
import {
  decomposeDuration,
  DURATION_TOKENS,
} from "../src/export/nwctxt/durations.ts";
import { parseNwcLine, quoteNwcText } from "../src/export/nwctxt/serializer.ts";
import { quantize } from "../src/quantization/quantize.ts";
import {
  exportSettings,
  fixtureSnapshot,
  exportNote,
} from "./exportFixtures.ts";
const { Midi } = MidiPackage;

test("ExportSnapshot deep clone uses WorkingNotes, requires exact current tick data; invalid/stale notes and settings rejected", () => {
  const notes = [exportNote()],
    q = quantize(notes, {}, exportSettings, 10);
  const edited = q.workingNotes.map((note) => ({ ...note, midi: 62 }));
  assert.throws(
    () => createExportSnapshot("x", edited, exportSettings, null, q, 10),
    /다시 적용/,
  );
  const snapshot = createExportSnapshot(
    "x",
    q.workingNotes,
    exportSettings,
    null,
    q,
    10,
  );
  const clone = structuredClone(snapshot);
  notes[0].midi = 72;
  q.workingNotes[0].midi = 73;
  assert.deepEqual(snapshot, clone);
  for (const patch of [
    { bpm: 111 },
    { timeSignature: "3/4" },
    { bpmUnit: "dottedQuarter" },
    { resolution: "eighth" },
    { strength: "strong" },
    { gridOriginSeconds: 0.1 },
  ]) {
    assert.throws(
      () =>
        validateExportSnapshot({ ...snapshot, ...patch } as typeof snapshot),
      /다시 적용/,
    );
  }
  assert.throws(
    () =>
      createExportSnapshot(
        "x",
        edited,
        { ...exportSettings, bpm: null },
        null,
        null,
        10,
      ),
    /다시 적용/,
  );
  for (const velocity of [-1, 128, 1.5])
    assert.throws(
      () => fixtureSnapshot([exportNote("x", 0, 1, 60, velocity)]),
      /velocity/,
    );
});
test("MIDI real MThd, PPQ960, effective tempo, all time signatures and absolute pickup timing round trip", () => {
  for (const [timeSignature, bpmUnit, bpm] of [
    ["4/4", "quarter", 120],
    ["3/4", "quarter", 90],
    ["6/8", "quarter", 120],
    ["6/8", "dottedQuarter", 120],
  ] as const) {
    const settings = {
      ...exportSettings,
      timeSignature,
      bpmUnit,
      bpm,
      gridOriginSeconds: 1,
    };
    const snapshot = fixtureSnapshot(
      [
        exportNote("first", 0.5, 0.5, 60, 1),
        exportNote("second", 2, 0.5, 72, 127),
      ],
      settings,
    );
    const bytes = exportMidi(snapshot),
      midi = new Midi(bytes);
    assert.equal(Buffer.from(bytes.slice(0, 4)).toString("ascii"), "MThd");
    assert.equal(midi.header.ppq, 960);
    assert.ok(
      Math.abs(
        midi.header.tempos[0].bpm -
          (bpmUnit === "dottedQuarter" ? bpm * 1.5 : bpm),
      ) < 0.001,
    );
    assert.deepEqual(
      midi.header.timeSignatures[0].timeSignature,
      timeSignature.split("/").map(Number),
    );
    const notes = midi.tracks
      .flatMap((track) => track.notes)
      .sort((a, b) => a.time - b.time);
    assert.equal(notes.length, snapshot.notes.length);
    notes.forEach((note, index) => {
      const source = snapshot.notes[index];
      assert.equal(note.midi, source.midi);
      assert.equal(Math.round(note.velocity * 127), source.velocity);
      assert.ok(Math.abs(note.time - source.start) < 0.001);
      assert.ok(Math.abs(note.duration - source.duration) < 0.001);
      assert.ok(note.time >= 0);
    });
    assert.ok(snapshot.quantization.notes[0].startTick < 0);
  }
});
test("MIDI all positive velocities preserved, range limits, submillisecond long 6/8 timing, same-pitch crossing overlaps separated", () => {
  const notes = Array.from({ length: 127 }, (_, i) =>
    exportNote(`n-${i}`, i * 0.125, 0.125, 60, i + 1),
  );
  const midi = new Midi(
    exportMidi(fixtureSnapshot(notes, exportSettings, null, 20)),
  );
  assert.deepEqual(
    midi.tracks
      .flatMap((track) => track.notes)
      .map((note) => Math.round(note.velocity * 127)),
    notes.map((note) => note.velocity),
  );
  assert.throws(
    () => exportMidi(fixtureSnapshot([exportNote("x", 0, 1, 60, 0)])),
    /velocity가 0/,
  );
  const crossed = fixtureSnapshot([
    exportNote("long", 0, 3),
    exportNote("short", 1, 1),
  ]);
  const parsed = new Midi(exportMidi(crossed));
  assert.equal(parsed.tracks.length, 2);
  assert.deepEqual(
    parsed.tracks
      .flatMap((track) => track.notes)
      .map((note) => [note.time, note.duration]),
    [
      [0, 3],
      [1, 1],
    ],
  );
  const long = fixtureSnapshot(
    [exportNote("long", 590, 8, 127)],
    { ...exportSettings, timeSignature: "6/8", bpmUnit: "dottedQuarter" },
    null,
    600,
  );
  const result = new Midi(exportMidi(long)).tracks[0].notes[0];
  assert.ok(Math.abs(result.time - long.notes[0].start) < 0.001);
  assert.ok(Math.abs(result.duration - long.notes[0].duration) < 0.001);
  assert.throws(
    () =>
      exportMidi(
        fixtureSnapshot(
          Array.from({ length: 16 }, (_, i) => exportNote(`n${i}`, 0, 1)),
        ),
      ),
    /채널 한도/,
  );
});
test("portable filenames and NWC quoted UTF8 title with quote, backslash, pipe and newline cannot inject objects", () => {
  assert.equal(exportTitle("Dynamite.MP3"), "Dynamite");
  assert.equal(exportFilename("A:B|C?*. ", "mid"), "ABC.mid");
  assert.equal(exportFilename("CON", "nwctxt"), "_CON.nwctxt");
  assert.equal(exportFilename("..", "mid"), "AcaScore.mid");
  const title = '한글 "x" | \\ test\n|AddStaff|Name:"injected"';
  assert.equal(
    parseNwcLine(`|SongInfo|Title:${quoteNwcText(title)}`).props.Title,
    title,
  );
  const snapshot = fixtureSnapshot();
  snapshot.title = title;
  const result = exportNwctxt(snapshot);
  assert.equal(
    result.text.split("\n").filter((line) => line.startsWith("|AddStaff"))
      .length,
    1,
  );
  assert.equal(Buffer.from(result.text, "utf8").toString("utf8"), result.text);
});
test("all24 explicit major/minor signatures and key-aware enharmonic spelling, known Treble/Bass positions", () => {
  assert.equal(KEY_MAPPING.major.length, 12);
  assert.equal(KEY_MAPPING.minor.length, 12);
  const major = (tonic: number) =>
    keySignature({ tonic, mode: "major", confidence: 1 });
  assert.equal(major(2).signature, "F#,C#");
  assert.equal(major(3).signature, "Bb,Eb,Ab");
  assert.equal(
    keySignature({ tonic: 7, mode: "minor", confidence: 1 }).signature,
    "Bb,Eb",
  );
  assert.equal(
    keySignature({ tonic: 9, mode: "minor", confidence: 1 }).signature,
    "C",
  );
  assert.equal(
    keySignature({ tonic: 0, mode: "minor", confidence: 1 }).signature,
    "Bb,Eb,Ab",
  );
  assert.equal(spellPitch(63, major(3)).letter, "E");
  assert.equal(spellPitch(63, major(3)).alter, -1);
  assert.equal(spellPitch(68, major(9)).letter, "G");
  assert.equal(spellPitch(68, major(9)).alter, 1);
  assert.equal(pitchPosition(60, "Treble", major(0)), -6);
  assert.equal(pitchPosition(71, "Treble", major(0)), 0);
  assert.equal(pitchPosition(50, "Bass", major(0)), 0);
  assert.equal(pitchPosition(48, "Bass", major(0)), -1);
  assert.equal(pitchPosition(60, "Bass", major(0)), 6);
  for (const mode of ["major", "minor"] as const)
    for (let tonic = 0; tonic < 12; tonic++)
      for (let midi = 0; midi < 128; midi++) {
        const key = keySignature({ tonic, mode, confidence: 1 }),
          spelling = spellPitch(midi, key);
        assert.equal(
          positionToMidi(
            pitchPosition(midi, "Treble", key),
            "Treble",
            spelling.alter,
          ).midi,
          midi,
        );
      }
});
test("exact duration tokens/decomposition including dots and64th; 5/4 split, unsupported241 never rounded", () => {
  for (const token of DURATION_TOKENS)
    assert.deepEqual(decomposeDuration(token.ticks), [token]);
  assert.deepEqual(
    decomposeDuration(4800).map((token) => token.syntax),
    ["Whole", "4th"],
  );
  for (let ticks = 60; ticks <= 7680; ticks += 60)
    assert.equal(
      decomposeDuration(ticks).reduce((sum, token) => sum + token.ticks, 0),
      ticks,
    );
  for (const ticks of [0, -1, 241, 1.5])
    assert.throws(() => decomposeDuration(ticks), /정확/);
});
test("NWC 2.75 header/footer, SongInfo/Tempo/Key/TimeSig/Clef/Rest/Bar and within-bar accidental reset", () => {
  const snapshot = fixtureSnapshot([
    exportNote("a", 0, 0.5, 61),
    exportNote("b", 0.5, 0.5, 61),
    exportNote("c", 1, 0.5, 60),
    exportNote("d", 2, 0.5, 61),
  ]);
  const result = exportNwctxt(snapshot);
  assert.ok(result.text.startsWith("!NoteWorthyComposer(2.75)"));
  assert.ok(result.text.trim().endsWith("!NoteWorthyComposer-End"));
  assert.match(result.text, /\|TimeSig\|Signature:4\/4/);
  assert.match(result.text, /\|Tempo\|Base:Quarter\|Tempo:120/);
  assert.match(result.text, /\|Key\|Signature:C\|Tonic:C/);
  assert.match(result.text, /\|Clef\|Type:Treble/);
  assert.equal((result.text.match(/Pos:#-6/g) ?? []).length, 2);
  assert.match(result.text, /\|Note\|Dur:4th\|Pos:-6/);
  assert.match(result.text, /\|Note\|Dur:4th\|Pos:n-6/);
  assert.match(result.text, /\|Rest\|Dur:4th/);
  assert.equal(
    validateNwctxt(result.text, result.document, snapshot).valid,
    true,
  );
});
test("equal onset/duration C4/E4/G4 becomes chord; asynchronous overlap becomes deterministic lanes with no ID loss", () => {
  const snapshot = fixtureSnapshot([
    exportNote("c", 0, 0.5, 60),
    exportNote("e", 0, 0.5, 64),
    exportNote("g", 0, 0.5, 67),
    exportNote("overlap", 0.25, 1, 48),
  ]);
  const result = exportNwctxt(snapshot),
    lanes = partitionLanes(
      snapshot.quantization.notes,
      keySignature(snapshot.key),
    );
  assert.equal(result.report.staff, 2);
  assert.equal(result.report.notes, 4);
  assert.equal(result.report.chords, 1);
  assert.match(result.text, /\|Chord\|Dur:4th\|Pos:-6,-4,-2/);
  assert.deepEqual(
    partitionLanes(
      [...snapshot.quantization.notes].reverse(),
      keySignature(snapshot.key),
    ),
    lanes,
  );
  assert.deepEqual(
    lanes
      .flatMap((lane) =>
        lane.events.flatMap((event) => event.notes.map((note) => note.id)),
      )
      .sort(),
    ["c", "e", "g", "overlap"],
  );
  assert.match(result.text, /\|Clef\|Type:Bass/);
  assert.doesNotMatch(result.text, /Soprano|Alto|Tenor/);
});
test("duplicate/chromatic unisons retained in separate lanes; ninth concurrent lane blocked", () => {
  assert.equal(
    exportNwctxt(
      fixtureSnapshot([
        exportNote("c1", 0, 1, 60),
        exportNote("c2", 0, 1, 60),
        exportNote("sharp", 0, 1, 61),
      ]),
    ).report.staff,
    3,
  );
  assert.throws(
    () =>
      exportNwctxt(
        fixtureSnapshot(
          Array.from({ length: 9 }, (_, i) => exportNote(`n${i}`, 0, 1, 60)),
        ),
      ),
    /동시에 너무 많은/,
  );
});
test("pickup remains incomplete, exact bar sums, ties through bar and decomposed chord members, all meters and6/8 tempo", () => {
  for (const timeSignature of ["4/4", "3/4", "6/8"] as const) {
    const settings = {
      ...exportSettings,
      timeSignature,
      gridOriginSeconds: 1,
      bpmUnit:
        timeSignature === "6/8"
          ? ("dottedQuarter" as const)
          : ("quarter" as const),
    };
    const snapshot = fixtureSnapshot(
      [exportNote("c", 0.5, 3, 60), exportNote("e", 0.5, 3, 64)],
      settings,
    );
    const result = exportNwctxt(snapshot);
    assert.ok(result.document.staffs[0].measures[0].startTick < 0);
    assert.equal(result.document.staffs[0].measures[0].endTick, 0);
    assert.ok(result.report.ties >= 2);
    assert.match(result.text, /\|Chord\|Dur:[^\r]+\|Pos:-6\^,-4\^/);
    for (const staff of result.document.staffs)
      for (const measure of staff.measures)
        assert.equal(
          measure.items.reduce((sum, item) => sum + item.durationTicks, 0),
          measure.endTick - measure.startTick,
        );
    if (timeSignature === "6/8")
      assert.match(result.text, /Base:Quarter Dotted\|Tempo:120/);
  }
});
test("validator rejects corrupt header/footer/staff/clef/key/time/duration/pos/tie/bar and structured note loss", () => {
  const snapshot = fixtureSnapshot([exportNote("tied", 0, 3, 60)]),
    result = exportNwctxt(snapshot);
  for (const corrupt of [
    result.text.replace("(2.75)", "(1.0)"),
    result.text.replace("!NoteWorthyComposer-End", ""),
    result.text.replace("|Clef|Type:Treble", ""),
    result.text.replace("|Key|Signature:C", "|Key|Signature:F#"),
    result.text.replace("Signature:4/4", "Signature:3/4"),
    result.text.replace("Dur:Half", "Dur:bogus"),
    result.text.replace("Pos:-6^", "Pos:999^"),
    result.text.replace("Pos:-6^", "Pos:-6"),
    result.text.replace("|Bar\r\n", ""),
  ]) {
    assert.equal(
      validateNwctxt(corrupt, result.document, snapshot).valid,
      false,
    );
  }
  const damaged = structuredClone(result.document);
  damaged.staffs[0].measures[0].items[0].pitches[0].noteId = "unknown";
  assert.equal(validateNwctxt(result.text, damaged, snapshot).valid, false);
  const weak = fixtureSnapshot([exportNote("weak", 0.127, 0.251)], {
    ...exportSettings,
    strength: "weak",
  });
  assert.throws(() => exportNwctxt(weak), /정확하게/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPitchNotes } from "../src/pitch/noteMapper.ts";
import { noteName } from "../src/music/noteNames.ts";
test("NoteEvent mapping filters malformed model output, clips small boundary errors and uses stable chronological IDs", () => {
  const raw = [
    {
      startTimeSeconds: 1,
      durationSeconds: 0.4,
      pitchMidi: 64,
      amplitude: 0.8,
    },
    {
      startTimeSeconds: -0.01,
      durationSeconds: 0.5,
      pitchMidi: 60,
      amplitude: 2,
    },
    {
      startTimeSeconds: 1.9,
      durationSeconds: 0.2,
      pitchMidi: 67,
      amplitude: -1,
    },
  ];
  const mapped = mapPitchNotes(
    [
      ...raw,
      ...[NaN, Infinity, -1, 128, 60.5].map((pitchMidi) => ({
        ...raw[0],
        pitchMidi,
      })),
      { ...raw[0], startTimeSeconds: -1 },
      { ...raw[0], startTimeSeconds: 3 },
      { ...raw[0], durationSeconds: 4 },
      { ...raw[0], durationSeconds: 0 },
      { ...raw[0], amplitude: NaN },
      { ...raw[0], durationSeconds: Infinity },
    ],
    2,
  );
  assert.equal(mapped.length, 3);
  assert.deepEqual(
    mapped.map((note) => note.id),
    ["bp-000001", "bp-000002", "bp-000003"],
  );
  assert.deepEqual(
    mapped.map((note) => note.midi),
    [60, 64, 67],
  );
  assert.deepEqual(
    mapped.map((note) => note.velocity),
    [127, 102, 0],
  );
  assert.deepEqual(
    mapped.map((note) => note.confidence),
    [1, 0.8, 0],
  );
  assert.equal(mapped[0].start, 0);
  assert.equal(mapped[2].start + mapped[2].duration, 2);
  assert.deepEqual(mapPitchNotes(raw, 2), mapped);
  assert.throws(() => mapPitchNotes(raw, NaN));
});
test("MIDI labels cover octaves and reject invalid pitches", () => {
  assert.equal(noteName(60), "C4");
  assert.equal(noteName(61), "C♯4");
  assert.equal(noteName(69), "A4");
  assert.equal(noteName(0), "C-1");
  assert.equal(noteName(127), "G9");
  assert.equal(noteName(128), "—");
});

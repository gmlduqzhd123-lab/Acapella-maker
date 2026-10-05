import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editorReducer,
  initializeEditor,
  HISTORY_LIMIT,
} from "../src/editor/noteHistory.ts";
import { constrainNote, pitchRange } from "../src/editor/noteMath.ts";
const original = [
  {
    id: "bp-000001",
    start: 1.2345,
    duration: 0.48,
    midi: 60,
    confidence: 0.82,
    velocity: 104,
  },
];
test("AI is cloned; free timing survives; edits, deletion, undo/redo preserve IDs and source", () => {
  const source = structuredClone(original);
  let state = initializeEditor(source);
  assert.notEqual(state.notes[0], source[0]);
  state = editorReducer(state, { type: "select", id: source[0].id });
  state = editorReducer(state, {
    type: "update",
    id: source[0].id,
    patch: { midi: 61, start: 1.501 },
    duration: 10,
  });
  assert.equal(state.notes[0].start, 1.501);
  assert.equal(state.selectedNoteId, source[0].id);
  assert.equal(state.metadata[source[0].id].edited, true);
  state = editorReducer(state, { type: "delete", id: source[0].id });
  assert.equal(state.notes.length, 0);
  state = editorReducer(state, { type: "undo" });
  assert.equal(state.notes[0].midi, 61);
  state = editorReducer(state, { type: "redo" });
  assert.equal(state.notes.length, 0);
  assert.deepEqual(source, original);
});
test("manual IDs never reused after deletion, undo and reset; manual origin is independent of confidence", () => {
  let state = initializeEditor(original);
  state = editorReducer(state, {
    type: "add",
    start: 2,
    midi: 64,
    duration: 10,
  });
  assert.equal(state.metadata["manual-000001"].origin, "manual");
  state = editorReducer(state, { type: "undo" });
  state = editorReducer(state, {
    type: "add",
    start: 3,
    midi: 67,
    duration: 10,
  });
  assert.equal(state.notes.at(-1)?.id, "manual-000002");
  state = editorReducer(state, {
    type: "initialize",
    notes: original,
    preserveCounter: true,
  });
  assert.equal(state.past.length, 0);
  state = editorReducer(state, {
    type: "add",
    start: 3,
    midi: 67,
    duration: 10,
  });
  assert.equal(state.notes.at(-1)?.id, "manual-000003");
});
test("invalid MIDI/time/resize bounds never escape duration; duration edit keeps start", () => {
  for (const midi of [-999, 999, NaN])
    for (const start of [-50, 500, NaN])
      for (const duration of [-1, 100, NaN]) {
        const note = constrainNote(
          { ...original[0], midi, start, duration },
          10,
        );
        assert.ok(
          note.start >= 0 &&
            note.duration >= 0.03 &&
            note.start + note.duration <= 10,
        );
        assert.ok(
          Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127,
        );
      }
  const state = editorReducer(initializeEditor(original), {
    type: "update",
    id: original[0].id,
    patch: { duration: 99 },
    duration: 10,
  });
  assert.equal(state.notes[0].start, original[0].start);
  assert.equal(state.notes[0].start + state.notes[0].duration, 10);
  assert.ok(pitchRange(original).high - pitchRange(original).low >= 24);
});
test("history capped at 50; new edit clears redo; unchanged edit adds no history", () => {
  let state = initializeEditor(original);
  for (let i = 0; i < 200; i++)
    state = editorReducer(state, {
      type: "update",
      id: original[0].id,
      patch: { start: 1 + i / 100 },
      duration: 10,
    });
  assert.equal(state.past.length, HISTORY_LIMIT);
  state = editorReducer(state, { type: "undo" });
  assert.equal(state.future.length, 1);
  state = editorReducer(state, {
    type: "update",
    id: original[0].id,
    patch: { midi: 62 },
    duration: 10,
  });
  assert.equal(state.future.length, 0);
  const next = editorReducer(state, {
    type: "update",
    id: original[0].id,
    patch: { midi: 62 },
    duration: 10,
  });
  assert.equal(next, state);
});

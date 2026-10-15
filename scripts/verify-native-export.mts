/** Development-only acceptance using the installed official NWC converter. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import MidiPackage from "@tonejs/midi";
import { fixtureSnapshot, exportNote, exportSettings } from "../tests/exportFixtures.ts";
import { exportNwctxt } from "../src/export/nwctxt/exporter.ts";
import type { ExportSnapshot } from "../src/export/snapshot";
const converter = process.env.NWC_CONVERTER ?? "C:/Program Files (x86)/Noteworthy Software/NoteWorthy Composer 2/nwc-conv.exe";
const out = resolve(process.argv[2] ?? "../../work/audit-native-export");
mkdirSync(out, { recursive: true });
const cases: { name: string; snapshot: ExportSnapshot }[] = [];
for (const mode of ["major", "minor"] as const) for (let tonic = 0; tonic < 12; tonic++) {
  cases.push({ name: `key-${mode}-${tonic}`, snapshot: fixtureSnapshot(
    Array.from({ length: 128 }, (_, i) => exportNote(`n${i}`, i * 0.125, 0.125, i)),
    exportSettings, { tonic, mode, confidence: 1 }, 20,
  ) });
}
for (const bpm of [40, 92.4, 120.9, 240]) cases.push({
  name: `tempo-${bpm}`, snapshot: fixtureSnapshot([exportNote("n", 0.5, 1, 60)], { ...exportSettings, bpm }),
});
cases.push({
  name: "cross-octave-chord-ties", snapshot: fixtureSnapshot([
    exportNote("sharp", 0, 3, 61), exportNote("natural-high", 0, 3, 72),
    exportNote("natural-low", 3, 0.5, 60), exportNote("sharp-high", 3.5, 0.5, 73),
  ]),
});
cases.push({
  name: "pickup-6-8", snapshot: fixtureSnapshot([exportNote("n", 0.5, 3, 61)],
    { ...exportSettings, timeSignature: "6/8", bpmUnit: "dottedQuarter", gridOriginSeconds: 1 }),
});
const results = [];
for (const { name, snapshot } of cases) {
  const output = exportNwctxt(snapshot), stem = resolve(out, name);
  writeFileSync(stem + ".nwctxt", output.text);
  const converted = spawnSync(converter, [stem + ".nwctxt", stem + ".mid", "-1"],
    { windowsHide: true, timeout: 30000, encoding: "utf8" });
  assert.equal(converted.status, 0, converted.error?.message ?? converted.stderr);
  const midi = new MidiPackage.Midi(readFileSync(stem + ".mid"));
  const actual = midi.tracks.flatMap(track => track.notes).sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
  const expected = [...snapshot.quantization.notes].sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  assert.equal(actual.length, expected.length, name);
  assert.deepEqual(actual.map(n => n.midi), expected.map(n => n.midi), name);
  const origin = Math.min(0, ...expected.map(n => n.startTick));
  assert.deepEqual(actual.map(n => n.ticks),
    expected.map(n => (n.startTick - origin) * midi.header.ppq / 960), name);
  const tempo = output.document.bpm * (output.document.tempoBase === "Quarter Dotted" ? 1.5 : 1);
  assert.ok(Math.abs(midi.header.tempos[0].bpm - tempo) < 0.001, name);
  results.push({ name, notes: actual.length, pitchCorrect: true, startsCorrect: true, expectedTempo: tempo, nativeTempo: midi.header.tempos[0].bpm });
}
writeFileSync(resolve(out, "verification.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ nativeCases: results.length, notes: results.reduce((sum, r) => sum + r.notes, 0), allPassed: true }));

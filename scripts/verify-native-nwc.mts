/** Development-only official NWC conversion acceptance; never shipped/run in browser. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import MidiPackage from "@tonejs/midi";
import { DEFAULT_TEAM } from "../src/creation/team.ts";
import { exportTeamTemplate } from "../src/export/nwctxt/teamTemplate.ts";
import { parseNwcLine } from "../src/export/nwctxt/serializer.ts";

const converter = process.env.NWC_CONVERTER ?? "C:/Program Files (x86)/Noteworthy Software/NoteWorthy Composer 2/nwc-conv.exe";
const out = resolve(process.argv[2] ?? "../../work/phase9-native");
mkdirSync(out, { recursive: true });
const results = [];
function convert(input: string, output: string, midi = false) {
  const result = spawnSync(converter, [input, output, ...(midi ? ["-1"] : [])], { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`NWC conversion failed: ${result.error?.message ?? result.stderr}`);
  assert.ok(readFileSync(output).length > 0);
}
for (const singers of [5, 6] as const) for (const alternate of [false, true]) for (const sample of [false, true]) {
  const team = { ...DEFAULT_TEAM, singers, ...(alternate ? { upper: "countertenor" as const, middle: "tenor" as const } : {}) };
  const { text, document } = exportTeamTemplate(team, sample);
  const stem = resolve(out, `team-${singers}-${alternate ? "CT" : "SA"}-${sample ? "sample" : "empty"}`);
  writeFileSync(stem + ".nwctxt", text);
  convert(stem + ".nwctxt", stem + ".nwc");
  convert(stem + ".nwc", stem + "-roundtrip.nwctxt");
  convert(stem + ".nwc", stem + ".mid", true);
  const objects = readFileSync(stem + "-roundtrip.nwctxt", "utf8").split(/\r?\n/).filter(l => l.startsWith("|")).map(parseNwcLine);
  assert.deepEqual(objects.filter(o => o.type === "AddStaff").map(o => o.props.Name), document.staffs.map(s => s.name));
  assert.deepEqual(objects.filter(o => o.type === "StaffProperties" && o.props.Channel).map(o => Number(o.props.Channel)), document.staffs.map(s => s.midiChannel));
  assert.equal(objects.filter(o => o.type === "Clef" && o.props.Type === "Percussion").length, 1);
  const midi = new MidiPackage.Midi(readFileSync(stem + ".mid"));
  if (sample) {
    const tracks = midi.tracks.filter(t => t.notes.length);
    assert.equal(tracks.length, singers);
    for (const [index, staff] of document.staffs.entries()) {
      const track = tracks.find(t => t.channel === staff.midiChannel! - 1)!;
      assert.ok(track);
      assert.deepEqual(track.notes.map(n => n.midi), staff.measures[0].items.map(i => i.pitches[0].midi));
      assert.deepEqual(track.notes.map(n => n.ticks), [0, 960, 1920, 2880].map(t => t * midi.header.ppq / 960));
      // NWC normal articulation shortens sounding duration (160/192 here).
      assert.ok(track.notes.every(n => n.durationTicks >= midi.header.ppq * 0.75 && n.durationTicks <= midi.header.ppq));
      assert.equal(track.instrument.percussion, index === 4);
    }
    assert.deepEqual(objects.filter(o => o.type === "Text").map(o => o.props.Text), ["B", "ts", "K", "ts"]);
    assert.ok(objects.filter(o => o.type === "Note").every(o => o.props.Dur === "4th"));
  } else assert.equal(midi.tracks.flatMap(t => t.notes).length, 0);
  results.push({ singers, alternate, sample, nativeRoundtrip: true, midiVerified: true });
}
writeFileSync(resolve(out, "verification.json"), JSON.stringify({ converter, results, limits: "Official converter acceptance and MIDI events verified. GUI engraving/audio output not visually/audibly verified." }, null, 2));
console.log(JSON.stringify({ officialNwcAcceptance: results }));

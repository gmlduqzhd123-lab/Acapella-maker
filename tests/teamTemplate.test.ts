import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM } from "../src/creation/team.ts";
import { exportTeamTemplate } from "../src/export/nwctxt/teamTemplate.ts";
import { parseNwcLine } from "../src/export/nwctxt/serializer.ts";
import { positionToMidi } from "../src/export/nwctxt/pitch.ts";

test("5/6-person empty scaffolds retain selected labels, aligned rests, unique channels and no fabricated notes", () => {
  for (const singers of [5, 6] as const) {
    const { text, document } = exportTeamTemplate({ ...DEFAULT_TEAM, singers, upper: "countertenor", middle: "tenor" });
    assert.equal(document.staffs.length, singers);
    assert.equal(document.report.notes, 0);
    assert.match(text, /1\. 카운터테너/);
    assert.match(text, /2\. 테너/);
    assert.equal(text.includes("6. 추가 보컬"), singers === 6);
    assert.equal(text.includes("|Note|"), false);
    for (const staff of document.staffs)
      assert.deepEqual(staff.measures.map(m => m.items.reduce((sum, i) => sum + i.durationTicks, 0)), [3840, 3840, 3840, 3840]);
    assert.equal(document.staffs[4].midiChannel, 10);
    assert.equal(document.staffs[4].displayClef, "Percussion");
    assert.equal(new Set(document.staffs.map(s => s.midiChannel)).size, singers);
  }
});
test("percussion acceptance sample maps B/K/ts to GM36/38/42 with neutral clef using NWC bass reference", () => {
  const { text, document } = exportTeamTemplate(DEFAULT_TEAM, true);
  const vp = document.staffs[4];
  assert.deepEqual(vp.measures[0].items.map(n => n.pitches[0].midi), [36, 42, 38, 42]);
  assert.deepEqual(vp.measures[0].items.map(n => n.label), ["B", "ts", "K", "ts"]);
  for (const item of vp.measures[0].items) {
    const pitch = item.pitches[0];
    const alter = pitch.accidental === "#" ? 1 : pitch.accidental === "b" ? -1 : 0;
    assert.equal(positionToMidi(pitch.pos, vp.clef, alter).midi, pitch.midi);
  }
  assert.equal(text.split(/\r?\n/).filter(l => l.startsWith("|")).map(parseNwcLine).filter(o => o.type === "Text").length, 4);
  assert.match(document.title, /음원 분석 결과 아님/);
});

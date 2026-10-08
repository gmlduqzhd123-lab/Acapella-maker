import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEAM, teamParts } from "../src/creation/team.ts";
test("five-person target plan includes Baritone/Bass/Vocal Percussion, six adds a stable extra vocal role", () => {
  const copy = structuredClone(DEFAULT_TEAM),
    five = teamParts(DEFAULT_TEAM),
    six = teamParts({ ...DEFAULT_TEAM, singers: 6 });
  assert.equal(five.length, 5);
  assert.deepEqual(
    five.map((p) => p.name),
    ["소프라노", "알토", "바리톤", "베이스", "보컬 퍼커션"],
  );
  assert.deepEqual(six.slice(0, 5), five);
  assert.equal(six[5].name, "추가 보컬");
  assert.equal(new Set(six.map((p) => p.id)).size, 6);
  assert.deepEqual(DEFAULT_TEAM, copy);
});
test("team upper/middle choices alter target labels, never claim or mutate inferred music", () => {
  const parts = teamParts({
    ...DEFAULT_TEAM,
    upper: "countertenor",
    middle: "tenor",
  });
  assert.equal(parts[0].name, "카운터테너");
  assert.equal(parts[1].name, "테너");
  assert.equal(parts[4].role, "별도 리듬 생성 예정");
});

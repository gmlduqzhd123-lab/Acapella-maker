import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTempo } from "../src/analysis/tempo.ts";
import { analyzeKey } from "../src/analysis/key.ts";
import { analyzeMusic } from "../src/analysis/analyzeMusic.ts";
import { createAnalysisInput } from "../src/analysis/createAnalysisInput.ts";
import { effectiveResult } from "../src/analysis/effectiveResult.ts";
import { keyName } from "../src/music/keyNames.ts";
import { clickTrack, chordTrack } from "./musicSignals.ts";
import type { AnalysisProgress } from "../src/analysis/types.ts";

for (const expected of [40, 60, 90, 120, 150, 180, 240]) {
  test(`actual click PCM: ${expected} BPM within ±2 BPM, no half/double selection`, () => {
    const result = analyzeTempo(clickTrack(expected));
    console.log(
      JSON.stringify({
        testBpm: expected,
        bpm: result.bpm,
        error: result.bpm === null ? null : result.bpm - expected,
        confidence: result.confidence,
        candidates: result.candidates,
      }),
    );
    assert.notEqual(result.bpm, null);
    assert.ok(Math.abs(result.bpm! - expected) <= 2);
    assert.ok(result.confidence >= 0.5 && result.confidence <= 1);
    assert.ok(
      result.candidates.every(
        (candidate) => candidate.bpm >= 40 && candidate.bpm <= 240,
      ),
    );
  });
}
for (const [tonic, mode] of [
  [0, "major"],
  [9, "minor"],
  [7, "major"],
  [3, "major"],
  [1, "major"],
] as const) {
  test(`actual chord-progression PCM: ${keyName({ tonic, mode })}`, () => {
    const input = chordTrack(tonic, mode);
    const result = analyzeKey(input);
    console.log(
      JSON.stringify({
        testKey: keyName({ tonic, mode }),
        detectedKey: result.key && keyName(result.key),
        confidence: result.key?.confidence,
        alternatives: result.candidates,
      }),
    );
    assert.equal(result.key?.tonic, tonic);
    assert.equal(result.key?.mode, mode);
    assert.ok(result.key.confidence >= 0 && result.key.confidence <= 1);
    assert.ok(
      Math.abs(result.chroma.reduce((sum, value) => sum + value, 0) - 1) < 1e-6,
    );
  });
}
test("mono preparation averages every channel, sanitizes/clamps Float32 PCM, preserves source, and can abort", async () => {
  const channels = [
    Float32Array.from([0, 0.5, NaN, 2]),
    Float32Array.from([1, -0.5, 0.6, -2]),
    Float32Array.from([0.5, 0.3, 0, 0]),
  ];
  const input = await createAnalysisInput(
    {
      length: 4,
      numberOfChannels: 3,
      sampleRate: 22050,
      duration: 4 / 22050,
      getChannelData: (index) => channels[index],
    },
    new AbortController().signal,
  );
  assert.ok(Math.abs(input.samples[0] - 0.5) < 1e-6);
  assert.ok(Math.abs(input.samples[1] - 0.1) < 1e-6);
  assert.ok(Math.abs(input.samples[2] - 0.2) < 1e-6);
  assert.equal(input.samples[3], 0);
  assert.equal(channels[0][3], 2);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    createAnalysisInput(
      {
        length: 4,
        numberOfChannels: 1,
        sampleRate: 22050,
        duration: 1,
        getChannelData: () => channels[0],
      },
      cancelled.signal,
    ),
    { name: "AbortError" },
  );
});
test("silence and a single sine wave do not produce fabricated BPM or key", () => {
  const silence = analyzeMusic({
    samples: new Float32Array(22050 * 4),
    sampleRate: 22050,
    duration: 4,
  });
  assert.equal(silence.bpm, null);
  assert.equal(silence.key, null);
  assert.equal(silence.bpmConfidence, 0);
  const samples = Float32Array.from(
    { length: 22050 * 4 },
    (_, index) => 0.5 * Math.sin((2 * Math.PI * 440 * index) / 22050),
  );
  const tone = analyzeMusic({ samples, sampleRate: 22050, duration: 4 });
  assert.equal(tone.bpm, null);
  assert.equal(tone.key, null);
  assert.deepEqual(tone.notes, []);
});
test("complete result preserves empty notes; progress is monotonic 0–1; manual values override automatic score inputs", () => {
  const steps: AnalysisProgress[] = [];
  const result = analyzeMusic(chordTrack(), (progress) => steps.push(progress));
  assert.notEqual(result.bpm, null);
  assert.ok(Math.abs(result.bpm! - 120) < 2);
  assert.equal(result.key?.tonic, 0);
  assert.deepEqual(result.notes, []);
  assert.ok(
    steps.every(
      (step, index) =>
        step.fraction >= 0 &&
        step.fraction <= 1 &&
        (index === 0 || step.fraction >= steps[index - 1].fraction),
    ),
  );
  assert.equal(steps.at(-1)?.fraction, 1);
  const edited = effectiveResult(result, {
    bpm: 97.3,
    key: { tonic: 1, mode: "minor" },
  });
  assert.equal(edited.bpm, 97.3);
  assert.equal(edited.key?.tonic, 1);
  assert.equal(edited.key?.confidence, 0);
  assert.equal(result.key?.tonic, 0);
  assert.deepEqual(effectiveResult(result, { bpm: null, key: null }), result);
  assert.equal(keyName({ tonic: 1, mode: "major" }), "D♭ Major");
  assert.equal(keyName({ tonic: 1, mode: "minor" }), "C♯ Minor");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAudioFile,
  validateDuration,
  MAX_FILE_BYTES,
} from "../src/audio/validation.ts";
import { formatTime, formatFileSize } from "../src/audio/format.ts";
import { computeWaveform } from "../src/workers/waveform.ts";
import { resolvePagesBase } from "../config/pagesBase.ts";

test("WAV and MP3 extensions are case insensitive; MIME is not trusted", () => {
  assert.equal(validateAudioFile({ name: "테스트.WAV", size: 44 }), "WAV");
  assert.equal(validateAudioFile({ name: "recording.mp3", size: 10 }), "MP3");
  for (const name of [
    "fake.mp3.exe",
    "audio.m4a",
    "video.mp4",
    "image.png",
    "file",
  ]) {
    assert.throws(() => validateAudioFile({ name, size: 10 }), /WAV와 MP3/);
  }
});
test("empty files and files over the memory safety limit are rejected", () => {
  assert.throws(
    () => validateAudioFile({ name: "empty.wav", size: 0 }),
    /비어/,
  );
  assert.throws(
    () => validateAudioFile({ name: "large.wav", size: MAX_FILE_BYTES + 1 }),
    /50 MB/,
  );
  assert.equal(
    validateAudioFile({ name: "boundary.wav", size: MAX_FILE_BYTES }),
    "WAV",
  );
});
test("invalid or excessively long duration is rejected", () => {
  for (const duration of [0, -1, NaN, Infinity])
    assert.throws(() => validateDuration(duration));
  assert.throws(() => validateDuration(601), /10분/);
  assert.doesNotThrow(() => validateDuration(600));
});
test("waveform includes every sample, silence, peaks, and right-channel audio", () => {
  assert.deepEqual(
    computeWaveform([Float32Array.from([0, 0, 0, 0])], 2),
    [0, 0],
  );
  assert.deepEqual(
    computeWaveform([Float32Array.from([0, -0.7, 0, 0.5])], 2).map(
      (x) => +x.toFixed(1),
    ),
    [0.7, 0.5],
  );
  assert.deepEqual(
    computeWaveform(
      [new Float32Array(4), Float32Array.from([0, 1, 0, 0.5])],
      2,
    ),
    [1, 0.5],
  );
  assert.deepEqual(computeWaveform([]), []);
  assert.deepEqual(
    computeWaveform([Float32Array.from([NaN, Infinity, 2])], 1),
    [1],
  );
});
test("time and file information formatting", () => {
  assert.equal(formatTime(92.4), "1:32");
  assert.equal(formatTime(600), "10:00");
  assert.equal(formatTime(Infinity), "0:00");
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(1024 * 1024), "1.00 MB");
});
test("Pages base supports actual repo, user site, custom domain, and override", () => {
  assert.equal(resolvePagesBase({}), "/Acapella-maker/");
  assert.equal(
    resolvePagesBase({ GITHUB_REPOSITORY: "someone/my-repo" }),
    "/my-repo/",
  );
  assert.equal(
    resolvePagesBase({ GITHUB_REPOSITORY: "someone/someone.github.io" }),
    "/",
  );
  assert.equal(resolvePagesBase({ PAGES_BASE_PATH: "/" }), "/");
  assert.equal(resolvePagesBase({ PAGES_BASE_PATH: "" }), "/");
  assert.equal(
    resolvePagesBase({ PAGES_BASE_PATH: "/Acapella-maker" }),
    "/Acapella-maker/",
  );
  assert.throws(() => resolvePagesBase({ PAGES_BASE_PATH: "//evil.example/" }));
  assert.throws(() => resolvePagesBase({ PAGES_BASE_PATH: "repo" }));
});

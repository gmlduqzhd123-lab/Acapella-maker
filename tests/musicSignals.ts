import type { AnalysisInput } from "../src/analysis/types";
export function clickTrack(
  bpm: number,
  seconds = 20,
  sampleRate = 22050,
): AnalysisInput {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const period = 60 / bpm;
  for (let beat = 0.15; beat < seconds; beat += period) {
    const start = Math.round(beat * sampleRate);
    for (
      let index = 0;
      index < Math.round(0.025 * sampleRate) && start + index < samples.length;
      index++
    ) {
      samples[start + index] =
        0.8 *
        Math.exp(-index / (sampleRate * 0.004)) *
        Math.sin((2 * Math.PI * 1800 * index) / sampleRate);
    }
  }
  return { samples, sampleRate, duration: seconds };
}
/** Four-chord I–IV–V–I or i–iv–V–i, articulated by quarter notes, including harmonics. */
export function chordTrack(
  tonic = 0,
  mode: "major" | "minor" = "major",
  bpm = 120,
  seconds = 16,
  sampleRate = 22050,
): AnalysisInput {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const chords =
    mode === "major"
      ? [
          [0, 4, 7],
          [5, 9, 12],
          [7, 11, 14],
          [0, 4, 7],
        ]
      : [
          [0, 3, 7],
          [5, 8, 12],
          [7, 11, 14],
          [0, 3, 7],
        ];
  const beatLength = 60 / bpm;
  const voices = chords.map((chord) =>
    chord.map((semitone) => 440 * 2 ** ((48 + tonic + semitone - 69) / 12)),
  );
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const beat = Math.floor(time / beatLength),
      within = time % beatLength;
    const envelope = Math.min(1, within / 0.012) * Math.exp(-within * 1.7);
    const chord = voices[Math.floor(beat / 4) % 4];
    let value = 0;
    for (const frequency of chord)
      value +=
        Math.sin(2 * Math.PI * frequency * time) +
        0.25 * Math.sin(4 * Math.PI * frequency * time) +
        0.08 * Math.sin(6 * Math.PI * frequency * time);
    samples[index] = (value / 5.5) * envelope;
  }
  return { samples, sampleRate, duration: seconds };
}
export function pcmWav(input: AnalysisInput): Buffer {
  const { samples, sampleRate } = input,
    bytes = samples.length * 2;
  const result = Buffer.alloc(44 + bytes);
  result.write("RIFF");
  result.writeUInt32LE(36 + bytes, 4);
  result.write("WAVE", 8);
  result.write("fmt ", 12);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(bytes, 40);
  for (let index = 0; index < samples.length; index++)
    result.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767),
      44 + index * 2,
    );
  return result;
}

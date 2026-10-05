import type { NoteEvent } from "../src/music/types";
import type { Part } from "../src/voices/types";
import { VOICES } from "../src/voices/types.ts";
import type { AnalysisInput } from "../src/analysis/types";
export interface GroundNote extends NoteEvent {
  role: Part;
}
export function satbNotes(repeats = 1): GroundNote[] {
  const lines = {
    soprano: [67, 69, 71, 72, 71, 69, 67, 67],
    alto: [64, 65, 67, 69, 67, 65, 64, 64],
    tenor: [60, 60, 62, 64, 62, 60, 59, 60],
    bass: [48, 53, 55, 48, 50, 53, 55, 48],
  };
  return Array.from({ length: repeats }, (_, phrase) =>
    VOICES.flatMap((role) =>
      lines[role].map((midi, i) => ({
        id: `${role}-${phrase}-${i}`,
        role,
        midi,
        start: 0.375 + (phrase * 8 + i),
        duration: 0.75,
        velocity: 100,
        confidence: 0.95,
      })),
    ),
  ).flat();
}
export function satbAudio(): { input: AnalysisInput; truth: GroundNote[] } {
  const truth = satbNotes(),
    sampleRate = 22050,
    duration = 9,
    samples = new Float32Array(sampleRate * duration);
  for (const note of truth) {
    const onset = note.start - 0.025,
      length = 0.78,
      frequency = 440 * 2 ** ((note.midi - 69) / 12);
    for (let i = 0; i < Math.floor(length * sampleRate); i++) {
      const t = i / sampleRate,
        envelope =
          Math.min(1, t / 0.008) *
          Math.exp(-t * 0.8) *
          Math.min(1, (length - t) / 0.05);
      const sound =
        Math.sin(2 * Math.PI * frequency * t) +
        0.15 * Math.sin(4 * Math.PI * frequency * t) +
        0.04 * Math.sin(6 * Math.PI * frequency * t);
      samples[Math.round(onset * sampleRate) + i] +=
        sound * envelope * (note.role === "bass" ? 0.23 : 0.17);
    }
  }
  return { input: { samples, sampleRate, duration }, truth };
}
/** One-to-one matching. Exact pitch; onset tolerance 240 ticks at120BPM;
 * duration is diagnostic only. Unmatched detections are reported separately. */
export function assignmentAccuracy(
  detected: Array<NoteEvent & { voice: string }>,
  truth: GroundNote[],
) {
  const unused = new Set(truth.map((_, i) => i));
  let matched = 0,
    correct = 0;
  for (const note of [...detected].sort(
    (a, b) => a.start - b.start || a.midi - b.midi,
  )) {
    const choices = [...unused]
      .filter(
        (i) =>
          truth[i].midi === note.midi &&
          Math.abs(truth[i].start - note.start) <= 0.125 + 1e-8,
      )
      .sort(
        (a, b) =>
          Math.abs(truth[a].start - note.start) -
          Math.abs(truth[b].start - note.start),
      );
    if (!choices.length) continue;
    const i = choices[0];
    unused.delete(i);
    matched++;
    if (note.voice === truth[i].role) correct++;
  }
  return {
    groundTruth: truth.length,
    detected: detected.length,
    matched,
    correct,
    accuracy: matched ? correct / matched : 0,
    recall: matched / truth.length,
    unmatched: detected.length - matched,
    onsetToleranceTicks: 240,
    duration: "diagnostic only",
  };
}

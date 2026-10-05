import type { AnalysisInput, AnalysisProgress } from "../analysis/types";
import { loadBasicPitch } from "./basicPitchLoader";
import { mapPitchNotes } from "./noteMapper";
import { PITCH_SETTINGS } from "./pitchTypes";
import type { PitchResult, RawPitchNote } from "./pitchTypes";
export function validatePitchInput(input: AnalysisInput) {
  if (
    !(input.samples instanceof Float32Array) ||
    input.sampleRate !== 22050 ||
    !input.samples.length ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    Math.abs(input.samples.length / input.sampleRate - input.duration) > 0.1
  )
    throw new Error(
      "AI 음표 분석에는 mono 22,050 Hz PCM이 필요합니다. 음원을 다시 불러와 주세요.",
    );
  for (const value of input.samples)
    if (!Number.isFinite(value) || Math.abs(value) > 1)
      throw new Error(
        "PCM 데이터가 올바르지 않습니다. 음원을 다시 불러와 주세요.",
      );
}
export async function runBasicPitch(
  input: AnalysisInput,
  modelUrl: string,
  progress: (value: AnalysisProgress) => void,
): Promise<PitchResult> {
  validatePitchInput(input);
  const loadStart = performance.now();
  progress({ phase: "model", fraction: 0.35 });
  const { promise, reused } = loadBasicPitch(modelUrl);
  const { model, library, tf } = await promise;
  const modelLoadMs = performance.now() - loadStart;
  progress({ phase: "model", fraction: 0.42 });
  const { windowSeconds, contextSeconds } = PITCH_SETTINGS;
  const notes: RawPitchNote[] = [];
  const start = performance.now(),
    tensorsBefore = tf.memory().numTensors;
  let mappingMs = 0;
  // Bounded frames/onsets per 30-second core with boundary context. Contours are not retained.
  for (
    let coreStart = 0;
    coreStart < input.duration;
    coreStart += windowSeconds
  ) {
    const coreEnd = Math.min(input.duration, coreStart + windowSeconds);
    const sliceStart = Math.max(0, coreStart - contextSeconds);
    const sliceEnd = Math.min(input.duration, coreEnd + contextSeconds);
    const samples = input.samples.subarray(
      Math.round(sliceStart * input.sampleRate),
      Math.round(sliceEnd * input.sampleRate),
    );
    const frames: number[][] = [],
      onsets: number[][] = [];
    // The official 1.0.1 evaluator does not dispose intermediates. A worker-exclusive
    // scope around each bounded evaluation releases them without disposing cached weights.
    tf.engine().startScope();
    try {
      await model.evaluateModel(
        samples,
        (f, o) => {
          for (const row of f) frames.push(row);
          for (const row of o) onsets.push(row);
        },
        (fraction) => {
          progress({
            phase: "pitch",
            fraction:
              0.42 +
              (0.55 * (coreStart + (coreEnd - coreStart) * fraction)) /
                input.duration,
          });
        },
      );
    } finally {
      tf.engine().endScope();
    }
    const mappingStart = performance.now();
    const raw = library.noteFramesToTime(
      library.outputToNotesPoly(
        frames,
        onsets,
        PITCH_SETTINGS.onsetThreshold,
        PITCH_SETTINGS.frameThreshold,
        PITCH_SETTINGS.minNoteFrames,
      ),
    );
    for (const note of raw) {
      if (
        ![
          note.startTimeSeconds,
          note.durationSeconds,
          note.pitchMidi,
          note.amplitude,
        ].every(Number.isFinite) ||
        note.durationSeconds <= 0 ||
        !Number.isInteger(note.pitchMidi) ||
        note.pitchMidi < 0 ||
        note.pitchMidi > 127 ||
        note.startTimeSeconds < -0.05 ||
        note.startTimeSeconds + note.durationSeconds >
          samples.length / input.sampleRate + 0.25
      )
        continue;
      const noteStart = sliceStart + note.startTimeSeconds,
        noteEnd = noteStart + note.durationSeconds;
      if (noteEnd <= coreStart || noteStart >= coreEnd) continue;
      const clippedStart = Math.max(coreStart, noteStart),
        clippedEnd = Math.min(coreEnd, noteEnd);
      if (clippedEnd <= clippedStart) continue;
      const prior =
        coreStart > 0 && clippedStart === coreStart
          ? notes.findLast(
              (previous) =>
                previous.pitchMidi === note.pitchMidi &&
                Math.abs(
                  previous.startTimeSeconds +
                    previous.durationSeconds -
                    coreStart,
                ) < 0.001,
            )
          : undefined;
      if (prior) {
        const total = prior.durationSeconds + clippedEnd - clippedStart;
        prior.amplitude =
          (prior.amplitude * prior.durationSeconds +
            note.amplitude * (clippedEnd - clippedStart)) /
          total;
        prior.durationSeconds = total;
      } else
        notes.push({
          ...note,
          startTimeSeconds: clippedStart,
          durationSeconds: clippedEnd - clippedStart,
        });
    }
    mappingMs += performance.now() - mappingStart;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  progress({ phase: "notes", fraction: 0.98 });
  const mappingStart = performance.now(),
    mapped = mapPitchNotes(notes, input.duration);
  mappingMs += performance.now() - mappingStart;
  return {
    notes: mapped,
    metadata: {
      backend: tf.getBackend(),
      modelLoadMs,
      inferenceMs: performance.now() - start - mappingMs,
      mappingMs,
      modelReused: reused,
      windowSeconds,
      tensorsBefore,
      tensorsAfter: tf.memory().numTensors,
    },
  };
}

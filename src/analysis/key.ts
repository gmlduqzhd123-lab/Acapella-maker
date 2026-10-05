import type { AnalysisInput, KeyAnalysis, KeyCandidate } from "./types";
import { SpectrumFFT } from "./fft.ts";
import type { KeyMode } from "../music/types";
// Krumhansl–Kessler probe-tone profiles (1982), also documented by music21.
// Numeric reference data only; extraction and matching code are our own implementation.
const profiles: Record<KeyMode, number[]> = {
  major: [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
  ],
  minor: [
    6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
  ],
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function correlation(
  chroma: number[],
  profile: number[],
  tonic: number,
): number {
  const aMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const bMean = profile.reduce((sum, value) => sum + value, 0) / 12;
  let product = 0,
    aPower = 0,
    bPower = 0;
  for (let pitch = 0; pitch < 12; pitch++) {
    const a = chroma[(pitch + tonic) % 12] - aMean,
      b = profile[pitch] - bMean;
    product += a * b;
    aPower += a * a;
    bPower += b * b;
  }
  return product / Math.max(1e-12, Math.sqrt(aPower * bPower));
}

/** Windowed FFT, interpolated spectral peaks, whole-track chroma, 24 key-profile correlations. */
export function analyzeKey(
  input: AnalysisInput,
  progress: (fraction: number) => void = () => {},
): KeyAnalysis {
  const { samples, sampleRate } = input;
  const size = sampleRate < 16000 ? 4096 : 8192;
  const fft = new SpectrumFFT(size);
  // Uniform coverage of the whole recording, capped at ~1,800 frames for ten-minute files.
  const hop = Math.max(
    Math.round(sampleRate * 0.2),
    Math.floor(size / 2),
    Math.ceil(samples.length / 1800),
  );
  const firstBin = Math.max(2, Math.ceil((65 * size) / sampleRate));
  const lastBin = Math.min(
    size / 2 - 2,
    Math.floor((3500 * size) / sampleRate),
  );
  const accumulated = new Float64Array(12);
  let tonalFrames = 0,
    activeFrames = 0;
  for (let start = 0; start < samples.length; start += hop) {
    const magnitudes = fft.analyze(samples, start);
    let sum = 0,
      logarithms = 0,
      peak = 0;
    for (let bin = firstBin; bin <= lastBin; bin++) {
      const magnitude = magnitudes[bin];
      sum += magnitude;
      logarithms += Math.log(Math.max(1e-12, magnitude));
      peak = Math.max(peak, magnitude);
    }
    if (peak > 1e-3 && sum > 1e-3) {
      activeFrames++;
      const count = lastBin - firstBin + 1;
      const flatness = Math.exp(logarithms / count) / (sum / count);
      const tonalWeight = clamp((0.55 - flatness) / 0.55);
      const frame = new Float64Array(12);
      for (let bin = firstBin; bin <= lastBin; bin++) {
        const magnitude = magnitudes[bin];
        if (
          magnitude < peak * 0.035 ||
          magnitude <= magnitudes[bin - 1] ||
          magnitude < magnitudes[bin + 1]
        )
          continue;
        const a = Math.log(Math.max(1e-12, magnitudes[bin - 1])),
          b = Math.log(magnitude),
          c = Math.log(Math.max(1e-12, magnitudes[bin + 1]));
        const curvature = a - 2 * b + c;
        const offset =
          Math.abs(curvature) > 1e-10
            ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / curvature))
            : 0;
        const frequency = ((bin + offset) * sampleRate) / size;
        const note = 69 + 12 * Math.log2(frequency / 440);
        const nearest = Math.round(note),
          distance = Math.abs(note - nearest);
        const weight = magnitude ** 0.8 * Math.cos(Math.PI * distance) ** 2;
        frame[((nearest % 12) + 12) % 12] += weight;
      }
      const total = frame.reduce((sum, value) => sum + value, 0);
      if (total > 0 && tonalWeight > 0.1) {
        tonalFrames++;
        const energyWeight = Math.sqrt(sum / size) * tonalWeight;
        for (let pitch = 0; pitch < 12; pitch++)
          accumulated[pitch] += (frame[pitch] / total) * energyWeight;
      }
    }
    if (Math.floor(start / hop) % 16 === 0) progress(start / samples.length);
  }
  const total = accumulated.reduce((sum, value) => sum + value, 0);
  const chroma = Array.from(accumulated, (value) =>
    total > 0 ? value / total : 0,
  );
  const unavailable: KeyAnalysis = { key: null, candidates: [], chroma };
  if (total < 1e-6 || chroma.filter((value) => value > 0.06).length < 3) {
    progress(1);
    return unavailable;
  }
  const candidates: KeyCandidate[] = [];
  for (const mode of ["major", "minor"] as const) {
    for (let tonic = 0; tonic < 12; tonic++)
      candidates.push({
        tonic,
        mode,
        correlation: correlation(chroma, profiles[mode], tonic),
      });
  }
  candidates.sort((a, b) => b.correlation - a.correlation);
  const best = candidates[0],
    gap = best.correlation - candidates[1].correlation;
  if (best.correlation < 0.35) {
    progress(1);
    return unavailable;
  }
  // Heuristic evidence strength, NOT a calibrated probability of musical correctness.
  const confidence = clamp(
    best.correlation *
      clamp(gap / 0.18) *
      Math.min(1, tonalFrames / 8) *
      (tonalFrames / Math.max(1, activeFrames)),
  );
  progress(1);
  return {
    key: { tonic: best.tonic, mode: best.mode, confidence },
    candidates: candidates.slice(0, 5),
    chroma,
  };
}

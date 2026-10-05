import type { AnalysisInput, TempoAnalysis, TempoCandidate } from "./types";
import { SpectrumFFT } from "./fft.ts";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Log spectral-flux novelty + normalized autocorrelation + onset intervals (40–240 BPM). */
export function analyzeTempo(
  input: AnalysisInput,
  progress: (fraction: number) => void = () => {},
): TempoAnalysis {
  const { samples, sampleRate } = input;
  const hop = Math.max(1, Math.round(sampleRate / 100)),
    rate = sampleRate / hop;
  const frames = Math.ceil(samples.length / hop);
  const envelope = new Float64Array(frames);
  let maximum = 0;
  for (let frame = 0; frame < frames; frame++) {
    let power = 0,
      count = 0;
    for (
      let index = frame * hop;
      index < Math.min(samples.length, (frame + 2) * hop);
      index++
    ) {
      power += samples[index] ** 2;
      count++;
    }
    envelope[frame] = Math.sqrt(power / Math.max(1, count));
    maximum = Math.max(maximum, envelope[frame]);
    if (frame % 2048 === 0) progress((0.1 * frame) / frames);
  }
  const unavailable: TempoAnalysis = {
    bpm: null,
    confidence: 0,
    candidates: [],
  };
  if (maximum < 1e-5 || input.duration < 3) {
    progress(1);
    return unavailable;
  }
  const novelty = new Float64Array(frames),
    prefix = new Float64Array(frames + 1);
  let maxNovelty = 0;
  const fft = new SpectrumFFT(sampleRate < 16000 ? 512 : 1024);
  const previousSpectrum = new Float64Array(fft.size / 2);
  const firstBin = Math.max(1, Math.floor((40 * fft.size) / sampleRate));
  const lastBin = Math.min(
    fft.size / 2 - 1,
    Math.ceil((8000 * fft.size) / sampleRate),
  );
  for (let index = 0; index < frames; index++) {
    const magnitudes = fft.analyze(samples, index * hop);
    let flux = 0;
    for (let bin = firstBin; bin <= lastBin; bin++) {
      const value = Math.log1p((100 * magnitudes[bin]) / (fft.size * maximum));
      flux += Math.max(0, value - previousSpectrum[bin]);
      previousSpectrum[bin] = value;
    }
    novelty[index] = flux;
    prefix[index + 1] = prefix[index] + novelty[index];
    if (index % 128 === 0) progress(0.1 + (0.2 * index) / frames);
  }
  const radius = Math.round(rate * 0.15);
  for (let index = 0; index < frames; index++) {
    const left = Math.max(0, index - radius),
      right = Math.min(frames, index + radius + 1);
    novelty[index] = Math.max(
      0,
      novelty[index] - (0.65 * (prefix[right] - prefix[left])) / (right - left),
    );
    maxNovelty = Math.max(maxNovelty, novelty[index]);
  }
  if (maxNovelty < 0.15) {
    progress(1);
    return unavailable;
  }
  const onsetFrames: number[] = [];
  const threshold = maxNovelty * 0.12,
    refractory = Math.round(rate * 0.1);
  for (let index = 1; index < frames - 1; index++) {
    if (
      novelty[index] < threshold ||
      novelty[index] < novelty[index - 1] ||
      novelty[index] <= novelty[index + 1]
    )
      continue;
    const last = onsetFrames.at(-1);
    if (last !== undefined && index - last < refractory) {
      if (novelty[index] > novelty[last])
        onsetFrames[onsetFrames.length - 1] = index;
    } else onsetFrames.push(index);
  }
  if (onsetFrames.length < 4) {
    progress(1);
    return unavailable;
  }
  const intervals = onsetFrames
    .slice(1)
    .map((onset, index) => (onset - onsetFrames[index]) / rate);
  const typical = median(intervals);
  const deviation =
    median(intervals.map((interval) => Math.abs(interval - typical))) / typical;
  let intervalBpm: number | null = null;
  if (deviation < 0.12 && typical >= 0.248 && typical <= 1.51) {
    // Linear regression across onsets avoids quantizing the result to a single hop.
    const n = onsetFrames.length,
      meanX = (n - 1) / 2;
    const meanY = onsetFrames.reduce((sum, value) => sum + value, 0) / n;
    let numerator = 0,
      denominator = 0;
    for (let index = 0; index < n; index++) {
      numerator += (index - meanX) * (onsetFrames[index] - meanY);
      denominator += (index - meanX) ** 2;
    }
    const slope = numerator / denominator;
    const estimated = (60 * rate) / slope;
    // Regression is trusted only when there aren't many missing/extra pulses.
    if (Math.abs(estimated - 60 / typical) / estimated < 0.04)
      intervalBpm = estimated;
  }
  const minLag = Math.floor((rate * 60) / 240),
    maxLag = Math.ceil((rate * 60) / 40);
  const correlation = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let product = 0,
      leftEnergy = 0,
      rightEnergy = 0;
    for (let index = lag; index < frames; index++) {
      product += novelty[index] * novelty[index - lag];
      leftEnergy += novelty[index] ** 2;
      rightEnergy += novelty[index - lag] ** 2;
    }
    correlation[lag] =
      product / Math.max(1e-12, Math.sqrt(leftEnergy * rightEnergy));
    if (lag % 8 === 0)
      progress(0.3 + (0.7 * (lag - minLag)) / (maxLag - minLag + 1));
  }
  const scoreAt = (bpm: number) => {
    const lag = Math.round((rate * 60) / bpm);
    return correlation[Math.max(0, Math.min(correlation.length - 1, lag))] ?? 0;
  };
  const intervalSupport = (bpm: number) => {
    const period = 60 / bpm;
    return (
      intervals.filter(
        (interval) => Math.abs(interval - period) / period < 0.12,
      ).length / intervals.length
    );
  };
  const raw: { bpm: number; strength: number; evidence: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (
      correlation[lag] < 0.05 ||
      correlation[lag] < correlation[lag - 1] ||
      correlation[lag] < correlation[lag + 1]
    )
      continue;
    const curvature =
      correlation[lag - 1] - 2 * correlation[lag] + correlation[lag + 1];
    const offset =
      Math.abs(curvature) > 1e-10
        ? Math.max(
            -0.5,
            Math.min(
              0.5,
              (0.5 * (correlation[lag - 1] - correlation[lag + 1])) / curvature,
            ),
          )
        : 0;
    const measuredBpm = (60 * rate) / (lag + offset);
    const bpm = Math.max(40, Math.min(240, measuredBpm));
    if (measuredBpm >= 39.5 && measuredBpm <= 240.5)
      raw.push({
        bpm,
        strength: correlation[lag],
        evidence: correlation[lag] + 0.65 * intervalSupport(bpm),
      });
  }
  if (intervalBpm !== null && intervalBpm >= 39.5 && intervalBpm <= 240.5) {
    intervalBpm = Math.max(40, Math.min(240, intervalBpm));
    raw.push({
      bpm: intervalBpm,
      strength: scoreAt(intervalBpm),
      evidence:
        scoreAt(intervalBpm) + 0.65 * intervalSupport(intervalBpm) + 0.03,
    });
  }
  raw.sort((a, b) => b.evidence - a.evidence);
  const best = raw[0];
  if (!best || best.strength < 0.08) {
    progress(1);
    return unavailable;
  }
  // Keep metrical alternatives instead of pretending half/double ambiguity is solved.
  for (const measuredBpm of [best.bpm / 2, best.bpm * 2]) {
    const bpm = Math.max(40, Math.min(240, measuredBpm));
    if (measuredBpm >= 39.5 && measuredBpm <= 240.5)
      raw.push({
        bpm,
        strength: scoreAt(bpm),
        evidence: scoreAt(bpm) + 0.65 * intervalSupport(bpm),
      });
  }
  raw.sort((a, b) => b.evidence - a.evidence);
  const unique = raw
    .filter(
      (item, index) =>
        !raw
          .slice(0, index)
          .some((previous) => Math.abs(previous.bpm - item.bpm) < 1.5),
    )
    .slice(0, 5);
  const support = intervalSupport(best.bpm);
  const confidence = clamp(
    (0.65 * best.strength + 0.35 * support) * Math.min(1, input.duration / 8),
  );
  const candidates: TempoCandidate[] = unique.map((item) => ({
    bpm: item.bpm,
    confidence: clamp(
      (0.65 * item.strength + 0.35 * intervalSupport(item.bpm)) *
        Math.min(1, input.duration / 8),
    ),
  }));
  progress(1);
  return { bpm: best.bpm, confidence, candidates };
}

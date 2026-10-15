import type { AnalysisInput } from "./types";
type AudioSource = Pick<
  AudioBuffer,
  "length" | "numberOfChannels" | "sampleRate" | "duration" | "getChannelData"
>;

/** Downmix into owned PCM, retaining an audible channel if opposite polarities cancel.
 * Yield between chunks so preparing stays cancellable; never mutate original playback.
 */
export async function createAnalysisInput(
  source: AudioSource,
  signal: AbortSignal,
  onProgress: (fraction: number) => void = () => {},
): Promise<AnalysisInput> {
  signal.throwIfAborted();
  if (!source.length || source.numberOfChannels < 1 || source.sampleRate < 1000)
    throw new Error("분석할 오디오 샘플이 없습니다.");
  const channels = Array.from(
    { length: source.numberOfChannels },
    (_, channel) => source.getChannelData(channel),
  );
  const samples = new Float32Array(source.length);
  const energies = new Float64Array(channels.length);
  let mixedEnergy = 0;
  let deadline = performance.now() + 8;
  for (let start = 0; start < source.length; start += 32768) {
    signal.throwIfAborted();
    const end = Math.min(start + 32768, source.length);
    for (let index = start; index < end; index++) {
      let sum = 0;
      for (let channel = 0; channel < channels.length; channel++) {
        const value = channels[channel][index];
        const safe = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
        sum += safe;
        energies[channel] += safe * safe;
      }
      samples[index] = sum / channels.length;
      mixedEnergy += samples[index] * samples[index];
    }
    if (performance.now() >= deadline) {
      onProgress(0.8 * end / source.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      deadline = performance.now() + 8;
    }
  }
  const strongest = energies.reduce((best, value, index) => value > energies[best] ? index : best, 0);
  const averageEnergy = energies.reduce((sum, value) => sum + value, 0) / channels.length;
  // A >20dB energy loss relative to the input channels indicates severe cancellation.
  // Ordinary stereo (including one silent channel) continues to use the average.
  if (channels.length > 1 && averageEnergy > 0 && mixedEnergy < averageEnergy * 0.01) {
    for (let start = 0; start < source.length; start += 32768) {
      signal.throwIfAborted();
      const end = Math.min(start + 32768, source.length);
      for (let index = start; index < end; index++) {
        const value = channels[strongest][index];
        samples[index] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      }
      if (performance.now() >= deadline) {
        onProgress(0.8 + 0.2 * end / source.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        deadline = performance.now() + 8;
      }
    }
  }
  signal.throwIfAborted();
  onProgress(1);
  return {
    samples,
    sampleRate: source.sampleRate,
    duration: samples.length / source.sampleRate,
  };
}

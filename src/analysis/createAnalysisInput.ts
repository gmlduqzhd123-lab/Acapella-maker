import type { AnalysisInput } from "./types";
type AudioSource = Pick<
  AudioBuffer,
  "length" | "numberOfChannels" | "sampleRate" | "duration" | "getChannelData"
>;

/** Average every channel into owned PCM. Yield between chunks so preparing stays cancellable. */
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
  let deadline = performance.now() + 8;
  for (let start = 0; start < source.length; start += 32768) {
    signal.throwIfAborted();
    const end = Math.min(start + 32768, source.length);
    for (let index = start; index < end; index++) {
      let sum = 0;
      for (const channel of channels) {
        const value = channel[index];
        sum += Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      }
      samples[index] = sum / channels.length;
    }
    if (performance.now() >= deadline) {
      onProgress(end / source.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      deadline = performance.now() + 8;
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

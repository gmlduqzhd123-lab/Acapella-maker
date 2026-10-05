/** Compute genuine peak amplitude over each time bin, across all channels. */
export function computeWaveform(
  channels: Float32Array[],
  bins = 180,
): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length || bins <= 0) return [];
  const count = Math.min(bins, length);
  return Array.from({ length: count }, (_, bin) => {
    const start = Math.floor((bin * length) / count);
    const end = Math.floor(((bin + 1) * length) / count);
    let peak = 0;
    for (const channel of channels) {
      for (let index = start; index < Math.min(end, channel.length); index++) {
        const amplitude = Math.abs(channel[index]);
        if (Number.isFinite(amplitude)) peak = Math.max(peak, amplitude);
      }
    }
    return Math.min(1, peak);
  });
}

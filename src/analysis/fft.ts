/** In-place radix-2 FFT. Own implementation; no runtime DSP/WASM dependency. */
export class SpectrumFFT {
  readonly size: number;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;
  private readonly reverse: Uint32Array;
  private readonly cosine: Float64Array;
  private readonly sine: Float64Array;
  private readonly window: Float64Array;
  readonly magnitudes: Float64Array;
  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0)
      throw new Error("FFT size must be a power of two.");
    this.size = size;
    this.real = new Float64Array(size);
    this.imaginary = new Float64Array(size);
    this.reverse = new Uint32Array(size);
    this.cosine = new Float64Array(size / 2);
    this.sine = new Float64Array(size / 2);
    this.window = new Float64Array(size);
    this.magnitudes = new Float64Array(size / 2);
    const bits = Math.log2(size);
    for (let index = 0; index < size; index++) {
      let value = index,
        reversed = 0;
      for (let bit = 0; bit < bits; bit++) {
        reversed = (reversed << 1) | (value & 1);
        value >>= 1;
      }
      this.reverse[index] = reversed;
      this.window[index] =
        0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
    }
    for (let index = 0; index < size / 2; index++) {
      this.cosine[index] = Math.cos((-2 * Math.PI * index) / size);
      this.sine[index] = Math.sin((-2 * Math.PI * index) / size);
    }
  }
  analyze(samples: Float32Array, start: number): Float64Array {
    const { size, real, imaginary } = this;
    let mean = 0;
    const count = Math.min(size, samples.length - start);
    for (let index = 0; index < count; index++) mean += samples[start + index];
    mean /= Math.max(1, count);
    for (let index = 0; index < size; index++) {
      real[this.reverse[index]] =
        index < count
          ? (samples[start + index] - mean) * this.window[index]
          : 0;
      imaginary[this.reverse[index]] = 0;
    }
    for (let width = 2; width <= size; width *= 2) {
      const half = width / 2,
        step = size / width;
      for (let offset = 0; offset < size; offset += width) {
        for (let index = 0; index < half; index++) {
          const first = offset + index,
            second = first + half,
            twiddle = index * step;
          const r =
            real[second] * this.cosine[twiddle] -
            imaginary[second] * this.sine[twiddle];
          const i =
            real[second] * this.sine[twiddle] +
            imaginary[second] * this.cosine[twiddle];
          real[second] = real[first] - r;
          imaginary[second] = imaginary[first] - i;
          real[first] += r;
          imaginary[first] += i;
        }
      }
    }
    for (let index = 0; index < size / 2; index++)
      this.magnitudes[index] = Math.hypot(real[index], imaginary[index]);
    return this.magnitudes;
  }
}

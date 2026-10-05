import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

/** Real PCM/MP3 fixtures. Application code never imports these test signals. */
export function makeWav(
  seconds = 3,
  sampleRate = 44100,
  channels = 1,
  silent = false,
): Buffer {
  const frames = Math.ceil(seconds * sampleRate);
  const bytes = frames * channels * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  for (let frame = 0; frame < frames; frame++) {
    // In stereo, sound only on the right channel exercises multi-channel waveform handling.
    for (let channel = 0; channel < channels; channel++) {
      const sample =
        silent || (channels === 2 && channel === 0)
          ? 0
          : Math.round(
              Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 15000,
            );
      wav.writeInt16LE(sample, 44 + (frame * channels + channel) * 2);
    }
  }
  return wav;
}
export function makeMp3(): Buffer {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("lamejs/lame.all.js"), "utf8");
  const sandbox = vm.createContext({});
  vm.runInContext(source, sandbox);
  const Encoder = sandbox.lamejs.Mp3Encoder as new (
    channels: number,
    rate: number,
    kbps: number,
  ) => { encodeBuffer(samples: Int16Array): Int8Array; flush(): Int8Array };
  const encoder = new Encoder(1, 44100, 128);
  const pcm = new Int16Array(44100 * 3);
  for (let frame = 0; frame < pcm.length; frame++)
    pcm[frame] = Math.round(
      Math.sin((2 * Math.PI * 440 * frame) / 44100) * 15000,
    );
  const chunks: Buffer[] = [];
  for (let start = 0; start < pcm.length; start += 1152)
    chunks.push(
      Buffer.from(encoder.encodeBuffer(pcm.subarray(start, start + 1152))),
    );
  chunks.push(Buffer.from(encoder.flush()));
  return Buffer.concat(chunks);
}

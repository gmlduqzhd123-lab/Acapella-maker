import { computeWaveform } from "./waveform";
self.onmessage = (event: MessageEvent<{ channels: Float32Array[] }>) => {
  self.postMessage(computeWaveform(event.data.channels));
};

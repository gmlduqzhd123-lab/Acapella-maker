import type { LoadedAudio } from "./types";
import {
  AudioImportError,
  MAX_DECODED_BYTES,
  validateAudioFile,
  validateDuration,
} from "./validation";

function abortIfNeeded(signal: AbortSignal) {
  signal.throwIfAborted();
}

function readMediaDuration(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    };
    const finish = (error?: Error) => {
      const duration = audio.duration;
      cleanup();
      if (error) reject(error);
      else resolve(duration);
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new AudioImportError(
            "파일을 읽는 데 시간이 너무 오래 걸립니다. 다른 파일로 다시 시도해 주세요.",
          ),
        ),
      15_000,
    );
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish();
    audio.onerror = () =>
      finish(
        new AudioImportError(
          "음원을 읽을 수 없습니다. 손상된 파일이거나 브라우저에서 지원하지 않는 오디오 코덱입니다.",
        ),
      );
    signal.addEventListener("abort", abort, { once: true });
    audio.src = url;
  });
}

function createWaveform(
  buffer: AudioBuffer,
  signal: AbortSignal,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/waveform.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(
        new AudioImportError(
          "파형 작업을 시작할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
        ),
      );
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new AudioImportError(
          "파형 처리 시간이 초과되었습니다. 더 짧은 음원으로 다시 시도해 주세요.",
        ),
      );
    }, 30_000);
    worker.onmessage = (event: MessageEvent<number[]>) => {
      cleanup();
      resolve(event.data);
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new AudioImportError(
          "파형을 처리하지 못했습니다. 새로고침 후 다시 시도해 주세요.",
        ),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, index) => buffer.getChannelData(index).slice(),
      );
      worker.postMessage(
        { channels },
        channels.map((channel) => channel.buffer),
      );
    } catch {
      cleanup();
      reject(
        new AudioImportError(
          "오디오 처리에 필요한 메모리가 부족합니다. 더 작은 파일을 선택해 주세요.",
        ),
      );
    }
  });
}

/** No fetch, network requests, API keys, or persistent file storage. */
export async function loadLocalAudio(
  file: File,
  signal: AbortSignal,
): Promise<LoadedAudio> {
  const format = validateAudioFile(file);
  abortIfNeeded(signal);
  if (!window.AudioContext)
    throw new AudioImportError(
      "이 브라우저는 Web Audio API를 지원하지 않습니다. 최신 Chrome·Edge·Firefox·Safari를 사용해 주세요.",
    );
  const objectUrl = URL.createObjectURL(file);
  let context: AudioContext | undefined;
  try {
    // Preflight duration before allocating decoded PCM; prevents long compressed imports.
    const duration = await readMediaDuration(objectUrl, signal);
    abortIfNeeded(signal);
    validateDuration(duration);
    context = new AudioContext({ sampleRate: 22050 });
    const encoded = await file.arrayBuffer();
    abortIfNeeded(signal);
    const buffer = await context.decodeAudioData(encoded);
    abortIfNeeded(signal);
    validateDuration(buffer.duration);
    if (buffer.length * buffer.numberOfChannels * 4 > MAX_DECODED_BYTES) {
      throw new AudioImportError(
        "디코딩한 음원이 너무 큽니다. 채널 수가 적거나 더 짧은 파일을 선택해 주세요.",
      );
    }
    const waveform = await createWaveform(buffer, signal);
    abortIfNeeded(signal);
    return {
      metadata: {
        name: file.name,
        size: file.size,
        format,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
      },
      objectUrl,
      buffer,
      waveform,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    if (
      error instanceof AudioImportError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    if (error instanceof RangeError)
      throw new AudioImportError(
        "브라우저 메모리가 부족합니다. 다른 탭을 닫거나 더 작은 파일을 선택해 주세요.",
      );
    throw new AudioImportError(
      "음원 디코딩에 실패했습니다. WAV 또는 MP3 파일이 손상되지 않았는지 확인해 주세요.",
    );
  } finally {
    if (context && context.state !== "closed")
      await context.close().catch(() => {});
  }
}

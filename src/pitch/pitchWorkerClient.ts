import type { AnalysisInput, AnalysisProgress } from "../analysis/types";
import type { PitchRequest, PitchResponse, PitchResult } from "./pitchTypes";
/** Keep one idle worker/model for subsequent analyses. Cancellation destroys it immediately. */
export class PitchWorkerClient {
  private worker: Worker | null = null;
  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
  run(
    input: AnalysisInput,
    signal: AbortSignal,
    progress: (value: AnalysisProgress) => void,
  ): Promise<PitchResult> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      try {
        this.worker ??= new Worker(
          new URL("../workers/pitch.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        reject(
          new Error(
            "AI 음표 Worker를 시작하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 시도해 주세요.",
          ),
        );
        return;
      }
      const worker = this.worker,
        id = crypto.randomUUID();
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
      };
      const fail = (reason: Error) => {
        if (settled) return;
        cleanup();
        this.dispose();
        reject(reason);
      };
      const abort = () => fail(new DOMException("Cancelled", "AbortError"));
      // CPU fallback can take longer than playback. A stalled job still has a deadline.
      const timer = setTimeout(
        () =>
          fail(
            new Error(
              "AI 음표 분석 시간이 초과되었습니다. 더 짧은 음원으로 다시 시도해 주세요.",
            ),
          ),
        Math.max(120_000, input.duration * 20_000),
      );
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event: MessageEvent<PitchResponse>) => {
        const message = event.data;
        if (settled || message.id !== id) return;
        if (message.type === "progress") progress(message.progress);
        if (message.type === "error") fail(new Error(message.message));
        if (message.type === "complete") {
          cleanup();
          resolve(message.result);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail(
          new Error(
            "AI 음표 분석 Worker가 중단되었습니다. 더 짧은 음원으로 다시 시도해 주세요.",
          ),
        );
      };
      worker.onmessageerror = () =>
        fail(
          new Error("AI 음표 결과 전달에 실패했습니다. 다시 시도해 주세요."),
        );
      try {
        const request: PitchRequest = {
          type: "pitch",
          id,
          input,
          modelUrl: new URL(
            `${import.meta.env.BASE_URL}models/basic-pitch/model.json`,
            window.location.href,
          ).href,
        };
        worker.postMessage(request, [input.samples.buffer]);
      } catch {
        fail(
          new Error(
            "AI 음표 분석 메모리를 준비하지 못했습니다. 더 짧은 음원을 사용해 주세요.",
          ),
        );
      }
    });
  }
}

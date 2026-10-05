import type {
  AnalysisInput,
  AnalysisProgress,
  AnalysisResult,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from "./types";
export function runAnalysisWorker(
  input: AnalysisInput,
  signal: AbortSignal,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<{ result: AnalysisResult; input: AnalysisInput }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/analysis.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(
        new Error(
          "분석 Worker를 시작하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 시도해 주세요.",
        ),
      );
      return;
    }
    const id = crypto.randomUUID();
    let settled = false;
    const cleanup = () => {
      settled = true;
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
        new Error(
          "분석 시간이 초과되었습니다. 더 짧은 음원으로 다시 시도해 주세요.",
        ),
      );
    }, 90_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
      if (settled || event.data.id !== id) return;
      const message = event.data;
      if (message.type === "progress") onProgress(message.progress);
      if (message.type === "complete") {
        cleanup();
        resolve({ result: message.result, input: message.input });
      }
      if (message.type === "error") {
        cleanup();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (!settled) {
        cleanup();
        reject(
          new Error(
            "분석 작업을 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.",
          ),
        );
      }
    };
    worker.onmessageerror = () => {
      if (!settled) {
        cleanup();
        reject(
          new Error(
            "분석 데이터 전달에 실패했습니다. 더 작은 파일로 다시 시도해 주세요.",
          ),
        );
      }
    };
    try {
      const request: AnalysisWorkerRequest = { type: "analyze", id, input };
      worker.postMessage(request, [input.samples.buffer]);
    } catch {
      cleanup();
      reject(
        new Error(
          "분석에 필요한 메모리를 준비하지 못했습니다. 더 작은 음원을 사용해 주세요.",
        ),
      );
    }
  });
}

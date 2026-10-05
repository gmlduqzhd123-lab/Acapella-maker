import { analyzeMusic } from "../analysis/analyzeMusic";
import type {
  AnalysisWorkerRequest,
  AnalysisWorkerResponse,
} from "../analysis/types";
self.onmessage = (event: MessageEvent<AnalysisWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "analyze") return;
  const send = (message: AnalysisWorkerResponse) => self.postMessage(message);
  try {
    const result = analyzeMusic(request.input, (progress) =>
      send({ type: "progress", id: request.id, progress }),
    );
    const message: AnalysisWorkerResponse = {
      type: "complete",
      id: request.id,
      result,
      input: request.input,
    };
    self.postMessage(message, { transfer: [request.input.samples.buffer] });
  } catch (reason) {
    send({
      type: "error",
      id: request.id,
      message:
        reason instanceof RangeError
          ? "분석 메모리가 부족합니다. 더 짧은 파일로 다시 시도해 주세요."
          : "음악 분석을 완료하지 못했습니다. 다른 음원으로 다시 시도해 주세요.",
    });
  }
};

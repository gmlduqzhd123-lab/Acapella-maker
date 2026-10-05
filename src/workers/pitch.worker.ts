import { runBasicPitch } from "../pitch/basicPitchRunner";
import type { PitchRequest, PitchResponse } from "../pitch/pitchTypes";
let active = false;
self.onmessage = async (event: MessageEvent<PitchRequest>) => {
  const request = event.data;
  if (request.type !== "pitch" || active) return;
  active = true;
  const send = (message: PitchResponse) => self.postMessage(message);
  try {
    const result = await runBasicPitch(
      request.input,
      request.modelUrl,
      (progress) => send({ type: "progress", id: request.id, progress }),
    );
    send({ type: "complete", id: request.id, result });
  } catch (reason) {
    send({
      type: "error",
      id: request.id,
      message:
        reason instanceof RangeError
          ? "AI 분석 메모리가 부족합니다. 더 짧은 음원으로 다시 시도해 주세요."
          : "AI 음표 모델을 불러오거나 실행하지 못했습니다. 네트워크 연결과 브라우저를 확인한 뒤 다시 시도해 주세요.",
    });
    console.error("Basic Pitch failed", reason);
  } finally {
    active = false;
  }
};

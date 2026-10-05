import { assignVoices } from "../voices/assignVoices";
import type { AssignmentInput } from "../voices/types";
self.onmessage = (event: MessageEvent<AssignmentInput>) => {
  try {
    self.postMessage({ result: assignVoices(event.data) });
  } catch (reason) {
    self.postMessage({
      error:
        reason instanceof Error
          ? reason.message
          : "성부 추정을 완료하지 못했습니다.",
    });
  }
};

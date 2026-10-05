import type { SupportedAudioFormat } from "./types.ts";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 10 * 60;
export const MAX_DECODED_BYTES = 128 * 1024 * 1024;

export class AudioImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioImportError";
  }
}
export function validateAudioFile(
  file: Pick<File, "name" | "size">,
): SupportedAudioFormat {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "wav" && ext !== "mp3") {
    throw new AudioImportError(
      "현재는 WAV와 MP3 파일만 지원합니다. M4A·OGG·동영상은 이후 단계에서 지원할 예정입니다.",
    );
  }
  if (file.size === 0)
    throw new AudioImportError(
      "비어 있는 파일입니다. 다른 음악 파일을 선택해 주세요.",
    );
  if (file.size > MAX_FILE_BYTES)
    throw new AudioImportError(
      "파일이 50 MB를 초과합니다. 더 작거나 짧은 음악 파일을 선택해 주세요.",
    );
  return ext === "wav" ? "WAV" : "MP3";
}
export function validateDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new AudioImportError(
      "재생 시간을 확인할 수 없습니다. 손상되지 않은 WAV 또는 MP3 파일을 선택해 주세요.",
    );
  if (duration > MAX_DURATION_SECONDS)
    throw new AudioImportError(
      "음원이 10분을 초과합니다. 브라우저 메모리를 보호하기 위해 더 짧은 파일을 사용해 주세요.",
    );
}

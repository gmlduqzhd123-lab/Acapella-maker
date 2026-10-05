import type { VoiceRanges } from "./types";
import { VOICES } from "./types.ts";
export const DEFAULT_RANGES: VoiceRanges = {
  soprano: { low: 60, high: 84 },
  alto: { low: 55, high: 76 },
  tenor: { low: 48, high: 67 },
  bass: { low: 40, high: 60 },
};
export function validateRanges(ranges: VoiceRanges) {
  for (const voice of VOICES) {
    const range = ranges[voice];
    if (
      !range ||
      !Number.isInteger(range.low) ||
      !Number.isInteger(range.high) ||
      range.low < 0 ||
      range.high > 127 ||
      range.low > range.high
    )
      throw new Error(
        "성부 음역은 MIDI 0–127 안에서 낮은 음 ≤ 높은 음으로 설정해 주세요.",
      );
  }
}

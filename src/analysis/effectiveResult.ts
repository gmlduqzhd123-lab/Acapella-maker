import type { AnalysisOverrides, AnalysisResult } from "./types";
/** Later score generation consumes these effective values; automatic evidence stays intact. */
export function effectiveResult(
  automatic: AnalysisResult,
  overrides: AnalysisOverrides,
): AnalysisResult {
  return {
    ...automatic,
    bpm: overrides.bpm ?? automatic.bpm,
    key: overrides.key ? { ...overrides.key, confidence: 0 } : automatic.key,
  };
}

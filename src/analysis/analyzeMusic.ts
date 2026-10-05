import { analyzeTempo } from "./tempo.ts";
import { analyzeKey } from "./key.ts";
import type { AnalysisInput, AnalysisProgress, AnalysisResult } from "./types";

export function analyzeMusic(
  input: AnalysisInput,
  progress: (value: AnalysisProgress) => void = () => {},
): AnalysisResult {
  if (
    !input.samples.length ||
    !Number.isFinite(input.sampleRate) ||
    input.sampleRate < 1000
  )
    throw new Error("분석할 PCM 데이터가 올바르지 않습니다.");
  const tempo = analyzeTempo(input, (fraction) =>
    progress({ phase: "bpm", fraction: 0.1 + 0.45 * fraction }),
  );
  const tonal = analyzeKey(input, (fraction) =>
    progress({ phase: "key", fraction: 0.55 + 0.44 * fraction }),
  );
  const warnings: string[] = [];
  if (tempo.bpm === null)
    warnings.push("규칙적인 박자를 찾지 못했습니다. BPM을 직접 입력해 주세요.");
  else if (tempo.confidence < 0.55)
    warnings.push(
      "박자가 명확하지 않습니다. 반속·배속 후보와 BPM을 직접 확인해 주세요.",
    );
  if (tonal.key === null)
    warnings.push(
      "조성을 추정할 충분한 음계 정보를 찾지 못했습니다. Key를 직접 선택해 주세요.",
    );
  else if (tonal.key.confidence < 0.55)
    warnings.push(
      "조성이 명확하지 않습니다. 자동 분석 결과를 직접 확인해 주세요.",
    );
  progress({ phase: "complete", fraction: 1 });
  return {
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    key: tonal.key,
    notes: [],
    tempoCandidates: tempo.candidates,
    keyCandidates: tonal.candidates,
    chroma: tonal.chroma,
    warnings,
  };
}

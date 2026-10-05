import type { AnalysisProgress, AnalysisStatus } from "../analysis/types";
import { Icon } from "./Icon";
export function AnalysisControls({
  status,
  progress,
  hasAudio,
  importing,
  error,
  onStart,
  onCancel,
}: {
  status: AnalysisStatus;
  progress: AnalysisProgress;
  hasAudio: boolean;
  importing: boolean;
  error: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  const busy = status === "preparing" || status === "running";
  const title = busy
    ? "음악을 분석하고 있습니다."
    : status === "complete"
      ? "음악 분석 완료"
      : status === "cancelled"
        ? "분석을 취소했습니다."
        : status === "error"
          ? "분석을 다시 시도해 주세요."
          : hasAudio
            ? "BPM · Key · AI 음표를 자동으로 분석합니다."
            : "음원을 먼저 불러와 주세요.";
  const phases = [
    "preparing",
    "bpm",
    "key",
    "model",
    "pitch",
    "notes",
  ] as const;
  const phaseIndex =
    progress.phase === "complete"
      ? phases.length
      : phases.indexOf(progress.phase as (typeof phases)[number]);
  return (
    <section className="analysis-controls" aria-label="음악 분석">
      <div className="analysis-control-row">
        <div>
          <span className="section-label">MUSIC ANALYSIS</span>
          <strong role="status">{title}</strong>
        </div>
        <div className="analysis-buttons">
          <button
            className="button primary"
            disabled={!hasAudio || importing || busy}
            onClick={onStart}
          >
            <Icon name="wave" size={16} /> 음악 분석 시작
          </button>
          {busy && (
            <button className="button secondary" onClick={onCancel}>
              분석 취소
            </button>
          )}
        </div>
      </div>
      {busy && (
        <div className="analysis-progress">
          <div className="analysis-steps">
            {[
              "음원 준비",
              "BPM 분석",
              "Key 분석",
              "AI 음표 모델",
              "Pitch 분석",
              "음표 정리",
            ].map((label, index) => (
              <span
                className={index === phaseIndex ? "in-progress" : ""}
                key={label}
              >
                {index < phaseIndex ? "✓" : index === phaseIndex ? "●" : "○"}{" "}
                {label}
              </span>
            ))}
          </div>
          {progress.phase === "model" && (
            <p className="model-status">
              AI 음표 모델을 준비하고 있습니다… 모델 파일만 현재 사이트에서
              가져옵니다.
            </p>
          )}
          {(progress.phase === "pitch" || progress.phase === "notes") && (
            <p className="model-status">
              AI 음표 모델 준비 완료 · 음악은 내 기기에서 분석합니다.
            </p>
          )}
          <div className="progress-row">
            <progress
              aria-label="음악 분석 진행률"
              max={1}
              value={progress.fraction}
            />
            <span className="progress-percent">
              {Math.round(progress.fraction * 100)}%
            </span>
          </div>
        </div>
      )}
      {error && (
        <p className="analysis-error" role="alert">
          {error}
        </p>
      )}
      {!busy && (
        <p className="analysis-explanation">
          {status === "complete"
            ? "자동 분석 결과입니다. 왼쪽에서 확인하고 직접 수정할 수 있습니다."
            : "브라우저 안에서 처리합니다. AI가 초안을 만들고 사람이 음악을 완성합니다."}
        </p>
      )}
    </section>
  );
}

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AnalysisOverrides,
  AnalysisProgress,
  AnalysisResult,
} from "../analysis/types";
import { keyName, tonicName } from "../music/keyNames";
import type { KeyMode } from "../music/types";

export function AnalysisResults({
  automatic,
  effective,
  overrides,
  setOverrides,
  busy,
  progress,
  hasAudio,
}: {
  automatic: AnalysisResult | null;
  effective: AnalysisResult | null;
  overrides: AnalysisOverrides;
  setOverrides: Dispatch<SetStateAction<AnalysisOverrides>>;
  busy: boolean;
  progress: AnalysisProgress;
  hasAudio: boolean;
}) {
  const [editing, setEditing] = useState<"bpm" | "key" | null>(null);
  const [bpmDraft, setBpmDraft] = useState("");
  const [rootDraft, setRootDraft] = useState(0);
  const [modeDraft, setModeDraft] = useState<KeyMode>("major");
  const [validation, setValidation] = useState("");

  const before = hasAudio ? "분석 전" : "—";
  const bpmText = busy
    ? !["preparing", "bpm"].includes(progress.phase)
      ? "처리 완료"
      : "분석 중…"
    : effective
      ? effective.bpm === null
        ? "추정 불가"
        : String(Number(effective.bpm.toFixed(1)))
      : before;
  const keyText = busy
    ? progress.phase === "key"
      ? "분석 중…"
      : ["model", "pitch", "notes", "complete"].includes(progress.phase)
        ? "처리 완료"
        : "대기 중"
    : effective
      ? effective.key
        ? keyName(effective.key)
        : "추정 불가"
      : before;
  return (
    <div className="analysis-section">
      <span className="section-label">자동 분석 결과</span>
      <div className="analysis-metric">
        <div className="metric">
          <span>BPM</span>
          <button
            className="result-value"
            disabled={!automatic || busy}
            aria-label="BPM 수정"
            onClick={() => {
              setBpmDraft(effective?.bpm?.toFixed(1) ?? "");
              setValidation("");
              setEditing(editing === "bpm" ? null : "bpm");
            }}
          >
            {bpmText}
          </button>
        </div>
        {automatic && !busy && (
          <div className="auto-detail">
            <span>자동 분석: {automatic.bpm?.toFixed(1) ?? "추정 불가"}</span>
            <span title="주기성과 박자 간격의 일치도를 기반으로 한 휴리스틱 신뢰도">
              신뢰도 {Math.round(automatic.bpmConfidence * 100)}%
            </span>
            {overrides.bpm !== null && <em>사용자 수정</em>}
          </div>
        )}
        {editing === "bpm" && !busy && (
          <form
            className="metric-editor"
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(bpmDraft);
              if (
                bpmDraft.trim() === "" ||
                !Number.isFinite(value) ||
                value < 40 ||
                value > 240
              ) {
                setValidation("BPM은 40~240 사이로 입력해 주세요.");
                return;
              }
              setOverrides((current) => ({ ...current, bpm: value }));
              setEditing(null);
            }}
          >
            <label>
              사용할 BPM
              <input
                aria-label="사용할 BPM"
                type="number"
                min={40}
                max={240}
                step="any"
                value={bpmDraft}
                onChange={(event) => setBpmDraft(event.target.value)}
                autoFocus
              />
            </label>
            <button className="button secondary" type="submit">
              BPM 적용
            </button>
            {validation && <p role="alert">{validation}</p>}
          </form>
        )}
        {automatic && !busy && (
          <button
            className="restore-button"
            aria-label="BPM 자동값으로 되돌리기"
            disabled={overrides.bpm === null}
            onClick={() => {
              setOverrides((current) => ({ ...current, bpm: null }));
              setEditing(null);
            }}
          >
            자동값으로 되돌리기
          </button>
        )}
      </div>
      <div className="analysis-metric">
        <div className="metric">
          <span>Key</span>
          <button
            className="result-value key-value"
            disabled={!automatic || busy}
            aria-label="Key 수정"
            onClick={() => {
              setRootDraft(effective?.key?.tonic ?? 0);
              setModeDraft(effective?.key?.mode ?? "major");
              setEditing(editing === "key" ? null : "key");
            }}
          >
            {keyText}
          </button>
        </div>
        {automatic && !busy && (
          <div className="auto-detail">
            <span>
              자동 분석: {automatic.key ? keyName(automatic.key) : "추정 불가"}
            </span>
            <span title="조성 프로파일 일치도와 후보 간 차이를 기반으로 한 휴리스틱 신뢰도">
              신뢰도 {Math.round((automatic.key?.confidence ?? 0) * 100)}%
            </span>
            {overrides.key && <em>사용자 수정</em>}
          </div>
        )}
        {editing === "key" && !busy && (
          <form
            className="metric-editor"
            onSubmit={(event) => {
              event.preventDefault();
              setOverrides((current) => ({
                ...current,
                key: { tonic: rootDraft, mode: modeDraft },
              }));
              setEditing(null);
            }}
          >
            <div className="key-fields">
              <label>
                Root
                <select
                  aria-label="Key Root"
                  value={rootDraft}
                  onChange={(event) => setRootDraft(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, root) => (
                    <option key={root} value={root}>
                      {tonicName(root, modeDraft)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mode
                <select
                  aria-label="Key Mode"
                  value={modeDraft}
                  onChange={(event) =>
                    setModeDraft(event.target.value as KeyMode)
                  }
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </label>
            </div>
            <button className="button secondary" type="submit">
              Key 적용
            </button>
          </form>
        )}
        {automatic && !busy && (
          <button
            className="restore-button"
            aria-label="Key 자동값으로 되돌리기"
            disabled={!overrides.key}
            onClick={() => {
              setOverrides((current) => ({ ...current, key: null }));
              setEditing(null);
            }}
          >
            자동값으로 되돌리기
          </button>
        )}
      </div>
      {automatic && !busy && (
        <>
          {automatic.warnings.map((warning) => (
            <p className="analysis-warning" key={warning}>
              {warning}
            </p>
          ))}
          <details className="candidate-details">
            <summary>다른 BPM 후보</summary>
            <p>반속·배속으로 들릴 수 있습니다.</p>
            {automatic.tempoCandidates.map((candidate) => (
              <span key={candidate.bpm}>
                {candidate.bpm.toFixed(1)} BPM ·{" "}
                {Math.round(candidate.confidence * 100)}%
              </span>
            ))}
          </details>
          <p className="muted-note">
            신뢰도는 분석 근거의 강도이며 정답 확률이 아닙니다. 자동 결과를 직접
            확인해 주세요.
          </p>
        </>
      )}
      {!automatic && !busy && (
        <p className="muted-note">음원을 준비한 뒤 음악 분석을 시작하세요.</p>
      )}
    </div>
  );
}

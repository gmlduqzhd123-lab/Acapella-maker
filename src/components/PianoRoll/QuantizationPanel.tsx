import type { RhythmController } from "../../quantization/useRhythm";
import type {
  QuantizationResolution,
  QuantizationStrength,
  TimeSignatureName,
} from "../../quantization/types";
import { ticksToDurationName } from "../../quantization/duration";
import { musicalPosition } from "../../quantization/grid";
import { secondsToTicks } from "../../quantization/timeConversion";
export function QuantizationPanel({
  rhythm,
  currentTime,
  duration,
  disabled,
}: {
  rhythm: RhythmController;
  currentTime: number;
  duration: number;
  disabled: boolean;
}) {
  const settings = rhythm.settings,
    result = rhythm.preview ?? rhythm.applied;
  const position = settings.bpm
    ? musicalPosition(
        secondsToTicks(currentTime, settings),
        settings.timeSignature,
      )
    : null;
  const setOrigin = (value: number) => {
    if (Number.isFinite(value))
      rhythm.configure({
        gridOriginSeconds: Math.max(0, Math.min(duration, value)),
      });
  };
  return (
    <section className="quant-panel" aria-label="박자 정리">
      <div className="quant-title">
        <h3>박자 정리</h3>
        <span>PPQ 960 · BPM {settings.bpm ?? "추정 불가"}</span>
        <span data-testid="musical-playhead">
          {position
            ? `${position.pickup ? "못갖춘마디 · " : ""}M${position.measure} · B${position.beat.toFixed(2)}`
            : "박 위치 추정 불가"}
        </span>
      </div>
      <div className="quant-settings">
        <label>
          박자표
          <select
            aria-label="박자표"
            disabled={disabled}
            value={settings.timeSignature}
            onChange={(event) =>
              rhythm.configure({
                timeSignature: event.target.value as TimeSignatureName,
                bpmUnit:
                  event.target.value === "6/8" ? "dottedQuarter" : "quarter",
              })
            }
          >
            <option>4/4</option>
            <option>3/4</option>
            <option>6/8</option>
          </select>
        </label>
        {settings.timeSignature === "6/8" && (
          <label>
            BPM 기준
            <select
              aria-label="BPM 기준"
              disabled={disabled}
              value={settings.bpmUnit}
              onChange={(event) =>
                rhythm.configure({
                  bpmUnit: event.target.value as "quarter" | "dottedQuarter",
                })
              }
            >
              <option value="quarter">4분음표</option>
              <option value="dottedQuarter">점4분음표</option>
            </select>
          </label>
        )}
        <label>
          1마디 1박 위치
          <input
            aria-label="1마디 1박 위치"
            disabled={disabled}
            type="number"
            min={0}
            max={duration}
            step={0.001}
            value={settings.gridOriginSeconds}
            onChange={(event) => {
              if (event.target.value !== "")
                setOrigin(Number(event.target.value));
            }}
          />
        </label>
        <button
          className="button"
          disabled={disabled}
          onClick={() => setOrigin(currentTime)}
        >
          현재 위치를 1마디 1박으로
        </button>
        {[-0.05, -0.01, 0.01, 0.05].map((delta) => (
          <button
            key={delta}
            className="button"
            disabled={disabled}
            onClick={() =>
              setOrigin(
                Math.round((settings.gridOriginSeconds + delta) * 1000) / 1000,
              )
            }
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta) * 1000}ms
          </button>
        ))}
        <label>
          최소 단위
          <select
            aria-label="최소 단위"
            disabled={disabled}
            value={settings.resolution}
            onChange={(event) =>
              rhythm.configure({
                resolution: event.target.value as QuantizationResolution,
              })
            }
          >
            <option value="quarter">4분음표</option>
            <option value="eighth">8분음표</option>
            <option value="sixteenth">16분음표</option>
            <option value="thirtySecond">32분음표</option>
          </select>
        </label>
        <label>
          강도
          <select
            aria-label="Quantization 강도"
            disabled={disabled}
            value={settings.strength}
            onChange={(event) =>
              rhythm.configure({
                strength: event.target.value as QuantizationStrength,
              })
            }
          >
            <option value="weak">약하게 · 50%</option>
            <option value="standard">표준 · 100%</option>
            <option value="strong">강하게 · 후보 검토</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={rhythm.showGrid}
            onChange={(event) => rhythm.setShowGrid(event.target.checked)}
          />{" "}
          박자선 보기
        </label>
        <label>
          Snap
          <select
            aria-label="Snap"
            disabled={disabled || !settings.bpm}
            value={rhythm.snap}
            onChange={(event) =>
              rhythm.setSnap(
                event.target.value as QuantizationResolution | "off",
              )
            }
          >
            <option value="off">OFF · 자유 이동</option>
            <option value="quarter">1/4</option>
            <option value="eighth">1/8</option>
            <option value="sixteenth">1/16</option>
            <option value="thirtySecond">1/32</option>
          </select>
        </label>
      </div>
      {!settings.bpm && (
        <p className="quant-warning">
          박자를 찾지 못했습니다. BPM을 직접 입력한 뒤 다시 시도해 주세요.
        </p>
      )}
      <p className="quant-help">
        BPM은 왼쪽 음악 분석에서 수정합니다. 미리보기는 음표를 바꾸지 않으며,
        Snap은 이후 드래그·Resize에만 적용합니다. 강하게 모드도 자동 삭제하지
        않습니다.
      </p>
      <div className="quant-actions">
        <button
          className="button primary"
          disabled={disabled || !settings.bpm}
          onClick={rhythm.createPreview}
        >
          Quantization 미리보기
        </button>
        <button
          className="button"
          disabled={disabled || !rhythm.preview}
          onClick={rhythm.apply}
        >
          Quantization 적용
        </button>
        <button
          className="button"
          disabled={!rhythm.preview}
          onClick={rhythm.cancelPreview}
        >
          미리보기 취소
        </button>
      </div>
      {rhythm.error && (
        <p role="alert" className="inline-error">
          {rhythm.error}
        </p>
      )}
      {result && (
        <div className="quant-result" data-testid="quant-result">
          <strong>
            {rhythm.preview
              ? "미리보기 · 아직 적용하지 않았습니다"
              : "박자 정리 적용됨"}
          </strong>
          <p>
            총 음표 {result.stats.total} · 변경 예정 {result.stats.changed} ·
            변경 없음 {result.stats.unchanged} · 평균 이동{" "}
            {result.stats.averageMovementMs.toFixed(1)}ms · 최대 이동{" "}
            {result.stats.maxMovementMs.toFixed(1)}ms
          </p>
          <p>
            검토가 필요한 음표 {result.stats.reviewNotes}개 · 짧은 음표 경고{" "}
            {result.stats.shortNotes} · 중복/겹침 경고{" "}
            {result.stats.overlappingNotes}
          </p>
          <details>
            <summary>음가·마디·Tie 데이터 확인 · 처음 30개</summary>
            <div className="note-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>마디 / 박</th>
                    <th>시작 tick</th>
                    <th>길이 tick / 음가</th>
                  </tr>
                </thead>
                <tbody>
                  {result.notes.slice(0, 30).map((note) => (
                    <tr key={note.id}>
                      <td>{note.id}</td>
                      <td>
                        {note.pickup ? "Pickup " : ""}
                        {note.measure} / {note.beat.toFixed(2)}
                      </td>
                      <td>{note.startTick}</td>
                      <td>
                        {note.durationTicks} /{" "}
                        {ticksToDurationName(note.durationTicks)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Tie segment {result.segments.length}개 · 원본 음표는 분할하지
              않습니다.
            </p>
          </details>
          {!!result.issues.length && (
            <details>
              <summary>Quantization Issues · 삭제 없이 검토</summary>
              <ul>
                {result.issues.slice(0, 30).map((issue, index) => (
                  <li key={index}>
                    {issue.message}{" "}
                    {issue.deletionCandidate && "(삭제 후보 제안)"} ·{" "}
                    {issue.noteIds.slice(0, 3).join(", ")}
                  </li>
                ))}
              </ul>
              {result.issues.length > 30 && (
                <p>전체 경고 {result.issues.length}개 · 첫 30개 표시</p>
              )}
            </details>
          )}
        </div>
      )}
    </section>
  );
}

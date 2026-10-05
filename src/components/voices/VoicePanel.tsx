import { useState } from "react";
import type { NoteEditor } from "../../editor/useNoteEditor";
import type { VoiceController } from "../../voices/useVoices";
import type { VoiceRole } from "../../voices/types";
import { VOICES, VOICE_NAMES, VOICE_LABELS } from "../../voices/types";
import { noteName } from "../../music/noteNames";
import { GuidePlayer } from "./GuidePlayer";
import "./voices.css";
export function VoicePanel({
  voices,
  editor,
  filter,
  setFilter,
  seek,
  currentTime,
  stopOriginal,
  disabled,
}: {
  voices: VoiceController;
  editor: NoteEditor;
  filter: VoiceRole | "all";
  setFilter: (v: VoiceRole | "all") => void;
  seek: (time: number, noteId?: string) => void;
  currentTime: number;
  stopOriginal: () => void;
  disabled: boolean;
}) {
  const [from, setFrom] = useState(0),
    [to, setTo] = useState(editor.duration),
    [batch, setBatch] = useState<VoiceRole>("alto");
  const result = voices.result;
  return (
    <section className="voice-panel" aria-label="AI SATB 성부 추정">
      <div className="voice-heading">
        <h3>AI SATB 성부 추정</h3>
        <span className="tiny-tag">성부 초안 · BETA</span>
      </div>
      <p>
        검출된 음표를 음악적 연속성으로 할당합니다. 원래 녹음의 가수 음성을
        분리하거나 실제 성부를 복원하는 기능은 아닙니다.
      </p>
      <details>
        <summary>일반 SATB soft range 설정</summary>
        <div className="voice-ranges">
          {VOICES.map((voice) => (
            <div key={voice}>
              <strong>{VOICE_NAMES[voice]}</strong>
              {(["low", "high"] as const).map((edge) => (
                <label key={edge}>
                  {edge === "low" ? "낮은 음" : "높은 음"}
                  <input
                    type="number"
                    aria-label={`${VOICE_NAMES[voice]} ${edge} MIDI`}
                    min={0}
                    max={127}
                    value={voices.ranges[voice][edge]}
                    disabled={disabled || voices.busy}
                    onChange={(e) => {
                      if (
                        e.target.value !== "" &&
                        Number.isInteger(Number(e.target.value))
                      )
                        voices.setRanges((r) => ({
                          ...r,
                          [voice]: {
                            ...r[voice],
                            [edge]: Number(e.target.value),
                          },
                        }));
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <p>음역 밖의 음표도 할당할 수 있으며 경고로 표시합니다.</p>
      </details>
      <div className="voice-actions">
        <button
          className="button primary"
          disabled={disabled || !voices.ready}
          onClick={voices.analyze}
        >
          {voices.busy
            ? "성부 추정 중…"
            : result || voices.stale
              ? "성부 분석 다시 하기"
              : "SATB 성부 분석"}
        </button>
        {voices.busy && (
          <button className="button" onClick={voices.cancel}>
            성부 분석 취소
          </button>
        )}
        <label>
          <input
            type="checkbox"
            checked={voices.keepManual}
            disabled={disabled || voices.busy}
            onChange={(e) => voices.setKeepManual(e.target.checked)}
          />{" "}
          직접 지정한 성부 유지
        </label>
      </div>
      {!voices.ready && !voices.busy && (
        <p>최신 Quantization 결과를 적용한 뒤 성부 분석을 실행하세요.</p>
      )}
      {voices.stale && (
        <p className="voice-warning">성부 분석을 다시 실행해 주세요.</p>
      )}
      {voices.error && (
        <p className="voice-warning" role="alert">
          {voices.error}
        </p>
      )}
      <div className="voice-actions" role="group" aria-label="성부 보기">
        {["all", ...VOICES, "unassigned"].map((v) => (
          <button
            className="button"
            key={v}
            aria-pressed={filter === v}
            disabled={v !== "all" && !result}
            onClick={() => setFilter(v as VoiceRole | "all")}
          >
            {v === "all" ? "전체" : VOICE_LABELS[v as VoiceRole]}
          </button>
        ))}
      </div>
      {result && (
        <>
          <div className="voice-summary">
            {[...VOICES, "unassigned" as const].map((voice) => (
              <div key={voice} className={`voice-card voice-${voice}`}>
                <strong>{VOICE_NAMES[voice]}</strong>
                <span data-testid={`voice-count-${voice}`}>
                  {result.stats.counts[voice]}개
                </span>
                <small>
                  {voice !== "unassigned" && result.stats.ranges[voice]
                    ? `${noteName(result.stats.ranges[voice]!.low)} ~ ${noteName(result.stats.ranges[voice]!.high)}`
                    : "—"}
                </small>
              </div>
            ))}
          </div>
          <details>
            <summary>검토가 필요한 음표 {result.issues.length}곳</summary>
            <ul className="voice-issues">
              {result.issues.slice(0, 50).map((issue, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      setFilter("all");
                      editor.dispatch({
                        type: "select",
                        id: issue.noteIds.at(-1)!,
                      });
                      seek(issue.start, issue.noteIds.at(-1));
                    }}
                  >
                    {issue.message} · {issue.start.toFixed(2)}초
                  </button>
                </li>
              ))}
            </ul>
            {result.issues.length > 50 && (
              <p>처음 50곳을 표시합니다. 전체 경고는 결과에 보존됩니다.</p>
            )}
          </details>
          <details>
            <summary>시간 구간·현재 성부 필터로 일괄 지정</summary>
            <div className="voice-actions">
              <label>
                시작
                <input
                  aria-label="일괄 지정 시작"
                  type="number"
                  min={0}
                  max={editor.duration}
                  step={0.01}
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value))}
                />
              </label>
              <label>
                끝
                <input
                  aria-label="일괄 지정 끝"
                  type="number"
                  min={0}
                  max={editor.duration}
                  step={0.01}
                  value={to}
                  onChange={(e) => setTo(Number(e.target.value))}
                />
              </label>
              <label>
                지정 성부
                <select
                  aria-label="일괄 지정 성부"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value as VoiceRole)}
                >
                  {[...VOICES, "unassigned" as const].map((v) => (
                    <option key={v} value={v}>
                      {VOICE_NAMES[v]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                disabled={
                  disabled ||
                  voices.busy ||
                  !Number.isFinite(from) ||
                  !Number.isFinite(to) ||
                  from < 0 ||
                  to < from ||
                  to > editor.duration
                }
                onClick={() =>
                  voices.override(
                    editor.notes
                      .filter(
                        (n) =>
                          n.start >= from &&
                          n.start <= to &&
                          (filter === "all" ||
                            voices.map[n.id]?.voice === filter),
                      )
                      .map((n) => n.id),
                    batch,
                  )
                }
              >
                구간 성부 지정
              </button>
            </div>
            <p>
              시작 시간이 구간 안에 있는 음표 중 현재 성부 보기 필터에 맞는
              음표를 지정합니다.
            </p>
          </details>
        </>
      )}
      <GuidePlayer
        result={disabled ? null : result}
        currentTime={currentTime}
        stopOriginal={stopOriginal}
      />
    </section>
  );
}

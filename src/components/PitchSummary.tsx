import type { AnalysisResult } from "../analysis/types";
import { noteName } from "../music/noteNames";
export function PitchSummary({ result }: { result: AnalysisResult | null }) {
  if (!result?.pitch) return null;
  const { notes, pitch } = result;
  let lowest = 127,
    highest = 0,
    strength = 0;
  for (const note of notes) {
    lowest = Math.min(lowest, note.midi);
    highest = Math.max(highest, note.midi);
    strength += note.confidence;
  }
  return (
    <section className="pitch-summary" aria-label="AI 음표 분석 결과">
      <span className="section-label">AI NOTE DRAFT</span>
      <h2>음표 분석 완료</h2>
      <p className="pitch-disclaimer">
        아래는 AI 분석 원본입니다. 수정한 음표는 Piano Roll의 편집본에서
        확인하세요.
      </p>
      <div className="pitch-metrics">
        <div>
          <span>감지된 음표</span>
          <strong data-testid="note-count">{notes.length}개</strong>
        </div>
        <div>
          <span>음역</span>
          <strong data-testid="note-range">
            {notes.length ? `${noteName(lowest)} ~ ${noteName(highest)}` : "—"}
          </strong>
        </div>
        <div>
          <span>평균 AI 음표 강도</span>
          <strong>
            {notes.length
              ? `${Math.round((strength / notes.length) * 100)}%`
              : "—"}
          </strong>
        </div>
      </div>
      {notes.length ? (
        <>
          <p className="pitch-range-detail">
            가장 낮은 음 {noteName(lowest)} · 가장 높은 음 {noteName(highest)}
          </p>
          <details className="note-inspector">
            <summary>
              감지 음표 확인 · 처음 {Math.min(notes.length, 30)}개
            </summary>
            <div className="note-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>음</th>
                    <th>시작 (초)</th>
                    <th>길이 (초)</th>
                    <th>AI 음표 강도</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.slice(0, 30).map((note) => (
                    <tr key={note.id}>
                      <td>{noteName(note.midi)}</td>
                      <td>{note.start.toFixed(2)}</td>
                      <td>{note.duration.toFixed(2)}</td>
                      <td>{Math.round(note.confidence * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="pitch-empty">
          뚜렷한 음표를 찾지 못했습니다. 멜로디가 더 선명한 음원으로 다시 시도해
          보세요.
        </p>
      )}
      <p className="pitch-disclaimer">
        AI 음표 분석은 초안입니다. 복잡한 반주가 섞인 음악에서는 불필요한 음표가
        포함될 수 있습니다. AI 음표 강도는 정답 확률이 아닙니다.
      </p>
      <p className="pitch-disclaimer">
        Basic Pitch는 SATB 성부 분리기가 아닙니다. 현재 모든 감지 음표는 하나의
        다성 음표 모음입니다.
      </p>
      <details className="pitch-performance">
        <summary>이번 분석 정보</summary>
        <p>
          모델 준비 {(pitch.modelLoadMs / 1000).toFixed(2)}초 · Pitch{" "}
          {(pitch.inferenceMs / 1000).toFixed(2)}초 ·{" "}
          {pitch.backend.toUpperCase()} Worker ·{" "}
          {pitch.modelReused ? "모델 재사용" : "첫 모델 준비"}
        </p>
      </details>
    </section>
  );
}

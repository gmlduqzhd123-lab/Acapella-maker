import type { NoteEditor } from "../../editor/useNoteEditor";
import { useMemo } from "react";
export function PianoToolbar({
  editor,
  disabled,
  add,
  setAdd,
  zoom,
  setZoom,
  fit,
  filter,
  setFilter,
  follow,
  setFollow,
  reset,
}: {
  editor: NoteEditor;
  disabled: boolean;
  add: boolean;
  setAdd: (value: boolean) => void;
  zoom: number;
  setZoom: (value: number) => void;
  fit: () => void;
  filter: number;
  setFilter: (value: number) => void;
  follow: boolean;
  setFollow: (value: boolean) => void;
  reset: () => void;
}) {
  const { removed, modified, manual } = useMemo(() => {
    const sourceIds = new Set(editor.original.map((note) => note.id)),
      workingIds = new Set(editor.notes.map((note) => note.id));
    return {
      removed: editor.original.filter((note) => !workingIds.has(note.id))
        .length,
      modified: editor.notes.filter(
        (note) => sourceIds.has(note.id) && editor.metadata[note.id]?.edited,
      ).length,
      manual: editor.notes.filter(
        (note) => editor.metadata[note.id]?.origin === "manual",
      ).length,
    };
  }, [editor.original, editor.notes, editor.metadata]);
  return (
    <div className="pr-toolbar">
      <div className="pr-summary">
        <strong>{editor.dirty ? "수정됨" : "AI 분석 원본"}</strong>
        <span>
          총 음표 <b data-testid="working-count">{editor.notes.length}</b> · AI
          원본 {editor.original.length} · 삭제 {removed} · 직접 추가 {manual} ·
          수정 {modified}
        </span>
      </div>
      <div className="pr-tools">
        <button
          className="button"
          disabled={disabled || !editor.past.length}
          onClick={() => editor.dispatch({ type: "undo" })}
        >
          ↶ 실행 취소
        </button>
        <button
          className="button"
          disabled={disabled || !editor.future.length}
          onClick={() => editor.dispatch({ type: "redo" })}
        >
          ↷ 다시 실행
        </button>
        <button
          className="button"
          aria-pressed={add}
          disabled={disabled}
          onClick={() => setAdd(!add)}
        >
          음표 추가
        </button>
        <button className="button" disabled={disabled} onClick={reset}>
          AI 분석본으로 되돌리기
        </button>
        <button
          className="button"
          aria-label="시간 축소"
          onClick={() => setZoom(Math.max(0.05, zoom / 1.5))}
        >
          −
        </button>
        <span data-testid="time-zoom">{zoom.toFixed(1)} px/초</span>
        <button
          className="button"
          aria-label="시간 확대"
          onClick={() => setZoom(Math.min(400, zoom * 1.5))}
        >
          +
        </button>
        <button className="button" onClick={fit}>
          전체 보기
        </button>
        <label>
          낮은 AI 강도 음표 보기
          <select
            aria-label="낮은 AI 강도 음표 보기"
            value={filter}
            onChange={(event) => setFilter(Number(event.target.value))}
          >
            <option value={1.01}>전체</option>
            <option value={0.3}>&lt; 30%</option>
            <option value={0.5}>&lt; 50%</option>
            <option value={0.7}>&lt; 70%</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />{" "}
          재생 위치 따라가기
        </label>
      </div>
    </div>
  );
}

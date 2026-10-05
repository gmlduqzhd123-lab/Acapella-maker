import { useState } from "react";
import type { NoteEditor } from "../../editor/useNoteEditor";
import { noteName as midiNoteName } from "../../music/noteNames";
export function NoteInspector({
  editor,
  disabled,
}: {
  editor: NoteEditor;
  disabled: boolean;
}) {
  const note = editor.notes.find((note) => note.id === editor.selectedNoteId);
  const [values, setValues] = useState(() => ({
    midi: note ? String(note.midi) : "",
    start: note ? String(note.start) : "",
    duration: note ? String(note.duration) : "",
  }));
  const [previous, setPrevious] = useState(note);
  if (previous !== note) {
    setPrevious(note);
    setValues({
      midi: note ? String(note.midi) : "",
      start: note ? String(note.start) : "",
      duration: note ? String(note.duration) : "",
    });
  }
  if (!note)
    return (
      <div className="pr-inspector">
        음표를 선택하면 음높이, 시작, 길이를 정밀하게 수정할 수 있습니다.
      </div>
    );
  const metadata = editor.metadata[note.id];
  function field(key: "midi" | "start" | "duration", label: string) {
    return (
      <label>
        {label}
        <input
          aria-label={label}
          type="number"
          step={key === "midi" ? 1 : 0.001}
          min={key === "duration" ? 0.03 : 0}
          max={key === "midi" ? 127 : editor.duration}
          value={values[key]}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            setValues((current) => ({ ...current, [key]: value }));
            if (value !== "" && Number.isFinite(Number(value)))
              editor.update(note!.id, { [key]: Number(value) });
          }}
          onBlur={() =>
            setValues({
              midi: String(note!.midi),
              start: String(note!.start),
              duration: String(note!.duration),
            })
          }
        />
      </label>
    );
  }
  return (
    <section className="pr-inspector" aria-label="선택 음표 정보">
      <div>
        <strong data-testid="selected-pitch">{midiNoteName(note.midi)}</strong>
        <small>
          {note.id} ·{" "}
          {metadata.origin === "manual"
            ? "직접 추가"
            : metadata.edited
              ? "AI 원본 → 사용자 수정"
              : "AI 원본"}
        </small>
      </div>
      {field("midi", "MIDI 음높이")}
      {field("start", "시작 (초)")}
      {field("duration", "길이 (초)")}
      <span>
        {metadata.origin === "manual"
          ? "직접 추가"
          : `AI 음표 강도 ${Math.round(note.confidence * 100)}%`}
      </span>
      <button
        className="button"
        disabled={disabled}
        onClick={() => editor.dispatch({ type: "delete", id: note.id })}
      >
        음표 삭제
      </button>
    </section>
  );
}

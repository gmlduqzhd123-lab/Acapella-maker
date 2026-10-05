import type { PointerEvent } from "react";
import type { NoteEvent } from "../../music/types";
import { noteName as midiNoteName } from "../../music/noteNames";
export function PianoNote({
  note,
  selected,
  manual,
  edited,
  zoom,
  rowHeight,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
}: {
  note: NoteEvent;
  selected: boolean;
  manual: boolean;
  edited: boolean;
  zoom: number;
  rowHeight: number;
  onPointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    note: NoteEvent,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      className={`pr-note ${selected ? "selected" : ""} ${manual ? "manual" : ""} ${edited ? "edited" : ""}`}
      data-note-id={note.id}
      data-midi={note.midi}
      data-start={note.start}
      data-duration={note.duration}
      data-confidence={note.confidence}
      aria-label={`${midiNoteName(note.midi)}, 시작 ${note.start.toFixed(3)}초, 길이 ${note.duration.toFixed(3)}초${manual ? ", 직접 추가" : ""}`}
      aria-pressed={selected}
      style={{
        left: note.start * zoom,
        top: (127 - note.midi) * rowHeight + 1,
        width: Math.max(3, note.duration * zoom),
        height: rowHeight - 2,
        opacity: manual || selected ? 1 : 0.5 + note.confidence * 0.5,
      }}
      onClick={onSelect}
      onPointerDown={(event) => onPointerDown(event, note)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="pr-resize left" data-edge="left" aria-hidden="true" />
      <span className="pr-note-name">{midiNoteName(note.midi)}</span>
      <span className="pr-resize right" data-edge="right" aria-hidden="true" />
    </button>
  );
}

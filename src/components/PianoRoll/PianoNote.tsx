import type { PointerEvent } from "react";
import type { NoteEvent } from "../../music/types";
import { noteName as midiNoteName } from "../../music/noteNames";
import type { VoiceRole } from "../../voices/types";
import { VOICE_LABELS, VOICE_NAMES } from "../../voices/types";
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
  voice,
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
  voice?: VoiceRole;
}) {
  return (
    <button
      className={`pr-note ${selected ? "selected" : ""} ${manual ? "manual" : ""} ${edited ? "edited" : ""} ${voice ? `voice-colored voice-${voice}` : ""}`}
      data-voice={voice}
      data-note-id={note.id}
      data-midi={note.midi}
      data-start={note.start}
      data-duration={note.duration}
      data-confidence={note.confidence}
      data-velocity={note.velocity}
      aria-label={`${midiNoteName(note.midi)}, 시작 ${note.start.toFixed(3)}초, 길이 ${note.duration.toFixed(3)}초${manual ? ", 직접 추가" : ""}${voice ? `, ${VOICE_NAMES[voice]}` : ""}`}
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
      <span className="pr-note-name">
        {voice ? `${VOICE_LABELS[voice]} · ` : ""}
        {midiNoteName(note.midi)}
      </span>
      <span className="pr-resize right" data-edge="right" aria-hidden="true" />
    </button>
  );
}

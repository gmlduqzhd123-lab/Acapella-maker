import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { NoteEvent } from "../../music/types";
import type { NoteEditor } from "../../editor/useNoteEditor";
import {
  clamp,
  constrainNote,
  MIN_DURATION,
  pitchRange,
} from "../../editor/noteMath";
import { noteName as midiNoteName } from "../../music/noteNames";
import { ConfirmDialog } from "../ConfirmDialog";
import { NoteInspector } from "./NoteInspector";
import { PianoToolbar } from "./PianoToolbar";
import { PianoNote } from "./PianoNote";
import "./pianoRoll.css";
import type { RhythmController } from "../../quantization/useRhythm";
import { QuantizationPanel } from "./QuantizationPanel";
import { BeatGrid } from "./BeatGrid";
import { useBeatMarks } from "../../quantization/useBeatMarks";
import { snapEditingNote } from "../../quantization/snapEdit";
import { RESOLUTION_TICKS } from "../../quantization/grid";
import { secondsPerQuarter } from "../../quantization/timeConversion";
import type { VoiceController } from "../../voices/useVoices";
import type { VoiceRole } from "../../voices/types";
import { VoicePanel } from "../voices/VoicePanel";
const KEYS = 64,
  HEADER = 32;
interface Gesture {
  note: NoteEvent;
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
  edge: string | undefined;
  preview: NoteEvent;
}
export function PianoRoll({
  editor,
  disabled,
  currentTime,
  playing,
  seek,
  rhythm,
  voices,
  stopOriginal,
}: {
  editor: NoteEditor;
  disabled: boolean;
  currentTime: number;
  playing: boolean;
  seek: (time: number) => void;
  rhythm: RhythmController;
  voices: VoiceController;
  stopOriginal: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<NoteEvent | null>(null);
  const [zoom, setZoom] = useState(80);
  const [rowHeight, setRowHeight] = useState(24);
  const [add, setAdd] = useState(false);
  const [filter, setFilter] = useState(1.01);
  const [voiceFilter, setVoiceFilter] = useState<VoiceRole | "all">("all");
  const [follow, setFollow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [view, setView] = useState({
    left: 0,
    top: 0,
    width: 800,
    height: 480,
  });
  const manualScrollUntil = useRef(0);
  const initializedSource = useRef<NoteEvent[] | null>(null);
  function refreshView() {
    const element = viewport.current;
    if (element)
      setView({
        left: element.scrollLeft,
        top: element.scrollTop,
        width: element.clientWidth,
        height: element.clientHeight,
      });
  }
  function fit() {
    const element = viewport.current;
    if (!element) return;
    setZoom(
      clamp((element.clientWidth - KEYS - 12) / editor.duration, 0.05, 400),
    );
    const range = pitchRange(editor.notes);
    const fittedRow = Math.floor(
      clamp(
        (element.clientHeight - HEADER - 8) / (range.high - range.low + 1),
        4,
        24,
      ),
    );
    setRowHeight(fittedRow);
    element.scrollTop = (127 - range.high) * fittedRow;
    element.scrollLeft = 0;
    refreshView();
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (initializedSource.current !== editor.original) {
      initializedSource.current = editor.original;
      element.scrollTop = (127 - pitchRange(editor.original).high) * rowHeight;
    }
    const observer = new ResizeObserver(refreshView);
    observer.observe(element);
    refreshView();
    return () => observer.disconnect();
  }, [editor.original, rowHeight]);
  useEffect(() => {
    if (!follow || !playing || performance.now() < manualScrollUntil.current)
      return;
    const element = viewport.current;
    const x = KEYS + currentTime * zoom;
    if (
      element &&
      (x > element.scrollLeft + element.clientWidth - 24 ||
        x < element.scrollLeft + KEYS)
    )
      element.scrollLeft = Math.max(0, x - KEYS - 40);
  }, [currentTime, playing, follow, zoom]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        disabled ||
        target.closest("input,select,textarea,[contenteditable],dialog")
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        editor.dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        editor.selectedNoteId
      ) {
        event.preventDefault();
        editor.dispatch({ type: "delete", id: editor.selectedNoteId });
      } else if (event.key === "Escape") {
        gesture.current = null;
        setPreview(null);
        setAdd(false);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [editor, disabled]);
  const visible = useMemo(
    () =>
      editor.notes.filter((note) => {
        const y = (127 - note.midi) * rowHeight;
        return (
          (!voices.result ||
            voiceFilter === "all" ||
            voices.map[note.id]?.voice === voiceFilter) &&
          (editor.metadata[note.id]?.origin === "manual" ||
            note.confidence < filter) &&
          (note.id === editor.selectedNoteId ||
            (y + rowHeight >= view.top - rowHeight &&
              y <= view.top + view.height &&
              KEYS + (note.start + note.duration) * zoom >= view.left - 30 &&
              KEYS + note.start * zoom <= view.left + view.width + 30))
        );
      }),
    [
      editor.notes,
      editor.metadata,
      editor.selectedNoteId,
      filter,
      view,
      zoom,
      rowHeight,
      voices.result,
      voices.map,
      voiceFilter,
    ],
  );
  const rows = Array.from({ length: 128 }, (_, i) => 127 - i).filter(
    (midi) =>
      (127 - midi) * rowHeight + rowHeight >= view.top - rowHeight &&
      (127 - midi) * rowHeight <= view.top + view.height,
  );
  const tickStep = Math.max(0.1, 10 ** Math.floor(Math.log10(80 / zoom)));
  const step = tickStep * (tickStep * zoom < 40 ? 5 : 1);
  const first = Math.max(0, Math.floor((view.left - KEYS) / zoom / step));
  const ticks = Array.from(
    { length: Math.min(100, Math.ceil(view.width / zoom / step) + 3) },
    (_, i) => (first + i) * step,
  ).filter((time) => time <= editor.duration);
  const beatMarks = useBeatMarks(
    view.left,
    view.width,
    zoom,
    editor.duration,
    rhythm.settings,
    rhythm.showGrid,
  );
  const ghosts = useMemo(
    () =>
      rhythm.preview?.notes.filter((note) => {
        const y = (127 - note.midi) * rowHeight;
        return (
          y + rowHeight >= view.top - rowHeight &&
          y <= view.top + view.height &&
          KEYS + (note.startSeconds + note.durationSeconds) * zoom >=
            view.left - 30 &&
          KEYS + note.startSeconds * zoom <= view.left + view.width + 30
        );
      }) ?? [],
    [rhythm.preview, rowHeight, view, zoom],
  );
  function point(event: { clientX: number; clientY: number }) {
    const box = world.current!.getBoundingClientRect();
    return {
      start: clamp(
        (event.clientX - box.left - KEYS) / zoom,
        0,
        editor.duration,
      ),
      midi: Math.round(
        clamp(
          127 - Math.floor((event.clientY - box.top - HEADER) / rowHeight),
          0,
          127,
        ),
      ),
    };
  }
  function down(event: PointerEvent<HTMLButtonElement>, note: NoteEvent) {
    if (disabled || event.pointerType === "touch" || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    editor.dispatch({ type: "select", id: note.id });
    gesture.current = {
      note,
      x: event.clientX,
      y: event.clientY,
      scrollX: viewport.current!.scrollLeft,
      scrollY: viewport.current!.scrollTop,
      edge: (event.target as HTMLElement).dataset.edge,
      preview: note,
    };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current;
    if (!drag || disabled) return;
    const dx =
      (event.clientX - drag.x + viewport.current!.scrollLeft - drag.scrollX) /
      zoom;
    const dy = Math.round(
      (event.clientY - drag.y + viewport.current!.scrollTop - drag.scrollY) /
        rowHeight,
    );
    const end = drag.note.start + drag.note.duration;
    let note: NoteEvent;
    if (drag.edge === "right")
      note = {
        ...drag.note,
        duration: clamp(
          drag.note.duration + dx,
          MIN_DURATION,
          editor.duration - drag.note.start,
        ),
      };
    else if (drag.edge === "left") {
      const start = clamp(drag.note.start + dx, 0, end - MIN_DURATION);
      note = { ...drag.note, start, duration: end - start };
    } else
      note = constrainNote(
        {
          ...drag.note,
          start: Math.round((drag.note.start + dx) * 1000) / 1000,
          midi: drag.note.midi - dy,
        },
        editor.duration,
        Math.min(MIN_DURATION, drag.note.duration),
      );
    if (rhythm.snap !== "off" && rhythm.settings.bpm)
      note = snapEditingNote(
        note,
        drag.note,
        drag.edge,
        rhythm.settings,
        rhythm.snap,
        editor.duration,
      );
    drag.preview = note;
    setPreview(note);
  }
  function up() {
    const drag = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (drag && drag.preview !== drag.note && !disabled)
      editor.dispatch({
        type: "update",
        id: drag.note.id,
        patch: {
          start: drag.preview.start,
          duration: drag.preview.duration,
          midi: drag.preview.midi,
        },
        duration: editor.duration,
        minimumDuration:
          rhythm.snap !== "off" && rhythm.settings.bpm
            ? Math.min(
                MIN_DURATION,
                (RESOLUTION_TICKS[rhythm.snap] / 960) *
                  secondsPerQuarter(rhythm.settings),
              )
            : drag.edge
              ? MIN_DURATION
              : Math.min(MIN_DURATION, drag.note.duration),
      });
  }
  return (
    <section className="piano-roll" aria-label="Piano Roll 편집기">
      <PianoToolbar
        editor={editor}
        disabled={disabled}
        add={add}
        setAdd={setAdd}
        zoom={zoom}
        setZoom={setZoom}
        fit={fit}
        filter={filter}
        setFilter={setFilter}
        follow={follow}
        setFollow={setFollow}
        reset={() => (editor.dirty ? setConfirm(true) : editor.reset())}
      />
      <QuantizationPanel
        rhythm={rhythm}
        currentTime={currentTime}
        duration={editor.duration}
        disabled={disabled}
      />
      <VoicePanel
        voices={voices}
        editor={editor}
        filter={voiceFilter}
        setFilter={setVoiceFilter}
        seek={(time, noteId) => {
          seek(time);
          const element = viewport.current,
            note = editor.notes.find((n) => n.id === noteId);
          if (element) {
            element.scrollLeft = Math.max(
              0,
              KEYS + time * zoom - element.clientWidth * 0.4,
            );
            if (note)
              element.scrollTop = Math.max(
                0,
                (127 - note.midi) * rowHeight - element.clientHeight / 2,
              );
            refreshView();
          }
        }}
        currentTime={currentTime}
        stopOriginal={stopOriginal}
        disabled={disabled}
      />
      <p className="pr-help">
        초 단위 자유 편집 · 음표를 드래그해 이동 · 양쪽 끝에서 길이 조절 ·{" "}
        {add
          ? "빈 공간을 클릭해 음표 추가"
          : "시간 눈금 또는 빈 공간을 클릭해 재생 위치 이동"}
        <span>정밀 편집은 PC 사용을 권장합니다.</span>
      </p>
      <div
        className="pr-viewport"
        data-row-height={rowHeight}
        ref={viewport}
        onScroll={refreshView}
        onWheel={() => {
          manualScrollUntil.current = performance.now() + 3000;
        }}
        onPointerDown={() => {
          manualScrollUntil.current = performance.now() + 3000;
        }}
      >
        <div
          className="pr-world"
          ref={world}
          style={{
            width: KEYS + editor.duration * zoom,
            height: HEADER + 128 * rowHeight,
          }}
        >
          <div
            className={`pr-timeline ${beatMarks.length ? "has-rhythm" : ""}`}
            style={{ height: HEADER }}
            onClick={(event) => {
              seek(point(event).start);
            }}
            aria-label="Piano Roll 시간 눈금"
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={editor.duration}
            aria-valuenow={currentTime}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                seek(
                  clamp(
                    currentTime + (event.key === "ArrowRight" ? 1 : -1),
                    0,
                    editor.duration,
                  ),
                );
              }
            }}
          >
            {ticks.map((time) => (
              <span key={time} style={{ left: KEYS + time * zoom }}>
                {zoom >= 60
                  ? time.toFixed(1)
                  : `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`}
              </span>
            ))}
            {beatMarks
              .filter((mark) => mark.kind === "measure")
              .map((mark) => (
                <b
                  className="pr-measure-label"
                  data-measure={mark.measure}
                  key={mark.tick}
                  style={{ left: KEYS + mark.seconds * zoom }}
                >
                  {mark.pickup
                    ? `Pickup ${mark.measure}`
                    : `${mark.measure}마디`}
                </b>
              ))}
          </div>
          <div className="pr-keys" style={{ height: 128 * rowHeight }}>
            {rows.map((midi) => (
              <div
                key={midi}
                className={`pr-key ${[1, 3, 6, 8, 10].includes(midi % 12) ? "black" : ""}`}
                style={{
                  top: (127 - midi) * rowHeight,
                  height: rowHeight,
                  lineHeight: `${rowHeight}px`,
                  fontSize: Math.min(11, rowHeight * 0.65),
                }}
              >
                {midiNoteName(midi)}
              </div>
            ))}
          </div>
          <div
            className="pr-grid"
            style={{
              left: KEYS,
              top: HEADER,
              width: editor.duration * zoom,
              height: 128 * rowHeight,
              backgroundSize: `${zoom}px ${rowHeight}px`,
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget || disabled) return;
              const position = point(event);
              if (add)
                editor.dispatch({
                  type: "add",
                  ...position,
                  duration: editor.duration,
                });
              else {
                editor.dispatch({ type: "select", id: null });
                seek(position.start);
              }
            }}
          >
            <BeatGrid marks={beatMarks} zoom={zoom} />
            {ghosts.map((note) => (
              <div
                key={note.id}
                className={`pr-ghost ${note.movementMs >= 100 ? "warning" : note.movementMs >= 50 ? "review" : ""}`}
                data-source-id={note.id}
                data-start-tick={note.startTick}
                data-duration-ticks={note.durationTicks}
                data-measure={note.measure}
                data-beat={note.beat}
                aria-label={`예정 음표 ${midiNoteName(note.midi)}, ${note.measure}마디 ${note.beat.toFixed(2)}박`}
                style={{
                  left: note.startSeconds * zoom,
                  top: (127 - note.midi) * rowHeight + 1,
                  width: Math.max(3, note.durationSeconds * zoom),
                  height: rowHeight - 2,
                }}
              />
            ))}
            {visible.map((original) => {
              const note = preview?.id === original.id ? preview : original;
              const metadata = editor.metadata[note.id];
              return (
                <PianoNote
                  voice={voices.map[note.id]?.voice}
                  key={note.id}
                  note={note}
                  selected={editor.selectedNoteId === note.id}
                  manual={metadata.origin === "manual"}
                  edited={metadata.edited}
                  zoom={zoom}
                  rowHeight={rowHeight}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={() => {
                    gesture.current = null;
                    setPreview(null);
                  }}
                  onSelect={() =>
                    editor.dispatch({ type: "select", id: note.id })
                  }
                />
              );
            })}
            <div
              className="pr-playhead"
              data-testid="piano-playhead"
              data-time={currentTime}
              style={{ left: currentTime * zoom }}
            />
          </div>
        </div>
      </div>
      <NoteInspector editor={editor} disabled={disabled} voices={voices} />
      {confirm && (
        <ConfirmDialog
          message="지금까지 수정한 음표가 모두 초기화됩니다."
          action="AI 분석본으로 되돌리기"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            gesture.current = null;
            setPreview(null);
            editor.reset();
            setConfirm(false);
          }}
        />
      )}
    </section>
  );
}

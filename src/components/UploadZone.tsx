import { useRef, useState } from "react";
import { Icon } from "./Icon";

export function UploadZone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`drop-zone ${dragging ? "dragging" : ""}`}
      aria-busy={busy}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!busy) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="upload-icon">
        <Icon name="upload" size={28} />
      </div>
      <h3>
        {busy
          ? "음원을 읽고 있습니다…"
          : "분석할 음악 또는 영상을 여기에 놓아주세요."}
      </h3>
      <p>
        {busy
          ? "브라우저 안에서 오디오를 준비하고 있습니다."
          : "첫 단계에서는 WAV · MP3 음악 파일을 지원합니다."}
      </p>
      <button
        type="button"
        className="button primary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Icon name="plus" size={17} /> {busy ? "파일 준비 중" : "파일 선택"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".wav,.mp3,audio/wav,audio/mpeg"
        aria-label="음악 파일 선택"
        disabled={busy}
        className="file-input"
        onChange={(event) => {
          if (event.target.files) onFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
      <small>한 번에 1개 · 최대 50 MB · 최대 10분</small>
    </div>
  );
}

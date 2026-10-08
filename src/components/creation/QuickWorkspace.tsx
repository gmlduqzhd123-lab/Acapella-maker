import { useState } from "react";
import type { LoadedAudio } from "../../audio/types";
import type { useMusicAnalysis } from "../../analysis/useMusicAnalysis";
import type { NoteEditor } from "../../editor/useNoteEditor";
import type { RhythmController } from "../../quantization/useRhythm";
import type { QuickDraftController } from "../../creation/useQuickDraft";
import type { TeamSettings } from "../../creation/team";
import type { TransportState } from "../AudioPlayer";
import { UploadZone } from "../UploadZone";
import { formatTime } from "../../audio/format";
import { TeamSetup } from "./TeamSetup";
import { TeamTemplateDownload } from "./TeamTemplateDownload";
import { QuickExport } from "./QuickExport";
import "./creation.css";
export function QuickWorkspace({
  audio,
  analysis,
  editor,
  rhythm,
  quick,
  team,
  setTeam,
  importing,
  onFiles,
  onRemove,
  onStart,
  onAdvanced,
  onPlay,
  transport,
  seek,
  error,
}: {
  audio: LoadedAudio | null;
  analysis: ReturnType<typeof useMusicAnalysis>;
  editor: NoteEditor;
  rhythm: RhythmController;
  quick: QuickDraftController;
  team: TeamSettings;
  setTeam: (team: TeamSettings) => void;
  importing: boolean;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
  onStart: () => void;
  onAdvanced: () => void;
  onPlay: () => void;
  transport: TransportState;
  seek: (time: number) => void;
  error: string;
}) {
  const [tempo, setTempo] = useState("");
  const busy = importing || quick.busy || analysis.busy;
  const message = quick.busy
    ? quick.phase === "analyzing"
      ? "음원에서 음표를 찾고 있습니다…"
      : "초안의 리듬을 정리하고 있습니다…"
    : quick.phase === "error"
      ? "초안을 만들지 못했습니다. 안내를 확인해 주세요."
      : quick.phase === "tempo"
        ? "곡의 빠르기를 확인해 주세요."
        : quick.phase === "cancelled"
          ? "초안 생성을 취소했습니다."
          : rhythm.applied && editor.notes.length
            ? "음표 초안 준비 완료"
            : "음원을 넣고 초안을 만들어 주세요.";
  return (
    <div className="quick-workspace">
      <nav aria-label="초안 생성 순서" className="quick-steps">
        <span>1 음악 넣기</span>
        <span>2 초안 확인</span>
        <span>3 NWC 받기</span>
      </nav>
      <section className="panel quick-input" aria-label="음원 넣기">
        <UploadZone onFiles={onFiles} busy={importing} />
        {audio && (
          <div className="quick-file">
            <strong>{audio.metadata.name}</strong>
            <span>{formatTime(audio.metadata.duration)}</span>
            <button className="button" disabled={importing} onClick={onRemove}>
              파일 제거
            </button>
            <button className="button" onClick={onPlay}>
              {transport.playing ? "원본 일시정지" : "원본 듣기"}
            </button>
            <input
              aria-label="간편 원본 재생 위치"
              type="range"
              min={0}
              max={audio.metadata.duration}
              step={0.01}
              value={transport.currentTime}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="creation-error">
            {error}
          </p>
        )}
      </section>
      <section className="panel quick-main">
        <TeamSetup team={team} onChange={setTeam} disabled={busy} />
        <TeamTemplateDownload team={team} disabled={busy} />
        <div className="quick-generate">
          <button
            className="button primary"
            disabled={!audio || busy}
            onClick={onStart}
          >
            악보 초안 만들기
          </button>
          {quick.busy && (
            <button className="button" onClick={quick.cancel}>
              초안 생성 취소
            </button>
          )}
          <p role="status">{message}</p>
          {quick.busy && (
            <progress
              max={1}
              value={
                quick.phase === "analyzing"
                  ? analysis.progress.fraction * 0.9
                  : 0.95
              }
              aria-label="초안 생성 진행률"
            />
          )}
        </div>
        {(quick.error || analysis.error) && (
          <p className="creation-error" role="alert">
            {quick.error || analysis.error}
          </p>
        )}
        {quick.phase === "tempo" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void quick.run(team, Number(tempo));
            }}
          >
            <label>
              곡의 빠르기 (BPM)
              <input
                aria-label="초안 BPM"
                type="number"
                min={40}
                max={240}
                required
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
              />
            </label>
            <p className="creation-note">
              자동으로 빠르기를 확인하지 못했습니다. 임의의 값으로 대체하지
              않습니다.
            </p>
            <button className="button" type="submit">
              BPM 적용하고 계속
            </button>
          </form>
        )}
        {audio && (
          <QuickExport
            notes={editor.notes}
            rhythm={rhythm}
            musicalKey={analysis.effective?.key ?? null}
            filename={audio.metadata.name}
            duration={audio.metadata.duration}
            busy={busy}
            onAdvanced={onAdvanced}
          />
        )}
      </section>
    </div>
  );
}

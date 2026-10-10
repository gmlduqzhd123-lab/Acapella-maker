import { useCallback, useEffect, useRef, useState } from "react";
import { loadLocalAudio } from "./audio/loadAudio";
import { AudioImportError } from "./audio/validation";
import type { LoadedAudio } from "./audio/types";
import { AudioPlayer } from "./components/AudioPlayer";
import { FileInfo } from "./components/FileInfo";
import { AnalysisControls } from "./components/AnalysisControls";
import { AnalysisResults } from "./components/AnalysisResults";
import { PitchSummary } from "./components/PitchSummary";
import { useMusicAnalysis } from "./analysis/useMusicAnalysis";
import { Icon } from "./components/Icon";
import { UploadZone } from "./components/UploadZone";
import { useNoteEditor } from "./editor/useNoteEditor";
import { PianoRoll } from "./components/PianoRoll/PianoRoll";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { TransportState } from "./components/AudioPlayer";
import { useRhythm } from "./quantization/useRhythm";
import { ExportPanel } from "./components/ExportPanel";
import { useVoices } from "./voices/useVoices";
import { useQuickDraft } from "./creation/useQuickDraft";
import { DEFAULT_TEAM } from "./creation/team";
import type { TeamSettings } from "./creation/team";
import { QuickWorkspace } from "./components/creation/QuickWorkspace";
import "./App.css";

function App() {
  const analysis = useMusicAnalysis();
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"audio" | "piano">("audio");
  const [reanalyze, setReanalyze] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [team, setTeam] = useState<TeamSettings>(DEFAULT_TEAM);
  const [quickConfirm, setQuickConfirm] = useState(false);
  const [transport, setTransport] = useState<TransportState>({
    currentTime: 0,
    duration: 0,
    playing: false,
  });
  const player = useRef<HTMLAudioElement>(null);
  const onPlayerReady = useCallback((element: HTMLAudioElement | null) => {
    player.current = element;
  }, []);
  const editor = useNoteEditor(
    analysis.result?.pitch ? analysis.result.notes : null,
    audio?.metadata.duration ?? 0,
  );
  const rhythm = useRhythm(
    editor,
    analysis.effective?.bpm ?? null,
    audio?.objectUrl ?? "empty",
  );
  const voices = useVoices(editor, rhythm);
  const quick = useQuickDraft(audio, analysis, editor, rhythm);
  function togglePlayback() {
    if (player.current?.paused)
      void player.current
        .play()
        .catch(() =>
          setError("원본을 재생하지 못했습니다. 다시 시도해 주세요."),
        );
    else player.current?.pause();
  }
  function seek(time: number) {
    if (player.current) {
      player.current.currentTime = time;
      setTransport((value) => ({ ...value, currentTime: time }));
    }
  }
  function startAnalysis() {
    if (audio) void analysis.start(audio.buffer);
  }
  const activeAudio = useRef<LoadedAudio | null>(null);
  const activeJob = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  useEffect(
    () => () => {
      activeJob.current?.abort();
      if (activeAudio.current)
        URL.revokeObjectURL(activeAudio.current.objectUrl);
      activeAudio.current = null;
    },
    [],
  );
  async function importFiles(files: File[]) {
    if (busyRef.current) return;
    quick.reset();
    setQuickConfirm(false);
    analysis.cancel();
    if (files.length !== 1) {
      setError("한 번에 하나의 음악 파일을 선택해 주세요.");
      return;
    }
    const controller = new AbortController();
    activeJob.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const loaded = await loadLocalAudio(files[0], controller.signal);
      analysis.reset();
      setTab("audio");
      setReanalyze(false);
      setTransport({
        currentTime: 0,
        duration: loaded.metadata.duration,
        playing: false,
      });
      if (activeAudio.current)
        URL.revokeObjectURL(activeAudio.current.objectUrl);
      activeAudio.current = loaded;
      setAudio(loaded);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof AudioImportError
            ? reason.message
            : "음원을 준비하지 못했습니다. 더 작은 파일로 다시 시도해 주세요.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      busyRef.current = false;
      if (activeJob.current === controller) activeJob.current = null;
    }
  }
  function removeAudio() {
    if (busyRef.current) return;
    quick.reset();
    setQuickConfirm(false);
    analysis.reset();
    setTab("audio");
    setReanalyze(false);
    setTransport({ currentTime: 0, duration: 0, playing: false });
    if (activeAudio.current) URL.revokeObjectURL(activeAudio.current.objectUrl);
    activeAudio.current = null;
    setAudio(null);
    setError("");
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <Icon name="music" size={22} />
          </span>
          AcaScore <span className="ai-label">AI</span>
        </a>
        <span className="topbar-caption">YOUR A CAPPELLA WORKSPACE</span>
        <span className="privacy-pill" title="내 기기에서만 처리">
          <Icon name="shield" size={16} />
          <span className="privacy-text">내 기기에서만 처리</span>
        </span>
        <span className="topbar-actions">
          <button type="button" className="topbar-chip install" data-ys-install>
            📲 <span className="chip-wide">앱 </span>설치
          </button>
          <button
            type="button"
            className="topbar-chip"
            data-qr
            aria-label="QR 코드로 접속"
          >
            📱 QR
          </button>
        </span>
      </header>
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">FROM LISTENING TO SINGING</span>
            <h1>
              듣던 음악을,
              <br />
              <span>부를 수 있는 악보로.</span>
            </h1>
            <p>AI가 음악을 분석하고 아카펠라 악보 초안을 만들어드립니다.</p>
            <span className="stage-tag">
              <span /> 간편 음표 초안 · 5명 / 6명 팀 설정
            </span>
          </div>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              document.querySelector<HTMLElement>(".drop-zone button")?.click()
            }
          >
            <Icon name="plus" size={18} /> 새 악보 만들기
          </button>
        </section>
        <div className="mode-switch">
          <button
            className="button"
            disabled={quick.busy || analysis.busy || busy}
            onClick={() => {
              setAdvanced((value) => !value);
              setTab("audio");
            }}
          >
            {advanced ? "간편 화면" : "고급 편집"}
          </button>
          <span className="creation-note">
            {advanced
              ? "기존 분석·Piano Roll·SATB 편집 기능"
              : "파일을 넣고 한 번에 음표 초안을 만드세요."}
          </span>
        </div>
        {!advanced && (
          <QuickWorkspace
            audio={audio}
            analysis={analysis}
            editor={editor}
            rhythm={rhythm}
            quick={quick}
            team={team}
            setTeam={setTeam}
            importing={busy}
            onFiles={(files) => {
              void importFiles(files);
            }}
            onRemove={removeAudio}
            onStart={() => {
              if (editor.dirty) setQuickConfirm(true);
              else void quick.run(team);
            }}
            onAdvanced={() => {
              setAdvanced(true);
              setTab("piano");
            }}
            onPlay={togglePlayback}
            transport={transport}
            seek={seek}
            error={error}
          />
        )}
        <div className="workspace" hidden={!advanced}>
          <aside className="project-panel panel">
            <div className="panel-heading">
              <Icon name="file" />
              <h2>프로젝트</h2>
              <span className="tiny-tag">LOCAL</span>
            </div>
            {audio ? (
              <FileInfo
                metadata={audio.metadata}
                onRemove={removeAudio}
                busy={busy}
              />
            ) : (
              <div className="project-empty">
                <span className="project-symbol">
                  <Icon name="music" size={26} />
                </span>
                <strong>첫 음원을 기다리고 있어요</strong>
                <p>
                  음악을 불러오면 파일 정보를
                  <br />
                  이곳에서 확인할 수 있습니다.
                </p>
              </div>
            )}
            <AnalysisResults
              key={`${audio?.objectUrl ?? "empty"}:${analysis.status}`}
              automatic={analysis.result}
              effective={analysis.effective}
              overrides={analysis.overrides}
              setOverrides={analysis.setOverrides}
              busy={analysis.busy}
              progress={analysis.progress}
              hasAudio={!!audio}
            />
            <div className="local-note">
              <Icon name="shield" size={20} />
              <p>음원은 이 브라우저 안에만 머물며, 외부로 전송되지 않습니다.</p>
            </div>
          </aside>
          <section className="editor-panel panel">
            <div className="editor-toolbar">
              <div
                className="editor-tabs"
                role="tablist"
                aria-label="작업 화면"
              >
                <button
                  role="tab"
                  aria-selected={tab === "audio"}
                  className={`tab ${tab === "audio" ? "active" : ""}`}
                  onClick={() => setTab("audio")}
                >
                  음원 · 음악 분석
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "piano"}
                  disabled={!analysis.result?.pitch}
                  className={`tab ${tab === "piano" ? "active" : ""}`}
                  onClick={() => setTab("piano")}
                >
                  Piano Roll
                </button>
                <span className="tab upcoming">
                  악보 <small>준비 중</small>
                </span>
              </div>
              <span className="tiny-tag">ADVANCED</span>
            </div>
            <div className={`editor-body ${audio ? "has-audio" : ""}`}>
              <AnalysisControls
                status={analysis.status}
                progress={analysis.progress}
                hasAudio={!!audio}
                importing={busy}
                error={analysis.error}
                onStart={() => {
                  if (editor.dirty) setReanalyze(true);
                  else startAnalysis();
                }}
                onCancel={analysis.cancel}
              />
              {error && (
                <div className="error-message" role="alert">
                  <strong>파일을 불러오지 못했습니다</strong>
                  <p>{error}</p>
                  <button
                    aria-label="오류 메시지 닫기"
                    onClick={() => setError("")}
                  >
                    ×
                  </button>
                </div>
              )}
              <div hidden={tab !== "audio"}>
                {advanced && (
                  <UploadZone
                    onFiles={(files) => {
                      void importFiles(files);
                    }}
                    busy={busy}
                  />
                )}
                {audio ? (
                  <AudioPlayer
                    key={audio.objectUrl}
                    audio={audio}
                    onReady={onPlayerReady}
                    onTransport={setTransport}
                  />
                ) : (
                  <div className="audio-empty">
                    <Icon name="headphones" />
                    <div>
                      <strong>모든 편곡은 한 번의 듣기에서 시작됩니다.</strong>
                      <p>음원을 불러오면 여기에서 재생할 수 있어요.</p>
                    </div>
                  </div>
                )}
              </div>
              {tab === "piano" && audio && analysis.result?.pitch && (
                <>
                  <button
                    className="button"
                    onClick={() => {
                      if (player.current?.paused)
                        void player.current
                          .play()
                          .catch(() =>
                            setError(
                              "재생하지 못했습니다. 음원 화면에서 다시 시도해 주세요.",
                            ),
                          );
                      else player.current?.pause();
                    }}
                  >
                    {transport.playing
                      ? "원본 음원 일시정지"
                      : "원본 음원 재생"}
                  </button>
                  <PianoRoll
                    voices={voices}
                    stopOriginal={() => player.current?.pause()}
                    rhythm={rhythm}
                    editor={editor}
                    disabled={busy || analysis.busy}
                    currentTime={transport.currentTime}
                    playing={transport.playing}
                    seek={seek}
                  />
                  <ExportPanel
                    voices={voices}
                    filename={audio.metadata.name}
                    notes={editor.notes}
                    rhythm={rhythm}
                    musicalKey={analysis.effective?.key ?? null}
                    duration={audio.metadata.duration}
                    disabled={busy || analysis.busy}
                  />
                </>
              )}
              <PitchSummary result={analysis.result} />
              {audio && (
                <p className="pitch-length-note">
                  Pitch 분석은 긴 곡에서 시간이 걸릴 수 있습니다. 먼저 3분 이내
                  음원으로 확인해 보세요. 모델 파일만 이 사이트에서 내려받으며
                  음악은 전송하지 않습니다.
                </p>
              )}
            </div>
            <div className="editor-footer">
              <span className="status-dot" />
              {busy
                ? "브라우저에서 음원 처리 중…"
                : analysis.busy
                  ? "브라우저에서 BPM · Key · AI 음표 분석 중…"
                  : analysis.status === "complete"
                    ? "음악 분석 완료 · 자동 분석 결과를 확인해 주세요."
                    : audio
                      ? "음원 준비 완료 · 음악 분석을 시작할 수 있습니다."
                      : "음원을 불러와 시작하세요"}
              <span>브라우저 내 처리</span>
            </div>
          </section>
          <aside className="guide-panel panel">
            <span className="section-label">WORKFLOW</span>
            <h2>음원에서 악보까지</h2>
            <p className="guide-intro">
              작은 단계로 완성하는
              <br />
              나만의 아카펠라 편곡.
            </p>
            <ol className="workflow">
              <li className="current">
                <span>01</span>
                <div>
                  <strong>음원 준비</strong>
                  <p>파일 불러오기 · 재생</p>
                  <em>지금 사용 가능</em>
                </div>
              </li>
              <li className="current">
                <span>02</span>
                <div>
                  <strong>음악 분석</strong>
                  <p>BPM · Key · AI 음표 분석</p>
                  <em>지금 사용 가능</em>
                </div>
              </li>
              <li className="current">
                <span>03</span>
                <div>
                  <strong>음표 편집</strong>
                  <p>Piano Roll · 음표 직접 수정</p>
                  <em>지금 사용 가능</em>
                </div>
              </li>
              <li className="current">
                <span>04</span>
                <div>
                  <strong>악보 내보내기</strong>
                  <p>MIDI · NWCTXT</p>
                  <em>지금 사용 가능 · Beta</em>
                </div>
              </li>
            </ol>
            <div className="guide-tip">
              <Icon name="headphones" size={20} />
              <strong>좋은 시작을 위한 작은 팁</strong>
              <p>멜로디가 선명하게 들리는 짧은 음원으로 시작해 보세요.</p>
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>
            AcaScore AI <span className="footer-separator">/</span> 당신의 음악,
            당신의 공간.
          </span>
          <span>LOCAL FIRST · NO CLOUD UPLOAD</span>
        </footer>
      </main>
      {reanalyze && (
        <ConfirmDialog
          message="현재 수정한 음표가 있습니다. 다시 분석하면 음표 편집 내용이 초기화됩니다."
          action="다시 분석"
          onCancel={() => setReanalyze(false)}
          onConfirm={() => {
            setReanalyze(false);
            startAnalysis();
          }}
        />
      )}
      {quickConfirm && (
        <ConfirmDialog
          message="현재 수정한 음표가 있습니다. 초안을 다시 만들면 편집 내용이 초기화됩니다."
          action="초안 다시 만들기"
          onCancel={() => setQuickConfirm(false)}
          onConfirm={() => {
            setQuickConfirm(false);
            void quick.run(team);
          }}
        />
      )}
    </div>
  );
}
export default App;

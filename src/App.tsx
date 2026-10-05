import { useEffect, useRef, useState } from "react";
import { loadLocalAudio } from "./audio/loadAudio";
import { AudioImportError } from "./audio/validation";
import type { LoadedAudio } from "./audio/types";
import { AudioPlayer } from "./components/AudioPlayer";
import { FileInfo } from "./components/FileInfo";
import { Icon } from "./components/Icon";
import { UploadZone } from "./components/UploadZone";
import "./App.css";

function App() {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        <span className="privacy-pill">
          <Icon name="shield" size={16} /> 내 기기에서만 처리
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
              <span /> 첫 번째 단계 · 음원 준비
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
        <div className="workspace">
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
            <div className="analysis-section">
              <span className="section-label">분석 정보</span>
              <div className="metric">
                <span>BPM</span>
                <strong>—</strong>
              </div>
              <div className="metric">
                <span>Key</span>
                <strong>—</strong>
              </div>
              <p className="muted-note">
                음악 분석은 다음 개발 단계에서 연결됩니다.
              </p>
            </div>
            <div className="local-note">
              <Icon name="shield" size={20} />
              <p>음원은 이 브라우저 안에만 머물며, 외부로 전송되지 않습니다.</p>
            </div>
          </aside>
          <section className="editor-panel panel">
            <div className="editor-toolbar">
              <div>
                <span className="tab active">음원</span>
                <span className="tab upcoming">
                  Piano Roll <small>준비 중</small>
                </span>
                <span className="tab upcoming">
                  악보 <small>준비 중</small>
                </span>
              </div>
              <span className="tiny-tag">STEP 01</span>
            </div>
            <div className={`editor-body ${audio ? "has-audio" : ""}`}>
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
              <UploadZone
                onFiles={(files) => {
                  void importFiles(files);
                }}
                busy={busy}
              />
              {audio ? (
                <AudioPlayer key={audio.objectUrl} audio={audio} />
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
            <div className="editor-footer">
              <span className="status-dot" />
              {busy
                ? "브라우저에서 음원 처리 중…"
                : audio
                  ? "음원 준비 완료 · 분석 기능은 다음 단계에서 제공됩니다."
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
              <li>
                <span>02</span>
                <div>
                  <strong>음악 분석</strong>
                  <p>BPM · Key · Pitch</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>음표 편집</strong>
                  <p>Piano Roll · Quantization</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>악보 내보내기</strong>
                  <p>MIDI · NWCTXT</p>
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
    </div>
  );
}
export default App;

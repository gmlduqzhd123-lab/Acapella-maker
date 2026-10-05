import { useMemo, useState } from "react";
import type { MusicalKey, NoteEvent } from "../music/types";
import type { RhythmController } from "../quantization/useRhythm";
import { createExportSnapshot, STALE_EXPORT } from "../export/snapshot";
import { exportFilename, exportTitle } from "../export/filename";
import { exportNwctxt } from "../export/nwctxt/exporter";
import { downloadFile } from "../export/download";
import "./ExportPanel.css";

interface Props {
  filename: string;
  notes: NoteEvent[];
  rhythm: RhythmController;
  musicalKey: MusicalKey | null;
  duration: number;
  disabled: boolean;
}
export function ExportPanel({
  filename,
  notes,
  rhythm,
  musicalKey,
  duration,
  disabled,
}: Props) {
  const { settings, applied } = rhythm;
  const tonic = musicalKey?.tonic,
    mode = musicalKey?.mode,
    confidence = musicalKey?.confidence;
  const stableKey = useMemo(
    () =>
      tonic === undefined || mode === undefined
        ? null
        : { tonic, mode, confidence: confidence ?? 0 },
    [tonic, mode, confidence],
  );
  const current = useMemo(() => {
    try {
      return {
        snapshot: createExportSnapshot(
          exportTitle(filename),
          notes,
          settings,
          stableKey,
          applied,
          duration,
        ),
        error: "",
      };
    } catch (reason) {
      return {
        snapshot: null,
        error: reason instanceof Error ? reason.message : STALE_EXPORT,
      };
    }
  }, [filename, notes, settings, stableKey, applied, duration]);
  const nwc = useMemo(() => {
    if (!current.snapshot) return { result: null, error: "" };
    try {
      return { result: exportNwctxt(current.snapshot), error: "" };
    } catch (reason) {
      return {
        result: null,
        error:
          reason instanceof Error
            ? reason.message
            : "NWC 파일을 만들지 못했습니다.",
      };
    }
  }, [current]);
  const [receipt, setReceipt] = useState<{
    source: typeof current;
    message: string;
    error: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  async function saveMidi() {
    const snapshot = current.snapshot;
    if (!snapshot || saving || disabled) return;
    setSaving(true);
    try {
      const { exportMidi } = await import("../export/midiExporter");
      const bytes = exportMidi(snapshot);
      downloadFile(
        exportFilename(snapshot.title, "mid"),
        new Blob([new Uint8Array(bytes)], { type: "audio/midi" }),
      );
      setReceipt({
        source: current,
        message: "MIDI 파일을 다운로드했습니다.",
        error: false,
      });
    } catch (reason) {
      setReceipt({
        source: current,
        message:
          reason instanceof Error
            ? reason.message
            : "MIDI 파일을 만들지 못했습니다.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  }
  function saveNwc() {
    if (!current.snapshot || !nwc.result || disabled) return;
    downloadFile(
      exportFilename(current.snapshot.title, "nwctxt"),
      new Blob([nwc.result.text], { type: "text/plain;charset=utf-8" }),
    );
    setReceipt({
      source: current,
      message:
        "NWCTXT 파일을 다운로드했습니다. NoteWorthy Composer에서 열어 확인해 주세요.",
      error: false,
    });
  }
  const report = nwc.result?.report;
  return (
    <section className="export-panel" aria-label="악보 내보내기">
      <div className="export-heading">
        <div>
          <span className="section-label">EXPORT · WORKING NOTES</span>
          <h3>수정한 초안을 파일로</h3>
        </div>
        <span className="tiny-tag">NWCTXT BETA</span>
      </div>
      <p>
        현재 편집본과 적용된 박자 정리를 기준으로 내보냅니다. AI 원본은
        보존됩니다.
      </p>
      {current.error && <p className="export-warning">{current.error}</p>}
      <div className="export-buttons">
        <button
          className="button button-primary"
          disabled={!current.snapshot || disabled || saving}
          onClick={() => void saveMidi()}
        >
          MIDI 다운로드
        </button>
        <button
          className="button"
          disabled={!nwc.result || disabled || saving}
          onClick={saveNwc}
        >
          NWC 악보 받기 · Beta
        </button>
      </div>
      {nwc.error && (
        <p className="export-warning" role="alert">
          {nwc.error} Standard 또는 Strong으로 박자 정리를 다시 적용한 뒤 확인해
          주세요.
        </p>
      )}
      {report && (
        <>
          <dl className="export-stats">
            {Object.entries({
              Staff: report.staff,
              Notes: report.notes,
              Measures: report.measures,
              Chords: report.chords,
              Ties: report.ties,
              Warnings: report.warnings.length,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {!!report.warnings.length && (
            <details>
              <summary>내보내기 안내 {report.warnings.length}개</summary>
              <ul>
                {report.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {receipt?.source === current && (
        <p
          className={receipt.error ? "export-warning" : "export-receipt"}
          role={receipt.error ? "alert" : undefined}
        >
          {receipt.message}
        </p>
      )}
      <p className="export-help">
        .nwctxt 파일을 NoteWorthy Composer에서 열고, 필요하면 .nwc로 저장하세요.
        MIDI도 가져올 수 있지만 못갖춘마디와 악보 표기는 다시 정리해야 할 수
        있습니다. NWCTXT는 자동 구문 검증을 통과한 Beta이며, 실제 Windows
        NWC에서의 수동 확인은 남아 있습니다.
      </p>
      <details>
        <summary>NWC 수동 검증용 예제 받기</summary>
        <p>
          분석 결과와 별개인 합성 악보 예제입니다.
          음계·반음·화음·쉼표·점음표·붙임줄·못갖춘마디를 확인하세요.
        </p>
        <div className="export-buttons">
          {["4-4", "3-4", "6-8"].map((meter) => (
            <a
              key={meter}
              className="button"
              href={`${import.meta.env.BASE_URL}examples/acascore-nwc-test-${meter}.nwctxt`}
              download
            >
              {meter.replace("-", "/")} 예제
            </a>
          ))}
        </div>
      </details>
    </section>
  );
}

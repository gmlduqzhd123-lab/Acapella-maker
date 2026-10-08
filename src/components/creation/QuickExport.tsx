import { useMemo, useState } from "react";
import type { NoteEvent, MusicalKey } from "../../music/types";
import type { RhythmController } from "../../quantization/useRhythm";
import { createExportSnapshot } from "../../export/snapshot";
import { exportNwctxt } from "../../export/nwctxt/exporter";
import { exportFilename, exportTitle } from "../../export/filename";
import { downloadFile } from "../../export/download";
export function QuickExport({
  notes,
  rhythm,
  musicalKey,
  filename,
  duration,
  busy,
  onAdvanced,
}: {
  notes: NoteEvent[];
  rhythm: RhythmController;
  musicalKey: MusicalKey | null;
  filename: string;
  duration: number;
  busy: boolean;
  onAdvanced: () => void;
}) {
  const [receipt, setReceipt] = useState<object | null>(null);
  const tonic = musicalKey?.tonic,
    mode = musicalKey?.mode,
    confidence = musicalKey?.confidence;
  const key = useMemo(
    () =>
      tonic === undefined || mode === undefined
        ? null
        : { tonic, mode, confidence: confidence ?? 0 },
    [tonic, mode, confidence],
  );
  const result = useMemo(() => {
    if (!rhythm.applied) return { output: null, error: "" };
    try {
      const snapshot = createExportSnapshot(
        exportTitle(filename),
        notes,
        rhythm.settings,
        key,
        rhythm.applied,
        duration,
      );
      return { output: exportNwctxt(snapshot), error: "" };
    } catch (reason) {
      return {
        output: null,
        error:
          reason instanceof Error
            ? reason.message
            : "악보를 만들지 못했습니다.",
      };
    }
  }, [notes, rhythm.applied, rhythm.settings, key, filename, duration]);
  return (
    <section className="quick-result" aria-label="초안 확인 및 다운로드">
      <h2>초안 확인 · NWC 다운로드</h2>
      {notes.length ? (
        <p>
          현재 음표{" "}
          <strong data-testid="quick-note-count">{notes.length}</strong>개 ·{" "}
          {rhythm.applied
            ? `리듬 정리 적용 (${rhythm.settings.resolution === "eighth" ? "8" : "16"}분음표 기준)`
            : "음표 수정 후 리듬 정리가 필요합니다."}
        </p>
      ) : (
        <p>음원을 넣고 초안을 만들어 주세요.</p>
      )}
      <button
        className="button primary"
        disabled={!result.output || busy}
        onClick={() => {
          if (!result.output) return;
          downloadFile(
            exportFilename(exportTitle(filename), "nwctxt"),
            new Blob([result.output.text], {
              type: "text/plain;charset=utf-8",
            }),
          );
          setReceipt(result);
        }}
      >
        NWC에서 열 악보 받기
      </button>{" "}
      <button
        className="button"
        disabled={busy || !notes.length}
        onClick={onAdvanced}
      >
        음표 수정하기
      </button>
      {result.error && (
        <p role="alert" className="creation-error">
          {result.error} 고급 편집에서 음표와 박자 설정을 확인해 주세요.
        </p>
      )}
      {!!notes.length && !rhythm.applied && (
        <p className="creation-note">
          현재 편집 내용으로 초안을 다시 정리하거나 고급 편집에서 Quantization을
          적용해 주세요.
        </p>
      )}
      {receipt === result && result.output && (
        <p>
          NWCTXT를 다운로드했습니다. NoteWorthy Composer에서 열어 확인해 주세요.
        </p>
      )}
      <p className="creation-note">
        .nwctxt를 NWC에서 열고 .nwc로 저장할 수 있습니다. 자동 구문 검증을 거친
        Beta이며 실제 NWC의 악보·재생 확인은 남아 있습니다.
      </p>
    </section>
  );
}

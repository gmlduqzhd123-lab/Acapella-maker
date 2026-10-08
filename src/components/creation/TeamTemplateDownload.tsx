import { useState } from "react";
import type { TeamSettings } from "../../creation/team";
import { exportTeamTemplate } from "../../export/nwctxt/teamTemplate";
import { downloadFile } from "../../export/download";

export function TeamTemplateDownload({ team, disabled }: { team: TeamSettings; disabled: boolean }) {
  const [error, setError] = useState("");
  function download(sample: boolean) {
    try {
      const output = exportTeamTemplate(team, sample);
      downloadFile(`AcaScore-${team.singers}-${sample ? "notation-test" : "empty-team"}.nwctxt`,
        new Blob([output.text], { type: "text/plain;charset=utf-8" }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "팀 악보를 만들지 못했습니다.");
    }
  }
  return <details className="creation-note">
    <summary>팀 악보 틀 · NWC 표기 확인</summary>
    <p>현재 팀 설정에 맞는 빈 악보입니다. 음원 분석 결과나 자동 편곡이 아닙니다.
      5번 파트는 퍼커션 보표와 MIDI 채널 10을 사용합니다.</p>
    <button className="button" disabled={disabled} onClick={() => download(false)}>빈 팀 악보 받기</button>{" "}
    <button className="button" disabled={disabled} onClick={() => download(true)}>표기 검증 샘플 받기</button>
    <p>샘플은 한 마디의 검증용 음표입니다. B=킥, K=스네어, ts=하이햇.
      재생은 GM 드럼이며 보컬 퍼커션 음성이 아닙니다.</p>
    {error && <p role="alert">{error}</p>}
  </details>;
}

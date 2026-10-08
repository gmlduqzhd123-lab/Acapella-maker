import type { TeamSettings } from "../../creation/team";
import { teamParts } from "../../creation/team";
export function TeamSetup({
  team,
  onChange,
  disabled,
}: {
  team: TeamSettings;
  onChange: (team: TeamSettings) => void;
  disabled: boolean;
}) {
  return (
    <section aria-label="팀 구성" className="team-setup">
      <h2>우리 팀 구성</h2>
      <div className="team-fields">
        <label>
          노래할 인원
          <select
            aria-label="노래할 인원"
            disabled={disabled}
            value={team.singers}
            onChange={(e) =>
              onChange({ ...team, singers: Number(e.target.value) as 5 | 6 })
            }
          >
            <option value={5}>5명 · 기본</option>
            <option value={6}>6명 · 추가 보컬</option>
          </select>
        </label>
        <label>
          1번 파트
          <select
            aria-label="1번 파트"
            disabled={disabled}
            value={team.upper}
            onChange={(e) =>
              onChange({
                ...team,
                upper: e.target.value as TeamSettings["upper"],
              })
            }
          >
            <option value="soprano">소프라노</option>
            <option value="countertenor">카운터테너</option>
          </select>
        </label>
        <label>
          2번 파트
          <select
            aria-label="2번 파트"
            disabled={disabled}
            value={team.middle}
            onChange={(e) =>
              onChange({
                ...team,
                middle: e.target.value as TeamSettings["middle"],
              })
            }
          >
            <option value="alto">알토</option>
            <option value="tenor">테너</option>
          </select>
        </label>
        <label>
          음표 정리
          <select
            aria-label="음표 정리 난이도"
            disabled={disabled}
            value={team.difficulty}
            onChange={(e) =>
              onChange({
                ...team,
                difficulty: e.target.value as TeamSettings["difficulty"],
              })
            }
          >
            <option value="easy">쉽게 · 8분음표 단위</option>
            <option value="normal">보통 · 16분음표 단위</option>
          </select>
        </label>
      </div>
      <ol className="team-parts" aria-label="목표 파트 구성">
        {teamParts(team).map((part, i) => (
          <li key={part.id}>
            <span>{i + 1}</span>
            <strong>{part.name}</strong>
            <small>{part.role}</small>
          </li>
        ))}
      </ol>
      <p className="creation-note">
        팀 구성은 후속 편곡을 위한 목표입니다. 현재 다운로드는 검출 음표의 Draft
        Voice 초안이며, 5·6성부 편곡과 보컬 퍼커션 생성은 아직 포함하지
        않습니다.
      </p>
    </section>
  );
}

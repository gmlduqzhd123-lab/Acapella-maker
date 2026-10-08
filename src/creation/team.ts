export interface TeamSettings {
  singers: 5 | 6;
  upper: "soprano" | "countertenor";
  middle: "alto" | "tenor";
  difficulty: "easy" | "normal";
}
export const DEFAULT_TEAM: TeamSettings = {
  singers: 5,
  upper: "soprano",
  middle: "alto",
  difficulty: "easy",
};
/** A target arrangement plan, not inferred singers or generated musical parts. */
export function teamParts(team: TeamSettings) {
  return [
    {
      id: "part-1",
      name: team.upper === "soprano" ? "소프라노" : "카운터테너",
      role: "상성부·선율",
    },
    {
      id: "part-2",
      name: team.middle === "alto" ? "알토" : "테너",
      role: "중간 화성·대선율",
    },
    { id: "part-3", name: "바리톤", role: "중저음 연결" },
    { id: "part-4", name: "베이스", role: "저음 진행" },
    { id: "part-5", name: "보컬 퍼커션", role: "별도 리듬 생성 예정" },
    ...(team.singers === 6
      ? [{ id: "part-6", name: "추가 보컬", role: "화성·대선율 보강 예정" }]
      : []),
  ];
}

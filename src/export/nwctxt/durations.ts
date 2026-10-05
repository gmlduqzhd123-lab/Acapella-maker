export const UNSUPPORTED_DURATION =
  "현재 박자 정리 결과에는 NWC 음가로 정확하게 표현할 수 없는 음표가 있습니다.";
export const DURATION_TOKENS = [
  { ticks: 3840, syntax: "Whole" },
  { ticks: 2880, syntax: "Half,Dotted" },
  { ticks: 1920, syntax: "Half" },
  { ticks: 1440, syntax: "4th,Dotted" },
  { ticks: 960, syntax: "4th" },
  { ticks: 720, syntax: "8th,Dotted" },
  { ticks: 480, syntax: "8th" },
  { ticks: 360, syntax: "16th,Dotted" },
  { ticks: 240, syntax: "16th" },
  { ticks: 180, syntax: "32nd,Dotted" },
  { ticks: 120, syntax: "32nd" },
  { ticks: 60, syntax: "64th" },
] as const;
/** Exact dynamic programming (not unchecked greedy). Bar segments max3840. */
export function decomposeDuration(ticks: number) {
  if (
    !Number.isSafeInteger(ticks) ||
    ticks <= 0 ||
    ticks % 60 ||
    ticks > 10_000_000
  )
    throw new Error(UNSUPPORTED_DURATION);
  const result: Array<{ ticks: number; syntax: string }> = [];
  // Whole-note prefix bounds DP memory even when directly called for long spans.
  while (ticks > 3840) {
    result.push(DURATION_TOKENS[0]);
    ticks -= 3840;
  }
  const units = ticks / 60,
    costs = new Array<number>(units + 1).fill(Infinity),
    previous = new Array<number>(units + 1).fill(-1);
  costs[0] = 0;
  for (let total = 1; total <= units; total++)
    for (let token = 0; token < DURATION_TOKENS.length; token++) {
      const size = DURATION_TOKENS[token].ticks / 60;
      if (size <= total && costs[total - size] + 1 < costs[total]) {
        costs[total] = costs[total - size] + 1;
        previous[total] = token;
      }
    }
  const tail: Array<{ ticks: number; syntax: string }> = [];
  for (let total = units; total > 0;) {
    const token = DURATION_TOKENS[previous[total]];
    if (!token) throw new Error(UNSUPPORTED_DURATION);
    tail.push(token);
    total -= token.ticks / 60;
  }
  return [...result, ...tail];
}
export function durationTicks(syntax: string) {
  return DURATION_TOKENS.find((token) => token.syntax === syntax)?.ticks ?? 0;
}

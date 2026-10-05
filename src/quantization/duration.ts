import { PPQ } from "./types.ts";
const names = new Map<number, string>([
  [PPQ * 4, "whole"],
  [PPQ * 3, "dottedHalf"],
  [PPQ * 2, "half"],
  [PPQ * 1.5, "dottedQuarter"],
  [PPQ, "quarter"],
  [PPQ * 0.75, "dottedEighth"],
  [PPQ / 2, "eighth"],
  [PPQ / 4, "sixteenth"],
  [PPQ / 8, "thirtySecond"],
]);
export function ticksToDurationName(ticks: number): string {
  return names.get(ticks) ?? "custom";
}

import type { KeyMode, MusicalKey } from "./types";
const names: Record<KeyMode, readonly string[]> = {
  major: ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"],
  minor: ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"],
};
export function tonicName(tonic: number, mode: KeyMode): string {
  return names[mode][((tonic % 12) + 12) % 12];
}
export function keyName(key: Pick<MusicalKey, "tonic" | "mode">): string {
  return `${tonicName(key.tonic, key.mode)} ${key.mode === "major" ? "Major" : "Minor"}`;
}

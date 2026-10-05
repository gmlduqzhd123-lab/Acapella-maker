import type { MusicalKey } from "../../music/types";
export interface KeyDefinition {
  name: string;
  tonic: string;
  fifths: number;
  signature: string;
  accidentals: Record<string, number>;
}
const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
// Explicit pitch-class mappings. Enharmonic alternatives minimize key complexity;
// NWC's Tonic is a letter, whose accidental is implied by Signature.
export const KEY_MAPPING = {
  major: [
    ["C", 0],
    ["Db", -5],
    ["D", 2],
    ["Eb", -3],
    ["E", 4],
    ["F", -1],
    ["F#", 6],
    ["G", 1],
    ["Ab", -4],
    ["A", 3],
    ["Bb", -2],
    ["B", 5],
  ],
  minor: [
    ["C", -3],
    ["C#", 4],
    ["D", -1],
    ["Eb", -6],
    ["E", 1],
    ["F", -4],
    ["F#", 3],
    ["G", -2],
    ["G#", 5],
    ["A", 0],
    ["Bb", -5],
    ["B", 2],
  ],
} as const;
export function keySignature(key: MusicalKey | null): KeyDefinition {
  if (
    key &&
    (!Number.isInteger(key.tonic) ||
      key.tonic < 0 ||
      key.tonic > 11 ||
      !(key.mode in KEY_MAPPING))
  )
    throw new Error("지원하지 않는 조성입니다.");
  const [name, fifths] = key
    ? KEY_MAPPING[key.mode][key.tonic]
    : (["C", 0] as const);
  const order = fifths < 0 ? flatOrder : sharpOrder;
  const accidentals: Record<string, number> = Object.fromEntries(
    ["C", "D", "E", "F", "G", "A", "B"].map((letter) => [letter, 0]),
  );
  for (const letter of order.slice(0, Math.abs(fifths)))
    accidentals[letter] = Math.sign(fifths);
  return {
    name,
    tonic: name[0],
    fifths,
    signature:
      fifths === 0
        ? "C"
        : order
            .slice(0, Math.abs(fifths))
            .map((letter) => letter + (fifths < 0 ? "b" : "#"))
            .join(","),
    accidentals,
  };
}

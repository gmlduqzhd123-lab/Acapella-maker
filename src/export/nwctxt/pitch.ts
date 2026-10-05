import type { NwcClef, NwcPitch } from "./types";
import type { KeyDefinition } from "./keySignature";
const letters = ["C", "D", "E", "F", "G", "A", "B"];
const naturals = [0, 2, 4, 5, 7, 9, 11];
// Pos0 is the middle staff line: B4 in Treble, D3 in Bass.
export const CLEF_REFERENCE = {
  Treble: { letter: "B", octave: 4, diatonic: 34, midi: 71 },
  Bass: { letter: "D", octave: 3, diatonic: 22, midi: 50 },
} as const;
export function spellPitch(midi: number, key: KeyDefinition) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127)
    throw new Error("MIDI 음높이가 올바르지 않습니다.");
  const pc = midi % 12;
  let index = naturals.findIndex(
    (value, i) => (value + key.accidentals[letters[i]] + 12) % 12 === pc,
  );
  let alter: number;
  if (index >= 0) alter = key.accidentals[letters[index]];
  else {
    index = naturals.indexOf(pc);
    if (index >= 0) alter = 0;
    else {
      alter = key.fifths < 0 ? -1 : 1;
      index = naturals.findIndex((value) => (value + alter + 12) % 12 === pc);
    }
  }
  const octave = (midi - naturals[index] - alter) / 12 - 1;
  return {
    letter: letters[index],
    octave,
    alter,
    diatonic: octave * 7 + index,
  };
}
export function pitchPosition(midi: number, clef: NwcClef, key: KeyDefinition) {
  return spellPitch(midi, key).diatonic - CLEF_REFERENCE[clef].diatonic;
}
export function chooseClef(midis: number[]): NwcClef {
  const sorted = [...midis].sort((a, b) => a - b);
  return sorted.length && sorted[Math.floor(sorted.length / 2)] < 60
    ? "Bass"
    : "Treble";
}
export function accidentalPitch(
  noteId: string,
  midi: number,
  clef: NwcClef,
  key: KeyDefinition,
  state: Map<number, number>,
): NwcPitch {
  const spelling = spellPitch(midi, key);
  const previous =
    state.get(spelling.diatonic) ?? key.accidentals[spelling.letter];
  const accidental =
    previous === spelling.alter
      ? ""
      : spelling.alter === 0
        ? "n"
        : spelling.alter < 0
          ? "b"
          : "#";
  state.set(spelling.diatonic, spelling.alter);
  return {
    noteId,
    midi,
    pos: spelling.diatonic - CLEF_REFERENCE[clef].diatonic,
    accidental,
  };
}
export function positionToMidi(pos: number, clef: NwcClef, alter: number) {
  const diatonic = pos + CLEF_REFERENCE[clef].diatonic;
  const octave = Math.floor(diatonic / 7);
  const index = diatonic - octave * 7;
  return {
    midi: (octave + 1) * 12 + naturals[index] + alter,
    diatonic,
    letter: letters[index],
  };
}

/** MIDI 60 = C4. Simple sharp spelling; score spelling will later use the key. */
export function noteName(midi: number): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return "—";
  return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
}

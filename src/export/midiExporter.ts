import MidiPackage from "@tonejs/midi";
import type { ExportSnapshot } from "./snapshot";
import { validateExportSnapshot } from "./snapshot.ts";
import { secondsPerQuarter } from "../quantization/timeConversion.ts";
import { TIME_SIGNATURES } from "../quantization/grid.ts";
import { sortNotes } from "../editor/noteMath.ts";
const { Midi } = MidiPackage;
/** SMF Type1. Physical audio time starts at MIDI 0, irrespective of pickup/origin. */
export function exportMidi(snapshot: ExportSnapshot): Uint8Array {
  validateExportSnapshot(snapshot);
  const midi = new Midi();
  const quarterBpm = 60 / secondsPerQuarter(snapshot);
  midi.header.fromJSON({
    ...midi.header.toJSON(),
    name: snapshot.title,
    ppq: snapshot.ppq,
    tempos: [{ ticks: 0, bpm: quarterBpm }],
    timeSignatures: [
      {
        ticks: 0,
        timeSignature: [
          TIME_SIGNATURES[snapshot.timeSignature].numerator,
          TIME_SIGNATURES[snapshot.timeSignature].denominator,
        ],
      },
    ],
  });
  // SMF tempo uses integer microseconds. Compensate tick placement for the
  // library's floor encoding, rather than accumulating timing drift in long files.
  const encodedQuarterSeconds = Math.floor(60_000_000 / quarterBpm) / 1_000_000;
  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // GM channel10 is percussion.
  const tracks: Array<{
    track: ReturnType<typeof midi.addTrack>;
    ends: Map<number, number>;
  }> = [];
  for (const note of sortNotes(snapshot.notes)) {
    // Note-on velocity0 means note-off in SMF. Do not silently lose that note.
    if (note.velocity === 0)
      throw new Error(
        "velocity가 0인 음표는 MIDI note-on으로 표현할 수 없습니다. 음표를 정리해 주세요.",
      );
    const start = Math.round(
      (note.start / encodedQuarterSeconds) * snapshot.ppq,
    );
    const end = Math.max(
      start + 1,
      Math.round(
        ((note.start + note.duration) / encodedQuarterSeconds) * snapshot.ppq,
      ),
    );
    let lane = tracks.find(
      (value) => (value.ends.get(note.midi) ?? -1) <= start,
    );
    if (!lane) {
      if (tracks.length === channels.length)
        throw new Error(
          "같은 음높이의 동시 겹침이 MIDI 채널 한도를 넘었습니다. 음표를 정리해 주세요.",
        );
      const track = midi.addTrack();
      track.name = `Working Notes ${tracks.length + 1}`;
      track.channel = channels[tracks.length];
      lane = { track, ends: new Map() };
      tracks.push(lane);
    }
    lane.track.addNote({
      midi: note.midi,
      ticks: start,
      durationTicks: end - start,
      velocity: Math.min(1, (note.velocity + 1e-8) / 127),
    });
    lane.ends.set(note.midi, end);
  }
  return midi.toArray();
}

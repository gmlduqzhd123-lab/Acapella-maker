import type { ExportSnapshot } from "../snapshot";
import type { NwcDocument } from "./types";
import { measureTicks } from "../../quantization/grid.ts";
import { durationTicks } from "./durations.ts";
import { keySignature } from "./keySignature.ts";
import { parseNwcLine } from "./serializer.ts";
import { positionToMidi } from "./pitch.ts";
import { MAX_NWC_LANES } from "./lanes.ts";
import type { VoiceExport } from "../../voices/exportVoices";
import { prepareVoiceExport, SATB_CLEFS } from "../../voices/exportVoices.ts";
import { VOICE_NAMES } from "../../voices/types.ts";

/** Validate both source provenance/tick arithmetic AND independently parsed text.
 * This is our supported-subset validator, not a replacement for NWC acceptance.
 */
export function validateNwctxt(
  text: string,
  document: NwcDocument,
  snapshot: ExportSnapshot,
  voices?: VoiceExport,
) {
  const errors: string[] = [];
  const fail = (message: string) => {
    if (errors.length < 50) errors.push(message);
  };
  const reconstructed = new Map<
    string,
    { start: number; end: number; midi: number; lane: number }
  >();
  const length = measureTicks(document.timeSignature),
    expectedKey = keySignature(snapshot.key);
  const satb = voices ? prepareVoiceExport(snapshot, voices) : null;
  if ((document.voiceMode === "satb") !== !!satb) fail("SATB metadata");
  if (satb && document.staffs.length !== satb.groups.length)
    fail("SATB staff count");
  if (
    document.bpm !== snapshot.bpm ||
    document.timeSignature !== snapshot.timeSignature ||
    document.tempoBase !==
      (snapshot.timeSignature === "6/8" && snapshot.bpmUnit === "dottedQuarter"
        ? "Quarter Dotted"
        : "Quarter")
  )
    fail("BPM/TimeSig/Tempo provenance");
  if (!document.staffs.length || document.staffs.length > MAX_NWC_LANES)
    fail("AddStaff 수");
  document.staffs.forEach((staff, lane) => {
    if (
      staff.name !==
        (satb
          ? VOICE_NAMES[satb.groups[lane]?.role]
          : `Draft Voice ${lane + 1}`) ||
      (satb && staff.clef !== SATB_CLEFS[satb.groups[lane]?.role]) ||
      !["Treble", "Bass"].includes(staff.clef) ||
      staff.key.signature !== expectedKey.signature ||
      staff.key.tonic !== expectedKey.tonic
    )
      fail("Staff/Clef/Key");
    let previousEnd = staff.measures[0]?.startTick;
    for (const [index, measure] of staff.measures.entries()) {
      if (
        !Number.isSafeInteger(measure.startTick) ||
        !Number.isSafeInteger(measure.endTick) ||
        measure.startTick !== previousEnd ||
        measure.endTick <= measure.startTick ||
        measure.endTick - measure.startTick > length ||
        (index > 0 && measure.endTick - measure.startTick !== length) ||
        measure.endTick % length !== 0
      )
        fail("마디 경계");
      let cursor = measure.startTick;
      for (const item of measure.items) {
        if (
          item.startTick !== cursor ||
          item.durationTicks <= 0 ||
          item.durationTicks !== durationTicks(item.duration)
        )
          fail("음가/시간 겹침");
        if (
          (item.kind === "Rest") !== !item.pitches.length ||
          (item.kind === "Rest" && (item.tieFromPrevious || item.tieToNext))
        )
          fail("Rest/Tie");
        for (const pitch of item.pitches) {
          if (
            satb &&
            satb.map.map[pitch.noteId]?.voice !== satb.groups[lane]?.role
          )
            fail("SATB source voice");
          const previous = reconstructed.get(pitch.noteId);
          if (previous) {
            if (
              !item.tieFromPrevious ||
              previous.end !== item.startTick ||
              previous.midi !== pitch.midi ||
              previous.lane !== lane
            )
              fail("Tie 연결");
            previous.end = item.startTick + item.durationTicks;
          } else {
            if (item.tieFromPrevious) fail("Tie 시작");
            reconstructed.set(pitch.noteId, {
              start: item.startTick,
              end: item.startTick + item.durationTicks,
              midi: pitch.midi,
              lane,
            });
          }
        }
        cursor += item.durationTicks;
      }
      if (cursor !== measure.endTick) fail("bar별 duration 합");
      previousEnd = measure.endTick;
    }
    if (
      staff.measures[0]?.startTick !==
        document.staffs[0]?.measures[0]?.startTick ||
      previousEnd !== document.staffs[0]?.measures.at(-1)?.endTick
    )
      fail("Staff 시간 정렬");
  });
  if (reconstructed.size !== snapshot.notes.length) fail("음표 손실/추가");
  for (const note of snapshot.quantization.notes) {
    const found = reconstructed.get(note.id);
    if (
      !found ||
      found.start !== note.startTick ||
      found.end !== note.startTick + note.durationTicks ||
      found.midi !== note.midi
    )
      fail("원본 음표 ID/pitch/timing 보존");
  }
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== "!NoteWorthyComposer(2.75)") fail("header");
  if (lines.at(-1) !== "!NoteWorthyComposer-End") fail("footer");
  let lane = -1,
    measureIndex = 0,
    itemIndex = 0,
    cursor = 0,
    totalTempo = 0,
    songInfo = 0;
  let clefSeen = false,
    keySeen = false,
    signatureSeen = false;
  let accidentalState = new Map<number, number>(),
    pendingTies = new Set<string>();
  function finishStaff() {
    if (lane < 0) return;
    const staff = document.staffs[lane];
    if (
      !staff ||
      !clefSeen ||
      !keySeen ||
      !signatureSeen ||
      measureIndex !== staff.measures.length ||
      itemIndex !== 0 ||
      pendingTies.size
    )
      fail("Staff 필수 속성/마지막 Bar/Tie");
  }
  try {
    for (const line of lines.slice(1, -1)) {
      const { type, props } = parseNwcLine(line);
      if (type === "SongInfo") {
        songInfo++;
        if (props.Title !== document.title) fail("SongInfo Title");
        continue;
      }
      if (type === "AddStaff") {
        finishStaff();
        lane++;
        measureIndex = 0;
        itemIndex = 0;
        accidentalState = new Map();
        pendingTies = new Set();
        clefSeen = false;
        keySeen = false;
        signatureSeen = false;
        const staff = document.staffs[lane];
        if (!staff || props.Name !== staff.name || props.Label !== staff.name) {
          fail("AddStaff");
          continue;
        }
        cursor = staff.measures[0]?.startTick ?? 0;
        continue;
      }
      const staff = document.staffs[lane];
      if (!staff) {
        fail("Staff 없는 object");
        continue;
      }
      if (type === "StaffProperties") continue;
      if (type === "Clef") {
        if (clefSeen || props.Type !== staff.clef) fail("Clef");
        clefSeen = true;
        continue;
      }
      if (type === "Key") {
        if (
          keySeen ||
          props.Signature !== staff.key.signature ||
          props.Tonic !== staff.key.tonic
        )
          fail("Key");
        keySeen = true;
        continue;
      }
      if (type === "TimeSig") {
        if (signatureSeen || props.Signature !== document.timeSignature)
          fail("TimeSig");
        signatureSeen = true;
        continue;
      }
      if (type === "Tempo") {
        totalTempo++;
        if (
          lane !== 0 ||
          Number(props.Tempo) !== document.bpm ||
          props.Base !== document.tempoBase
        )
          fail("Tempo");
        continue;
      }
      const measure = staff.measures[measureIndex];
      if (type === "Bar") {
        if (
          !measure ||
          cursor !== measure.endTick ||
          itemIndex !== measure.items.length
        )
          fail("Bar duration");
        measureIndex++;
        itemIndex = 0;
        accidentalState = new Map();
        continue;
      }
      if (!["Note", "Rest", "Chord"].includes(type)) {
        fail("지원하지 않는 object");
        continue;
      }
      const expected = measure?.items[itemIndex++];
      const duration = durationTicks(props.Dur);
      if (
        !clefSeen ||
        !keySeen ||
        !signatureSeen ||
        !duration ||
        !expected ||
        type !== expected.kind ||
        duration !== expected.durationTicks ||
        cursor !== expected.startTick
      )
        fail("음표 종류/음가/시작");
      const positions = type === "Rest" ? [] : (props.Pos ?? "").split(",");
      if (
        (type === "Rest" && props.Pos) ||
        (type === "Note" && positions.length !== 1) ||
        (type === "Chord" && positions.length < 2) ||
        positions.length !== (expected?.pitches.length ?? 0)
      )
        fail("Pos/Chord member 수");
      const incoming = new Set<string>(),
        outgoing = new Set<string>(),
        occupied = new Set<number>();
      for (const [index, encoded] of positions.entries()) {
        const match = /^([#bnxv]?)(-?\d+)(\^?)$/.exec(encoded);
        if (!match) {
          fail("invalid Pos");
          continue;
        }
        const pos = Number(match[2]),
          natural = positionToMidi(pos, staff.clef, 0);
        const alter = match[1]
          ? ({ "#": 1, b: -1, n: 0, x: 2, v: -2 }[match[1]] ?? 0)
          : (accidentalState.get(natural.diatonic) ??
            staff.key.accidentals[natural.letter]);
        const resolved = positionToMidi(pos, staff.clef, alter).midi;
        if (
          resolved < 0 ||
          resolved > 127 ||
          !Number.isSafeInteger(pos) ||
          occupied.has(pos)
        )
          fail("Pos 음역/중복");
        occupied.add(pos);
        accidentalState.set(natural.diatonic, alter);
        const pitch = expected?.pitches[index];
        if (
          !pitch ||
          pitch.midi !== resolved ||
          pitch.pos !== pos ||
          !!match[3] !== expected?.tieToNext
        )
          fail("pitch/accidental/Tie");
        const identity = `${pos}:${resolved}`;
        incoming.add(identity);
        if (match[3]) outgoing.add(identity);
      }
      if (
        pendingTies.size &&
        (pendingTies.size !== incoming.size ||
          [...pendingTies].some((pitch) => !incoming.has(pitch)))
      )
        fail("dangling Tie");
      if (!!pendingTies.size !== !!expected?.tieFromPrevious)
        fail("Tie 연속성");
      pendingTies = outgoing;
      cursor += duration;
    }
    finishStaff();
    if (
      lane + 1 !== document.staffs.length ||
      totalTempo !== 1 ||
      songInfo !== 1
    )
      fail("AddStaff/Tempo/SongInfo 수");
  } catch (reason) {
    fail(reason instanceof Error ? reason.message : "NWCTXT parse 실패");
  }
  return { valid: errors.length === 0, errors };
}

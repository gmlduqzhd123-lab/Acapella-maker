import { useEffect, useRef, useState } from "react";
import type { VoiceAssignmentResult, Part } from "../../voices/types";
import { VOICES, VOICE_LABELS } from "../../voices/types";
export function GuidePlayer({
  result,
  currentTime,
  stopOriginal,
}: {
  result: VoiceAssignmentResult | null;
  currentTime: number;
  stopOriginal: () => void;
}) {
  const context = useRef<AudioContext | null>(null),
    nodes = useRef<Set<OscillatorNode>>(new Set()),
    gains = useRef<Partial<Record<Part, GainNode>>>({});
  const timer = useRef<number | null>(null),
    generation = useRef(0);
  const [playingSource, setPlayingSource] =
      useState<VoiceAssignmentResult | null>(null),
    [position, setPosition] = useState(0),
    [error, setError] = useState("");
  const [solo, setSolo] = useState<Part | null>(null),
    [muted, setMuted] = useState<Part[]>([]);
  const playing = !!result && playingSource === result;
  function stop(update = true) {
    generation.current++;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    for (const node of nodes.current) {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
    }
    nodes.current.clear();
    if (update) setPlayingSource(null);
  }
  useEffect(() => {
    return () => stop(false);
  }, [result]);
  useEffect(
    () => () => {
      void context.current?.close();
      context.current = null;
    },
    [],
  );
  useEffect(() => {
    for (const voice of VOICES)
      if (gains.current[voice])
        gains.current[voice]!.gain.value =
          (solo && solo !== voice) || muted.includes(voice) ? 0 : 0.04;
  }, [solo, muted]);
  async function play(part: Part | null) {
    if (!result || result.issues.some((i) => i.kind === "overlap")) return;
    stop();
    stopOriginal();
    setSolo(part);
    setError("");
    const token = generation.current;
    try {
      const ctx = context.current ?? new AudioContext();
      context.current = ctx;
      await ctx.resume();
      if (token !== generation.current) return;
      for (const voice of VOICES) {
        gains.current[voice]?.disconnect();
        const gain = ctx.createGain();
        gain.gain.value =
          (part && part !== voice) || muted.includes(voice) ? 0 : 0.04;
        gain.connect(ctx.destination);
        gains.current[voice] = gain;
      }
      const startAt = Math.max(0, currentTime),
        clock = ctx.currentTime + 0.03;
      const events = VOICES.flatMap((voice) =>
        result.tracks[voice]
          .filter((n) => n.start + n.duration > startAt)
          .map((note) => ({ voice, note })),
      ).sort((a, b) => a.note.start - b.note.start);
      const end = Math.max(
        startAt,
        ...events.map((e) => e.note.start + e.note.duration),
      );
      let next = 0;
      function schedule() {
        if (token !== generation.current) return;
        const position = startAt + ctx.currentTime - clock;
        setPosition(Math.max(startAt, position));
        while (
          next < events.length &&
          events[next].note.start <= position + 0.15
        ) {
          const { voice, note } = events[next++];
          const onset = Math.max(
              ctx.currentTime + 0.005,
              clock + note.start - startAt,
            ),
            finish = clock + note.start + note.duration - startAt;
          if (finish <= onset) continue;
          const oscillator = ctx.createOscillator(),
            envelope = ctx.createGain();
          oscillator.type = "triangle";
          oscillator.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
          const level = 0.35 + (0.65 * note.velocity) / 127;
          const attack = Math.min(0.01, (finish - onset) / 3),
            release = Math.min(0.02, (finish - onset) / 3);
          envelope.gain.setValueAtTime(0, onset);
          envelope.gain.linearRampToValueAtTime(level, onset + attack);
          envelope.gain.setValueAtTime(level, finish - release);
          envelope.gain.linearRampToValueAtTime(0, finish);
          oscillator.connect(envelope);
          envelope.connect(gains.current[voice]!);
          nodes.current.add(oscillator);
          oscillator.onended = () => {
            nodes.current.delete(oscillator);
            oscillator.disconnect();
            envelope.disconnect();
          };
          oscillator.start(onset);
          oscillator.stop(finish + 0.005);
        }
        if (position >= end + 0.03) stop();
      }
      setPlayingSource(result);
      schedule();
      if (token === generation.current)
        timer.current = window.setInterval(schedule, 25);
    } catch (reason) {
      stop();
      setError(
        reason instanceof Error
          ? reason.message
          : "가이드 음을 재생하지 못했습니다.",
      );
    }
  }
  return (
    <div className="voice-guide" aria-label="성부 가이드 재생">
      <strong>가이드 음 재생</strong>
      <p>
        원본 음원과 별도로 현재 재생 위치부터 분류된 음표를 재생합니다. 실제
        가수의 분리 음성이 아닙니다.
      </p>
      <div className="voice-actions">
        {VOICES.map((voice) => (
          <button
            className="button"
            key={voice}
            disabled={
              !result || result.issues.some((i) => i.kind === "overlap")
            }
            onClick={() => void play(voice)}
          >
            {VOICE_LABELS[voice]} 재생
          </button>
        ))}
        <button
          className="button"
          disabled={!result || result.issues.some((i) => i.kind === "overlap")}
          onClick={() => void play(null)}
        >
          SATB 전체 재생
        </button>
        <button className="button" disabled={!playing} onClick={() => stop()}>
          가이드 정지
        </button>
      </div>
      <span data-testid="guide-position">
        {playing ? `재생 중 ${position.toFixed(2)}초` : "정지"}
      </span>
      <div className="voice-actions">
        {VOICES.map((voice) => (
          <span key={voice}>
            {VOICE_LABELS[voice]}{" "}
            <button
              aria-label={`${voice} Solo`}
              aria-pressed={solo === voice}
              onClick={() => setSolo(solo === voice ? null : voice)}
            >
              Solo
            </button>{" "}
            <button
              aria-label={`${voice} Mute`}
              aria-pressed={muted.includes(voice)}
              onClick={() =>
                setMuted((v) =>
                  v.includes(voice)
                    ? v.filter((x) => x !== voice)
                    : [...v, voice],
                )
              }
            >
              Mute
            </button>
          </span>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

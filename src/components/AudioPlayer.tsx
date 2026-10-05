import { useEffect, useRef, useState } from "react";
import type { LoadedAudio } from "../audio/types";
import { formatTime } from "../audio/format";
import { Icon } from "./Icon";

export interface TransportState {
  currentTime: number;
  duration: number;
  playing: boolean;
}
export function AudioPlayer({
  audio,
  onReady,
  onTransport,
}: {
  audio: LoadedAudio;
  onReady: (element: HTMLAudioElement | null) => void;
  onTransport: (value: TransportState) => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const notify = useRef(onTransport);
  useEffect(() => {
    notify.current = onTransport;
  }, [onTransport]);
  const [error, setError] = useState("");
  const duration = audio.metadata.duration;
  useEffect(() => {
    const element = player.current;
    onReady(element);
    let frame = 0;
    function publish() {
      if (!element) return;
      setCurrent(element.currentTime);
      notify.current({
        currentTime: element.currentTime,
        duration: audio.metadata.duration,
        playing: !element.paused && !element.ended,
      });
    }
    function tick() {
      publish();
      if (element && !element.paused) frame = requestAnimationFrame(tick);
    }
    function play() {
      cancelAnimationFrame(frame);
      tick();
    }
    if (element) {
      element.disableRemotePlayback = true;
      element.src = audio.objectUrl;
      element.addEventListener("play", play);
      element.addEventListener("pause", publish);
      element.addEventListener("seeked", publish);
      element.addEventListener("timeupdate", publish);
      element.addEventListener("ended", publish);
      publish();
    }
    return () => {
      cancelAnimationFrame(frame);
      onReady(null);
      element?.removeEventListener("play", play);
      element?.removeEventListener("pause", publish);
      element?.removeEventListener("seeked", publish);
      element?.removeEventListener("timeupdate", publish);
      element?.removeEventListener("ended", publish);
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, [audio.objectUrl, audio.metadata.duration, onReady]);
  return (
    <section className="audio-player" aria-label="음원 플레이어">
      <div className="player-heading">
        <span>
          <Icon name="wave" size={18} /> 업로드한 음원
        </span>
        <strong>
          {formatTime(current)} <span>/ {formatTime(duration)}</span>
        </strong>
      </div>
      <button
        className="waveform"
        aria-label="파형에서 재생 위치 선택"
        title="클릭하면 해당 위치로 이동합니다."
        onClick={(event) => {
          if (player.current) {
            const box = event.currentTarget.getBoundingClientRect();
            player.current.currentTime =
              Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) *
              duration;
          }
        }}
      >
        <svg viewBox="0 0 540 80" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="40" x2="540" y2="40" stroke="#e4e9d9" />
          {audio.waveform.map((peak, index) => (
            <rect
              key={index}
              x={(index * 540) / audio.waveform.length}
              y={40 - Math.max(1, peak * 35)}
              width={Math.max(1, 540 / audio.waveform.length - 1)}
              height={Math.max(2, peak * 70)}
              rx="1"
              fill={
                index / audio.waveform.length <= current / duration
                  ? "#476c43"
                  : "#b5c49a"
              }
            />
          ))}
        </svg>
      </button>
      <div className="wave-ticks">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <span key={ratio}>{formatTime(duration * ratio)}</span>
        ))}
      </div>
      <audio
        ref={player}
        controls
        controlsList="noremoteplayback"
        preload="metadata"
        aria-label="업로드한 음악 재생"
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onError={() =>
          setError(
            "이 브라우저에서 음원을 재생하지 못했습니다. 다른 파일로 다시 시도해 주세요.",
          )
        }
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <p className="player-caption">
        원본 음원 재생 · 파형을 클릭해 이동 · 분석 전 미리 듣기
      </p>
    </section>
  );
}

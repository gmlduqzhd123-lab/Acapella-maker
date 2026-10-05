import type { useBeatMarks } from "../../quantization/useBeatMarks";
export function BeatGrid({
  marks,
  zoom,
}: {
  marks: ReturnType<typeof useBeatMarks>;
  zoom: number;
}) {
  return (
    <div className="pr-beat-grid" aria-label="음악 박자선">
      {marks.map((mark) => (
        <div
          key={mark.tick}
          className={`pr-music-line ${mark.kind}-line`}
          data-tick={mark.tick}
          data-measure={mark.measure}
          data-beat={mark.beat}
          style={{ left: mark.seconds * zoom }}
        />
      ))}
    </div>
  );
}

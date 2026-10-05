import type { AudioMetadata } from "../audio/types";
import { formatFileSize, formatTime } from "../audio/format";
import { Icon } from "./Icon";
export function FileInfo({
  metadata,
  onRemove,
  busy,
}: {
  metadata: AudioMetadata;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="file-info">
      <span className="project-symbol">
        <Icon name="music" size={26} />
      </span>
      <strong className="filename" title={metadata.name}>
        {metadata.name}
      </strong>
      <span className="loaded-tag">
        <Icon name="check" size={12} /> 음원 준비 완료
      </span>
      <dl>
        <div>
          <dt>재생 시간</dt>
          <dd>{formatTime(metadata.duration)}</dd>
        </div>
        <div>
          <dt>파일 크기</dt>
          <dd>{formatFileSize(metadata.size)}</dd>
        </div>
        <div>
          <dt>포맷</dt>
          <dd>{metadata.format}</dd>
        </div>
        <div>
          <dt>채널</dt>
          <dd>
            {metadata.channels === 1
              ? "Mono"
              : metadata.channels === 2
                ? "Stereo"
                : metadata.channels}
          </dd>
        </div>
      </dl>
      <button className="remove-button" disabled={busy} onClick={onRemove}>
        음원 제거
      </button>
    </div>
  );
}

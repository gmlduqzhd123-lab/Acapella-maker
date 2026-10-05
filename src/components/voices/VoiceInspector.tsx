import type { VoiceController } from "../../voices/useVoices";
import { VOICES, VOICE_NAMES } from "../../voices/types";
import type { VoiceRole } from "../../voices/types";
export function VoiceInspector({
  voices,
  noteId,
  disabled,
}: {
  voices: VoiceController;
  noteId: string;
  disabled: boolean;
}) {
  const data = voices.map[noteId];
  return (
    <div className="voice-inspector">
      <label>
        성부
        <select
          aria-label="선택 음표 성부"
          disabled={disabled || voices.busy || !data}
          value={data?.voice ?? "unassigned"}
          onChange={(e) =>
            voices.override([noteId], e.target.value as VoiceRole)
          }
        >
          {[...VOICES, "unassigned" as const].map((v) => (
            <option key={v} value={v}>
              {VOICE_NAMES[v]}
            </option>
          ))}
        </select>
      </label>
      <small>
        {data?.origin === "manual"
          ? "직접 지정"
          : data
            ? `성부 추정 확신도 ${Math.round((data.confidence ?? 0) * 100)}% · 확률 아님`
            : "성부 분석 후 지정할 수 있습니다."}
      </small>
    </div>
  );
}

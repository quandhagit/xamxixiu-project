"use client";

import { VOICE_POOL } from "../../../src/tts/voice-pool";
import { Select } from "../ui/Select";

function voiceLabel(id: string, style: string): string {
  return `${id} · ${style}`;
}

export function VoiceSelect({
  value,
  disabled,
  onChange
}: {
  value?: string;
  disabled?: boolean;
  onChange: (voiceId: string) => void;
}): React.ReactElement {
  const known = VOICE_POOL.some(
    (voice) => voice.id === value
  );
  const female = VOICE_POOL.filter(
    (voice) => voice.gender === "female"
  );
  const male = VOICE_POOL.filter(
    (voice) => voice.gender === "male"
  );

  return (
    <Select
      value={value ?? ""}
      disabled={disabled}
      className="mt-2"
      onChange={(event) => {
        const next = event.target.value;
        if (next && next !== value) {
          onChange(next);
        }
      }}
    >
      {!value ? (
        <option value="">Chưa được chọn</option>
      ) : null}
      {!known && value ? (
        <option value={value}>{value}</option>
      ) : null}
      <optgroup label="Female">
        {female.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voiceLabel(voice.id, voice.style)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Male">
        {male.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voiceLabel(voice.id, voice.style)}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

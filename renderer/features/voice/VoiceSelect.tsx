"use client";

import { VOICE_POOL } from "../../../src/tts/voice-pool";

const SELECT_CLASS = [
  "mt-2 w-full rounded-lg border border-white/10 bg-black/40",
  "px-3 py-2 text-sm text-fuchsia-200 outline-none",
  "focus:ring-2 focus:ring-fuchsia-400",
  "disabled:cursor-not-allowed disabled:opacity-50"
].join(" ");

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
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (next && next !== value) {
          onChange(next);
        }
      }}
      className={SELECT_CLASS}
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
    </select>
  );
}

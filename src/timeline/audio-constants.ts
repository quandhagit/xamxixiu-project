/** Background music level, always -12 dB. */
export const MUSIC_VOLUME_DB = -12;

/** Linear gain for MUSIC_VOLUME_DB (about 0.2512). */
export const MUSIC_VOLUME = Number(
  Math.pow(10, MUSIC_VOLUME_DB / 20).toFixed(4)
);

/** Voice speaking speed multiplier sent to the TTS provider. */
export const VOICE_SPEED = 1.1;

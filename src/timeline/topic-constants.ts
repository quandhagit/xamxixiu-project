export const TOPIC_TITLE_WIDTH_FRACTION = 0.8;
export const TOPIC_MEME_SCALE = 0.7;
export const TOPIC_TITLE_SCALE = 1;
export const TOPIC_TITLE_CARD_FILE =
  "processed/topic-title-card.png";
export const TOPIC_TITLE_TRANSFORM_Y = 0.2;
export const TOPIC_TITLE_CENTER_FRACTION =
  (1 - TOPIC_TITLE_TRANSFORM_Y) / 2;
export const TOPIC_TITLE_MAX_HEIGHT = 268;
export const TOPIC_TITLE_MIN_HEIGHT = 180;
export const TOPIC_TITLE_LINE_HEIGHT = 68;
export const TOPIC_TITLE_PADDING = 64;
export const TOPIC_TITLE_ANIMATION_DURATION = 0.2;
export const TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH = 200;

export function shouldGenerateTopicTitleVoice(
  text: string | undefined
): boolean {
  return (text?.length ?? 0) > TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH;
}

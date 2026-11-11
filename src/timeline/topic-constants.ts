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
export const TOPIC_TITLE_ANIMATION_DURATION = 0.35;
export const TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH = 200;
export const TOPIC_TITLE_MAX_LENGTH = 80;

export function normalizeTopicTitle(
  title: string | undefined
): string {
  return (title ?? "").trim().slice(0, TOPIC_TITLE_MAX_LENGTH);
}

export function isTopicIntroEnabled(
  analysis: { topicIntroEnabled?: boolean } | undefined
): boolean {
  return analysis?.topicIntroEnabled !== false;
}

export function shouldGenerateTopicTitleVoice(
  text: string | undefined
): boolean {
  return (text?.length ?? 0) > TOPIC_TITLE_VOICE_MIN_TEXT_LENGTH;
}

export function resolveTopicTitleVoiceEnabled(
  analysis: {
    topicTitleVoiceMode?: "auto" | "on" | "off";
  } | undefined,
  text: string | undefined
): boolean {
  const mode = analysis?.topicTitleVoiceMode ?? "auto";
  if (mode === "on") {
    return true;
  }
  if (mode === "off") {
    return false;
  }
  return shouldGenerateTopicTitleVoice(text);
}

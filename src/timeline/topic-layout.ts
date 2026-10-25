import sharp from "sharp";
import {
  TOPIC_MEME_SCALE,
  TOPIC_TITLE_CENTER_FRACTION,
  TOPIC_TITLE_MAX_HEIGHT,
  TOPIC_TITLE_TRANSFORM_Y
} from "./topic-constants.js";

export { TOPIC_MEME_SCALE } from "./topic-constants.js";
export {
  TOPIC_TITLE_CENTER_FRACTION,
  TOPIC_TITLE_MAX_HEIGHT,
  TOPIC_TITLE_TRANSFORM_Y
} from "./topic-constants.js";
export const TOPIC_CONTENT_GAP = 48;
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export interface TopicMemeLayout {
  scale: number;
  y: number;
  width: number;
  height: number;
  centerY: number;
}

export async function getTopicMemeLayout(
  file: string
): Promise<TopicMemeLayout> {
  const metadata = await sharp(file).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width <= 0 ||
    metadata.height <= 0
  ) {
    throw new Error(
      `Không đọc được kích thước topic meme: ${file}`
    );
  }

  const scale = TOPIC_MEME_SCALE;
  const width = CANVAS_WIDTH * scale;
  const height =
    width * (metadata.height / metadata.width);
  const titleBottom =
    CANVAS_HEIGHT * TOPIC_TITLE_CENTER_FRACTION +
    TOPIC_TITLE_MAX_HEIGHT / 2;
  const desiredTop = titleBottom + TOPIC_CONTENT_GAP;
  // Keep the meme below the title even when a tall source image extends
  // beyond the bottom edge; CapCut clips it to the canvas instead of making
  // it overlap the title.
  const top = desiredTop;
  const centerY = top + height / 2;

  return {
    scale,
    // CapCut's positive Y direction is upward.
    y: 1 - centerY / (CANVAS_HEIGHT / 2),
    width,
    height,
    centerY
  };
}

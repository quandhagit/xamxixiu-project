import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  TOPIC_TITLE_CARD_FILE,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../timeline/topic-constants.js";
import {
  clampTopicTitleStyle,
  DEFAULT_TOPIC_TITLE_STYLE,
  overlayCanvasPx,
  TOPIC_TITLE_DESIGN_WIDTH,
  type TopicTitleStyle
} from "../../topic-title-style.js";

const TITLE_LINE_HEIGHT = 1.2;
const AVERAGE_GLYPH_EM = 0.6;
const MAX_TITLE_LINES = 12;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapTopicTitle(
  title: string,
  maxCharacters: number
): string[] {
  const limit = Math.max(1, Math.floor(maxCharacters));
  const paragraphs = title.replaceAll("\r\n", "\n").split("\n");
  const lines: string[] = [];

  function pushLine(line: string): void {
    if (lines.length < MAX_TITLE_LINES) {
      lines.push(line);
    }
  }

  function flushWord(word: string, current: string): string {
    if (word.length <= limit) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && candidate.length > limit) {
        pushLine(current);
        return word;
      }
      return candidate;
    }
    if (current) {
      pushLine(current);
    }
    for (let index = 0; index < word.length; index += limit) {
      const chunk = word.slice(index, index + limit);
      if (index + limit >= word.length) {
        return chunk;
      }
      pushLine(chunk);
    }
    return "";
  }

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "" && paragraph.length === 0) {
      pushLine("");
      continue;
    }
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      current = flushWord(word, current);
    }
    if (current) {
      pushLine(current);
    }
  }

  return lines.length > 0 ? lines : [""];
}

export interface TopicTitleCardMetrics {
  fontSize: number;
  padding: number;
  border: number;
  radius: number;
  cardWidth: number;
  cardHeight: number;
  innerWidth: number;
  lines: string[];
}

export function topicTitleCardMetrics(
  title: string,
  titleStyle?: TopicTitleStyle
): TopicTitleCardMetrics {
  const style = clampTopicTitleStyle(
    titleStyle,
    DEFAULT_TOPIC_TITLE_STYLE
  );
  const fontSize = overlayCanvasPx(style.fontSize);
  const padding = overlayCanvasPx(style.padding);
  const border = overlayCanvasPx(style.border);
  const radius = overlayCanvasPx(style.radius);
  const cardWidth = Math.round(
    TOPIC_TITLE_DESIGN_WIDTH * TOPIC_TITLE_WIDTH_FRACTION
  );
  const innerWidth = Math.max(
    fontSize,
    cardWidth - (padding + border) * 2
  );
  const maxCharacters = Math.max(
    4,
    Math.floor(innerWidth / (fontSize * AVERAGE_GLYPH_EM))
  );
  const lines = wrapTopicTitle(title, maxCharacters);
  const lineHeight = fontSize * TITLE_LINE_HEIGHT;
  const cardHeight = Math.max(
    2,
    Math.round(
      border * 2 + padding * 2 + Math.max(1, lines.length) * lineHeight
    )
  );
  return {
    fontSize,
    padding,
    border,
    radius,
    cardWidth,
    cardHeight,
    innerWidth,
    lines
  };
}

export async function renderTopicTitleCard(
  projectDirectory: string,
  title: string,
  titleStyle?: TopicTitleStyle
): Promise<string> {
  const output = path.join(
    projectDirectory,
    ...TOPIC_TITLE_CARD_FILE.split("/")
  );
  await fs.mkdir(path.dirname(output), { recursive: true });

  const style = clampTopicTitleStyle(
    titleStyle,
    DEFAULT_TOPIC_TITLE_STYLE
  );
  const {
    fontSize,
    padding,
    border,
    radius,
    cardWidth,
    cardHeight,
    lines
  } = topicTitleCardMetrics(title, style);
  const escapedLines = lines.map(escapeXml);
  const lineHeight = fontSize * TITLE_LINE_HEIGHT;
  const firstBaseline = border + padding + fontSize * 0.8;
  const titleLines = escapedLines
    .map(
      (line, index) =>
        `<tspan x="${cardWidth / 2}" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`
    )
    .join("");
  const innerLeft = border;
  const innerTop = border;
  const innerWidthPx = Math.max(0, cardWidth - border * 2);
  const innerHeightPx = Math.max(0, cardHeight - border * 2);
  const innerRadius = Math.max(0, radius - border);
  const outerFill =
    border > 0 ? style.borderColor : style.background;
  const innerRect =
    border > 0 && innerWidthPx > 0 && innerHeightPx > 0
      ? `<rect
        x="${innerLeft}"
        y="${innerTop}"
        width="${innerWidthPx}"
        height="${innerHeightPx}"
        rx="${innerRadius}"
        fill="${style.background}"
      />`
      : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
      <style>
        .title {
          font-family: ${style.fontFamily};
          font-size: ${fontSize}px;
          font-weight: 700;
          fill: ${style.color};
          text-anchor: middle;
        }
      </style>
      <rect
        x="0"
        y="0"
        width="${cardWidth}"
        height="${cardHeight}"
        rx="${radius}"
        fill="${outerFill}"
      />
      ${innerRect}
      <text x="${cardWidth / 2}" y="${firstBaseline}" class="title">${titleLines}</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .resize(cardWidth, cardHeight, { fit: "fill" })
    .png()
    .toFile(output);
  return output;
}

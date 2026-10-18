import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  TOPIC_TITLE_LINE_HEIGHT,
  TOPIC_TITLE_MIN_HEIGHT,
  TOPIC_TITLE_PADDING,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../timeline/topic-constants.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapTitle(title: string, maxCharacters = 28): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current
      ? `${current} ${word}`
      : word;
    if (current && candidate.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines.slice(0, 3) : [""];
}

export async function renderTopicTitleCard(
  projectDirectory: string,
  title: string
): Promise<string> {
  const output = path.join(
    projectDirectory,
    "processed",
    "topic-title-card.png"
  );
  await fs.mkdir(path.dirname(output), { recursive: true });

  const lines = wrapTitle(title).map(escapeXml);
  const lineHeight = TOPIC_TITLE_LINE_HEIGHT;
  const cardHeight = Math.max(
    TOPIC_TITLE_MIN_HEIGHT,
    lines.length * lineHeight + TOPIC_TITLE_PADDING
  );
  const cardTop = 850 - cardHeight / 2;
  const firstBaseline =
    cardTop +
    (cardHeight - (lines.length - 1) * lineHeight) / 2 +
    20;
  const titleLines = lines
    .map(
      (line, index) =>
      `<tspan x="540" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`
    )
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
      <style>
        .title {
          font-family: Roboto, Arial, sans-serif;
          font-size: 56px;
          font-weight: 700;
          fill: #ffffff;
          text-anchor: middle;
        }
      </style>
      <rect
        x="${1080 * (1 - TOPIC_TITLE_WIDTH_FRACTION) / 2}"
        y="${cardTop}"
        width="${1080 * TOPIC_TITLE_WIDTH_FRACTION}"
        height="${cardHeight}"
        rx="24"
        fill="#000000"
      />
      <text x="540" y="${firstBaseline}" class="title">${titleLines}</text>
    </svg>
  `;

  // Keep only the visible card. Its 864px width is exactly 80% of the
  // 1080px canvas, so CapCut imports it at the requested visual width.
  await sharp(Buffer.from(svg))
    .png()
    .trim()
    .toFile(output);
  return output;
}

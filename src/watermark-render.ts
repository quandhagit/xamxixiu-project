import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  clampWatermarkStyle,
  watermarkTextSize,
  type WatermarkStyle
} from "./watermark-style.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export async function renderWatermarkPng(
  style: WatermarkStyle,
  outputPath: string
): Promise<{
  file: string;
  width: number;
  height: number;
  pad: number;
}> {
  const clamped = clampWatermarkStyle(style);
  const size = watermarkTextSize(clamped);
  const width = even(size.width);
  const height = even(size.height);
  const baseline = size.fontSize * 0.92;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text
        x="0"
        y="${baseline}"
        font-family="${escapeXml(clamped.fontFamily)}"
        font-size="${size.fontSize}px"
        font-weight="700"
        fill="${clamped.color}"
      >${escapeXml(clamped.text)}</text>
    </svg>
  `;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return {
    file: outputPath,
    width,
    height,
    pad: 0
  };
}

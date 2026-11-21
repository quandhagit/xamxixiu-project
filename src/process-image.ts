import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  clampCommentCaptureStyle,
  shadowOffset,
  type CommentCaptureStyle
} from "./capture-style.js";
import { overlayCanvasPx } from "./topic-title-style.js";

const DEFAULT_PROCESS_CONCURRENCY = 3;

export interface ImageProcessor {
  enqueue(
    inputPath: string,
    outputPath: string,
    options?: { deleteInput?: boolean }
  ): Promise<void>;
  drain(): Promise<void>;
}

export interface AppliedCaptureStyle {
  width: number;
  height: number;
  originX: number;
  originY: number;
}

function imageSize(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1) {
    return 1;
  }
  return rounded;
}

function scaleStylePx(value: number): number {
  return Math.max(0, Math.round(overlayCanvasPx(value)));
}

function roundedRectSvg(options: {
  width: number;
  height: number;
  radius: number;
  fill: string;
}): Buffer {
  const width = imageSize(options.width);
  const height = imageSize(options.height);
  const radius = Math.min(
    Math.max(0, options.radius),
    width / 2,
    height / 2
  );

  return Buffer.from(`
    <svg
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
    >
      <rect
        x="0"
        y="0"
        width="${width}"
        height="${height}"
        rx="${radius}"
        ry="${radius}"
        fill="${options.fill}"
      />
    </svg>
  `);
}

export function createImageProcessor(options?: {
  concurrency?: number;
}): ImageProcessor {
  const limit = Math.max(
    1,
    options?.concurrency ?? DEFAULT_PROCESS_CONCURRENCY
  );
  let active = 0;
  const waiting: Array<() => void> = [];
  const jobs: Promise<void>[] = [];

  async function withSlot<T>(
    work: () => Promise<T>
  ): Promise<T> {
    while (active >= limit) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }

    active += 1;

    try {
      return await work();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  return {
    enqueue(inputPath, outputPath, jobOptions) {
      const job = withSlot(async () => {
        await processImage(inputPath, outputPath);
        console.log(`Processed: ${outputPath}`);

        if (jobOptions?.deleteInput) {
          await fs.rm(inputPath, { force: true });
        }
      });
      jobs.push(job);
      return job;
    },
    async drain() {
      await Promise.all(jobs);
    }
  };
}

export async function processProjectImages(
  rawDir: string,
  processedDir: string
): Promise<void> {
  await fs.mkdir(processedDir, {
    recursive: true
  });

  const files = await fs.readdir(rawDir).catch(
    () => [] as string[]
  );

  const images = files.filter(
    (file) => file.endsWith(".png")
  );

  if (images.length === 0) {
    return;
  }

  const processor = createImageProcessor();

  for (const file of images) {
    processor.enqueue(
      path.join(rawDir, file),
      path.join(processedDir, file)
    );
  }

  await processor.drain();
}

export async function processImage(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(
      `Invalid image: ${inputPath}`
    );
  }

  const width = Math.min(
    metadata.width,
    1000
  );
  const height = Math.round(
    metadata.height *
    (width / metadata.width)
  );

  await image
    .resize(width, height, {
      fit: "inside"
    })
    .png()
    .toFile(outputPath);
}

export async function applyCaptureStyle(
  inputPath: string,
  outputPath: string,
  style?: CommentCaptureStyle
): Promise<AppliedCaptureStyle> {
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(
      `Invalid image: ${inputPath}`
    );
  }

  const width = metadata.width;
  const height = metadata.height;
  const source = clampCommentCaptureStyle(style);
  const clamped: CommentCaptureStyle = {
    ...source,
    radius: scaleStylePx(source.radius),
    border: scaleStylePx(source.border),
    shadow: scaleStylePx(source.shadow)
  };
  const roundedImage = clamped.radius > 0
    ? await image
        .composite([
          {
            input: roundedRectSvg({
              width,
              height,
              radius: clamped.radius,
              fill: "white"
            }),
            blend: "dest-in"
          }
        ])
        .png()
        .toBuffer()
    : await image.png().toBuffer();

  if (clamped.border <= 0 && clamped.shadow <= 0) {
    await sharp(roundedImage).png().toFile(outputPath);
    return {
      width,
      height,
      originX: 0,
      originY: 0
    };
  }

  const offsetY = shadowOffset(clamped.shadow);
  const sigma =
    clamped.shadow > 0
      ? Math.min(1000, Math.max(0.3, clamped.shadow / 2))
      : 0;
  const blurPad =
    clamped.shadow > 0 ? Math.ceil(sigma * 3) : 0;
  const originX = clamped.border + blurPad;
  const originY = clamped.border + blurPad;
  const canvasWidth = originX + width + clamped.border + blurPad;
  const canvasHeight =
    originY + height + clamped.border + blurPad + offsetY;
  const layers: Array<{
    input: Buffer;
    left: number;
    top: number;
  }> = [];

  if (clamped.shadow > 0) {
    const shadowWidth = width + clamped.border * 2;
    const shadowHeight = height + clamped.border * 2;
    const shadowCanvasWidth = shadowWidth + blurPad * 2;
    const shadowCanvasHeight = shadowHeight + blurPad * 2;
    const shadowShape = await sharp(
      await sharp({
        create: {
          width: imageSize(shadowCanvasWidth),
          height: imageSize(shadowCanvasHeight),
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([
          {
            input: roundedRectSvg({
              width: shadowWidth,
              height: shadowHeight,
              radius: clamped.radius + clamped.border,
              fill: clamped.shadowColor
            }),
            left: blurPad,
            top: blurPad
          }
        ])
        .png()
        .toBuffer()
    )
      .blur(sigma)
      .png()
      .toBuffer();

    layers.push({
      input: shadowShape,
      left: originX - clamped.border - blurPad,
      top: originY - clamped.border - blurPad + offsetY
    });
  }

  if (clamped.border > 0) {
    layers.push({
      input: roundedRectSvg({
        width: width + clamped.border * 2,
        height: height + clamped.border * 2,
        radius: clamped.radius + clamped.border,
        fill: clamped.borderColor
      }),
      left: originX - clamped.border,
      top: originY - clamped.border
    });
  }

  layers.push({
    input: roundedImage,
    left: originX,
    top: originY
  });

  await sharp({
    create: {
      width: imageSize(canvasWidth),
      height: imageSize(canvasHeight),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(layers)
    .png()
    .toFile(outputPath);

  return {
    width: imageSize(canvasWidth),
    height: imageSize(canvasHeight),
    originX: Math.round(originX),
    originY: Math.round(originY)
  };
}

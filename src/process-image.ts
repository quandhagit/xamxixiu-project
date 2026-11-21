import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const DEFAULT_PROCESS_CONCURRENCY = 3;

export interface ImageProcessor {
  enqueue(
    inputPath: string,
    outputPath: string,
    options?: { deleteInput?: boolean }
  ): Promise<void>;
  drain(): Promise<void>;
}

export function createImageProcessor(
  concurrency = DEFAULT_PROCESS_CONCURRENCY
): ImageProcessor {
  const limit = Math.max(1, concurrency);
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
    enqueue(inputPath, outputPath, options) {
      const job = withSlot(async () => {
        await processImage(inputPath, outputPath);
        console.log(`Processed: ${outputPath}`);

        if (options?.deleteInput) {
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

  const radius = 12;

  const roundedCorners = Buffer.from(`
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
        fill="white"
      />
    </svg>
  `);

  await image
    .resize(width, height, {
      fit: "inside"
    })
    .composite([
      {
        input: roundedCorners,
        blend: "dest-in"
      }
    ])
    .png()
    .toFile(outputPath);
}

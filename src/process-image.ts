import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export async function processProjectImages(
  rawDir: string,
  processedDir: string
): Promise<void> {
  await fs.mkdir(processedDir, {
    recursive: true
  });

  const files = await fs.readdir(rawDir);

  const images = files.filter(
    (file) => file.endsWith(".png")
  );

  for (const file of images) {
    const inputPath = path.join(
      rawDir,
      file
    );

    const outputPath = path.join(
      processedDir,
      file
    );

    await processImage(
      inputPath,
      outputPath
    );

    console.log(
      `Processed: ${outputPath}`
    );
  }
}

async function processImage(
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
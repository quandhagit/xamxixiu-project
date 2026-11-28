import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { processImage } from "../process-image.js";
import type { ThreadComment } from "../types.js";
import { COMMENT_IMAGE_MAX_BYTES } from "./comment-constants.js";

export function commentProcessedPngName(imageIndex: number): string {
  return `comment-${String(imageIndex + 1).padStart(2, "0")}.png`;
}

export function emptyImportedComment(
  imageIndex: number
): ThreadComment {
  return {
    author: "",
    text: "",
    likes: 0,
    containerIndex: imageIndex,
    commentIndex: imageIndex
  };
}

export async function importCommentImage(input: {
  projectDir: string;
  imageIndex: number;
  bytes: Buffer;
}): Promise<ThreadComment> {
  if (
    !Number.isInteger(input.imageIndex) ||
    input.imageIndex < 0
  ) {
    throw new Error(
      "imageIndex must be an integer greater than or equal to 0"
    );
  }

  if (input.bytes.length === 0) {
    throw new Error("Comment image cannot be empty");
  }

  if (input.bytes.length > COMMENT_IMAGE_MAX_BYTES) {
    throw new Error("Comment image is too large");
  }

  const filename = commentProcessedPngName(input.imageIndex);
  const outputPath = path.join(
    input.projectDir,
    "processed",
    filename
  );
  const tempPath = path.join(
    os.tmpdir(),
    `xamxixiu-${Date.now()}-${filename}`
  );

  try {
    await fs.writeFile(tempPath, input.bytes);
    const metadata = await sharp(tempPath).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid comment image");
    }

    await fs.mkdir(path.dirname(outputPath), {
      recursive: true
    });
    await fs.rm(outputPath, { force: true });
    await processImage(tempPath, outputPath);
  } catch (error: unknown) {
    await fs.rm(outputPath, { force: true });

    if (
      error instanceof Error &&
      (error.message === "Invalid comment image" ||
        error.message === "Comment image cannot be empty" ||
        error.message === "Comment image is too large" ||
        error.message.startsWith("imageIndex must be"))
    ) {
      throw error;
    }

    throw new Error("Invalid comment image");
  } finally {
    await fs.rm(tempPath, { force: true });
  }

  return emptyImportedComment(input.imageIndex);
}

import fs from "node:fs/promises";
import path from "node:path";

import type {
  ContentData,
  ThreadAnalysis,
  ThreadData
} from "../types.js";

const ORIGINAL_COMMENT_DIR = "capture-original";
const COMMENT_PNG = /^comment-(\d+)\.png$/i;
const COMMENT_MP3 = /^comment-(\d+)\.mp3$/i;

function errorCode(error: unknown): string | undefined {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error)
  ) {
    return undefined;
  }

  const code = error.code;

  return typeof code === "string"
    ? code
    : undefined;
}

async function readJsonIfExists<T>(
  filePath: string
): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(
      filePath,
      "utf-8"
    );

    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function removeIfExists(
  filePath: string
): Promise<void> {
  await fs.rm(filePath, { force: true });
}

async function discardFilesFrom(
  directory: string,
  pattern: RegExp,
  toIndex: (match: string) => number,
  savedCount: number
): Promise<void> {
  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const file of entries) {
    const match = pattern.exec(file);

    if (!match?.[1]) {
      continue;
    }

    const index = toIndex(match[1]);

    if (
      !Number.isInteger(index) ||
      index < savedCount
    ) {
      continue;
    }

    await removeIfExists(
      path.join(directory, file)
    );
  }
}

export async function discardUnsavedCommentFiles(
  projectDirectory: string
): Promise<number> {
  const saved =
    (await readJsonIfExists<ContentData>(
      path.join(projectDirectory, "content.json")
    )) ??
    (await readJsonIfExists<ContentData>(
      path.join(projectDirectory, "thread.json")
    ));
  const savedCount = saved?.comments.length ?? 0;

  await discardFilesFrom(
    path.join(projectDirectory, "processed"),
    COMMENT_PNG,
    (value) => Number(value) - 1,
    savedCount
  );
  await discardFilesFrom(
    path.join(projectDirectory, "audio"),
    COMMENT_MP3,
    (value) => Number(value),
    savedCount
  );

  return savedCount;
}

async function directoryExists(
  directory: string
): Promise<boolean> {
  try {
    const stats = await fs.stat(directory);
    return stats.isDirectory();
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function snapshotOriginalCommentImages(
  projectDirectory: string
): Promise<void> {
  const snapshotDirectory = path.join(
    projectDirectory,
    ORIGINAL_COMMENT_DIR
  );

  if (await directoryExists(snapshotDirectory)) {
    return;
  }

  const processedDirectory = path.join(
    projectDirectory,
    "processed"
  );
  let entries: string[];

  try {
    entries = await fs.readdir(processedDirectory);
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return;
    }

    throw error;
  }

  await fs.mkdir(snapshotDirectory, { recursive: true });

  for (const file of entries) {
    if (!/^comment-\d+\.png$/i.test(file)) {
      continue;
    }

    await fs.copyFile(
      path.join(processedDirectory, file),
      path.join(snapshotDirectory, file)
    );
  }
}

async function restoreOriginalCommentImages(
  projectDirectory: string,
  originalCount: number
): Promise<void> {
  const snapshotDirectory = path.join(
    projectDirectory,
    ORIGINAL_COMMENT_DIR
  );
  const processedDirectory = path.join(
    projectDirectory,
    "processed"
  );

  if (await directoryExists(snapshotDirectory)) {
    const entries = await fs.readdir(snapshotDirectory);
    await fs.mkdir(processedDirectory, { recursive: true });

    for (const file of entries) {
      if (!/^comment-\d+\.png$/i.test(file)) {
        continue;
      }

      await fs.copyFile(
        path.join(snapshotDirectory, file),
        path.join(processedDirectory, file)
      );
    }
  }

  await discardFilesFrom(
    processedDirectory,
    COMMENT_PNG,
    (value) => Number(value) - 1,
    originalCount
  );
  await discardFilesFrom(
    path.join(projectDirectory, "audio"),
    COMMENT_MP3,
    (value) => Number(value),
    originalCount
  );
}

export async function restoreCapturedContent(
  projectDirectory: string,
  expand: (thread: ThreadData) => ThreadData
): Promise<ContentData> {
  const thread = await readJsonIfExists<ThreadData>(
    path.join(projectDirectory, "thread.json")
  );

  if (!thread) {
    throw new Error("Không có bản capture gốc để reset.");
  }

  const content = expand(thread);
  await restoreOriginalCommentImages(
    projectDirectory,
    content.comments.length
  );
  await fs.writeFile(
    path.join(projectDirectory, "content.json"),
    JSON.stringify(content, null, 2),
    "utf-8"
  );

  const analysisFile = path.join(
    projectDirectory,
    "analysis.json"
  );
  const analysis =
    await readJsonIfExists<ThreadAnalysis>(analysisFile);

  if (analysis) {
    analysis.topicTitle = content.topicTitle ?? "";
    await fs.writeFile(
      analysisFile,
      JSON.stringify(analysis, null, 2),
      "utf-8"
    );
  }

  return content;
}

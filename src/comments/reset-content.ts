import fs from "node:fs/promises";
import path from "node:path";

import type {
  ContentData
} from "../types.js";

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
    /^comment-(\d+)\.png$/i,
    (value) => Number(value) - 1,
    savedCount
  );
  await discardFilesFrom(
    path.join(projectDirectory, "audio"),
    /^comment-(\d+)\.mp3$/i,
    (value) => Number(value),
    savedCount
  );

  return savedCount;
}

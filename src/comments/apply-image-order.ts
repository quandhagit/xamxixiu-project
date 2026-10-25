import fs from "node:fs/promises";
import path from "node:path";

import type {
  MatchedReaction
} from "../assets/matcher.js";
import type {
  AudioFailure,
  ThreadAnalysis
} from "../types.js";

function assertPermutation(
  imageOrder: number[],
  commentCount: number
): void {
  if (imageOrder.length !== commentCount) {
    throw new Error(
      `imageOrder length ${imageOrder.length} does not match comments length ${commentCount}`
    );
  }

  const seen = new Set<number>();

  for (const value of imageOrder) {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value >= commentCount ||
      seen.has(value)
    ) {
      throw new Error(
        "imageOrder must be a permutation of comment indexes"
      );
    }

    seen.add(value);
  }
}

function isIdentity(imageOrder: number[]): boolean {
  return imageOrder.every(
    (value, index) => value === index
  );
}

export function inverseImageOrder(
  imageOrder: number[]
): number[] {
  const inverse = new Array<number>(
    imageOrder.length
  );

  for (
    let newIndex = 0;
    newIndex < imageOrder.length;
    newIndex++
  ) {
    inverse[imageOrder[newIndex]] = newIndex;
  }

  return inverse;
}

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

async function writeJson(
  filePath: string,
  value: unknown
): Promise<void> {
  const temporary = `${filePath}.tmp`;

  try {
    await fs.writeFile(
      temporary,
      JSON.stringify(value, null, 2),
      "utf-8"
    );
    await fs.rename(temporary, filePath);
  } catch (error: unknown) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function commentPngName(index: number): string {
  return `comment-${String(index + 1).padStart(2, "0")}.png`;
}

function commentMp3Name(index: number): string {
  return `comment-${index}.mp3`;
}

function newIndexFor(
  imageOrder: number[],
  oldIndex: number
): number {
  const next = imageOrder.indexOf(oldIndex);

  return next === -1 ? oldIndex : next;
}

interface StagedFile {
  source: string;
  temp: string;
  destination: string;
}

async function renameIfExists(
  source: string,
  destination: string
): Promise<boolean> {
  try {
    await fs.rename(source, destination);
    return true;
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function renameCommentFiles(
  projectDirectory: string,
  imageOrder: number[]
): Promise<void> {
  const tempDirectory = path.join(
    projectDirectory,
    ".image-order-tmp"
  );

  await fs.rm(tempDirectory, {
    recursive: true,
    force: true
  });
  await fs.mkdir(tempDirectory);

  const staged: StagedFile[] = [];
  const placed: StagedFile[] = [];
  let placedAll = false;

  try {
    for (
      let newIndex = 0;
      newIndex < imageOrder.length;
      newIndex++
    ) {
      const oldIndex = imageOrder[newIndex];
      const pairs = [
        {
          folder: "processed",
          sourceName: commentPngName(oldIndex),
          destinationName: commentPngName(newIndex)
        },
        {
          folder: "audio",
          sourceName: commentMp3Name(oldIndex),
          destinationName: commentMp3Name(newIndex)
        }
      ];

      for (const pair of pairs) {
        const source = path.join(
          projectDirectory,
          pair.folder,
          pair.sourceName
        );
        const temp = path.join(
          tempDirectory,
          `${pair.folder}-${pair.destinationName}`
        );
        const moved = await renameIfExists(
          source,
          temp
        );

        if (!moved) {
          continue;
        }

        staged.push({
          source,
          temp,
          destination: path.join(
            projectDirectory,
            pair.folder,
            pair.destinationName
          )
        });
      }
    }

    for (const item of staged) {
      await fs.rename(item.temp, item.destination);
      placed.push(item);
    }

    placedAll = true;
  } catch (error: unknown) {
    for (const item of placed) {
      await renameIfExists(
        item.destination,
        item.source
      );
    }

    throw error;
  } finally {
    if (!placedAll) {
      for (const item of staged) {
        await renameIfExists(
          item.temp,
          item.source
        );
      }
    }

    await fs.rm(tempDirectory, {
      recursive: true,
      force: true
    });
  }
}

function remapAnalysis(
  analysis: ThreadAnalysis,
  imageOrder: number[]
): ThreadAnalysis {
  return {
    ...analysis,
    reactions: analysis.reactions.map((reaction) => ({
      ...reaction,
      commentIndex: newIndexFor(
        imageOrder,
        reaction.commentIndex
      )
    }))
  };
}

function remapReactions(
  reactions: MatchedReaction[],
  imageOrder: number[]
): MatchedReaction[] {
  return reactions.map((reaction) => ({
    ...reaction,
    commentIndex: newIndexFor(
      imageOrder,
      reaction.commentIndex
    )
  }));
}

function remapAudioFailures(
  failures: AudioFailure[],
  imageOrder: number[]
): AudioFailure[] {
  return failures.map((failure) => {
    const match = /^comment-(\d+)$/.exec(
      failure.target
    );

    if (!match) {
      return failure;
    }

    const oldIndex = Number(match[1]);
    const newIndex = newIndexFor(
      imageOrder,
      oldIndex
    );
    const target: AudioFailure["target"] =
      `comment-${newIndex}`;

    return {
      ...failure,
      target
    };
  });
}

export async function applyImageOrder(
  projectDirectory: string,
  imageOrder: number[] | undefined,
  commentCount: number
): Promise<void> {
  if (!imageOrder) {
    return;
  }

  assertPermutation(imageOrder, commentCount);

  if (isIdentity(imageOrder)) {
    return;
  }

  const analysisPath = path.join(
    projectDirectory,
    "analysis.json"
  );
  const reactionsPath = path.join(
    projectDirectory,
    "reactions.json"
  );
  const failuresPath = path.join(
    projectDirectory,
    "audio-failures.json"
  );
  const analysis = await readJsonIfExists<ThreadAnalysis>(
    analysisPath
  );
  const reactions = await readJsonIfExists<MatchedReaction[]>(
    reactionsPath
  );
  const failures = await readJsonIfExists<AudioFailure[]>(
    failuresPath
  );

  if (analysis && !Array.isArray(analysis.reactions)) {
    throw new Error(
      "analysis.json reactions are invalid"
    );
  }

  if (reactions && !Array.isArray(reactions)) {
    throw new Error("reactions.json is invalid");
  }

  if (failures && !Array.isArray(failures)) {
    throw new Error(
      "audio-failures.json is invalid"
    );
  }

  const nextAnalysis = analysis
    ? remapAnalysis(analysis, imageOrder)
    : undefined;
  const nextReactions = reactions
    ? remapReactions(reactions, imageOrder)
    : undefined;
  const nextFailures = failures
    ? remapAudioFailures(failures, imageOrder)
    : undefined;

  await renameCommentFiles(
    projectDirectory,
    imageOrder
  );

  const written: Array<{
    filePath: string;
    original: unknown;
  }> = [];
  const timelinePath = path.join(
    projectDirectory,
    "timeline.json"
  );
  let timelineBackup: Buffer | undefined;

  try {
    try {
      timelineBackup = await fs.readFile(
        timelinePath
      );
    } catch (error: unknown) {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }

    if (nextAnalysis) {
      await writeJson(analysisPath, nextAnalysis);
      written.push({
        filePath: analysisPath,
        original: analysis
      });
    }

    if (nextReactions) {
      await writeJson(reactionsPath, nextReactions);
      written.push({
        filePath: reactionsPath,
        original: reactions
      });
    }

    if (nextFailures) {
      await writeJson(failuresPath, nextFailures);
      written.push({
        filePath: failuresPath,
        original: failures
      });
    }

    await fs.rm(timelinePath, { force: true });
  } catch (error: unknown) {
    await renameCommentFiles(
      projectDirectory,
      inverseImageOrder(imageOrder)
    );

    for (const item of written) {
      await writeJson(item.filePath, item.original);
    }

    if (timelineBackup) {
      await fs.writeFile(
        timelinePath,
        timelineBackup
      );
    }

    throw error;
  }
}

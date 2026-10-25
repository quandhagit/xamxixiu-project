import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type {
  ThreadAnalysis,
  ThreadData,
  TimelineCommentBlock,
  TimelineOverlay,
  TimelineScene,
  VideoTimeline
} from "../types.js";
import type { MatchedReaction } from "../assets/matcher.js";
import type { Asset } from "../assets/scanner.js";
import {
  findAsset,
  scanAssets
} from "../assets/scanner.js";
import {
  SCENE_GAP_SECONDS,
  getSceneDuration
} from "./timing.js";
import { getTopicMemeLayout } from "./topic-layout.js";
import { shouldGenerateTopicTitleVoice } from "./topic-constants.js";
import { readMediaDuration } from "../media-duration.js";
import { renderTopicTitleCard } from "../capcut/compile/title-card.js";

const CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30
} as const;
const MIN_OVERLAY_DURATION = 1;
const COMMENT_IMAGE_Y = CANVAS.height / 4;
const COMMENT_STACK_PADDING = 50;

interface ProjectInputs {
  thread: ThreadData;
  analysis: ThreadAnalysis;
  assets: Asset[];
  reactions: MatchedReaction[];
}

function projectPath(file: string): string {
  return file.replaceAll("\\", "/");
}

function resolveProjectFile(
  projectDir: string,
  relativeFile: string
): string {
  return path.resolve(projectDir, relativeFile);
}

function timelineFile(
  file: string
): string {
  return projectPath(
    path.relative(process.cwd(), path.resolve(file))
  );
}

async function readJson<T>(
  file: string
): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

async function assertFile(
  file: string,
  description: string
): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    throw new Error(
      `${description} not found: ${file}`
    );
  }
}

function createOverlay(
  type: "meme" | "sfx",
  file: string,
  duration: number,
  animation?: TimelineScene["overlays"][number]["animation"],
  start = 0,
  fadeIn?: number,
  animationDuration?: number
): TimelineOverlay {
  return {
    type,
    file,
    start,
    duration: Math.max(duration, 0),
    ...(animation ? { animation } : {}),
    ...(fadeIn ? { fadeIn } : {}),
    ...(animationDuration
      ? { animationDuration }
      : {})
  };
}

function createScene(
  id: string,
  commentIndex: number | null,
  imageFile: string,
  audioFile: string,
  audioDuration: number,
  overlays: TimelineOverlay[],
  sceneDuration = audioDuration,
  imageStart = 0,
  audioStart = 0
): TimelineScene {
  const overlayEnd = overlays.reduce(
    (latest, overlay) =>
      Math.max(
        latest,
        overlay.start + overlay.duration
      ),
    0
  );
  const finalSceneDuration = Math.max(
    sceneDuration,
    audioStart + audioDuration,
    overlayEnd
  );

  return {
    id,
    commentIndex,
    imageFile,
    imageStart,
    imageDuration: Math.max(
      0,
      finalSceneDuration - imageStart
    ),
    sceneDuration: finalSceneDuration,
    imageScale: 0.85,
    imageY:
      (CANVAS.height / 2 - COMMENT_IMAGE_Y) /
      (CANVAS.height / 2),
    audioFile,
    audioStart,
    audioDuration,
    overlays
  };
}

function sceneToBlock(
  scene: TimelineScene,
  offset: number
): TimelineCommentBlock {
  return {
    commentIndex: scene.commentIndex ?? -1,
    imageFile: scene.imageFile,
    imageStart: scene.imageStart + offset,
    imageDuration: scene.imageDuration,
    sceneDuration: getSceneDuration(scene),
    imageScale: scene.imageScale,
    imageX: scene.imageX,
    imageY: scene.imageY,
    audioFile: scene.audioFile,
    audioStart: scene.audioStart + offset,
    audioDuration: scene.audioDuration,
    overlays: scene.overlays.map((overlay) => ({
      ...overlay,
      start: overlay.start + offset
    }))
  };
}

async function getCaptureHeight(
  block: TimelineCommentBlock
): Promise<number> {
  const metadata = await sharp(
    path.resolve(block.imageFile)
  ).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(
      `Không đọc được kích thước capture: ${block.imageFile}`
    );
  }
  return (
    metadata.height /
    metadata.width *
    CANVAS.width *
    (block.imageScale ?? 1)
  );
}

async function combineCommentScenes(
  scenes: TimelineScene[]
): Promise<TimelineScene> {
  const blocks: TimelineCommentBlock[] = [];
  let offset = 0;
  for (const scene of scenes) {
    blocks.push(sceneToBlock(scene, offset));
    offset += getSceneDuration(scene);
  }

  const totalDuration = offset;
  let previousCenterY = COMMENT_IMAGE_Y;
  let previousHeight = 0;
  for (const block of blocks) {
    const height = await getCaptureHeight(block);
    const centerY =
      previousHeight === 0
        ? COMMENT_IMAGE_Y
        : previousCenterY +
        previousHeight / 2 +
        COMMENT_STACK_PADDING +
        height / 2;
    block.imageY =
      (CANVAS.height / 2 - centerY) /
      (CANVAS.height / 2);
    block.imageDuration = Math.max(
      0,
      totalDuration - block.imageStart
    );
    previousCenterY = centerY;
    previousHeight = height;
  }

  const first = blocks[0];
  if (!first) {
    throw new Error("Cannot combine empty comment scenes");
  }

  return {
    id: `comments-${blocks
      .map((block) => block.commentIndex)
      .join("-")}`,
    commentIndex: first.commentIndex,
    imageFile: first.imageFile,
    imageStart: first.imageStart,
    imageDuration: totalDuration - first.imageStart,
    sceneDuration: totalDuration,
    imageScale: first.imageScale,
    imageX: first.imageX,
    imageY: first.imageY,
    audioFile: first.audioFile,
    audioStart: first.audioStart,
    audioDuration: first.audioDuration,
    overlays: first.overlays,
    blocks
  };
}

function getCommentGroups(
  thread: ThreadData
): number[][] {
  const children = new Map<number, number[]>();
  for (let index = 0; index < thread.comments.length; index++) {
    const parent = thread.comments[index].parentCommentIndex;
    if (
      parent !== undefined &&
      parent >= 0 &&
      parent < thread.comments.length &&
      !thread.comments[parent].excluded
    ) {
      children.set(parent, [
        ...(children.get(parent) ?? []),
        index
      ]);
    }
  }

  const groups: number[][] = [];
  const visited = new Set<number>();
  const addGroup = (root: number): void => {
    if (visited.has(root) || thread.comments[root].excluded) {
      return;
    }
    const group = [root];
    visited.add(root);
    for (const child of children.get(root) ?? []) {
      group.push(...getDescendantIndexes(child, children, visited));
    }
    groups.push(group);
  };

  for (let index = 0; index < thread.comments.length; index++) {
    const parent = thread.comments[index].parentCommentIndex;
    if (
      parent === undefined ||
      !children.has(parent)
    ) {
      addGroup(index);
    }
  }
  return groups;
}

function getDescendantIndexes(
  root: number,
  children: Map<number, number[]>,
  visited: Set<number>
): number[] {
  if (visited.has(root)) {
    return [];
  }
  visited.add(root);
  const result = [root];
  for (const child of children.get(root) ?? []) {
    result.push(...getDescendantIndexes(child, children, visited));
  }
  return result;
}

async function createCommentScene(
  projectDir: string,
  commentIndex: number,
  reaction: MatchedReaction | undefined
): Promise<TimelineScene> {
  const imageAbsolute = path.join(
    projectDir,
    "processed",
    `comment-${String(commentIndex + 1).padStart(2, "0")}.png`
  );
  const audioAbsolute = path.join(
    projectDir,
    "audio",
    `comment-${commentIndex}.mp3`
  );

  await assertFile(
    imageAbsolute,
    `Processed comment image ${commentIndex}`
  );
  await assertFile(
    audioAbsolute,
    `Comment audio ${commentIndex}`
  );

  const audioDuration =
    await readMediaDuration(audioAbsolute);
  const overlays: TimelineOverlay[] = [];
  let postVoiceDuration = 0;

  if (reaction?.meme) {
    const memeAbsolute = path.resolve(
      reaction.meme.file
    );
    await assertFile(
      memeAbsolute,
      `Meme asset ${reaction.meme.id}`
    );
    const memeDuration =
      reaction.meme.mediaKind === "video"
        ? await readMediaDuration(memeAbsolute)
        : Math.max(
          MIN_OVERLAY_DURATION,
          reaction.duration
        );
    const memeOverlay = createOverlay(
      "meme",
      projectPath(reaction.meme.file),
      memeDuration,
      reaction.animation,
      audioDuration,
      0.5
    );
    memeOverlay.scale = 1;
    overlays.push(memeOverlay);
    postVoiceDuration = Math.max(
      postVoiceDuration,
      memeDuration
    );
  }

  if (reaction?.sfx) {
    const sfxAbsolute = path.resolve(
      reaction.sfx.file
    );
    await assertFile(
      sfxAbsolute,
      `SFX asset ${reaction.sfx.id}`
    );
    const sfxDuration = await readMediaDuration(
      sfxAbsolute
    );
    overlays.push(
      createOverlay(
        "sfx",
        projectPath(reaction.sfx.file),
        sfxDuration,
        undefined,
        audioDuration
      )
    );
    postVoiceDuration = Math.max(
      postVoiceDuration,
      sfxDuration
    );
    const memeOverlay =
      overlays.find((overlay) =>
        overlay.type === "meme"
      );
    if (memeOverlay) {
      memeOverlay.duration = Math.max(
        memeOverlay.duration,
        sfxDuration
      );
    }
  }

  return createScene(
    `comment-${commentIndex}`,
    commentIndex,
    timelineFile(imageAbsolute),
    timelineFile(audioAbsolute),
    audioDuration,
    overlays,
    audioDuration + postVoiceDuration
  );
}

export async function buildTimeline(
  projectDir: string
): Promise<VideoTimeline> {
  const threadPath = path.join(
    projectDir,
    "thread.json"
  );
  const contentPath = path.join(
    projectDir,
    "content.json"
  );
  const analysisPath = path.join(
    projectDir,
    "analysis.json"
  );
  const reactionsPath = path.join(
    projectDir,
    "reactions.json"
  );
  let thread: ThreadData;
  try {
    thread = await readJson<ThreadData>(
      contentPath
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      thread = await readJson<ThreadData>(
        threadPath
      );
    } else {
      throw error;
    }
  }

  const inputs: ProjectInputs = {
    thread,
    analysis: await readJson<ThreadAnalysis>(
      analysisPath
    ),
    assets: await scanAssets(),
    reactions: await readJson<MatchedReaction[]>(
      reactionsPath
    )
  };

  const topicImage = path.join(
    projectDir,
    "processed",
    "topic.png"
  );
  const topicAudio = path.join(
    projectDir,
    "audio",
    "topic.mp3"
  );

  await assertFile(
    topicImage,
    "Processed topic image"
  );
  await assertFile(
    topicAudio,
    "Topic audio"
  );

  const topicDuration =
    await readMediaDuration(topicAudio);
  const topicTitle =
    inputs.analysis.topicTitle?.trim() ||
    `${thread.text.slice(0, 77).trim()}...`;
  const titleAudioAbsolute = path.join(
    projectDir,
    "audio",
    "topic-title.mp3"
  );
  const openTopicSfx =
    inputs.assets.find((asset) =>
      asset.type === "sfx" &&
      (
        asset.category === "open topic" ||
        asset.category === "open-topic" ||
        asset.tags.includes("open-topic") ||
        asset.tags.includes("open topic")
      )
    )?.file;
  const topicMeme =
    findAsset(inputs.assets, {
      id: inputs.analysis.topicMemeId,
      type: "meme"
    }) ??
    findAsset(inputs.assets, {
      type: "meme",
      category: "topic"
    });
  const topicOverlays: TimelineOverlay[] = [];
  let topicIntro: VideoTimeline["topicIntro"];
  let topicCaptureStart = 0;
  let topicAudioStart = 0;
  const introCase = shouldGenerateTopicTitleVoice(
    thread.text
  )
    ? "long"
    : "short";
  const hasTitleAudio =
    await fs.access(titleAudioAbsolute)
      .then(() => true)
      .catch(() => false);
  const hasTopicIntro =
    Boolean(inputs.analysis.topicTitle?.trim()) &&
    Boolean(openTopicSfx) &&
    (introCase === "short" || hasTitleAudio);
  const titleAudioDuration =
    hasTopicIntro && introCase === "long"
      ? await readMediaDuration(titleAudioAbsolute)
      : 0;
  const blocksDuration =
    introCase === "long"
      ? 0.2 + titleAudioDuration
      : Math.min(3, topicDuration);

  if (hasTopicIntro) {
    topicCaptureStart =
      introCase === "long" ? blocksDuration : 0;
    topicAudioStart =
      introCase === "long" ? blocksDuration : 0;
  }

  if (topicMeme) {
    const topicMemeAbsolute =
      path.resolve(topicMeme.file);
    await assertFile(
      topicMemeAbsolute,
      `Topic meme asset ${topicMeme.id}`
    );
    const topicMemeLayout =
      await getTopicMemeLayout(topicMemeAbsolute);
    topicOverlays.push(
      createOverlay(
        "meme",
        projectPath(topicMeme.file),
        hasTopicIntro
          ? blocksDuration
          : MIN_OVERLAY_DURATION,
        "slide-up",
        0,
        undefined,
        0.2
      )
    );
    const topicOverlay = topicOverlays.at(-1);
    if (topicOverlay) {
      topicOverlay.scale = topicMemeLayout.scale;
      topicOverlay.x = 0;
      topicOverlay.y = topicMemeLayout.y;
    }
  }
  if (hasTopicIntro && openTopicSfx) {
    const openTopicSfxDuration =
      await readMediaDuration(openTopicSfx);
    const titleCardAbsolute =
      await renderTopicTitleCard(
        projectDir,
        topicTitle
      );
    topicIntro = {
      case: introCase,
      title: topicTitle,
      ...(introCase === "long" && hasTitleAudio
        ? {
            titleVoiceFile: timelineFile(
              titleAudioAbsolute
            )
          }
        : {}),
      titleVoiceDuration: titleAudioDuration,
      openSfxFile: timelineFile(openTopicSfx),
      openSfxDuration: openTopicSfxDuration,
      titleCardFile: timelineFile(
        titleCardAbsolute
      ),
      ...(topicMeme
        ? { memeFile: projectPath(topicMeme.file) }
        : {}),
      animationDuration: 0.2,
      blocksDuration,
      captureStart: topicCaptureStart
    };
  }

  const scenes: TimelineScene[] = [
    createScene(
      "topic",
      null,
      timelineFile(topicImage),
      timelineFile(topicAudio),
      topicDuration,
      topicOverlays,
      Math.max(
        topicDuration,
        topicCaptureStart,
        topicOverlays.reduce(
          (end, overlay) =>
            Math.max(
              end,
              overlay.start + overlay.duration
            ),
          0
        )
      ),
      topicCaptureStart,
      topicAudioStart
    )
  ];

  for (const group of getCommentGroups(inputs.thread)) {
    const commentScenes: TimelineScene[] = [];
    for (const commentIndex of group) {
      const reaction = inputs.reactions.find(
        (item) => item.commentIndex === commentIndex
      );
      commentScenes.push(
        await createCommentScene(
          projectDir,
          commentIndex,
          reaction
        )
      );
    }
    scenes.push(
      commentScenes.length === 1
        ? commentScenes[0]
        : await combineCommentScenes(commentScenes)
    );
  }

  const totalDuration = scenes.reduce(
    (total, scene) =>
      total + getSceneDuration(scene) + SCENE_GAP_SECONDS,
    0
  );
  const backgroundFile = (
    inputs.analysis.backgroundAssetId
      ? inputs.assets.find(
        (asset) =>
          asset.type === "background" &&
          asset.id === inputs.analysis.backgroundAssetId
      )
      : inputs.assets.find(
        (asset) => asset.type === "background"
      )
  )?.file;
  const musicFile = (
    inputs.analysis.musicAssetId
      ? inputs.assets.find(
        (asset) =>
          asset.type === "music" &&
          asset.id === inputs.analysis.musicAssetId
      )
      : inputs.assets.find(
        (asset) =>
          asset.type === "music" &&
          (
            asset.category === inputs.analysis.musicType ||
            asset.tags.includes(inputs.analysis.musicType)
          )
      ) ?? inputs.assets.find(
        (asset) => asset.type === "music"
      )
  )?.file;

  return {
    version: 1,
    canvas: CANVAS,
    totalDuration,
    ...(backgroundFile
      ? {
        backgroundFile: projectPath(
          backgroundFile
        )
      }
      : {}),
    ...(musicFile
      ? {
        musicFile: projectPath(
          musicFile
        )
      }
      : {}),
    ...(topicIntro ? { topicIntro } : {}),
    scenes
  };
}

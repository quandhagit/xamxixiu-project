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
import {
  TOPIC_TITLE_ANIMATION_DURATION,
  isTopicIntroEnabled,
  resolveTimelineTopicTitle,
  shouldGenerateTopicTitleVoice
} from "./topic-constants.js";
import { readMediaDuration } from "../media-duration.js";
import { renderTopicTitleCard } from "../capcut/compile/title-card.js";
import { randomBackgroundStart } from "./background-start.js";
import {
  applyCombo,
  findCombo,
  getBuiltinCombo
} from "./meme-combo.js";
import {
  DEFAULT_MEME_DURATION,
  sequenceMemeOverlays
} from "./overlay-sequence.js";
import {
  applyMemeDefaultLayout,
  DEFAULT_OVERLAY_STYLE_DEFAULTS,
  type OverlayStyleDefaults
} from "../meme-style.js";
import { stackCommentPositions } from "./comment-stack.js";

const CANVAS = {
  width: 1080,
  height: 1920,
  fps: 30
} as const;
const MIN_OVERLAY_DURATION = DEFAULT_MEME_DURATION;

interface ProjectInputs {
  thread: ThreadData;
  analysis: ThreadAnalysis;
  assets: Asset[];
  reactions: MatchedReaction[];
  overlayDefaults: OverlayStyleDefaults;
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
  audioStart = 0,
  overlayDefaults: OverlayStyleDefaults = DEFAULT_OVERLAY_STYLE_DEFAULTS
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
    imageX: overlayDefaults.commentX,
    imageY: overlayDefaults.commentY,
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
  const originX = blocks[0]?.imageX ?? DEFAULT_OVERLAY_STYLE_DEFAULTS.commentX;
  const originY = blocks[0]?.imageY ?? DEFAULT_OVERLAY_STYLE_DEFAULTS.commentY;
  const heights: number[] = [];
  for (const block of blocks) {
    heights.push(await getCaptureHeight(block));
  }
  const stacked = stackCommentPositions(heights, originX, originY);
  for (const [index, block] of blocks.entries()) {
    const position = stacked[index];
    if (position) {
      block.imageX = position.x;
      block.imageY = position.y;
    }
    block.imageDuration = Math.max(
      0,
      totalDuration - block.imageStart
    );
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

function isExcludedComment(
  thread: ThreadData,
  index: number
): boolean {
  return thread.comments[index]?.excluded === true;
}

function getCommentGroups(
  thread: ThreadData
): number[][] {
  const children = new Map<number, number[]>();
  for (let index = 0; index < thread.comments.length; index++) {
    if (isExcludedComment(thread, index)) {
      continue;
    }
    const parent = thread.comments[index].parentCommentIndex;
    if (
      parent !== undefined &&
      parent >= 0 &&
      parent < thread.comments.length &&
      !isExcludedComment(thread, parent)
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
    if (visited.has(root) || isExcludedComment(thread, root)) {
      return;
    }
    const group = [root];
    visited.add(root);
    for (const child of children.get(root) ?? []) {
      group.push(
        ...getDescendantIndexes(child, children, visited, thread)
      );
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
  visited: Set<number>,
  thread: ThreadData
): number[] {
  if (visited.has(root) || isExcludedComment(thread, root)) {
    return [];
  }
  visited.add(root);
  const result = [root];
  for (const child of children.get(root) ?? []) {
    result.push(
      ...getDescendantIndexes(child, children, visited, thread)
    );
  }
  return result;
}

async function createMemeOverlay(
  asset: Asset,
  start: number,
  options: {
    duration: number;
    animation: MatchedReaction["animation"];
    comboId?: string;
    comboLocked?: boolean;
    applyCombo: boolean;
    memeDefaults: OverlayStyleDefaults["meme"];
  }
): Promise<TimelineOverlay> {
  const memeAbsolute = path.resolve(asset.file);
  await assertFile(memeAbsolute, `Meme asset ${asset.id}`);
  const isVideo = asset.mediaKind === "video";
  const combo = isVideo || !options.applyCombo
    ? getBuiltinCombo("none")
    : (findCombo(options.comboId) ?? getBuiltinCombo("none"));
  const memeDuration = isVideo
    ? await readMediaDuration(memeAbsolute)
    : Math.max(
      combo.minDuration,
      MIN_OVERLAY_DURATION,
      options.duration
    );
  const baked = applyMemeDefaultLayout(
    applyCombo(
      { file: projectPath(asset.file) },
      combo
    ),
    options.memeDefaults,
    { keepComboFadeIn: combo.id !== "none" }
  );
  const overlay = createOverlay(
    "meme",
    baked.file ?? projectPath(asset.file),
    memeDuration,
    ((baked.animation === "shake"
      ? "shake-1"
      : baked.animation) as TimelineOverlay["animation"]) ??
      options.animation,
    start,
    baked.fadeIn,
    baked.animationDuration
  );
  overlay.scale = baked.scale;
  overlay.x = baked.x;
  overlay.y = baked.y;
  overlay.comboId = baked.comboId;
  overlay.sfxOffset = baked.sfxOffset;
  overlay.comboLocked = options.comboLocked;
  overlay.fadeIn = baked.fadeIn;
  return overlay;
}

async function createSfxOverlay(
  asset: Asset,
  start: number
): Promise<TimelineOverlay> {
  const sfxAbsolute = path.resolve(asset.file);
  await assertFile(sfxAbsolute, `SFX asset ${asset.id}`);
  const sfxDuration = await readMediaDuration(sfxAbsolute);
  return createOverlay(
    "sfx",
    projectPath(asset.file),
    sfxDuration,
    undefined,
    start
  );
}

async function createPostVoiceOverlays(
  reaction: Pick<
    MatchedReaction,
    | "meme"
    | "extraMemes"
    | "sfx"
    | "extraSfx"
    | "duration"
    | "animation"
    | "comboId"
    | "comboLocked"
  > | undefined,
  overlayStart: number,
  memeDefaults: OverlayStyleDefaults["meme"] = DEFAULT_OVERLAY_STYLE_DEFAULTS.meme
): Promise<{ overlays: TimelineOverlay[]; extraDuration: number }> {
  const overlays: TimelineOverlay[] = [];
  if (!reaction) {
    return { overlays, extraDuration: 0 };
  }

  const memes = [
    ...(reaction.meme ? [reaction.meme] : []),
    ...(reaction.extraMemes ?? [])
  ];
  for (const [index, meme] of memes.entries()) {
    overlays.push(
      await createMemeOverlay(meme, overlayStart, {
        duration: index === 0 ? reaction.duration : MIN_OVERLAY_DURATION,
        animation: reaction.animation,
        comboId: reaction.comboId,
        comboLocked: reaction.comboLocked,
        applyCombo: index === 0,
        memeDefaults
      })
    );
  }

  const sfxAssets = [
    ...(reaction.sfx ? [reaction.sfx] : []),
    ...(reaction.extraSfx ?? [])
  ];
  for (const sfx of sfxAssets) {
    overlays.push(await createSfxOverlay(sfx, overlayStart));
  }

  sequenceMemeOverlays(overlays);

  const extraDuration = overlays.reduce(
    (latest, overlay) =>
      Math.max(latest, overlay.start + overlay.duration - overlayStart),
    0
  );
  return { overlays, extraDuration };
}

async function createCommentScene(
  projectDir: string,
  commentIndex: number,
  reaction: MatchedReaction | undefined,
  overlayDefaults: OverlayStyleDefaults
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
  const { overlays, extraDuration: postVoiceDuration } =
    await createPostVoiceOverlays(
      reaction,
      audioDuration,
      overlayDefaults.meme
    );

  return createScene(
    `comment-${commentIndex}`,
    commentIndex,
    timelineFile(imageAbsolute),
    timelineFile(audioAbsolute),
    audioDuration,
    overlays,
    audioDuration + postVoiceDuration,
    0,
    0,
    overlayDefaults
  );
}

export async function buildTimeline(
  projectDir: string,
  overlayDefaults: OverlayStyleDefaults = DEFAULT_OVERLAY_STYLE_DEFAULTS
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
    ),
    overlayDefaults
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
  const topicTitle = resolveTimelineTopicTitle(
    inputs.analysis.topicTitle,
    thread.topicTitle,
    thread.text
  );
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
  const hasTopicIntro = isTopicIntroEnabled(inputs.analysis);
  const effectiveIntroCase =
    introCase === "long" && hasTitleAudio ? "long" : "short";
  const titleAudioDuration =
    hasTopicIntro && effectiveIntroCase === "long"
      ? await readMediaDuration(titleAudioAbsolute)
      : 0;
  const blocksDuration =
    effectiveIntroCase === "long"
      ? TOPIC_TITLE_ANIMATION_DURATION + titleAudioDuration
      : Math.min(3, topicDuration);

  if (hasTopicIntro) {
    topicCaptureStart =
      effectiveIntroCase === "long" ? blocksDuration : 0;
    topicAudioStart =
      effectiveIntroCase === "long" ? blocksDuration : 0;
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
        TOPIC_TITLE_ANIMATION_DURATION
      )
    );
    const topicOverlay = topicOverlays.at(-1);
    if (topicOverlay) {
      topicOverlay.scale = topicMemeLayout.scale;
      topicOverlay.x = 0;
      topicOverlay.y = topicMemeLayout.y;
    }
  }

  const topicPostMemes = [
    findAsset(inputs.assets, {
      id: inputs.analysis.topicPostMemeId,
      type: "meme"
    }),
    ...(inputs.analysis.topicPostExtraMemeIds ?? []).map((id) =>
      findAsset(inputs.assets, { id, type: "meme" })
    )
  ].filter((asset): asset is Asset => Boolean(asset));
  const topicPostSfxList = [
    findAsset(inputs.assets, {
      id: inputs.analysis.topicPostSfxId,
      type: "sfx"
    }),
    ...(inputs.analysis.topicPostExtraSfxIds ?? []).map((id) =>
      findAsset(inputs.assets, { id, type: "sfx" })
    )
  ].filter((asset): asset is Asset => Boolean(asset));
  const topicPostOverlays = await createPostVoiceOverlays(
    topicPostMemes.length > 0 || topicPostSfxList.length > 0
      ? {
        meme: topicPostMemes[0] ?? null,
        extraMemes: topicPostMemes.slice(1),
        sfx: topicPostSfxList[0] ?? null,
        extraSfx: topicPostSfxList.slice(1),
        animation: "none",
        duration: MIN_OVERLAY_DURATION
      }
      : undefined,
    topicAudioStart + topicDuration,
    inputs.overlayDefaults.meme
  );
  topicOverlays.push(...topicPostOverlays.overlays);
  if (hasTopicIntro) {
    const titleCardAbsolute =
      await renderTopicTitleCard(
        projectDir,
        topicTitle
      );
    const openTopicSfxDuration = openTopicSfx
      ? await readMediaDuration(openTopicSfx)
      : 0;
    topicIntro = {
      case: effectiveIntroCase,
      title: topicTitle,
      ...(effectiveIntroCase === "long" && hasTitleAudio
        ? {
          titleVoiceFile: timelineFile(
            titleAudioAbsolute
          )
        }
        : {}),
      titleVoiceDuration: titleAudioDuration,
      ...(openTopicSfx
        ? {
          openSfxFile: timelineFile(openTopicSfx),
          openSfxDuration: openTopicSfxDuration
        }
        : {}),
      titleCardFile: timelineFile(
        titleCardAbsolute
      ),
      ...(topicMeme
        ? { memeFile: projectPath(topicMeme.file) }
        : {}),
      animationDuration: TOPIC_TITLE_ANIMATION_DURATION,
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
      topicAudioStart,
      inputs.overlayDefaults
    )
  ];

  for (const group of getCommentGroups(inputs.thread)) {
    const commentScenes: TimelineScene[] = [];
    for (const commentIndex of group) {
      if (isExcludedComment(inputs.thread, commentIndex)) {
        continue;
      }
      const reaction = inputs.reactions.find(
        (item) => item.commentIndex === commentIndex
      );
      commentScenes.push(
        await createCommentScene(
          projectDir,
          commentIndex,
          reaction,
          inputs.overlayDefaults
        )
      );
    }
    if (commentScenes.length === 0) {
      continue;
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
  const backgroundAsset = inputs.analysis.backgroundAssetId
    ? inputs.assets.find(
      (asset) =>
        asset.type === "background" &&
        asset.id === inputs.analysis.backgroundAssetId
    )
    : inputs.assets.find(
      (asset) => asset.type === "background"
    );
  const backgroundFile = backgroundAsset?.file;
  let backgroundStart = 0;
  if (backgroundAsset?.mediaKind === "video" && backgroundFile) {
    try {
      const sourceDuration = await readMediaDuration(backgroundFile);
      backgroundStart = randomBackgroundStart(
        sourceDuration,
        totalDuration
      );
    } catch {
      backgroundStart = 0;
    }
  }
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
        ),
        ...(backgroundStart > 0
          ? { backgroundStart }
          : {})
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

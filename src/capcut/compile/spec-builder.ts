import path from "node:path";
import { MUSIC_VOLUME } from "../../timeline/audio-constants.js";
import type {
  TimelineCommentBlock,
  TimelineScene,
  VideoTimeline
} from "../../types.js";
import type { CompileItem, CompileSpec, CompileTrack } from "./types.js";
import {
  SCENE_GAP_SECONDS,
  getSceneBlocks,
  getSceneDuration
} from "../../timeline/timing.js";
import {
  TOPIC_TITLE_ANIMATION_DURATION,
  TOPIC_TITLE_SCALE
} from "../../timeline/topic-constants.js";
import { TOPIC_TITLE_TRANSFORM_Y } from "../../timeline/topic-layout.js";
import { readMediaDuration } from "../../media-duration.js";

async function safeAudioDuration(
  duration: number,
  file: string
): Promise<number> {
  const sourceDuration = await readMediaDuration(file);
  const boundedDuration =
    Math.min(duration, sourceDuration);
  return Math.max(0.01, boundedDuration);
}

async function safeVideoDuration(
  duration: number,
  file: string
): Promise<number> {
  const sourceDuration = await readMediaDuration(file);
  return Math.max(
    0.01,
    Math.min(duration, sourceDuration)
  );
}

export function absoluteAsset(file: string): string {
  return path.resolve(file);
}

function mediaType(file: string): "video" | "photo" {
  return [".mp4", ".mov", ".webm", ".mkv"].includes(
    path.extname(file).toLowerCase()
  )
    ? "video"
    : "photo";
}

function addSceneItems(
  scene: TimelineScene,
  sceneStart: number,
  imageItems: CompileItem[],
  overlayJobs: Array<Promise<CompileItem>>,
  voiceJobs: Array<Promise<CompileItem>>,
  sfxJobs: Array<Promise<CompileItem>>,
  preserveVideoMemeDuration: boolean
): void {
  for (const block of getSceneBlocks(scene)) {
    addBlockItems(
      block,
      sceneStart,
      imageItems,
      overlayJobs,
      voiceJobs,
      sfxJobs,
      preserveVideoMemeDuration
    );
  }
}

function addBlockItems(
  block: TimelineCommentBlock,
  sceneStart: number,
  imageItems: CompileItem[],
  overlayJobs: Array<Promise<CompileItem>>,
  voiceJobs: Array<Promise<CompileItem>>,
  sfxJobs: Array<Promise<CompileItem>>,
  preserveVideoMemeDuration: boolean
): void {
  imageItems.push({
    path: absoluteAsset(block.imageFile),
    start: sceneStart + block.imageStart,
    duration: block.imageDuration,
    type: "photo",
    ref: `image-comment-${block.commentIndex}`,
    ...(block.imageScale !== undefined
      ? { scale: block.imageScale }
      : {}),
    ...(block.imageX !== undefined
      ? { x: block.imageX }
      : {}),
    ...(block.imageY !== undefined
      ? { y: block.imageY }
      : {})
  });
  voiceJobs.push(
    safeAudioDuration(
      block.audioDuration,
      absoluteAsset(block.audioFile)
    ).then((duration) => ({
      path: absoluteAsset(block.audioFile),
      start: sceneStart + block.audioStart,
      duration,
      ref: `voice-comment-${block.commentIndex}`
    }))
  );

  for (const [index, overlay] of block.overlays.entries()) {
    const item: CompileItem = {
      path: absoluteAsset(overlay.file),
      start: sceneStart + overlay.start,
      duration: overlay.duration,
      type: mediaType(overlay.file),
      ref: `overlay-comment-${block.commentIndex}-${index}`,
      ...(overlay.x !== undefined
        ? { x: overlay.x }
        : {}),
      ...(overlay.y !== undefined
        ? { y: overlay.y }
        : {}),
      ...(overlay.scale !== undefined
        ? { scale: overlay.scale }
        : {}),
      ...(block.commentIndex < 0 &&
        (overlay.animation === "slide-up" ||
          overlay.animationDuration)
        ? {
            flyUp: true,
            animationDuration:
              overlay.animationDuration ??
              TOPIC_TITLE_ANIMATION_DURATION
          }
        : {})
    };
    if (overlay.type === "sfx") {
      sfxJobs.push(
        safeAudioDuration(
          overlay.duration,
          absoluteAsset(overlay.file)
        ).then((duration) => {
          const sfxItem = { ...item, duration };
          delete sfxItem.type;
          return sfxItem;
        })
      );
      continue;
    }
    if (
      overlay.type === "meme" &&
      item.type === "video" &&
      !preserveVideoMemeDuration
    ) {
      overlayJobs.push(
        safeVideoDuration(
          item.duration,
          absoluteAsset(overlay.file)
        ).then((duration) => ({ ...item, duration }))
      );
      continue;
    }
    overlayJobs.push(Promise.resolve(item));
  }
}

export interface CompileSpecOptions {
  preserveVideoMemeDuration?: boolean;
}

export async function buildCompileSpec(
  projectDirectory: string,
  timeline: VideoTimeline,
  topicTitleCardFile?: string,
  options: CompileSpecOptions = {}
): Promise<CompileSpec> {
  const imageItems: CompileItem[] = [];
  const overlayJobs: Array<Promise<CompileItem>> = [];
  const voiceJobs: Array<Promise<CompileItem>> = [];
  const sfxJobs: Array<Promise<CompileItem>> = [];
  let sceneStart = 0;

  for (const scene of timeline.scenes) {
    addSceneItems(
      scene,
      sceneStart,
      imageItems,
      overlayJobs,
      voiceJobs,
      sfxJobs,
      options.preserveVideoMemeDuration === true
    );
    sceneStart += getSceneDuration(scene) + SCENE_GAP_SECONDS;
  }

  if (
    timeline.topicIntro?.case === "long" &&
    timeline.topicIntro.titleVoiceFile
  ) {
    const titleVoiceFile = absoluteAsset(
      timeline.topicIntro.titleVoiceFile
    );
    voiceJobs.push(
      safeAudioDuration(
        timeline.topicIntro.titleVoiceDuration,
        titleVoiceFile
      ).then((duration) => ({
        path: titleVoiceFile,
        start: timeline.topicIntro!.animationDuration,
        duration,
        ref: "topic-title-voice"
      }))
    );
  }
  if (timeline.topicIntro?.openSfxFile) {
    const openSfxFile = absoluteAsset(
      timeline.topicIntro.openSfxFile
    );
    sfxJobs.push(
      safeAudioDuration(
        timeline.topicIntro.openSfxDuration ?? 0,
        openSfxFile
      ).then((duration) => ({
        path: openSfxFile,
        start: 0,
        duration,
        ref: "topic-open-sfx"
      }))
    );
  }

  const musicJob = timeline.musicFile
    ? safeAudioDuration(
        timeline.totalDuration,
        absoluteAsset(timeline.musicFile)
      )
    : undefined;

  const [overlayItems, voiceItems, sfxItems, musicDuration] =
    await Promise.all([
      Promise.all(overlayJobs),
      Promise.all(voiceJobs),
      Promise.all(sfxJobs),
      musicJob ?? Promise.resolve(undefined)
    ]);

  const tracks: CompileTrack[] = [];
  const operations: Array<Record<string, unknown>> = [];
  if (timeline.backgroundFile) {
    tracks.push({
      type: "video",
      name: "background",
      items: [{
        path: absoluteAsset(timeline.backgroundFile),
        start: 0,
        duration: timeline.totalDuration,
        sourceStart: timeline.backgroundStart ?? 0,
        type: mediaType(timeline.backgroundFile),
        ref: "background",
        volume: 0
      }]
    });
  }
  if (imageItems.length > 0) {
    tracks.push({
      type: "video",
      name: "images",
      items: imageItems
    });
  }
  if (overlayItems.length > 0) {
    tracks.push({
      type: "video",
      name: "overlays",
      items: overlayItems
    });
  }
  if (timeline.topicIntro && topicTitleCardFile) {
    tracks.push({
      type: "video",
      name: "topic-title-card",
      items: [{
        start: 0,
        duration: timeline.topicIntro.blocksDuration,
        path: absoluteAsset(topicTitleCardFile),
        type: "photo",
        ref: "topic-title-card",
        opacity: 1,
        scale: TOPIC_TITLE_SCALE,
        x: 0,
        y: TOPIC_TITLE_TRANSFORM_Y,
        flyUp: true,
        animationDuration:
          timeline.topicIntro.animationDuration
      }]
    });
  }
  if (voiceItems.length > 0) {
    tracks.push({
      type: "audio",
      name: "voice",
      items: voiceItems
    });
  }
  if (sfxItems.length > 0) {
    tracks.push({
      type: "audio",
      name: "sfx",
      items: sfxItems
    });
  }
  if (timeline.musicFile && musicDuration !== undefined) {
    tracks.push({
      type: "audio",
      name: "music",
      items: [{
        path: absoluteAsset(timeline.musicFile),
        start: 0,
        duration: musicDuration,
        volume: MUSIC_VOLUME,
        ref: "music"
      }]
    });
  }

  if (tracks.length === 0) {
    throw new Error(
      "Timeline không có media để compile vào CapCut."
    );
  }

  return {
    name: `xamxixiu-${path.basename(projectDirectory)}`,
    width: timeline.canvas.width,
    height: timeline.canvas.height,
    fps: timeline.canvas.fps,
    ratio: "9:16",
    tracks,
    ...(operations.length > 0
      ? { operations }
      : {})
  };
}


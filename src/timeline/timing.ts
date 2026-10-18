import type {
  TimelineCommentBlock,
  TimelineScene,
  VideoTimeline
} from "../types.js";

export const SCENE_GAP_SECONDS = 0.1;

export function getSceneDuration(
  scene: TimelineScene
): number {
  return scene.sceneDuration ?? scene.imageDuration;
}

export function getSceneBlocks(
  scene: TimelineScene
): TimelineCommentBlock[] {
  return scene.blocks ?? [{
    commentIndex: scene.commentIndex ?? -1,
    imageFile: scene.imageFile,
    imageStart: scene.imageStart,
    imageDuration: scene.imageDuration,
    sceneDuration: scene.sceneDuration,
    imageScale: scene.imageScale,
    imageX: scene.imageX,
    imageY: scene.imageY,
    audioFile: scene.audioFile,
    audioStart: scene.audioStart,
    audioDuration: scene.audioDuration,
    overlays: scene.overlays
  }];
}

export interface TimelineSceneEntry {
  scene: TimelineScene;
  start: number;
  end: number;
}

export function getTimelineSceneEntries(
  timeline: VideoTimeline
): TimelineSceneEntry[] {
  let start = 0;
  return timeline.scenes.map((scene) => {
    const entry = {
      scene,
      start,
      end: start + getSceneDuration(scene)
    };
    start = entry.end + SCENE_GAP_SECONDS;
    return entry;
  });
}

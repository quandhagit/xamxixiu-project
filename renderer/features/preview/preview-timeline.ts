import {
  commentCaptureCardStyle,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import { MUSIC_VOLUME } from "../../../src/timeline/audio-constants";
import {
  getSceneBlocks,
  getSceneDuration,
  getTimelineSceneEntries
} from "../../../src/timeline/timing";
import type {
  TimelineCommentBlock,
  TimelineOverlay,
  VideoTimeline
} from "../../../src/types";
import type {
  PreviewAudioTrack,
  PreviewSceneState
} from "./preview-types";

export function getPreviewScenes(
  timeline: VideoTimeline
) {
  return getTimelineSceneEntries(timeline);
}

export function getPreviewScene(
  timeline: VideoTimeline,
  time: number
): PreviewSceneState | undefined {
  const entries = getPreviewScenes(timeline);
  if (entries.length === 0) {
    return undefined;
  }
  const entry =
    entries.find(
      (candidate) =>
        time >= candidate.start &&
        time < candidate.end
    ) ??
    [...entries]
      .reverse()
      .find((candidate) => time >= candidate.start) ??
    entries[0];
  const elapsed = Math.max(
    0,
    Math.min(
      time - entry.start,
      getSceneDuration(entry.scene)
    )
  );
  const blocks = getSceneBlocks(entry.scene);
  const block =
    [...blocks]
      .reverse()
      .find((candidate) =>
        elapsed >= candidate.imageStart
      ) ?? blocks[0];
  if (!block) {
    return undefined;
  }
  return {
    scene: entry.scene,
    block,
    start: entry.start,
    elapsed
  };
}

export function previewSeekThreshold(
  playing: boolean
): number {
  return playing ? 0.08 : 1 / 30;
}

export function previewTimeFromBar(
  clientX: number,
  bar: { left: number; width: number },
  duration: number
): number {
  const width = bar.width;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(width) ||
    width <= 0
  ) {
    return 0;
  }
  const time = ((clientX - bar.left) / width) * duration;
  if (!Number.isFinite(time)) {
    return 0;
  }
  return Math.max(0, Math.min(duration, time));
}

export function previewProgressPercent(
  time: number,
  duration: number
): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (time / duration) * 100));
}

export function getOverlayStyle(
  overlay: TimelineOverlay
): React.CSSProperties {
  return {
    width: `${(overlay.scale ?? 1) * 100}%`,
    left: `${50 + (overlay.x ?? 0) * 50}%`,
    top: `${50 - (overlay.y ?? 0) * 50}%`,
    transform: "translate(-50%, -50%)"
  };
}

export function getCaptureStyle(
  scene: TimelineCommentBlock,
  captureStyle?: CommentCaptureStyle
): React.CSSProperties {
  return {
    width: `${(scene.imageScale ?? 1) * 100}%`,
    left: `${50 + (scene.imageX ?? 0) * 50}%`,
    top: `${50 - (scene.imageY ?? 0) * 50}%`,
    transform: "translate(-50%, -50%)",
    ...commentCaptureCardStyle(
      captureStyle ?? DEFAULT_COMMENT_CAPTURE_STYLE
    )
  };
}

export function getPreviewAudioTracks(
  timeline: VideoTimeline
): PreviewAudioTrack[] {
  const tracks: PreviewAudioTrack[] = [];
  const entries = getPreviewScenes(timeline);
  if (timeline.musicFile) {
    tracks.push({
      key: "music",
      file: timeline.musicFile,
      start: 0,
      duration: timeline.totalDuration,
      volume: MUSIC_VOLUME
    });
  }
  if (
    timeline.topicIntro?.case === "long" &&
    timeline.topicIntro.titleVoiceFile
  ) {
    tracks.push({
      key: "topic-title-voice",
      file: timeline.topicIntro.titleVoiceFile,
      start: timeline.topicIntro.animationDuration,
      duration: timeline.topicIntro.titleVoiceDuration,
      volume: 1
    });
  }
  if (timeline.topicIntro?.openSfxFile) {
    tracks.push({
      key: "topic-open-sfx",
      file: timeline.topicIntro.openSfxFile,
      start: 0,
      duration: timeline.topicIntro.openSfxDuration ?? 0,
      volume: 1
    });
  }
  for (const entry of entries) {
    for (const block of getSceneBlocks(entry.scene)) {
      tracks.push({
        key: `voice-${entry.scene.id}-${block.commentIndex}`,
        file: block.audioFile,
        start: entry.start + block.audioStart,
        duration: block.audioDuration,
        volume: 1
      });
      block.overlays.forEach((overlay, index) => {
        if (overlay.type !== "sfx") {
          return;
        }
        tracks.push({
          key: `sfx-${entry.scene.id}-${block.commentIndex}-${index}`,
          file: overlay.file,
          start: entry.start + overlay.start,
          duration: overlay.duration,
          volume: 1
        });
      });
    }
  }
  return tracks;
}

import {
  getSceneBlocks,
  getTimelineSceneEntries
} from "../../../src/timeline/timing";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import { canRemoveTimelineAsset } from "../../../src/timeline/replace-asset";
import type {
  TimelineCommentBlock,
  VideoTimeline
} from "../../../src/types";
import { withAnimationLabel } from "../../../src/timeline/clip-motion";
import type {
  TimelineClip,
  TimelineProject,
  TimelineProjectTrackId
} from "../../../src/timeline/project";
import {
  TOPIC_POST_COMMENT_INDEX,
  isTopicVoiceClip
} from "../../../src/timeline/topic-constants";

export const PLACEHOLDER_DURATION = 1;

export const TRACK_IDS = [
  "background",
  "title-card",
  "images",
  "meme",
  "video",
  "voice",
  "sfx",
  "beep",
  "music"
] as const;

export type TrackId = (typeof TRACK_IDS)[number];

export interface TimelineTrackClip {
  id: string;
  trackId: TrackId;
  start: number;
  duration: number;
  label: string;
  file?: string;
  editable: boolean;
  placeholder: boolean;
  locked?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  target?: TimelineAssetTarget;
}

export interface TimelineTrack {
  id: TrackId;
  label: string;
  clips: TimelineTrackClip[];
}

export const TRACK_LABELS: Record<TrackId, string> = {
  background: "Background",
  images: "Images",
  "title-card": "Title",
  meme: "Meme",
  video: "Video",
  voice: "Voice",
  sfx: "SFX",
  beep: "Beep",
  music: "Music"
};

export const TRACK_COLORS: Record<TrackId, string> = {
  background: "bg-slate-500/80",
  images: "bg-stone-400/80",
  "title-card": "bg-blue-400/75",
  meme: "bg-teal-400/80",
  video: "bg-indigo-400/80",
  voice: "bg-amber-400/80",
  sfx: "bg-emerald-400/80",
  beep: "bg-rose-400/80",
  music: "bg-sky-500/75"
};

export function isVideoAsset(file: string): boolean {
  return [".mp4", ".mov", ".webm", ".mkv"].some((extension) =>
    file.toLowerCase().endsWith(extension)
  );
}

export function formatClipLabel(file?: string): string {
  if (!file) {
    return "+";
  }
  return file.split(/[\\/]/).pop() ?? file;
}

function overlayFile(
  block: TimelineCommentBlock,
  type: "meme" | "sfx",
  video?: boolean
): string | undefined {
  return block.overlays.find((overlay) => {
    if (overlay.type !== type) {
      return false;
    }
    if (type !== "meme" || video === undefined) {
      return true;
    }
    return video === isVideoAsset(overlay.file);
  })?.file;
}

export function targetFromProjectClip(
  clip: TimelineClip
): TimelineAssetTarget | undefined {
  if (clip.trackId === "background") {
    return { kind: "background" };
  }
  if (clip.trackId === "music") {
    return { kind: "music" };
  }
  if (clip.trackId === "title-card") {
    return { kind: "topic-title" };
  }
  if (
    (clip.trackId === "meme" || clip.trackId === "video") &&
    (clip.commentIndex === null || clip.commentIndex === undefined) &&
    clip.id.includes("topic")
  ) {
    return { kind: "topic-meme" };
  }
  if (clip.commentIndex === null || clip.commentIndex === undefined) {
    if (clip.trackId === "meme" || clip.trackId === "video") {
      return { kind: "topic-meme" };
    }
    return undefined;
  }
  if (clip.trackId === "meme") {
    return { kind: "meme", commentIndex: clip.commentIndex };
  }
  if (clip.trackId === "video") {
    return { kind: "video", commentIndex: clip.commentIndex };
  }
  if (clip.trackId === "sfx") {
    return { kind: "sfx", commentIndex: clip.commentIndex };
  }
  return undefined;
}

export const CLIP_DRAG_THRESHOLD_PX = 4;
export const CLIP_MIN_WIDTH_PX = 18;

export function clipBarWidth(
  duration: number,
  pixelsPerSecond: number
): number {
  return Math.max(duration * pixelsPerSecond, CLIP_MIN_WIDTH_PX);
}

export function clipPointerIntent(
  originX: number,
  clientX: number,
  thresholdPx = CLIP_DRAG_THRESHOLD_PX
): "click" | "drag" {
  return Math.abs(clientX - originX) >= thresholdPx ? "drag" : "click";
}

export function clipCanRemove(clip: {
  trackId: string;
  placeholder?: boolean;
  locked?: boolean;
  target?: TimelineAssetTarget;
}): boolean {
  if (clip.placeholder) {
    return false;
  }
  if (clip.trackId === "beep") {
    return !clip.locked;
  }
  return Boolean(clip.target && canRemoveTimelineAsset(clip.target));
}

export function clipHasAssetPickerTarget(clip: {
  target?: TimelineAssetTarget;
}): boolean {
  const kind = clip.target?.kind;
  return (
    kind === "background" ||
    kind === "music" ||
    kind === "meme" ||
    kind === "video" ||
    kind === "sfx" ||
    kind === "topic-meme" ||
    kind === "topic-title"
  );
}

export function clipChooseLabel(target: TimelineAssetTarget): string {
  if (target.kind === "topic-title") {
    return "Sửa title";
  }
  if (target.kind === "background") {
    return "Chọn background";
  }
  if (target.kind === "music") {
    return "Chọn music";
  }
  if (target.kind === "sfx") {
    return "Chọn SFX";
  }
  if (target.kind === "video") {
    return "Chọn video";
  }
  if (target.kind === "topic-meme") {
    return "Chọn topic meme";
  }
  return "Chọn meme";
}

export function clipOpensAssetPicker(clip: {
  editable: boolean;
  locked?: boolean;
  target?: TimelineAssetTarget;
}): boolean {
  if (!clip.editable || clip.locked) {
    return false;
  }
  return clipHasAssetPickerTarget(clip);
}

export function findTrackClip(
  project: TimelineProject,
  clipId: string
): TimelineTrackClip | undefined {
  for (const track of getProjectTracks(project)) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) {
      return clip;
    }
  }
  return undefined;
}

function toProjectTrackClip(clip: TimelineClip): TimelineTrackClip {
  return {
    id: clip.id,
    trackId: clip.trackId as TrackId,
    start: clip.start,
    duration: clip.duration,
    label: withAnimationLabel(
      clip.locked ? `🔒 ${clip.label}` : clip.label,
      clip
    ),
    file: clip.file,
    editable: !clip.locked && clip.trackId !== "images",
    placeholder: false,
    locked: clip.locked,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut,
    target: targetFromProjectClip(clip)
  };
}

function addPlaceholderClip(clip: {
  id: string;
  trackId: TrackId;
  start: number;
  duration: number;
  target: TimelineAssetTarget;
}): TimelineTrackClip {
  return {
    id: clip.id,
    trackId: clip.trackId,
    start: clip.start,
    duration: clip.duration,
    label: "+",
    editable: true,
    placeholder: true,
    target: clip.target
  };
}

function hasCommentClip(
  project: TimelineProject,
  trackId: TimelineProjectTrackId,
  commentIndex: number
): boolean {
  return project.clips.some(
    (clip) => clip.trackId === trackId && clip.commentIndex === commentIndex
  );
}

function overlayPlaceholders(options: {
  commentIndex: number;
  start: number;
  hasMeme: boolean;
  hasVideo: boolean;
  hasSfx: boolean;
  idPrefix?: string;
}): TimelineTrackClip[] {
  const clips: TimelineTrackClip[] = [];
  const suffix = options.idPrefix ?? String(options.commentIndex);
  if (!options.hasMeme) {
    clips.push(
      addPlaceholderClip({
        id: `meme-add-${suffix}`,
        trackId: "meme",
        start: options.start,
        duration: PLACEHOLDER_DURATION,
        target: { kind: "meme", commentIndex: options.commentIndex }
      })
    );
  }
  if (!options.hasVideo) {
    clips.push(
      addPlaceholderClip({
        id: `video-add-${suffix}`,
        trackId: "video",
        start: options.start,
        duration: PLACEHOLDER_DURATION,
        target: { kind: "video", commentIndex: options.commentIndex }
      })
    );
  }
  if (!options.hasSfx && !options.hasVideo) {
    clips.push(
      addPlaceholderClip({
        id: `sfx-add-${suffix}`,
        trackId: "sfx",
        start: options.start,
        duration: PLACEHOLDER_DURATION,
        target: { kind: "sfx", commentIndex: options.commentIndex }
      })
    );
  }
  return clips;
}

export function getProjectTracks(
  project: TimelineProject
): TimelineTrack[] {
  const clips: TimelineTrackClip[] = project.clips.map(toProjectTrackClip);

  for (const voice of project.clips) {
    if (voice.trackId !== "voice" || typeof voice.commentIndex !== "number") {
      continue;
    }
    const commentIndex = voice.commentIndex;
    clips.push(
      ...overlayPlaceholders({
        commentIndex,
        start: voice.start + voice.duration,
        hasMeme: hasCommentClip(project, "meme", commentIndex),
        hasVideo: hasCommentClip(project, "video", commentIndex),
        hasSfx: hasCommentClip(project, "sfx", commentIndex)
      })
    );
  }

  const topicVoice = project.clips.find(isTopicVoiceClip);
  if (topicVoice) {
    clips.push(
      ...overlayPlaceholders({
        commentIndex: TOPIC_POST_COMMENT_INDEX,
        start: topicVoice.start + topicVoice.duration,
        hasMeme: hasCommentClip(project, "meme", TOPIC_POST_COMMENT_INDEX),
        hasVideo: hasCommentClip(project, "video", TOPIC_POST_COMMENT_INDEX),
        hasSfx: hasCommentClip(project, "sfx", TOPIC_POST_COMMENT_INDEX),
        idPrefix: "topic"
      })
    );
  }

  const hasTopicMeme = project.clips.some(
    (clip) =>
      (clip.trackId === "meme" || clip.trackId === "video") &&
      (clip.commentIndex === null || clip.commentIndex === undefined)
  );
  if (!hasTopicMeme) {
    const title = project.clips.find((clip) => clip.trackId === "title-card");
    clips.push(
      addPlaceholderClip({
        id: "topic-meme-add",
        trackId: "meme",
        start: 0,
        duration: title?.duration ?? PLACEHOLDER_DURATION,
        target: { kind: "topic-meme" }
      })
    );
  }

  if (!project.clips.some((clip) => clip.trackId === "title-card")) {
    clips.push(
      addPlaceholderClip({
        id: "title-card-add",
        trackId: "title-card",
        start: 0,
        duration: PLACEHOLDER_DURATION,
        target: { kind: "topic-title" }
      })
    );
  }

  return TRACK_IDS.map((id) => ({
    id,
    label: TRACK_LABELS[id],
    clips: clips
      .filter((clip) => clip.trackId === id)
      .sort(
        (left, right) =>
          left.start - right.start || left.id.localeCompare(right.id)
      )
  }));
}

export function getTimelineTracks(
  timeline: VideoTimeline
): TimelineTrack[] {
  const clips: TimelineTrackClip[] = [];
  const entries = getTimelineSceneEntries(timeline);

  clips.push({
    id: "background",
    trackId: "background",
    start: 0,
    duration: Math.max(timeline.totalDuration, PLACEHOLDER_DURATION),
    label: timeline.backgroundFile
      ? formatClipLabel(timeline.backgroundFile)
      : "+",
    file: timeline.backgroundFile,
    editable: true,
    placeholder: !timeline.backgroundFile,
    target: { kind: "background" }
  });

  clips.push({
    id: "music",
    trackId: "music",
    start: 0,
    duration: Math.max(timeline.totalDuration, PLACEHOLDER_DURATION),
    label: timeline.musicFile
      ? formatClipLabel(timeline.musicFile)
      : "+",
    file: timeline.musicFile,
    editable: true,
    placeholder: !timeline.musicFile,
    target: { kind: "music" }
  });

  if (timeline.topicIntro) {
    if (timeline.topicIntro.titleCardFile) {
      clips.push({
        id: "title-card",
        trackId: "title-card",
        start: 0,
        duration: timeline.topicIntro.blocksDuration,
        label: withAnimationLabel(
          timeline.topicIntro.title || "Title card",
          { trackId: "title-card" }
        ),
        file: timeline.topicIntro.titleCardFile,
        editable: true,
        placeholder: false,
        target: { kind: "topic-title" }
      });
    } else {
      clips.push({
        id: "title-card-add",
        trackId: "title-card",
        start: 0,
        duration: timeline.topicIntro.blocksDuration || PLACEHOLDER_DURATION,
        label: "+",
        editable: true,
        placeholder: true,
        target: { kind: "topic-title" }
      });
    }
    if (timeline.topicIntro.openSfxFile) {
      clips.push({
        id: "topic-open-sfx",
        trackId: "sfx",
        start: 0,
        duration: timeline.topicIntro.openSfxDuration ?? PLACEHOLDER_DURATION,
        label: formatClipLabel(timeline.topicIntro.openSfxFile),
        file: timeline.topicIntro.openSfxFile,
        editable: false,
        placeholder: false
      });
    }
    if (
      timeline.topicIntro.case === "long" &&
      timeline.topicIntro.titleVoiceFile
    ) {
      clips.push({
        id: "topic-title-voice",
        trackId: "voice",
        start: timeline.topicIntro.animationDuration,
        duration: timeline.topicIntro.titleVoiceDuration,
        label: formatClipLabel(timeline.topicIntro.titleVoiceFile),
        file: timeline.topicIntro.titleVoiceFile,
        editable: false,
        placeholder: false
      });
    }
  } else {
    clips.push({
      id: "title-card-add",
      trackId: "title-card",
      start: 0,
      duration: PLACEHOLDER_DURATION,
      label: "+",
      editable: true,
      placeholder: true,
      target: { kind: "topic-title" }
    });
  }

  let topicMeme = false;
  for (const entry of entries) {
    const blocks = getSceneBlocks(entry.scene);
    const isTopic =
      entry.scene.id === "topic" ||
      entry.scene.commentIndex === null;

    for (const block of blocks) {
      clips.push({
        id: `image-${entry.scene.id}-${block.commentIndex}-${block.imageStart}`,
        trackId: "images",
        start: entry.start + block.imageStart,
        duration: block.imageDuration,
        label: formatClipLabel(block.imageFile),
        file: block.imageFile,
        editable: false,
        placeholder: false
      });
      clips.push({
        id: `voice-${entry.scene.id}-${block.commentIndex}-${block.audioStart}`,
        trackId: "voice",
        start: entry.start + block.audioStart,
        duration: block.audioDuration,
        label: formatClipLabel(block.audioFile),
        file: block.audioFile,
        editable: false,
        placeholder: false
      });

      const imageMeme = overlayFile(block, "meme", false);
      const videoMeme = overlayFile(block, "meme", true);
      const sfx = overlayFile(block, "sfx");

      const postVoiceStart =
        entry.start + block.audioStart + block.audioDuration;

      if (isTopic) {
        const introMeme = block.overlays.find(
          (overlay) =>
            overlay.type === "meme" &&
            entry.start + overlay.start + 0.001 < postVoiceStart
        );
        if (introMeme) {
          topicMeme = true;
          const video = isVideoAsset(introMeme.file);
          clips.push({
            id: `topic-meme`,
            trackId: video ? "video" : "meme",
            start: entry.start + introMeme.start,
            duration: introMeme.duration,
            label: withAnimationLabel(
              formatClipLabel(introMeme.file),
              {
                trackId: video ? "video" : "meme",
                animation: introMeme.animation ?? "slide-up",
                commentIndex: null
              }
            ),
            file: introMeme.file,
            editable: true,
            placeholder: false,
            target: { kind: "topic-meme" }
          });
        }

        const imageMeme = block.overlays.find(
          (overlay) =>
            overlay.type === "meme" &&
            !isVideoAsset(overlay.file) &&
            entry.start + overlay.start + 0.001 >= postVoiceStart
        );
        const videoMeme = block.overlays.find(
          (overlay) =>
            overlay.type === "meme" &&
            isVideoAsset(overlay.file) &&
            entry.start + overlay.start + 0.001 >= postVoiceStart
        );
        const sfx = block.overlays.find(
          (overlay) =>
            overlay.type === "sfx" &&
            entry.start + overlay.start + 0.001 >= postVoiceStart
        );
        if (imageMeme) {
          clips.push({
            id: "meme-topic-post",
            trackId: "meme",
            start: entry.start + imageMeme.start,
            duration: imageMeme.duration,
            label: formatClipLabel(imageMeme.file),
            file: imageMeme.file,
            editable: true,
            placeholder: false,
            target: { kind: "meme", commentIndex: TOPIC_POST_COMMENT_INDEX }
          });
        }
        if (videoMeme) {
          clips.push({
            id: "video-topic-post",
            trackId: "video",
            start: entry.start + videoMeme.start,
            duration: videoMeme.duration,
            label: formatClipLabel(videoMeme.file),
            file: videoMeme.file,
            editable: true,
            placeholder: false,
            target: { kind: "video", commentIndex: TOPIC_POST_COMMENT_INDEX }
          });
        }
        if (sfx) {
          clips.push({
            id: "sfx-topic-post",
            trackId: "sfx",
            start: entry.start + sfx.start,
            duration: sfx.duration,
            label: formatClipLabel(sfx.file),
            file: sfx.file,
            editable: true,
            placeholder: false,
            target: { kind: "sfx", commentIndex: TOPIC_POST_COMMENT_INDEX }
          });
        }
        clips.push(
          ...overlayPlaceholders({
            commentIndex: TOPIC_POST_COMMENT_INDEX,
            start: postVoiceStart,
            hasMeme: Boolean(imageMeme),
            hasVideo: Boolean(videoMeme),
            hasSfx: Boolean(sfx),
            idPrefix: "topic"
          })
        );
        continue;
      }

      if (imageMeme) {
        const overlay = block.overlays.find(
          (item) => item.type === "meme" && !isVideoAsset(item.file)
        );
        clips.push({
          id: `meme-${block.commentIndex}`,
          trackId: "meme",
          start: entry.start + (overlay?.start ?? block.audioStart + block.audioDuration),
          duration: overlay?.duration ?? PLACEHOLDER_DURATION,
          label: formatClipLabel(imageMeme),
          file: imageMeme,
          editable: true,
          placeholder: false,
          target: { kind: "meme", commentIndex: block.commentIndex }
        });
      } else {
        clips.push({
          id: `meme-add-${block.commentIndex}`,
          trackId: "meme",
          start: postVoiceStart,
          duration: PLACEHOLDER_DURATION,
          label: "+",
          editable: true,
          placeholder: true,
          target: { kind: "meme", commentIndex: block.commentIndex }
        });
      }

      if (videoMeme) {
        const overlay = block.overlays.find(
          (item) => item.type === "meme" && isVideoAsset(item.file)
        );
        clips.push({
          id: `video-${block.commentIndex}`,
          trackId: "video",
          start: entry.start + (overlay?.start ?? block.audioStart + block.audioDuration),
          duration: overlay?.duration ?? PLACEHOLDER_DURATION,
          label: formatClipLabel(videoMeme),
          file: videoMeme,
          editable: true,
          placeholder: false,
          target: { kind: "video", commentIndex: block.commentIndex }
        });
      } else {
        clips.push({
          id: `video-add-${block.commentIndex}`,
          trackId: "video",
          start: postVoiceStart,
          duration: PLACEHOLDER_DURATION,
          label: "+",
          editable: true,
          placeholder: true,
          target: { kind: "video", commentIndex: block.commentIndex }
        });
      }

      if (sfx) {
        const overlay = block.overlays.find((item) => item.type === "sfx");
        clips.push({
          id: `sfx-${block.commentIndex}`,
          trackId: "sfx",
          start: entry.start + (overlay?.start ?? block.audioStart + block.audioDuration),
          duration: overlay?.duration ?? PLACEHOLDER_DURATION,
          label: formatClipLabel(sfx),
          file: sfx,
          editable: true,
          placeholder: false,
          target: { kind: "sfx", commentIndex: block.commentIndex }
        });
      } else if (!videoMeme) {
        clips.push({
          id: `sfx-add-${block.commentIndex}`,
          trackId: "sfx",
          start: postVoiceStart,
          duration: PLACEHOLDER_DURATION,
          label: "+",
          editable: true,
          placeholder: true,
          target: { kind: "sfx", commentIndex: block.commentIndex }
        });
      }
    }
  }

  if (!topicMeme) {
    clips.push({
      id: "topic-meme-add",
      trackId: "meme",
      start: 0,
      duration: timeline.topicIntro?.blocksDuration ?? PLACEHOLDER_DURATION,
      label: "+",
      editable: true,
      placeholder: true,
      target: { kind: "topic-meme" }
    });
  }

  return TRACK_IDS.map((id) => ({
    id,
    label: TRACK_LABELS[id],
    clips: clips.filter((clip) => clip.trackId === id)
  })).filter((track) =>
    track.id === "beep" ||
    track.id !== "title-card" ||
    track.clips.length > 0
  );
}

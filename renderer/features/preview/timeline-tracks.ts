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
export const CLIP_INLINE_ACTIONS_MIN_PX = 72;

export function clipBarWidth(
  duration: number,
  pixelsPerSecond: number
): number {
  return Math.max(duration * pixelsPerSecond, CLIP_MIN_WIDTH_PX);
}

export function clipActionsDockOutside(widthPx: number): boolean {
  return widthPx < CLIP_INLINE_ACTIONS_MIN_PX;
}

export function clipActionDockOpen(options: {
  selected: boolean;
  hovered: boolean;
}): boolean {
  return options.selected || options.hovered;
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

export function clipOpensAssetPicker(clip: {
  editable: boolean;
  locked?: boolean;
  target?: TimelineAssetTarget;
}): boolean {
  if (!clip.editable || clip.locked || !clip.target) {
    return false;
  }
  return (
    clip.target.kind === "background" ||
    clip.target.kind === "music" ||
    clip.target.kind === "meme" ||
    clip.target.kind === "video" ||
    clip.target.kind === "sfx" ||
    clip.target.kind === "topic-meme" ||
    clip.target.kind === "topic-title"
  );
}

export function getProjectTracks(
  project: TimelineProject
): TimelineTrack[] {
  return TRACK_IDS.map((id) => ({
    id,
    label: TRACK_LABELS[id],
    clips: project.clips
      .filter((clip) => clip.trackId === (id as TimelineProjectTrackId))
      .map((clip) => ({
        id: clip.id,
        trackId: id,
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
      }))
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
    }
    clips.push({
      id: "topic-open-sfx",
      trackId: "sfx",
      start: 0,
      duration: timeline.topicIntro.openSfxDuration,
      label: formatClipLabel(timeline.topicIntro.openSfxFile),
      file: timeline.topicIntro.openSfxFile,
      editable: false,
      placeholder: false
    });
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
        const topicOverlay = block.overlays.find(
          (overlay) => overlay.type === "meme"
        );
        if (topicOverlay) {
          topicMeme = true;
          const video = isVideoAsset(topicOverlay.file);
          clips.push({
            id: `topic-meme`,
            trackId: video ? "video" : "meme",
            start: entry.start + topicOverlay.start,
            duration: topicOverlay.duration,
            label: withAnimationLabel(
              formatClipLabel(topicOverlay.file),
              {
                trackId: video ? "video" : "meme",
                animation: topicOverlay.animation ?? "slide-up",
                commentIndex: null
              }
            ),
            file: topicOverlay.file,
            editable: true,
            placeholder: false,
            target: { kind: "topic-meme" }
          });
        }
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

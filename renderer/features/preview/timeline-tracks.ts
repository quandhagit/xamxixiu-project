import {
  getSceneBlocks,
  getTimelineSceneEntries
} from "../../../src/timeline/timing";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import { canRemoveTimelineAsset } from "../../../src/timeline/replace-asset";
import type {
  TimelineOverlay,
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
  background: "border-l-[3px] border-slate-400 bg-slate-500/30 text-slate-50",
  images: "border-l-[3px] border-stone-300 bg-stone-400/25 text-stone-50",
  "title-card": "border-l-[3px] border-sky-400 bg-sky-500/25 text-sky-50",
  meme: "border-l-[3px] border-teal-400 bg-teal-500/25 text-teal-50",
  video: "border-l-[3px] border-indigo-400 bg-indigo-500/25 text-indigo-50",
  voice: "border-l-[3px] border-amber-400 bg-amber-500/25 text-amber-50",
  sfx: "border-l-[3px] border-emerald-400 bg-emerald-500/25 text-emerald-50",
  beep: "border-l-[3px] border-rose-400 bg-rose-500/25 text-rose-50",
  music: "border-l-[3px] border-violet-400 bg-violet-500/25 text-violet-50"
};

export const TRACK_PIPS: Record<TrackId, string> = {
  background: "bg-slate-400",
  images: "bg-stone-300",
  "title-card": "bg-sky-400",
  meme: "bg-teal-400",
  video: "bg-indigo-400",
  voice: "bg-amber-400",
  sfx: "bg-emerald-400",
  beep: "bg-rose-400",
  music: "bg-violet-400"
};

const VISUAL_TRACKS = new Set<TrackId>([
  "background",
  "title-card",
  "images",
  "meme",
  "video"
]);

export const TRACK_LANE_VISUAL = 44;
export const TRACK_LANE_AUDIO = 32;

export function trackLaneHeight(id: TrackId): number {
  return VISUAL_TRACKS.has(id) ? TRACK_LANE_VISUAL : TRACK_LANE_AUDIO;
}

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

function overlayTrackId(
  overlay: TimelineOverlay
): "meme" | "video" | "sfx" | undefined {
  if (overlay.type === "sfx") {
    return "sfx";
  }
  if (overlay.type !== "meme") {
    return undefined;
  }
  return isVideoAsset(overlay.file) ? "video" : "meme";
}

function lastOverlayEnd(
  overlays: TimelineOverlay[],
  trackId: TrackId,
  sceneStart: number,
  fallback: number,
  afterStart?: number
): number {
  let end = fallback;
  for (const overlay of overlays) {
    if (overlayTrackId(overlay) !== trackId) {
      continue;
    }
    const start = sceneStart + overlay.start;
    if (afterStart !== undefined && start + 0.001 < afterStart) {
      continue;
    }
    end = Math.max(end, start + overlay.duration);
  }
  return end;
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
    return {
      kind: "meme",
      commentIndex: clip.commentIndex,
      clipId: clip.id
    };
  }
  if (clip.trackId === "video") {
    return {
      kind: "video",
      commentIndex: clip.commentIndex,
      clipId: clip.id
    };
  }
  if (clip.trackId === "sfx") {
    return {
      kind: "sfx",
      commentIndex: clip.commentIndex,
      clipId: clip.id
    };
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

function lastCommentTrackEnd(
  project: TimelineProject,
  trackId: TimelineProjectTrackId,
  commentIndex: number,
  fallbackStart: number
): number {
  let end = fallbackStart;
  for (const clip of project.clips) {
    if (clip.trackId !== trackId || clip.commentIndex !== commentIndex) {
      continue;
    }
    end = Math.max(end, clip.start + clip.duration);
  }
  return end;
}

function overlayPlaceholders(options: {
  commentIndex: number;
  memeStart: number;
  videoStart: number;
  sfxStart: number;
  idPrefix?: string;
}): TimelineTrackClip[] {
  const suffix = options.idPrefix ?? String(options.commentIndex);
  return [
    addPlaceholderClip({
      id: `meme-add-${suffix}`,
      trackId: "meme",
      start: options.memeStart,
      duration: PLACEHOLDER_DURATION,
      target: { kind: "meme", commentIndex: options.commentIndex }
    }),
    addPlaceholderClip({
      id: `video-add-${suffix}`,
      trackId: "video",
      start: options.videoStart,
      duration: PLACEHOLDER_DURATION,
      target: { kind: "video", commentIndex: options.commentIndex }
    }),
    addPlaceholderClip({
      id: `sfx-add-${suffix}`,
      trackId: "sfx",
      start: options.sfxStart,
      duration: PLACEHOLDER_DURATION,
      target: { kind: "sfx", commentIndex: options.commentIndex }
    })
  ];
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
    const afterVoice = voice.start + voice.duration;
    clips.push(
      ...overlayPlaceholders({
        commentIndex,
        memeStart: lastCommentTrackEnd(project, "meme", commentIndex, afterVoice),
        videoStart: lastCommentTrackEnd(project, "video", commentIndex, afterVoice),
        sfxStart: lastCommentTrackEnd(project, "sfx", commentIndex, afterVoice)
      })
    );
  }

  const topicVoice = project.clips.find(isTopicVoiceClip);
  if (topicVoice) {
    const afterVoice = topicVoice.start + topicVoice.duration;
    clips.push(
      ...overlayPlaceholders({
        commentIndex: TOPIC_POST_COMMENT_INDEX,
        memeStart: lastCommentTrackEnd(
          project,
          "meme",
          TOPIC_POST_COMMENT_INDEX,
          afterVoice
        ),
        videoStart: lastCommentTrackEnd(
          project,
          "video",
          TOPIC_POST_COMMENT_INDEX,
          afterVoice
        ),
        sfxStart: lastCommentTrackEnd(
          project,
          "sfx",
          TOPIC_POST_COMMENT_INDEX,
          afterVoice
        ),
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

      const postVoiceStart =
        entry.start + block.audioStart + block.audioDuration;
      const commentIndex = isTopic
        ? TOPIC_POST_COMMENT_INDEX
        : block.commentIndex;

      for (const [overlayIndex, overlay] of block.overlays.entries()) {
        const trackId = overlayTrackId(overlay);
        if (!trackId) {
          continue;
        }
        const overlayStart = entry.start + overlay.start;
        if (isTopic && overlayStart + 0.001 < postVoiceStart) {
          if (overlay.type !== "meme") {
            continue;
          }
          topicMeme = true;
          clips.push({
            id: "topic-meme",
            trackId,
            start: overlayStart,
            duration: overlay.duration,
            label: withAnimationLabel(
              formatClipLabel(overlay.file),
              {
                trackId,
                animation: overlay.animation ?? "slide-up",
                commentIndex: null
              }
            ),
            file: overlay.file,
            editable: true,
            placeholder: false,
            target: { kind: "topic-meme" }
          });
          continue;
        }
        const clipId = isTopic
          ? `${trackId}-topic-post-${overlayIndex}`
          : `${trackId}-${entry.scene.id}-${block.commentIndex}-${overlayIndex}`;
        clips.push({
          id: clipId,
          trackId,
          start: overlayStart,
          duration: overlay.duration,
          label: formatClipLabel(overlay.file),
          file: overlay.file,
          editable: true,
          placeholder: false,
          target: {
            kind: trackId,
            commentIndex,
            clipId
          }
        });
      }

      clips.push(
        ...overlayPlaceholders({
          commentIndex,
          memeStart: lastOverlayEnd(
            block.overlays,
            "meme",
            entry.start,
            postVoiceStart,
            isTopic ? postVoiceStart : undefined
          ),
          videoStart: lastOverlayEnd(
            block.overlays,
            "video",
            entry.start,
            postVoiceStart,
            isTopic ? postVoiceStart : undefined
          ),
          sfxStart: lastOverlayEnd(
            block.overlays,
            "sfx",
            entry.start,
            postVoiceStart,
            isTopic ? postVoiceStart : undefined
          ),
          idPrefix: isTopic ? "topic" : undefined
        })
      );
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

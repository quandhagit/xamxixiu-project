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

export const TIMELINE_SELECTION_KEEP_SELECTOR =
  "[data-clip-id], [data-keep-selection], [data-scene-band], [role='dialog']";

export const TRACK_IDS = [
  "background",
  "title-card",
  "images",
  "meme",
  "sfx",
  "video",
  "watermark",
  "voice",
  "beep",
  "music"
] as const;

export type TrackId = (typeof TRACK_IDS)[number];

export function isEditorTimelineTrack(id: TrackId): boolean {
  return id !== "watermark";
}

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
  watermark: "Watermark",
  voice: "Voice",
  sfx: "SFX",
  beep: "Beep",
  music: "Music"
};

const VISUAL_TRACKS = new Set<TrackId>([
  "background",
  "title-card",
  "images",
  "meme",
  "video",
  "watermark"
]);

const CLIP_COLOR_VISUAL =
  "border-l-[3px] border-slate-400/80 bg-slate-500/28 text-slate-50";
const CLIP_COLOR_AUDIO =
  "border-l-[3px] border-zinc-400/70 bg-zinc-500/20 text-zinc-100";

export const TRACK_COLORS: Record<TrackId, string> = Object.fromEntries(
  TRACK_IDS.map((id) => [
    id,
    VISUAL_TRACKS.has(id) ? CLIP_COLOR_VISUAL : CLIP_COLOR_AUDIO
  ])
) as Record<TrackId, string>;

export const TRACK_PIPS: Record<TrackId, string> = {
  background: "bg-slate-400",
  images: "bg-stone-300",
  "title-card": "bg-sky-400",
  meme: "bg-teal-400",
  video: "bg-indigo-400",
  watermark: "bg-zinc-300",
  voice: "bg-amber-400",
  sfx: "bg-emerald-400",
  beep: "bg-rose-400",
  music: "bg-violet-400"
};

export const TRACK_TITLE_COLORS: Record<TrackId, string> = {
  background: "text-slate-300",
  images: "text-stone-300",
  "title-card": "text-sky-400",
  meme: "text-teal-400",
  video: "text-indigo-400",
  watermark: "text-zinc-300",
  voice: "text-amber-400",
  sfx: "text-emerald-400",
  beep: "text-rose-400",
  music: "text-violet-400"
};

export const TRACK_LANE_HEIGHT = 44;

export function trackLaneHeight(_id: TrackId): number {
  return TRACK_LANE_HEIGHT;
}

const BED_TRACK_IDS = new Set(["background", "music", "watermark"]);

export interface SceneBand {
  id: string;
  label: string;
  start: number;
  end: number;
  kind: "topic" | "comment";
  commentIndexes: number[];
}

function sceneBandLabel(
  kind: SceneBand["kind"],
  commentIndexes: number[]
): string {
  if (kind === "topic") {
    return "Topic";
  }
  if (commentIndexes.length === 0) {
    return "Cmt";
  }
  if (commentIndexes.length === 1) {
    return `Cmt #${commentIndexes[0]}`;
  }
  return `Cmt #${commentIndexes[0]}–#${commentIndexes[commentIndexes.length - 1]}`;
}

function sceneKeyFromClipId(id: string): string | undefined {
  if (
    id === "title-card" ||
    id.startsWith("topic-") ||
    /^(?:meme|video|sfx)-topic-post-\d+$/.test(id)
  ) {
    return "topic";
  }
  const prefixed = /^(image|voice|meme|video|sfx|beep)-(.+)$/.exec(id);
  if (!prefixed) {
    return undefined;
  }
  const kind = prefixed[1];
  const rest = prefixed[2];
  if (!kind || !rest) {
    return undefined;
  }
  if (rest.startsWith("topic")) {
    return "topic";
  }
  if (kind === "image" || kind === "voice") {
    return /^(.+)-(-?\d+)$/.exec(rest)?.[1];
  }
  return /^(.+)-(-?\d+)-(\d+)$/.exec(rest)?.[1];
}

function sceneKeyFromClip(clip: {
  id: string;
  trackId: string;
  commentIndex?: number | null;
}): string | undefined {
  if (BED_TRACK_IDS.has(clip.trackId)) {
    return undefined;
  }
  const fromId = sceneKeyFromClipId(clip.id);
  if (fromId) {
    return fromId;
  }
  if (
    clip.trackId === "title-card" ||
    clip.commentIndex === null ||
    clip.commentIndex === TOPIC_POST_COMMENT_INDEX
  ) {
    return "topic";
  }
  if (typeof clip.commentIndex === "number" && clip.commentIndex >= 0) {
    return `c:${clip.commentIndex}`;
  }
  return undefined;
}

function mergeOverlappingCommentBands(bands: SceneBand[]): SceneBand[] {
  const merged: SceneBand[] = [];
  for (const band of bands) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === "comment" &&
      band.kind === "comment" &&
      band.start < last.end - 0.0001
    ) {
      last.end = Math.max(last.end, band.end);
      last.commentIndexes = [
        ...new Set([...last.commentIndexes, ...band.commentIndexes])
      ].sort((left, right) => left - right);
      last.label = sceneBandLabel("comment", last.commentIndexes);
      last.id = `${last.id}+${band.id}`;
      continue;
    }
    merged.push({
      ...band,
      commentIndexes: [...band.commentIndexes]
    });
  }
  return merged;
}

export function getSceneBands(project: TimelineProject): SceneBand[] {
  const groups = new Map<string, TimelineClip[]>();
  for (const clip of project.clips) {
    const key = sceneKeyFromClip(clip);
    if (!key) {
      continue;
    }
    const members = groups.get(key) ?? [];
    members.push(clip);
    groups.set(key, members);
  }

  const bands: SceneBand[] = [];
  for (const [id, members] of groups) {
    let start = Number.POSITIVE_INFINITY;
    let end = 0;
    const indexes: number[] = [];
    for (const clip of members) {
      start = Math.min(start, clip.start);
      end = Math.max(end, clip.start + clip.duration);
      if (typeof clip.commentIndex === "number" && clip.commentIndex >= 0) {
        indexes.push(clip.commentIndex);
      }
    }
    if (!Number.isFinite(start) || end <= start) {
      continue;
    }
    const kind = id === "topic" ? "topic" : "comment";
    const commentIndexes = [...new Set(indexes)].sort(
      (left, right) => left - right
    );
    bands.push({
      id,
      kind,
      start,
      end,
      commentIndexes,
      label: sceneBandLabel(kind, commentIndexes)
    });
  }

  bands.sort((left, right) => left.start - right.start || left.end - right.end);
  return fillSceneBandGaps(mergeOverlappingCommentBands(bands));
}

function fillSceneBandGaps(bands: SceneBand[]): SceneBand[] {
  if (bands.length < 2) {
    return bands;
  }
  return bands.map((band, index) => {
    const next = bands[index + 1];
    if (!next || band.end >= next.start - 0.0001) {
      return band;
    }
    return { ...band, end: next.start };
  });
}

export function getTimelineSceneBands(timeline: VideoTimeline): SceneBand[] {
  return fillSceneBandGaps(getTimelineSceneEntries(timeline).map((entry) => {
    const isTopic =
      entry.scene.id === "topic" || entry.scene.commentIndex === null;
    const commentIndexes = [
      ...new Set(
        getSceneBlocks(entry.scene)
          .map((block) => block.commentIndex)
          .filter((index) => index >= 0)
      )
    ].sort((left, right) => left - right);
    const kind = isTopic ? "topic" : "comment";
    return {
      id: entry.scene.id,
      kind,
      start: entry.start,
      end: entry.end,
      commentIndexes,
      label: sceneBandLabel(kind, commentIndexes)
    };
  }));
}

export function activeSceneBandId(
  bands: SceneBand[],
  time: number
): string | undefined {
  const covering = bands.find(
    (band) => time >= band.start && time < band.end
  );
  if (covering) {
    return covering.id;
  }
  return [...bands].reverse().find((band) => time >= band.start)?.id;
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
  if (clip.placeholder || clip.trackId === "watermark") {
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
  const clips: TimelineTrackClip[] = project.clips
    .filter((clip) => clip.trackId !== "watermark")
    .map(toProjectTrackClip);

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

  return TRACK_IDS.filter(isEditorTimelineTrack).map((id) => ({
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

  return TRACK_IDS.filter(isEditorTimelineTrack).map((id) => ({
    id,
    label: TRACK_LABELS[id],
    clips: clips.filter((clip) => clip.trackId === id)
  })).filter((track) =>
    track.id === "beep" ||
    track.id !== "title-card" ||
    track.clips.length > 0
  );
}

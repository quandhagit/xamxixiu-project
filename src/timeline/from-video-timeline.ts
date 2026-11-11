import {
  getSceneBlocks,
  getTimelineSceneEntries
} from "./timing.js";
import {
  defaultClipVolume,
  recomputeTotalDuration,
  type TimelineClip,
  type TimelineProject,
  DEFAULT_AUTO_FORMAT
} from "./project.js";
import type { VideoTimeline } from "../types.js";
import { preserveComboClips } from "./meme-combo.js";

function isVideoAsset(file: string): boolean {
  return [".mp4", ".mov", ".webm", ".mkv"].some((extension) =>
    file.toLowerCase().endsWith(extension)
  );
}

function clipKind(
  trackId: TimelineClip["trackId"],
  file: string
): TimelineClip["kind"] {
  if (trackId === "title-card") {
    return "title";
  }
  if (
    trackId === "voice" ||
    trackId === "sfx" ||
    trackId === "beep" ||
    trackId === "music"
  ) {
    return "audio";
  }
  return isVideoAsset(file) ? "video" : "image";
}

function makeClip(
  partial: Omit<TimelineClip, "kind" | "volume" | "trimIn" | "sourceDuration" | "fadeIn" | "fadeOut" | "locked"> &
    Partial<Pick<TimelineClip, "kind" | "volume" | "trimIn" | "sourceDuration" | "fadeIn" | "fadeOut" | "locked" | "muteUnderBeep" | "x" | "y" | "scale" | "animation" | "animationDuration" | "comboId" | "sfxOffset" | "comboLocked">>
): TimelineClip {
  return {
    kind: partial.kind ?? clipKind(partial.trackId, partial.file),
    volume: partial.volume ?? defaultClipVolume(partial.trackId),
    trimIn: partial.trimIn ?? 0,
    sourceDuration: partial.sourceDuration ?? partial.duration,
    fadeIn: partial.fadeIn ?? 0,
    fadeOut: partial.fadeOut ?? 0,
    locked: partial.locked ?? false,
    muteUnderBeep: partial.muteUnderBeep ?? (partial.trackId === "voice"),
    x: partial.x,
    y: partial.y,
    scale: partial.scale,
    animation: partial.animation,
    animationDuration: partial.animationDuration,
    comboId: partial.comboId,
    sfxOffset: partial.sfxOffset,
    comboLocked: partial.comboLocked,
    id: partial.id,
    trackId: partial.trackId,
    start: partial.start,
    duration: partial.duration,
    file: partial.file,
    label: partial.label,
    commentIndex: partial.commentIndex
  };
}

export function videoTimelineToProject(
  timeline: VideoTimeline,
  previous?: TimelineProject
): TimelineProject {
  const locked = new Map(
    (previous?.clips ?? [])
      .filter((clip) => clip.locked)
      .map((clip) => [clip.id, clip])
  );
  const clips: TimelineClip[] = [];

  if (timeline.backgroundFile) {
    clips.push(makeClip({
      id: "background",
      trackId: "background",
      start: 0,
      duration: Math.max(timeline.totalDuration, 1),
      file: timeline.backgroundFile,
      label: "Background",
      trimIn: timeline.backgroundStart ?? 0
    }));
  }

  if (timeline.musicFile) {
    clips.push(makeClip({
      id: "music",
      trackId: "music",
      start: 0,
      duration: Math.max(timeline.totalDuration, 1),
      file: timeline.musicFile,
      label: "Music"
    }));
  }

  if (timeline.topicIntro) {
    if (timeline.topicIntro.titleCardFile) {
      clips.push(makeClip({
        id: "title-card",
        trackId: "title-card",
        start: 0,
        duration: timeline.topicIntro.blocksDuration,
        file: timeline.topicIntro.titleCardFile,
        label: timeline.topicIntro.title || "Title card",
        animation: "slide-up",
        animationDuration: timeline.topicIntro.animationDuration
      }));
    }
    clips.push(makeClip({
      id: "topic-open-sfx",
      trackId: "sfx",
      start: 0,
      duration: timeline.topicIntro.openSfxDuration,
      file: timeline.topicIntro.openSfxFile,
      label: "Open SFX"
    }));
    if (
      timeline.topicIntro.case === "long" &&
      timeline.topicIntro.titleVoiceFile
    ) {
      clips.push(makeClip({
        id: "topic-title-voice",
        trackId: "voice",
        start: timeline.topicIntro.animationDuration,
        duration: timeline.topicIntro.titleVoiceDuration,
        file: timeline.topicIntro.titleVoiceFile,
        label: "Title voice",
        muteUnderBeep: true
      }));
    }
  }

  for (const entry of getTimelineSceneEntries(timeline)) {
    const isTopic =
      entry.scene.id === "topic" ||
      entry.scene.commentIndex === null;
    for (const block of getSceneBlocks(entry.scene)) {
      clips.push(makeClip({
        id: `image-${entry.scene.id}-${block.commentIndex}`,
        trackId: "images",
        start: entry.start + block.imageStart,
        duration: block.imageDuration,
        file: block.imageFile,
        label: isTopic ? "Topic" : `Comment ${block.commentIndex}`,
        commentIndex: isTopic ? null : block.commentIndex,
        scale: block.imageScale,
        x: block.imageX,
        y: block.imageY
      }));
      clips.push(makeClip({
        id: `voice-${entry.scene.id}-${block.commentIndex}`,
        trackId: "voice",
        start: entry.start + block.audioStart,
        duration: block.audioDuration,
        file: block.audioFile,
        label: isTopic ? "Topic voice" : `Voice ${block.commentIndex}`,
        commentIndex: isTopic ? null : block.commentIndex,
        muteUnderBeep: true
      }));
      for (const overlay of block.overlays) {
        const video = overlay.type === "meme" && isVideoAsset(overlay.file);
        const trackId = overlay.type === "sfx"
          ? "sfx"
          : video
            ? "video"
            : "meme";
        clips.push(makeClip({
          id: `${trackId}-${entry.scene.id}-${block.commentIndex}-${overlay.file}`,
          trackId,
          start: entry.start + overlay.start,
          duration: overlay.duration,
          file: overlay.file,
          label: overlay.type,
          commentIndex: isTopic ? null : block.commentIndex,
          fadeIn: overlay.fadeIn ?? 0,
          scale: overlay.scale,
          x: overlay.x,
          y: overlay.y,
          animation: overlay.animation,
          animationDuration: overlay.animationDuration,
          comboId: overlay.comboId,
          sfxOffset: overlay.sfxOffset,
          comboLocked: overlay.comboLocked
        }));
      }
    }
  }

  const withCombos = preserveComboClips(clips, previous?.clips ?? []);
  const merged = withCombos.map((clip) => locked.get(clip.id) ?? clip);
  for (const clip of locked.values()) {
    if (!merged.some((item) => item.id === clip.id)) {
      merged.push(clip);
    }
  }

  return recomputeTotalDuration({
    version: 1,
    canvas: timeline.canvas,
    totalDuration: timeline.totalDuration,
    clips: merged,
    backgroundStart: timeline.backgroundStart,
    settings: previous?.settings ?? { ...DEFAULT_AUTO_FORMAT }
  });
}

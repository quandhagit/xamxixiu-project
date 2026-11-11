export const TIMELINE_PROJECT_TRACK_IDS = [
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

export type TimelineProjectTrackId =
  (typeof TIMELINE_PROJECT_TRACK_IDS)[number];

export type TimelineClipKind =
  | "image"
  | "video"
  | "audio"
  | "title";

export interface TimelineClip {
  id: string;
  trackId: TimelineProjectTrackId;
  start: number;
  duration: number;
  trimIn: number;
  sourceDuration: number;
  file: string;
  fadeIn: number;
  fadeOut: number;
  volume: number;
  locked: boolean;
  label: string;
  kind: TimelineClipKind;
  commentIndex?: number | null;
  muteUnderBeep?: boolean;
  x?: number;
  y?: number;
  scale?: number;
  animation?: string;
  animationDuration?: number;
  comboId?: string;
  sfxOffset?: number;
  comboLocked?: boolean;
}

export interface AutoFormatSettings {
  memeGap: number;
  memeMinDuration: number;
  memeMaxDuration: number;
  fadeIn: number;
  fadeOut: number;
  preserveLocked: boolean;
  rippleVoiceTrim: boolean;
}

export const DEFAULT_AUTO_FORMAT: AutoFormatSettings = {
  memeGap: 0.1,
  memeMinDuration: 1,
  memeMaxDuration: 4,
  fadeIn: 0.3,
  fadeOut: 0.3,
  preserveLocked: true,
  rippleVoiceTrim: true
};

export const AUTO_FORMAT_PRESETS: Record<
  "fast" | "slow" | "default",
  AutoFormatSettings
> = {
  default: DEFAULT_AUTO_FORMAT,
  fast: {
    ...DEFAULT_AUTO_FORMAT,
    memeGap: 0.04,
    memeMinDuration: 0.7,
    memeMaxDuration: 2.4,
    fadeIn: 0.15,
    fadeOut: 0.15
  },
  slow: {
    ...DEFAULT_AUTO_FORMAT,
    memeGap: 0.25,
    memeMinDuration: 1.4,
    memeMaxDuration: 5,
    fadeIn: 0.5,
    fadeOut: 0.5
  }
};

export interface TimelineProject {
  version: 1;
  canvas: {
    width: 1080;
    height: 1920;
    fps: 30;
  };
  totalDuration: number;
  clips: TimelineClip[];
  backgroundStart?: number;
  settings: AutoFormatSettings;
}

export function createEmptyTimelineProject(): TimelineProject {
  return {
    version: 1,
    canvas: { width: 1080, height: 1920, fps: 30 },
    totalDuration: 1,
    clips: [],
    settings: { ...DEFAULT_AUTO_FORMAT }
  };
}

export function cloneTimelineProject(
  project: TimelineProject
): TimelineProject {
  return JSON.parse(JSON.stringify(project)) as TimelineProject;
}

export function clipsOnTrack(
  project: TimelineProject,
  trackId: TimelineProjectTrackId
): TimelineClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((left, right) => left.start - right.start);
}

export function recomputeTotalDuration(
  project: TimelineProject
): TimelineProject {
  const end = project.clips.reduce(
    (max, clip) => Math.max(max, clip.start + clip.duration),
    0
  );
  return {
    ...project,
    totalDuration: Math.max(end, 1)
  };
}

export function defaultClipVolume(
  trackId: TimelineProjectTrackId
): number {
  if (trackId === "music") {
    return 0.2512;
  }
  return 1;
}

export function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

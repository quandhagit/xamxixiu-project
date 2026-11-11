import {
  cloneTimelineProject,
  clipsOnTrack,
  recomputeTotalDuration,
  roundTime,
  type AutoFormatSettings,
  type TimelineClip,
  type TimelineProject,
  DEFAULT_AUTO_FORMAT
} from "./project.js";

function canMove(
  clip: TimelineClip,
  settings: AutoFormatSettings
): boolean {
  return !(settings.preserveLocked && clip.locked);
}

function clampDuration(
  duration: number,
  settings: AutoFormatSettings
): number {
  return Math.min(
    settings.memeMaxDuration,
    Math.max(settings.memeMinDuration, duration)
  );
}

export function autoFormat(
  project: TimelineProject,
  settings: AutoFormatSettings = project.settings ?? DEFAULT_AUTO_FORMAT
): TimelineProject {
  const next = cloneTimelineProject(project);
  next.settings = { ...settings };

  for (const trackId of ["meme", "video"] as const) {
    const clips = clipsOnTrack(next, trackId);
    let cursor: number | undefined;
    for (const clip of clips) {
      if (!canMove(clip, settings)) {
        cursor = clip.start + clip.duration;
        continue;
      }
      const duration = clampDuration(clip.duration, settings);
      const start = cursor === undefined
        ? clip.start
        : roundTime(cursor + settings.memeGap);
      clip.start = start;
      clip.duration = roundTime(duration);
      if (!clip.comboId || clip.comboId === "none") {
        clip.fadeIn = settings.fadeIn;
      }
      clip.fadeOut = settings.fadeOut;
      cursor = clip.start + clip.duration;
    }
  }

  for (const clip of next.clips) {
    if (
      (clip.trackId === "meme" || clip.trackId === "video") &&
      canMove(clip, settings) &&
      (!clip.comboId || clip.comboId === "none")
    ) {
      clip.fadeIn = settings.fadeIn;
      clip.fadeOut = settings.fadeOut;
    }
  }

  return recomputeTotalDuration(next);
}

export function applyRipple(
  project: TimelineProject,
  fromTime: number,
  delta: number,
  exceptId?: string
): TimelineProject {
  if (delta === 0) {
    return project;
  }
  const next = cloneTimelineProject(project);
  for (const clip of next.clips) {
    if (clip.id === exceptId || clip.locked) {
      continue;
    }
    if (clip.start >= fromTime - 0.0001) {
      clip.start = roundTime(Math.max(0, clip.start + delta));
    }
  }
  return recomputeTotalDuration(next);
}

export function trimClip(
  project: TimelineProject,
  clipId: string,
  edge: "in" | "out",
  nextTime: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  const end = clip.start + clip.duration;
  if (edge === "in") {
    const start = roundTime(Math.max(0, Math.min(nextTime, end - 0.05)));
    const delta = start - clip.start;
    clip.trimIn = roundTime(Math.max(0, clip.trimIn + delta));
    clip.duration = roundTime(end - start);
    clip.start = start;
    if (next.settings.rippleVoiceTrim && clip.trackId === "voice") {
      return applyRipple(next, end, -delta, clip.id);
    }
  } else {
    const newEnd = roundTime(Math.max(clip.start + 0.05, nextTime));
    const maxEnd = clip.start + Math.max(0.05, clip.sourceDuration - clip.trimIn);
    clip.duration = roundTime(Math.min(newEnd, maxEnd) - clip.start);
  }
  return recomputeTotalDuration(next);
}

export function moveClip(
  project: TimelineProject,
  clipId: string,
  start: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  clip.start = roundTime(Math.max(0, start));
  return recomputeTotalDuration(next);
}

export function splitClip(
  project: TimelineProject,
  clipId: string,
  at: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  const offset = at - clip.start;
  if (offset <= 0.05 || offset >= clip.duration - 0.05) {
    return project;
  }
  const right: TimelineClip = {
    ...clip,
    id: `${clip.id}-split-${Math.round(at * 1000)}`,
    start: roundTime(at),
    duration: roundTime(clip.duration - offset),
    trimIn: roundTime(clip.trimIn + offset),
    fadeIn: 0
  };
  clip.duration = roundTime(offset);
  clip.fadeOut = 0;
  next.clips.push(right);
  return recomputeTotalDuration(next);
}

export function removeClip(
  project: TimelineProject,
  clipId: string
): TimelineProject {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  const next = cloneTimelineProject(project);
  next.clips = next.clips.filter((item) => item.id !== clipId);
  return recomputeTotalDuration(next);
}

export function setClipLocked(
  project: TimelineProject,
  clipId: string,
  locked: boolean
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip) {
    return project;
  }
  clip.locked = locked;
  return next;
}

export function setClipFades(
  project: TimelineProject,
  clipId: string,
  fadeIn: number,
  fadeOut: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  clip.fadeIn = roundTime(Math.max(0, fadeIn));
  clip.fadeOut = roundTime(Math.max(0, fadeOut));
  return next;
}

export function setClipAnimationDuration(
  project: TimelineProject,
  clipId: string,
  duration: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  clip.animationDuration = roundTime(Math.max(0, duration));
  return next;
}

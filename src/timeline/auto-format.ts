import {
  cloneTimelineProject,
  recomputeTotalDuration,
  roundTime,
  type AutoFormatSettings,
  type TimelineClip,
  type TimelineProject,
  DEFAULT_AUTO_FORMAT
} from "./project.js";
import {
  packTimelineScenes,
  type ScenePackComment
} from "./scene-pack.js";

export function autoFormat(
  project: TimelineProject,
  settings: AutoFormatSettings = project.settings ?? DEFAULT_AUTO_FORMAT,
  comments?: ScenePackComment[]
): TimelineProject {
  const next = packTimelineScenes(project, settings.sceneGap ?? 0.1, comments);
  next.settings = { ...settings };
  return next;
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

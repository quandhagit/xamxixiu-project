import {
  cloneTimelineProject,
  recomputeTotalDuration,
  roundTime,
  type AutoFormatSettings,
  type TimelineClip,
  type TimelineProject,
  DEFAULT_AUTO_FORMAT
} from "../../../src/timeline/project";
import {
  applyCombo,
  clearCombo,
  type MemeCombo
} from "../../../src/timeline/meme-combo";
import {
  canMoveClipOnPreview,
  clampClipAxis
} from "../../../src/timeline/clip-position";
import {
  packTimelineScenes,
  type ScenePackComment
} from "../../../src/timeline/scene-pack";
import {
  clampImageEffectStyle,
  type ImageEffectStyle
} from "../../../src/image-effect";

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

export function setClipImageEffect(
  project: TimelineProject,
  clipId: string,
  effect: ImageEffectStyle
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked || clip.trackId !== "images") {
    return project;
  }
  const clamped = clampImageEffectStyle(effect);
  clip.animation = clamped.entrance;
  clip.animationDuration = clamped.duration;
  return next;
}

function syncPairedSfx(
  project: TimelineProject,
  clip: TimelineClip
): void {
  if (clip.commentIndex === undefined || clip.commentIndex === null) {
    return;
  }
  let paired: TimelineClip | undefined;
  for (const other of project.clips) {
    if (
      other.trackId !== "sfx" ||
      other.commentIndex !== clip.commentIndex
    ) {
      continue;
    }
    if (
      !paired ||
      Math.abs(other.start - clip.start) < Math.abs(paired.start - clip.start)
    ) {
      paired = other;
    }
  }
  if (paired) {
    paired.start = roundTime(Math.max(0, clip.start + (clip.sfxOffset ?? 0)));
  }
}

export function applyComboToProject(
  project: TimelineProject,
  clipId: string,
  combo: MemeCombo
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  Object.assign(clip, applyCombo(clip, combo));
  syncPairedSfx(next, clip);
  return recomputeTotalDuration(next);
}

export function clearComboOnProject(
  project: TimelineProject,
  clipId: string
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  Object.assign(clip, clearCombo(clip));
  syncPairedSfx(next, clip);
  return recomputeTotalDuration(next);
}

export function setClipComboLocked(
  project: TimelineProject,
  clipId: string,
  locked: boolean
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip) {
    return project;
  }
  clip.comboLocked = locked;
  return next;
}

export function setClipSfxOffset(
  project: TimelineProject,
  clipId: string,
  offset: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  clip.sfxOffset = roundTime(Math.max(0, offset));
  syncPairedSfx(next, clip);
  return recomputeTotalDuration(next);
}

export function setClipScale(
  project: TimelineProject,
  clipId: string,
  scale: number
): TimelineProject {
  const next = cloneTimelineProject(project);
  const clip = next.clips.find((item) => item.id === clipId);
  if (!clip || clip.locked) {
    return project;
  }
  clip.scale = Math.max(0.2, Math.min(1.2, scale));
  return next;
}

export function setClipPosition(
  project: TimelineProject,
  clipId: string,
  x: number,
  y: number
): TimelineProject {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip || !canMoveClipOnPreview(clip)) {
    return project;
  }
  const nextX = roundTime(clampClipAxis(x));
  const nextY = roundTime(clampClipAxis(y));
  if ((clip.x ?? 0) === nextX && (clip.y ?? 0) === nextY) {
    return project;
  }
  const next = cloneTimelineProject(project);
  const draft = next.clips.find((item) => item.id === clipId);
  if (!draft) {
    return project;
  }
  draft.x = nextX;
  draft.y = nextY;
  return next;
}

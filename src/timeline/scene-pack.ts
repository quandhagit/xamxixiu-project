import type { TimelineClip, TimelineProject } from "./project.js";

const TOPIC_SCENE = "topic";
const BED_TRACKS = new Set(["background", "music"]);

export interface ScenePackComment {
  parentCommentIndex?: number;
  excluded?: boolean;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cloneTimelineProject(project: TimelineProject): TimelineProject {
  return JSON.parse(JSON.stringify(project)) as TimelineProject;
}

function recomputeTotalDuration(project: TimelineProject): TimelineProject {
  const end = project.clips.reduce(
    (max, clip) => Math.max(max, clip.start + clip.duration),
    0
  );
  return {
    ...project,
    totalDuration: Math.max(end, 1)
  };
}

function isBedClip(clip: TimelineClip): boolean {
  return BED_TRACKS.has(clip.trackId);
}

function isExcludedComment(
  comments: ScenePackComment[],
  index: number
): boolean {
  return comments[index]?.excluded === true;
}

function commentThreadGroups(comments: ScenePackComment[]): number[][] {
  const children = new Map<number, number[]>();
  for (let index = 0; index < comments.length; index += 1) {
    if (isExcludedComment(comments, index)) {
      continue;
    }
    const parent = comments[index]?.parentCommentIndex;
    if (
      parent !== undefined &&
      parent >= 0 &&
      parent < comments.length &&
      !isExcludedComment(comments, parent)
    ) {
      children.set(parent, [...(children.get(parent) ?? []), index]);
    }
  }

  const groups: number[][] = [];
  const visited = new Set<number>();

  function descendants(root: number): number[] {
    if (visited.has(root) || isExcludedComment(comments, root)) {
      return [];
    }
    visited.add(root);
    const result = [root];
    for (const child of children.get(root) ?? []) {
      result.push(...descendants(child));
    }
    return result;
  }

  function addGroup(root: number): void {
    if (visited.has(root) || isExcludedComment(comments, root)) {
      return;
    }
    const group = [root];
    visited.add(root);
    for (const child of children.get(root) ?? []) {
      group.push(...descendants(child));
    }
    groups.push(group);
  }

  for (let index = 0; index < comments.length; index += 1) {
    const parent = comments[index]?.parentCommentIndex;
    if (parent === undefined || !children.has(parent)) {
      addGroup(index);
    }
  }
  return groups;
}

function threadMaps(comments: ScenePackComment[]): {
  rootOf: Map<number, number>;
  orderOf: Map<number, number[]>;
} {
  const rootOf = new Map<number, number>();
  const orderOf = new Map<number, number[]>();
  for (const group of commentThreadGroups(comments)) {
    const root = group[0];
    if (root === undefined) {
      continue;
    }
    orderOf.set(root, group);
    for (const index of group) {
      rootOf.set(index, root);
    }
  }
  return { rootOf, orderOf };
}

function keyedSceneId(
  clip: TimelineClip,
  rootOf: Map<number, number> | undefined
): string | undefined {
  if (isBedClip(clip)) {
    return undefined;
  }
  if (typeof clip.commentIndex === "number" && clip.commentIndex >= 0) {
    const root = rootOf?.get(clip.commentIndex) ?? clip.commentIndex;
    return rootOf ? `t:${root}` : `c:${clip.commentIndex}`;
  }
  if (clip.commentIndex === null || clip.commentIndex === -1) {
    return TOPIC_SCENE;
  }
  if (
    clip.trackId === "title-card" ||
    clip.id === "topic-open-sfx" ||
    clip.id === "topic-title-voice"
  ) {
    return TOPIC_SCENE;
  }
  return undefined;
}

function sceneBounds(clips: TimelineClip[]): { start: number; end: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const clip of clips) {
    start = Math.min(start, clip.start);
    end = Math.max(end, clip.start + clip.duration);
  }
  return {
    start: Number.isFinite(start) ? start : 0,
    end
  };
}

function shiftClips(clips: TimelineClip[], delta: number): void {
  for (const clip of clips) {
    clip.start = roundTime(Math.max(0, roundTime(clip.start) + delta));
  }
}

function commentContentEnd(clips: TimelineClip[]): number {
  const nonImage = clips.filter((clip) => clip.trackId !== "images");
  if (nonImage.length === 0) {
    return sceneBounds(clips).end;
  }
  return sceneBounds(nonImage).end;
}

function commentPackWindow(
  clips: TimelineClip[],
  nextStart: number | undefined,
  followingDuration: number
): { start: number; end: number } {
  const bounds = sceneBounds(clips);
  if (
    nextStart !== undefined &&
    nextStart > bounds.start + 0.0001 &&
    bounds.end > nextStart + 0.0001
  ) {
    return { start: bounds.start, end: nextStart };
  }
  if (
    nextStart !== undefined &&
    followingDuration > 0 &&
    Math.abs(bounds.end - nextStart) <= 0.05
  ) {
    const extra = bounds.end - commentContentEnd(clips);
    if (extra >= followingDuration * 0.5 - 0.05) {
      const end = roundTime(bounds.end - followingDuration);
      if (end > bounds.start + 0.05) {
        return { start: bounds.start, end };
      }
    }
  }
  return bounds;
}

function stretchThreadImages(members: TimelineClip[]): void {
  const end = sceneBounds(members).end;
  for (const clip of members) {
    if (clip.locked || clip.trackId !== "images") {
      continue;
    }
    clip.duration = roundTime(Math.max(0.05, end - clip.start));
  }
}

function assignSceneId(
  clip: TimelineClip,
  scenes: Map<string, TimelineClip[]>,
  rootOf: Map<number, number> | undefined
): string {
  const keyed = keyedSceneId(clip, rootOf);
  if (keyed) {
    return keyed;
  }
  let bestId = TOPIC_SCENE;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [id, members] of scenes) {
    const bounds = sceneBounds(members);
    if (clip.start >= bounds.start - 0.0001 && clip.start < bounds.end + 0.0001) {
      return id;
    }
    const distance = Math.min(
      Math.abs(clip.start - bounds.start),
      Math.abs(clip.start - bounds.end)
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = id;
    }
  }
  return scenes.size > 0 ? bestId : TOPIC_SCENE;
}

function compactThreadComments(
  members: TimelineClip[],
  order: number[]
): void {
  const byIndex = new Map<number, TimelineClip[]>();
  const loose: TimelineClip[] = [];
  for (const clip of members) {
    if (typeof clip.commentIndex === "number" && clip.commentIndex >= 0) {
      const group = byIndex.get(clip.commentIndex) ?? [];
      group.push(clip);
      byIndex.set(clip.commentIndex, group);
      continue;
    }
    loose.push(clip);
  }

  for (const clip of loose) {
    let bestIndex = order[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of byIndex.keys()) {
      const bounds = sceneBounds(byIndex.get(index) ?? []);
      if (
        clip.start >= bounds.start - 0.0001 &&
        clip.start < bounds.end + 0.0001
      ) {
        bestIndex = index;
        break;
      }
      const distance = Math.min(
        Math.abs(clip.start - bounds.start),
        Math.abs(clip.start - bounds.end)
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex === undefined) {
      continue;
    }
    const group = byIndex.get(bestIndex) ?? [];
    group.push(clip);
    byIndex.set(bestIndex, group);
  }

  const remaining = [...byIndex.keys()].filter((index) => !order.includes(index));
  remaining.sort((left, right) => {
    return sceneBounds(byIndex.get(left) ?? []).start -
      sceneBounds(byIndex.get(right) ?? []).start;
  });
  const sequence = [...order.filter((index) => byIndex.has(index)), ...remaining];
  const originalStart = new Map<number, number>();
  for (const index of sequence) {
    originalStart.set(index, sceneBounds(byIndex.get(index) ?? []).start);
  }

  const windows = new Map<number, { start: number; end: number }>();
  let followingDuration = 0;
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    const index = sequence[i];
    const clips = byIndex.get(index);
    if (!clips || clips.length === 0) {
      continue;
    }
    const nextIndex = sequence[i + 1];
    const nextStart = nextIndex === undefined
      ? undefined
      : originalStart.get(nextIndex);
    const window = commentPackWindow(clips, nextStart, followingDuration);
    windows.set(index, window);
    followingDuration = roundTime(
      followingDuration + (window.end - window.start)
    );
  }

  let cursor = 0;
  let first = true;
  for (const index of sequence) {
    const clips = byIndex.get(index);
    const window = windows.get(index);
    if (!clips || clips.length === 0 || !window) {
      continue;
    }
    const bounds = sceneBounds(clips);
    if (first) {
      cursor = window.start;
      first = false;
    }
    const delta = roundTime(cursor - bounds.start);
    shiftClips(clips, delta);
    cursor = roundTime(window.end + delta);
  }
  stretchThreadImages(members);
}

export function packTimelineScenes(
  project: TimelineProject,
  sceneGap: number,
  comments?: ScenePackComment[]
): TimelineProject {
  const next = cloneTimelineProject(project);
  const gap = roundTime(Math.max(0, sceneGap));
  const maps = comments && comments.length > 0 ? threadMaps(comments) : undefined;
  const scenes = new Map<string, TimelineClip[]>();
  const unassigned: TimelineClip[] = [];
  const bed: TimelineClip[] = [];

  for (const clip of next.clips) {
    if (isBedClip(clip)) {
      bed.push(clip);
      continue;
    }
    const key = keyedSceneId(clip, maps?.rootOf);
    if (!key) {
      unassigned.push(clip);
      continue;
    }
    const members = scenes.get(key) ?? [];
    members.push(clip);
    scenes.set(key, members);
  }

  for (const clip of unassigned) {
    const id = assignSceneId(clip, scenes, maps?.rootOf);
    const members = scenes.get(id) ?? [];
    members.push(clip);
    scenes.set(id, members);
  }

  const ordered = [...scenes.entries()].sort((left, right) => {
    const delta = sceneBounds(left[1]).start - sceneBounds(right[1]).start;
    if (delta !== 0) {
      return delta;
    }
    return left[0].localeCompare(right[0]);
  });

  let cursor = 0;
  for (const [id, members] of ordered) {
    if (id.startsWith("t:") && maps) {
      const root = Number(id.slice(2));
      compactThreadComments(members, maps.orderOf.get(root) ?? []);
    }
    const bounds = sceneBounds(members);
    shiftClips(members, roundTime(cursor - bounds.start));
    cursor = roundTime(sceneBounds(members).end + gap);
  }

  const packed = recomputeTotalDuration(next);
  for (const clip of bed) {
    clip.start = 0;
    clip.duration = packed.totalDuration;
  }
  return recomputeTotalDuration(packed);
}

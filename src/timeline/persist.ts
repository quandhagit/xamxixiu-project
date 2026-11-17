import type { TimelineProject } from "./project.js";

export const EDITOR_BURST_MS = 250;

export interface EditorBurst<T> {
  origin: T;
  latest: T;
}

export function clipPreviewFiles(
  clips: Array<{ file?: string }> | undefined
): string[] {
  return [
    ...new Set(
      (clips ?? []).map((clip) => clip.file).filter((file): file is string =>
        Boolean(file)
      )
    )
  ].sort();
}

export function previewFilesChanged(
  previous: string[],
  next: string[]
): boolean {
  if (previous.length !== next.length) {
    return true;
  }
  const left = [...previous].sort();
  const right = [...next].sort();
  return left.some((file, index) => file !== right[index]);
}

function comboStampSignature(
  clips: TimelineProject["clips"] | undefined
): string {
  return (clips ?? [])
    .filter((clip) => clip.trackId === "meme" || clip.trackId === "video")
    .map(
      (clip) =>
        `${clip.commentIndex ?? ""}:${clip.comboId ?? ""}:${clip.comboLocked ? 1 : 0}`
    )
    .sort()
    .join("|");
}

export function comboStampNeeded(
  previous: TimelineProject | undefined,
  next: TimelineProject
): boolean {
  if (!previous) {
    return true;
  }
  return comboStampSignature(previous.clips) !== comboStampSignature(next.clips);
}

export function startEditorBurst<T>(origin: T, latest: T): EditorBurst<T> {
  return { origin, latest };
}

export function continueEditorBurst<T>(
  burst: EditorBurst<T> | undefined,
  origin: T,
  latest: T
): EditorBurst<T> {
  if (!burst) {
    return startEditorBurst(origin, latest);
  }
  return { origin: burst.origin, latest };
}

export function flushEditorBurst<T>(
  burst: EditorBurst<T> | undefined,
  equal: (left: T, right: T) => boolean
): EditorBurst<T> | undefined {
  if (!burst || equal(burst.origin, burst.latest)) {
    return undefined;
  }
  return burst;
}

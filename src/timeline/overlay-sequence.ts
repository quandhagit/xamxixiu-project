export const DEFAULT_MEME_DURATION = 1;

export interface SequentialOverlay {
  type: "meme" | "sfx" | string;
  start: number;
  duration: number;
  sfxOffset?: number;
}

export function nextVisualOverlayStart(
  overlays: SequentialOverlay[],
  fallback: number
): number {
  let end = fallback;
  for (const overlay of overlays) {
    if (overlay.type !== "meme") {
      continue;
    }
    end = Math.max(end, overlay.start + overlay.duration);
  }
  return end;
}

export function applyPairedMemeSfxLayout(
  visuals: Array<{ start: number; duration: number; sfxOffset?: number }>,
  sfxs: Array<{ start: number; duration: number }>,
  origin?: number
): void {
  if (visuals.length === 0) {
    let cursor = origin ?? sfxs[0]?.start ?? 0;
    for (const sfx of sfxs) {
      sfx.start = cursor;
      cursor += sfx.duration;
    }
    return;
  }
  let cursor = origin ?? visuals[0]?.start ?? 0;
  for (let index = 0; index < visuals.length; index += 1) {
    const visual = visuals[index];
    if (!visual) {
      continue;
    }
    const sfx = sfxs[index];
    const offset = visual.sfxOffset ?? 0;
    if (sfx) {
      visual.duration = offset + sfx.duration;
    }
    visual.start = cursor;
    if (sfx) {
      sfx.start = cursor + offset;
    }
    cursor = visual.start + visual.duration;
  }
  for (let index = visuals.length; index < sfxs.length; index += 1) {
    const sfx = sfxs[index];
    if (!sfx) {
      continue;
    }
    sfx.start = cursor;
    cursor += sfx.duration;
  }
}

export function sequenceMemeOverlays(
  overlays: SequentialOverlay[]
): void {
  const memes = overlays
    .filter((overlay) => overlay.type === "meme")
    .sort((left, right) => left.start - right.start);
  const sfxs = overlays
    .filter((overlay) => overlay.type === "sfx")
    .sort((left, right) => left.start - right.start);
  applyPairedMemeSfxLayout(
    memes,
    sfxs,
    memes[0]?.start ?? sfxs[0]?.start
  );
}

export function sequenceCommentVisualClips(
  clips: Array<{
    trackId: string;
    commentIndex?: number | null;
    start: number;
    duration: number;
    sfxOffset?: number;
  }>
): void {
  const visualGroups = new Map<
    number,
    Array<{ start: number; duration: number; sfxOffset?: number }>
  >();
  const sfxGroups = new Map<number, Array<{ start: number; duration: number }>>();
  for (const clip of clips) {
    if (typeof clip.commentIndex !== "number") {
      continue;
    }
    if (clip.trackId === "meme" || clip.trackId === "video") {
      const group = visualGroups.get(clip.commentIndex) ?? [];
      group.push(clip);
      visualGroups.set(clip.commentIndex, group);
      continue;
    }
    if (clip.trackId === "sfx") {
      const group = sfxGroups.get(clip.commentIndex) ?? [];
      group.push(clip);
      sfxGroups.set(clip.commentIndex, group);
    }
  }
  for (const [commentIndex, visuals] of visualGroups) {
    visuals.sort((left, right) => left.start - right.start);
    const sfxs = (sfxGroups.get(commentIndex) ?? []).sort(
      (left, right) => left.start - right.start
    );
    applyPairedMemeSfxLayout(visuals, sfxs, visuals[0]?.start);
    const end = visuals.reduce(
      (latest, clip) => Math.max(latest, clip.start + clip.duration),
      visuals[0]?.start ?? 0
    );
    for (const clip of clips) {
      if (clip.trackId !== "images" || clip.commentIndex !== commentIndex) {
        continue;
      }
      clip.duration = Math.max(clip.duration, end - clip.start);
    }
  }
}

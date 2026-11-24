import type { Asset } from "../assets/library.js";
import type { MatchedReaction } from "../assets/matcher.js";
import type { ThreadAnalysis } from "../types.js";

export type TimelineAssetTarget =
  | { kind: "background" }
  | { kind: "music" }
  | { kind: "topic-title" }
  | { kind: "topic-meme" }
  | { kind: "meme"; commentIndex: number; clipId?: string }
  | { kind: "video"; commentIndex: number; clipId?: string }
  | { kind: "sfx"; commentIndex: number; clipId?: string };

export interface AssetAssignmentSelections {
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;
  topicMemeId?: string | null;
  topicPostMemeId?: string | null;
  topicPostExtraMemeIds?: string[];
  topicPostSfxId?: string | null;
  topicPostExtraSfxIds?: string[];
  topicIntroEnabled?: boolean;
}

export interface TimelineAssetReplacement {
  reactions: MatchedReaction[];
  selections?: AssetAssignmentSelections;
}

export interface TimelineAssetClipRef {
  id: string;
  file: string;
  trackId?: string;
  commentIndex?: number | null;
  start?: number;
}

function requireAsset(
  assets: Asset[],
  assetId: string,
  type: Asset["type"],
  mediaKind?: Asset["mediaKind"]
): Asset {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) {
    throw new Error(`Unknown asset: ${assetId}`);
  }
  if (asset.type !== type) {
    throw new Error(`Asset ${assetId} is not a ${type}`);
  }
  if (mediaKind && asset.mediaKind !== mediaKind) {
    throw new Error(`Asset ${assetId} is not ${mediaKind}`);
  }
  return asset;
}

export function overlayFilesMatch(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.replaceAll("\\", "/").toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) {
    return true;
  }
  const baseA = a.split("/").pop() ?? a;
  const baseB = b.split("/").pop() ?? b;
  return baseA === baseB && baseA.length > 0;
}

function upsertReaction(
  reactions: MatchedReaction[],
  next: MatchedReaction
): MatchedReaction[] {
  const index = reactions.findIndex(
    (reaction) => reaction.commentIndex === next.commentIndex
  );
  if (index < 0) {
    return [...reactions, next];
  }
  return reactions.map((reaction, reactionIndex) =>
    reactionIndex === index ? next : reaction
  );
}

function cloneList<T>(items: T[] | undefined): T[] {
  return items ? [...items] : [];
}

function memeList(reaction: MatchedReaction): Asset[] {
  return [
    ...(reaction.meme ? [reaction.meme] : []),
    ...cloneList(reaction.extraMemes)
  ];
}

function sfxList(reaction: MatchedReaction): Asset[] {
  return [
    ...(reaction.sfx ? [reaction.sfx] : []),
    ...cloneList(reaction.extraSfx)
  ];
}

function writeMemes(reaction: MatchedReaction, memes: Asset[]): void {
  reaction.meme = memes[0] ?? null;
  reaction.extraMemes = memes.slice(1);
  if (reaction.meme?.mediaKind === "video") {
    reaction.animation = "none";
  }
}

function writeSfx(reaction: MatchedReaction, items: Asset[]): void {
  reaction.sfx = items[0] ?? null;
  reaction.extraSfx = items.slice(1);
}

function ensureReaction(
  reactions: MatchedReaction[],
  commentIndex: number,
  analysis: ThreadAnalysis | undefined
): MatchedReaction {
  const existing = reactions.find(
    (reaction) => reaction.commentIndex === commentIndex
  );
  if (existing) {
    return {
      ...existing,
      extraMemes: cloneList(existing.extraMemes),
      extraSfx: cloneList(existing.extraSfx)
    };
  }
  const event = analysis?.reactions.find(
    (reaction) => reaction.commentIndex === commentIndex
  );
  return {
    commentIndex,
    emotion: event?.emotion ?? "neutral",
    meme: null,
    extraMemes: [],
    sfx: null,
    extraSfx: [],
    animation: "none",
    duration: event?.duration ?? 1
  };
}

function pickFallbackSfx(
  assets: Asset[],
  preferredCategory: string | undefined,
  usedIds: Set<string>
): Asset | null {
  const sfxAssets = assets.filter((asset) => asset.type === "sfx");
  const preferred = preferredCategory
    ? sfxAssets.filter(
      (asset) =>
        asset.category === preferredCategory ||
        asset.tags.includes(preferredCategory)
    )
    : [];
  return (
    preferred.find((asset) => !usedIds.has(asset.id)) ??
    preferred[0] ??
    sfxAssets.find((asset) => !usedIds.has(asset.id)) ??
    sfxAssets[0] ??
    null
  );
}

function usedSfxIds(
  reactions: MatchedReaction[],
  commentIndex: number
): Set<string> {
  return new Set(
    reactions.flatMap((reaction) => {
      if (reaction.commentIndex === commentIndex) {
        return [];
      }
      return sfxList(reaction).map((item) => item.id);
    })
  );
}

function clipFileForTarget(
  target: TimelineAssetTarget,
  clips: TimelineAssetClipRef[] | undefined
): string | undefined {
  if (!("clipId" in target) || !target.clipId) {
    return undefined;
  }
  return clips?.find((clip) => clip.id === target.clipId)?.file;
}

function overlaySlotIndex(
  target: Extract<TimelineAssetTarget, { commentIndex: number }>,
  clips: TimelineAssetClipRef[] | undefined
): number {
  if (!target.clipId || !clips?.length) {
    return -1;
  }
  const siblings = clips
    .filter(
      (clip) =>
        clip.trackId === target.kind &&
        clip.commentIndex === target.commentIndex
    )
    .sort(
      (left, right) =>
        (left.start ?? 0) - (right.start ?? 0) ||
        left.id.localeCompare(right.id)
    );
  if (siblings.length === 0) {
    return -1;
  }
  return siblings.findIndex((clip) => clip.id === target.clipId);
}

function mediaKindForTarget(
  kind: "meme" | "video" | "sfx"
): Asset["mediaKind"] | undefined {
  if (kind === "video") {
    return "video";
  }
  if (kind === "meme") {
    return "image";
  }
  return undefined;
}

function indexOfMatchingAsset(
  items: Asset[],
  file: string | undefined,
  mediaKind?: Asset["mediaKind"]
): number {
  return items.findIndex((item) => {
    if (mediaKind && item.mediaKind !== mediaKind) {
      return false;
    }
    if (!file) {
      return true;
    }
    return overlayFilesMatch(item.file, file);
  });
}

function topicPostMemes(
  analysis: ThreadAnalysis | undefined,
  assets: Asset[]
): Asset[] {
  const ids = [
    analysis?.topicPostMemeId,
    ...(analysis?.topicPostExtraMemeIds ?? [])
  ].filter((id): id is string => Boolean(id));
  return ids.flatMap((id) => {
    const asset = assets.find(
      (candidate) => candidate.id === id && candidate.type === "meme"
    );
    return asset ? [asset] : [];
  });
}

function topicPostSfx(
  analysis: ThreadAnalysis | undefined,
  assets: Asset[]
): Asset[] {
  const ids = [
    analysis?.topicPostSfxId,
    ...(analysis?.topicPostExtraSfxIds ?? [])
  ].filter((id): id is string => Boolean(id));
  return ids.flatMap((id) => {
    const asset = assets.find(
      (candidate) => candidate.id === id && candidate.type === "sfx"
    );
    return asset ? [asset] : [];
  });
}

function topicPostSelections(
  memes: Asset[],
  sfxs: Asset[]
): AssetAssignmentSelections {
  return {
    topicPostMemeId: memes[0]?.id ?? null,
    topicPostExtraMemeIds: memes.slice(1).map((item) => item.id),
    topicPostSfxId: sfxs[0]?.id ?? null,
    topicPostExtraSfxIds: sfxs.slice(1).map((item) => item.id)
  };
}

function applyListReplacement<T>(
  items: T[],
  index: number,
  next: T | null,
  append: boolean
): T[] {
  if (append) {
    return next ? [...items, next] : items;
  }
  if (index < 0) {
    return next ? [...items, next] : items;
  }
  if (!next) {
    return items.filter((_, itemIndex) => itemIndex !== index);
  }
  return items.map((item, itemIndex) =>
    itemIndex === index ? next : item
  );
}

function applyTopicPostReplacement(
  reactions: MatchedReaction[],
  analysis: ThreadAnalysis | undefined,
  assets: Asset[],
  target: Extract<TimelineAssetTarget, { commentIndex: number }>,
  assetId: string | null,
  clips?: TimelineAssetClipRef[]
): TimelineAssetReplacement {
  const memes = topicPostMemes(analysis, assets);
  const sfxs = topicPostSfx(analysis, assets);
  const file = clipFileForTarget(target, clips);
  const append = !target.clipId;
  const slot = overlaySlotIndex(target, clips);

  if (target.kind === "sfx") {
    const index = append
      ? -1
      : slot >= 0
        ? slot
        : indexOfMatchingAsset(sfxs, file);
    const next = assetId ? requireAsset(assets, assetId, "sfx") : null;
    return {
      reactions,
      selections: topicPostSelections(
        memes,
        applyListReplacement(sfxs, index, next, append)
      )
    };
  }

  const mediaKind = mediaKindForTarget(target.kind);
  const kindMemes = memes.filter((item) =>
    mediaKind ? item.mediaKind === mediaKind : true
  );
  const kindIndex = append
    ? -1
    : slot >= 0
      ? slot
      : indexOfMatchingAsset(kindMemes, file, mediaKind);
  const matched = kindIndex >= 0 ? kindMemes[kindIndex] : undefined;
  const index = matched
    ? memes.findIndex((item) => item === matched)
    : kindIndex;
  if (!assetId && !append && index < 0) {
    return { reactions };
  }
  const next = assetId
    ? requireAsset(assets, assetId, "meme", mediaKind)
    : null;
  return {
    reactions,
    selections: topicPostSelections(
      applyListReplacement(memes, index, next, append),
      sfxs
    )
  };
}

function maybeAssignFallbackSfx(
  reaction: MatchedReaction,
  reactions: MatchedReaction[],
  assets: Asset[],
  commentIndex: number,
  preferredCategory: string | undefined,
  addedImage: boolean
): void {
  if (!addedImage || sfxList(reaction).length > 0) {
    return;
  }
  const fallback = pickFallbackSfx(
    assets,
    preferredCategory,
    usedSfxIds(reactions, commentIndex)
  );
  if (fallback) {
    writeSfx(reaction, [fallback]);
  }
}

export function canRemoveTimelineAsset(
  target: TimelineAssetTarget
): boolean {
  return (
    target.kind === "meme" ||
    target.kind === "video" ||
    target.kind === "sfx" ||
    target.kind === "topic-meme" ||
    target.kind === "topic-title"
  );
}

export function applyTimelineAssetReplacement(
  reactions: MatchedReaction[],
  analysis: ThreadAnalysis | undefined,
  assets: Asset[],
  target: TimelineAssetTarget,
  assetId: string | null,
  clips?: TimelineAssetClipRef[]
): TimelineAssetReplacement {
  if (target.kind === "background") {
    if (!assetId) {
      throw new Error("Background cannot be removed from the timeline");
    }
    requireAsset(assets, assetId, "background");
    return {
      reactions,
      selections: { backgroundAssetId: assetId }
    };
  }
  if (target.kind === "music") {
    if (!assetId) {
      throw new Error("Music cannot be removed from the timeline");
    }
    requireAsset(assets, assetId, "music");
    return {
      reactions,
      selections: { musicAssetId: assetId }
    };
  }
  if (target.kind === "topic-title") {
    return {
      reactions,
      selections: { topicIntroEnabled: assetId !== null }
    };
  }
  if (target.kind === "topic-meme") {
    if (!assetId) {
      return {
        reactions,
        selections: { topicMemeId: null }
      };
    }
    requireAsset(assets, assetId, "meme");
    return {
      reactions,
      selections: { topicMemeId: assetId }
    };
  }

  if (!Number.isInteger(target.commentIndex) || target.commentIndex < -1) {
    throw new Error("Invalid comment index");
  }

  if (target.commentIndex === -1) {
    return applyTopicPostReplacement(
      reactions,
      analysis,
      assets,
      target,
      assetId,
      clips
    );
  }

  const reaction = ensureReaction(
    reactions,
    target.commentIndex,
    analysis
  );
  const event = analysis?.reactions.find(
    (item) => item.commentIndex === target.commentIndex
  );
  const file = clipFileForTarget(target, clips);
  const append = !target.clipId;
  const slot = overlaySlotIndex(target, clips);

  if (target.kind === "sfx") {
    const current = sfxList(reaction);
    const index = append
      ? -1
      : slot >= 0
        ? slot
        : indexOfMatchingAsset(current, file);
    const next = assetId ? requireAsset(assets, assetId, "sfx") : null;
    writeSfx(
      reaction,
      applyListReplacement(current, index, next, append)
    );
    return {
      reactions: upsertReaction(reactions, reaction)
    };
  }

  const mediaKind = mediaKindForTarget(target.kind);
  const current = memeList(reaction);
  const kindMemes = current.filter((item) =>
    mediaKind ? item.mediaKind === mediaKind : true
  );
  const kindIndex = append
    ? -1
    : slot >= 0
      ? slot
      : indexOfMatchingAsset(kindMemes, file, mediaKind);
  const matched = kindIndex >= 0 ? kindMemes[kindIndex] : undefined;
  const index = matched
    ? current.findIndex((item) => item === matched)
    : kindIndex;
  if (!assetId && !append && index < 0) {
    return { reactions };
  }
  const next = assetId
    ? requireAsset(assets, assetId, "meme", mediaKind)
    : null;
  const hadImage = current.some((item) => item.mediaKind === "image");
  writeMemes(
    reaction,
    applyListReplacement(current, index, next, append)
  );
  const addedImage =
    next?.mediaKind === "image" &&
    (append || !hadImage);
  maybeAssignFallbackSfx(
    reaction,
    reactions,
    assets,
    target.commentIndex,
    event?.sfxCategory ?? undefined,
    addedImage
  );
  if (
    reaction.animation === "none" &&
    reaction.meme?.mediaKind === "image"
  ) {
    reaction.animation = event?.animation ?? "none";
  }

  return {
    reactions: upsertReaction(reactions, reaction)
  };
}

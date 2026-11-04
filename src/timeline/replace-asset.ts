import type { Asset } from "../assets/library.js";
import type { MatchedReaction } from "../assets/matcher.js";
import type { ThreadAnalysis } from "../types.js";

export type TimelineAssetTarget =
  | { kind: "background" }
  | { kind: "music" }
  | { kind: "topic-title" }
  | { kind: "topic-meme" }
  | { kind: "meme"; commentIndex: number }
  | { kind: "video"; commentIndex: number }
  | { kind: "sfx"; commentIndex: number };

export interface AssetAssignmentSelections {
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;
  topicMemeId?: string | null;
  topicIntroEnabled?: boolean;
}

export interface TimelineAssetReplacement {
  reactions: MatchedReaction[];
  selections?: AssetAssignmentSelections;
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

function ensureReaction(
  reactions: MatchedReaction[],
  commentIndex: number,
  analysis: ThreadAnalysis | undefined
): MatchedReaction {
  const existing = reactions.find(
    (reaction) => reaction.commentIndex === commentIndex
  );
  if (existing) {
    return { ...existing };
  }
  const event = analysis?.reactions.find(
    (reaction) => reaction.commentIndex === commentIndex
  );
  return {
    commentIndex,
    emotion: event?.emotion ?? "neutral",
    meme: null,
    sfx: null,
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
    reactions.flatMap((reaction) =>
      reaction.commentIndex === commentIndex || !reaction.sfx
        ? []
        : [reaction.sfx.id]
    )
  );
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
  assetId: string | null
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

  if (!Number.isInteger(target.commentIndex) || target.commentIndex < 0) {
    throw new Error("Invalid comment index");
  }

  const reaction = ensureReaction(
    reactions,
    target.commentIndex,
    analysis
  );
  const event = analysis?.reactions.find(
    (item) => item.commentIndex === target.commentIndex
  );

  if (target.kind === "sfx") {
    if (!assetId) {
      reaction.sfx = null;
      return {
        reactions: upsertReaction(reactions, reaction)
      };
    }
    if (reaction.meme?.mediaKind === "video") {
      throw new Error("Video memes cannot use SFX");
    }
    reaction.sfx = requireAsset(assets, assetId, "sfx");
    return {
      reactions: upsertReaction(reactions, reaction)
    };
  }

  if (!assetId) {
    if (reaction.meme?.mediaKind === "video" && target.kind === "meme") {
      return { reactions };
    }
    if (reaction.meme?.mediaKind !== "video" && target.kind === "video") {
      return { reactions };
    }
    reaction.meme = null;
    if (target.kind === "video") {
      reaction.animation = "none";
    }
    return {
      reactions: upsertReaction(reactions, reaction)
    };
  }

  const mediaKind = target.kind === "video" ? "video" : "image";
  const meme = requireAsset(assets, assetId, "meme", mediaKind);
  reaction.meme = meme;

  if (mediaKind === "video") {
    reaction.sfx = null;
    reaction.animation = "none";
  } else {
    if (!reaction.sfx) {
      reaction.sfx = pickFallbackSfx(
        assets,
        event?.sfxCategory ?? undefined,
        usedSfxIds(reactions, target.commentIndex)
      );
    }
    if (reaction.animation === "none") {
      reaction.animation = event?.animation ?? "none";
    }
  }

  return {
    reactions: upsertReaction(reactions, reaction)
  };
}

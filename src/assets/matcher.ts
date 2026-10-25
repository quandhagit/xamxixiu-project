import type { Asset } from "./scanner.js";
import {
  findAsset,
  isSampleAsset
} from "./library.js";
import type {
  ReactionAnimation,
  ReactionEmotion,
  ThreadAnalysis
} from "../types.js";

export interface MatchedReaction {
  commentIndex: number;
  emotion: ReactionEmotion;
  meme: Asset | null;
  sfx: Asset | null;
  animation: ReactionAnimation;
  duration: number;
}

function selectableOfType(
  assets: Asset[],
  type: Asset["type"]
): Asset[] {
  return assets.filter(
    (asset) => asset.type === type && !isSampleAsset(asset)
  );
}

function tagOverlap(left: Asset, right: Asset): number {
  const tags = new Set(left.tags);
  return right.tags.filter((tag) => tags.has(tag)).length;
}

function pickUnusedAsset(
  candidates: Asset[],
  usedIds: Set<string>,
  allowReuse: boolean
): Asset | null {
  if (candidates.length === 0) {
    return null;
  }

  const unused = candidates.filter(
    (asset) => !usedIds.has(asset.id)
  );

  if (unused.length > 0) {
    const asset =
      unused[Math.floor(Math.random() * unused.length)];
    usedIds.add(asset.id);
    return asset;
  }

  if (!allowReuse) {
    return null;
  }

  const asset =
    candidates[Math.floor(Math.random() * candidates.length)];
  usedIds.add(asset.id);
  return asset;
}

function pickRequestedAsset(options: {
  requestedId: string | null | undefined;
  category: string | null | undefined;
  type: Asset["type"];
  assets: Asset[];
  usedIds: Set<string>;
  allowReuse: boolean;
}): Asset | null {
  const pool = selectableOfType(options.assets, options.type);
  const requested = options.requestedId
    ? findAsset(pool, {
      id: options.requestedId,
      type: options.type
    })
    : undefined;

  if (requested && !options.usedIds.has(requested.id)) {
    options.usedIds.add(requested.id);
    return requested;
  }

  if (requested && options.usedIds.has(requested.id)) {
    const sameKind = pool.filter(
      (asset) => asset.mediaKind === requested.mediaKind
    );
    const tagged = sameKind.filter(
      (asset) => tagOverlap(requested, asset) > 0
    );
    const sameCategory = sameKind.filter(
      (asset) => asset.category === requested.category
    );
    return pickUnusedAsset(tagged, options.usedIds, false) ??
      pickUnusedAsset(sameCategory, options.usedIds, false) ??
      pickUnusedAsset(sameKind, options.usedIds, false);
  }

  if (options.requestedId) {
    return null;
  }

  if (!options.category) {
    return null;
  }

  return pickUnusedAsset(
    pool.filter((asset) => asset.category === options.category),
    options.usedIds,
    options.allowReuse
  );
}

export function matchReactions(
  analysis: ThreadAnalysis,
  assets: Asset[]
): MatchedReaction[] {
  const usedMemeIds = new Set<string>();
  const usedSfxIds = new Set<string>();

  return analysis.reactions.map((reaction) => {
    let meme = pickRequestedAsset({
      requestedId: reaction.memeAssetId,
      category: reaction.memeCategory,
      type: "meme",
      assets,
      usedIds: usedMemeIds,
      allowReuse: false
    });

    const sfx = meme?.mediaKind === "video"
      ? null
      : pickRequestedAsset({
        requestedId: reaction.sfxAssetId,
        category: reaction.sfxCategory,
        type: "sfx",
        assets,
        usedIds: usedSfxIds,
        allowReuse: true
      });

    if (meme?.mediaKind === "image" && !sfx) {
      meme = null;
    }

    return {
      commentIndex: reaction.commentIndex,
      emotion: reaction.emotion,
      meme,
      sfx,
      animation: "none",
      duration: 1
    };
  });
}

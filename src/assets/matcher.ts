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
import {
  comboFromEmotion,
  comboToReactionAnimation,
  findCombo,
  getBuiltinCombo,
  isBuiltInComboId
} from "../timeline/meme-combo.js";
import { pickScoredAsset } from "./score-asset.js";

export interface MatchedReaction {
  commentIndex: number;
  emotion: ReactionEmotion;
  meme: Asset | null;
  sfx: Asset | null;
  animation: ReactionAnimation;
  duration: number;
  comboId?: string;
  comboLocked?: boolean;
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
  allowReuse: boolean,
  query?: string
): Asset | null {
  if (candidates.length === 0) {
    return null;
  }
  if (query?.trim()) {
    return pickScoredAsset(candidates, usedIds, query, allowReuse);
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
  query?: string;
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
    return pickUnusedAsset(tagged, options.usedIds, false, options.query) ??
      pickUnusedAsset(sameCategory, options.usedIds, false, options.query) ??
      pickUnusedAsset(sameKind, options.usedIds, false, options.query);
  }

  if (options.category) {
    const byCategory = pickUnusedAsset(
      pool.filter((asset) => asset.category === options.category),
      options.usedIds,
      options.allowReuse,
      options.query
    );
    if (byCategory) {
      return byCategory;
    }
  }

  if (!options.requestedId && !options.category) {
    return null;
  }

  return pickUnusedAsset(
    pool,
    options.usedIds,
    options.allowReuse,
    options.query
  );
}

export function matchReactions(
  analysis: ThreadAnalysis,
  assets: Asset[],
  previous: MatchedReaction[] = []
): MatchedReaction[] {
  const usedMemeIds = new Set<string>();
  const usedSfxIds = new Set<string>();
  const previousByIndex = new Map(
    previous.map((item) => [item.commentIndex, item])
  );
  let previousPunch = false;

  return analysis.reactions.map((reaction) => {
    const query = [reaction.emotion, reaction.memeCategory, reaction.sfxCategory]
      .filter((value) => value && value !== "neutral")
      .join(" ");
    let meme = pickRequestedAsset({
      requestedId: reaction.memeAssetId,
      category: reaction.memeCategory,
      type: "meme",
      assets,
      usedIds: usedMemeIds,
      allowReuse: false,
      query
    });

    let sfx = meme?.mediaKind === "video"
      ? null
      : pickRequestedAsset({
        requestedId: reaction.sfxAssetId,
        category: reaction.sfxCategory,
        type: "sfx",
        assets,
        usedIds: usedSfxIds,
        allowReuse: true,
        query
      });

    if (meme?.mediaKind === "image" && !sfx) {
      sfx = pickUnusedAsset(
        selectableOfType(assets, "sfx"),
        usedSfxIds,
        true,
        query
      );
    }
    if (meme?.mediaKind === "image" && !sfx) {
      meme = null;
    }

    const prior = previousByIndex.get(reaction.commentIndex);
    const keepCombo =
      Boolean(prior?.comboLocked && prior.comboId) &&
      meme?.mediaKind !== "video";
    const requestedComboId = reaction.comboId;
    const namedCombo =
      !keepCombo &&
      requestedComboId &&
      requestedComboId !== "none" &&
      isBuiltInComboId(requestedComboId)
        ? getBuiltinCombo(requestedComboId)
        : undefined;
    const chosen = keepCombo
      ? (findCombo(prior?.comboId) ?? getBuiltinCombo("none"))
      : namedCombo ?? comboFromEmotion(reaction.emotion, {
          isVideo: meme?.mediaKind === "video" || !meme,
          previousPunch
        });
    const comboId = keepCombo
      ? (prior?.comboId ?? "none")
      : meme
        ? chosen.id
        : "none";
    const applied =
      comboId === "none" ? getBuiltinCombo("none") : chosen;
    if (comboId === "punch") {
      previousPunch = true;
    } else if (meme) {
      previousPunch = false;
    }

    return {
      commentIndex: reaction.commentIndex,
      emotion: reaction.emotion,
      meme,
      sfx,
      animation: comboToReactionAnimation(applied.animation),
      duration: Math.max(1, applied.minDuration),
      comboId,
      comboLocked: prior?.comboLocked
    };
  });
}

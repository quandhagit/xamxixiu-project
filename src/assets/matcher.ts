import type { Asset } from "./scanner.js";
import type {
  ReactionAnimation,
  ReactionEmotion,
  ReactionEvent,
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

function pickUnusedAsset(
  candidates: Asset[],
  usedIds: Set<string>
): Asset | null {
  if (candidates.length === 0) {
    return null;
  }

  const unused = candidates.filter(
    asset => !usedIds.has(asset.id)
  );

  const pool = unused.length > 0 ? unused : candidates;

  const asset =
    pool[Math.floor(Math.random() * pool.length)];

  usedIds.add(asset.id);

  return asset;
}

function pickRequestedAsset(
  requestedId: string | null | undefined,
  candidates: Asset[],
  allAssets: Asset[],
  usedIds: Set<string>
): Asset | null {
  if (requestedId) {
    const requested = allAssets.find(
      asset => asset.id === requestedId
    );

    if (requested && !usedIds.has(requested.id)) {
      usedIds.add(requested.id);
      return requested;
    }
  }

  return pickUnusedAsset(candidates, usedIds);
}

export function matchReactions(
  analysis: ThreadAnalysis,
  assets: Asset[]
): MatchedReaction[] {
  const memeAssets = assets.filter(
    asset => asset.type === "meme"
  );

  const sfxAssets = assets.filter(
    asset => asset.type === "sfx"
  );

  const usedMemeIds = new Set<string>();
  const usedSfxIds = new Set<string>();

  return analysis.reactions.map(reaction => {
    const memeCandidates = reaction.memeCategory
      ? memeAssets.filter(
        asset =>
          asset.category === reaction.memeCategory
      )
      : [];

    const sfxCandidates = reaction.sfxCategory
      ? sfxAssets.filter(
        asset =>
          asset.category === reaction.sfxCategory
      )
      : [];

    let meme = pickRequestedAsset(
      reaction.memeAssetId,
      memeCandidates,
      memeAssets,
      usedMemeIds
    );

    const sfx = meme?.mediaKind === "video"
      ? null
      : pickRequestedAsset(
        reaction.sfxAssetId,
        sfxCandidates,
        sfxAssets,
        usedSfxIds
      );

    // Image memes must have an accompanying SFX. If the requested SFX is
    // missing, drop the image instead of producing an invalid reaction.
    if (meme?.mediaKind === "image" && !sfx) {
      meme = null;
    }

    return {
      commentIndex: reaction.commentIndex,
      emotion: reaction.emotion,
      meme,
      sfx,
      animation: meme?.mediaKind === "image"
        ? reaction.animation
        : "none",
      duration: reaction.duration
    };
  });
}
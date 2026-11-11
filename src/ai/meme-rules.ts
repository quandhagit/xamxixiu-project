import type { ReactionEvent, ThreadAnalysis } from "../types.js";

export function hasMemeOrVideo(
  reaction: Pick<ReactionEvent, "memeAssetId" | "memeCategory">
): boolean {
  return Boolean(reaction.memeAssetId || reaction.memeCategory);
}

export function applyMiddleCommentTransitionSfx(
  analysis: ThreadAnalysis,
  includedIndexes: number[],
  transitionSfxIds: string[]
): void {
  if (includedIndexes.length < 3) {
    return;
  }

  const first = includedIndexes[0];
  const last = includedIndexes[includedIndexes.length - 1];
  const reactionsByIndex = new Map(
    analysis.reactions.map((reaction) => [
      reaction.commentIndex,
      reaction
    ])
  );
  let transitionCursor = 0;

  function nextTransitionSfxId(): string | null {
    if (transitionSfxIds.length === 0) {
      return null;
    }
    const id = transitionSfxIds[transitionCursor % transitionSfxIds.length];
    transitionCursor += 1;
    return id;
  }

  for (const commentIndex of includedIndexes) {
    if (commentIndex === first || commentIndex === last) {
      continue;
    }

    const existing = reactionsByIndex.get(commentIndex);

    if (!existing) {
      analysis.reactions.push({
        commentIndex,
        emotion: "neutral",
        memeAssetId: null,
        memeCategory: null,
        sfxAssetId: nextTransitionSfxId(),
        sfxCategory: "transition",
        animation: "none",
        duration: 1
      });
      continue;
    }

    if (!hasMemeOrVideo(existing)) {
      existing.memeAssetId = null;
      existing.memeCategory = null;
      existing.sfxCategory = "transition";
      existing.sfxAssetId =
        existing.sfxAssetId &&
        transitionSfxIds.includes(existing.sfxAssetId)
          ? existing.sfxAssetId
          : nextTransitionSfxId();
    }
  }
}

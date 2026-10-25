import type {
  ThreadAnalysis,
  ThreadData
} from "../types.js";

/**
 * True when analysis.json no longer matches the comments that are currently
 * included: a reaction points at an excluded comment, or a comment between
 * the first and last included ones has no reaction (Analyze always creates
 * one for those).
 */
export function isAnalysisStale(
  content: Pick<ThreadData, "comments">,
  analysis: Pick<ThreadAnalysis, "reactions">
): boolean {
  const comments = content.comments;
  const reactionIndexes = new Set(
    analysis.reactions.map(
      (reaction) => reaction.commentIndex
    )
  );
  const included = comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => !comment.excluded)
    .map(({ index }) => index);

  for (const index of reactionIndexes) {
    if (
      index < 0 ||
      index >= comments.length ||
      comments[index].excluded
    ) {
      return true;
    }
  }

  return included
    .slice(1, -1)
    .some((index) => !reactionIndexes.has(index));
}

import type { MatchedReaction } from "../assets/matcher.js";
import type { ThreadAnalysis } from "../types.js";
import {
  cloneTimelineProject,
  recomputeTotalDuration,
  type TimelineProject
} from "./project.js";
import { isCommentMemeOrSfxClip } from "./comment-overlay-clips.js";

export function clearCommentMemesAndSfx(
  project: TimelineProject
): TimelineProject {
  const next = cloneTimelineProject(project);
  next.clips = next.clips.filter((clip) => !isCommentMemeOrSfxClip(clip));
  return recomputeTotalDuration(next);
}

export function clearCommentReactionAssets(
  reactions: MatchedReaction[]
): MatchedReaction[] {
  return reactions.map((reaction) => ({
    ...reaction,
    meme: null,
    sfx: null,
    animation: "none",
    comboId: "none",
    comboLocked: false
  }));
}

export function clearCommentAnalysisAssets(
  analysis: ThreadAnalysis
): ThreadAnalysis {
  return {
    ...analysis,
    reactions: analysis.reactions.map((reaction) => ({
      ...reaction,
      memeAssetId: null,
      memeCategory: null,
      sfxAssetId: null,
      sfxCategory: null,
      comboId: "none",
      animation: "none"
    }))
  };
}

import type { MatchedReaction } from "../assets/matcher.js";
import type { ThreadAnalysis } from "../types.js";
import {
  cloneTimelineProject,
  recomputeTotalDuration,
  type TimelineProject
} from "./project.js";
import { isBulkClearableOverlayClip } from "./comment-overlay-clips.js";
import { TOPIC_POST_COMMENT_INDEX } from "./topic-constants.js";

export interface ClearedOverlayKinds {
  meme: boolean;
  sfx: boolean;
}

export function collectClearedOverlayKinds(
  project: TimelineProject
): Map<number, ClearedOverlayKinds> {
  const kinds = new Map<number, ClearedOverlayKinds>();
  for (const clip of project.clips) {
    if (!isBulkClearableOverlayClip(clip)) {
      continue;
    }
    if (typeof clip.commentIndex !== "number") {
      continue;
    }
    const current = kinds.get(clip.commentIndex) ?? {
      meme: false,
      sfx: false
    };
    if (clip.trackId === "meme" || clip.trackId === "video") {
      current.meme = true;
    }
    if (clip.trackId === "sfx") {
      current.sfx = true;
    }
    kinds.set(clip.commentIndex, current);
  }
  return kinds;
}

export function clearCommentMemesAndSfx(
  project: TimelineProject
): TimelineProject {
  const next = cloneTimelineProject(project);
  next.clips = next.clips.filter(
    (clip) => !isBulkClearableOverlayClip(clip)
  );
  return recomputeTotalDuration(next);
}

export function clearCommentReactionAssets(
  reactions: MatchedReaction[],
  kinds: Map<number, ClearedOverlayKinds> = new Map()
): MatchedReaction[] {
  return reactions.map((reaction) => {
    const cleared = kinds.get(reaction.commentIndex);
    if (!cleared) {
      return reaction;
    }
    return {
      ...reaction,
      meme: cleared.meme ? null : reaction.meme,
      sfx: cleared.sfx ? null : reaction.sfx
    };
  });
}

export function clearCommentAnalysisAssets(
  analysis: ThreadAnalysis,
  kinds: Map<number, ClearedOverlayKinds> = new Map()
): ThreadAnalysis {
  const topicPost = kinds.get(TOPIC_POST_COMMENT_INDEX);
  return {
    ...analysis,
    topicPostMemeId: topicPost?.meme ? null : analysis.topicPostMemeId,
    topicPostSfxId: topicPost?.sfx ? null : analysis.topicPostSfxId,
    reactions: analysis.reactions.map((reaction) => {
      const cleared = kinds.get(reaction.commentIndex);
      if (!cleared) {
        return reaction;
      }
      return {
        ...reaction,
        memeAssetId: cleared.meme ? null : reaction.memeAssetId,
        memeCategory: cleared.meme ? null : reaction.memeCategory,
        sfxAssetId: cleared.sfx ? null : reaction.sfxAssetId,
        sfxCategory: cleared.sfx ? null : reaction.sfxCategory
      };
    })
  };
}

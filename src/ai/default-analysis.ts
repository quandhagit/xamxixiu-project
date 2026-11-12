import type {
  ReactionEvent,
  ThreadAnalysis,
  ThreadData
} from "../types.js";

const DEFAULT_VOICE = "ngoc-huyen";

export function emptyReaction(commentIndex: number): ReactionEvent {
  return {
    commentIndex,
    emotion: "neutral",
    memeCategory: null,
    sfxCategory: null,
    memeAssetId: null,
    sfxAssetId: null,
    animation: "none",
    duration: 1,
    voiceId: DEFAULT_VOICE
  };
}

export function createDefaultAnalysis(
  content: Pick<ThreadData, "comments" | "topicTitle">,
  existing?: Partial<ThreadAnalysis>
): ThreadAnalysis {
  const previous = new Map(
    (existing?.reactions ?? []).map((reaction) => [
      reaction.commentIndex,
      reaction
    ])
  );
  const reactions = content.comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => !comment.excluded)
    .map(
      ({ index }) => previous.get(index) ?? emptyReaction(index)
    );

  return {
    tone: existing?.tone ?? "casual",
    topicType: existing?.topicType ?? "other",
    intensity: existing?.intensity ?? 0.5,
    musicType: existing?.musicType ?? "neutral",
    topicTitle: existing?.topicTitle ?? content.topicTitle ?? "",
    topicVoiceId: existing?.topicVoiceId ?? DEFAULT_VOICE,
    topicTitleVoiceId: existing?.topicTitleVoiceId ?? DEFAULT_VOICE,
    topicMemeId: existing?.topicMemeId ?? null,
    topicPostMemeId: existing?.topicPostMemeId ?? null,
    topicPostSfxId: existing?.topicPostSfxId ?? null,
    backgroundAssetId: existing?.backgroundAssetId,
    musicAssetId: existing?.musicAssetId,
    topicIntroEnabled: existing?.topicIntroEnabled ?? true,
    topicTitleVoiceMode: existing?.topicTitleVoiceMode,
    reactions
  };
}

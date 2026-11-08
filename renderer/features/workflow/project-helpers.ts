import type {
  AudioFailureTarget,
  ThreadAnalysis
} from "../../../src/types";
import type { ProjectSummary } from "../../../src/project/store";

export function identityImageSlots(
  count: number
): number[] {
  return Array.from(
    { length: count },
    (_value, index) => index
  );
}

export function formatProjectId(
  project: ProjectSummary
): string {
  return project.id.replace(
    /-thread$/,
    ""
  );
}

export function withVoiceAssignment(
  analysis: ThreadAnalysis,
  target: AudioFailureTarget,
  voiceId: string
): ThreadAnalysis {
  if (target === "topic") {
    return {
      ...analysis,
      topicVoiceId: voiceId
    };
  }

  if (target === "topic-title") {
    return {
      ...analysis,
      topicTitleVoiceId: voiceId
    };
  }

  return {
    ...analysis,
    reactions: analysis.reactions.map(
      (reaction) =>
        `comment-${reaction.commentIndex}` === target
          ? {
              ...reaction,
              voiceId
            }
          : reaction
    )
  };
}

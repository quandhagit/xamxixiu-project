import { emptyReaction } from "../../../src/ai/default-analysis";
import {
  DEFAULT_CAPTURE_VIEWPORT,
  parseCaptureViewport,
  type AudioFailureTarget,
  type CaptureViewport,
  type ThreadAnalysis
} from "../../../src/types";
import type {
  ProjectState,
  ProjectSummary
} from "../../../src/project/store";

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

export function projectSourceUrl(
  project?: Pick<ProjectState, "content" | "thread">
): string {
  return (
    project?.content?.url ??
    project?.thread?.url ??
    ""
  ).trim();
}

export function projectCaptureViewport(
  project?: Pick<ProjectState, "content" | "thread">
): CaptureViewport {
  return parseCaptureViewport(
    project?.content?.viewport ??
      project?.thread?.viewport ??
      DEFAULT_CAPTURE_VIEWPORT
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

  const match = /^comment-(\d+)$/.exec(target);
  if (!match) {
    return analysis;
  }

  const commentIndex = Number(match[1]);
  let found = false;
  const reactions = analysis.reactions.map((reaction) => {
    if (reaction.commentIndex !== commentIndex) {
      return reaction;
    }
    found = true;
    return {
      ...reaction,
      voiceId
    };
  });

  if (!found) {
    reactions.push({
      ...emptyReaction(commentIndex),
      voiceId
    });
    reactions.sort(
      (left, right) => left.commentIndex - right.commentIndex
    );
  }

  return {
    ...analysis,
    reactions
  };
}

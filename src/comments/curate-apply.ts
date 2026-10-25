import type {
  CommentCurationKind,
  ThreadComment,
  ThreadData
} from "../types.js";
import { CURATE_KEEP_MIN } from "./comment-constants.js";
import {
  buildCommentForest,
  orderByRoots,
  rootIndexOf
} from "./order.js";

export const CURATION_KINDS: CommentCurationKind[] = [
  "duplicate",
  "off-topic",
  "low-energy",
  "too-long",
  "spam"
];

export interface CurationKeep {
  commentIndex: number;
  reason?: string;
}

export interface CurationExclude {
  commentIndex: number;
  reason?: string;
  kind?: CommentCurationKind;
}

export interface CurationResult {
  keep: CurationKeep[];
  exclude: CurationExclude[];
  /** Desired reading order of the kept comments (comment indexes). */
  order: number[];
}

export interface CurationSummary {
  kept: number;
  excluded: number;
}

const CONTEXT_REASON = "Giữ làm ngữ cảnh cho reply được giữ";
const TOP_UP_REASON = "Bổ sung để đủ số lượng tối thiểu";

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanReason(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 200) : undefined;
}

/**
 * Validates the raw AI response. Throws when it is malformed or refers to a
 * comment that does not exist, so nothing is changed on bad output.
 */
export function parseCurationResult(
  raw: unknown,
  commentCount: number
): CurationResult {
  if (!isRecord(raw)) {
    throw new Error("Curate response must be a JSON object.");
  }

  const keepRaw = raw.keep ?? [];
  const excludeRaw = raw.exclude ?? [];
  const orderRaw = raw.order ?? [];

  if (
    !Array.isArray(keepRaw) ||
    !Array.isArray(excludeRaw) ||
    !Array.isArray(orderRaw)
  ) {
    throw new Error(
      "Curate response must contain keep, exclude and order arrays."
    );
  }

  function readIndex(item: unknown): number {
    return checkIndex(
      isRecord(item) ? item.commentIndex : undefined
    );
  }

  function checkIndex(index: unknown): number {
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= commentCount
    ) {
      throw new Error(
        `Curate response refers to an invalid commentIndex: ${String(index)}`
      );
    }

    return index;
  }

  const keep: CurationKeep[] = keepRaw.map((item) => ({
    commentIndex: readIndex(item),
    reason: cleanReason(
      isRecord(item) ? item.reason : undefined
    )
  }));

  const exclude: CurationExclude[] = excludeRaw.map(
    (item) => {
      const kind = isRecord(item) ? item.kind : undefined;

      return {
        commentIndex: readIndex(item),
        reason: cleanReason(
          isRecord(item) ? item.reason : undefined
        ),
        kind:
          typeof kind === "string" &&
          (CURATION_KINDS as string[]).includes(kind)
            ? (kind as CommentCurationKind)
            : undefined
      };
    }
  );

  const order = orderRaw.map(checkIndex);

  return { keep, exclude, order };
}

/**
 * Permutation (new index -> old index) that puts threads in the AI's reading
 * order. A thread is a top-level comment with its replies; replies stay
 * directly after their parent. Threads with at least one included comment
 * come first (ordered by where the AI listed them, unlisted ones after, in
 * their current order); fully excluded threads go last.
 */
export function computeCuratedOrder(
  comments: ThreadComment[],
  aiOrder: number[]
): number[] {
  const rank = new Map<number, number>();

  aiOrder.forEach((index, position) => {
    const root = rootIndexOf(comments, index);

    if (!rank.has(root)) {
      rank.set(root, position);
    }
  });

  const keptRoots = new Set<number>();

  comments.forEach((comment, index) => {
    if (!comment.excluded) {
      keptRoots.add(rootIndexOf(comments, index));
    }
  });

  const roots = buildCommentForest(comments).map(
    (node) => node.index
  );
  const unranked = Number.MAX_SAFE_INTEGER;
  const kept = roots
    .filter((root) => keptRoots.has(root))
    .sort(
      (a, b) =>
        (rank.get(a) ?? unranked) -
          (rank.get(b) ?? unranked) || a - b
    );
  const excluded = roots.filter(
    (root) => !keptRoots.has(root)
  );

  return orderByRoots(comments, [...kept, ...excluded]);
}

/**
 * Applies a curation result to the content. Rules:
 * - comments the user decided by hand are never changed
 * - a kept reply keeps its parent comment for context
 * - at least CURATE_KEEP_MIN comments stay included (highest likes first)
 * - comments the AI did not mention stay included
 * Order is handled separately by computeCuratedOrder.
 */
export function applyCuration(
  content: ThreadData,
  result: CurationResult
): { content: ThreadData; summary: CurationSummary } {
  const comments = content.comments;

  const locked = (index: number): boolean =>
    comments[index].curation?.source === "user";

  const keepReasons = new Map<number, string | undefined>(
    result.keep.map((item) => [item.commentIndex, item.reason])
  );
  const excludeInfo = new Map<number, CurationExclude>(
    result.exclude.map((item) => [item.commentIndex, item])
  );

  // A comment listed in both arrays is treated as kept.
  const aiExcluded = new Set<number>();

  for (const index of excludeInfo.keys()) {
    if (!keepReasons.has(index) && !locked(index)) {
      aiExcluded.add(index);
    }
  }

  const reasons = new Map<number, string | undefined>();

  function isExcluded(index: number): boolean {
    return locked(index)
      ? comments[index].excluded === true
      : aiExcluded.has(index);
  }

  // Keep the parent of every kept reply.
  function keepParents(): void {
    let changed = true;

    while (changed) {
      changed = false;

      for (let index = 0; index < comments.length; index++) {
        const parent = comments[index].parentCommentIndex;

        if (
          parent === undefined ||
          parent < 0 ||
          parent >= comments.length ||
          isExcluded(index) ||
          !aiExcluded.has(parent)
        ) {
          continue;
        }

        aiExcluded.delete(parent);
        reasons.set(parent, CONTEXT_REASON);
        changed = true;
      }
    }
  }

  keepParents();

  // Enforce the minimum, preferring comments with the most likes.
  let keptCount = comments.filter(
    (_comment, index) => !isExcluded(index)
  ).length;

  if (keptCount < CURATE_KEEP_MIN) {
    const candidates = [...aiExcluded].sort(
      (a, b) => comments[b].likes - comments[a].likes
    );

    for (const index of candidates) {
      if (keptCount >= CURATE_KEEP_MIN) {
        break;
      }

      aiExcluded.delete(index);
      reasons.set(index, TOP_UP_REASON);
      keptCount += 1;
    }

    keepParents();
  }

  const nextComments = comments.map((comment, index) => {
    if (locked(index)) {
      return comment;
    }

    if (aiExcluded.has(index)) {
      const info = excludeInfo.get(index);

      return {
        ...comment,
        excluded: true,
        curation: {
          source: "ai" as const,
          ...(info?.reason ? { reason: info.reason } : {}),
          ...(info?.kind ? { kind: info.kind } : {})
        }
      };
    }

    const reason = reasons.has(index)
      ? reasons.get(index)
      : keepReasons.get(index);

    return {
      ...comment,
      excluded: false,
      curation: {
        source: "ai" as const,
        ...(reason ? { reason } : {})
      }
    };
  });

  const excludedCount = nextComments.filter(
    (comment) => comment.excluded
  ).length;

  return {
    content: { ...content, comments: nextComments },
    summary: {
      kept: nextComments.length - excludedCount,
      excluded: excludedCount
    }
  };
}

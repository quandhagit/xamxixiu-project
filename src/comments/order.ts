import type {
  ThreadComment
} from "../types.js";

interface CommentNode {
  index: number;
  parentIndex: number | undefined;
  children: CommentNode[];
}

function rawParentIndex(
  comments: ThreadComment[],
  index: number
): number | undefined {
  const parent = comments[index]?.parentCommentIndex;

  if (
    typeof parent !== "number" ||
    !Number.isInteger(parent)
  ) {
    return undefined;
  }

  if (
    parent < 0 ||
    parent >= comments.length ||
    parent === index
  ) {
    return undefined;
  }

  return parent;
}

function parentCreatesCycle(
  comments: ThreadComment[],
  index: number,
  parent: number
): boolean {
  const seen = new Set<number>([index]);
  let current: number | undefined = parent;

  while (current !== undefined) {
    if (seen.has(current)) {
      return true;
    }

    seen.add(current);
    current = rawParentIndex(comments, current);
  }

  return false;
}

function effectiveParentIndex(
  comments: ThreadComment[],
  index: number
): number | undefined {
  const parent = rawParentIndex(comments, index);

  if (
    parent === undefined ||
    parentCreatesCycle(comments, index, parent)
  ) {
    return undefined;
  }

  return parent;
}

export function buildCommentForest(
  comments: ThreadComment[]
): CommentNode[] {
  const nodes: CommentNode[] = comments.map(
    (_comment, index) => ({
      index,
      parentIndex: undefined,
      children: []
    })
  );
  const isChild = new Set<number>();

  for (let index = 0; index < comments.length; index++) {
    const parentIndex = effectiveParentIndex(
      comments,
      index
    );

    if (parentIndex === undefined) {
      continue;
    }

    nodes[index].parentIndex = parentIndex;
    nodes[parentIndex].children.push(nodes[index]);
    isChild.add(index);
  }

  return nodes.filter(
    (node) => !isChild.has(node.index)
  );
}

function flattenForest(
  forest: CommentNode[],
  commentCount: number
): number[] {
  const order: number[] = [];
  const visited = new Set<number>();

  const visit = (node: CommentNode): void => {
    if (visited.has(node.index)) {
      return;
    }

    visited.add(node.index);
    order.push(node.index);

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of forest) {
    visit(node);
  }

  for (let index = 0; index < commentCount; index++) {
    if (!visited.has(index)) {
      order.push(index);
      visited.add(index);
    }
  }

  return order;
}

function siblingList(
  forest: CommentNode[],
  index: number
): CommentNode[] | undefined {
  if (forest.some((node) => node.index === index)) {
    return forest;
  }

  for (const node of forest) {
    if (node.children.some((child) => child.index === index)) {
      return node.children;
    }

    const nested = siblingList(node.children, index);

    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function unchanged(
  comments: ThreadComment[],
  imageSlots: number[]
): {
  comments: ThreadComment[];
  imageSlots: number[];
} {
  return {
    comments: comments.slice(),
    imageSlots: imageSlots.slice()
  };
}

function cloneComment(
  source: ThreadComment,
  commentIndex: number,
  parentCommentIndex: number | undefined
): ThreadComment {
  const next: ThreadComment = {
    author: source.author,
    text: source.text,
    likes: source.likes,
    containerIndex: source.containerIndex,
    commentIndex
  };

  if (parentCommentIndex !== undefined) {
    next.parentCommentIndex = parentCommentIndex;
  }

  if (source.excluded !== undefined) {
    next.excluded = source.excluded;
  }

  if (source.originalText !== undefined) {
    next.originalText = source.originalText;
  }

  if (source.curation !== undefined) {
    next.curation = source.curation;
  }

  return next;
}

export function reorderComments(
  comments: ThreadComment[],
  imageSlots: number[],
  fromIndex: number,
  toIndex: number
): {
  comments: ThreadComment[];
  imageSlots: number[];
} {
  if (imageSlots.length !== comments.length) {
    throw new Error(
      `imageSlots length ${imageSlots.length} does not match comments length ${comments.length}`
    );
  }

  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= comments.length ||
    toIndex >= comments.length ||
    fromIndex === toIndex
  ) {
    return unchanged(comments, imageSlots);
  }

  const forest = buildCommentForest(comments);
  const fromSiblings = siblingList(forest, fromIndex);
  const toSiblings = siblingList(forest, toIndex);

  if (
    !fromSiblings ||
    fromSiblings !== toSiblings
  ) {
    return unchanged(comments, imageSlots);
  }

  const fromPosition = fromSiblings.findIndex(
    (node) => node.index === fromIndex
  );
  const toPosition = fromSiblings.findIndex(
    (node) => node.index === toIndex
  );

  if (fromPosition < 0 || toPosition < 0) {
    return unchanged(comments, imageSlots);
  }

  const [moved] = fromSiblings.splice(fromPosition, 1);

  if (!moved) {
    return unchanged(comments, imageSlots);
  }

  fromSiblings.splice(toPosition, 0, moved);

  const order = flattenForest(
    forest,
    comments.length
  );

  if (
    order.length !== comments.length ||
    new Set(order).size !== comments.length
  ) {
    throw new Error(
      "Could not reorder comments"
    );
  }

  return {
    comments: remapByOrder(comments, order),
    imageSlots: order.map(
      (oldIndex) => imageSlots[oldIndex]
    )
  };
}

/**
 * Rebuilds the comment list in a new order. `order[newIndex]` is the old
 * index of the comment that moves to `newIndex`. Parent links are remapped.
 */
function remapByOrder(
  comments: ThreadComment[],
  order: number[]
): ThreadComment[] {
  const oldToNew = new Map(
    order.map((oldIndex, newIndex) => [
      oldIndex,
      newIndex
    ])
  );
  const nextComments = order.map((oldIndex, newIndex) => {
    const source = comments[oldIndex];
    const parentOld = effectiveParentIndex(
      comments,
      oldIndex
    );
    const parentNew =
      parentOld === undefined
        ? undefined
        : oldToNew.get(parentOld);

    return cloneComment(
      source,
      newIndex,
      parentNew
    );
  });

  for (const comment of nextComments) {
    if (comment.parentCommentIndex === undefined) {
      continue;
    }

    const parent =
      nextComments[comment.parentCommentIndex];

    if (!parent) {
      delete comment.parentCommentIndex;
      continue;
    }

    parent.replies = [
      ...(parent.replies ?? []),
      {
        ...comment,
        replies: undefined
      }
    ];
  }

  return nextComments;
}

/** Index of the top-level comment that `index` belongs to. */
export function rootIndexOf(
  comments: ThreadComment[],
  index: number
): number {
  let current = index;

  for (let guard = 0; guard <= comments.length; guard++) {
    const parent = effectiveParentIndex(comments, current);

    if (parent === undefined) {
      return current;
    }

    current = parent;
  }

  return current;
}

/**
 * Returns a permutation (new index -> old index) that orders whole threads
 * (a top-level comment plus its replies) by `rootOrder`. Replies always
 * follow their parent. Roots missing from `rootOrder` keep their relative
 * order and go last.
 */
export function orderByRoots(
  comments: ThreadComment[],
  rootOrder: number[]
): number[] {
  const forest = buildCommentForest(comments);
  const byIndex = new Map(
    forest.map((node) => [node.index, node])
  );
  const sorted: CommentNode[] = [];
  const used = new Set<number>();

  for (const index of rootOrder) {
    const node = byIndex.get(index);

    if (node && !used.has(index)) {
      used.add(index);
      sorted.push(node);
    }
  }

  for (const node of forest) {
    if (!used.has(node.index)) {
      sorted.push(node);
    }
  }

  return flattenForest(sorted, comments.length);
}

/** Applies a permutation from `orderByRoots` (new index -> old index). */
export function reorderCommentsByOrder(
  comments: ThreadComment[],
  order: number[]
): ThreadComment[] {
  if (
    order.length !== comments.length ||
    new Set(order).size !== comments.length ||
    order.some(
      (value) =>
        !Number.isInteger(value) ||
        value < 0 ||
        value >= comments.length
    )
  ) {
    throw new Error("Invalid comment order");
  }

  return remapByOrder(comments, order);
}

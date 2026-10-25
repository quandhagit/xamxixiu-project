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

function findNode(
  forest: CommentNode[],
  index: number
): CommentNode | undefined {
  for (const node of forest) {
    if (node.index === index) {
      return node;
    }

    const nested = findNode(node.children, index);

    if (nested) {
      return nested;
    }
  }

  return undefined;
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

  const oldToNew = new Map(
    order.map((oldIndex, newIndex) => [
      oldIndex,
      newIndex
    ])
  );
  const nextComments = order.map((oldIndex, newIndex) => {
    const source = comments[oldIndex];
    const node = findNode(forest, oldIndex);
    const parentOld = node?.parentIndex;
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

  return {
    comments: nextComments,
    imageSlots: order.map(
      (oldIndex) => imageSlots[oldIndex]
    )
  };
}

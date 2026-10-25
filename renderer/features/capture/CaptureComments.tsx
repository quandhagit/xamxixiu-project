"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type {
  FormEvent,
  PointerEvent,
  ReactElement
} from "react";
import {
  buildCommentForest,
  reorderComments
} from "../../../src/comments/order";
import type {
  CommentCurationKind,
  ThreadComment
} from "../../../src/types";

type CommentFilter = "all" | "used" | "excluded";

const FILTER_LABELS: Record<CommentFilter, string> = {
  all: "Tất cả",
  used: "Được dùng",
  excluded: "Bị loại"
};

const KIND_LABELS: Record<CommentCurationKind, string> = {
  duplicate: "Trùng ý",
  "off-topic": "Lạc đề",
  "low-energy": "Nhạt",
  "too-long": "Quá dài",
  spam: "Spam"
};

const SCROLL_EDGE_PX = 88;
const SCROLL_MAX_PX = 28;

function findScrollParent(
  node: HTMLElement | null
): HTMLElement | null {
  let current = node;

  while (current) {
    const { overflowY } = getComputedStyle(current);
    const canScroll =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay";

    if (
      canScroll &&
      current.scrollHeight - current.clientHeight > 1
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function scrollAtPointer(
  scroller: HTMLElement,
  clientY: number
): void {
  const rect = scroller.getBoundingClientRect();
  const topZone = rect.top + SCROLL_EDGE_PX;
  const bottomZone = rect.bottom - SCROLL_EDGE_PX;

  if (clientY < topZone) {
    const intensity = Math.min(
      1,
      (topZone - clientY) / SCROLL_EDGE_PX
    );
    scroller.scrollTop -= Math.ceil(
      6 + intensity * SCROLL_MAX_PX
    );
    return;
  }

  if (clientY > bottomZone) {
    const intensity = Math.min(
      1,
      (clientY - bottomZone) / SCROLL_EDGE_PX
    );
    scroller.scrollTop += Math.ceil(
      6 + intensity * SCROLL_MAX_PX
    );
  }
}

function commentIndexAtPoint(
  clientX: number,
  clientY: number
): number | null {
  const node = document.elementFromPoint(
    clientX,
    clientY
  );

  if (!(node instanceof Element)) {
    return null;
  }

  const card = node.closest("[data-comment-index]");

  if (!(card instanceof HTMLElement)) {
    return null;
  }

  const index = Number(card.dataset.commentIndex);

  return Number.isInteger(index) ? index : null;
}

type CommentNode = ReturnType<
  typeof buildCommentForest
>[number];

interface CaptureCommentsProps {
  comments: ThreadComment[];
  imageSlots: number[];
  assets: Record<string, string>;
  addLoading: boolean;
  onChange: (
    comments: ThreadComment[],
    imageSlots: number[]
  ) => void;
  onAdd: (url: string) => void;
}

function orderMoves(
  comments: ThreadComment[],
  imageSlots: number[],
  fromIndex: number,
  toIndex: number
): boolean {
  try {
    const next = reorderComments(
      comments,
      imageSlots,
      fromIndex,
      toIndex
    );

    return next.comments.some(
      (comment, commentIndex) =>
        comment !== comments[commentIndex]
    );
  } catch {
    return false;
  }
}

export function CaptureComments({
  comments,
  imageSlots,
  assets,
  addLoading,
  onChange,
  onAdd
}: CaptureCommentsProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef(comments);
  const imageSlotsRef = useRef(imageSlots);
  const onChangeRef = useRef(onChange);
  const dragIndexRef = useRef<number | null>(null);
  const pointerRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{
    node: HTMLElement;
    top: number;
  } | null>(null);
  const [replyUrl, setReplyUrl] = useState("");
  const [filter, setFilter] =
    useState<CommentFilter>("all");
  const [draggingIndex, setDraggingIndex] =
    useState<number | null>(null);
  const [overIndex, setOverIndex] =
    useState<number | null>(null);
  const forest = buildCommentForest(comments);

  commentsRef.current = comments;
  imageSlotsRef.current = imageSlots;
  onChangeRef.current = onChange;

  function rememberScroll(): void {
    const scroller = findScrollParent(listRef.current);

    if (!scroller) {
      pendingScrollRef.current = null;
      return;
    }

    pendingScrollRef.current = {
      node: scroller,
      top: scroller.scrollTop
    };
  }

  function restoreScroll(): void {
    const pending = pendingScrollRef.current;

    if (!pending) {
      return;
    }

    pending.node.scrollTop = pending.top;
  }

  useLayoutEffect(() => {
    if (!pendingScrollRef.current) {
      return;
    }

    restoreScroll();
    pendingScrollRef.current = null;
  }, [comments, imageSlots]);

  function stopAutoScroll(): void {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function updateOverIndex(
    clientX: number,
    clientY: number
  ): void {
    const fromIndex = dragIndexRef.current;
    const nextOver = commentIndexAtPoint(
      clientX,
      clientY
    );

    if (
      fromIndex === null ||
      nextOver === null ||
      !orderMoves(
        commentsRef.current,
        imageSlotsRef.current,
        fromIndex,
        nextOver
      )
    ) {
      overIndexRef.current = null;
      setOverIndex(null);
      return;
    }

    overIndexRef.current = nextOver;
    setOverIndex(nextOver);
  }

  function finishDrag(shouldDrop: boolean): void {
    const fromIndex = dragIndexRef.current;
    const toIndex = overIndexRef.current;

    rememberScroll();
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }

    dragIndexRef.current = null;
    pointerRef.current = null;
    overIndexRef.current = null;
    stopAutoScroll();
    setDraggingIndex(null);
    setOverIndex(null);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");

    if (
      !shouldDrop ||
      fromIndex === null ||
      toIndex === null
    ) {
      pendingScrollRef.current = null;
      return;
    }

    try {
      const next = reorderComments(
        commentsRef.current,
        imageSlotsRef.current,
        fromIndex,
        toIndex
      );
      const moved = next.comments.some(
        (comment, commentIndex) =>
          comment !== commentsRef.current[commentIndex]
      );

      if (!moved) {
        pendingScrollRef.current = null;
        return;
      }

      onChangeRef.current(
        next.comments,
        next.imageSlots
      );
    } catch {
      pendingScrollRef.current = null;
    }
  }

  function startAutoScroll(): void {
    if (scrollFrameRef.current !== null) {
      return;
    }

    const tick = (): void => {
      const pointer = pointerRef.current;
      const scroller = findScrollParent(listRef.current);

      if (pointer && scroller) {
        scrollAtPointer(scroller, pointer.y);
        updateOverIndex(pointer.x, pointer.y);
      }

      scrollFrameRef.current = requestAnimationFrame(tick);
    };

    scrollFrameRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent): void {
      if (dragIndexRef.current === null) {
        return;
      }

      pointerRef.current = {
        x: event.clientX,
        y: event.clientY
      };
      updateOverIndex(event.clientX, event.clientY);
    }

    function handlePointerUp(): void {
      if (dragIndexRef.current === null) {
        return;
      }

      finishDrag(true);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (
        event.key === "Escape" &&
        dragIndexRef.current !== null
      ) {
        finishDrag(false);
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (dragIndexRef.current === null) {
        return;
      }

      const scroller = findScrollParent(listRef.current);

      if (!scroller) {
        return;
      }

      event.preventDefault();
      scroller.scrollTop += event.deltaY;
      const pointer = pointerRef.current;

      if (pointer) {
        updateOverIndex(pointer.x, pointer.y);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        "wheel",
        handleWheel,
        { capture: true }
      );
      stopAutoScroll();
    };
  }, []);

  function handleAdd(
    event: FormEvent<HTMLFormElement>
  ): void {
    event.preventDefault();
    const nextUrl = replyUrl.trim();

    if (!nextUrl || addLoading) {
      return;
    }

    onAdd(nextUrl);
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragIndexRef.current = index;
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY
    };
    overIndexRef.current = null;
    setDraggingIndex(index);
    setOverIndex(null);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    startAutoScroll();
  }

  function renderComment(
    index: number
  ): ReactElement {
    const comment = comments[index];
    const fileIndex = imageSlots[index];
    const screenshot =
      fileIndex === undefined
        ? undefined
        : assets[`comment-${fileIndex}`];
    const isDragging = draggingIndex === index;
    const isDropTarget = overIndex === index;

    return (
      <div
        data-comment-index={index}
        className={[
          "relative grid gap-5 rounded-2xl border p-5 lg:grid-cols-[0.8fr_1.2fr]",
          comment.excluded
            ? "border-amber-400/20 bg-amber-400/5 opacity-70"
            : "border-white/10 bg-white/[0.04]",
          isDragging ? "opacity-50" : "",
          isDropTarget
            ? "ring-2 ring-fuchsia-400/70"
            : ""
        ].join(" ")}
      >
        <div className="flex min-h-[180px] items-start justify-center rounded-xl bg-black/20 p-4">
          {screenshot ? (
            <img
              src={screenshot}
              alt={`Comment ${index + 1} screenshot`}
              className="max-h-[260px] max-w-full rounded-xl object-contain"
              draggable={false}
            />
          ) : (
            <p className="py-10 text-sm text-zinc-500">
              Đang tải...
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Kéo để sắp xếp"
                title="Kéo để sắp xếp"
                onPointerDown={(event) =>
                  handlePointerDown(event, index)
                }
                className="touch-none cursor-grab rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:border-fuchsia-400/40 hover:text-zinc-200 active:cursor-grabbing"
              >
                ⋮⋮
              </button>
              <span className="truncate">
                {comment.parentCommentIndex !== undefined
                  ? `Reply to comment #${comment.parentCommentIndex}`
                  : comment.author}
              </span>
              {comment.parentCommentIndex !== undefined && (
                <span className="truncate">
                  {comment.author}
                </span>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={comment.excluded === true}
                onChange={(event) => {
                  onChange(
                    comments.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              excluded:
                                event.target.checked,
                              curation: {
                                source: "user"
                              }
                            }
                          : item
                    ),
                    imageSlots
                  );
                }}
                className="accent-amber-400"
              />
              Exclude khỏi Analyze
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {comment.likes} likes
          </p>
          {comment.curation && (
            <p
              className={[
                "mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-xs",
                comment.excluded
                  ? "bg-amber-400/10 text-amber-200"
                  : "bg-emerald-400/10 text-emerald-200"
              ].join(" ")}
            >
              <span className="font-semibold">
                {comment.curation.source === "ai"
                  ? "AI"
                  : "Bạn"}
                {comment.excluded ? " loại" : " giữ"}
              </span>
              {comment.curation.kind && (
                <span>
                  {KIND_LABELS[comment.curation.kind]}
                </span>
              )}
              {comment.curation.reason && (
                <span>{comment.curation.reason}</span>
              )}
            </p>
          )}
          <textarea
            value={comment.text}
            onChange={(event) => {
              onChange(
                comments.map(
                  (item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          text: event.target.value
                        }
                      : item
                ),
                imageSlots
              );
            }}
            className="mt-3 min-h-[80px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
          />
        </div>
      </div>
    );
  }

  function matchesFilter(index: number): boolean {
    if (filter === "all") {
      return true;
    }

    const excluded = comments[index]?.excluded === true;

    return filter === "excluded" ? excluded : !excluded;
  }

  function subtreeMatchesFilter(
    node: CommentNode,
    trail: Set<number>
  ): boolean {
    if (matchesFilter(node.index)) {
      return true;
    }

    const nextTrail = new Set(trail);
    nextTrail.add(node.index);

    return node.children.some(
      (child) =>
        !nextTrail.has(child.index) &&
        subtreeMatchesFilter(child, nextTrail)
    );
  }

  const usedCount = comments.filter(
    (comment) => !comment.excluded
  ).length;
  const excludedCount = comments.length - usedCount;
  const filterCounts: Record<CommentFilter, number> = {
    all: comments.length,
    used: usedCount,
    excluded: excludedCount
  };

  function renderForest(
    nodes: CommentNode[],
    depth: number,
    trail: Set<number>
  ): ReactElement[] {
    const branches: ReactElement[] = [];

    for (const node of nodes) {
      if (trail.has(node.index)) {
        continue;
      }

      if (!subtreeMatchesFilter(node, new Set(trail))) {
        continue;
      }

      const nextTrail = new Set(trail);
      nextTrail.add(node.index);
      branches.push(
        <div
          key={imageSlots[node.index] ?? node.index}
          className={[
            "space-y-4",
            depth > 0
              ? "relative ml-8 border-l-2 border-l-cyan-400/50 pl-6 before:absolute before:-left-6 before:top-8 before:h-px before:w-6 before:bg-cyan-400/50"
              : ""
          ].join(" ")}
        >
          {renderComment(node.index)}
          {node.children.length > 0 &&
            renderForest(
              node.children,
              depth + 1,
              nextTrail
            )}
        </div>
      );
    }

    return branches;
  }

  return (
    <div ref={listRef} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-300">
          Comments ({comments.length}) · Dùng {usedCount} ·
          Loại {excludedCount}
        </h3>
        <div className="flex gap-1">
          {(
            Object.keys(
              FILTER_LABELS
            ) as CommentFilter[]
          ).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={[
                "rounded-lg border px-3 py-1 text-xs",
                filter === key
                  ? "border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-100"
                  : "border-white/10 text-zinc-400 hover:bg-white/5"
              ].join(" ")}
            >
              {FILTER_LABELS[key]} ({filterCounts[key]})
            </button>
          ))}
        </div>
      </div>
      <form
        className="flex gap-3"
        onSubmit={handleAdd}
      >
        <input
          value={replyUrl}
          onChange={(event) =>
            setReplyUrl(event.target.value)
          }
          placeholder="Dán link reply Threads"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
        />
        <button
          type="submit"
          disabled={
            addLoading ||
            replyUrl.trim().length === 0
          }
          className="rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-400 disabled:opacity-40"
        >
          Thêm comment
        </button>
      </form>
      {renderForest(forest, 0, new Set())}
    </div>
  );
}

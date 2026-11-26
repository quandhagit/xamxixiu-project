"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type {
  PointerEvent,
  ReactElement,
  ReactNode
} from "react";
import {
  ArrowDown,
  ArrowUp,
  EllipsisVertical
} from "lucide-react";
import {
  buildCommentForest,
  groupCommentsAsThread,
  reorderComments,
  setCommentShownAsRoot
} from "../../../src/comments/order";
import {
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import { CaptureStyleImage } from "../custom/CaptureStyleImage";
import type {
  CommentCurationKind,
  ThreadComment
} from "../../../src/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Textarea } from "../ui/Textarea";
import { cn } from "../ui/cn";

type CommentFilter = "all" | "used" | "excluded";

const FILTER_LABELS: Record<CommentFilter, string> = {
  all: "Tất cả",
  used: "Được dùng",
  excluded: "Ẩn"
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

function findOverflowParent(
  node: HTMLElement | null
): HTMLElement | null {
  let current = node;

  while (current) {
    const { overflowY } = getComputedStyle(current);

    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findScrollParent(
  node: HTMLElement | null
): HTMLElement | null {
  let current = findOverflowParent(node);

  while (current) {
    if (current.scrollHeight - current.clientHeight > 1) {
      return current;
    }

    current = findOverflowParent(current.parentElement);
  }

  return null;
}

const TREE_RAIL_X = 12;
const TREE_END_X = 32;
const TREE_ELBOW_Y = 26;
const TREE_RADIUS = 16;

function ThreadTree({
  children
}: {
  children: ReactNode;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{
    width: number;
    height: number;
    elbows: number[];
  }>({ width: 0, height: 0, elbows: [] });

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    function measure(): void {
      const items = [
        ...root.querySelectorAll(":scope > [data-tree-item]")
      ] as HTMLElement[];

      setFrame({
        width: root.clientWidth,
        height: root.clientHeight,
        elbows: items.map((item) => item.offsetTop + TREE_ELBOW_Y)
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);

    for (const child of root.children) {
      if (child instanceof HTMLElement) {
        observer.observe(child);
      }
    }

    return () => observer.disconnect();
  }, [children]);

  const lastY = frame.elbows[frame.elbows.length - 1];
  const path =
    lastY === undefined
      ? ""
      : [
          `M ${TREE_RAIL_X} 0`,
          `L ${TREE_RAIL_X} ${Math.max(TREE_RADIUS, lastY - TREE_RADIUS)}`,
          `Q ${TREE_RAIL_X} ${lastY} ${TREE_RAIL_X + TREE_RADIUS} ${lastY}`,
          `L ${TREE_END_X} ${lastY}`,
          ...frame.elbows
            .slice(0, -1)
            .map((y) => `M ${TREE_RAIL_X} ${y} L ${TREE_END_X} ${y}`)
        ].join(" ");

  return (
    <div ref={rootRef} className="relative pt-3">
      {path ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 text-accent/70"
          width={frame.width}
          height={frame.height}
          fill="none"
        >
          <path
            d={path}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {children}
    </div>
  );
}

function TreeBranch({
  isLast,
  children
}: {
  isLast: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-tree-item=""
      className={cn("relative pl-8", !isLast && "pb-3")}
    >
      {children}
    </div>
  );
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
  captureStyle?: CommentCaptureStyle;
  onChange: (
    comments: ThreadComment[],
    imageSlots: number[]
  ) => void;
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

function moveItem<T>(
  items: T[],
  from: number,
  to: number
): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }

  const next = items.slice();
  const [item] = next.splice(from, 1);

  if (item === undefined) {
    return items;
  }

  next.splice(to, 0, item);
  return next;
}

function previewText(comment: ThreadComment): string {
  const text = comment.text.trim().replace(/\s+/g, " ");

  if (text.length <= 80) {
    return text;
  }

  return `${text.slice(0, 80)}…`;
}

function HideToggle({
  hidden,
  onChange
}: {
  hidden: boolean;
  onChange: (hidden: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      onClick={() => onChange(!hidden)}
      className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          hidden ? "bg-warning" : "bg-line"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 block h-4 w-4 rounded-full bg-white transition-transform",
            hidden && "translate-x-4"
          )}
        />
      </span>
      Ẩn
    </button>
  );
}

function GroupCommentsDialog({
  open,
  comments,
  imageSlots,
  assets,
  captureStyle,
  draftSlots,
  onDraftSlotsChange,
  onClose,
  onConfirm
}: {
  open: boolean;
  comments: ThreadComment[];
  imageSlots: number[];
  assets: Record<string, string>;
  captureStyle: CommentCaptureStyle;
  draftSlots: number[];
  onDraftSlotsChange: (slots: number[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement | null {
  const rows = draftSlots.flatMap((slot, draftIndex) => {
    const index = imageSlots.indexOf(slot);
    const comment = index >= 0 ? comments[index] : undefined;

    if (!comment) {
      return [];
    }

    return [
      {
        slot,
        draftIndex,
        comment,
        screenshot: assets[`comment-${slot}`]
      }
    ];
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-w-lg"
      labelledBy="group-comments-title"
    >
      <div className="border-b border-line px-4 py-3">
        <h3
          id="group-comments-title"
          className="text-sm font-medium text-ink"
        >
          Gộp comment
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Comment đầu là cha. Đổi vị trí trước khi gộp.
        </p>
      </div>
      <div className="min-h-0 space-y-2 overflow-y-auto p-4">
        {rows.map((row, position) => {
          const isParent = position === 0;

          return (
            <div
              key={row.slot}
              className={cn(
                "flex gap-3 rounded-lg border p-2.5",
                isParent
                  ? "border-accent/50 bg-accent/10"
                  : "border-line bg-panel"
              )}
            >
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-app">
                {row.screenshot ? (
                  <CaptureStyleImage
                    src={row.screenshot}
                    alt={`Comment ${row.comment.author}`}
                    className="max-h-full max-w-full object-contain"
                    captureStyle={captureStyle}
                    draggable={false}
                  />
                ) : (
                  <span className="text-[11px] text-ink-3">
                    …
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-ink">
                    {isParent ? "Cha" : "Con"}
                  </span>
                  <span className="truncate text-[12px] text-ink">
                    {row.comment.author}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">
                  {previewText(row.comment)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {!isParent && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      onDraftSlotsChange(
                        moveItem(
                          draftSlots,
                          row.draftIndex,
                          0
                        )
                      )
                    }
                  >
                    Đặt làm cha
                  </Button>
                )}
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 w-7 px-0"
                    aria-label="Đưa lên"
                    disabled={position === 0}
                    onClick={() =>
                      onDraftSlotsChange(
                        moveItem(
                          draftSlots,
                          row.draftIndex,
                          row.draftIndex - 1
                        )
                      )
                    }
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 w-7 px-0"
                    aria-label="Đưa xuống"
                    disabled={position === rows.length - 1}
                    onClick={() =>
                      onDraftSlotsChange(
                        moveItem(
                          draftSlots,
                          row.draftIndex,
                          row.draftIndex + 1
                        )
                      )
                    }
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-1.5 border-t border-line px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Hủy
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={rows.length < 2}
          onClick={onConfirm}
        >
          Gộp
        </Button>
      </div>
    </Dialog>
  );
}

export function CaptureComments({
  comments,
  imageSlots,
  assets,
  captureStyle = DEFAULT_COMMENT_CAPTURE_STYLE,
  onChange
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
  const [filter, setFilter] =
    useState<CommentFilter>("all");
  const [draggingIndex, setDraggingIndex] =
    useState<number | null>(null);
  const [overIndex, setOverIndex] =
    useState<number | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<
    number[]
  >([]);
  const [groupDraftSlots, setGroupDraftSlots] = useState<
    number[] | null
  >(null);
  const [commentMenu, setCommentMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [scrollPort, setScrollPort] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const forest = buildCommentForest(comments);
  const selectedIndexes = selectedSlots.flatMap((slot) => {
    const index = imageSlots.indexOf(slot);
    return index >= 0 ? [index] : [];
  });
  const selectedIndexSet = new Set(selectedIndexes);
  const parentSelectedIndex = selectedIndexes[0];
  const parentSelectedComment =
    parentSelectedIndex === undefined
      ? undefined
      : comments[parentSelectedIndex];

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

  useLayoutEffect(() => {
    if (selectedIndexes.length === 0) {
      setScrollPort(null);
      return;
    }

    const scroller = findOverflowParent(listRef.current);

    if (!scroller) {
      return;
    }

    function update(): void {
      const rect = scroller.getBoundingClientRect();
      setScrollPort({
        top: rect.top,
        left: rect.left,
        width: rect.width
      });
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [selectedIndexes.length]);

  useEffect(() => {
    setSelectedSlots((current) => {
      const next = current.filter((slot) =>
        imageSlots.includes(slot)
      );

      if (
        next.length === current.length &&
        next.every((slot, slotIndex) => slot === current[slotIndex])
      ) {
        return current;
      }

      return next;
    });
    setGroupDraftSlots((current) => {
      if (!current) {
        return current;
      }

      const next = current.filter((slot) =>
        imageSlots.includes(slot)
      );

      if (next.length < 2) {
        return null;
      }

      if (
        next.length === current.length &&
        next.every((slot, slotIndex) => slot === current[slotIndex])
      ) {
        return current;
      }

      return next;
    });
  }, [imageSlots]);

  useEffect(() => {
    if (!commentMenu) {
      return;
    }

    function closeMenu(): void {
      setCommentMenu(null);
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    function onPointer(event: globalThis.PointerEvent): void {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-comment-menu]")
      ) {
        return;
      }

      const node = menuRef.current;

      if (
        node &&
        target instanceof Node &&
        node.contains(target)
      ) {
        return;
      }

      closeMenu();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [commentMenu]);

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

  function toggleSelected(index: number): void {
    const slot = imageSlots[index];

    if (slot === undefined) {
      return;
    }

    setSelectedSlots((current) =>
      current.includes(slot)
        ? current.filter((item) => item !== slot)
        : [...current, slot]
    );
  }

  function clearSelected(): void {
    setSelectedSlots([]);
  }

  function groupSelected(): void {
    if (selectedIndexes.length < 2) {
      return;
    }

    setCommentMenu(null);
    setGroupDraftSlots(
      selectedIndexes.flatMap((index) => {
        const slot = imageSlots[index];
        return slot === undefined ? [] : [slot];
      })
    );
  }

  function closeGroupModal(): void {
    setGroupDraftSlots(null);
  }

  function confirmGroup(): void {
    if (!groupDraftSlots || groupDraftSlots.length < 2) {
      return;
    }

    const indexes = groupDraftSlots.flatMap((slot) => {
      const index = imageSlots.indexOf(slot);
      return index >= 0 ? [index] : [];
    });

    if (indexes.length < 2) {
      return;
    }

    rememberScroll();
    const next = groupCommentsAsThread(
      comments,
      imageSlots,
      indexes
    );
    onChange(next.comments, next.imageSlots);
    setSelectedSlots([]);
    setGroupDraftSlots(null);
  }

  function splitAsParent(index: number): void {
    rememberScroll();
    const next = setCommentShownAsRoot(
      comments,
      imageSlots,
      index,
      true
    );
    onChange(next.comments, next.imageSlots);
    setCommentMenu(null);
  }

  function toggleCommentMenu(
    index: number,
    button: HTMLButtonElement
  ): void {
    const rect = button.getBoundingClientRect();
    const width = 188;
    const x = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    const y = Math.min(rect.bottom + 4, window.innerHeight - 48);

    setCommentMenu((current) =>
      current?.index === index ? null : { index, x, y }
    );
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setCommentMenu(null);
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
    index: number,
    childCount: number
  ): ReactElement {
    const comment = comments[index];
    const fileIndex = imageSlots[index];
    const screenshot =
      fileIndex === undefined
        ? undefined
        : assets[`comment-${fileIndex}`];
    const isDragging = draggingIndex === index;
    const isDropTarget = overIndex === index;
    const isSelected = selectedIndexSet.has(index);
    const isGroupParent =
      isSelected && parentSelectedIndex === index;
    const isReply = comment.parentCommentIndex !== undefined;
    const isThreadParent = !isReply && childCount > 0;

    return (
      <div
        data-comment-index={index}
        className={cn(
          "relative grid gap-3 rounded-lg border p-3 lg:grid-cols-[0.8fr_1.2fr]",
          comment.excluded
            ? "border-warning/30 bg-warning/5 opacity-70"
            : "border-line bg-panel",
          isDragging && "opacity-50",
          isDropTarget && "ring-1 ring-accent",
          isSelected && "ring-1 ring-accent/70"
        )}
      >
        <div className="flex min-h-[160px] items-start justify-center rounded-md bg-app p-3">
          {screenshot ? (
            <CaptureStyleImage
              src={screenshot}
              alt={`Comment ${index + 1} screenshot`}
              className="max-h-[260px] max-w-full object-contain"
              captureStyle={captureStyle}
              draggable={false}
            />
          ) : (
            <p className="py-8 text-[13px] text-ink-3">
              Đang tải...
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Kéo để sắp xếp"
                title="Kéo để sắp xếp"
                onPointerDown={(event) =>
                  handlePointerDown(event, index)
                }
                className="touch-none cursor-grab rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 hover:border-accent/50 hover:text-ink active:cursor-grabbing"
              >
                ⋮⋮
              </button>
              {isReply ? (
                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  Con
                </span>
              ) : isThreadParent ? (
                <span className="rounded-md border border-accent/40 px-1.5 py-0.5 text-[11px] font-medium text-ink">
                  Cha
                </span>
              ) : null}
              <span className="truncate">
                {isReply
                  ? `↳ #${comment.parentCommentIndex} · ${comment.author}`
                  : comment.originalParentCommentIndex !==
                      undefined
                    ? `Tách từ #${comment.originalParentCommentIndex} · ${comment.author}`
                    : comment.author}
              </span>
              {isSelected && (
                <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {isGroupParent ? "Gộp cha" : "Gộp con"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(index)}
                  className="accent-accent"
                />
                Chọn
              </label>
              <HideToggle
                hidden={comment.excluded === true}
                onChange={(hidden) => {
                  onChange(
                    comments.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            excluded: hidden,
                            curation: {
                              source: "user"
                            }
                          }
                        : item
                    ),
                    imageSlots
                  );
                }}
              />
              <button
                type="button"
                data-comment-menu=""
                aria-label="Tùy chọn comment"
                aria-expanded={commentMenu?.index === index}
                onClick={(event) =>
                  toggleCommentMenu(
                    index,
                    event.currentTarget
                  )
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2 hover:border-accent/50 hover:text-ink"
              >
                <EllipsisVertical className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            {comment.likes} likes
          </p>
          {comment.curation && (
            <p
              className={cn(
                "mt-2 inline-flex flex-wrap items-center gap-2 rounded-md px-2 py-1 text-[12px]",
                comment.excluded
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
              )}
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
          <Textarea
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
            className="mt-2 min-h-[80px] leading-5"
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
    const visible = nodes.filter(
      (node) =>
        !trail.has(node.index) &&
        subtreeMatchesFilter(node, new Set(trail))
    );

    return visible.map((node, visibleIndex) => {
      const isLast = visibleIndex === visible.length - 1;
      const nextTrail = new Set(trail);
      nextTrail.add(node.index);
      const childTree =
        node.children.length > 0
          ? renderForest(
              node.children,
              depth + 1,
              nextTrail
            )
          : [];
      const body = (
        <>
          {renderComment(node.index, node.children.length)}
          {childTree.length > 0 ? (
            <ThreadTree>{childTree}</ThreadTree>
          ) : null}
        </>
      );
      const key = imageSlots[node.index] ?? node.index;

      if (depth === 0) {
        return <div key={key}>{body}</div>;
      }

      return (
        <TreeBranch key={key} isLast={isLast}>
          {body}
        </TreeBranch>
      );
    });
  }

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      {selectedIndexes.length > 0 && scrollPort ? (
        <div
          className="fixed z-30 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-app px-4 py-2 shadow-sm"
          style={{
            top: scrollPort.top,
            left: scrollPort.left,
            width: scrollPort.width
          }}
        >
          <p className="text-[12px] text-ink-3">
            Đã chọn {selectedIndexes.length}
            {parentSelectedComment &&
              ` · Cha: ${parentSelectedComment.author}`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={selectedIndexes.length < 2}
              onClick={groupSelected}
            >
              Gộp
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={clearSelected}
            >
              Bỏ chọn
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">
          Comments ({comments.length}) · Dùng {usedCount} ·
          Ẩn {excludedCount}
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
              className={cn(
                "rounded-md border px-2 py-1 text-[12px]",
                filter === key
                  ? "border-accent/50 bg-accent/15 text-ink"
                  : "border-line text-ink-2 hover:bg-elevated"
              )}
            >
              {FILTER_LABELS[key]} ({filterCounts[key]})
            </button>
          ))}
        </div>
      </div>
      {renderForest(forest, 0, new Set())}
      {commentMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[188px] rounded-md border border-line bg-panel py-1 shadow-lg"
          style={{
            left: commentMenu.x,
            top: commentMenu.y
          }}
        >
          <button
            type="button"
            disabled={
              comments[commentMenu.index]
                ?.parentCommentIndex === undefined
            }
            className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => splitAsParent(commentMenu.index)}
          >
            Tách làm comment cha
          </button>
        </div>
      )}
      <GroupCommentsDialog
        open={groupDraftSlots !== null}
        comments={comments}
        imageSlots={imageSlots}
        assets={assets}
        captureStyle={captureStyle}
        draftSlots={groupDraftSlots ?? []}
        onDraftSlotsChange={(slots) => setGroupDraftSlots(slots)}
        onClose={closeGroupModal}
        onConfirm={confirmGroup}
      />
    </div>
  );
}

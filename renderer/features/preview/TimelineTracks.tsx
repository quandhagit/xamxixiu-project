"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import type { TimelineProject } from "../../../src/timeline/project";
import type { VideoTimeline } from "../../../src/types";
import {
  TRACK_COLORS,
  clipActionDockOpen,
  clipActionsDockOutside,
  clipBarWidth,
  clipCanRemove,
  clipOpensAssetPicker,
  clipPointerIntent,
  getProjectTracks,
  getTimelineTracks,
  type TimelineTrackClip
} from "./timeline-tracks";

const LABEL_WIDTH = 108;
const TRACK_HEIGHT = 36;
const RULER_HEIGHT = 28;
const FRAME = 1 / 30;
const SNAP_PIXELS = 8;
const MIN_DURATION = 0.05;

interface TimelineTracksProps {
  timeline: VideoTimeline;
  timelineProject?: TimelineProject;
  previewTime: number;
  disabled?: boolean;
  pixelsPerSecond?: number;
  selectedClipId?: string;
  voicePeaks?: Record<string, number[]>;
  onSeek: (time: number) => void;
  onEditClip: (target: TimelineAssetTarget) => void;
  onRemoveClip: (clip: TimelineTrackClip) => void;
  onMoveClip?: (clipId: string, start: number) => void;
  onTrimClip?: (clipId: string, edge: "in" | "out", time: number) => void;
  onSelectClip?: (clipId: string) => void;
  onToggleLock?: (clipId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface DragState {
  clipId: string;
  mode: "move" | "in" | "out";
  pointerId: number;
  originX: number;
  originStart: number;
  originDuration: number;
  liveStart: number;
  liveDuration: number;
  lastX: number;
  snapTimes: number[];
  element: HTMLElement;
  target?: TimelineAssetTarget;
  opensPicker: boolean;
}

function formatTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = time - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function clipStyle(
  clip: TimelineTrackClip,
  pixelsPerSecond: number
): CSSProperties {
  return {
    left: clip.start * pixelsPerSecond,
    width: clipBarWidth(clip.duration, pixelsPerSecond)
  };
}

function snapTime(
  time: number,
  snapTimes: number[],
  pixelsPerSecond: number
): number {
  const threshold = SNAP_PIXELS / pixelsPerSecond;
  let snapped = Math.round(time / FRAME) * FRAME;
  let best = threshold;
  for (const edge of snapTimes) {
    const distance = Math.abs(snapped - edge);
    if (distance < best) {
      best = distance;
      snapped = edge;
    }
  }
  return Math.max(0, snapped);
}

function paintClip(
  element: HTMLElement,
  start: number,
  duration: number,
  originStart: number,
  pixelsPerSecond: number,
  mode: DragState["mode"]
): void {
  if (mode === "move") {
    const dx = (start - originStart) * pixelsPerSecond;
    element.style.transform = `translate3d(${dx}px,0,0)`;
    return;
  }
  element.style.transform = "none";
  element.style.left = `${start * pixelsPerSecond}px`;
  element.style.width = `${Math.max(duration * pixelsPerSecond, 18)}px`;
}

function TimelineTracksComponent({
  timeline,
  timelineProject,
  previewTime,
  disabled,
  pixelsPerSecond = 64,
  selectedClipId,
  voicePeaks,
  onSeek,
  onEditClip,
  onRemoveClip,
  onMoveClip,
  onTrimClip,
  onSelectClip,
  onToggleLock,
  onDragStart,
  onDragEnd
}: TimelineTracksProps): React.ReactElement {
  const tracks = useMemo(
    () =>
      timelineProject
        ? getProjectTracks(timelineProject)
        : getTimelineTracks(timeline),
    [timeline, timelineProject]
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const frame = useRef(0);
  const moved = useRef(false);
  const [hoveredClipId, setHoveredClipId] = useState<string>();
  const hoverHide = useRef(0);
  const ppsRef = useRef(pixelsPerSecond);
  const callbacksRef = useRef({
    onMoveClip,
    onTrimClip,
    onDragStart,
    onDragEnd,
    onSeek,
    onSelectClip,
    onEditClip
  });
  ppsRef.current = pixelsPerSecond;
  callbacksRef.current = {
    onMoveClip,
    onTrimClip,
    onDragStart,
    onDragEnd,
    onSeek,
    onSelectClip,
    onEditClip
  };

  const duration = Math.max(
    timelineProject?.totalDuration ?? timeline.totalDuration,
    1
  );
  const canvasWidth = Math.max(duration * pixelsPerSecond, 640);
  const ticks = useMemo(() => {
    const values: number[] = [];
    const step = duration > 40 ? 5 : duration > 16 ? 2 : 1;
    for (let time = 0; time <= duration + 0.001; time += step) {
      values.push(Number(time.toFixed(2)));
    }
    return values;
  }, [duration]);

  if (playheadRef.current) {
    playheadRef.current.style.left = `${previewTime * pixelsPerSecond}px`;
  }

  function showClipActions(clipId: string): void {
    window.clearTimeout(hoverHide.current);
    setHoveredClipId(clipId);
  }

  function hideClipActions(): void {
    window.clearTimeout(hoverHide.current);
    hoverHide.current = window.setTimeout(() => {
      setHoveredClipId(undefined);
    }, 160);
  }

  function timeFromEvent(event: React.MouseEvent<HTMLElement>): number {
    const canvas = canvasRef.current;
    if (!canvas) {
      return 0;
    }
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    return Math.max(0, Math.min(duration, x / pixelsPerSecond));
  }

  function snapTimesFor(clipId: string): number[] {
    const edges: number[] = [0];
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id === clipId) {
          continue;
        }
        edges.push(clip.start, clip.start + clip.duration);
      }
    }
    return edges;
  }

  function liveFromPointer(clientX: number, current: DragState): void {
    const pps = ppsRef.current;
    const delta = (clientX - current.originX) / pps;
    if (current.mode === "move") {
      current.liveStart = snapTime(
        current.originStart + delta,
        current.snapTimes,
        pps
      );
      current.liveDuration = current.originDuration;
    } else if (current.mode === "in") {
      const end = current.originStart + current.originDuration;
      const start = snapTime(
        Math.min(current.originStart + delta, end - MIN_DURATION),
        current.snapTimes,
        pps
      );
      current.liveStart = Math.min(start, end - MIN_DURATION);
      current.liveDuration = end - current.liveStart;
    } else {
      current.liveStart = current.originStart;
      const end = snapTime(
        Math.max(
          current.originStart + MIN_DURATION,
          current.originStart + current.originDuration + delta
        ),
        current.snapTimes,
        pps
      );
      current.liveDuration = Math.max(MIN_DURATION, end - current.originStart);
    }
    paintClip(
      current.element,
      current.liveStart,
      current.liveDuration,
      current.originStart,
      pps,
      current.mode
    );
  }

  function onWindowPointerMove(event: PointerEvent): void {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    current.lastX = event.clientX;
    if (
      !moved.current &&
      clipPointerIntent(current.originX, event.clientX) === "click"
    ) {
      return;
    }
    event.preventDefault();
    if (!moved.current) {
      moved.current = true;
      current.element.style.willChange =
        current.mode === "move" ? "transform" : "left, width";
      callbacksRef.current.onDragStart?.();
    }
    if (frame.current) {
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const active = drag.current;
      if (!active) {
        return;
      }
      liveFromPointer(active.lastX, active);
    });
  }

  function finishDrag(): void {
    const current = drag.current;
    if (!current) {
      return;
    }
    window.removeEventListener("pointermove", onWindowPointerMove, true);
    window.removeEventListener("pointerup", onWindowPointerUp, true);
    window.removeEventListener("pointercancel", onWindowPointerUp, true);
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    const {
      clipId,
      mode,
      liveStart,
      liveDuration,
      element,
      originStart,
      target,
      opensPicker
    } = current;
    element.style.willChange = "";
    element.style.transform = "";
    const callbacks = callbacksRef.current;
    if (!moved.current) {
      element.style.left = `${originStart * ppsRef.current}px`;
      element.style.width = `${Math.max(current.originDuration * ppsRef.current, 18)}px`;
      drag.current = null;
      callbacks.onSeek(originStart);
      callbacks.onSelectClip?.(clipId);
      if (opensPicker && target) {
        callbacks.onEditClip(target);
      }
      return;
    }
    element.style.left = `${liveStart * ppsRef.current}px`;
    element.style.width = `${Math.max(liveDuration * ppsRef.current, 18)}px`;
    drag.current = null;
    if (mode === "move") {
      callbacks.onMoveClip?.(clipId, liveStart);
    } else {
      callbacks.onTrimClip?.(
        clipId,
        mode,
        mode === "in" ? liveStart : liveStart + liveDuration
      );
    }
    callbacks.onDragEnd?.();
  }

  function onWindowPointerUp(event: PointerEvent): void {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    finishDrag();
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    next: {
      clipId: string;
      mode: "move" | "in" | "out";
      originStart: number;
      originDuration: number;
      target?: TimelineAssetTarget;
      opensPicker?: boolean;
    }
  ): void {
    event.stopPropagation();
    const element = event.currentTarget.closest("[data-clip-id]");
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (drag.current) {
      finishDrag();
    }
    moved.current = false;
    drag.current = {
      ...next,
      pointerId: event.pointerId,
      originX: event.clientX,
      liveStart: next.originStart,
      liveDuration: next.originDuration,
      lastX: event.clientX,
      snapTimes: snapTimesFor(next.clipId),
      element,
      opensPicker: next.opensPicker ?? false
    };
    element.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", onWindowPointerMove, true);
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("pointercancel", onWindowPointerUp, true);
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-panel">
      <div className="h-full overflow-auto">
        <div
          className="flex min-w-full"
          style={{ width: LABEL_WIDTH + canvasWidth }}
        >
          <div className="sticky left-0 z-20 shrink-0 bg-sidebar">
            <div
              className="border-b border-r border-line px-2 py-1.5 text-[11px] uppercase tracking-wide text-ink-3"
              style={{ width: LABEL_WIDTH, height: RULER_HEIGHT }}
            >
              Tracks
            </div>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center border-b border-r border-line px-2 text-[12px] text-ink last:border-b-0"
                style={{ width: LABEL_WIDTH, height: TRACK_HEIGHT }}
              >
                {track.label}
              </div>
            ))}
          </div>
          <div
            ref={canvasRef}
            className="relative"
            style={{ width: canvasWidth }}
          >
            <div
              className="relative cursor-ew-resize border-b border-line"
              style={{ height: RULER_HEIGHT }}
              onClick={(event) => onSeek(timeFromEvent(event))}
            >
              {ticks.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 h-full border-l border-line pl-1 text-[10px] text-ink-3"
                  style={{ left: time * pixelsPerSecond }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-line/60 last:border-b-0"
                style={{ height: TRACK_HEIGHT }}
                onClick={(event) => onSeek(timeFromEvent(event))}
              >
                {track.clips.map((clip) => {
                  const removable = clipCanRemove(clip);
                  const peaks =
                    track.id === "voice" && clip.file
                      ? voicePeaks?.[clip.file]
                      : undefined;
                  const selected = selectedClipId === clip.id;
                  const dockOutside = clipActionsDockOutside(
                    clipBarWidth(clip.duration, pixelsPerSecond)
                  );
                  const dockOpen = clipActionDockOpen({
                    selected,
                    hovered: hoveredClipId === clip.id
                  });
                  const showLock = Boolean(onToggleLock && !clip.placeholder);
                  const actionButtons = (
                    <>
                      {showLock ? (
                        <button
                          type="button"
                          disabled={disabled}
                          title={clip.locked ? "Mở khóa" : "Khóa clip"}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleLock?.(clip.id);
                          }}
                          className="shrink-0 bg-app/90 px-1 text-[10px] leading-[20px]"
                        >
                          {clip.locked ? "🔒" : "○"}
                        </button>
                      ) : null}
                      {removable ? (
                        <button
                          type="button"
                          disabled={disabled}
                          title="Gỡ khỏi timeline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveClip(clip);
                          }}
                          className="shrink-0 bg-app/90 px-1 text-[10px] font-bold leading-[20px] text-ink hover:bg-danger hover:text-white"
                        >
                          ×
                        </button>
                      ) : null}
                    </>
                  );
                  return (
                    <div
                      key={clip.id}
                      data-clip-id={clip.id}
                      className={[
                        "absolute top-1.5",
                        selected || dockOpen ? "z-20" : "z-10"
                      ].join(" ")}
                      style={clipStyle(clip, pixelsPerSecond)}
                      onMouseEnter={() => showClipActions(clip.id)}
                      onMouseLeave={hideClipActions}
                    >
                      <div
                        className={[
                          "flex overflow-hidden rounded",
                          selected ? "ring-1 ring-accent" : ""
                        ].join(" ")}
                      >
                      {timelineProject && onTrimClip && !clip.placeholder ? (
                        <button
                          type="button"
                          className="w-1.5 shrink-0 cursor-ew-resize touch-none bg-black/20"
                          disabled={disabled || clip.locked}
                          onPointerDown={(event) => {
                            beginDrag(event, {
                              clipId: clip.id,
                              mode: "in",
                              originStart: clip.start,
                              originDuration: clip.duration
                            });
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={disabled || !clip.editable}
                        title={
                          clipOpensAssetPicker(clip)
                            ? `${clip.label} · Click để đổi hoặc gỡ`
                            : clip.label
                        }
                        onPointerDown={(event) => {
                          if (disabled || !clip.editable) {
                            return;
                          }
                          beginDrag(event, {
                            clipId: clip.id,
                            mode: "move",
                            originStart: clip.start,
                            originDuration: clip.duration,
                            target: clip.target,
                            opensPicker: clipOpensAssetPicker(clip)
                          });
                        }}
                        className={[
                          "relative min-w-0 flex-1 touch-none truncate px-1.5 text-left text-[10px] font-medium leading-[20px]",
                          clip.placeholder
                            ? "border border-dashed border-line bg-transparent text-ink-3"
                            : `${TRACK_COLORS[track.id]} text-zinc-950`,
                          clip.editable
                            ? "hover:brightness-110"
                            : "cursor-default opacity-70"
                        ].join(" ")}
                      >
                        {peaks && peaks.length > 0 ? (
                          <span className="absolute inset-x-1 bottom-0 flex h-2 items-end gap-px opacity-70">
                            {peaks.slice(0, 24).map((peak, index) => (
                              <span
                                key={`${clip.id}-p-${index}`}
                                className="flex-1 bg-zinc-900/60"
                                style={{ height: `${Math.max(10, peak * 100)}%` }}
                              />
                            ))}
                          </span>
                        ) : null}
                        {clip.label}
                      </button>
                      {timelineProject && onTrimClip && !clip.placeholder ? (
                        <button
                          type="button"
                          className="w-1.5 shrink-0 cursor-ew-resize touch-none bg-black/20"
                          disabled={disabled || clip.locked}
                          onPointerDown={(event) => {
                            beginDrag(event, {
                              clipId: clip.id,
                              mode: "out",
                              originStart: clip.start,
                              originDuration: clip.duration
                            });
                          }}
                        />
                      ) : null}
                      {!dockOutside ? actionButtons : null}
                      </div>
                      {dockOutside && (showLock || removable) ? (
                        <div
                          className={[
                            "absolute top-0 left-full z-30 -ml-1 flex rounded border border-line bg-app/90 pl-1 shadow-sm",
                            dockOpen
                              ? "opacity-100"
                              : "pointer-events-none opacity-0"
                          ].join(" ")}
                          onMouseEnter={() => showClipActions(clip.id)}
                          onMouseLeave={hideClipActions}
                        >
                          {actionButtons}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 z-10 w-px bg-accent"
              style={{
                left: previewTime * pixelsPerSecond,
                height: RULER_HEIGHT + tracks.length * TRACK_HEIGHT
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const TimelineTracks = memo(TimelineTracksComponent);

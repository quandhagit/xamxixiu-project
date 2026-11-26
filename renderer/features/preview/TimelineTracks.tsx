"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  AudioLines,
  Film,
  Image,
  Images,
  Mic,
  Music2,
  Smile,
  Type,
  Volume2
} from "lucide-react";
import type { TimelineProject } from "../../../src/timeline/project";
import type { VideoTimeline } from "../../../src/types";
import type { WatermarkStyle } from "../../../src/watermark-style";
import {
  TRACK_COLORS,
  TRACK_PIPS,
  clipBarWidth,
  clipCanRemove,
  clipPointerIntent,
  getProjectTracks,
  getTimelineTracks,
  trackLaneHeight,
  type TrackId,
  type TimelineTrackClip
} from "./timeline-tracks";

const LABEL_WIDTH = 108;
const RULER_HEIGHT = 32;
const CLIP_INSET = 6;

const TRACK_ICONS: Record<TrackId, typeof Image> = {
  background: Image,
  "title-card": Type,
  images: Images,
  meme: Smile,
  video: Film,
  watermark: Type,
  voice: Mic,
  sfx: Volume2,
  beep: AudioLines,
  music: Music2
};
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
  onRemoveClip: (clip: TimelineTrackClip) => void;
  onMoveClip?: (clipId: string, start: number) => void;
  onTrimClip?: (clipId: string, edge: "in" | "out", time: number) => void;
  onSelectClip?: (clipId: string) => void;
  onToggleLock?: (clipId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  watermarkStyle?: WatermarkStyle;
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
}

interface ClipContextMenu {
  clip: TimelineTrackClip;
  x: number;
  y: number;
}

function formatTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = time - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function clipStyle(
  clip: TimelineTrackClip,
  pixelsPerSecond: number,
  laneHeight: number
): CSSProperties {
  return {
    left: clip.start * pixelsPerSecond,
    width: clipBarWidth(clip.duration, pixelsPerSecond),
    top: CLIP_INSET / 2,
    height: Math.max(laneHeight - CLIP_INSET, 18)
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
  onRemoveClip,
  onMoveClip,
  onTrimClip,
  onSelectClip,
  onToggleLock,
  onDragStart,
  onDragEnd,
  watermarkStyle
}: TimelineTracksProps): React.ReactElement {
  const tracks = useMemo(
    () =>
      timelineProject
        ? getProjectTracks(timelineProject, { watermark: watermarkStyle })
        : getTimelineTracks(timeline, { watermark: watermarkStyle }),
    [timeline, timelineProject, watermarkStyle]
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const frame = useRef(0);
  const moved = useRef(false);
  const [menu, setMenu] = useState<ClipContextMenu>();
  const menuRef = useRef<HTMLDivElement>(null);
  const ppsRef = useRef(pixelsPerSecond);
  const callbacksRef = useRef({
    onMoveClip,
    onTrimClip,
    onDragStart,
    onDragEnd,
    onSeek,
    onSelectClip
  });
  ppsRef.current = pixelsPerSecond;
  callbacksRef.current = {
    onMoveClip,
    onTrimClip,
    onDragStart,
    onDragEnd,
    onSeek,
    onSelectClip
  };

  useEffect(() => {
    if (!menu) {
      return;
    }
    function closeMenu(): void {
      setMenu(undefined);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeMenu();
      }
    }
    function onPointer(event: PointerEvent): void {
      const node = menuRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) {
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
  }, [menu]);

  const duration = Math.max(
    timelineProject?.totalDuration ?? timeline.totalDuration,
    1
  );
  const canvasWidth = Math.max(duration * pixelsPerSecond, 640);
  const tracksHeight = tracks.reduce(
    (sum, track) => sum + trackLaneHeight(track.id),
    0
  );
  const ticks = useMemo(() => {
    const major: number[] = [];
    const minor: number[] = [];
    const step = duration > 40 ? 5 : duration > 16 ? 2 : 1;
    const minorStep = step / 2;
    for (let time = 0; time <= duration + 0.001; time += minorStep) {
      const value = Number(time.toFixed(2));
      if (Math.abs(value % step) < 0.001) {
        major.push(value);
      } else {
        minor.push(value);
      }
    }
    return { major, minor };
  }, [duration]);

  if (playheadRef.current) {
    playheadRef.current.style.left = `${previewTime * pixelsPerSecond}px`;
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
      originStart
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
    }
  ): void {
    if (event.button !== 0) {
      return;
    }
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
      element
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
              className="border-b border-r border-line px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3"
              style={{ width: LABEL_WIDTH, height: RULER_HEIGHT }}
            >
              Tracks
            </div>
            {tracks.map((track, index) => {
              const Icon = TRACK_ICONS[track.id];
              return (
              <div
                key={track.id}
                className={[
                  "flex items-center gap-1.5 border-b border-r border-line px-2 text-[11px] text-ink-2 last:border-b-0",
                  index % 2 === 0 ? "bg-white/[0.03]" : "bg-black/20"
                ].join(" ")}
                style={{ width: LABEL_WIDTH, height: trackLaneHeight(track.id) }}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${TRACK_PIPS[track.id]}`}
                />
                <Icon className="h-3 w-3 shrink-0 text-ink-3" />
                <span className="truncate">{track.label}</span>
              </div>
              );
            })}
          </div>
          <div
            ref={canvasRef}
            className="relative"
            style={{ width: canvasWidth }}
          >
            <div
              className="relative cursor-ew-resize border-b border-line bg-black/20"
              style={{ height: RULER_HEIGHT }}
              onClick={(event) => onSeek(timeFromEvent(event))}
            >
              {ticks.minor.map((time) => (
                <div
                  key={`m-${time}`}
                  className="absolute top-0 h-2 w-px bg-line/80"
                  style={{ left: time * pixelsPerSecond }}
                />
              ))}
              {ticks.major.map((time) => (
                <div
                  key={time}
                  className="absolute top-0 h-full border-l border-line/80 pl-1 text-[10px] tabular-nums text-ink-3"
                  style={{ left: time * pixelsPerSecond }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
            {tracks.map((track, index) => {
              const laneHeight = trackLaneHeight(track.id);
              return (
              <div
                key={track.id}
                className={[
                  "relative border-b border-line/40 last:border-b-0",
                  index % 2 === 0 ? "bg-white/[0.03]" : "bg-black/15"
                ].join(" ")}
                style={{ height: laneHeight }}
                onClick={(event) => onSeek(timeFromEvent(event))}
              >
                {track.clips.map((clip) => {
                  const peaks =
                    track.id === "voice" && clip.file
                      ? voicePeaks?.[clip.file]
                      : undefined;
                  const selected = selectedClipId === clip.id;
                  const canDrag = Boolean(clip.editable && !clip.locked);
                  return (
                    <div
                      key={clip.id}
                      data-clip-id={clip.id}
                      className={[
                        "absolute",
                        selected ? "z-20" : "z-10"
                      ].join(" ")}
                      style={clipStyle(clip, pixelsPerSecond, laneHeight)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (disabled) {
                          return;
                        }
                        const canLock = Boolean(
                          onToggleLock &&
                          !clip.placeholder &&
                          clip.trackId !== "watermark"
                        );
                        const canRemove = clipCanRemove(clip) && !clip.locked;
                        if (!canLock && !canRemove) {
                          return;
                        }
                        onSelectClip?.(clip.id);
                        setMenu({
                          clip,
                          x: Math.min(event.clientX, window.innerWidth - 168),
                          y: Math.min(event.clientY, window.innerHeight - 96)
                        });
                      }}
                    >
                      <div
                        className={[
                          "flex h-full overflow-hidden rounded-sm",
                          selected
                            ? "ring-2 ring-accent"
                            : "ring-1 ring-white/10"
                        ].join(" ")}
                      >
                      {timelineProject && onTrimClip && !clip.placeholder ? (
                        <button
                          type="button"
                          className="w-1.5 shrink-0 cursor-ew-resize touch-none bg-black/25"
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
                        disabled={disabled}
                        title={clip.label}
                        onPointerDown={(event) => {
                          if (disabled || event.button !== 0) {
                            return;
                          }
                          if (!canDrag) {
                            event.stopPropagation();
                            onSelectClip?.(clip.id);
                            onSeek(clip.start);
                            return;
                          }
                          beginDrag(event, {
                            clipId: clip.id,
                            mode: "move",
                            originStart: clip.start,
                            originDuration: clip.duration
                          });
                        }}
                        className={[
                          "relative min-w-0 flex-1 touch-none truncate px-1.5 text-left text-[10px] font-medium leading-tight",
                          clip.placeholder
                            ? "border border-dashed border-white/20 bg-transparent text-ink-3"
                            : `${TRACK_COLORS[track.id]} bg-gradient-to-b from-white/15 to-transparent`,
                          canDrag
                            ? "hover:brightness-125"
                            : "cursor-default opacity-70"
                        ].join(" ")}
                      >
                        {peaks && peaks.length > 0 ? (
                          <span className="absolute inset-x-1 bottom-0.5 flex h-2.5 items-end gap-px opacity-70">
                            {peaks.slice(0, 24).map((peak, index) => (
                              <span
                                key={`${clip.id}-p-${index}`}
                                className="flex-1 bg-white/50"
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
                          className="w-1.5 shrink-0 cursor-ew-resize touch-none bg-black/25"
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
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 z-30 w-0.5 bg-accent"
              style={{
                left: previewTime * pixelsPerSecond,
                height: RULER_HEIGHT + tracksHeight
              }}
            />
          </div>
        </div>
      </div>
      {menu ? (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[148px] rounded-md border border-line bg-panel py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {/*
          {onToggleLock && !menu.clip.placeholder ? (
            <button
              type="button"
              disabled={disabled}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-elevated"
              onClick={() => {
                onToggleLock(menu.clip.id);
                setMenu(undefined);
              }}
            >
              {menu.clip.locked ? "Mở khóa" : "Khóa"}
            </button>
          ) : null}
          */}
          {clipCanRemove(menu.clip) ? (
            <button
              type="button"
              disabled={disabled || menu.clip.locked}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-danger hover:bg-danger/10 disabled:opacity-40"
              onClick={() => {
                onRemoveClip(menu.clip);
                setMenu(undefined);
              }}
            >
              Gỡ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const TimelineTracks = memo(TimelineTracksComponent);

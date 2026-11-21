"use client";

import { Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  clipMutesVideoElement,
  type TimelineClip,
  type TimelineProject
} from "../../../src/timeline/project";
import {
  canMoveClipOnPreview,
  clipPositionFromPointer,
  previewPointerMoved
} from "../../../src/timeline/clip-position";
import {
  clipAnimationLabel,
  clipFlyUpProgress,
  clipFlyUpTopPercent,
  clipHasTimedMotion,
  clipMotionName,
  clipShakeOffsetPercent,
  clipSlideLeftPercent,
  clipUsesFlyUp,
  clipZoomMultiplier
} from "../../../src/timeline/clip-motion";
import {
  TOPIC_TITLE_CENTER_FRACTION,
  TOPIC_TITLE_TRANSFORM_Y,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../../src/timeline/topic-constants";
import { previewSeekThreshold } from "./preview-timeline";
import {
  isPreviewFullscreen,
  previewFrameClass,
  previewHostClass,
  previewStageBoxStyle,
  previewStageMode,
  previewStageScale
} from "./preview-chrome";
import {
  commentCaptureCardStyle,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import {
  DEFAULT_TOPIC_TITLE_STYLE,
  topicTitleCardStyle,
  type TopicTitleStyle
} from "../../../src/topic-title-style";

const TRACK_Z: Record<string, number> = {
  background: 0,
  images: 1,
  "title-card": 2,
  meme: 3,
  video: 4
};

function clipActive(clip: TimelineClip, time: number): boolean {
  return time >= clip.start && time < clip.start + clip.duration;
}

function clipOpacity(clip: TimelineClip, time: number): number {
  const local = time - clip.start;
  let opacity = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) {
    opacity *= local / clip.fadeIn;
  }
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    opacity *= Math.max(0, clip.duration - local) / clip.fadeOut;
  }
  return Math.max(0, Math.min(1, opacity));
}

function mutedByBeep(
  project: TimelineProject,
  clip: TimelineClip,
  time: number
): boolean {
  if (!clip.muteUnderBeep) {
    return false;
  }
  return project.clips.some(
    (other) =>
      other.trackId === "beep" &&
      time >= other.start &&
      time < other.start + other.duration
  );
}

function visualStyle(
  clip: TimelineClip,
  time: number,
  captureStyle: CommentCaptureStyle = DEFAULT_COMMENT_CAPTURE_STYLE,
  titleStyle: TopicTitleStyle = DEFAULT_TOPIC_TITLE_STYLE
): CSSProperties {
  const opacity = clipOpacity(clip, time);
  if (clip.trackId === "background") {
    return {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity,
      zIndex: TRACK_Z.background
    };
  }
  const defaultScale =
    clip.trackId === "title-card" ? TOPIC_TITLE_WIDTH_FRACTION : 1;
  const restScale = clip.scale ?? defaultScale;
  const x = clip.x ?? 0;
  const y =
    clip.y ??
    (clip.trackId === "title-card" ? 1 - TOPIC_TITLE_CENTER_FRACTION * 2 : 0);
  let top = 50 - y * 50;
  let left = 50 + x * 50;
  const progress = clipFlyUpProgress(
    time - clip.start,
    clip.animationDuration
  );
  const motion = clipMotionName(clip);
  if (clipUsesFlyUp(clip)) {
    top = clipFlyUpTopPercent({
      restTopPercent: top,
      progress
    });
  }
  if (motion === "slide-left") {
    left = clipSlideLeftPercent(left, progress);
  }
  const zoom =
    motion === "zoom-in" ? clipZoomMultiplier(progress) : 1;
  const shake =
    motion === "shake" ? clipShakeOffsetPercent(progress) : 0;
  const shakeShift = shake ? ` translateX(${shake}%)` : "";
  return {
    position: "absolute",
    width: `${restScale * 100}%`,
    maxHeight: "100%",
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%)${shakeShift} scale(${zoom})`,
    objectFit: "contain",
    opacity,
    zIndex: TRACK_Z[clip.trackId] ?? 1,
    ...(clip.trackId === "images"
      ? commentCaptureCardStyle(captureStyle)
      : {}),
    ...(clip.trackId === "title-card"
      ? topicTitleCardStyle(titleStyle)
      : {})
  };
}

function PreviewClip({
  clip,
  src,
  time,
  playing,
  muted,
  visible,
  selected,
  dragging,
  captureStyle,
  titleStyle,
  onMedia,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp
}: {
  clip: TimelineClip;
  src?: string;
  time: number;
  playing: boolean;
  muted: boolean;
  visible: boolean;
  selected?: boolean;
  dragging?: boolean;
  captureStyle?: CommentCaptureStyle;
  titleStyle?: TopicTitleStyle;
  onMedia?: (element: HTMLMediaElement | null) => void;
  onMovePointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onMovePointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onMovePointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
}): React.ReactElement {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  function bindMedia(element: HTMLVideoElement | HTMLAudioElement | null): void {
    mediaRef.current = element;
    onMedia?.(element);
  }

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }
    if (!visible) {
      media.pause();
      return;
    }
    const target = Math.max(0, clip.trimIn + (time - clip.start));
    const sync = (): void => {
      if (
        media.duration > 0 &&
        Math.abs(media.currentTime - target) > previewSeekThreshold(playing)
      ) {
        media.currentTime = Math.min(target, Math.max(0, media.duration - 0.01));
      }
      media.volume = muted ? 0 : Math.max(0, Math.min(1, clip.volume));
      media.muted = clipMutesVideoElement(clip) || muted;
      if (playing && !muted) {
        void media.play().catch(() => undefined);
      } else {
        media.pause();
      }
    };
    if (media.readyState >= 1) {
      sync();
      return;
    }
    media.addEventListener("loadedmetadata", sync, { once: true });
    return () => media.removeEventListener("loadedmetadata", sync);
  }, [
    clip.start,
    clip.trimIn,
    clip.volume,
    clip.kind,
    clip.trackId,
    muted,
    playing,
    time,
    visible
  ]);

  if (clip.kind === "audio") {
    return (
      <audio
        ref={bindMedia}
        className="hidden"
        src={src}
        preload="auto"
        playsInline
      />
    );
  }

  const hidden = visible ? undefined : "hidden";
  const movable = visible && canMoveClipOnPreview(clip);
  const clipStyle = visualStyle(
    clip,
    time,
    captureStyle,
    titleStyle
  );
  const style: CSSProperties = {
    ...clipStyle,
    cursor: movable ? (dragging ? "grabbing" : "grab") : undefined,
    ...(selected && visible
      ? { boxShadow: "0 0 0 1px rgba(255,255,255,0.75)" }
      : {}),
    touchAction: movable ? "none" : undefined
  };
  const moveProps = movable
    ? {
        draggable: false as const,
        onDragStart: (event: ReactDragEvent<HTMLElement>) => {
          event.preventDefault();
        },
        onPointerDown: onMovePointerDown,
        onPointerMove: onMovePointerMove,
        onPointerUp: onMovePointerUp,
        onPointerCancel: onMovePointerUp
      }
    : undefined;
  if (clip.kind === "video") {
    return (
      <video
        ref={bindMedia}
        className={hidden}
        src={src}
        playsInline
        muted={clipMutesVideoElement(clip)}
        style={style}
        {...moveProps}
      />
    );
  }

  if (clip.trackId === "title-card" || clip.kind === "title") {
    return (
      <div className={hidden} style={style} {...moveProps}>
        {clip.label}
      </div>
    );
  }

  return (
    <img
      className={hidden}
      src={src}
      alt={clip.label}
      style={style}
      {...moveProps}
    />
  );
}

interface OverlayDrag {
  pointerId: number;
  clipId: string;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  liveX: number;
  liveY: number;
  stageWidth: number;
  stageHeight: number;
  moved: boolean;
}

function paintOverlayPosition(element: HTMLElement, x: number, y: number): void {
  element.style.left = `${50 + x * 50}%`;
  element.style.top = `${50 - y * 50}%`;
}

export const HyperframesPlayer = memo(function HyperframesPlayer({
  project,
  assets,
  currentTime,
  playing,
  selectedClipId,
  captureStyle = DEFAULT_COMMENT_CAPTURE_STYLE,
  titleStyle = DEFAULT_TOPIC_TITLE_STYLE,
  onToggle,
  onSelectClip,
  onPositionCommit
}: {
  project?: TimelineProject;
  assets: Record<string, string>;
  currentTime: number;
  playing: boolean;
  selectedClipId?: string;
  captureStyle?: CommentCaptureStyle;
  titleStyle?: TopicTitleStyle;
  onToggle: () => void;
  onSelectClip?: (clipId: string) => void;
  onPositionCommit?: (clipId: string, x: number, y: number) => void;
}): React.ReactElement {
  const mediaRefs = useRef<Record<string, HTMLMediaElement | null>>({});
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<OverlayDrag | null>(null);
  const [draggingId, setDraggingId] = useState<string>();
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [overlayFullscreen, setOverlayFullscreen] = useState(false);
  const clips = project?.clips ?? [];
  const duration = Math.max(project?.totalDuration ?? 1, 1);
  const stageMode = previewStageMode({
    native: nativeFullscreen,
    overlay: overlayFullscreen
  });
  const [stageScale, setStageScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    function update(): void {
      setStageScale(previewStageScale(frame?.clientWidth ?? 0));
    }
    update();
    if (!frame) {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageMode]);

  useEffect(() => {
    function onFullscreenChange(): void {
      const active = isPreviewFullscreen(
        hostRef.current,
        document.fullscreenElement
      );
      setNativeFullscreen(active);
      if (active) {
        setOverlayFullscreen(false);
      }
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!overlayFullscreen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOverlayFullscreen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayFullscreen]);

  const activeLabel = useMemo(() => {
    const visible = clips.filter(
      (clip) => clip.kind !== "audio" && clipActive(clip, currentTime)
    );
    const flying = visible.find((clip) => {
      return (
        clipHasTimedMotion(clip) &&
        clipFlyUpProgress(currentTime - clip.start, clip.animationDuration) < 1
      );
    });
    if (flying) {
      return `${flying.label} · ${clipAnimationLabel(flying)}`;
    }
    return visible[visible.length - 1]?.label ?? "Timeline";
  }, [clips, currentTime]);

  function handleToggle(): void {
    if (!playing && project) {
      for (const clip of project.clips) {
        if (
          (clip.kind !== "audio" && clip.kind !== "video") ||
          !clipActive(clip, currentTime)
        ) {
          continue;
        }
        const media = mediaRefs.current[clip.id];
        if (
          media &&
          assets[clip.file] &&
          !(clip.kind === "audio" && mutedByBeep(project, clip, currentTime))
        ) {
          void media.play().catch(() => undefined);
        }
      }
    }
    onToggle();
  }

  async function toggleFullscreen(): Promise<void> {
    if (nativeFullscreen) {
      await document.exitFullscreen?.();
      return;
    }
    if (overlayFullscreen) {
      setOverlayFullscreen(false);
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    try {
      if (typeof host.requestFullscreen === "function") {
        await host.requestFullscreen();
        return;
      }
    } catch {
      // Electron/webview may deny native fullscreen.
    }
    setOverlayFullscreen(true);
  }

  function beginOverlayDrag(
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip
  ): void {
    if (event.button !== 0 || !canMoveClipOnPreview(clip)) {
      return;
    }
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelectClip?.(clip.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = frame.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      clipId: clip.id,
      originX: event.clientX,
      originY: event.clientY,
      startX: clip.x ?? 0,
      startY:
        clip.y ??
        (clip.trackId === "title-card" ? TOPIC_TITLE_TRANSFORM_Y : 0),
      liveX: clip.x ?? 0,
      liveY:
        clip.y ??
        (clip.trackId === "title-card" ? TOPIC_TITLE_TRANSFORM_Y : 0),
      stageWidth: rect.width,
      stageHeight: rect.height,
      moved: false
    };
  }

  function moveOverlayDrag(event: ReactPointerEvent<HTMLElement>): void {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    if (
      !current.moved &&
      !previewPointerMoved(
        current.originX,
        current.originY,
        event.clientX,
        event.clientY
      )
    ) {
      return;
    }
    if (!current.moved) {
      current.moved = true;
      setDraggingId(current.clipId);
    }
    const next = clipPositionFromPointer({
      originX: current.originX,
      originY: current.originY,
      startClipX: current.startX,
      startClipY: current.startY,
      clientX: event.clientX,
      clientY: event.clientY,
      stageWidth: current.stageWidth,
      stageHeight: current.stageHeight
    });
    current.liveX = next.x;
    current.liveY = next.y;
    paintOverlayPosition(event.currentTarget, next.x, next.y);
  }

  function endOverlayDrag(event: ReactPointerEvent<HTMLElement>): void {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    dragRef.current = null;
    setDraggingId(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (current.moved) {
      onPositionCommit?.(current.clipId, current.liveX, current.liveY);
    }
  }

  if (!project) {
    return <div className="hidden" />;
  }

  const expanded = stageMode !== "docked";

  return (
    <>
      {stageMode === "overlay" ? (
        <div
          className="aspect-[9/16] h-[min(52vh,480px)] shrink-0"
          aria-hidden
        />
      ) : null}
    <div ref={hostRef} className={previewHostClass(stageMode)}>
      <div
        ref={frameRef}
        className={previewFrameClass(stageMode)}
        onDoubleClick={() => void toggleFullscreen()}
      >
        <div style={previewStageBoxStyle(stageScale)}>
        {clips.map((clip) => {
          const src = assets[clip.file];
          if (!src && clip.trackId !== "title-card") {
            return null;
          }
          const visible = clipActive(clip, currentTime);
          const muted =
            clip.kind === "audio" && mutedByBeep(project, clip, currentTime);
          return (
            <PreviewClip
              key={clip.id}
              clip={clip}
              src={src}
              time={currentTime}
              playing={playing}
              muted={muted}
              visible={visible}
              selected={selectedClipId === clip.id}
              dragging={draggingId === clip.id}
              captureStyle={captureStyle}
              titleStyle={titleStyle}
              onMovePointerDown={(event) => beginOverlayDrag(event, clip)}
              onMovePointerMove={moveOverlayDrag}
              onMovePointerUp={endOverlayDrag}
              onMedia={
                clip.kind === "audio" || clip.kind === "video"
                  ? (element) => {
                      mediaRefs.current[clip.id] = element;
                    }
                  : undefined
              }
            />
          );
        })}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-1.5"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
              onClick={handleToggle}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" fill="currentColor" />
              ) : (
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              )}
            </button>
            <p className="min-w-0 flex-1 truncate text-[11px] text-white/85">
              {activeLabel}
            </p>
            <span className="shrink-0 text-[10px] tabular-nums text-white/70">
              {currentTime.toFixed(1)}/{duration.toFixed(1)}s
            </span>
            <button
              type="button"
              title={expanded ? "Thu nhỏ" : "Toàn màn hình"}
              aria-label={expanded ? "Thu nhỏ" : "Toàn màn hình"}
              onClick={() => void toggleFullscreen()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
            >
              {expanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
});

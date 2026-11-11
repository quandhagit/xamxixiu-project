"use client";

import { Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  TimelineClip,
  TimelineProject
} from "../../../src/timeline/project";
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
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../../src/timeline/topic-constants";
import { previewSeekThreshold } from "./preview-timeline";
import {
  isPreviewFullscreen,
  previewFrameClass,
  previewHostClass,
  previewStageMode
} from "./preview-chrome";

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

function visualStyle(clip: TimelineClip, time: number): CSSProperties {
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
      progress,
      mode: clip.trackId === "title-card" ? "title" : "full"
    });
  }
  if (motion === "slide-left") {
    left = clipSlideLeftPercent(left, progress);
  }
  const zoom =
    motion === "zoom-in" ? clipZoomMultiplier(progress) : 1;
  const shake =
    motion === "shake" ? clipShakeOffsetPercent(progress) : 0;
  const scale = restScale * zoom;
  return {
    position: "absolute",
    width: `${scale * 100}%`,
    maxHeight: "100%",
    left: `${left + shake}%`,
    top: `${top}%`,
    transform: "translate(-50%, -50%)",
    objectFit: "contain",
    opacity,
    zIndex: TRACK_Z[clip.trackId] ?? 1
  };
}

function PreviewClip({
  clip,
  src,
  time,
  playing,
  muted,
  visible,
  onMedia
}: {
  clip: TimelineClip;
  src: string;
  time: number;
  playing: boolean;
  muted: boolean;
  visible: boolean;
  onMedia?: (element: HTMLMediaElement | null) => void;
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
      media.muted = clip.kind === "video" || muted;
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
  }, [clip.start, clip.trimIn, clip.volume, clip.kind, muted, playing, time, visible]);

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
  if (clip.kind === "video") {
    return (
      <video
        ref={bindMedia}
        className={hidden}
        src={src}
        playsInline
        muted
        style={visualStyle(clip, time)}
      />
    );
  }

  return (
    <img
      className={hidden}
      src={src}
      alt={clip.label}
      style={visualStyle(clip, time)}
    />
  );
}

export const HyperframesPlayer = memo(function HyperframesPlayer({
  project,
  assets,
  currentTime,
  playing,
  onToggle
}: {
  project?: TimelineProject;
  assets: Record<string, string>;
  currentTime: number;
  playing: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const hostRef = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [overlayFullscreen, setOverlayFullscreen] = useState(false);
  const clips = project?.clips ?? [];
  const duration = Math.max(project?.totalDuration ?? 1, 1);
  const stageMode = previewStageMode({
    native: nativeFullscreen,
    overlay: overlayFullscreen
  });

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
        if (clip.kind !== "audio" || !clipActive(clip, currentTime)) {
          continue;
        }
        const audio = audioRefs.current[clip.id];
        if (
          audio &&
          assets[clip.file] &&
          !mutedByBeep(project, clip, currentTime)
        ) {
          void audio.play().catch(() => undefined);
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
        className={previewFrameClass(stageMode)}
        onDoubleClick={() => void toggleFullscreen()}
      >
        {clips.map((clip) => {
          const src = assets[clip.file];
          if (!src) {
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
              onMedia={
                clip.kind === "audio"
                  ? (element) => {
                      audioRefs.current[clip.id] =
                        element instanceof HTMLAudioElement ? element : null;
                    }
                  : undefined
              }
            />
          );
        })}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5"
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

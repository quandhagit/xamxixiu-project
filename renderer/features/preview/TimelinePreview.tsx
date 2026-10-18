"use client";

import {
  useEffect,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";
import type {
  TimelineOverlay,
  VideoTimeline
} from "../../../src/types";
import { getSceneBlocks } from "../../../src/timeline/timing";
import {
  getCaptureStyle,
  getOverlayStyle
} from "./preview-timeline";
import { useTimelinePreview } from "./use-timeline-preview";
import {
  TOPIC_TITLE_CENTER_FRACTION,
  TOPIC_TITLE_LINE_HEIGHT,
  TOPIC_TITLE_MIN_HEIGHT,
  TOPIC_TITLE_PADDING,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../../src/timeline/topic-constants";

interface TimelinePreviewProps {
  timeline: VideoTimeline;
  assets: Record<string, string>;
}

interface MemeOverlayProps {
  overlay: TimelineOverlay;
  src: string;
  elapsed: number;
  playing: boolean;
}

function isVideoAsset(file: string): boolean {
  return [".mp4", ".mov", ".webm"].some(
    (extension) =>
      file.toLowerCase().endsWith(extension)
  );
}

function MemeOverlay({
  overlay,
  src,
  elapsed,
  playing
}: MemeOverlayProps): React.ReactElement {
  const videoRef =
    useRef<HTMLVideoElement>(null);
  const active =
    elapsed >= overlay.start &&
    elapsed < overlay.start + overlay.duration;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!active) {
      video.pause();
      return;
    }

    const syncVideo = (): void => {
      if (video.duration > 0) {
        const target =
          (elapsed - overlay.start) % video.duration;
        if (Math.abs(video.currentTime - target) > 0.15) {
          video.currentTime = target;
        }
      }
      if (playing) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };

    if (video.readyState >= 1) {
      syncVideo();
    } else {
      video.addEventListener(
        "loadedmetadata",
        syncVideo,
        { once: true }
      );
    }

    return () => {
      video.removeEventListener(
        "loadedmetadata",
        syncVideo
      );
    };
  }, [
    active,
    elapsed,
    overlay.start,
    playing
  ]);

  return (
    <video
      ref={videoRef}
      className="absolute object-contain"
      src={src}
      playsInline
      style={getOverlayStyle(overlay)}
    />
  );
}

interface TopicMemeOverlayProps {
  overlay: TimelineOverlay;
  src: string;
  elapsed: number;
  animationProgress: number;
}

function TopicMemeOverlay({
  overlay,
  src,
  elapsed,
  animationProgress
}: TopicMemeOverlayProps): React.ReactElement {
  const [naturalWidth, setNaturalWidth] =
    useState<number>();
  const active =
    elapsed >= overlay.start &&
    elapsed < overlay.start + overlay.duration;
  const widthPercent = naturalWidth
    ? (overlay.scale ?? 0.8) *
      naturalWidth /
      1080 *
      100
    : (overlay.scale ?? 0.8) * 100;
  const style: CSSProperties = {
    width: `${widthPercent}%`,
    left: `${50 + (overlay.x ?? 0) * 50}%`,
    top: `${
      50 -
      (overlay.y ?? 0) * 50 +
      (1 - animationProgress) * 100
    }%`,
    transform: "translate(-50%, -50%)"
  };

  if (!active) {
    return <></>;
  }

  return (
    <img
      className="absolute object-contain"
      src={src}
      alt="Topic meme"
      onLoad={(event) => {
        setNaturalWidth(event.currentTarget.naturalWidth);
      }}
      style={style}
    />
  );
}

export function TimelinePreview({
  timeline,
  assets
}: TimelinePreviewProps): React.ReactElement {
  const preview = useTimelinePreview({
    timeline,
    assets
  });
  const {
    previewScene,
    previewAudioTracks,
    previewTime,
    previewPlaying
  } = preview;

  if (!previewScene) {
    return <div className="hidden" />;
  }

  const topicIntroVisible =
    timeline.topicIntro &&
    previewTime < timeline.topicIntro.blocksDuration;
  const titleProgress = timeline.topicIntro
    ? Math.min(
        1,
        previewTime /
          Math.max(
            0.2,
            timeline.topicIntro.animationDuration
          )
      )
    : 1;
  const titleLines =
    timeline.topicIntro?.title
      .trim()
      .split(/\s+/)
      .reduce<string[]>((lines, word) => {
        const current = lines.at(-1) ?? "";
        const candidate = current
          ? `${current} ${word}`
          : word;
        if (current && candidate.length > 28) {
          return [...lines, word];
        }
        if (lines.length === 0) {
          return [candidate];
        }
        return [
          ...lines.slice(0, -1),
          candidate
        ];
      }, []) ?? [];
  const titleCardHeight = Math.max(
    TOPIC_TITLE_MIN_HEIGHT,
    Math.max(1, Math.min(3, titleLines.length)) *
      TOPIC_TITLE_LINE_HEIGHT +
      TOPIC_TITLE_PADDING
  );
  const titleStyle: CSSProperties = {
    width: `${TOPIC_TITLE_WIDTH_FRACTION * 100}%`,
    height: `${titleCardHeight / 1920 * 100}%`,
    top: `${
      TOPIC_TITLE_CENTER_FRACTION * 100 +
      (1 - titleProgress) *
        (100 - TOPIC_TITLE_CENTER_FRACTION * 100)
    }%`,
    transform: "translate(-50%, -50%)",
    lineHeight: `${
      TOPIC_TITLE_LINE_HEIGHT / 1920 * 100
    }vh`
  };
  const visibleCaptureBlocks = getSceneBlocks(
    previewScene.scene
  ).filter(
    (block) =>
      previewScene.elapsed >= block.imageStart &&
      previewScene.elapsed <
        block.imageStart + block.imageDuration
  );

  return (
    <div className="grid gap-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5 lg:grid-cols-[0.55fr_1fr]">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl">
        {timeline.backgroundFile &&
          assets[timeline.backgroundFile] && (
            <video
              ref={preview.previewVideoRef}
              className="absolute h-full w-full object-cover opacity-80"
              src={assets[timeline.backgroundFile]}
              muted
            />
          )}
        <div className="relative flex h-full w-full items-start justify-center">
          {topicIntroVisible && (
            <div
              className="absolute left-1/2 z-20 flex items-center justify-center rounded-[6px] bg-black text-center text-sm font-normal text-white"
              style={titleStyle}
            >
              {timeline.topicIntro?.title}
            </div>
          )}
          {visibleCaptureBlocks.map((block) =>
            assets[block.imageFile] ? (
              <img
                key={`${block.imageFile}-${block.imageStart}`}
                className="absolute object-contain"
                src={assets[block.imageFile]}
                alt="Timeline preview"
                style={getCaptureStyle(block)}
              />
            ) : null
          )}
          {previewScene.block.overlays
            .filter(
              (overlay) =>
                overlay.type === "meme" &&
                previewScene.elapsed >= overlay.start &&
                previewScene.elapsed <
                  overlay.start + overlay.duration
            )
            .map((overlay) =>
              assets[overlay.file] ? (
                previewScene.scene.id === "topic" ? (
                  <TopicMemeOverlay
                    key={`${overlay.file}-${overlay.start}`}
                    overlay={overlay}
                    src={assets[overlay.file]}
                    elapsed={previewScene.elapsed}
                    animationProgress={Math.min(
                      1,
                      previewScene.elapsed /
                        Math.max(
                          0.2,
                          overlay.animationDuration ?? 0.2
                        )
                    )}
                  />
                ) : isVideoAsset(overlay.file) ? (
                  <MemeOverlay
                    key={`${overlay.file}-${overlay.start}`}
                    overlay={overlay}
                    src={assets[overlay.file]}
                    elapsed={previewScene.elapsed}
                    playing={previewPlaying}
                  />
                ) : (
                  <img
                    key={`${overlay.file}-${overlay.start}`}
                    className="absolute object-contain"
                    src={assets[overlay.file]}
                    alt={overlay.type}
                    style={getOverlayStyle(overlay)}
                  />
                )
              ) : null
            )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyan-300">
              Draft preview
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Scene{" "}
              {timeline.scenes.indexOf(
                previewScene.scene
              ) + 1}{" "}
              ·{" "}
              {previewScene.scene.commentIndex === null
                ? "Topic"
                : `Comment #${previewScene.scene.commentIndex}`}
            </p>
          </div>
          <button
            type="button"
            onClick={preview.togglePreview}
            className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-cyan-950"
          >
            {previewPlaying ? "Pause" : "Play"}
          </button>
        </div>
        <input
          className="mt-6 w-full accent-cyan-400"
          type="range"
          min={0}
          max={timeline.totalDuration}
          step={0.01}
          value={previewTime}
          onChange={(event) => {
            preview.setPreviewPlaying(false);
            preview.setPreviewTime(
              Number(event.target.value)
            );
          }}
        />
        <div className="mt-2 flex justify-between text-xs text-zinc-500">
          <span>{previewTime.toFixed(2)}s</span>
          <span>{timeline.totalDuration.toFixed(2)}s</span>
        </div>
        {previewAudioTracks.map((track) => (
          <audio
            key={track.key}
            ref={(element) => {
              preview.previewAudioRefs.current[track.key] =
                element;
            }}
            className="hidden"
            preload="auto"
            src={assets[track.file]}
          />
        ))}
        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Preview dùng cùng timing và vị trí với timeline. Hãy
          kiểm tra comment, meme và khoảng chờ SFX trước khi
          Generate CapCut.
        </p>
      </div>
    </div>
  );
}

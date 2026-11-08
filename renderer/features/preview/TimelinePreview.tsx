"use client";

import {
  useEffect,
  useRef
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
import { isVideoAsset } from "./timeline-tracks";
import type { UseTimelinePreviewResult } from "./use-timeline-preview";
import {
  TOPIC_MEME_SCALE,
  TOPIC_TITLE_ANIMATION_DURATION,
  TOPIC_TITLE_CARD_FILE,
  TOPIC_TITLE_CENTER_FRACTION,
  TOPIC_TITLE_WIDTH_FRACTION
} from "../../../src/timeline/topic-constants";

interface TimelinePreviewProps {
  timeline: VideoTimeline;
  assets: Record<string, string>;
  preview: UseTimelinePreviewResult;
}

interface MemeOverlayProps {
  overlay: TimelineOverlay;
  src: string;
  elapsed: number;
  playing: boolean;
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
      className="absolute h-auto object-contain"
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
  const active =
    elapsed >= overlay.start &&
    elapsed < overlay.start + overlay.duration;
  const style: CSSProperties = {
    width: `${(overlay.scale ?? TOPIC_MEME_SCALE) * 100}%`,
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
      className="absolute h-auto object-contain"
      src={src}
      alt="Topic meme"
      style={style}
    />
  );
}

export function TimelinePreview({
  timeline,
  assets,
  preview
}: TimelinePreviewProps): React.ReactElement {
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
            TOPIC_TITLE_ANIMATION_DURATION,
            timeline.topicIntro.animationDuration
          )
      )
    : 1;
  const titleCardSrc =
    (timeline.topicIntro?.titleCardFile &&
      assets[timeline.topicIntro.titleCardFile]) ||
    assets[TOPIC_TITLE_CARD_FILE];
  const titleStyle: CSSProperties = {
    width: `${TOPIC_TITLE_WIDTH_FRACTION * 100}%`,
    top: `${
      TOPIC_TITLE_CENTER_FRACTION * 100 +
      (1 - titleProgress) *
        (100 - TOPIC_TITLE_CENTER_FRACTION * 100)
    }%`,
    transform: "translate(-50%, -50%)"
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
    <div className="flex h-full min-w-[180px] max-w-[240px] shrink-0 flex-col gap-2">
      <div className="relative mx-auto aspect-[9/16] h-[min(38vh,320px)] w-auto overflow-hidden rounded-lg border border-line bg-black">
        {timeline.backgroundFile &&
        assets[timeline.backgroundFile] ? (
          isVideoAsset(timeline.backgroundFile) ? (
            <video
              ref={preview.previewVideoRef}
              className="absolute h-full w-full object-cover"
              src={assets[timeline.backgroundFile]}
              muted
            />
          ) : (
            <img
              className="absolute h-full w-full object-cover"
              src={assets[timeline.backgroundFile]}
              alt=""
            />
          )
        ) : null}
        <div className="relative flex h-full w-full items-start justify-center">
          {topicIntroVisible && titleCardSrc ? (
            <img
              className="absolute left-1/2 z-20 h-auto"
              src={titleCardSrc}
              alt="Topic title"
              style={titleStyle}
            />
          ) : null}
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
                      Math.max(
                        0,
                        previewScene.elapsed - overlay.start
                      ) /
                        Math.max(
                          TOPIC_TITLE_ANIMATION_DURATION,
                          overlay.animationDuration ??
                            TOPIC_TITLE_ANIMATION_DURATION
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
                    className="absolute h-auto object-contain"
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
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">
              Preview
            </p>
            <p className="mt-0.5 truncate text-[12px] text-ink-2">
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
            className="inline-flex h-7 shrink-0 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            {previewPlaying ? "Pause" : "Play"}
          </button>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
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
            loop={false}
            src={assets[track.file]}
          />
        ))}
        <p className="mt-1 text-[11px] leading-4 text-ink-3">
          Timing khớp timeline. Kiểm tra meme và SFX trước khi xuất.
        </p>
      </div>
    </div>
  );
}

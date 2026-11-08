"use client";

import { useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import { canRemoveTimelineAsset } from "../../../src/timeline/replace-asset";
import type { VideoTimeline } from "../../../src/types";
import {
  TRACK_COLORS,
  getTimelineTracks,
  type TimelineTrackClip
} from "./timeline-tracks";

const PIXELS_PER_SECOND = 64;
const LABEL_WIDTH = 108;
const TRACK_HEIGHT = 36;
const RULER_HEIGHT = 28;

interface TimelineTracksProps {
  timeline: VideoTimeline;
  previewTime: number;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onEditClip: (target: TimelineAssetTarget) => void;
  onRemoveClip: (target: TimelineAssetTarget) => void;
}

function formatTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = time - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function clipStyle(clip: TimelineTrackClip): CSSProperties {
  return {
    left: clip.start * PIXELS_PER_SECOND,
    width: Math.max(clip.duration * PIXELS_PER_SECOND, 18)
  };
}

export function TimelineTracks({
  timeline,
  previewTime,
  disabled,
  onSeek,
  onEditClip,
  onRemoveClip
}: TimelineTracksProps): React.ReactElement {
  const tracks = useMemo(
    () => getTimelineTracks(timeline),
    [timeline]
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(timeline.totalDuration, 1);
  const canvasWidth = Math.max(duration * PIXELS_PER_SECOND, 640);
  const ticks = useMemo(() => {
    const values: number[] = [];
    const step = duration > 40 ? 5 : duration > 16 ? 2 : 1;
    for (let time = 0; time <= duration + 0.001; time += step) {
      values.push(Number(time.toFixed(2)));
    }
    return values;
  }, [duration]);

  function timeFromEvent(event: React.MouseEvent<HTMLElement>): number {
    const canvas = canvasRef.current;
    if (!canvas) {
      return 0;
    }
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    return Math.max(0, Math.min(duration, x / PIXELS_PER_SECOND));
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
                  style={{ left: time * PIXELS_PER_SECOND }}
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
                  const removable =
                    clip.target !== undefined &&
                    !clip.placeholder &&
                    canRemoveTimelineAsset(clip.target);
                  return (
                    <div
                      key={clip.id}
                      className="absolute top-1.5 flex overflow-hidden rounded"
                      style={clipStyle(clip)}
                    >
                      <button
                        type="button"
                        disabled={disabled || !clip.editable}
                        title={clip.label}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSeek(clip.start);
                          if (clip.target && clip.editable) {
                            onEditClip(clip.target);
                          }
                        }}
                        className={[
                          "min-w-0 flex-1 truncate px-1.5 text-left text-[10px] font-medium leading-[20px]",
                          clip.placeholder
                            ? "border border-dashed border-line bg-transparent text-ink-3"
                            : `${TRACK_COLORS[track.id]} text-zinc-950`,
                          clip.editable
                            ? "hover:brightness-110"
                            : "cursor-default opacity-70"
                        ].join(" ")}
                      >
                        {clip.label}
                      </button>
                      {removable && (
                        <button
                          type="button"
                          disabled={disabled}
                          title="Gỡ khỏi timeline"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (clip.target) {
                              onRemoveClip(clip.target);
                            }
                          }}
                          className="shrink-0 bg-app/80 px-1 text-[10px] font-bold leading-[20px] text-ink hover:bg-danger hover:text-white"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div
              className="pointer-events-none absolute top-0 z-10 w-px bg-accent"
              style={{
                left: previewTime * PIXELS_PER_SECOND,
                height: RULER_HEIGHT + tracks.length * TRACK_HEIGHT
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

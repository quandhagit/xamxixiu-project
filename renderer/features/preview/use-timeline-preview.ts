import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  PreviewAudioRefs,
  PreviewAudioTrack,
  PreviewSceneState
} from "./preview-types";
import {
  getPreviewAudioTracks,
  getPreviewScene,
  previewSeekThreshold
} from "./preview-timeline";
import type { VideoTimeline } from "../../../src/types";

interface UseTimelinePreviewOptions {
  timeline: VideoTimeline | undefined;
  assets: Record<string, string>;
}

export interface UseTimelinePreviewResult {
  previewTime: number;
  previewPlaying: boolean;
  previewScene: PreviewSceneState | undefined;
  previewAudioTracks: PreviewAudioTrack[];
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
  previewAudioRefs: React.MutableRefObject<PreviewAudioRefs>;
  setPreviewTime: (time: number) => void;
  setPreviewPlaying: (playing: boolean) => void;
  togglePreview: () => void;
}

export function useTimelinePreview({
  timeline,
  assets
}: UseTimelinePreviewOptions): UseTimelinePreviewResult {
  const [previewTime, setPreviewTime] =
    useState(0);
  const [previewPlaying, setPreviewPlaying] =
    useState(false);
  const previewVideoRef =
    useRef<HTMLVideoElement>(null);
  const previewAudioRefs =
    useRef<PreviewAudioRefs>({});
  const previewAudioTracks = useMemo(
    () => (timeline ? getPreviewAudioTracks(timeline) : []),
    [timeline]
  );
  const previewScene = useMemo(
    () =>
      timeline
        ? getPreviewScene(timeline, previewTime)
        : undefined,
    [timeline, previewTime]
  );

  useEffect(() => {
    if (!timeline) {
      setPreviewTime(0);
      setPreviewPlaying(false);
      return;
    }
    if (previewTime > timeline.totalDuration) {
      setPreviewTime(0);
      setPreviewPlaying(false);
    }
  }, [previewTime, timeline]);

  useEffect(() => {
    if (!previewPlaying || !timeline) {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const delta = (now - last) / 1000;
      last = now;
      setPreviewTime((time) => {
        if (time >= timeline.totalDuration) {
          setPreviewPlaying(false);
          return 0;
        }
        const next = time + delta;
        if (next >= timeline.totalDuration) {
          setPreviewPlaying(false);
          return 0;
        }
        return next;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [previewPlaying, timeline]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }
    if (video.readyState >= 1 && video.duration > 0) {
      const origin = timeline?.backgroundStart ?? 0;
      const target = (origin + previewTime) % video.duration;
      if (
        Math.abs(video.currentTime - target) >
        previewSeekThreshold(previewPlaying)
      ) {
        video.currentTime = target;
      }
    }
    if (previewPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [previewPlaying, previewTime, timeline]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    for (const track of previewAudioTracks) {
      const audio = previewAudioRefs.current[track.key];
      if (!audio || !assets[track.file]) {
        continue;
      }
      const active =
        previewTime >= track.start &&
        previewTime < track.start + track.duration;
      if (!active) {
        audio.pause();
        continue;
      }

      const syncAudio = (): void => {
        const target = previewTime - track.start;
        if (audio.duration > 0 && target >= audio.duration) {
          audio.pause();
          return;
        }
        if (
          Math.abs(audio.currentTime - target) >
          previewSeekThreshold(previewPlaying)
        ) {
          audio.currentTime = target;
        }
        audio.volume = track.volume;
        if (previewPlaying) {
          void audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      };

      if (audio.readyState >= 1) {
        syncAudio();
      } else {
        audio.addEventListener(
          "loadedmetadata",
          syncAudio,
          { once: true }
        );
        cleanups.push(() => {
          audio.removeEventListener(
            "loadedmetadata",
            syncAudio
          );
        });
      }
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [assets, previewAudioTracks, previewPlaying, previewTime]);

  function togglePreview(): void {
    const nextPlaying = !previewPlaying;
    setPreviewPlaying(nextPlaying);

    if (!nextPlaying) {
      return;
    }

    // Start active audio directly from the button event so browser autoplay
    // policies treat the preview as user-initiated.
    for (const track of previewAudioTracks) {
      const audio = previewAudioRefs.current[track.key];
      const active =
        previewTime >= track.start &&
        previewTime < track.start + track.duration;
      if (audio && active && assets[track.file]) {
        void audio.play().catch(() => undefined);
      }
    }
  }

  return {
    previewTime,
    previewPlaying,
    previewScene,
    previewAudioTracks,
    previewVideoRef,
    previewAudioRefs,
    setPreviewTime,
    setPreviewPlaying,
    togglePreview
  };
}

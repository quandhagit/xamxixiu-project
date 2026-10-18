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
  getPreviewScene
} from "./preview-timeline";
import type { VideoTimeline } from "../../../src/types";

interface UseTimelinePreviewOptions {
  timeline: VideoTimeline | undefined;
  assets: Record<string, string>;
}

interface UseTimelinePreviewResult {
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
    if (!previewPlaying || !timeline) {
      return;
    }
    const timer = window.setInterval(() => {
      setPreviewTime((time) => {
        if (time >= timeline.totalDuration) {
          setPreviewPlaying(false);
          return 0;
        }
        return Math.min(time + 0.05, timeline.totalDuration);
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [previewPlaying, timeline]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }
    if (video.readyState >= 1 && video.duration > 0) {
      const target = previewTime % video.duration;
      if (Math.abs(video.currentTime - target) > 0.15) {
        video.currentTime = target;
      }
    }
    if (previewPlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [previewPlaying, previewTime]);

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
        if (Math.abs(audio.currentTime - target) > 0.15) {
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

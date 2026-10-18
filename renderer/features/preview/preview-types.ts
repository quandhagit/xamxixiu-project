import type {
  TimelineCommentBlock,
  TimelineScene,
  VideoTimeline
} from "../../../src/types";

export interface PreviewSceneState {
  scene: TimelineScene;
  block: TimelineCommentBlock;
  start: number;
  elapsed: number;
}

export interface PreviewAudioTrack {
  key: string;
  file: string;
  start: number;
  duration: number;
  volume: number;
}

export type PreviewAudioRefs = Record<
  string,
  HTMLAudioElement | null
>;

export interface PreviewTimelineProps {
  timeline: VideoTimeline;
  assets: Record<string, string>;
}

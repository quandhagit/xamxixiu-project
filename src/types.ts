export interface ThreadComment {
  author: string;
  text: string;
  likes: number;
  containerIndex: number;
}

export interface ThreadData {
  url: string;
  author: string;
  text: string;
  likes: number;
  postContainerIndex: number;
  comments: ThreadComment[];
}

export type ContentData = ThreadData;

export type ReactionEmotion =
  | "happy"
  | "laughing"
  | "sad"
  | "angry"
  | "shocked"
  | "surprised"
  | "confused"
  | "shy"
  | "cringe"
  | "scared"
  | "agree"
  | "neutral";

export type ReactionAnimation =
  | "scale-in"
  | "pop"
  | "shake"
  | "slide-in"
  | "fade-in"
  | "none";

export interface ReactionEvent {
  commentIndex: number;

  voiceId?: string;

  emotion: ReactionEmotion;

  memeCategory: string | null;

  sfxCategory: string | null;

  animation: ReactionAnimation;

  duration: number;
}

export interface ThreadAnalysis {
  topicVoiceId?: string;

  tone:
  | "serious"
  | "sarcastic"
  | "casual"
  | "dramatic"
  | "humorous";

  topicType:
  | "social"
  | "relationship"
  | "work"
  | "technology"
  | "news"
  | "entertainment"
  | "other";

  intensity: number;

  reactions: ReactionEvent[];

  musicType:
  | "funny"
  | "dramatic"
  | "chill"
  | "sad"
  | "neutral";
}

export type AudioFailureTarget =
  | "topic"
  | `comment-${number}`;

export interface AudioFailure {
  target: AudioFailureTarget;
  message: string;
}

export type TimelineOverlayType =
  | "meme"
  | "sfx";

export interface TimelineOverlay {
  type: TimelineOverlayType;
  file: string;
  start: number;
  duration: number;
  animation?: ReactionAnimation;
}

export interface TimelineScene {
  id: string;
  commentIndex: number | null;
  imageFile: string;
  imageStart: number;
  imageDuration: number;
  audioFile: string;
  audioStart: number;
  audioDuration: number;
  overlays: TimelineOverlay[];
}

export interface VideoTimeline {
  version: 1;
  canvas: {
    width: 1080;
    height: 1920;
    fps: 30;
  };
  totalDuration: number;
  scenes: TimelineScene[];
}
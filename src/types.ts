export interface ThreadComment {
  author: string;
  text: string;
  likes: number;
  containerIndex: number;
  commentIndex?: number;
  parentCommentIndex?: number;
  replies?: ThreadComment[];
  excluded?: boolean;
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
  | "fade-in"
  | "zoom-1"
  | "rock-vertically"
  | "slide-down"
  | "slide-up"
  | "slide-right"
  | "slide-left"
  | "rotate"
  | "flame-risen"
  | "rotation-opening"
  | "retro-fadein-2"
  | "retro-fadein"
  | "screen-wipe"
  | "rgb-scanlines"
  | "zoom-2"
  | "zoom-out"
  | "zoom-in"
  | "shake-3"
  | "crt-bands"
  | "vibrating-panels"
  | "swing-top-right"
  | "anime-frame"
  | "rock-horizontally"
  | "gray-mask"
  | "shake-1"
  | "spin-up-2"
  | "whirl"
  | "mini-zoom"
  | "spin-up-1"
  | "swing-bottom"
  | "swing-right"
  | "swing-bottom-left"
  | "flip"
  | "shake-2"
  | "blinds"
  | "swing-bottom-right"
  | "puzzle"
  | "swing-top-left"
  | "shake-down"
  | "swing"
  | "wiper"
  | "roll-right"
  | "spin-left"
  | "none";

export interface ReactionEvent {
  commentIndex: number;

  voiceId?: string;

  emotion: ReactionEmotion;

  memeAssetId?: string | null;

  memeCategory: string | null;

  sfxAssetId?: string | null;

  sfxCategory: string | null;

  animation: ReactionAnimation;

  duration: number;
}

export interface ThreadAnalysis {
  topicTitle?: string;
  topicVoiceId?: string;
  topicMemeId?: string | null;
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;

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
  | "topic-title"
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
  x?: number;
  y?: number;
  scale?: number;
  fadeIn?: number;
  animationDuration?: number;
}

export interface TimelineCommentBlock {
  commentIndex: number;
  imageFile: string;
  imageStart: number;
  imageDuration: number;
  sceneDuration?: number;
  imageScale?: number;
  imageX?: number;
  imageY?: number;
  audioFile: string;
  audioStart: number;
  audioDuration: number;
  overlays: TimelineOverlay[];
}

export interface TimelineScene {
  id: string;
  commentIndex: number | null;
  imageFile: string;
  imageStart: number;
  imageDuration: number;
  sceneDuration?: number;
  imageScale?: number;
  imageX?: number;
  imageY?: number;
  audioFile: string;
  audioStart: number;
  audioDuration: number;
  overlays: TimelineOverlay[];
  blocks?: TimelineCommentBlock[];
}

export interface TimelineTopicIntro {
  case: "long" | "short";
  title: string;
  titleVoiceFile: string;
  titleVoiceDuration: number;
  openSfxFile: string;
  openSfxDuration: number;
  memeFile?: string;
  animationDuration: number;
  blocksDuration: number;
  captureStart: number;
}

export interface VideoTimeline {
  version: 1;
  canvas: {
    width: 1080;
    height: 1920;
    fps: 30;
  };
  totalDuration: number;
  backgroundFile?: string;
  musicFile?: string;
  topicIntro?: TimelineTopicIntro;
  scenes: TimelineScene[];
}
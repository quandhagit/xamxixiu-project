export const DEFAULT_FLY_UP_DURATION = 0.35;
export const ZOOM_IN_FROM = 1.12;

export function clipMotionName(clip: {
  trackId?: string;
  animation?: string;
  commentIndex?: number | null;
}): string | undefined {
  if (clip.trackId === "title-card") {
    return "slide-up";
  }
  if (clip.animation === "slide-up") {
    return "slide-up";
  }
  if (
    clip.trackId === "meme" &&
    clip.commentIndex === null &&
    (!clip.animation || clip.animation === "none")
  ) {
    return "slide-up";
  }
  if (clip.animation === "zoom-in") {
    return "zoom-in";
  }
  if (
    clip.animation === "shake" ||
    clip.animation === "shake-1" ||
    clip.animation === "shake-2"
  ) {
    return "shake";
  }
  if (clip.animation === "slide-left") {
    return "slide-left";
  }
  if (clip.animation === "fade-in") {
    return "fade-in";
  }
  return undefined;
}

export function clipUsesFlyUp(clip: {
  trackId?: string;
  animation?: string;
  commentIndex?: number | null;
}): boolean {
  return clipMotionName(clip) === "slide-up";
}

export function clipFlyUpDuration(clip: {
  animationDuration?: number;
}): number {
  return clip.animationDuration ?? DEFAULT_FLY_UP_DURATION;
}

export function clipAnimationLabel(clip: {
  trackId?: string;
  animation?: string;
  commentIndex?: number | null;
  animationDuration?: number;
}): string | undefined {
  const motion = clipMotionName(clip);
  if (!motion) {
    return undefined;
  }
  if (motion === "fade-in") {
    return "Fade in";
  }
  if (clipFlyUpDuration(clip) <= 0) {
    return undefined;
  }
  if (motion === "slide-up") {
    return "Slide up";
  }
  if (motion === "zoom-in") {
    return "Zoom in";
  }
  if (motion === "shake") {
    return "Shake";
  }
  if (motion === "slide-left") {
    return "Slide left";
  }
  return undefined;
}

export function withAnimationLabel(
  label: string,
  clip: {
    trackId?: string;
    animation?: string;
    commentIndex?: number | null;
    animationDuration?: number;
  }
): string {
  const animation = clipAnimationLabel(clip);
  return animation ? `${label} · ${animation}` : label;
}

export function clipFlyUpProgress(
  localTime: number,
  duration = DEFAULT_FLY_UP_DURATION
): number {
  if (duration <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, localTime / duration));
}

export function clipFlyUpTopPercent(options: {
  restTopPercent: number;
  progress: number;
  mode: "title" | "full";
}): number {
  const extra =
    options.mode === "title"
      ? 100 - options.restTopPercent
      : 100;
  return options.restTopPercent + (1 - options.progress) * extra;
}

export function clipZoomMultiplier(progress: number): number {
  return ZOOM_IN_FROM + (1 - ZOOM_IN_FROM) * progress;
}

export function clipShakeOffsetPercent(progress: number): number {
  if (progress >= 1) {
    return 0;
  }
  const decay = 1 - progress;
  return Math.sin(progress * Math.PI * 8) * 3.5 * decay;
}

export function clipSlideLeftPercent(
  restLeftPercent: number,
  progress: number
): number {
  return restLeftPercent - (1 - progress) * 100;
}

export function clipHasTimedMotion(clip: {
  trackId?: string;
  animation?: string;
  commentIndex?: number | null;
  animationDuration?: number;
}): boolean {
  const motion = clipMotionName(clip);
  return (
    motion === "slide-up" ||
    motion === "zoom-in" ||
    motion === "shake" ||
    motion === "slide-left"
  );
}

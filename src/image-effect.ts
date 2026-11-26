/** Keep in sync with `ZOOM_IN_FROM` in clip-motion. */
const ZOOM_IN_FROM = 0.72;

export const IMAGE_ENTRANCES = [
  "none",
  "zoom-in",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "fade",
  "pop"
] as const;

export type ImageEntrance = (typeof IMAGE_ENTRANCES)[number];

export interface ImageEffectStyle {
  entrance: ImageEntrance;
  duration: number;
}

export const IMAGE_EFFECT_LIMITS = {
  duration: { min: 0.08, max: 1.2 }
} as const;

export const DEFAULT_IMAGE_EFFECT: ImageEffectStyle = {
  entrance: "none",
  duration: 0.35
};

export const IMAGE_EFFECT_LABELS: Record<ImageEntrance, string> = {
  none: "None",
  "zoom-in": "Zoom in",
  "slide-up": "Slide up",
  "slide-down": "Slide down",
  "slide-left": "Slide left",
  "slide-right": "Slide right",
  fade: "Fade",
  pop: "Pop"
};

export const IMAGE_EFFECT_CHANGED = "xamxixiu-image-effect";

export const POP_FROM = 0.55;
export const POP_PEAK = 1.08;
export const POP_PEAK_AT = 0.7;

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, raw));
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function isImageEntrance(value: unknown): value is ImageEntrance {
  return (
    typeof value === "string" &&
    (IMAGE_ENTRANCES as readonly string[]).includes(value)
  );
}

export function resolveClipImageEffect(
  clip: {
    trackId?: string;
    animation?: string;
    animationDuration?: number;
  } | undefined,
  fallback?: unknown
): ImageEffectStyle {
  const global = clampImageEffectStyle(fallback);
  if (!clip || clip.trackId !== "images") {
    return global;
  }
  return clampImageEffectStyle({
    entrance: isImageEntrance(clip.animation)
      ? clip.animation
      : global.entrance,
    duration: clip.animationDuration ?? global.duration
  });
}

export function clampImageEffectStyle(
  input?: unknown,
  fallback: ImageEffectStyle = DEFAULT_IMAGE_EFFECT
): ImageEffectStyle {
  const source = readRecord(input) as Partial<ImageEffectStyle>;
  return {
    entrance: isImageEntrance(source.entrance)
      ? source.entrance
      : fallback.entrance,
    duration: roundTime(
      clampNumber(
        source.duration,
        IMAGE_EFFECT_LIMITS.duration.min,
        IMAGE_EFFECT_LIMITS.duration.max,
        fallback.duration
      )
    )
  };
}

export function imageEffectProgress(
  localTime: number,
  duration: number
): number {
  if (duration <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, localTime / duration));
}

export function imageEffectPopScale(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= POP_PEAK_AT) {
    const t = p / POP_PEAK_AT;
    return POP_FROM + (POP_PEAK - POP_FROM) * t;
  }
  const t = (p - POP_PEAK_AT) / (1 - POP_PEAK_AT);
  return POP_PEAK + (1 - POP_PEAK) * t;
}

export function imageEffectScale(
  entrance: ImageEntrance,
  progress: number
): number {
  if (entrance === "zoom-in") {
    return ZOOM_IN_FROM + (1 - ZOOM_IN_FROM) * progress;
  }
  if (entrance === "pop") {
    return imageEffectPopScale(progress);
  }
  return 1;
}

export function imageEffectOpacity(
  entrance: ImageEntrance,
  progress: number
): number {
  if (entrance === "fade") {
    return Math.max(0, Math.min(1, progress));
  }
  return 1;
}

export function imageEffectLeftPercent(
  entrance: ImageEntrance,
  restLeftPercent: number,
  progress: number
): number {
  if (entrance === "slide-left") {
    return restLeftPercent - (1 - progress) * 100;
  }
  if (entrance === "slide-right") {
    return restLeftPercent + (1 - progress) * 100;
  }
  return restLeftPercent;
}

export function imageEffectTopPercent(
  entrance: ImageEntrance,
  restTopPercent: number,
  progress: number
): number {
  if (entrance === "slide-up") {
    return restTopPercent + (1 - progress) * 100;
  }
  if (entrance === "slide-down") {
    return restTopPercent - (1 - progress) * 100;
  }
  return restTopPercent;
}

export function imageEffectUsesScale(entrance: ImageEntrance): boolean {
  return entrance === "zoom-in" || entrance === "pop";
}

export function imageEffectUsesFade(entrance: ImageEntrance): boolean {
  return entrance === "fade";
}

function ffmpegProgress(timeExpr: string, duration: number): string {
  const d = Math.max(0.001, duration).toFixed(3);
  return `min(1\\,max(0\\,(${timeExpr})/${d}))`;
}

export function imageEffectScaleFfmpeg(
  entrance: ImageEntrance,
  progressExpr: string
): string | undefined {
  if (entrance === "zoom-in") {
    return `${ZOOM_IN_FROM}+${(1 - ZOOM_IN_FROM).toFixed(3)}*(${progressExpr})`;
  }
  if (entrance === "pop") {
    const rise = `((${progressExpr})/${POP_PEAK_AT})`;
    const fall = `(((${progressExpr})-${POP_PEAK_AT})/${(1 - POP_PEAK_AT).toFixed(3)})`;
    return `if(lte(${progressExpr}\\,${POP_PEAK_AT})\\,${POP_FROM}+${(
      POP_PEAK - POP_FROM
    ).toFixed(3)}*${rise}\\,${POP_PEAK}+${(1 - POP_PEAK).toFixed(3)}*${fall})`;
  }
  return undefined;
}

export function imageEffectLocalProgressExpr(duration: number): string {
  return ffmpegProgress("t", duration);
}

export function imageEffectGlobalProgressExpr(
  start: number,
  duration: number
): string {
  const s = Math.max(0, start).toFixed(3);
  return ffmpegProgress(`t-${s}`, duration);
}

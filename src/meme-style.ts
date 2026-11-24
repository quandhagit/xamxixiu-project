export interface MemeDefaultStyle {
  x: number;
  y: number;
  scale: number;
  fadeIn: number;
}

export const MEME_STYLE_LIMITS = {
  x: { min: -1, max: 1 },
  y: { min: -1, max: 1 },
  scale: { min: 0.2, max: 1.2 },
  fadeIn: { min: 0, max: 5 }
} as const;

export const DEFAULT_MEME_STYLE: MemeDefaultStyle = {
  x: 0,
  y: 0,
  scale: 1,
  fadeIn: 0
};

export const MEME_STYLE_CHANGED = "xamxixiu-meme-style";

export interface OverlayStyleDefaults {
  commentX: number;
  commentY: number;
  titleX: number;
  titleY: number;
  meme: MemeDefaultStyle;
}

export const DEFAULT_OVERLAY_STYLE_DEFAULTS: OverlayStyleDefaults = {
  commentX: 0,
  commentY: 0.5,
  titleX: 0,
  titleY: 0.2,
  meme: DEFAULT_MEME_STYLE
};

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

function clampAxis(value: unknown, fallback: number): number {
  return roundTime(clampNumber(value, -1, 1, fallback));
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function clampMemeDefaultStyle(
  input?: unknown,
  fallback: MemeDefaultStyle = DEFAULT_MEME_STYLE
): MemeDefaultStyle {
  const source = readRecord(input) as Partial<MemeDefaultStyle>;

  return {
    x: roundTime(
      clampNumber(
        source.x,
        MEME_STYLE_LIMITS.x.min,
        MEME_STYLE_LIMITS.x.max,
        fallback.x
      )
    ),
    y: roundTime(
      clampNumber(
        source.y,
        MEME_STYLE_LIMITS.y.min,
        MEME_STYLE_LIMITS.y.max,
        fallback.y
      )
    ),
    scale: roundTime(
      clampNumber(
        source.scale,
        MEME_STYLE_LIMITS.scale.min,
        MEME_STYLE_LIMITS.scale.max,
        fallback.scale
      )
    ),
    fadeIn: roundTime(
      clampNumber(
        source.fadeIn,
        MEME_STYLE_LIMITS.fadeIn.min,
        MEME_STYLE_LIMITS.fadeIn.max,
        fallback.fadeIn
      )
    )
  };
}

export function overlayStyleDefaultsFromSettings(settings: {
  commentCapture?: unknown;
  topicTitle?: unknown;
  meme?: unknown;
}): OverlayStyleDefaults {
  const comment = readRecord(settings.commentCapture);
  const title = readRecord(settings.topicTitle);
  return {
    commentX: clampAxis(comment.x, DEFAULT_OVERLAY_STYLE_DEFAULTS.commentX),
    commentY: clampAxis(comment.y, DEFAULT_OVERLAY_STYLE_DEFAULTS.commentY),
    titleX: clampAxis(title.x, DEFAULT_OVERLAY_STYLE_DEFAULTS.titleX),
    titleY: clampAxis(title.y, DEFAULT_OVERLAY_STYLE_DEFAULTS.titleY),
    meme: clampMemeDefaultStyle(settings.meme)
  };
}

export function applyMemeDefaultLayout<
  T extends {
    x?: number;
    y?: number;
    scale?: number;
    fadeIn?: number;
  }
>(
  overlay: T,
  defaults: MemeDefaultStyle,
  options: { keepComboFadeIn?: boolean } = {}
): T {
  return {
    ...overlay,
    x: defaults.x,
    y: defaults.y,
    scale: defaults.scale,
    fadeIn: options.keepComboFadeIn
      ? (overlay.fadeIn ?? defaults.fadeIn)
      : defaults.fadeIn
  };
}

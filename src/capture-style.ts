export interface CommentCaptureStyle {
  radius: number;
  border: number;
  borderColor: string;
  shadow: number;
  shadowColor: string;
  x: number;
  y: number;
}

export const COMMENT_CAPTURE_LIMITS = {
  radius: { min: 0, max: 80 },
  border: { min: 0, max: 24 },
  shadow: { min: 0, max: 80 },
  x: { min: -1, max: 1 },
  y: { min: -1, max: 1 }
} as const;

export const DEFAULT_COMMENT_CAPTURE_STYLE: CommentCaptureStyle = {
  radius: 0,
  border: 0,
  borderColor: "#000000",
  shadow: 0,
  shadowColor: "#000000",
  x: 0,
  y: 0.5
};

export const COMMENT_CAPTURE_DESIGN_WIDTH = 1080;

/** Same bake as overlayCanvasPx: 1 form px = 1 CSS px at 9:16 fullscreen. */
const COMMENT_OVERLAY_PX_SCALE = 16 / 9;

function overlayCanvasPx(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value * COMMENT_OVERLAY_PX_SCALE;
}

export function commentCaptureDisplayScale(
  displayedWidth: number,
  designWidth = COMMENT_CAPTURE_DESIGN_WIDTH
): number {
  if (!Number.isFinite(displayedWidth) || displayedWidth <= 0) {
    return 1;
  }
  if (!Number.isFinite(designWidth) || designWidth <= 0) {
    return 1;
  }
  return displayedWidth / designWidth;
}

function cssPx(value: number): string {
  if (value <= 0) {
    return "0px";
  }
  return `${Math.round(value * 100) / 100}px`;
}

export function shadowOffset(shadow: number): number {
  return Math.round(Math.max(0, shadow) / 3);
}

export function parseHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  const full = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (full) {
    return `#${full[1].toLowerCase()}`;
  }

  return undefined;
}

export function normalizeHexColor(
  value: unknown,
  fallback: string
): string {
  return parseHexColor(value) ?? fallback;
}

function clampInt(
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

  return Math.min(max, Math.max(min, Math.round(raw)));
}

function clampAxis(
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

  return Math.round(Math.min(max, Math.max(min, raw)) * 1000) / 1000;
}

export function clampCommentCaptureStyle(
  input?: unknown,
  fallback: CommentCaptureStyle = DEFAULT_COMMENT_CAPTURE_STYLE
): CommentCaptureStyle {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Partial<CommentCaptureStyle>)
      : {};

  return {
    radius: clampInt(
      source.radius,
      COMMENT_CAPTURE_LIMITS.radius.min,
      COMMENT_CAPTURE_LIMITS.radius.max,
      fallback.radius
    ),
    border: clampInt(
      source.border,
      COMMENT_CAPTURE_LIMITS.border.min,
      COMMENT_CAPTURE_LIMITS.border.max,
      fallback.border
    ),
    borderColor: normalizeHexColor(
      source.borderColor,
      fallback.borderColor
    ),
    shadow: clampInt(
      source.shadow,
      COMMENT_CAPTURE_LIMITS.shadow.min,
      COMMENT_CAPTURE_LIMITS.shadow.max,
      fallback.shadow
    ),
    shadowColor: normalizeHexColor(
      source.shadowColor,
      fallback.shadowColor
    ),
    x: clampAxis(
      source.x,
      COMMENT_CAPTURE_LIMITS.x.min,
      COMMENT_CAPTURE_LIMITS.x.max,
      fallback.x
    ),
    y: clampAxis(
      source.y,
      COMMENT_CAPTURE_LIMITS.y.min,
      COMMENT_CAPTURE_LIMITS.y.max,
      fallback.y
    )
  };
}

export const COMMENT_CAPTURE_STYLE_CHANGED =
  "xamxixiu-comment-capture-style";

export function commentCaptureCardStyle(
  style: CommentCaptureStyle,
  scale = 1
): {
  borderRadius: string;
  border: string;
  boxShadow: string;
} {
  const clamped = clampCommentCaptureStyle(style);
  const factor =
    Number.isFinite(scale) && scale > 0 ? scale : 1;
  const radius = overlayCanvasPx(clamped.radius) * factor;
  const border = overlayCanvasPx(clamped.border) * factor;
  const shadow = overlayCanvasPx(clamped.shadow) * factor;
  const offset = overlayCanvasPx(shadowOffset(clamped.shadow)) * factor;

  return {
    borderRadius: cssPx(radius),
    border:
      clamped.border > 0
        ? `${cssPx(border)} solid ${clamped.borderColor}`
        : "none",
    boxShadow:
      clamped.shadow > 0
        ? `0 ${cssPx(offset)} ${cssPx(shadow)} ${clamped.shadowColor}`
        : "none"
  };
}

export function commentCaptureCssText(
  style: CommentCaptureStyle,
  scale = 1
): string {
  const css = commentCaptureCardStyle(style, scale);
  return [
    `border-radius:${css.borderRadius}`,
    `border:${css.border}`,
    `box-shadow:${css.boxShadow}`
  ].join(";");
}

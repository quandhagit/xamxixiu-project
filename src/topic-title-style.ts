export interface TopicTitleStyle {
  background: string;
  border: number;
  borderColor: string;
  radius: number;
  padding: number;
  fontFamily: string;
  fontSize: number;
  color: string;
}

export const TOPIC_TITLE_FONTS = [
  { label: "Roboto", css: "Roboto, Arial, sans-serif" },
  { label: "Arial", css: "Arial, sans-serif" },
  { label: "Segoe UI", css: '"Segoe UI", sans-serif' },
  { label: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { label: "Georgia", css: "Georgia, serif" },
  { label: "Verdana", css: "Verdana, sans-serif" },
  { label: "Tahoma", css: "Tahoma, sans-serif" },
  { label: "Impact", css: "Impact, sans-serif" }
] as const;

export const TOPIC_TITLE_STYLE_LIMITS = {
  radius: { min: 0, max: 80 },
  border: { min: 0, max: 24 },
  padding: { min: 0, max: 80 },
  fontSize: { min: 1, max: 96 }
} as const;

export const DEFAULT_TOPIC_TITLE_STYLE: TopicTitleStyle = {
  background: "#000000",
  border: 0,
  borderColor: "#000000",
  radius: 24,
  padding: 24,
  fontFamily: "Roboto, Arial, sans-serif",
  fontSize: 24,
  color: "#ffffff"
};

export const TOPIC_TITLE_PREVIEW_TEXT =
  "Đây là title topic của bạn";

export const TOPIC_TITLE_DESIGN_WIDTH = 1080;

/** 9:16 frame width when it fills a 1080p landscape screen. */
export const OVERLAY_REFERENCE_WIDTH = TOPIC_TITLE_DESIGN_WIDTH * (9 / 16);

/**
 * 1 editor px = 1 CSS px at 9:16 fullscreen on a 1080p laptop.
 * Inner canvas is 1080×1920; viewport scaling is CSS transform only.
 */
export const OVERLAY_CANVAS_PX_SCALE =
  TOPIC_TITLE_DESIGN_WIDTH / OVERLAY_REFERENCE_WIDTH;

export function overlayCanvasPx(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value * OVERLAY_CANVAS_PX_SCALE;
}

export function topicTitleDisplayScale(
  displayedWidth: number,
  designWidth = TOPIC_TITLE_DESIGN_WIDTH
): number {
  if (!Number.isFinite(displayedWidth) || displayedWidth <= 0) {
    return 1;
  }
  if (!Number.isFinite(designWidth) || designWidth <= 0) {
    return 1;
  }
  return displayedWidth / designWidth;
}

export function topicTitleExportScale(
  canvasWidth = TOPIC_TITLE_DESIGN_WIDTH
): number {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) {
    return OVERLAY_CANVAS_PX_SCALE;
  }
  return OVERLAY_CANVAS_PX_SCALE;
}

export const TOPIC_TITLE_STYLE_CHANGED =
  "xamxixiu-topic-title-style";

const FONT_VALUES = new Set<string>(
  TOPIC_TITLE_FONTS.map((font) => font.css)
);

function parseHexColor(value: unknown): string | undefined {
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

function normalizeHexColor(
  value: unknown,
  fallback: string
): string {
  return parseHexColor(value) ?? fallback;
}

function cssPx(value: number): string {
  if (value <= 0) {
    return "0px";
  }
  return `${Math.round(value * 100) / 100}px`;
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

function normalizeFontFamily(
  value: unknown,
  fallback: string
): string {
  return typeof value === "string" && FONT_VALUES.has(value)
    ? value
    : fallback;
}

export function clampTopicTitleStyle(
  input?: unknown,
  fallback: TopicTitleStyle = DEFAULT_TOPIC_TITLE_STYLE
): TopicTitleStyle {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Partial<TopicTitleStyle>)
      : {};

  return {
    background: normalizeHexColor(
      source.background,
      fallback.background
    ),
    border: clampInt(
      source.border,
      TOPIC_TITLE_STYLE_LIMITS.border.min,
      TOPIC_TITLE_STYLE_LIMITS.border.max,
      fallback.border
    ),
    borderColor: normalizeHexColor(
      source.borderColor,
      fallback.borderColor
    ),
    radius: clampInt(
      source.radius,
      TOPIC_TITLE_STYLE_LIMITS.radius.min,
      TOPIC_TITLE_STYLE_LIMITS.radius.max,
      fallback.radius
    ),
    padding: clampInt(
      source.padding,
      TOPIC_TITLE_STYLE_LIMITS.padding.min,
      TOPIC_TITLE_STYLE_LIMITS.padding.max,
      fallback.padding
    ),
    fontFamily: normalizeFontFamily(
      source.fontFamily,
      fallback.fontFamily
    ),
    fontSize: clampInt(
      source.fontSize,
      TOPIC_TITLE_STYLE_LIMITS.fontSize.min,
      TOPIC_TITLE_STYLE_LIMITS.fontSize.max,
      fallback.fontSize
    ),
    color: normalizeHexColor(source.color, fallback.color)
  };
}

export function topicTitleCardStyle(
  style: TopicTitleStyle,
  scale = 1
): {
  backgroundColor: string;
  borderRadius: string;
  border: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  textAlign: "center";
  boxSizing: "border-box";
  padding: string;
  lineHeight: number;
  whiteSpace: "pre-wrap";
} {
  const clamped = clampTopicTitleStyle(style);
  const factor =
    Number.isFinite(scale) && scale > 0 ? scale : 1;
  const radius = overlayCanvasPx(clamped.radius) * factor;
  const border = overlayCanvasPx(clamped.border) * factor;
  const fontSize = overlayCanvasPx(clamped.fontSize) * factor;
  const padding = overlayCanvasPx(clamped.padding) * factor;

  return {
    backgroundColor: clamped.background,
    borderRadius: cssPx(radius),
    border:
      clamped.border > 0
        ? `${cssPx(border)} solid ${clamped.borderColor}`
        : "none",
    color: clamped.color,
    fontFamily: clamped.fontFamily,
    fontSize: cssPx(fontSize),
    fontWeight: 700,
    textAlign: "center",
    boxSizing: "border-box",
    padding: cssPx(padding),
    lineHeight: 1.2,
    whiteSpace: "pre-wrap"
  };
}

export function topicTitleCssText(
  style: TopicTitleStyle,
  scale = 1
): string {
  const css = topicTitleCardStyle(style, scale);
  return [
    `background:${css.backgroundColor}`,
    `border-radius:${css.borderRadius}`,
    `border:${css.border}`,
    `color:${css.color}`,
    `font-family:${css.fontFamily}`,
    `font-size:${css.fontSize}`,
    `font-weight:${css.fontWeight}`,
    `text-align:${css.textAlign}`,
    `box-sizing:${css.boxSizing}`,
    `padding:${css.padding}`,
    `line-height:${css.lineHeight}`,
    `white-space:${css.whiteSpace}`,
    "height:auto",
    "inset:auto"
  ].join(";");
}

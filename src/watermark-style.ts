const WATERMARK_FONTS = [
  "Roboto, Arial, sans-serif",
  "Arial, sans-serif",
  '"Segoe UI", sans-serif',
  '"Times New Roman", Times, serif',
  "Georgia, serif",
  "Verdana, sans-serif",
  "Tahoma, sans-serif",
  "Impact, sans-serif"
] as const;

const FONT_VALUES = new Set<string>(WATERMARK_FONTS);

const OVERLAY_CANVAS_PX_SCALE = 16 / 9;

function overlayCanvasPx(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value * OVERLAY_CANVAS_PX_SCALE;
}

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

function normalizeHexColor(value: unknown, fallback: string): string {
  return parseHexColor(value) ?? fallback;
}

export interface WatermarkStyle {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  blur: number;
  speed: number;
}

export const WATERMARK_STYLE_LIMITS = {
  text: { max: 80 },
  fontSize: { min: 12, max: 96 },
  blur: { min: 0, max: 24 },
  speed: { min: 40, max: 220 }
} as const;

export const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  text: "",
  fontFamily: "Roboto, Arial, sans-serif",
  fontSize: 32,
  color: "#ffffff",
  blur: 0,
  speed: 80
};

export const WATERMARK_STYLE_CHANGED = "xamxixiu-watermark-style";

export const WATERMARK_ANGLE_DEG = 28;
export const WATERMARK_CANVAS = {
  width: 1080,
  height: 1920
} as const;
export const WATERMARK_GLYPH_EM = 0.6;
export const WATERMARK_LINE_HEIGHT = 1.25;

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

function normalizeFontFamily(value: unknown, fallback: string): string {
  return typeof value === "string" && FONT_VALUES.has(value)
    ? value
    : fallback;
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.slice(0, WATERMARK_STYLE_LIMITS.text.max);
}

export function clampWatermarkStyle(
  input?: unknown,
  fallback: WatermarkStyle = DEFAULT_WATERMARK_STYLE
): WatermarkStyle {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Partial<WatermarkStyle>)
      : {};
  return {
    text: normalizeText(source.text, fallback.text),
    fontFamily: normalizeFontFamily(source.fontFamily, fallback.fontFamily),
    fontSize: clampInt(
      source.fontSize,
      WATERMARK_STYLE_LIMITS.fontSize.min,
      WATERMARK_STYLE_LIMITS.fontSize.max,
      fallback.fontSize
    ),
    color: normalizeHexColor(source.color, fallback.color),
    blur: clampInt(
      source.blur,
      WATERMARK_STYLE_LIMITS.blur.min,
      WATERMARK_STYLE_LIMITS.blur.max,
      fallback.blur
    ),
    speed: clampInt(
      source.speed,
      WATERMARK_STYLE_LIMITS.speed.min,
      WATERMARK_STYLE_LIMITS.speed.max,
      fallback.speed
    )
  };
}

export function watermarkHasText(style?: unknown): boolean {
  return clampWatermarkStyle(style).text.trim().length > 0;
}

export function watermarkOpacity(style?: unknown): number {
  const blur = clampWatermarkStyle(style).blur;
  const max = WATERMARK_STYLE_LIMITS.blur.max;
  if (max <= 0) {
    return 1;
  }
  return Math.round((1 - blur / max) * 1000) / 1000;
}

export function watermarkTextSize(style: WatermarkStyle): {
  width: number;
  height: number;
  fontSize: number;
  pad: number;
} {
  const clamped = clampWatermarkStyle(style);
  const fontSize = overlayCanvasPx(clamped.fontSize);
  const chars = Math.max(clamped.text.length, 1);
  return {
    width: Math.max(1, Math.round(fontSize * WATERMARK_GLYPH_EM * chars)),
    height: Math.max(1, Math.round(fontSize * WATERMARK_LINE_HEIGHT)),
    fontSize,
    pad: fontSize
  };
}

export function pingPong(
  distance: number,
  speed: number,
  time: number
): number {
  if (distance <= 0 || speed <= 0) {
    return 0;
  }
  const span = 2 * distance;
  let offset = (time * speed) % span;
  if (offset < 0) {
    offset += span;
  }
  return offset <= distance ? offset : span - offset;
}

export function watermarkVelocity(speed: number): { vx: number; vy: number } {
  const angle = (WATERMARK_ANGLE_DEG * Math.PI) / 180;
  return {
    vx: Math.abs(Math.cos(angle)) * speed,
    vy: Math.abs(Math.sin(angle)) * speed
  };
}

export function watermarkTravel(
  style: WatermarkStyle,
  canvas: { width: number; height: number } = WATERMARK_CANVAS
): {
  minX: number;
  minY: number;
  travelX: number;
  travelY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
} {
  const clamped = clampWatermarkStyle(style);
  const size = watermarkTextSize(clamped);
  const { vx, vy } = watermarkVelocity(clamped.speed);
  return {
    minX: size.pad,
    minY: size.pad,
    travelX: Math.max(0, canvas.width - size.width - size.pad * 2),
    travelY: Math.max(0, canvas.height - size.height - size.pad * 2),
    vx,
    vy,
    width: size.width,
    height: size.height
  };
}

export function watermarkPoint(
  time: number,
  style: WatermarkStyle,
  canvas: { width: number; height: number } = WATERMARK_CANVAS
): { x: number; y: number } {
  const travel = watermarkTravel(style, canvas);
  return {
    x: travel.minX + pingPong(travel.travelX, travel.vx, time),
    y: travel.minY + pingPong(travel.travelY, travel.vy, time)
  };
}

function ffmpegPingPong(speed: number, travel: number): string {
  if (travel <= 0 || speed <= 0) {
    return "0";
  }
  const span = 2 * travel;
  return `${travel}-abs(mod(t*${speed}\\,${span})-${travel})`;
}

export function watermarkOverlayExpressions(
  style: WatermarkStyle,
  canvas: { width: number; height: number } = WATERMARK_CANVAS,
  originPad = 0
): { x: string; y: string } {
  const travel = watermarkTravel(style, canvas);
  const xOffset = travel.minX - originPad;
  const yOffset = travel.minY - originPad;
  return {
    x: `'${xOffset}+${ffmpegPingPong(travel.vx, travel.travelX)}'`,
    y: `'${yOffset}+${ffmpegPingPong(travel.vy, travel.travelY)}'`
  };
}

export function watermarkCssText(style: WatermarkStyle): string {
  const clamped = clampWatermarkStyle(style);
  const size = watermarkTextSize(clamped);
  const opacity = watermarkOpacity(clamped);
  const parts = [
    "position:absolute",
    "left:0",
    "top:0",
    `font-family:${clamped.fontFamily}`,
    `font-size:${Math.round(size.fontSize * 100) / 100}px`,
    "font-weight:700",
    `color:${clamped.color}`,
    "white-space:nowrap",
    "line-height:1.25",
    "pointer-events:none",
    "z-index:6"
  ];
  if (opacity < 1) {
    parts.push(`opacity:${opacity}`);
  }
  return parts.join(";");
}

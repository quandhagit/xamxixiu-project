export type PreviewStageMode = "docked" | "native" | "overlay";

export function isPreviewFullscreen(
  host: { contains(node: Node): boolean } | null,
  fullscreenElement: Node | null
): boolean {
  if (!host || !fullscreenElement) {
    return false;
  }
  return host === fullscreenElement || host.contains(fullscreenElement);
}

export function previewStageMode(options: {
  native: boolean;
  overlay: boolean;
}): PreviewStageMode {
  if (options.overlay) {
    return "overlay";
  }
  if (options.native) {
    return "native";
  }
  return "docked";
}

export function previewHostClass(mode: PreviewStageMode): string {
  if (mode === "docked") {
    return "flex h-full min-h-0 shrink-0 flex-col";
  }
  if (mode === "native") {
    return "flex h-full w-full items-center justify-center bg-black";
  }
  return "fixed inset-0 z-50 flex items-center justify-center bg-black";
}

export function previewFrameClass(mode: PreviewStageMode): string {
  if (mode === "docked") {
    return "relative mx-auto aspect-[9/16] h-full max-h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line bg-black";
  }
  return "relative aspect-[9/16] h-[min(100dvh,calc(100dvw*16/9))] w-auto overflow-hidden bg-black";
}

export function previewFullscreenFrameWidth(
  viewportWidth: number,
  viewportHeight: number
): number {
  const height = Math.min(
    viewportHeight,
    viewportWidth * (16 / 9)
  );
  return height * (9 / 16);
}

export function previewCaptureStyleScale(
  mode: PreviewStageMode,
  frameWidth: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  if (mode !== "docked") {
    return 1;
  }
  const fullWidth = previewFullscreenFrameWidth(
    viewportWidth,
    viewportHeight
  );
  if (fullWidth <= 0 || frameWidth <= 0) {
    return 1;
  }
  return frameWidth / fullWidth;
}

export const PREVIEW_DESIGN_WIDTH = 1080;
export const PREVIEW_DESIGN_HEIGHT = 1920;

export function previewStageScale(frameWidth: number): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) {
    return 1;
  }
  return frameWidth / PREVIEW_DESIGN_WIDTH;
}

export function previewStageBoxStyle(scale: number): {
  position: "absolute";
  top: 0;
  left: 0;
  width: number;
  height: number;
  transform: string;
  transformOrigin: "top left";
} {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    position: "absolute",
    top: 0,
    left: 0,
    width: PREVIEW_DESIGN_WIDTH,
    height: PREVIEW_DESIGN_HEIGHT,
    transform: `scale(${factor})`,
    transformOrigin: "top left"
  };
}

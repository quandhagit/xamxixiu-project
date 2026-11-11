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
    return "flex shrink-0 flex-col";
  }
  if (mode === "native") {
    return "flex h-full w-full items-center justify-center bg-black";
  }
  return "fixed inset-0 z-50 flex items-center justify-center bg-black";
}

export function previewFrameClass(mode: PreviewStageMode): string {
  if (mode === "docked") {
    return "relative mx-auto aspect-[9/16] h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line bg-black";
  }
  return "relative aspect-[9/16] h-[min(100dvh,calc(100dvw*16/9))] w-auto overflow-hidden bg-black";
}

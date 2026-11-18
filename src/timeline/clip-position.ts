export const PREVIEW_MOVE_TRACKS = ["meme", "video", "images"] as const;

export type PreviewMoveTrackId = (typeof PREVIEW_MOVE_TRACKS)[number];

export const PREVIEW_DRAG_THRESHOLD_PX = 4;

const MOVE_TRACKS = new Set<string>(PREVIEW_MOVE_TRACKS);

export function clampClipAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}

export function canMoveClipOnPreview(clip: {
  trackId: string;
  kind?: string;
  locked?: boolean;
}): boolean {
  return (
    MOVE_TRACKS.has(clip.trackId) &&
    clip.kind !== "audio" &&
    !clip.locked
  );
}

export function clipPositionFromPointer(input: {
  originX: number;
  originY: number;
  startClipX: number;
  startClipY: number;
  clientX: number;
  clientY: number;
  stageWidth: number;
  stageHeight: number;
}): { x: number; y: number } {
  const width = input.stageWidth || 1;
  const height = input.stageHeight || 1;
  return {
    x: clampClipAxis(
      input.startClipX + (2 * (input.clientX - input.originX)) / width
    ),
    y: clampClipAxis(
      input.startClipY - (2 * (input.clientY - input.originY)) / height
    )
  };
}

export function previewPointerMoved(
  originX: number,
  originY: number,
  clientX: number,
  clientY: number,
  thresholdPx = PREVIEW_DRAG_THRESHOLD_PX
): boolean {
  const dx = clientX - originX;
  const dy = clientY - originY;
  return dx * dx + dy * dy >= thresholdPx * thresholdPx;
}

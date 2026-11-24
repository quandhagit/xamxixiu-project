export const COMMENT_STACK_PADDING = 50;
export const COMMENT_CANVAS_HEIGHT = 1920;

export function commentCenterYFromClipY(
  y: number,
  canvasHeight = COMMENT_CANVAS_HEIGHT
): number {
  return (canvasHeight / 2) * (1 - y);
}

export function commentClipYFromCenterY(
  centerY: number,
  canvasHeight = COMMENT_CANVAS_HEIGHT
): number {
  return (canvasHeight / 2 - centerY) / (canvasHeight / 2);
}

export function stackCommentPositions(
  heights: number[],
  originX: number,
  originY: number
): Array<{ x: number; y: number }> {
  const originCenter = commentCenterYFromClipY(originY);
  let previousCenterY = originCenter;
  let previousHeight = 0;
  return heights.map((height) => {
    const centerY =
      previousHeight === 0
        ? originCenter
        : previousCenterY +
          previousHeight / 2 +
          COMMENT_STACK_PADDING +
          height / 2;
    previousCenterY = centerY;
    previousHeight = height;
    return {
      x: originX,
      y: commentClipYFromCenterY(centerY)
    };
  });
}

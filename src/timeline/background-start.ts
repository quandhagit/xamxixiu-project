export function randomBackgroundStart(
  sourceDuration: number,
  timelineDuration: number
): number {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0.05) {
    return 0;
  }
  const maxStart = sourceDuration > timelineDuration + 0.05
    ? sourceDuration - timelineDuration
    : Math.max(sourceDuration - 0.05, 0);
  return Math.random() * maxStart;
}

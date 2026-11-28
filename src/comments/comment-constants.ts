/**
 * Shared comment limits. Edit here to change capture and curate behaviour.
 */

/**
 * Default number of comment images to capture. The opening post is always
 * captured in addition. Auto-scroll stops once this many are loaded, or the
 * thread runs out.
 */
export const CAPTURE_COMMENT_TARGET = 20;

/** Upper bound for the capture-count field. */
export const CAPTURE_COMMENT_MAX = 100;

/** Curate keeps between these many comments. */
export const CURATE_KEEP_MIN = 8;
export const CURATE_KEEP_MAX = 12;

/** Approximate comment count used by per-task AI prompts. */
export const ANALYZE_TARGET_COMMENT_COUNT = Math.round(
  (CURATE_KEEP_MIN + CURATE_KEEP_MAX) / 2
);

/** Max bytes for a pasted/dropped comment screenshot. */
export const COMMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const COMMENT_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif"
]);

export function isCommentImageMime(mime: string): boolean {
  return COMMENT_IMAGE_MIME_TYPES.has(mime.trim().toLowerCase());
}

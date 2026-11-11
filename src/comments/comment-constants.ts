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

/** Approximate comment count used by the Analyze prompt. */
export const ANALYZE_TARGET_COMMENT_COUNT = Math.round(
  (CURATE_KEEP_MIN + CURATE_KEEP_MAX) / 2
);

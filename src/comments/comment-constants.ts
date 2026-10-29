/**
 * Shared comment limits. Edit here to change capture and curate behaviour.
 */

/**
 * Comments to capture from a thread: at least 20 (or the whole thread if it
 * has fewer). Auto-scroll stops once this many are loaded.
 */
export const CAPTURE_COMMENT_TARGET = 30;

/** Curate keeps between these many comments. */
export const CURATE_KEEP_MIN = 8;
export const CURATE_KEEP_MAX = 12;

/** Approximate comment count used by the Analyze prompt. */
export const ANALYZE_TARGET_COMMENT_COUNT = Math.round(
  (CURATE_KEEP_MIN + CURATE_KEEP_MAX) / 2
);

/**
 * Mostle (`where-most`) scoring, shared by the API (which validates and stores results),
 * the web page (which shows and submits them) and the e2e tests.
 */

/** How many top-ranked countries count as the day's answers. */
export const TOP_N = 5;

/** How many slot-consuming guesses a player gets (no-data picks don't use a slot). */
export const MAX_GUESSES = 5;

/** Sum of the top-N values: the raw score that earns 100%. */
export function maxScore(ranking: ReadonlyArray<{ value: number }>): number {
  return ranking.slice(0, TOP_N).reduce((sum, r) => sum + r.value, 0);
}

/** Sum of the guessed countries' values. Any ranked country counts, inside the top N or not; unranked (null) adds 0. */
export function rawScore(results: ReadonlyArray<{ value: number | null }>): number {
  return results.reduce((sum, r) => sum + (r.value != null ? r.value : 0), 0);
}

/** Unrounded share (0–100) of the top-N total covered by `raw`. Used for the progress bar. */
export function coveragePct(raw: number, max: number): number {
  return max > 0 ? Math.min(100, (raw / max) * 100) : 0;
}

/** The game's score: coverage rounded to a whole percent (half up). */
export function scorePct(raw: number, max: number): number {
  return Math.round(coveragePct(raw, max));
}

import type { GuessResult } from '@shared/types';

interface GuessWith {
  result: Pick<GuessResult, 'isTopFive' | 'value'>;
}

/**
 * Sum of values for ALL guessed countries — used for the progress bar.
 * Higher-ranked countries contribute more; unranked (null value) contribute 0.
 * The bar represents: your countries' total consumption / top-5 countries' total.
 */
export function progressScore(guesses: GuessWith[]): number {
  return guesses.reduce(
    (sum, g) => sum + (g.result.value != null ? g.result.value : 0),
    0,
  );
}

/** Progress bar fill percentage (0–100), rounded to 1 decimal place. */
export function progressPct(score: number, maxScore: number): number {
  if (maxScore <= 0) { return 0; }
  return Math.round(Math.min(100, (score / maxScore) * 100) * 10) / 10;
}

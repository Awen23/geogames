import type { GuessResult, Tier } from '@shared/types';
import { isArrayOf, isBoolean, isNumber, isRecord, isString } from './storage';
import type { DetailsReader } from './useResultHistory';

/** Mostle's own fields in a saved day, beside the core ones every game records. */
export interface MostleResultDetails {
  /** Exact top-N answers found. */
  exactMatches?: number;
  /** ISO3 countries guessed (slot-consuming only), in order — matches API /result payload. */
  guessCountries?: string[];
  /** Graded guess details, same order as guessCountries. */
  guessResults?: GuessResult[];
  /** Full session order including no-data tiers (local replay only). */
  allGuesses?: Array<{ iso3: string; result: GuessResult }>;
}

const TIERS: readonly unknown[] = ['found', 'warm', 'cold', 'no-data'] satisfies Tier[];

function isGuessResult(v: unknown): v is GuessResult {
  return isRecord(v) && TIERS.includes(v.tier) && isBoolean(v.isTopFive)
    && (v.rank === null || isNumber(v.rank)) && (v.value === null || isNumber(v.value));
}

/** A graded guess as the Mostle page holds it and saves it. */
export function isGuessEntry(v: unknown): v is { iso3: string; result: GuessResult } {
  return isRecord(v) && isString(v.iso3) && isGuessResult(v.result);
}

/**
 * Reads Mostle's details from a saved day. Malformed ones are dropped (the page then regrades
 * from guessCountries, or shows less), not the whole day.
 */
export const readMostleDetails: DetailsReader<MostleResultDetails> = (v) => ({
  exactMatches: isNumber(v.exactMatches) ? v.exactMatches : undefined,
  guessCountries: isArrayOf(v.guessCountries, isString) ? v.guessCountries : undefined,
  guessResults: isArrayOf(v.guessResults, isGuessResult) ? v.guessResults : undefined,
  allGuesses: isArrayOf(v.allGuesses, isGuessEntry) ? v.allGuesses : undefined,
});

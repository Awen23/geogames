import type { GuessResult } from '@shared/types';

export function guessCounterLabel(guessesUsed: number, maxGuesses: number): string {
  if (guessesUsed >= maxGuesses) {
    return 'No guesses left';
  }
  return `Guess ${guessesUsed + 1} of ${maxGuesses}`;
}

/** Counts guesses that consume a Mostle slot (excludes no-data tiers). */
export function countSlotGuesses(guesses: ReadonlyArray<{ result: GuessResult }>): number {
  return guesses.filter((g) => g.result.tier !== 'no-data').length;
}

import { describe, it, expect } from 'vitest';
import type { GuessResult } from '@shared/types';
import { guessCounterLabel, countSlotGuesses } from './mostleGuessCounter';

function makeGuess(tier: GuessResult['tier']): { result: GuessResult } {
  return {
    result: {
      tier,
      isTopFive: tier === 'found',
      rank: tier === 'no-data' || tier === 'cold' ? null : 1,
      value: tier === 'no-data' || tier === 'cold' ? null : 100,
    },
  };
}

describe('guessCounterLabel', () => {
  it('shows the next guess number before any are used', () => {
    expect(guessCounterLabel(0, 5)).toBe('Guess 1 of 5');
  });

  it('advances after slot guesses are used', () => {
    expect(guessCounterLabel(1, 5)).toBe('Guess 2 of 5');
    expect(guessCounterLabel(4, 5)).toBe('Guess 5 of 5');
  });

  it('shows no guesses left when all slots are used', () => {
    expect(guessCounterLabel(5, 5)).toBe('No guesses left');
  });
});

describe('countSlotGuesses', () => {
  it('returns 0 for an empty list', () => {
    expect(countSlotGuesses([])).toBe(0);
  });

  it('counts found, warm, and cold tiers', () => {
    const guesses = [makeGuess('found'), makeGuess('warm'), makeGuess('cold')];
    expect(countSlotGuesses(guesses)).toBe(3);
  });

  it('excludes no-data tiers from the slot count', () => {
    const guesses = [
      makeGuess('found'),
      makeGuess('no-data'),
      makeGuess('no-data'),
      makeGuess('warm'),
    ];
    expect(countSlotGuesses(guesses)).toBe(2);
  });
});

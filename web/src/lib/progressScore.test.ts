import { describe, it, expect } from 'vitest';
import { progressScore, progressPct } from './progressScore';

// Meat top-5 (2020 OWID): HKG 145.26, TON 141.49, USA 125.63, MNG 120.41, AUS 119.78
const MAX_SCORE_MEAT = 145.26 + 141.49 + 125.63 + 120.41 + 119.78; // ≈ 652.57

function makeGuess(isTopFive: boolean, value: number | null) {
  return { result: { isTopFive, value } };
}

describe('progressScore', () => {
  it('returns 0 for no guesses', () => {
    expect(progressScore([])).toBe(0);
  });

  it('adds value for top-5 guesses', () => {
    const guesses = [makeGuess(true, 125.63)]; // USA found
    expect(progressScore(guesses)).toBeCloseTo(125.63);
  });

  it('adds value for non-top-5 guesses too — every ranked country contributes', () => {
    // China eats ~58 kg/person/year and IS included in the bar even though not top 5
    const guesses = [
      makeGuess(true, 125.63),  // USA — top-5
      makeGuess(false, 58.0),   // China — warm tier, still counts
    ];
    expect(progressScore(guesses)).toBeCloseTo(125.63 + 58.0);
  });

  it('accumulates all guessed countries regardless of tier', () => {
    const guesses = [
      makeGuess(true, 125.63),   // USA (top-5)
      makeGuess(false, 58.0),    // China (warm)
      makeGuess(true, 145.26),   // HKG (top-5)
    ];
    expect(progressScore(guesses)).toBeCloseTo(125.63 + 58.0 + 145.26);
  });

  it('handles null value (completely unranked country) as 0 contribution', () => {
    const guesses = [
      makeGuess(true, 125.63),
      makeGuess(false, null),  // country with no data in dataset
    ];
    expect(progressScore(guesses)).toBeCloseTo(125.63);
  });
});

describe('progressPct', () => {
  it('USA found alone ≈ 19.3% of meat max', () => {
    const score = progressScore([makeGuess(true, 125.63)]);
    expect(progressPct(score, MAX_SCORE_MEAT)).toBeCloseTo(19.3, 0);
  });

  it('USA + China increases the bar above USA alone', () => {
    const scoreUSA = progressScore([makeGuess(true, 125.63)]);
    const scoreUSAandChina = progressScore([makeGuess(true, 125.63), makeGuess(false, 58.0)]);

    const pctUSA = progressPct(scoreUSA, MAX_SCORE_MEAT);
    const pctBoth = progressPct(scoreUSAandChina, MAX_SCORE_MEAT);

    // China's consumption increases the bar
    expect(pctBoth).toBeGreaterThan(pctUSA);
    expect(pctBoth).toBeCloseTo((125.63 + 58.0) / MAX_SCORE_MEAT * 100, 0);
  });

  it('finding all top-5 → exactly 100%', () => {
    expect(progressPct(MAX_SCORE_MEAT, MAX_SCORE_MEAT)).toBe(100);
  });

  it('cannot exceed 100% (guessing top-5 countries is the maximum with 5 guesses)', () => {
    // Any 5 countries will sum to ≤ top-5 total by definition
    expect(progressPct(MAX_SCORE_MEAT + 1, MAX_SCORE_MEAT)).toBe(100);
  });

  it('returns 0 when maxScore is 0', () => {
    expect(progressPct(50, 0)).toBe(0);
  });
});

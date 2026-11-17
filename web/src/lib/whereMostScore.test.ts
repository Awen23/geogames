// Tests for shared/whereMostScore.ts live here because shared/ has no test runner of its own.
import { describe, it, expect } from 'vitest';
import {
  TOP_N,
  MAX_GUESSES,
  maxScore,
  rawScore,
  coveragePct,
  scorePct,
} from '@shared/whereMostScore';

// Top 5 sum to exactly 200, so each point of raw score is 0.5%.
const RANKING = [
  { iso3: 'AAA', value: 80 },
  { iso3: 'BBB', value: 50 },
  { iso3: 'CCC', value: 30 },
  { iso3: 'DDD', value: 25 },
  { iso3: 'EEE', value: 15 },
  { iso3: 'FFF', value: 9 }, // rank 6: outside the top N
  { iso3: 'GGG', value: 1 },
  { iso3: 'HHH', value: 0.99 },
];
const VALUE = Object.fromEntries(RANKING.map((r) => [r.iso3, r.value]));

/** Grade like the API does: ranked countries carry their value, unranked ones carry null. */
function results(iso3s: string[]): Array<{ value: number | null }> {
  return iso3s.map((iso3) => ({ value: VALUE[iso3] ?? null }));
}

function scoreOf(iso3s: string[]): number {
  return scorePct(rawScore(results(iso3s)), maxScore(RANKING));
}

describe('Mostle constants', () => {
  it('counts the top 5 answers and allows 5 guesses', () => {
    expect(TOP_N).toBe(5);
    expect(MAX_GUESSES).toBe(5);
  });
});

describe('maxScore', () => {
  it('sums only the top-N values', () => {
    expect(maxScore(RANKING)).toBe(200);
  });

  it('sums the whole ranking when it has fewer than N entries', () => {
    expect(maxScore(RANKING.slice(0, 3))).toBe(160);
  });

  it('is 0 for an empty ranking', () => {
    expect(maxScore([])).toBe(0);
  });
});

describe('rawScore', () => {
  it('is 0 with no guesses', () => {
    expect(rawScore([])).toBe(0);
  });

  it('adds every ranked value, inside or outside the top N, and treats null as 0', () => {
    expect(rawScore(results(['AAA', 'FFF', 'ZZZ']))).toBe(89);
  });
});

describe('scorePct', () => {
  it('no guesses scores 0', () => {
    expect(scoreOf([])).toBe(0);
  });

  it('all top-N exact scores 100', () => {
    expect(scoreOf(['AAA', 'BBB', 'CCC', 'DDD', 'EEE'])).toBe(100);
  });

  it('partial: one or two top-N answers', () => {
    expect(scoreOf(['AAA'])).toBe(40);
    expect(scoreOf(['AAA', 'CCC'])).toBe(55);
  });

  it('a guess outside the top N still adds its value', () => {
    expect(scoreOf(['FFF'])).toBe(5); // 4.5% rounds up
    expect(scoreOf(['AAA', 'FFF'])).toBe(45); // 44.5% rounds up
  });

  it('unranked guesses add nothing', () => {
    expect(scoreOf(['ZZZ', 'YYY'])).toBe(0);
    expect(scoreOf(['AAA', 'ZZZ'])).toBe(40);
  });

  it('max guesses: five guesses mixing top-N and outside', () => {
    const guesses = ['AAA', 'BBB', 'CCC', 'DDD', 'FFF'];
    expect(guesses).toHaveLength(MAX_GUESSES);
    expect(scoreOf(guesses)).toBe(97);
  });

  it('rounds half up, not to even', () => {
    expect(scorePct(1, 200)).toBe(1); // 0.5
    expect(scorePct(3, 200)).toBe(2); // 1.5
    expect(scorePct(5, 200)).toBe(3); // 2.5
  });

  it('rounds just below .5 down', () => {
    expect(scoreOf(['HHH'])).toBe(0); // 0.495
    expect(scorePct(2.99, 200)).toBe(1); // 1.495
    expect(scorePct(198.99, 200)).toBe(99); // 99.495
  });

  it('99.5% rounds up to 100 without every top-N answer', () => {
    expect(scorePct(199, 200)).toBe(100);
  });

  it('caps at 100', () => {
    expect(scorePct(250, 200)).toBe(100);
  });

  it('is 0 when the max is 0', () => {
    expect(scorePct(50, 0)).toBe(0);
    expect(scorePct(0, 0)).toBe(0);
  });

  it('is an integer for non-terminating fractions', () => {
    expect(scorePct(110, 200)).toBe(55); // 55.00000000000001
    expect(scorePct(1, 3)).toBe(33);
    expect(scorePct(2, 3)).toBe(67);
  });
});

describe('coveragePct (progress bar)', () => {
  it('is the unrounded share of the top-N total', () => {
    expect(coveragePct(1, 200)).toBe(0.5);
    expect(coveragePct(0.99, 200)).toBeCloseTo(0.495, 10);
  });

  it('caps at 100 and is 0 when the max is 0', () => {
    expect(coveragePct(250, 200)).toBe(100);
    expect(coveragePct(50, 0)).toBe(0);
  });
});

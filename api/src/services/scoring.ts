import type { Question, GuessResult, Tier } from '@shared/types';

const TOP_N = 5;

function rankToTier(rank: number): Tier {
  if (rank < TOP_N) { return 'found'; }
  return 'warm';
}

export function scoreGuess(q: Question, iso3: string): GuessResult {
  const covered = new Set(q.coveredIsoCodes);
  const rank = q.ranking.findIndex((r) => r.iso3 === iso3);
  if (rank !== -1) {
    const isTopFive = rank < TOP_N;
    return {
      tier: rankToTier(rank),
      rank: rank + 1,
      value: q.ranking[rank].value,
      isTopFive,
    };
  }

  if (covered.has(iso3)) {
    return {
      tier: 'cold',
      rank: null,
      value: null,
      isTopFive: false,
    };
  }

  return {
    tier: 'no-data',
    rank: null,
    value: null,
    isTopFive: false,
  };
}

/** Sum of the top-N values — the maximum achievable score. */
export function maxScore(q: Question): number {
  return q.ranking.slice(0, TOP_N).reduce((sum, r) => sum + r.value, 0);
}

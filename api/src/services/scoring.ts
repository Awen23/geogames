import type { Question, GuessResult, Tier } from '@shared/types';

const TOP_N = 5;

function rankToTier(rank: number): Tier {
  if (rank < TOP_N) { return 'found'; }
  return 'warm';
}

export function scoreGuess(q: Question, iso3: string): GuessResult {
  const rank = q.ranking.findIndex((r) => r.iso3 === iso3);
  const isTopFive = rank !== -1 && rank < TOP_N;
  const tier: Tier = rank === -1 ? 'cold' : rankToTier(rank);

  return {
    tier,
    rank: rank === -1 ? null : rank + 1,
    value: rank === -1 ? null : q.ranking[rank].value,
    isTopFive,
  };
}

/** Sum of the top-N values — the maximum achievable score. */
export function maxScore(q: Question): number {
  return q.ranking.slice(0, TOP_N).reduce((sum, r) => sum + r.value, 0);
}

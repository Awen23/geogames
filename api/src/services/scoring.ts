import type { Question, GuessResult, Tier } from '@shared/types';
import { haversineKm, bearingDeg } from '@shared/distance';

export interface Centroids {
  [iso3: string]: { lat: number; lon: number };
}

function rankToTier(rank: number): Tier {
  if (rank === 0) { return 'bullseye'; }
  if (rank < 5) { return 'top5'; }
  if (rank < 15) { return 'top15'; }
  return 'cold';
}

export function scoreGuess(q: Question, iso3: string, centroids: Centroids): GuessResult {
  const rank = q.ranking.findIndex((r) => r.iso3 === iso3);
  const tier = rank === -1 ? 'cold' : rankToTier(rank);
  const targetIso3 = q.ranking[0].iso3;
  const target = centroids[targetIso3];
  const guess = centroids[iso3];

  if (!target) {
    console.warn(`No centroid for target country ${targetIso3}`);
  }

  const from = guess ?? target;
  return {
    tier,
    rank: rank === -1 ? null : rank + 1,
    isCorrect: tier === 'bullseye',
    distanceKm: target && guess ? Math.round(haversineKm(from, target)) : 0,
    bearingDeg: target && guess ? Math.round(bearingDeg(from, target)) : 0,
  };
}

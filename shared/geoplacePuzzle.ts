import centroids from './centroids.json';
import { haversineKm } from './distance';
import { COUNTRIES } from './guessCountries';
import type { GeoplacePuzzle } from './types';

type CentroidMap = Record<string, { lat: number; lon: number }>;
const CENTROID_MAP = centroids as CentroidMap;

export interface PoolCountry {
  iso3: string;
  lat: number;
  lon: number;
}

/** Placle pool: the canonical countries (COUNTRIES) that have a centroid. */
export const GEOPLACE_POOL: PoolCountry[] = COUNTRIES.flatMap((c) => {
  const pos = CENTROID_MAP[c.iso3];
  return pos ? [{ iso3: c.iso3, lat: pos.lat, lon: pos.lon }] : [];
});

const CHAIN_MIN_KM = 500;
const CHAIN_MAX_KM = 2000;
/** Round 1 target must be within this distance of the reference (centroid-to-centroid). */
const REF_TO_ROUND1_MAX_KM = 3000;

/** FNV-1a 32-bit hash (true 32-bit multiply via Math.imul) */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/** murmur3 32-bit finaliser: plain FNV-1a of near-identical strings is too unevenly spread. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Per-day score for a country at a puzzle step; the lowest score wins (ties break on iso3).
 * A score depends only on (date, step, iso3), so the pool's order never matters, and
 * adding or removing a country leaves the others' relative order unchanged: the winner
 * only changes if the removed country was the winner or the added one scores lower.
 */
function score(date: string, step: string, iso3: string): number {
  return fmix32(fnv1a(`geoplace:${date}:${step}:${iso3}`));
}

interface Scored {
  c: PoolCountry;
  score: number;
}

function scoredAt(date: string, step: string): (c: PoolCountry) => Scored {
  return (c) => ({ c, score: score(date, step, c.iso3) });
}

function compareScored(a: Scored, b: Scored): number {
  return a.score - b.score || (a.c.iso3 < b.c.iso3 ? -1 : a.c.iso3 > b.c.iso3 ? 1 : 0);
}

/** All candidates, lowest score first (used for the reference retry loop). */
function byScore(date: string, step: string, candidates: PoolCountry[]): PoolCountry[] {
  return candidates.map(scoredAt(date, step)).sort(compareScored).map(({ c }) => c);
}

function pickLowest(date: string, step: string, candidates: PoolCountry[]): PoolCountry {
  return candidates
    .map(scoredAt(date, step))
    .reduce((best, x) => (compareScored(x, best) < 0 ? x : best)).c;
}

function countriesWithin(
  pool: PoolCountry[],
  from: PoolCountry,
  exclude: Set<string>,
  maxKm: number,
): PoolCountry[] {
  return pool.filter((c) => {
    if (exclude.has(c.iso3) || c.iso3 === from.iso3) { return false; }
    return haversineKm(from, c) <= maxKm;
  });
}

/**
 * Pick a country from `pool` within [minKm, maxKm] of `from`, excluding `exclude`.
 * Falls back to twice maxKm, then any non-excluded country, if nothing is in range.
 */
function pickNear(
  date: string,
  step: string,
  pool: PoolCountry[],
  from: PoolCountry,
  exclude: Set<string>,
  minKm = CHAIN_MIN_KM,
  maxKm = CHAIN_MAX_KM,
): PoolCountry {
  const inRange = pool.filter((c) => {
    if (exclude.has(c.iso3) || c.iso3 === from.iso3) { return false; }
    const d = haversineKm(from, c);
    return d >= minKm && d <= maxKm;
  });

  if (inRange.length > 0) { return pickLowest(date, step, inRange); }

  const wider = pool.filter((c) => {
    if (exclude.has(c.iso3) || c.iso3 === from.iso3) { return false; }
    const d = haversineKm(from, c);
    return d >= minKm && d <= maxKm * 2;
  });

  if (wider.length > 0) { return pickLowest(date, step, wider); }

  const any = pool.filter((c) => !exclude.has(c.iso3) && c.iso3 !== from.iso3);
  return pickLowest(date, step, any);
}

/** Pure puzzle generator for a UTC date (YYYY-MM-DD) and country pool. */
export function generatePuzzle(date: string, pool: PoolCountry[]): GeoplacePuzzle {
  for (const reference of byScore(date, 'reference', pool)) {
    const used = new Set<string>([reference.iso3]);
    const round1Candidates = countriesWithin(pool, reference, used, REF_TO_ROUND1_MAX_KM);
    if (round1Candidates.length === 0) {
      continue;
    }

    const t1 = pickLowest(date, 'round1', round1Candidates);
    used.add(t1.iso3);

    const t2 = pickNear(date, 'round2', pool, t1, used);
    used.add(t2.iso3);

    const t3 = pickNear(date, 'round3', pool, t2, used);
    used.add(t3.iso3);

    return {
      referenceIso3: reference.iso3,
      rounds: [{ targetIso3: t1.iso3 }, { targetIso3: t2.iso3 }, { targetIso3: t3.iso3 }],
    };
  }

  throw new Error(`GeoPlace puzzle generation failed for ${date}`);
}

export function getTodayPuzzle(overrideDate?: string): GeoplacePuzzle {
  const date = overrideDate ?? new Date().toISOString().slice(0, 10);
  return generatePuzzle(date, GEOPLACE_POOL);
}

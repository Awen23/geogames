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
export const GEOPLACE_POOL: PoolCountry[] = COUNTRIES.flatMap((country) => {
  const centroid = CENTROID_MAP[country.iso3];
  return centroid ? [{ iso3: country.iso3, lat: centroid.lat, lon: centroid.lon }] : [];
});

const CHAIN_MIN_KM = 500;
const CHAIN_MAX_KM = 2000;
/** Round 1 target must be within this distance of the reference (centroid-to-centroid). */
const REFERENCE_TO_ROUND1_MAX_KM = 3000;

/** FNV-1a 32-bit hash (true 32-bit multiply via Math.imul) */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/**
 * MurmurHash3's 32-bit finaliser, which mixes every input bit into every output bit. FNV-1a
 * alone spreads keys that differ only in the trailing iso3 unevenly, so some countries would
 * be picked far more often than others.
 */
function fmix32(hash: number): number {
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
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
  country: PoolCountry;
  score: number;
}

function scoredAt(date: string, step: string): (country: PoolCountry) => Scored {
  return (country) => ({ country, score: score(date, step, country.iso3) });
}

function compareScored(a: Scored, b: Scored): number {
  const isoA = a.country.iso3;
  const isoB = b.country.iso3;
  return a.score - b.score || (isoA < isoB ? -1 : isoA > isoB ? 1 : 0);
}

/** All candidates, lowest score first (used for the reference retry loop). */
function byScore(date: string, step: string, candidates: PoolCountry[]): PoolCountry[] {
  return candidates.map(scoredAt(date, step)).sort(compareScored).map(({ country }) => country);
}

function pickLowest(date: string, step: string, candidates: PoolCountry[]): PoolCountry {
  return candidates
    .map(scoredAt(date, step))
    .reduce((best, candidate) => (compareScored(candidate, best) < 0 ? candidate : best)).country;
}

function countriesWithin(
  pool: PoolCountry[],
  from: PoolCountry,
  exclude: Set<string>,
  maxKm: number,
): PoolCountry[] {
  return pool.filter((country) => {
    if (exclude.has(country.iso3) || country.iso3 === from.iso3) { return false; }
    return haversineKm(from, country) <= maxKm;
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
  const inRange = pool.filter((country) => {
    if (exclude.has(country.iso3) || country.iso3 === from.iso3) { return false; }
    const distanceKm = haversineKm(from, country);
    return distanceKm >= minKm && distanceKm <= maxKm;
  });

  if (inRange.length > 0) { return pickLowest(date, step, inRange); }

  const wider = pool.filter((country) => {
    if (exclude.has(country.iso3) || country.iso3 === from.iso3) { return false; }
    const distanceKm = haversineKm(from, country);
    return distanceKm >= minKm && distanceKm <= maxKm * 2;
  });

  if (wider.length > 0) { return pickLowest(date, step, wider); }

  const anyRemaining = pool.filter(
    (country) => !exclude.has(country.iso3) && country.iso3 !== from.iso3,
  );
  return pickLowest(date, step, anyRemaining);
}

/** Pure puzzle generator for a UTC date (YYYY-MM-DD) and country pool. */
export function generatePuzzle(date: string, pool: PoolCountry[]): GeoplacePuzzle {
  for (const reference of byScore(date, 'reference', pool)) {
    const used = new Set<string>([reference.iso3]);
    const round1Candidates = countriesWithin(pool, reference, used, REFERENCE_TO_ROUND1_MAX_KM);
    if (round1Candidates.length === 0) {
      continue;
    }

    const round1Target = pickLowest(date, 'round1', round1Candidates);
    used.add(round1Target.iso3);

    const round2Target = pickNear(date, 'round2', pool, round1Target, used);
    used.add(round2Target.iso3);

    const round3Target = pickNear(date, 'round3', pool, round2Target, used);
    used.add(round3Target.iso3);

    return {
      referenceIso3: reference.iso3,
      rounds: [
        { targetIso3: round1Target.iso3 },
        { targetIso3: round2Target.iso3 },
        { targetIso3: round3Target.iso3 },
      ],
    };
  }

  throw new Error(`GeoPlace puzzle generation failed for ${date}`);
}

export function getTodayPuzzle(overrideDate?: string): GeoplacePuzzle {
  const date = overrideDate ?? new Date().toISOString().slice(0, 10);
  return generatePuzzle(date, GEOPLACE_POOL);
}

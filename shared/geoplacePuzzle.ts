import centroids from './centroids.json';
import { haversineKm } from './distance';
import type { GeoplacePuzzle } from './types';

type CentroidMap = Record<string, { lat: number; lon: number }>;
const CENTROID_MAP = centroids as CentroidMap;

interface CountryEntry {
  iso3: string;
  lat: number;
  lon: number;
}

const COUNTRIES: CountryEntry[] = Object.entries(CENTROID_MAP).map(([iso3, pos]) => ({
  iso3,
  lat: pos.lat,
  lon: pos.lon,
}));

const CHAIN_MIN_KM = 500;
const CHAIN_MAX_KM = 2000;
const REF_MAX_KM = 1200;

/** FNV-1a 32-bit hash — matches the implementation in api/src/services/daily.ts */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/** Mulberry32 PRNG — returns a function that yields floats in [0, 1) */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function pickFrom<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Pick a country from COUNTRIES within [minKm, maxKm] of `from`, excluding `exclude`.
 * Falls back to nearest non-excluded country if no candidate found in range.
 */
function pickNear(
  rng: () => number,
  from: CountryEntry,
  exclude: Set<string>,
  minKm = CHAIN_MIN_KM,
  maxKm = CHAIN_MAX_KM,
): CountryEntry {
  const inRange = COUNTRIES.filter((c) => {
    if (exclude.has(c.iso3) || c.iso3 === from.iso3) { return false; }
    const d = haversineKm(from, c);
    return d >= minKm && d <= maxKm;
  });

  if (inRange.length > 0) { return pickFrom(rng, inRange); }

  // Fallback: relax to twice the max distance
  const wider = COUNTRIES.filter((c) => {
    if (exclude.has(c.iso3) || c.iso3 === from.iso3) { return false; }
    const d = haversineKm(from, c);
    return d >= minKm && d <= maxKm * 2;
  });

  if (wider.length > 0) { return pickFrom(rng, wider); }

  // Last resort: any non-excluded country
  const any = COUNTRIES.filter((c) => !exclude.has(c.iso3) && c.iso3 !== from.iso3);
  return pickFrom(rng, any);
}

export function getTodayPuzzle(overrideDate?: string): GeoplacePuzzle {
  const date = overrideDate ?? new Date().toISOString().slice(0, 10);
  const rng = mulberry32(fnv1a(`geoplace:${date}`));

  const t1 = pickFrom(rng, COUNTRIES);
  const used = new Set<string>([t1.iso3]);

  const t2 = pickNear(rng, t1, used);
  used.add(t2.iso3);

  const t3 = pickNear(rng, t2, used);
  used.add(t3.iso3);

  // Reference: within REF_MAX_KM of t1, not a target
  const refCandidates = COUNTRIES.filter(
    (c) => !used.has(c.iso3) && haversineKm(c, t1) <= REF_MAX_KM,
  );
  const reference =
    refCandidates.length > 0
      ? pickFrom(rng, refCandidates)
      : pickFrom(rng, COUNTRIES.filter((c) => !used.has(c.iso3)));

  return {
    referenceIso3: reference.iso3,
    rounds: [{ targetIso3: t1.iso3 }, { targetIso3: t2.iso3 }, { targetIso3: t3.iso3 }],
  };
}

import { describe, it, expect } from 'vitest';
import { GEOPLACE_POOL, generatePuzzle, getTodayPuzzle } from '@shared/geoplacePuzzle';
import { COUNTRIES, countryName } from '@shared/guessCountries';
import { haversineKm } from '@shared/distance';
import type { GeoplacePuzzle } from '@shared/types';
import centroids from '@shared/centroids.json';

const CENTROID_MAP = centroids as Record<string, { lat: number; lon: number }>;
const REFERENCE_TO_ROUND1_MAX_KM = 3000;
const CHAIN_MIN_KM = 500;
const CHAIN_MAX_KM = 2000;
const CHAIN_WIDER_MAX_KM = CHAIN_MAX_KM * 2;

/** Centroid pairs with no other country within REFERENCE_TO_ROUND1_MAX_KM — must never be reference. */
const ISOLATED_REFERENCE_ISO3S = new Set(['AUS', 'NZL']);

function* utcDatesBetween(startYear: number, endYear: number): Generator<string> {
  for (let year = startYear; year <= endYear; year++) {
    const end = Date.UTC(year + 1, 0, 1);
    for (let t = Date.UTC(year, 0, 1); t < end; t += 86_400_000) {
      yield new Date(t).toISOString().slice(0, 10);
    }
  }
}

function puzzleIso3s(puzzle: GeoplacePuzzle): string[] {
  return [
    puzzle.referenceIso3,
    puzzle.rounds[0].targetIso3,
    puzzle.rounds[1].targetIso3,
    puzzle.rounds[2].targetIso3,
  ];
}

function legDistancesKm(puzzle: GeoplacePuzzle): {
  refToRound1: number;
  round1ToRound2: number;
  round2ToRound3: number;
} {
  const ref = CENTROID_MAP[puzzle.referenceIso3];
  const t1 = CENTROID_MAP[puzzle.rounds[0].targetIso3];
  const t2 = CENTROID_MAP[puzzle.rounds[1].targetIso3];
  const t3 = CENTROID_MAP[puzzle.rounds[2].targetIso3];
  return {
    refToRound1: haversineKm(ref, t1),
    round1ToRound2: haversineKm(t1, t2),
    round2ToRound3: haversineKm(t2, t3),
  };
}

describe('getTodayPuzzle', () => {
  it('is deterministic for a given UTC date', () => {
    const a = getTodayPuzzle('2026-05-30');
    const b = getTodayPuzzle('2026-05-30');
    expect(b).toEqual(a);
  });

  it('varies across dates in a calendar year', () => {
    const puzzles = new Set<string>();
    for (const date of utcDatesBetween(2026, 2026)) {
      puzzles.add(JSON.stringify(getTodayPuzzle(date)));
    }
    expect(puzzles.size).toBeGreaterThan(300);
  });

  it('returns three rounds and stable puzzle shape', () => {
    const puzzle = getTodayPuzzle('2026-06-15');
    expect(puzzle.rounds).toHaveLength(3);
    for (const round of puzzle.rounds) {
      expect(round).toEqual({ targetIso3: expect.any(String) });
    }
  });

  it('uses four distinct countries (reference plus three targets)', () => {
    for (const date of utcDatesBetween(2026, 2026)) {
      const puzzle = getTodayPuzzle(date);
      expect(new Set(puzzleIso3s(puzzle)).size).toBe(4);
    }
  });

  it('never places the reference among the targets', () => {
    for (const date of utcDatesBetween(2026, 2026)) {
      const puzzle = getTodayPuzzle(date);
      const targets = puzzle.rounds.map((r) => r.targetIso3);
      expect(targets).not.toContain(puzzle.referenceIso3);
    }
  });

  it('only picks countries that have centroids', () => {
    const puzzle = getTodayPuzzle('2026-03-01');
    for (const iso3 of puzzleIso3s(puzzle)) {
      expect(CENTROID_MAP[iso3]).toBeDefined();
    }
  });

  it('keeps round 1 within 3000 km of the reference', () => {
    for (const date of utcDatesBetween(2026, 2026)) {
      const { refToRound1 } = legDistancesKm(getTodayPuzzle(date));
      expect(refToRound1).toBeLessThanOrEqual(REFERENCE_TO_ROUND1_MAX_KM);
    }
  });

  it('never uses Australia or New Zealand as reference (no round-1 neighbour within 3000 km)', () => {
    for (const date of utcDatesBetween(2024, 2028)) {
      const puzzle = getTodayPuzzle(date);
      expect(ISOLATED_REFERENCE_ISO3S.has(puzzle.referenceIso3)).toBe(false);
    }
  });

  it('does not throw across several years of UTC dates', () => {
    for (const date of utcDatesBetween(2024, 2028)) {
      expect(() => getTodayPuzzle(date)).not.toThrow();
    }
  });

  it('matches golden puzzles for fixed dates (seed regression)', () => {
    expect(getTodayPuzzle('2026-01-01')).toEqual({
      referenceIso3: 'JAM',
      rounds: [
        { targetIso3: 'PAN' },
        { targetIso3: 'DOM' },
        { targetIso3: 'COL' },
      ],
    });
    expect(getTodayPuzzle('2026-05-30')).toEqual({
      referenceIso3: 'TUN',
      rounds: [
        { targetIso3: 'HUN' },
        { targetIso3: 'ALB' },
        { targetIso3: 'SVK' },
      ],
    });
    expect(getTodayPuzzle('2026-12-31')).toEqual({
      referenceIso3: 'DEU',
      rounds: [
        { targetIso3: 'BGR' },
        { targetIso3: 'CHE' },
        { targetIso3: 'POL' },
      ],
    });
  });

  describe('chain legs (rounds 2–3)', () => {
    it('usually keeps consecutive targets within the preferred chain band', () => {
      let inPreferredBand = 0;
      let total = 0;
      for (const date of utcDatesBetween(2026, 2026)) {
        const legs = legDistancesKm(getTodayPuzzle(date));
        for (const km of [legs.round1ToRound2, legs.round2ToRound3]) {
          total++;
          if (km >= CHAIN_MIN_KM && km <= CHAIN_MAX_KM) {
            inPreferredBand++;
          }
        }
      }
      expect(inPreferredBand / total).toBeGreaterThan(0.85);
    });

    it('keeps chain legs within the relaxed pickNear ceiling (4000 km)', () => {
      for (const date of utcDatesBetween(2026, 2026)) {
        const legs = legDistancesKm(getTodayPuzzle(date));
        expect(legs.round1ToRound2).toBeLessThanOrEqual(CHAIN_WIDER_MAX_KM + 1);
        expect(legs.round2ToRound3).toBeLessThanOrEqual(CHAIN_WIDER_MAX_KM + 1);
      }
    });
  });
});

describe('Placle country pool', () => {
  const canonicalIso3s = new Set(COUNTRIES.map((c) => c.iso3));

  it('only contains countries from the canonical COUNTRIES list', () => {
    expect(GEOPLACE_POOL.filter((c) => !canonicalIso3s.has(c.iso3)).map((c) => c.iso3)).toEqual([]);
  });

  it('shows Gabon by name', () => {
    expect(countryName('GAB')).toBe('Gabon');
  });
});

describe('generatePuzzle stability', () => {
  const dates = [...utcDatesBetween(2026, 2026)];

  it('is unchanged when a country that is not in the puzzle is removed from the pool', () => {
    dates.forEach((date, i) => {
      const puzzle = generatePuzzle(date, GEOPLACE_POOL);
      const inPuzzle = new Set(puzzleIso3s(puzzle));
      const absent = GEOPLACE_POOL.filter((c) => !inPuzzle.has(c.iso3));
      // A few different absent countries per day, rotating through the pool across the year
      for (let k = 0; k < 3; k++) {
        const removed = absent[(i * 3 + k) % absent.length].iso3;
        const smaller = GEOPLACE_POOL.filter((c) => c.iso3 !== removed);
        expect(generatePuzzle(date, smaller), `${date} without ${removed}`).toEqual(puzzle);
      }
    });
  });

  it('does not depend on the order of the pool', () => {
    const reversed = [...GEOPLACE_POOL].reverse();
    const interleaved = [
      ...GEOPLACE_POOL.filter((_, i) => i % 2 === 1),
      ...GEOPLACE_POOL.filter((_, i) => i % 2 === 0),
    ];
    for (const date of dates) {
      const puzzle = generatePuzzle(date, GEOPLACE_POOL);
      expect(generatePuzzle(date, reversed), date).toEqual(puzzle);
      expect(generatePuzzle(date, interleaved), date).toEqual(puzzle);
    }
  });
});

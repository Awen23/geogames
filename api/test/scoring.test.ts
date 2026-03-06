import { describe, it, expect } from 'vitest';
import { scoreGuess } from '../src/services/scoring';
import { haversineKm } from '@shared/distance';
import type { Question } from '@shared/types';
import type { Centroids } from '../src/services/scoring';

const CENTROIDS: Centroids = {
  CZE: { lat: 49.8, lon: 15.5 },
  AUT: { lat: 47.5, lon: 14.5 },
  ROU: { lat: 45.9, lon: 24.9 },
  DEU: { lat: 51.2, lon: 10.5 },
  POL: { lat: 51.9, lon: 19.1 },
  GBR: { lat: 54.4, lon: -2.4 },
  AUS: { lat: -25.3, lon: 133.8 },
  JPN: { lat: 35.7, lon: 139.7 },
};

const BEER_QUESTION: Question = {
  id: 'beer-2019',
  prompt: 'Which country drinks the most beer per person?',
  metric: 'Litres per capita',
  unit: 'L/capita/yr',
  source: 'Kirin',
  sourceUrl: 'https://example.com',
  ranking: [
    { iso3: 'CZE', value: 126 },
    { iso3: 'AUT', value: 107.8 },
    { iso3: 'ROU', value: 100.3 },
    { iso3: 'DEU', value: 99 },
    { iso3: 'POL', value: 97.7 },
    { iso3: 'GBR', value: 70.3 },
    { iso3: 'AUS', value: 75.1 },
    { iso3: 'JPN', value: 38.4 },
  ],
};

describe('scoreGuess', () => {
  it('rank 0 → bullseye, isCorrect true', () => {
    const result = scoreGuess(BEER_QUESTION, 'CZE', CENTROIDS);
    expect(result.tier).toBe('bullseye');
    expect(result.isCorrect).toBe(true);
    expect(result.rank).toBe(1);
    expect(result.distanceKm).toBe(0);
  });

  it('rank 1–4 → top5, isCorrect false', () => {
    const result = scoreGuess(BEER_QUESTION, 'AUT', CENTROIDS);
    expect(result.tier).toBe('top5');
    expect(result.isCorrect).toBe(false);
    expect(result.rank).toBe(2);
  });

  it('rank 5+ → top15 for ranks up to 14', () => {
    const result = scoreGuess(BEER_QUESTION, 'GBR', CENTROIDS);
    expect(result.tier).toBe('top15');
    expect(result.rank).toBe(6);
  });

  it('country not in ranking → rank null, tier cold', () => {
    const result = scoreGuess(BEER_QUESTION, 'JPN', CENTROIDS);
    // JPN is rank 8 (0-based 7), which is top15
    expect(result.tier).toBe('top15');

    const unknownResult = scoreGuess(BEER_QUESTION, 'BRA', CENTROIDS);
    expect(unknownResult.rank).toBeNull();
    expect(unknownResult.tier).toBe('cold');
  });

  it('distanceKm is positive for a wrong country', () => {
    const result = scoreGuess(BEER_QUESTION, 'AUS', CENTROIDS);
    expect(result.distanceKm).toBeGreaterThan(1000);
  });

  it('bearingDeg is in [0, 360)', () => {
    const result = scoreGuess(BEER_QUESTION, 'AUT', CENTROIDS);
    expect(result.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(result.bearingDeg).toBeLessThan(360);
  });
});

describe('distance sanity checks', () => {
  it('London to Sydney ≈ 16990 km', () => {
    const londonToSydney = haversineKm(
      { lat: 51.5, lon: -0.1 },
      { lat: -33.9, lon: 151.2 },
    );
    expect(londonToSydney).toBeCloseTo(16990, -2);
  });
});

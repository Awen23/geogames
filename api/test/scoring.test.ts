import { describe, it, expect } from 'vitest';
import { scoreGuess, maxScore } from '../src/services/scoring';
import { haversineKm } from '@shared/distance';
import type { Question } from '@shared/types';

const BEER_QUESTION: Question = {
  id: 'beer-test',
  prompt: 'Which country drinks the most beer per person?',
  description: 'Test fixture.',
  metric: 'Litres per capita',
  unit: 'L/capita/yr',
  source: 'Test',
  sourceUrl: 'https://example.com',
  icon: '🍺',
  mapEmbedUrl: 'https://ourworldindata.org/grapher/beer-consumption-per-person?tab=map',
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
  it('rank 0 → found, isTopFive true', () => {
    const result = scoreGuess(BEER_QUESTION, 'CZE');
    expect(result.tier).toBe('found');
    expect(result.isTopFive).toBe(true);
    expect(result.rank).toBe(1);
    expect(result.value).toBe(126);
  });

  it('rank 1–4 → found, isTopFive true', () => {
    const result = scoreGuess(BEER_QUESTION, 'AUT');
    expect(result.tier).toBe('found');
    expect(result.isTopFive).toBe(true);
    expect(result.rank).toBe(2);
  });

  it('rank 5+ → warm, isTopFive false', () => {
    const result = scoreGuess(BEER_QUESTION, 'GBR');
    expect(result.tier).toBe('warm');
    expect(result.isTopFive).toBe(false);
    expect(result.rank).toBe(6);
    expect(result.value).toBe(70.3);
  });

  it('country not in ranking → rank null, tier cold, isTopFive false', () => {
    const result = scoreGuess(BEER_QUESTION, 'BRA');
    expect(result.tier).toBe('cold');
    expect(result.isTopFive).toBe(false);
    expect(result.rank).toBeNull();
    expect(result.value).toBeNull();
  });

  it('no distanceKm or bearingDeg on result', () => {
    const result = scoreGuess(BEER_QUESTION, 'AUT');
    expect((result as Record<string, unknown>).distanceKm).toBeUndefined();
    expect((result as Record<string, unknown>).bearingDeg).toBeUndefined();
  });
});

describe('maxScore', () => {
  it('sums the top-5 values', () => {
    const expected = 126 + 107.8 + 100.3 + 99 + 97.7;
    expect(maxScore(BEER_QUESTION)).toBeCloseTo(expected, 5);
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

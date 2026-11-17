/**
 * Today's puzzles in the e2e database. resetDb.ts schedules these for today before the api starts,
 * so tests can assert against known data instead of whatever the shuffled schedule picked.
 */

/** Mostle: beer consumption per person in 2020 (api/src/data/questions.ts and its CSV). */
export const MOSTLE = {
  questionId: 'beer-per-capita-2020',
} as const;

/** Maple: an implemented city from shared/cityRevealCities.ts. */
export const MAPLE_CITY_ID = 'bern';

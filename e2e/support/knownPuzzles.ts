/**
 * Today's puzzles in the e2e database. resetDb.ts schedules these for today before the api starts,
 * so tests can assert against known data instead of whatever the shuffled schedule picked.
 */

/**
 * Mostle: beer consumption per person in 2020 (api/src/data/questions.ts and its CSV).
 * Top 5: Gabon 6.37, Czechia 6.298, Austria 5.877, Poland 5.52, Germany 5.277.
 */
export const MOSTLE = {
  questionId: 'beer-per-capita-2020',
  prompt: 'Which countries have the highest beer consumption per person?',
  unit: 'L pure alcohol/person/yr',
  /** Sum of the top-5 values: the raw score that earns 100%. */
  maxScore: 29.342,
  /** What /grade returns for the countries the tests guess. */
  grades: {
    DEU: { tier: 'found', rank: 5, value: 5.277, isTopFive: true },
    POL: { tier: 'found', rank: 4, value: 5.52, isTopFive: true },
    ESP: { tier: 'warm', rank: 12, value: 4.246, isTopFive: false },
    AND: { tier: 'warm', rank: 38, value: 3.313, isTopFive: false },
    FRA: { tier: 'warm', rank: 65, value: 2.38, isTopFive: false },
    ITA: { tier: 'warm', rank: 76, value: 1.81, isTopFive: false },
    // Cook Islands has data but no value, so it is cold. It isn't offered as a guess.
    COK: { tier: 'cold', rank: null, value: null, isTopFive: false },
    VAT: { tier: 'no-data', rank: null, value: null, isTopFive: false },
  },
} as const;

/** Maple: an implemented city from shared/cityRevealCities.ts. */
export const MAPLE_CITY_ID = 'bern';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadState } from './useGameState';

const KEY = 'geogames:where-most:state';

/** vitest runs web tests in node, which has no localStorage: a Map-backed stand-in. */
let items: Map<string, string>;

beforeEach(() => {
  items = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function seed(history: unknown[]) {
  items.set(KEY, JSON.stringify({ history }));
}

// A finished Mostle day exactly as the current recordResult writes it, including a no-data pick.
const currentDay = {
  date: '2026-11-16',
  won: true,
  guesses: 2,
  score: 41,
  exactMatches: 1,
  guessCountries: ['DEU', 'FRA'],
  guessResults: [
    { tier: 'found', rank: 2, value: 83.2, isTopFive: true },
    { tier: 'cold', rank: 40, value: 1.5, isTopFive: false },
  ],
  allGuesses: [
    { iso3: 'VAT', result: { tier: 'no-data', rank: null, value: null, isTopFive: false } },
    { iso3: 'DEU', result: { tier: 'found', rank: 2, value: 83.2, isTopFive: true } },
    { iso3: 'FRA', result: { tier: 'cold', rank: 40, value: 1.5, isTopFive: false } },
  ],
};

describe('loadState', () => {
  it('loads a current-format Mostle day unchanged', () => {
    seed([currentDay]);
    expect(loadState('where-most').history).toEqual([currentDay]);
  });

  it('loads an old minimal day', () => {
    seed([{ date: '2026-01-01', won: false, guesses: 5 }]);
    expect(loadState('where-most').history).toEqual([{ date: '2026-01-01', won: false, guesses: 5 }]);
  });

  it('strips only broken optional details, keeping the day', () => {
    seed([{ ...currentDay, guessResults: [{ tier: 'found' }], allGuesses: 'junk' }]);
    const [day] = loadState('where-most').history;
    expect(day).toMatchObject({ date: '2026-11-16', won: true, guesses: 2, score: 41, guessCountries: ['DEU', 'FRA'] });
    expect(day.guessResults).toBeUndefined();
    expect(day.allGuesses).toBeUndefined();
  });

  it('strips details with an unknown tier', () => {
    const bad = { tier: 'gold', rank: 1, value: 9, isTopFive: true };
    seed([{ ...currentDay, guessResults: [bad, bad], allGuesses: [{ iso3: 'DEU', result: bad }] }]);
    const [day] = loadState('where-most').history;
    expect(day.guessResults).toBeUndefined();
    expect(day.allGuesses).toBeUndefined();
  });

  it('drops a day missing core fields, keeping the rest', () => {
    seed([{ date: '2026-11-15', won: 'yes' }, currentDay]);
    expect(loadState('where-most').history).toEqual([currentDay]);
  });
});

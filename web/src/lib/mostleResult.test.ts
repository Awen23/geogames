import { describe, expect, it } from 'vitest';
import type { GuessResult } from '@shared/types';
import { readMostleDetails } from './mostleResult';
import { renderHook, stubStorageAndToday } from './resultHistoryTestUtils';
import { loadResultHistory, useResultHistory } from './useResultHistory';

const KEY = 'geogames:where-most:state';

const items = stubStorageAndToday();

function seed(history: unknown[]) {
  items.set(KEY, JSON.stringify({ history }));
}

const load = () => loadResultHistory('where-most', readMostleDetails).history;

const found: GuessResult = { tier: 'found', rank: 2, value: 83.2, isTopFive: true };
const cold: GuessResult = { tier: 'cold', rank: 40, value: 1.5, isTopFive: false };
const noData: GuessResult = { tier: 'no-data', rank: null, value: null, isTopFive: false };

// A finished Mostle day exactly as the current recordResult writes it, including a no-data pick.
const currentDay = {
  date: '2026-11-16',
  won: true,
  guesses: 2,
  score: 41,
  exactMatches: 1,
  guessCountries: ['DEU', 'FRA'],
  guessResults: [found, cold],
  allGuesses: [
    { iso3: 'VAT', result: noData },
    { iso3: 'DEU', result: found },
    { iso3: 'FRA', result: cold },
  ],
};

describe('loading malformed Mostle details', () => {
  it('strips only broken optional details, keeping the day', () => {
    seed([{ ...currentDay, guessResults: [{ tier: 'found' }], allGuesses: 'junk' }]);
    const [day] = load();
    expect(day).toMatchObject({ date: '2026-11-16', won: true, guesses: 2, score: 41, guessCountries: ['DEU', 'FRA'] });
    expect(day.guessResults).toBeUndefined();
    expect(day.allGuesses).toBeUndefined();
  });

  it('strips details with an unknown tier', () => {
    const bad = { tier: 'gold', rank: 1, value: 9, isTopFive: true };
    seed([{ ...currentDay, guessResults: [bad, bad], allGuesses: [{ iso3: 'DEU', result: bad }] }]);
    const [day] = load();
    expect(day.guessResults).toBeUndefined();
    expect(day.allGuesses).toBeUndefined();
  });
});

describe('a Mostle history saved by the app so far', () => {
  // Literal localStorage contents as the app has been writing them: a Mostle day with full
  // details, an older Mostle day from before details were saved, and an older loss.
  const OLD_BLOB = '{"history":['
    + '{"date":"2026-11-18","won":true,"guesses":3,"score":64,"exactMatches":2,'
    + '"guessCountries":["CHN","IND","USA"],'
    + '"guessResults":[{"tier":"found","rank":1,"value":1411.8,"isTopFive":true},'
    + '{"tier":"found","rank":2,"value":1380,"isTopFive":true},'
    + '{"tier":"warm","rank":7,"value":331.4,"isTopFive":false}],'
    + '"allGuesses":[{"iso3":"CHN","result":{"tier":"found","rank":1,"value":1411.8,"isTopFive":true}},'
    + '{"iso3":"ATA","result":{"tier":"no-data","rank":null,"value":null,"isTopFive":false}},'
    + '{"iso3":"IND","result":{"tier":"found","rank":2,"value":1380,"isTopFive":true}},'
    + '{"iso3":"USA","result":{"tier":"warm","rank":7,"value":331.4,"isTopFive":false}}]},'
    + '{"date":"2026-11-17","won":true,"guesses":5,"score":20},'
    + '{"date":"2026-11-10","won":false,"guesses":5}'
    + ']}';

  it('loads every day, details included, with its streak', () => {
    items.set(KEY, OLD_BLOB);
    const { history, streak, longestStreak, todayResult } = renderHook(() => useResultHistory('where-most', readMostleDetails));
    expect(history).toEqual(JSON.parse(OLD_BLOB).history);
    expect(streak).toBe(2);
    expect(longestStreak).toBe(2);
    expect(todayResult).toBeNull();
  });

  it('is written back byte for byte, with only the new day prepended', () => {
    items.set(KEY, OLD_BLOB);
    const { recordResult } = renderHook(() => useResultHistory('where-most', readMostleDetails));
    recordResult(true, 1, 20, { exactMatches: 1, guessCountries: ['CHN'] });
    const newDay = '{"date":"2026-11-19","won":true,"guesses":1,"score":20,"exactMatches":1,"guessCountries":["CHN"]}';
    expect(items.get(KEY)).toBe(OLD_BLOB.replace('{"history":[', `{"history":[${newDay},`));
  });
});

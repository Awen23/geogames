import { describe, expect, it } from 'vitest';
import { renderHook, stubStorageAndToday, TODAY } from './resultHistoryTestUtils';
import { loadResultHistory, readNoDetails, useResultHistory } from './useResultHistory';

const KEY = 'geogames:city-reveal:state';

const items = stubStorageAndToday();

function seed(history: unknown[], key = KEY) {
  items.set(key, JSON.stringify({ history }));
}

function stored(key = KEY): unknown {
  const raw = items.get(key);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('loadResultHistory', () => {
  it('loads an old minimal day', () => {
    seed([{ date: '2026-01-01', won: false, guesses: 5 }]);
    expect(loadResultHistory('city-reveal', readNoDetails).history).toEqual([{ date: '2026-01-01', won: false, guesses: 5 }]);
  });

  it('drops a day missing core fields, keeping the rest', () => {
    const good = { date: '2026-11-16', won: true, guesses: 2, score: 41 };
    seed([{ date: '2026-11-15', won: 'yes' }, good]);
    expect(loadResultHistory('city-reveal', readNoDetails).history).toEqual([good]);
  });

  it('loads non-Mostle days (GeoPlace score, City Reveal win/loss) unchanged', () => {
    const geoplace = [{ date: '2026-11-18', won: true, guesses: 0, score: 87 }];
    const cityReveal = [
      { date: '2026-11-18', won: false, guesses: 6 },
      { date: '2026-11-17', won: true, guesses: 3 },
    ];
    seed(geoplace, 'geogames:geoplace:state');
    seed(cityReveal, 'geogames:city-reveal:state');
    expect(loadResultHistory('geoplace', readNoDetails).history).toEqual(geoplace);
    expect(loadResultHistory('city-reveal', readNoDetails).history).toEqual(cityReveal);
  });
});

describe('streaks', () => {
  const day = (date: string, won = true) => ({ date, won, guesses: 3 });

  it('is zero with no history', () => {
    const { streak, longestStreak } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    expect([streak, longestStreak]).toEqual([0, 0]);
  });

  it('counts the run ending today, and the longest run anywhere', () => {
    seed([day('2026-11-19'), day('2026-11-18'), day('2026-11-17'),
      day('2026-11-14'), day('2026-11-13'), day('2026-11-12'), day('2026-11-11')]);
    const { streak, longestStreak } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    expect([streak, longestStreak]).toEqual([3, 4]);
  });

  it('still counts a run ending yesterday, in any saved order', () => {
    seed([day('2026-11-17'), day('2026-11-18')]);
    const { streak, longestStreak } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    expect([streak, longestStreak]).toEqual([2, 2]);
  });

  it('breaks a run that ended before yesterday', () => {
    seed([day('2026-11-17'), day('2026-11-16')]);
    const { streak, longestStreak } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    expect([streak, longestStreak]).toEqual([0, 2]);
  });

  it('skips losses: a loss today keeps a run to yesterday, a loss mid-run breaks it', () => {
    seed([day('2026-11-19', false), day('2026-11-18'), day('2026-11-17', false), day('2026-11-16')]);
    const { streak, longestStreak } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    expect([streak, longestStreak]).toEqual([1, 1]);
  });
});

describe('todayResult', () => {
  const GEOPLACE_KEY = 'geogames:geoplace:state';
  const day = (date: string) => ({ date, won: true, guesses: 0, score: 10 });

  it('is null when today has no result', () => {
    seed([day('2026-11-18')], GEOPLACE_KEY);
    expect(renderHook(() => useResultHistory('geoplace', readNoDetails)).todayResult).toBeNull();
  });

  it("is today's result when there is one", () => {
    seed([day(TODAY), day('2026-11-18')], GEOPLACE_KEY);
    expect(renderHook(() => useResultHistory('geoplace', readNoDetails)).todayResult).toEqual(day(TODAY));
  });
});

describe('recordResult', () => {
  it('records a GeoPlace score in front of the history', () => {
    seed([{ date: '2026-11-18', won: true, guesses: 0, score: 70 }], 'geogames:geoplace:state');
    renderHook(() => useResultHistory('geoplace', readNoDetails)).recordResult(true, 0, 87);
    expect(items.get('geogames:geoplace:state')).toBe(
      '{"history":[{"date":"2026-11-19","won":true,"guesses":0,"score":87},'
      + '{"date":"2026-11-18","won":true,"guesses":0,"score":70}]}',
    );
  });

  it('records a City Reveal loss with no score', () => {
    renderHook(() => useResultHistory('city-reveal', readNoDetails)).recordResult(false, 6);
    expect(items.get('geogames:city-reveal:state')).toBe('{"history":[{"date":"2026-11-19","won":false,"guesses":6}]}');
  });

  it('records only the first result of the day, even twice in one tick', () => {
    const { recordResult } = renderHook(() => useResultHistory('city-reveal', readNoDetails));
    recordResult(true, 2);
    recordResult(false, 6);
    expect(stored('geogames:city-reveal:state')).toEqual({ history: [{ date: TODAY, won: true, guesses: 2 }] });
    renderHook(() => useResultHistory('city-reveal', readNoDetails)).recordResult(false, 6);
    expect(stored('geogames:city-reveal:state')).toEqual({ history: [{ date: TODAY, won: true, guesses: 2 }] });
  });

  it('keeps the newest 90 days', () => {
    const days = Array.from({ length: 90 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 10, 18 - i)).toISOString().slice(0, 10), won: true, guesses: 1,
    }));
    seed(days, 'geogames:city-reveal:state');
    renderHook(() => useResultHistory('city-reveal', readNoDetails)).recordResult(true, 4);
    const { history } = stored('geogames:city-reveal:state') as { history: typeof days };
    expect(history).toHaveLength(90);
    expect(history[0]).toEqual({ date: TODAY, won: true, guesses: 4 });
    expect(history.slice(1)).toEqual(days.slice(0, 89));
  });
});

describe('resetForDev', () => {
  it('saves an empty history', () => {
    seed([{ date: '2026-11-16', won: true, guesses: 2, score: 41 }]);
    renderHook(() => useResultHistory('city-reveal', readNoDetails)).resetForDev();
    expect(items.get(KEY)).toBe('{"history":[]}');
  });
});

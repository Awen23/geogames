import { describe, it, expect } from 'vitest';
import { addDays, pickNextPuzzle, planPuzzleDays } from '../src/services/scheduleUtils';

/** A seeded random number generator, so tests that pick at random are repeatable. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const IDS = Array.from({ length: 12 }, (_, i) => `q${i}`);

describe('pickNextPuzzle', () => {
  it('picks a never-shown puzzle first', () => {
    const history = IDS.filter((id) => id !== 'q7');
    expect(pickNextPuzzle(history, IDS, Math.random)).toBe('q7');
  });

  it('picks from the quarter shown longest ago once every puzzle has been shown', () => {
    // q0 was shown longest ago, q11 most recently. A quarter of 12 is 3.
    for (let i = 0; i < 50; i++) {
      expect(['q0', 'q1', 'q2']).toContain(pickNextPuzzle(IDS, IDS, Math.random));
    }
  });

  it('only counts the most recent showing of a puzzle', () => {
    const history = [...IDS, 'q0', 'q1', 'q2'];
    for (let i = 0; i < 50; i++) {
      expect(['q3', 'q4', 'q5']).toContain(pickNextPuzzle(history, IDS, Math.random));
    }
  });

  it('ignores puzzles in the history that have been removed', () => {
    expect(pickNextPuzzle(['old', 'q0'], ['q0', 'q1'], Math.random)).toBe('q1');
  });
});

describe('planPuzzleDays', () => {
  const today = '2026-11-16';

  it('fills every day from today to the end of the window', () => {
    const planned = planPuzzleDays([], IDS, today, 3, Math.random);
    expect(planned.map((day) => day.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  });

  it('keeps days already scheduled and only fills the gaps', () => {
    const existing = [
      { date: '2026-11-16', puzzleId: 'q0' },
      { date: '2026-11-18', puzzleId: 'q1' },
    ];
    const planned = planPuzzleDays(existing, IDS, today, 3, Math.random);
    expect(planned.map((day) => day.date)).toEqual(['2026-11-17', '2026-11-19']);
  });

  it('shows every puzzle once before repeating any', () => {
    const planned = planPuzzleDays([], IDS, today, IDS.length - 1, seededRandom(1));
    expect(new Set(planned.map((day) => day.puzzleId)).size).toBe(IDS.length);
  });

  it('shows new puzzles before repeats', () => {
    const existing = IDS.map((puzzleId, i) => ({ date: addDays('2026-10-01', i), puzzleId }));
    const planned = planPuzzleDays(existing, [...IDS, 'new1', 'new2'], today, 1, Math.random);
    expect(planned.map((day) => day.puzzleId).sort()).toEqual(['new1', 'new2']);
  });

  it.each([12, 32])('repeats each of %i puzzles between 3/4 and 5/4 of a cycle apart', (count) => {
    const ids = Array.from({ length: count }, (_, i) => `q${i}`);
    const quarter = Math.floor(count / 4);

    for (let seed = 1; seed <= 20; seed++) {
      const planned = planPuzzleDays([], ids, today, count * 20, seededRandom(seed));
      const lastSeen = new Map<string, number>();
      planned.forEach((day, i) => {
        const previous = lastSeen.get(day.puzzleId);
        if (previous !== undefined) {
          expect(i - previous).toBeGreaterThan(count - quarter);
          expect(i - previous).toBeLessThanOrEqual(count + quarter);
        }
        lastSeen.set(day.puzzleId, i);
      });
    }
  });

  it('counts days before today as history when picking', () => {
    const existing = IDS.slice(0, 11).map((puzzleId, i) => ({ date: addDays('2026-11-01', i), puzzleId }));
    const [planned] = planPuzzleDays(existing, IDS, today, 0, Math.random);
    expect(planned.puzzleId).toBe('q11');
  });
});

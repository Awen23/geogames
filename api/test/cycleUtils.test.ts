import { describe, it, expect } from 'vitest';
import { unseenInCurrentCycle } from '../src/services/cycleUtils';

describe('unseenInCurrentCycle', () => {
  it('returns all indices when nothing has been scheduled', () => {
    expect(unseenInCurrentCycle([], 3)).toEqual([0, 1, 2]);
  });

  it('returns unseen indices within the current cycle', () => {
    const entries = [
      { date: '2026-01-01', puzzleIndex: 2 },
      { date: '2026-01-02', puzzleIndex: 0 },
    ];
    expect(unseenInCurrentCycle(entries, 3)).toEqual([1]);
  });

  it('resets at cycle boundary and returns all indices again', () => {
    // pool=3: indices 0,1,2 complete a cycle — next cycle should show all again
    const entries = [
      { date: '2026-01-01', puzzleIndex: 0 },
      { date: '2026-01-02', puzzleIndex: 1 },
      { date: '2026-01-03', puzzleIndex: 2 },
    ];
    expect(unseenInCurrentCycle(entries, 3)).toEqual([0, 1, 2]);
  });

  it('handles multiple complete cycles followed by a partial cycle', () => {
    // Two full cycles (6 entries), then index 0 opens the third — unseen are 1 and 2
    const entries = [
      { date: '2026-01-01', puzzleIndex: 0 },
      { date: '2026-01-02', puzzleIndex: 1 },
      { date: '2026-01-03', puzzleIndex: 2 },
      { date: '2026-01-04', puzzleIndex: 2 },
      { date: '2026-01-05', puzzleIndex: 0 },
      { date: '2026-01-06', puzzleIndex: 1 },
      { date: '2026-01-07', puzzleIndex: 0 }, // start of third cycle
    ];
    expect(unseenInCurrentCycle(entries, 3)).toEqual([1, 2]);
  });

  it('entries are sorted by date regardless of input order', () => {
    const entries = [
      { date: '2026-01-03', puzzleIndex: 2 },
      { date: '2026-01-01', puzzleIndex: 0 },
      { date: '2026-01-02', puzzleIndex: 1 },
    ];
    // All three seen in this cycle — next cycle shows all
    expect(unseenInCurrentCycle(entries, 3)).toEqual([0, 1, 2]);
  });
});

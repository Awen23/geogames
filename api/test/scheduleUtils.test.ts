import { describe, it, expect } from 'vitest';
import { unscheduledIndices } from '../src/services/scheduleUtils';

describe('unscheduledIndices', () => {
  it('returns all indices when nothing has been scheduled', () => {
    expect(unscheduledIndices([], 3)).toEqual([0, 1, 2]);
  });

  it('returns only indices never scheduled', () => {
    const entries = [
      { puzzleIndex: 2 },
      { puzzleIndex: 0 },
    ];
    expect(unscheduledIndices(entries, 3)).toEqual([1]);
  });

  it('returns empty when every index has been scheduled once', () => {
    const entries = [
      { puzzleIndex: 0 },
      { puzzleIndex: 1 },
      { puzzleIndex: 2 },
    ];
    expect(unscheduledIndices(entries, 3)).toEqual([]);
  });

  it('does not recycle indices after a full pool has been used', () => {
    const entries = [
      { puzzleIndex: 0 },
      { puzzleIndex: 1 },
      { puzzleIndex: 2 },
      { puzzleIndex: 0 },
      { puzzleIndex: 1 },
    ];
    expect(unscheduledIndices(entries, 3)).toEqual([]);
  });

  it('includes new indices when the pool grows', () => {
    const entries = [
      { puzzleIndex: 0 },
      { puzzleIndex: 1 },
      { puzzleIndex: 2 },
    ];
    expect(unscheduledIndices(entries, 5)).toEqual([3, 4]);
  });

  it('ignores scheduled indices outside the current pool size', () => {
    const entries = [{ puzzleIndex: 4 }, { puzzleIndex: 0 }];
    expect(unscheduledIndices(entries, 3)).toEqual([1, 2]);
  });
});

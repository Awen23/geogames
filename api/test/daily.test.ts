import { describe, it, expect } from 'vitest';
import { utcDateString, seedIndex } from '../src/services/daily';

describe('utcDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = utcDateString(new Date('2026-05-15T10:00:00Z'));
    expect(result).toBe('2026-05-15');
  });

  it('uses UTC day boundary, not local time', () => {
    // 23:00 UTC on May 14 ≠ May 15
    expect(utcDateString(new Date('2026-05-14T23:00:00Z'))).toBe('2026-05-14');
    expect(utcDateString(new Date('2026-05-15T00:01:00Z'))).toBe('2026-05-15');
  });
});

describe('seedIndex', () => {
  it('is deterministic for the same inputs', () => {
    const a = seedIndex('where-most', '2026-05-15', 10);
    const b = seedIndex('where-most', '2026-05-15', 10);
    expect(a).toBe(b);
  });

  it('returns a value in range [0, poolSize)', () => {
    for (let i = 0; i < 30; i++) {
      const date = `2026-05-${String(i + 1).padStart(2, '0')}`;
      const idx = seedIndex('where-most', date, 10);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(10);
    }
  });

  it('produces different indexes for different dates', () => {
    const indexes = new Set(
      Array.from({ length: 20 }, (_, i) =>
        seedIndex('where-most', `2026-05-${String(i + 1).padStart(2, '0')}`, 100),
      ),
    );
    expect(indexes.size).toBeGreaterThan(10);
  });

  it('produces different indexes for different gameIds on the same date', () => {
    const a = seedIndex('where-most', '2026-05-15', 100);
    const b = seedIndex('where-least', '2026-05-15', 100);
    expect(a).not.toBe(b);
  });
});

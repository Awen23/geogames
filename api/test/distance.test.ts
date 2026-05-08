import { describe, it, expect } from 'vitest';
import { bearingDeg, haversineKm } from '@shared/distance';

describe('bearingDeg (flat-map equirectangular)', () => {
  it('due north', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 0);
  });

  it('due east', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 0);
  });

  it('due south', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: -10, lon: 0 })).toBeCloseTo(180, 0);
  });

  it('due west', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -10 })).toBeCloseTo(270, 0);
  });

  it('northeast at equator', () => {
    const b = bearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 10 });
    expect(b).toBeCloseTo(45, 0);
  });

  it('southwest at equator', () => {
    const b = bearingDeg({ lat: 0, lon: 0 }, { lat: -10, lon: -10 });
    expect(b).toBeCloseTo(225, 0);
  });

  it('result is always in [0, 360)', () => {
    const pairs = [
      [{ lat: 51, lon: 0 }, { lat: 35, lon: 139 }],
      [{ lat: -33, lon: 151 }, { lat: 48, lon: 2 }],
      [{ lat: 40, lon: -74 }, { lat: 55, lon: 37 }],
    ] as const;
    for (const [from, to] of pairs) {
      const b = bearingDeg(from, to);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

});

describe('haversineKm', () => {
  it('same point → 0 km', () => {
    expect(haversineKm({ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: -0.1 })).toBe(0);
  });

  it('London → Paris ≈ 341 km', () => {
    const london = { lat: 51.507, lon: -0.128 };
    const paris = { lat: 48.857, lon: 2.352 };
    expect(haversineKm(london, paris)).toBeCloseTo(341, -1);
  });

  it('is symmetric', () => {
    const a = { lat: 48.85, lon: 2.35 };
    const b = { lat: 35.68, lon: 139.69 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 5);
  });
});


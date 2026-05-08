/**
 * Bearing tests using actual city coordinates from CITY_REVEAL_CITIES.
 * These verify that arrows match what a player sees on a standard flat
 * (euro-centric) world map, which is the contract of bearingDeg's
 * equirectangular formula.
 *
 * Where noted, the great-circle initial bearing (the old formula) would
 * have produced a different, visually wrong arrow.
 */
import { describe, it, expect } from 'vitest';
import { bearingDeg } from '@shared/distance';
import { bearingToArrow } from '@shared/cityRevealTypes';
import { CITY_REVEAL_CITIES } from '@shared/cityRevealCities';

function city(id: string) {
  const c = CITY_REVEAL_CITIES.find((c) => c.id === id);
  if (!c) { throw new Error(`City not found: ${id}`); }
  return c;
}

function arrow(fromId: string, toId: string): string {
  return bearingToArrow(bearingDeg(city(fromId), city(toId)));
}

describe('flat-map bearing arrows (city pairs)', () => {
  it('Paris → Tokyo: east (➡️) — great-circle incorrectly gives northeast (↗️) via the Arctic', () => {
    expect(arrow('paris', 'tokyo')).toBe('➡️');
  });

  it('Tokyo → Paris: west (⬅️)', () => {
    expect(arrow('tokyo', 'paris')).toBe('⬅️');
  });

  it('London → Singapore: southeast (↘️) — great-circle incorrectly gives east (➡️)', () => {
    expect(arrow('london', 'singapore')).toBe('↘️');
  });

  it('Singapore → London: northwest (↖️)', () => {
    expect(arrow('singapore', 'london')).toBe('↖️');
  });

  it('Moscow → New York: west (⬅️) — great-circle incorrectly gives northwest (↖️) via Greenland', () => {
    expect(arrow('moscow', 'new-york')).toBe('⬅️');
  });

  it('London → New York: west (⬅️)', () => {
    expect(arrow('london', 'new-york')).toBe('⬅️');
  });

  it('London → Cairo: southeast (↘️)', () => {
    expect(arrow('london', 'cairo')).toBe('↘️');
  });

  it('Cairo → London: northwest (↖️)', () => {
    expect(arrow('cairo', 'london')).toBe('↖️');
  });

  it('Buenos Aires → London: northeast (↗️)', () => {
    expect(arrow('buenos-aires', 'london')).toBe('↗️');
  });

  it('London → Buenos Aires: southwest (↙️)', () => {
    expect(arrow('london', 'buenos-aires')).toBe('↙️');
  });

  it('Sydney → London: northwest (↖️)', () => {
    expect(arrow('sydney', 'london')).toBe('↖️');
  });

  it('Paris → Moscow: east (➡️)', () => {
    expect(arrow('paris', 'moscow')).toBe('➡️');
  });

  // Antimeridian cases: the shorter flat-map path crosses the date line.
  // Without dLon normalisation the formula takes the long way east and gives
  // a completely wrong arrow.
  it('Chicago → Perth: southwest (↙️) — shorter path goes west across the Pacific', () => {
    expect(arrow('chicago', 'perth')).toBe('↙️');
  });

  it('Perth → Chicago: northeast (↗️)', () => {
    expect(arrow('perth', 'chicago')).toBe('↗️');
  });

  it('Tokyo → Beijing: west (⬅️) — cities are nearly the same latitude so it is mostly a horizontal shift', () => {
    expect(arrow('tokyo', 'beijing')).toBe('⬅️');
  });

  it('Beijing → Tokyo: east (➡️)', () => {
    expect(arrow('beijing', 'tokyo')).toBe('➡️');
  });
});

describe('flat-map bearing values (city pairs)', () => {
  it('Paris → Tokyo bearing is ~90–115° (east, slightly south)', () => {
    const b = bearingDeg(city('paris'), city('tokyo'));
    expect(b).toBeGreaterThan(90);
    expect(b).toBeLessThan(115);
  });

  it('London → Singapore bearing is ~100–135° (east-southeast)', () => {
    const b = bearingDeg(city('london'), city('singapore'));
    expect(b).toBeGreaterThan(100);
    expect(b).toBeLessThan(135);
  });

  it('Moscow → New York bearing is ~240–275° (west, slightly south)', () => {
    const b = bearingDeg(city('moscow'), city('new-york'));
    expect(b).toBeGreaterThan(240);
    expect(b).toBeLessThan(275);
  });

  it('bearing is symmetric: from→to and to→from differ by ~180°', () => {
    const pairs = [
      ['paris', 'tokyo'],
      ['london', 'cairo'],
      ['buenos-aires', 'london'],
    ] as const;
    for (const [a, b] of pairs) {
      const fwd = bearingDeg(city(a), city(b));
      const rev = bearingDeg(city(b), city(a));
      const diff = Math.abs(((rev - fwd + 360) % 360) - 180);
      // midLat is identical for both directions, so the formula is exactly
      // symmetric up to floating-point rounding
      expect(diff).toBeLessThan(0.001);
    }
  });
});

describe('bearingToArrow', () => {
  it('maps all 8 cardinal/diagonal centres correctly', () => {
    expect(bearingToArrow(0)).toBe('⬆️');
    expect(bearingToArrow(45)).toBe('↗️');
    expect(bearingToArrow(90)).toBe('➡️');
    expect(bearingToArrow(135)).toBe('↘️');
    expect(bearingToArrow(180)).toBe('⬇️');
    expect(bearingToArrow(225)).toBe('↙️');
    expect(bearingToArrow(270)).toBe('⬅️');
    expect(bearingToArrow(315)).toBe('↖️');
  });

  it('sector boundaries: 22° → north, 23° → northeast', () => {
    expect(bearingToArrow(22)).toBe('⬆️');
    expect(bearingToArrow(23)).toBe('↗️');
  });

  it('N/NW boundary: 337° → northwest, 338° → north', () => {
    expect(bearingToArrow(337)).toBe('↖️');
    expect(bearingToArrow(338)).toBe('⬆️');
  });

  it('360° wraps to north', () => {
    expect(bearingToArrow(360)).toBe('⬆️');
  });

  it('handles negative bearings gracefully', () => {
    expect(bearingToArrow(-45)).toBe('↖️');
    expect(bearingToArrow(-90)).toBe('⬅️');
  });
});

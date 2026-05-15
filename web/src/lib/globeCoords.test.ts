import { describe, it, expect } from 'vitest';
import { clientToSvgCoords, svgToLatLon, pointerToLatLon } from './globeCoords';

describe('clientToSvgCoords', () => {
  it('maps the centre of the SVG element to viewBox centre', () => {
    const svg = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 400 }),
    } as SVGSVGElement;

    const [x, y] = clientToSvgCoords(svg, 300, 250, 650, 650);
    expect(x).toBeCloseTo(325);
    expect(y).toBeCloseTo(325);
  });
});

describe('svgToLatLon', () => {
  it('returns null when invert is missing', () => {
    expect(svgToLatLon({}, 100, 100)).toBeNull();
  });

  it('returns null when invert yields NaN', () => {
    const projection = { invert: () => [NaN, NaN] as [number, number] };
    expect(svgToLatLon(projection, 100, 100)).toBeNull();
  });

  it('maps invert [lon, lat] to a LatLon object', () => {
    const projection = { invert: () => [10, 20] as [number, number] };
    expect(svgToLatLon(projection, 1, 2)).toEqual({ lat: 20, lon: 10 });
  });
});

describe('pointerToLatLon', () => {
  it('chains client → svg → lat/lon', () => {
    const svg = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 650, height: 650 }),
    } as SVGSVGElement;
    const projection = { invert: (p: [number, number]) => [p[0] / 10, p[1] / 10] as [number, number] };

    const result = pointerToLatLon(svg, 325, 325, projection, 650, 650);
    expect(result).toEqual({ lat: 32.5, lon: 32.5 });
  });
});

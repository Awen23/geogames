import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposableMap, useMapContext } from 'react-simple-maps';
import type { GeoProjection } from 'd3-geo';
import { GEOPLACE_POOL } from '@shared/geoplacePuzzle';
import centroids from '@shared/centroids.json';
import {
  GLOBE_BASE_SCALE,
  GLOBE_SIZE,
  clientToSvgCoords,
  svgToLatLon,
  pointerToLatLon,
  projectPoint,
  projectCentroid,
} from './globeCoords';

/** The Globe's opening view when no initialRotation is given (Globe.tsx). */
const DEFAULT_ROTATION: [number, number] = [0, -30];

/** The projection the Globe's subcomponents get from useMapContext, at a given rotation. */
function globeProjection(rotation: [number, number]): GeoProjection {
  let projection: GeoProjection | undefined;
  function Capture() {
    projection = useMapContext().projection;
    return null;
  }
  renderToStaticMarkup(
    createElement(
      ComposableMap,
      {
        projection: 'geoOrthographic',
        projectionConfig: { scale: GLOBE_BASE_SCALE, rotate: [rotation[0], rotation[1], 0] },
        width: GLOBE_SIZE,
        height: GLOBE_SIZE,
      },
      createElement(Capture),
    ),
  );
  if (!projection) { throw new Error('ComposableMap did not provide a projection'); }
  return projection;
}

describe('projectPoint', () => {
  it('throws, naming what was projected, when the projection gives null', () => {
    expect(() => projectPoint(() => null, 2, 46, 'the FRA placement'))
      .toThrow('Globe projection gave null for the FRA placement at [lon 2, lat 46]');
  });

  it('throws when the projection gives NaN', () => {
    expect(() => projectPoint(() => [NaN, 1], 2, 46, 'the FRA placement'))
      .toThrow('Globe projection gave NaN,1 for the FRA placement');
  });

  it('returns the projected point', () => {
    expect(projectPoint(([lon, lat]) => [lon * 2, lat * 2], 2, 46, 'x')).toEqual([4, 92]);
  });
});

describe('projectCentroid', () => {
  it('throws, naming the country, when it has no centroid', () => {
    expect(() => projectCentroid(([lon, lat]) => [lon, lat], 'XXX'))
      .toThrow('No centroid for XXX in shared/centroids.json');
  });

  it('projects the centroid', () => {
    expect(projectCentroid(([lon, lat]) => [lon, lat], 'FRA')).toEqual([centroids.FRA.lon, centroids.FRA.lat]);
  });
});

// The invariant that lets the Globe throw instead of silently skipping a shape.
describe('globe projection of the Placle pool', () => {
  it('projects every pool centroid to a finite point, whichever way the globe faces', () => {
    const failures: string[] = [];
    for (const { iso3, lat, lon } of GEOPLACE_POOL) {
      const rotations: [number, number][] = [
        DEFAULT_ROTATION,
        [-lon, -lat], // centred on it, as the game opens on round 1's target
        [-(lon + 180), lat], // centred on its antipode, so it is directly behind the globe
        [0, -90], // looking down on the North Pole
      ];
      for (const rotation of rotations) {
        try {
          projectCentroid(globeProjection(rotation), iso3);
        } catch (e) {
          failures.push(`${iso3} at rotation [${rotation}]: ${(e as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

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

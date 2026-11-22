import centroids from '@shared/centroids.json';

const CENTROID_MAP = centroids as Record<string, { lat: number; lon: number }>;

/** The globe's SVG viewBox is GLOBE_SIZE square. */
export const GLOBE_SIZE = 650;
/** The globe's projection scale at default zoom. */
export const GLOBE_BASE_SCALE = 290;

/** A forward projection, typed like d3's (which allows null, for composite projections). */
type ForwardProjection = (point: [number, number]) => [number, number] | null;

/**
 * Project [lon, lat] to SVG coordinates. The globe's orthographic projection returns a
 * finite point for every finite input (points behind the globe come back mirrored onto the
 * disc), so null or NaN here is a bug: throw rather than silently draw nothing.
 */
export function projectPoint(
  projection: ForwardProjection,
  lon: number,
  lat: number,
  what: string,
): [number, number] {
  const point = projection([lon, lat]);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new Error(`Globe projection gave ${String(point)} for ${what} at [lon ${lon}, lat ${lat}]`);
  }
  return point;
}

/**
 * SVG position of a country's centroid. The globe only moves outlines of Placle pool
 * countries, and the pool only holds countries with a centroid, so a missing one is a bug.
 */
export function projectCentroid(
  projection: ForwardProjection,
  iso3: string,
): [number, number] {
  const centroid = CENTROID_MAP[iso3];
  if (!centroid) {
    throw new Error(`No centroid for ${iso3} in shared/centroids.json, so the globe can't position its outline`);
  }
  return projectPoint(projection, centroid.lon, centroid.lat, `${iso3}'s centroid`);
}

/** Map pointer position in the viewport to SVG viewBox coordinates. */
export function clientToSvgCoords(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): [number, number] {
  const rect = svg.getBoundingClientRect();
  const svgX = ((clientX - rect.left) / rect.width) * width;
  const svgY = ((clientY - rect.top) / rect.height) * height;
  return [svgX, svgY];
}

export interface LatLon {
  lat: number;
  lon: number;
}

type InvertibleProjection = {
  invert?: (point: [number, number]) => [number, number] | null;
};

/** Convert SVG coordinates to geographic position via an orthographic projection. */
export function svgToLatLon(
  projection: InvertibleProjection,
  svgX: number,
  svgY: number,
): LatLon | null {
  const coords = projection.invert?.([svgX, svgY]);
  if (!coords || isNaN(coords[0]) || isNaN(coords[1])) {
    return null;
  }
  const [lon, lat] = coords;
  return { lat, lon };
}

/** Pointer event → lat/lon on the globe, or null if off the visible disc. */
export function pointerToLatLon(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  projection: InvertibleProjection,
  width: number,
  height: number,
): LatLon | null {
  const [svgX, svgY] = clientToSvgCoords(svg, clientX, clientY, width, height);
  return svgToLatLon(projection, svgX, svgY);
}

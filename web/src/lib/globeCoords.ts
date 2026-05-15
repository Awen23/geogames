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

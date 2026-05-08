export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Returns the flat-map bearing in degrees [0, 360) from a to b.
 * Uses an equirectangular approximation so the arrow matches the visual
 * direction on a standard (Mercator/euro-centric) map projection rather
 * than the great-circle initial bearing, which curves toward the poles
 * and feels wrong for distant cities.
 */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const midLat = toRad((from.lat + to.lat) / 2);
  const dx = (to.lon - from.lon) * Math.cos(midLat);
  const dy = to.lat - from.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

// Geometry on the sphere: enough for circles, bearings and offsets on the map.
// A spherical Earth is accurate to about 0.3 %, far inside the accuracy of the effects models.

export const EARTH_RADIUS_M = 6371008.8;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface LngLat {
  lng: number;
  lat: number;
}

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLng = (b.lng - a.lng) * D2R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** The point reached by travelling `metres` from `origin` on an initial bearing (degrees clockwise from north). */
export function destination(origin: LngLat, bearingDeg: number, metres: number): LngLat {
  const delta = metres / EARTH_RADIUS_M;
  const theta = bearingDeg * D2R;
  const phi1 = origin.lat * D2R;
  const lambda1 = origin.lng * D2R;
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 =
    lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * sinPhi2);
  return { lat: phi2 * R2D, lng: ((lambda2 * R2D + 540) % 360) - 180 };
}

/** A geodesic circle as a closed ring of [lng, lat] pairs, ready for GeoJSON. */
export function circleRing(centre: LngLat, radiusM: number, points = 128): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= points; i++) {
    const p = destination(centre, (i / points) * 360, radiusM);
    ring.push([unwrap(p.lng, centre.lng), p.lat]);
  }
  return ring;
}

/** Keeps a longitude within 180 degrees of a reference, so shapes do not tear at the antimeridian. */
export function unwrap(lng: number, reference: number): number {
  let out = lng;
  while (out - reference > 180) out -= 360;
  while (out - reference < -180) out += 360;
  return out;
}

/**
 * Converts a point given in wind coordinates (x metres downwind, y metres to the left of the wind)
 * to longitude and latitude. `towardsDeg` is the direction the wind blows towards.
 */
export function fromWindFrame(origin: LngLat, towardsDeg: number, xM: number, yM: number): LngLat {
  const range = Math.hypot(xM, yM);
  if (range === 0) return { ...origin };
  const bearing = towardsDeg - Math.atan2(yM, xM) * R2D;
  return destination(origin, bearing, range);
}

/** Initial bearing of the great circle from a to b, degrees clockwise from north. */
export function initialBearing(a: LngLat, b: LngLat): number {
  const phi1 = a.lat * D2R;
  const phi2 = b.lat * D2R;
  const dLambda = (b.lng - a.lng) * D2R;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * R2D) + 360) % 360;
}

/** The point a fraction f (0..1) of the way along the great circle from a to b. */
export function alongGreatCircle(a: LngLat, b: LngLat, f: number): LngLat {
  const total = distanceM(a, b);
  if (total === 0) return { ...a };
  return destination(a, initialBearing(a, b), total * f);
}

/** True when a point lies inside a polygon ring of [lng, lat] pairs (even-odd rule). */
export function pointInRing(point: LngLat, ring: ReadonlyArray<readonly [number, number] | number[]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

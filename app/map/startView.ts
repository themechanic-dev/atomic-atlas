// The opening view of the map: the whole planet, in the part of the map the panel leaves free.

/** Edges of the map covered by something else, in CSS pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Where the map opens. */
export const START_CENTER: [number, number] = [18, 34];

/** The opening zoom on a desktop window. The globe is never opened larger than this. */
export const START_ZOOM = 1.7;

/** Share of the free part of the map the globe's width may take. */
const GLOBE_SHARE = 0.84;

/** Width of the panel on wide windows, with its margins (app.css: --panel-width + 12 px each side). */
export const WIDE_PANEL_INSET = 412;

/** Share of the map's height the panel covers on narrow screens (app.css: .panel height at max-width 899px). */
export const SHEET_SHARE = 0.46;

/** The part of the map the panel covers: its left side on wide windows, its bottom on narrow ones. */
export function panelInsets(open: boolean, wide: boolean, mapHeight: number): Insets {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!open) return none;
  return wide ? { ...none, left: WIDE_PANEL_INSET } : { ...none, bottom: Math.round(mapHeight * SHEET_SHARE) };
}

/**
 * Radius on screen of the globe MapLibre draws at this zoom, in CSS pixels.
 * MapLibre makes the globe's radius R = worldSize / (2π cos φ) at the centre latitude φ
 * (globe_utils.ts, getGlobeRadiusPixels), with worldSize = 512 × 2^zoom, and looks at it
 * from f = 1.5 × the canvas height in front of the centre (a 36.87° field of view).
 * The edge of the disc is where the line of sight touches the sphere: r = R / √(1 + 2R/f).
 */
export function globeScreenRadius(zoom: number, latitude: number, canvasHeight: number): number {
  const radius = (512 * 2 ** zoom) / (2 * Math.PI) / Math.cos((latitude * Math.PI) / 180);
  const focal = 1.5 * canvasHeight;
  return radius / Math.sqrt(1 + (2 * radius) / focal);
}

/**
 * The zoom at which the whole globe fits in the free part of the map, and at most
 * START_ZOOM, so a desktop window keeps the view it always had while a phone sees the
 * whole planet instead of a slice of it. The inverse of globeScreenRadius:
 * R = r²/f + √(r⁴/f² + r²).
 */
export function globeFitZoom(width: number, height: number, insets: Insets, latitude: number): number {
  const free = Math.min(width - insets.left - insets.right, height - insets.top - insets.bottom);
  if (!(free > 0) || !(height > 0)) return START_ZOOM;
  const r = (GLOBE_SHARE * free) / 2;
  const focal = 1.5 * height;
  const radius = (r * r) / focal + Math.sqrt((r * r * r * r) / (focal * focal) + r * r);
  const worldSize = 2 * Math.PI * radius * Math.cos((latitude * Math.PI) / 180);
  return Math.min(START_ZOOM, Math.max(0, Math.log2(worldSize / 512)));
}

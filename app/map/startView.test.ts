import { describe, expect, it } from 'vitest';
import { globeFitZoom, globeScreenRadius, panelInsets, START_CENTER, START_ZOOM } from './startView';

const LAT = START_CENTER[1];

describe('start view', () => {
  it('matches the globe MapLibre drew in a 1680 × 886 window (measured 262.25 px)', () => {
    expect(globeScreenRadius(1.7, 34, 886)).toBeCloseTo(262.45, 1);
  });

  it('keeps the desktop view as it was', () => {
    expect(globeFitZoom(1680, 886, panelInsets(true, true, 886), LAT)).toBe(START_ZOOM);
    expect(globeFitZoom(1366, 680, panelInsets(true, true, 680), LAT)).toBe(START_ZOOM);
  });

  it('fits the whole globe above the panel on a phone', () => {
    const width = 384;
    const height = 720;
    const insets = panelInsets(true, false, height);
    expect(insets.bottom).toBe(331);
    const zoom = globeFitZoom(width, height, insets, LAT);
    expect(zoom).toBeLessThan(START_ZOOM);
    const diameter = 2 * globeScreenRadius(zoom, LAT, height);
    expect(diameter).toBeCloseTo(0.84 * Math.min(width, height - insets.bottom), 6);
  });

  it('uses the whole height when the panel is closed', () => {
    expect(panelInsets(false, false, 720)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    // A short screen, where the free height above the panel is what limits the globe.
    const closed = globeFitZoom(384, 560, panelInsets(false, false, 560), LAT);
    const open = globeFitZoom(384, 560, panelInsets(true, false, 560), LAT);
    expect(closed).toBeGreaterThan(open);
  });

  it('falls back to the desktop zoom before the map has a size', () => {
    expect(globeFitZoom(0, 0, panelInsets(true, false, 0), LAT)).toBe(START_ZOOM);
  });
});

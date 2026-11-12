import { describe, expect, it } from 'vitest';
import { decodeTerrarium, pixelSizeM, tilePixel } from './elevation';

describe('terrarium tiles', () => {
  it('decodes heights', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 100, 128)).toBeCloseTo(100.5, 9);
    expect(decodeTerrarium(116, 48, 0)).toBe(-3024);
  });

  it('finds the tile and pixel of a point', () => {
    expect(tilePixel({ lng: 0, lat: 0 }, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
    const t = tilePixel({ lng: -179.99, lat: 85 }, 3);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    expect(pixelSizeM(0, 0)).toBeCloseTo(156_543, -1);
  });
});

import { describe, expect, it } from 'vitest';
import { completeVectorTile, countTiles, MAX_ZOOM, tilesFor } from './tiles';

describe('tiles of an area', () => {
  it('counts the whole world without listing it', () => {
    // 1 + 4 + 16 + … + 4^14 tiles: far too many to list, quick to count.
    const expected = Array.from({ length: MAX_ZOOM + 1 }, (_, z) => 4 ** z).reduce((a, b) => a + b, 0);
    expect(countTiles([-180, -85.06, 180, 85.06])).toBe(expected);
  });

  it('gives the same number as the list for a small area', () => {
    const atoll: [number, number, number, number] = [165.4, 11.55, 165.55, 11.68];
    expect(countTiles(atoll)).toBe(tilesFor(atoll).length);
    expect(countTiles(atoll)).toBeLessThan(500);
  });

  it('keeps a view turned past the date line inside the world', () => {
    const turned: [number, number, number, number] = [-540, -85.06, 540, 85.06];
    expect(countTiles(turned)).toBe(countTiles([-180, -85.06, 180, 85.06]));
    for (const [z, x, y] of tilesFor([170, 10, 200, 12]).filter(([zoom]) => zoom <= 6)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2 ** z);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(2 ** z);
    }
  });
});

describe('completeVectorTile', () => {
  // A tiny tile: layer (field 3) of 5 bytes holding the name "a" (field 1) and version 2 (field 15).
  const tile = new Uint8Array([0x1a, 0x05, 0x0a, 0x01, 0x61, 0x78, 0x02]);

  it('accepts a whole tile and an empty one', () => {
    expect(completeVectorTile(tile.buffer)).toBe(true);
    expect(completeVectorTile(new ArrayBuffer(0))).toBe(true);
  });

  it('rejects a tile cut short', () => {
    expect(completeVectorTile(tile.slice(0, 5).buffer)).toBe(false);
  });

  it('rejects a tile still compressed with gzip', () => {
    expect(completeVectorTile(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]).buffer)).toBe(false);
  });
});

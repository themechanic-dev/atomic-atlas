import { describe, expect, it } from 'vitest';
import { countTiles, MAX_ZOOM, tilesFor } from './tiles';

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

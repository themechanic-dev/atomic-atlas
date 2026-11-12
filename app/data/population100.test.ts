import { describe, expect, it } from 'vitest';
import { CELL_DEGREES, emptyGrid, gridCovers, samplesFromGrid, tilesForBounds, TILE_NORTH, TILE_WEST, widen } from './population100';

const HIROSHIMA = { lat: 34.3946, lng: 132.4547 };

describe('tiles of the 100 m population grid', () => {
  it('finds the tile of Hiroshima', () => {
    // R6_C32 starts at 129.99208° E, 39.09958° N (read from the tile).
    expect(tilesForBounds([132.3, 34.3, 132.6, 34.5])).toEqual(['R6_C32']);
  });

  it('lists every tile an area crosses, rows from the north', () => {
    // 29.0996° N and 139.9921° E are tile edges.
    expect(tilesForBounds([139.9, 29.0, 140.1, 29.2])).toEqual(['R6_C32', 'R6_C33', 'R7_C32', 'R7_C33']);
  });

  it('places the tile edges where the tiles say', () => {
    expect(TILE_NORTH - 5 * 10).toBeCloseTo(39.099583378875366, 9);
    expect(TILE_WEST + 31 * 10).toBeCloseTo(129.99208284086123, 9);
  });
});

describe('the grid of an area', () => {
  it('lies on the cell lines of the tiles', () => {
    const grid = emptyGrid(widen([132.4, 34.35, 132.5, 34.45], 15_000));
    const cols = (grid.west - TILE_WEST) / CELL_DEGREES;
    const rows = (TILE_NORTH - grid.north) / CELL_DEGREES;
    expect(Math.abs(cols - Math.round(cols))).toBeLessThan(1e-6);
    expect(Math.abs(rows - Math.round(rows))).toBeLessThan(1e-6);
    // About 0.1 + 2 × 0.165 degrees of longitude at 3 arc-seconds.
    expect(grid.cols).toBeGreaterThan(500);
    expect(grid.cols).toBeLessThan(540);
  });

  it('says whether a circle fits inside it', () => {
    const grid = emptyGrid([132.3, 34.3, 132.6, 34.5]);
    expect(gridCovers(grid, HIROSHIMA, 5_000)).toBe(true);
    expect(gridCovers(grid, HIROSHIMA, 20_000)).toBe(false);
  });

  it('counts the people inside a circle, cell by cell', () => {
    const grid = emptyGrid([132.3, 34.3, 132.6, 34.5]);
    grid.people.fill(10);
    const { samples, total } = samplesFromGrid(grid, HIROSHIMA, 1_000);
    // A circle of 1 km holds about π km² of cells of 77 m × 93 m at this latitude.
    const cellArea = (CELL_DEGREES * 111_195) ** 2 * Math.cos((HIROSHIMA.lat * Math.PI) / 180);
    const expected = (10 * Math.PI * 1_000 ** 2) / cellArea;
    expect(total).toBeGreaterThan(expected * 0.97);
    expect(total).toBeLessThan(expected * 1.03);
    expect(samples.every((s) => s.groundRangeM <= 1_000)).toBe(true);
  });
});

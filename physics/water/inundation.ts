// Which land the waves can reach, on a grid of ground heights around surface zero.
//
// A "bathtub" estimate: the water spreads over the sea that is connected to surface zero,
// and from there onto any land lower than the height to which the waves run up at that
// distance (./waves.ts, breakerHeightM). The water does not lose height as it runs inland,
// so on flat land this is an upper estimate; it also ignores the shelter of islands.
// Ground lower than 1 m counts as water: at the resolution used it is mostly reef flats,
// tidal flats and noise in the terrain tiles over water.

/** Lowest ground counted as land, metres. */
export const LAND_MIN_M = 1;

export interface FloodGrid {
  /** Cells per side; the grid is n × n, row by row from the north-west corner. */
  n: number;
  /** Ground height of each cell, metres (negative: sea floor); NaN where unknown. */
  heights: ArrayLike<number>;
  /** Index of the cell of surface zero. */
  origin: number;
  /** How high the waves run up at each cell, metres (0 where they are too small to matter). */
  runupM: ArrayLike<number>;
}

export interface FloodResult {
  /** 1 for flooded land, 2 for sea reached by the waves, 0 otherwise. */
  cells: Uint8Array;
  /** Number of flooded land cells. */
  landCells: number;
  /** Highest run-up over the flooded land, metres. */
  maxRunupM: number;
}

export function floodFrom(grid: FloodGrid): FloodResult {
  const { n, heights, origin, runupM } = grid;
  const cells = new Uint8Array(n * n);
  const result: FloodResult = { cells, landCells: 0, maxRunupM: 0 };
  const h0 = heights[origin];
  if (h0 === undefined || !(h0 <= 0)) return result;
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  cells[origin] = 2;
  queue[tail++] = origin;
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % n;
    const y = (i - x) / n;
    const fromSea = cells[i] === 2;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (cells[j] !== 0) continue;
      const h = heights[j]!;
      if (Number.isNaN(h)) continue;
      if (h < LAND_MIN_M) {
        // Sea: the waves travel on through sea connected to where they started.
        if (!fromSea) continue;
        cells[j] = 2;
        queue[tail++] = j;
      } else {
        const r = runupM[j]!;
        if (r > 0 && h < r) {
          cells[j] = 1;
          result.landCells++;
          if (r > result.maxRunupM) result.maxRunupM = r;
          queue[tail++] = j;
        }
      }
    }
  }
  return result;
}

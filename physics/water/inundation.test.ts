import { describe, expect, it } from 'vitest';
import { floodFrom } from './inundation';

// 5 × 5: sea on the left two columns, a low beach, then a ridge, then a low valley behind it.
const heights = [
  -10, -5, 1, 4, 1,
  -10, -5, 1, 4, 1,
  -10, -5, 2, 4, 1,
  -10, -5, 1, 4, 1,
  -10, -5, 1, 4, 1,
];

describe('bathtub flooding', () => {
  it('floods low land connected to the sea and stops at a ridge', () => {
    const r = floodFrom({ n: 5, heights, origin: 10, runupM: new Array(25).fill(3) });
    expect(r.landCells).toBe(5);
    expect(r.cells[2]).toBe(1);
    expect(r.cells[4]).toBe(0); // behind the 4 m ridge
    expect(r.maxRunupM).toBe(3);
  });

  it('does nothing when surface zero is on land', () => {
    const r = floodFrom({ n: 5, heights, origin: 2, runupM: new Array(25).fill(3) });
    expect(r.landCells).toBe(0);
  });

  it('does not cross land into a separate lake', () => {
    const h = [-5, 5, -5, -5, 5, -5, -5, 5, -5];
    const r = floodFrom({ n: 3, heights: h, origin: 0, runupM: new Array(9).fill(1) });
    expect(r.cells[2]).toBe(0);
    expect(r.cells[3]).toBe(2);
  });
});

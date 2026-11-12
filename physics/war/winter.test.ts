import { describe, expect, it } from 'vitest';
import { closestCase, XIA_2022 } from './winter';

describe('published nuclear winter cases', () => {
  it('holds Table 1 of Xia et al. 2022', () => {
    expect(XIA_2022).toHaveLength(6);
    expect(XIA_2022[0]!.withoutFoodYear2).toBe(255e6);
    expect(XIA_2022[5]!.weapons * XIA_2022[5]!.yieldKt).toBe(440_000);
  });

  it('points to the closest case by total yield', () => {
    expect(closestCase(0)).toBe(-1);
    expect(closestCase(1_500)).toBe(0);
    expect(closestCase(25_000)).toBe(3);
    expect(closestCase(1_000_000)).toBe(5);
  });
});

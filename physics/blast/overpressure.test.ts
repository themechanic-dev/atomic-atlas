// Accuracy tests for the blast model.
//
// Each reference value below is printed in Glasstone & Dolan (1977); the place
// is given next to it. If a change to the physics breaks one of these, the
// build fails.

import { describe, expect, it } from 'vitest';
import { ftToM, miToM, mToFt, MPH } from '../units';
import { optimumBurstHeightM, overpressureRadiusM, peakOverpressurePsi } from './overpressure';
import { dynamicPressurePsi, reflectedPressurePsi, windSpeedMs } from './shock';

/** Relative difference, for readable assertions. */
const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;

describe('peak overpressure, worked examples of Glasstone & Dolan Figs. 3.73a-c', () => {
  it('Fig. 3.73a: 1 kt at 200 ft gives 1,000 psi at 110 ft', () => {
    const p = peakOverpressurePsi(1, ftToM(110), ftToM(200));
    expect(rel(p, 1000)).toBeLessThan(0.15);
  });

  it('Fig. 3.73a scaled: 80 kt at 860 ft, 1,000 psi reaches 475 ft', () => {
    const r = mToFt(overpressureRadiusM(80, 1000, ftToM(860)));
    expect(rel(r, 475)).toBeLessThan(0.1);
  });

  it('Fig. 3.73b: 100 kt at 2,320 ft gives 50 psi at 1,860 ft', () => {
    const p = peakOverpressurePsi(100, ftToM(1860), ftToM(2320));
    expect(rel(p, 50)).toBeLessThan(0.15);
  });

  it('Fig. 3.73c: for 1 kt, 4 psi reaches at most 2,600 ft, at a burst height near 1,100 ft', () => {
    const best = optimumBurstHeightM(1, 4);
    expect(rel(mToFt(best.radiusM), 2600)).toBeLessThan(0.1);
    // The top of the curve is flat, so the height itself is only loosely defined.
    expect(rel(mToFt(best.heightM), 1100)).toBeLessThan(0.3);
  });

  it('Fig. 3.73c scaled: 125 kt, 4 psi reaches 13,000 ft from a burst at 5,500 ft', () => {
    const r = mToFt(overpressureRadiusM(125, 4, ftToM(5500)));
    expect(rel(r, 13000)).toBeLessThan(0.1);
  });
});

describe('cube-root scaling (Glasstone & Dolan §3.61)', () => {
  it('distances scale with the cube root of the yield at a scaled height of burst', () => {
    const r1 = overpressureRadiusM(1, 5, 200);
    const r1000 = overpressureRadiusM(1000, 5, 2000);
    expect(rel(r1000 / r1, 10)).toBeLessThan(0.01);
  });

  it('pressure falls with distance beyond the Mach stem region', () => {
    let previous = Infinity;
    for (let r = 500; r <= 20000; r += 500) {
      const p = peakOverpressurePsi(100, r, 0);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it('finds no radius for a pressure that is never reached', () => {
    expect(overpressureRadiusM(1, 1000, 3000)).toBe(0);
  });

  it('stays finite directly below the burst', () => {
    const p = peakOverpressurePsi(20, 0, 500);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(20);
  });
});

describe('ideal shock front, Glasstone & Dolan Table 3.07', () => {
  // peak overpressure (psi), peak dynamic pressure (psi), maximum wind velocity (mph)
  const TABLE_3_07: Array<[number, number, number]> = [
    [200, 330, 2078],
    [150, 222, 1777],
    [100, 123, 1415],
    [72, 74, 1168],
    [50, 41, 934],
    [30, 17, 669],
    [20, 8.1, 502],
    [10, 2.2, 294],
    [5, 0.6, 163],
    [2, 0.1, 70],
  ];

  it.each(TABLE_3_07)('%d psi: dynamic pressure %d psi, wind %d mph', (p, q, mph) => {
    // The table rounds to two figures; the lowest rows carry the largest rounding error.
    expect(Math.abs(dynamicPressurePsi(p) - q)).toBeLessThan(Math.max(0.03 * q, 0.06));
    expect(rel(windSpeedMs(p) / MPH, mph)).toBeLessThan(0.02);
  });

  it('reflected pressure tends to twice the overpressure for weak shocks and eight times for strong ones', () => {
    expect(rel(reflectedPressurePsi(0.01), 0.02)).toBeLessThan(0.01);
    expect(reflectedPressurePsi(1e7) / 1e7).toBeGreaterThan(7.9);
  });
});

describe('worked statements in the text of Glasstone & Dolan', () => {
  it('§2.34: 1 Mt at 6,500 ft, about 20 psi where the Mach stem forms, 1.3 miles out', () => {
    const p = peakOverpressurePsi(1000, miToM(1.3), ftToM(6500));
    expect(rel(p, 20)).toBeLessThan(0.2);
  });

  it('§2.35: the same burst gives roughly 1 psi at 10 miles', () => {
    const p = peakOverpressurePsi(1000, miToM(10), ftToM(6500));
    expect(rel(p, 1)).toBeLessThan(0.25);
  });

  it('Fig. 3.75: 1 kt at 550 ft, peak dynamic pressure of approximately 3 psi at 1,110 ft', () => {
    const q = dynamicPressurePsi(peakOverpressurePsi(1, ftToM(1110), ftToM(550)));
    expect(rel(q, 3)).toBeLessThan(0.25);
  });
});

describe('Hiroshima and Nagasaki, burst conditions of Glasstone & Dolan §2.24', () => {
  // About 12.5 kt at 1,670 ft and about 22 kt at 1,640 ft. The book gives no table of
  // pressure against distance for the two cities, so these are regression values of this
  // model: they guard against unintended changes, they are not independent measurements.
  const hiroshima = { yieldKt: 12.5, heightM: ftToM(1670) };
  const nagasaki = { yieldKt: 22, heightM: ftToM(1640) };

  it.each([
    [5, 1485],
    [2, 2600],
    [1, 4208],
  ])('Hiroshima: %d psi reaches %d m', (psi, metres) => {
    expect(rel(overpressureRadiusM(hiroshima.yieldKt, psi, hiroshima.heightM), metres)).toBeLessThan(0.02);
  });

  it.each([
    [5, 1684],
    [2, 3005],
    [1, 4811],
  ])('Nagasaki: %d psi reaches %d m', (psi, metres) => {
    expect(rel(overpressureRadiusM(nagasaki.yieldKt, psi, nagasaki.heightM), metres)).toBeLessThan(0.02);
  });

  it('the larger Nagasaki burst reaches further at every pressure', () => {
    for (const psi of [1, 2, 5, 10]) {
      expect(overpressureRadiusM(nagasaki.yieldKt, psi, nagasaki.heightM)).toBeGreaterThan(
        overpressureRadiusM(hiroshima.yieldKt, psi, hiroshima.heightM),
      );
    }
  });
});

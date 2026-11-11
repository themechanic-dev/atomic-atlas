// Accuracy tests for thermal radiation, against Glasstone & Dolan (1977).

import { describe, expect, it } from 'vitest';
import { ftToM, kftToM, miToM, mToMi } from '../units';
import {
  burnThreshold,
  figure742BurstHeightM,
  radiantExposure,
  thermalPartition,
  thermalRadiusM,
  transmittance,
} from './exposure';

const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;

describe('transmittance, contours of Fig. 7.98 (12-mile visibility)', () => {
  // [distance from ground zero, kft; height of burst, kft; transmittance on the contour]
  const CONTOUR_POINTS: Array<[number, number, number]> = [
    [8.4, 0, 0.8],
    [14.9, 0, 0.7],
    [20.6, 0, 0.6],
    [30, 0, 0.5],
    [37.8, 0, 0.4],
    [50, 0, 0.3],
    [61, 0, 0.2],
    [88, 0, 0.1],
    [171, 0, 0.01],
    [375, 200, 0.7],
    [375, 128, 0.6],
    [375, 90, 0.5],
    [375, 65, 0.4],
    [375, 48, 0.3],
    [375, 35, 0.2],
    [375, 23, 0.1],
    [200, 43.5, 0.5],
    [200, 103, 0.7],
    [100, 112, 0.8],
    [225, 250, 0.8],
  ];

  it.each(CONTOUR_POINTS)('at %d kft from ground zero, burst at %d kft: tau = %d', (d, h, tau) => {
    const slant = Math.hypot(kftToM(d), kftToM(h));
    expect(Math.abs(transmittance(slant, kftToM(h)) - tau)).toBeLessThan(0.07);
  });

  it('is 1 at the source and never increases with distance', () => {
    expect(transmittance(0, 500)).toBe(1);
    let previous = 1;
    for (let r = 500; r < 80000; r += 500) {
      const t = transmittance(r, 500);
      expect(t).toBeLessThanOrEqual(previous);
      previous = t;
    }
  });

  it('haze cuts the range: lower visibility, lower transmittance', () => {
    expect(transmittance(10000, 500, 5000)).toBeLessThan(transmittance(10000, 500, 20000));
  });
});

describe('slant ranges for given radiant exposures, Fig. 7.42', () => {
  // [yield kt, radiant exposure cal/cm^2, slant range in miles read from the figure]
  const FIG_7_42: Array<[number, number, number]> = [
    [1, 3, 0.578],
    [1, 12, 0.282],
    [1, 50, 0.1406],
    [10, 3, 1.81],
    [10, 12, 0.934],
    [10, 50, 0.443],
    [100, 3, 4.5],
    [100, 12, 2.67],
    [100, 50, 1.4],
    [1000, 3, 10.5],
    [1000, 8, 7.36],
    [1000, 12, 6.43],
    [1000, 50, 3.83],
  ];

  it.each(FIG_7_42)('%d kt: %d cal/cm^2 at %d miles', (yieldKt, q, miles) => {
    const burstHeightM = figure742BurstHeightM(yieldKt);
    const ground = thermalRadiusM(q, { yieldKt, burstHeightM });
    const slantMiles = mToMi(Math.hypot(ground, burstHeightM));
    expect(rel(slantMiles, miles)).toBeLessThan(0.08);
  });

  it('10 Mt: within 25 % (Figs. 7.42 and 7.98 disagree with each other at this yield)', () => {
    for (const [q, miles] of [
      [3, 20.7],
      [12, 13.5],
      [50, 9.35],
    ] as const) {
      const burstHeightM = figure742BurstHeightM(10000);
      const ground = thermalRadiusM(q, { yieldKt: 10000, burstHeightM });
      expect(rel(mToMi(Math.hypot(ground, burstHeightM)), miles)).toBeLessThan(0.25);
    }
  });

  it('§7.43: newspaper ignites (8 cal/cm^2) "about 7 miles" from a 1 Mt air burst', () => {
    // The text rounds its own reading of Fig. 7.42 (7.4 miles on the chart).
    const burstHeightM = figure742BurstHeightM(1000);
    const ground = thermalRadiusM(8, { yieldKt: 1000, burstHeightM });
    expect(rel(mToMi(Math.hypot(ground, burstHeightM)), 7)).toBeLessThan(0.15);
  });
});

describe('thermal partition, Tables 7.88 and 7.101', () => {
  it('is 0.35 for air bursts and 0.18 for contact surface bursts', () => {
    expect(thermalPartition(100, 3000)).toBeCloseTo(0.35, 5);
    expect(thermalPartition(100, 0)).toBeCloseTo(0.18, 5);
  });

  // [yield kt, height ft, effective thermal partition] from Table 7.101
  it.each([
    [1, 20, 0.19],
    [1, 40, 0.21],
    [1, 70, 0.23],
    [1, 100, 0.26],
    [10, 40, 0.19],
    [10, 100, 0.22],
    [10, 200, 0.25],
    [10, 400, 0.33],
    [100, 100, 0.2],
    [100, 400, 0.25],
    [100, 700, 0.28],
    [100, 1000, 0.34],
    [1000, 400, 0.21],
    [1000, 1000, 0.26],
    [1000, 2000, 0.34],
    [10000, 1000, 0.22],
    [10000, 2000, 0.26],
    [10000, 4000, 0.33],
    [10000, 7000, 0.35],
  ])('%d kt at %d ft: f = %d', (yieldKt, feet, f) => {
    expect(Math.abs(thermalPartition(yieldKt, ftToM(feet)) - f)).toBeLessThan(0.02);
  });
});

describe('skin burns, Fig. 12.65', () => {
  // [degree, yield kt, cal/cm^2 for 50 % probability]
  it.each([
    [1, 1, 2.0],
    [1, 1000, 3.2],
    [2, 1, 4.0],
    [2, 100, 5.5],
    [2, 1000, 6.2],
    [3, 1, 6.0],
    [3, 100, 8.45],
    [3, 10000, 10.9],
  ] as const)('degree %d at %d kt: %d cal/cm^2', (degree, yieldKt, q) => {
    expect(Math.abs(burnThreshold(degree, yieldKt) - q)).toBeLessThan(0.15);
  });
});

describe('Hiroshima', () => {
  it('Fig. 7.48 caption: 5 to 6 cal/cm^2 estimated at 1.25 miles (burst of §2.24); the model is within 30 %', () => {
    const q = radiantExposure(miToM(1.25), { yieldKt: 12.5, burstHeightM: ftToM(1670) });
    expect(q).toBeGreaterThan(5 * 0.7);
    expect(q).toBeLessThan(6 * 1.3);
  });
});

// Tests for the fallout model: the WSEG-10 equations of Hanifen (1980), the cloud
// heights of Glasstone & Dolan Fig. 9.96 and the effective wind of §9.84.

import { describe, expect, it } from 'vitest';
import { MILE, MPH, kftToM } from '../units';
import { stabilisedCloud } from './cloud';
import { effectiveWind, uniformWind } from './wind';
import { accumulatedDose, doseRateAt, wseg10 } from './wseg10';

const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;

describe('WSEG-10 cloud parameters (Hanifen 1980, eqs. 1-8)', () => {
  it('cloud centre of a 1 Mt burst: 44 - 0.205 x 2.42^2 = 42.8 kilofeet', () => {
    const m = wseg10({ yieldKt: 1000, fissionFraction: 1, windSpeedMs: 15 * MPH });
    expect(rel(m.cloudCentreHeightM, kftToM(42.8))).toBeLessThan(0.005);
  });

  it('sigma_0 of a 1 Mt burst: exp(0.7 - 3.25/33.16) = 1.826 miles, so the cloud radius is 3.65 miles', () => {
    const m = wseg10({ yieldKt: 1000, fissionFraction: 1, windSpeedMs: 15 * MPH });
    expect(rel(m.cloudRadiusM, 2 * 1.826 * MILE)).toBeLessThan(0.005);
  });

  it('time constant of a 1 Mt burst is about 7.5 hours', () => {
    const m = wseg10({ yieldKt: 1000, fissionFraction: 1, windSpeedMs: 15 * MPH });
    expect(rel(m.timeConstantH, 7.5)).toBeLessThan(0.01);
  });
});

describe('WSEG-10 pattern', () => {
  const megaton = wseg10({ yieldKt: 1000, fissionFraction: 1, windSpeedMs: 15 * MPH });

  it('conserves activity: the pattern integrates to 2e6 R/h mi^2 per megaton of fission (eq. 32)', () => {
    // Integrate over a wide rectangle in miles.
    let sum = 0;
    const dx = 2;
    const dy = 0.5;
    for (let x = -200; x <= 3000; x += dx) {
      for (let y = 0; y <= 150; y += dy) {
        sum += megaton.doseRateH1(x * MILE, y * MILE) * dx * dy * 2;
      }
    }
    expect(rel(sum, 2e6)).toBeLessThan(0.08);
  });

  it('is proportional to the fission fraction and to the local fraction', () => {
    const half = wseg10({ yieldKt: 1000, fissionFraction: 0.5, windSpeedMs: 15 * MPH });
    const quarter = wseg10({ yieldKt: 1000, fissionFraction: 0.5, windSpeedMs: 15 * MPH, localFraction: 0.5 });
    const at = [50 * MILE, 2 * MILE] as const;
    expect(rel(half.doseRateH1(...at) / megaton.doseRateH1(...at), 0.5)).toBeLessThan(1e-9);
    expect(rel(quarter.doseRateH1(...at) / megaton.doseRateH1(...at), 0.25)).toBeLessThan(1e-9);
  });

  it('is symmetric across the wind axis and strongest on it', () => {
    const x = 80 * MILE;
    expect(megaton.doseRateH1(x, 5 * MILE)).toBeCloseTo(megaton.doseRateH1(x, -5 * MILE), 9);
    expect(megaton.doseRateH1(x, 0)).toBeGreaterThan(megaton.doseRateH1(x, 5 * MILE));
  });

  it('reaches further downwind than upwind', () => {
    const extent = megaton.contourExtentM(100)!;
    expect(extent[0]).toBeLessThanOrEqual(0);
    expect(extent[1]).toBeGreaterThan(-extent[0] * 5);
  });

  it('the contour half-width matches the dose rate field', () => {
    const x = 100 * MILE;
    const half = megaton.contourHalfWidthM(x, 100);
    expect(half).toBeGreaterThan(0);
    expect(rel(megaton.doseRateH1(x, half), 100)).toBeLessThan(1e-6);
  });

  it('wind shear widens the pattern and shortens it', () => {
    const sheared = wseg10({ yieldKt: 1000, fissionFraction: 1, windSpeedMs: 15 * MPH, shearMsPerKm: 2 });
    const x = 100 * MILE;
    expect(sheared.contourHalfWidthM(x, 30)).toBeGreaterThan(megaton.contourHalfWidthM(x, 30));
    expect(sheared.contourExtentM(100)![1]).toBeLessThan(megaton.contourExtentM(100)![1]);
  });

  it('in calm air the pattern is round', () => {
    const calm = wseg10({ yieldKt: 100, fissionFraction: 1, windSpeedMs: 0 });
    const r = 5 * MILE;
    expect(rel(calm.doseRateH1(r, 0), calm.doseRateH1(-r, 0))).toBeLessThan(0.02);
    expect(rel(calm.doseRateH1(r, 0), calm.doseRateH1(0, r))).toBeLessThan(0.6);
  });

  it('fallout arrives no earlier than half an hour, and far downwind at about distance / wind', () => {
    expect(megaton.arrivalTimeH(0)).toBeGreaterThanOrEqual(0.5);
    const x = 600 * MILE;
    expect(rel(megaton.arrivalTimeH(x), 600 / 15)).toBeLessThan(0.1);
  });

  it('agrees within a factor of about 2 with the idealised contours of Glasstone & Dolan Table 9.93', () => {
    // Downwind distance (miles) of a contact surface burst with a 15 mph effective wind and
    // "15 degrees of shear": coefficient x W^0.45. WSEG-10 and the book's idealised patterns are
    // different models; with a typical shear of 0.5 (m/s)/km they agree within a factor of 2
    // from 1 kt to 1 Mt (closely at low yields, WSEG-10 shorter at high yields).
    for (const yieldKt of [1, 20, 100, 1000]) {
      const m = wseg10({ yieldKt, fissionFraction: 1, windSpeedMs: 15 * MPH, shearMsPerKm: 0.5 });
      for (const [doseRate, coefficient] of [
        [100, 8.9],
        [10, 24],
        [1, 40],
      ] as const) {
        const book = coefficient * Math.pow(yieldKt, 0.45);
        const extent = m.contourExtentM(doseRate);
        expect(extent).not.toBeNull();
        const model = extent![1] / MILE;
        expect(model / book).toBeGreaterThan(0.5);
        expect(model / book).toBeLessThan(2);
      }
    }
  });

  it('1 kt, 15 mph: 100, 10 and 1 R/h reach about 9, 24 and 40 miles (Table 9.93), within 15 %', () => {
    const m = wseg10({ yieldKt: 1, fissionFraction: 1, windSpeedMs: 15 * MPH, shearMsPerKm: 0.5 });
    expect(rel(m.contourExtentM(100)![1] / MILE, 8.9)).toBeLessThan(0.15);
    expect(rel(m.contourExtentM(10)![1] / MILE, 24)).toBeLessThan(0.15);
    expect(rel(m.contourExtentM(1)![1] / MILE, 40)).toBeLessThan(0.15);
  });

  it('gives no contour for a dose rate that is not reached', () => {
    const m = wseg10({ yieldKt: 1, fissionFraction: 1, windSpeedMs: 15 * MPH });
    expect(m.contourExtentM(1e6)).toBeNull();
  });
});

describe('decay of fallout (Glasstone & Dolan eqs. 9.147.1 and 9.150.1)', () => {
  it('the seven-ten rule: seven times later, ten times weaker', () => {
    expect(rel(doseRateAt(1000, 7), 100)).toBeLessThan(0.04);
    expect(rel(doseRateAt(1000, 49), 10)).toBeLessThan(0.07);
  });

  it('dose from 1 hour to 1 day at 100 R/h is 5 x 100 x (1 - 24^-0.2) = 235 R', () => {
    expect(rel(accumulatedDose(100, 1, 24), 235.2)).toBeLessThan(0.005);
  });
});

describe('stabilised cloud heights, Glasstone & Dolan Fig. 9.96', () => {
  it.each([
    [1, 10, 6],
    [100, 40, 20],
    [1000, 63, 37],
    [10000, 100, 60],
  ])('%d kt: top %d kft, bottom %d kft', (yieldKt, top, bottom) => {
    const c = stabilisedCloud(yieldKt);
    expect(rel(c.topM, kftToM(top))).toBeLessThan(0.02);
    expect(rel(c.bottomM, kftToM(bottom))).toBeLessThan(0.02);
  });

  it('rises with yield', () => {
    let previous = 0;
    for (const y of [0.1, 1, 15, 300, 5000, 50000]) {
      const c = stabilisedCloud(y);
      expect(c.topM).toBeGreaterThan(previous);
      expect(c.topM).toBeGreaterThan(c.bottomM);
      previous = c.topM;
    }
  });
});

describe('effective wind (Glasstone & Dolan §9.84)', () => {
  const cloud = stabilisedCloud(1000);

  it('a uniform wind stays as it is, with no shear', () => {
    const w = effectiveWind(uniformWind(10, 270), cloud);
    expect(w.speedMs).toBeCloseTo(10, 6);
    expect(w.fromDeg).toBeCloseTo(270, 6);
    expect(w.towardsDeg).toBeCloseTo(90, 6);
    expect(w.shearMsPerKm).toBeCloseTo(0, 6);
  });

  it('follows the winds aloft, not the surface wind', () => {
    // Athens, 11 Nov 2026 12:30: light southerly at the ground, strong north-westerlies aloft.
    const profile = [
      { heightM: 10, speedMs: 7 / 3.6, fromDeg: 207 },
      { heightM: 1500, speedMs: 49 / 3.6, fromDeg: 298 },
      { heightM: 5500, speedMs: 65 / 3.6, fromDeg: 305 },
      { heightM: 10500, speedMs: 120 / 3.6, fromDeg: 316 },
    ];
    const w = effectiveWind(profile, cloud);
    expect(w.fromDeg).toBeGreaterThan(290);
    expect(w.fromDeg).toBeLessThan(320);
    expect(w.speedMs).toBeGreaterThan(15);
    expect(w.speedMs).toBeLessThan(120 / 3.6);
  });

  it('opposite winds of equal depth cancel', () => {
    const profile = [
      { heightM: 0, speedMs: 10, fromDeg: 90 },
      { heightM: 20000, speedMs: 10, fromDeg: 270 },
    ];
    const symmetric = effectiveWind(profile, { bottomM: 20000, topM: 20000 });
    expect(symmetric.speedMs).toBeLessThan(0.2);
  });

  it('a wind that turns with height gives crosswind shear', () => {
    const profile = [
      { heightM: 0, speedMs: 10, fromDeg: 270 },
      { heightM: 20000, speedMs: 10, fromDeg: 360 },
    ];
    expect(effectiveWind(profile, cloud).shearMsPerKm).toBeGreaterThan(0.1);
  });
});

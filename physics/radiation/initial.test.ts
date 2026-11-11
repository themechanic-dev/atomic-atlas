// Accuracy tests for initial nuclear radiation: the worked examples printed
// with Figs. 8.123, 8.127 and 8.130 of Glasstone & Dolan (1977).
//
// The book states a reliability factor of 0.5 to 2 for these charts, and the
// curves here were digitised from the printed figures, so the tolerances are
// wider than for blast.

import { describe, expect, it } from 'vitest';
import { ftToM, ydToM } from '../units';
import { initialDose, initialDoseRadiusM } from './initial';

const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;

describe('worked examples', () => {
  it('Fig. 8.123a: 10 kt fission at 300 ft, neutron dose at 1,500 yd is 160 rad (defense curve)', () => {
    const d = initialDose(ydToM(1500), { yieldKt: 10, burstHeightM: ftToM(300), fissionFraction: 1 });
    expect(rel(d.high.neutron, 160)).toBeLessThan(0.2);
  });

  it('Fig. 8.127a: 20 kt fission on the surface, secondary gamma dose at 1,000 yd is 300 rad (offense curve)', () => {
    const d = initialDose(ydToM(1000), { yieldKt: 20, burstHeightM: 0, fissionFraction: 1 });
    expect(rel(d.low.secondaryGamma, 300)).toBeLessThan(0.2);
  });

  it('Fig. 8.130a and 8.132: 20 kt fission on the surface, fission product gamma dose at 1,000 yd is 3,375 rad', () => {
    const d = initialDose(ydToM(1000), { yieldKt: 20, burstHeightM: 0, fissionFraction: 1 });
    expect(rel(d.low.fissionProductGamma, 3375)).toBeLessThan(0.25);
  });

  it('§8.131 example: 1 Mt thermonuclear (50 % fission) at 3,200 ft, total 8.3 rad at 4,000 yd', () => {
    const d = initialDose(ydToM(4000), { yieldKt: 1000, burstHeightM: ftToM(3200), fissionFraction: 0.5 });
    expect(rel(d.low.neutron, 0.12)).toBeLessThan(0.35);
    expect(rel(d.low.secondaryGamma, 1.8)).toBeLessThan(0.35);
    expect(rel(d.low.fissionProductGamma, 6.4)).toBeLessThan(0.35);
    expect(rel(d.low.total, 8.3)).toBeLessThan(0.3);
    // Thermonuclear weapons have a single curve: low and high coincide.
    expect(d.high.total).toBeCloseTo(d.low.total, 6);
  });
});

describe('behaviour', () => {
  const hiroshima = { yieldKt: 12.5, burstHeightM: ftToM(1670), fissionFraction: 1 };

  it('falls steeply with distance', () => {
    let previous = Infinity;
    for (let r = 300; r <= 4000; r += 100) {
      const d = initialDose(r, hiroshima).high.total;
      expect(d).toBeLessThan(previous);
      previous = d;
    }
  });

  it('the defense curve is never below the offense curve for fission weapons', () => {
    for (let r = 400; r <= 3500; r += 150) {
      const d = initialDose(r, hiroshima);
      expect(d.high.total).toBeGreaterThanOrEqual(d.low.total);
    }
  });

  it('a 450 rad ring for a Hiroshima-size burst lies between 1 and 1.6 km from ground zero', () => {
    const ring = initialDoseRadiusM(450, hiroshima);
    expect(ring.low).toBeGreaterThan(800);
    expect(ring.high).toBeLessThan(1700);
    expect(ring.high).toBeGreaterThanOrEqual(ring.low);
  });

  it('gives no ring when the burst is too high for the dose to reach the ground', () => {
    const ring = initialDoseRadiusM(1e6, { yieldKt: 1, burstHeightM: 5000, fissionFraction: 1 });
    expect(ring.low).toBe(0);
    expect(ring.high).toBe(0);
  });
});

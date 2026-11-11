// Tests for the casualty model against the worked case of OTA (1979), Chapter II:
// a 1 Mt surface burst on Detroit (Table 4).

import { describe, expect, it } from 'vitest';
import { detonate, DEFAULT_SCENARIO } from '../detonation';
import { MILE, ftToM } from '../units';
import {
  ASSUMPTIONS,
  blastVulnerability,
  estimateCasualties,
  outcomeAt,
  radiationLethality,
  type EffectsAt,
  type PopulationSample,
} from './model';

const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;

/** People spread evenly over a ring between two radii (miles), as point samples. */
function ring(innerMi: number, outerMi: number, people: number): PopulationSample[] {
  const samples: PopulationSample[] = [];
  const steps = 200;
  let totalWeight = 0;
  const radii: number[] = [];
  for (let i = 0; i < steps; i++) {
    const r = innerMi + ((i + 0.5) / steps) * (outerMi - innerMi);
    radii.push(r);
    totalWeight += r;
  }
  for (const r of radii) samples.push({ groundRangeM: r * MILE, people: (people * r) / totalWeight });
  return samples;
}

// OTA Table 4: distance from ground zero (miles) and population of each ring.
const DETROIT = [
  ...ring(0, 1.7, 70_000),
  ...ring(1.7, 2.7, 250_000),
  ...ring(2.7, 4.7, 400_000),
  ...ring(4.7, 7.4, 600_000),
];

describe('OTA (1979) Figure 1: vulnerability by overpressure zone', () => {
  it.each([
    [20, 0.98, 0.02],
    [12, 0.98, 0.02],
    [8, 0.5, 0.4],
    [3, 0.05, 0.45],
    [1.5, 0, 0.25],
    [0.5, 0, 0],
  ])('%d psi: %d killed, %d injured', (psi, killed, injured) => {
    expect(blastVulnerability(psi)).toEqual({ killed, injured });
  });
});

describe('OTA (1979) Table 4: 1 Mt surface burst on Detroit', () => {
  it('with the pressure rings of the report the zone arithmetic gives 220,000 dead and 430,000 injured', () => {
    // 12, 5, 2 and 1 psi at 1.7, 2.7, 4.7 and 7.4 miles, as in the report; blast only.
    const steps: EffectsAt = {
      overpressurePsi: (r) => {
        const mi = r / MILE;
        return mi < 1.7 ? 15 : mi < 2.7 ? 8 : mi < 4.7 ? 3 : mi < 7.4 ? 1.5 : 0.5;
      },
      radiantExposure: () => 0,
      initialDose: () => 0,
      secondDegreeBurn: 6,
      thirdDegreeBurn: 9,
    };
    const result = estimateCasualties(DETROIT, steps);
    expect(rel(result.killed.central, 220_000)).toBeLessThan(0.05);
    expect(rel(result.injured.central, 430_000)).toBeLessThan(0.02);
    expect(result.peopleInside1Psi).toBeCloseTo(1_320_000, -2);
  });

  it('with this app\'s own blast model the same city gives the same order: within 25 %', () => {
    const d = detonate({ ...DEFAULT_SCENARIO, yieldKt: 1000, burstMode: 'surface', fissionFraction: 0.5 });
    const blastOnly: EffectsAt = { ...d.effects, radiantExposure: () => 0, initialDose: () => 0 };
    const result = estimateCasualties(DETROIT, blastOnly);
    expect(rel(result.killed.central, 220_000)).toBeLessThan(0.25);
    expect(rel(result.injured.central, 430_000)).toBeLessThan(0.25);
  });

  it('the report\'s ring distances are reproduced by the blast model within 20 %', () => {
    const d = detonate({ ...DEFAULT_SCENARIO, yieldKt: 1000, burstMode: 'surface' });
    for (const [psi, miles] of [
      [12, 1.7],
      [5, 2.7],
      [2, 4.7],
      [1, 7.4],
    ] as const) {
      // Find the radius by scanning the pressure function.
      let r = 100;
      while (d.effects.overpressurePsi(r) >= psi && r < 1e5) r += 25;
      expect(rel(r / MILE, miles)).toBeLessThan(0.2);
    }
  });

  it('burns add fatalities when many people are outdoors (Table 5: 1 % against 25 % exposed)', () => {
    const d = detonate({ ...DEFAULT_SCENARIO, yieldKt: 1000, burstMode: 'surface', visibilityM: 10 * MILE });
    const result = estimateCasualties(DETROIT, d.effects);
    expect(result.killed.high).toBeGreaterThan(result.killed.central * 1.1);
    expect(result.killed.low).toBeLessThanOrEqual(result.killed.central);
    expect(result.injured.low).toBeLessThanOrEqual(result.injured.high);
  });
});

describe('OTA (1979) Chapter II: a 1 kt weapon on the surface', () => {
  const small = detonate({ ...DEFAULT_SCENARIO, yieldKt: 1, burstMode: 'surface', fissionFraction: 1 });

  it('5 psi at about 1,450 ft', () => {
    expect(rel(small.rings.find((r) => r.id === 'blast5')!.radiusM, ftToM(1450))).toBeLessThan(0.1);
  });

  it('600 rem of initial radiation reaches about 2,650 ft: inside the span of the two radiation curves, within 25 %', () => {
    const at = ftToM(2650);
    const low = small.effects.initialDose(at, false);
    const high = small.effects.initialDose(at, true);
    expect(low).toBeLessThan(600 * 1.25);
    expect(high).toBeGreaterThan(600 * 0.75);
  });

  it('for so small a weapon radiation, not blast, is the lethal effect with the greatest range', () => {
    const radiation = small.rings.find((r) => r.id === 'radiation450')!;
    const blast = small.rings.find((r) => r.id === 'blast5')!;
    expect(radiation.radiusM).toBeGreaterThan(blast.radiusM);
  });
});

describe('radiation lethality (OTA 1979)', () => {
  it.each([
    [100, 0],
    [300, 0.1],
    [450, 0.5],
    [600, 0.9],
    [1000, 1],
  ])('%d rem kills %d of those exposed', (dose, fraction) => {
    expect(radiationLethality(dose)).toBeCloseTo(fraction, 6);
  });
});

describe('combination of effects', () => {
  const none: EffectsAt = {
    overpressurePsi: () => 0,
    radiantExposure: () => 0,
    initialDose: () => 0,
    secondDegreeBurn: 6,
    thirdDegreeBurn: 9,
  };

  it('nobody is hurt where no effect reaches', () => {
    expect(outcomeAt(1000, none, ASSUMPTIONS.high, true)).toEqual({ killed: 0, injured: 0 });
  });

  it('killed and injured never exceed the people present', () => {
    const everything: EffectsAt = { ...none, overpressurePsi: () => 8, radiantExposure: () => 50, initialDose: () => 500 };
    for (const a of Object.values(ASSUMPTIONS)) {
      const o = outcomeAt(1000, everything, a, true);
      expect(o.killed + o.injured).toBeLessThanOrEqual(1 + 1e-12);
      expect(o.killed).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('third-degree burns kill the exposed share of blast survivors', () => {
    const burns: EffectsAt = { ...none, radiantExposure: () => 20 };
    expect(outcomeAt(1000, burns, ASSUMPTIONS.high, false).killed).toBeCloseTo(0.25, 9);
    expect(outcomeAt(1000, burns, ASSUMPTIONS.low, false).killed).toBeCloseTo(0.01, 9);
  });
});

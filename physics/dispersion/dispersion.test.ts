import { describe, expect, it } from 'vitest';
import accidents from '../../data/accidents.json';
import { SOURCES } from '../sources';
import { NUCLIDES } from './nuclides';
import { depletionFactor, dilution, sampleTimeFactor, sigmaY, sigmaZ, windAtHeight, type PlumeConditions } from './plume';
import { assessRelease, distanceToDose, doseAt, halfWidthAt, IAEA_CRITERIA, type Release } from './release';

const CURIE = 3.7e10;

describe('Gaussian plume', () => {
  // HotSpot 3.0 User's Guide, chapter 4, "General Plume" example: 20,000 Ci of Kr-85 from 10 m,
  // wind 1 m/s, stability A, no deposition. Time-integrated concentration in Ci.s/m3.
  const conditions: PlumeConditions = { stability: 'A', wind10Ms: 1, releaseHeightM: 10, durationMin: 10 };
  const table: Array<[number, number]> = [
    [0.03, 4.2e1],
    [0.1, 1.3e1],
    [0.2, 3.5],
    [0.3, 1.6],
    [0.5, 5.9e-1],
    [0.8, 2.3e-1],
    [1, 1.5e-1],
    [2, 4.0e-2],
    [4, 1.1e-2],
    [6, 5.1e-3],
    [10, 2.0e-3],
    [20, 6.3e-4],
    [40, 2.0e-4],
    [80, 6.8e-5],
  ];

  it('reproduces the worked example of the HotSpot guide at every distance', () => {
    for (const [km, expected] of table) {
      const value = 2e4 * dilution(conditions, km * 1000);
      // The guide prints two figures: allow their rounding and a little more.
      expect(value / expected, `${km} km`).toBeGreaterThan(0.94);
      expect(value / expected, `${km} km`).toBeLessThan(1.06);
    }
  });

  it('gives the dose of the same example: 6.7e-5 rem at 1 km from the cloud of krypton', () => {
    const release: Release = { nuclides: [{ nuclide: 'Kr-85', activityBq: 2e4 * CURIE }], conditions };
    const dose = doseAt(release, 1000);
    expect(dose.inhalationSv).toBe(0);
    expect(dose.ground1ySv).toBe(0);
    expect((dose.cloudSv * 100) / 6.7e-5).toBeGreaterThan(0.93);
    expect((dose.cloudSv * 100) / 6.7e-5).toBeLessThan(1.07);
    // Arrival at 1 km with a wind of 1 m/s: 16 minutes 40 seconds.
    expect(dose.arrivalS).toBeCloseTo(1000, 6);
  });

  it('uses the standard-terrain coefficients', () => {
    expect(sigmaY('A', 1000)).toBeCloseTo(220 / Math.sqrt(1.1), 6);
    expect(sigmaZ('A', 1000)).toBe(200);
    expect(sigmaZ('D', 1000)).toBeCloseTo(60 / Math.sqrt(2.5), 6);
    expect(sigmaZ('F', 1000)).toBeCloseTo(16 / 1.3, 6);
    // More stable air spreads the plume less.
    for (const x of [100, 1000, 10000]) {
      expect(sigmaY('A', x)).toBeGreaterThan(sigmaY('D', x));
      expect(sigmaY('D', x)).toBeGreaterThan(sigmaY('F', x));
      expect(sigmaZ('A', x)).toBeGreaterThan(sigmaZ('D', x));
      expect(sigmaZ('D', x)).toBeGreaterThan(sigmaZ('F', x));
    }
  });

  it('changes the wind with height as in the guide: 11 m/s at 10 m is 13.04 m/s at 31 m in class D', () => {
    expect(windAtHeight(11, 31, 'D')).toBeCloseTo(13.04, 1);
    expect(windAtHeight(5, 10, 'D')).toBe(5);
    expect(windAtHeight(5, 0, 'F')).toBeCloseTo(5 * Math.pow(0.2, 0.55), 6);
  });

  it('widens the plume for longer releases', () => {
    expect(sampleTimeFactor(10)).toBe(1);
    expect(sampleTimeFactor(60)).toBeCloseTo(Math.pow(6, 0.2), 9);
    expect(sampleTimeFactor(1)).toBe(1);
  });

  it('loses material to the ground on the way, more in stable air and from low releases', () => {
    const low: PlumeConditions = { stability: 'F', wind10Ms: 2, releaseHeightM: 2, durationMin: 10 };
    const high: PlumeConditions = { stability: 'F', wind10Ms: 2, releaseHeightM: 200, durationMin: 10 };
    expect(depletionFactor(low, 0, 10000)).toBe(1);
    const near = depletionFactor(low, 0.003, 1000);
    const far = depletionFactor(low, 0.003, 50000);
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(0);
    expect(depletionFactor(high, 0.003, 1000)).toBeGreaterThan(near);
    expect(depletionFactor({ ...low, stability: 'A' }, 0.003, 10000)).toBeGreaterThan(depletionFactor(low, 0.003, 10000));
  });
});

describe('dose from a release', () => {
  const conditions: PlumeConditions = { stability: 'D', wind10Ms: 4, releaseHeightM: 50, durationMin: 60 };
  const caesium: Release = { nuclides: [{ nuclide: 'Cs-137', activityBq: 1e15 }], conditions };

  it('adds up breathing, cloud and ground, and the ground dose grows with time', () => {
    const dose = doseAt(caesium, 5000);
    expect(dose.inhalationSv).toBeGreaterThan(0);
    expect(dose.cloudSv).toBeGreaterThan(0);
    expect(dose.ground1ySv).toBeGreaterThan(dose.ground7dSv);
    expect(dose.first7dSv).toBeCloseTo(dose.inhalationSv + dose.cloudSv + dose.ground7dSv, 12);
    // Caesium-137 barely decays in a year: the yearly ground dose is close to 52 times the weekly one.
    expect(dose.ground1ySv / dose.ground7dSv).toBeGreaterThan(50);
    expect(dose.ground1ySv / dose.ground7dSv).toBeLessThan(52.3);
    expect(dose.depositionBqM2['Cs-137']).toBeGreaterThan(0);
  });

  it('is proportional to the activity released', () => {
    const tenfold: Release = { nuclides: [{ nuclide: 'Cs-137', activityBq: 1e16 }], conditions };
    expect(doseAt(tenfold, 5000).first7dSv / doseAt(caesium, 5000).first7dSv).toBeCloseTo(10, 9);
  });

  it('falls off to the side and the criteria reach further for larger releases', () => {
    expect(doseAt(caesium, 5000, 600).first7dSv).toBeLessThan(doseAt(caesium, 5000, 0).first7dSv);
    const small = assessRelease(caesium);
    const large = assessRelease({ nuclides: [{ nuclide: 'Cs-137', activityBq: 1e17 }], conditions });
    expect(large.relocationRangeM).toBeGreaterThan(small.relocationRangeM);
    expect(large.relocationRangeM).toBeGreaterThanOrEqual(large.urgentRangeM);
    const width = halfWidthAt(large.release, (dose) => dose.firstYearSv, IAEA_CRITERIA.relocationSv, large.relocationRangeM / 2);
    expect(width).toBeGreaterThan(0);
    expect(distanceToDose(caesium, (dose) => dose.first7dSv, 1e9)).toBe(0);
  });

  it('lets short-lived iodine decay on the way and on the ground', () => {
    const iodine: Release = { nuclides: [{ nuclide: 'I-131', activityBq: 1e15 }], conditions };
    const dose = doseAt(iodine, 20000);
    // Eight days half-life: a year on the ground gives little more than the first weeks.
    expect(dose.ground1ySv / dose.ground7dSv).toBeLessThan(2.3);
  });

  it('gives noble gases a cloud dose only', () => {
    const xenon: Release = { nuclides: [{ nuclide: 'Xe-133', activityBq: 1e17 }], conditions };
    const dose = doseAt(xenon, 3000);
    expect(dose.cloudSv).toBeGreaterThan(0);
    expect(dose.inhalationSv).toBe(0);
    expect(dose.ground1ySv).toBe(0);
  });
});

describe('historical accidents', () => {
  it('use only nuclides the model knows, with a source that exists', () => {
    expect(accidents.length).toBe(5);
    for (const accident of accidents) {
      expect(Object.keys(SOURCES), accident.id).toContain(accident.source);
      expect(accident.nuclides.length, accident.id).toBeGreaterThan(0);
      for (const entry of accident.nuclides) {
        expect(NUCLIDES[entry.nuclide], `${accident.id} ${entry.nuclide}`).toBeDefined();
        expect(entry.activityBq).toBeGreaterThan(0);
      }
      expect(Math.abs(accident.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(accident.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('carry the figures of their sources', () => {
    const of = (id: string, nuclide: string): number => accidents.find((a) => a.id === id)!.nuclides.find((n) => n.nuclide === nuclide)!.activityBq;
    // UNSCEAR 2008 Annex D, Table A1.
    expect(of('chernobyl-1986', 'I-131')).toBe(1.76e18);
    expect(of('chernobyl-1986', 'Cs-137')).toBe(8.5e16);
    // UNSCEAR 2013 Annex A, Table B4.
    expect(of('fukushima-2011', 'I-131')).toBe(1.24e17);
    expect(of('fukushima-2011', 'Cs-137')).toBe(8.83e15);
    // UNSCEAR 2008 Annex C.
    expect(of('windscale-1957', 'I-131')).toBe(7.4e14);
    expect(of('three-mile-island-1979', 'I-131')).toBe(5.5e11);
    // NRPA Bulletin 8/2007, Table 1: 74 PBq beyond the site.
    const kyshtym = accidents.find((a) => a.id === 'kyshtym-1957')!.nuclides.reduce((sum, n) => sum + n.activityBq, 0);
    expect(kyshtym * 2 - 3.0e13).toBeGreaterThan(7.3e16);
    expect(kyshtym * 2 - 3.0e13).toBeLessThan(7.5e16);
  });

  it('rank as history does: Chernobyl far above Three Mile Island', () => {
    const conditions: PlumeConditions = { stability: 'D', wind10Ms: 4, releaseHeightM: 100, durationMin: 600 };
    const at = (id: string): number =>
      doseAt({ nuclides: accidents.find((a) => a.id === id)!.nuclides, conditions }, 30_000).firstYearSv;
    expect(at('chernobyl-1986')).toBeGreaterThan(at('fukushima-2011'));
    expect(at('fukushima-2011')).toBeGreaterThan(at('windscale-1957'));
    expect(at('windscale-1957')).toBeGreaterThan(at('three-mile-island-1979'));
    expect(at('three-mile-island-1979')).toBeLessThan(1e-3);
  });
});

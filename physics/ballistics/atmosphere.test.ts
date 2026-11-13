import { describe, expect, it } from 'vitest';
import { ATMOSPHERE_TOP_M, heightForDensity, standardAtmosphere } from './atmosphere';

// Values of the U.S. Standard Atmosphere, 1976 (Table I, geometric heights).
const TABLE: [heightM: number, temperatureK: number, densityKgM3: number][] = [
  [0, 288.15, 1.225],
  [5_000, 255.676, 0.73643],
  [11_000, 216.774, 0.36480],
  [20_000, 216.65, 0.08891],
  [30_000, 226.509, 0.018410],
  [40_000, 250.35, 0.0039957],
  [50_000, 270.65, 0.0010269],
  [60_000, 247.021, 3.0968e-4],
  [70_000, 219.585, 8.2829e-5],
  [80_000, 198.639, 1.8458e-5],
];

describe('U.S. Standard Atmosphere 1976', () => {
  it('matches the published table to within 0.2 %', () => {
    for (const [h, temperature, density] of TABLE) {
      const air = standardAtmosphere(h);
      expect(Math.abs(air.temperatureK / temperature - 1)).toBeLessThan(0.002);
      expect(Math.abs(air.densityKgM3 / density - 1)).toBeLessThan(0.002);
    }
  });

  it('gives the speed of sound of standard sea-level air', () => {
    expect(standardAtmosphere(0).soundSpeedMs).toBeCloseTo(340.29, 1);
    expect(standardAtmosphere(20_000).soundSpeedMs).toBeCloseTo(295.07, 1);
  });

  it('finds the height of a density, and clamps outside the layers', () => {
    for (const [h] of TABLE.slice(1)) {
      expect(heightForDensity(standardAtmosphere(h).densityKgM3)).toBeCloseTo(h, 0);
    }
    expect(heightForDensity(2)).toBe(0);
    expect(heightForDensity(1e-12)).toBe(ATMOSPHERE_TOP_M);
  });
});

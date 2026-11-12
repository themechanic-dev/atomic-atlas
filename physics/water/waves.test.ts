import { describe, expect, it } from 'vitest';
import { ftToM, ydToM } from '../units';
import {
  breakerHeightM,
  groupSpeed,
  heightConstantFt2,
  peakWaveArrivalS,
  peakWavePeriodS,
  rangeForWaveHeight,
  shoal,
  waterRegime,
  waveArrivalS,
  waveHeightM,
  waveNumber,
} from './waves';

// Bikini BAKER: 20 kt (as in the caption of Table 6.57) in the lagoon, about 180 ft deep.
const baker = { yieldKt: 20, depthM: ftToM(180) };
const table657 = [
  { yd: 330, ft: 94, s: 11 },
  { yd: 660, ft: 47, s: 23 },
  { yd: 1330, ft: 24, s: 48 },
  { yd: 2000, ft: 16, s: 74 },
  { yd: 2700, ft: 13, s: 101 },
  { yd: 4000, ft: 9, s: 154 },
];

describe('Glasstone wave height relations', () => {
  it('uses the shallow relation for Bikini BAKER', () => {
    expect(waterRegime(20, baker.depthM)).toBe('shallow');
  });

  it('gives the published constants', () => {
    expect(heightConstantFt2(1, ftToM(50))).toBeCloseTo(150 * 50, 6);
    expect(heightConstantFt2(1, ftToM(400))).toBeCloseTo(40_500, 6);
    // Continuous across the two boundaries.
    const w = 100;
    const lo = ftToM(100 * Math.pow(w, 0.25));
    const hi = ftToM(256 * Math.pow(w, 0.25));
    expect(heightConstantFt2(w, lo * 1.0001) / heightConstantFt2(w, lo * 0.9999)).toBeCloseTo(1, 3);
    expect(heightConstantFt2(w, hi * 1.0001) / heightConstantFt2(w, hi * 0.9999)).toBeCloseTo(1, 3);
  });

  it('is within a factor of 2 of the BAKER observations (Table 6.57)', () => {
    for (const row of table657) {
      const h = waveHeightM(baker, ydToM(row.yd));
      const ratio = h / ftToM(row.ft);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it('times the BAKER waves: first arrival within 15 %, peak wave later', () => {
    for (const row of table657.slice(2)) {
      const t = waveArrivalS(baker, ydToM(row.yd));
      expect(Math.abs(t / row.s - 1)).toBeLessThan(0.15);
      expect(peakWaveArrivalS(baker, ydToM(row.yd))).toBeGreaterThan(t);
    }
  });

  it('falls as 1/R and inverts', () => {
    const c = { yieldKt: 1000, depthM: 2000 };
    expect(waveHeightM(c, 20_000) / waveHeightM(c, 40_000)).toBeCloseTo(2, 6);
    const r = rangeForWaveHeight(c, 3);
    expect(waveHeightM(c, r)).toBeCloseTo(3, 6);
  });

  it('never stands higher than the water allows', () => {
    const shallow = { yieldKt: 1000, depthM: 10 };
    expect(waveHeightM(shallow, 100)).toBeLessThanOrEqual(7.8 + 1e-9);
  });
});

describe('linear wave theory', () => {
  it('matches deep and shallow limits', () => {
    const t = 10;
    const deepK = (2 * Math.PI) ** 2 / (9.80665 * t * t);
    expect(waveNumber(t, 5000)).toBeCloseTo(deepK, 8);
    expect(groupSpeed(t, 5000)).toBeCloseTo((9.80665 * t) / (4 * Math.PI), 4);
    expect(groupSpeed(200, 4)).toBeCloseTo(Math.sqrt(9.80665 * 4), 1);
  });

  it('gives the period of §6.119', () => {
    expect(peakWavePeriodS(1)).toBeCloseTo(14.1, 6);
  });
});

describe('shoaling and breaking', () => {
  it('grows by Green’s law and breaks at 0.78 d', () => {
    expect(shoal(1, 160, 10).heightM).toBeCloseTo(2, 6);
    expect(shoal(1, 160, 10).broken).toBe(false);
    const b = shoal(5, 100, 2);
    expect(b.broken).toBe(true);
    expect(b.heightM).toBeCloseTo(1.56, 6);
  });

  it('finds the breaker height consistently', () => {
    const hb = breakerHeightM(1, 100);
    const db = hb / 0.78;
    expect(1 * Math.pow(100 / db, 0.25)).toBeCloseTo(hb, 6);
  });
});

import { describe, expect, it } from 'vitest';
import { ftToM, MILE } from '../units';
import { blastArrivalS, cloudRiseFraction, cloudTopAtM, freeAirOverpressurePsi, heatPulse } from './events';

describe('arrival of the blast wave', () => {
  it('matches the worked example next to Figs. 3.77: 1 kt at 500 ft, one mile away, 4.0 s', () => {
    expect(blastArrivalS(1, ftToM(5280), ftToM(500)) / 4.0).toBeGreaterThan(0.94);
    expect(blastArrivalS(1, ftToM(5280), ftToM(500)) / 4.0).toBeLessThan(1.06);
  });

  it('scales with the cube root of the yield, as the same example does for 1 Mt: 40 s at 10 miles', () => {
    const t = blastArrivalS(1000, 10 * MILE, ftToM(5000));
    expect(t / 40).toBeGreaterThan(0.94);
    expect(t / 40).toBeLessThan(1.06);
  });

  it('is close to the rough times quoted in §3.14', () => {
    // "about 3 seconds" at 1 mile and "about 7.5" at 2 miles for 20 kt; "roughly 1.4 and 4.5" for 1 Mt.
    const cases: Array<[number, number, number]> = [
      [20, 1, 3],
      [20, 2, 7.5],
      [1000, 1, 1.4],
      [1000, 2, 4.5],
    ];
    for (const [yieldKt, miles, seconds] of cases) {
      const t = blastArrivalS(yieldKt, miles * MILE, 0);
      expect(t / seconds, `${yieldKt} kt at ${miles} mi`).toBeGreaterThan(0.85);
      expect(t / seconds, `${yieldKt} kt at ${miles} mi`).toBeLessThan(1.2);
    }
  });

  it('comes later the further away, and never faster than a strong shock allows', () => {
    let last = 0;
    for (let d = 200; d <= 30_000; d += 400) {
      const t = blastArrivalS(100, d, 1500);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
    // Far away the front moves at the speed of sound: 340 m further takes about a second more.
    const step = blastArrivalS(100, 60_340, 0) - blastArrivalS(100, 60_000, 0);
    expect(step).toBeGreaterThan(0.95);
    expect(step).toBeLessThan(1.01);
    expect(blastArrivalS(100, 0, 0)).toBe(0);
  });

  it('uses a free-air pressure that falls with distance', () => {
    expect(freeAirOverpressurePsi(1, 300)).toBeGreaterThan(freeAirOverpressurePsi(1, 600));
    expect(freeAirOverpressurePsi(1, 600)).toBeGreaterThan(freeAirOverpressurePsi(1, 1200));
  });
});

describe('heat pulse', () => {
  it('gives the time of the second maximum of the worked example: 500 kt, 0.64 s', () => {
    expect(heatPulse(500).peakS).toBeCloseTo(0.64, 2);
    expect(heatPulse(500).mostEmittedS).toBeCloseTo(6.4, 1);
  });

  it('is longer for larger yields', () => {
    expect(heatPulse(20).peakS).toBeLessThan(heatPulse(1000).peakS);
  });
});

describe('rise of the cloud', () => {
  it('follows Table 2.12 for one megaton', () => {
    expect(cloudRiseFraction(0)).toBe(0);
    expect(cloudRiseFraction(0.3 * 60)).toBeCloseTo(2 / 12, 6);
    expect(cloudRiseFraction(1.1 * 60)).toBeCloseTo(6 / 12, 6);
    expect(cloudRiseFraction(2.5 * 60)).toBeCloseTo(10 / 12, 6);
    expect(cloudRiseFraction(3.8 * 60)).toBe(1);
    expect(cloudRiseFraction(3600)).toBe(1);
  });

  it('ends at the height of the stabilised cloud', () => {
    // Fig. 9.96: about 63,000 ft for 1 Mt.
    expect(cloudTopAtM(1000, 600) / ftToM(63_000)).toBeCloseTo(1, 2);
    expect(cloudTopAtM(1000, 60)).toBeLessThan(cloudTopAtM(1000, 120));
  });
});

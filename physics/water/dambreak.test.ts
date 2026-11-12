import { describe, expect, it } from 'vitest';
import { distanceToFlow, peakFlowAt, peakOutflowM3s } from './dambreak';

describe('dam break', () => {
  it('gives Froehlich 1995 peak outflow', () => {
    // 10 million m3 behind a 30 m dam.
    const qp = peakOutflowM3s({ volumeM3: 1e7, headM: 30 });
    expect(qp).toBeCloseTo(0.607 * Math.pow(1e7, 0.295) * Math.pow(30, 1.24), 6);
    // Teton Dam 1976 (310 million m3, about 77 m of water): observed peak about 65,000 m3/s.
    const teton = peakOutflowM3s({ volumeM3: 3.1e8, headM: 77.4 });
    expect(teton / 65_000).toBeGreaterThan(0.5);
    expect(teton / 65_000).toBeLessThan(2);
  });

  it('falls to 37 % over the attenuation length', () => {
    expect(peakFlowAt(1000, 10_000) / 1000).toBeCloseTo(Math.exp(-1), 9);
    expect(distanceToFlow(1000, 1000 * Math.exp(-2))).toBeCloseTo(20_000, 6);
    expect(peakOutflowM3s({ volumeM3: 0, headM: 10 })).toBe(0);
  });
});

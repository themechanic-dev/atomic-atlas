import { describe, expect, it } from 'vitest';
import { planFlight, reachM } from './flight';
import {
  CIRCULAR_SPEED,
  DIVE_DISTANCE_PER_HEIGHT,
  glideEndSpeedMs,
  glideHeightM,
  glidePoints,
  glideRangeM,
  glideReachM,
  glideTimeS,
  glideTrajectory,
  speedAfterM,
  startSpeedForRangeM,
} from './glide';
import { ballisticTrajectory } from './trajectory';

const close = (value: number, expected: number, share: number): void => {
  expect(Math.abs(value / expected - 1)).toBeLessThan(share);
};

describe('hypersonic glide (Tracy & Wright 2020)', () => {
  it('reaches about 7,500 km from 6.1 km/s (Acton 2015, quoted by the source)', () => {
    close(glideRangeM(6100, 0), 7_500_000, 0.01);
  });

  it('halves its speed from 6 km/s after about 6,000 km of glide (Fig. 3)', () => {
    close(glideRangeM(6000, 3000), 6_000_000, 0.05);
  });

  it('flies at about 49.7 km at 6 km/s (equation 7, as in the source)', () => {
    close(glideHeightM(6000), 49_700, 0.03);
  });

  it('flies lower as it slows down', () => {
    expect(glideHeightM(7000)).toBeGreaterThan(glideHeightM(6000));
    expect(glideHeightM(6000)).toBeGreaterThan(glideHeightM(4000));
    expect(glideHeightM(4000)).toBeGreaterThan(glideHeightM(2000));
  });

  it('stops counting the glide at Mach 5, about 1.5 km/s', () => {
    const v = glideEndSpeedMs();
    expect(v).toBeGreaterThan(1400);
    expect(v).toBeLessThan(1600);
  });

  it('keeps range, time and speed consistent with each other', () => {
    const v0 = 6500;
    const v1 = speedAfterM(v0, 4_000_000);
    close(glideRangeM(v0, v1), 4_000_000, 1e-9);
    close(startSpeedForRangeM(glideReachM(v0)), v0, 1e-9);
    // Integrated step by step: dv/dt = −(g − v²/r)/(L/D).
    let v = v0;
    let t = 0;
    const dt = 0.05;
    const g = CIRCULAR_SPEED ** 2 / 6371008.8;
    while (v > v1) {
      v -= ((g - (v * v) / 6371008.8) / 2.6) * dt;
      t += dt;
    }
    close(glideTimeS(v0, v1), t, 1e-3);
    expect(speedAfterM(v0, 1e9)).toBe(0);
  });

  it('draws a path that climbs from the launcher, glides, and dives on the target', () => {
    const g = glideTrajectory(6_000_000, 6800)!;
    const points = glidePoints(g);
    expect(points[0]!.altitudeM).toBe(0);
    expect(points.at(-1)!.altitudeM).toBeCloseTo(0, 6);
    expect(points.at(-1)!.downrangeM).toBeCloseTo(6_000_000, 3);
    expect(points.at(-1)!.timeS).toBeCloseTo(g.flightTimeS, 6);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.timeS).toBeGreaterThan(points[i - 1]!.timeS);
      expect(points[i]!.speedMs).toBeLessThanOrEqual(points[i - 1]!.speedMs + 1e-9);
    }
    const highest = Math.max(...points.map((p) => p.altitudeM));
    close(highest, g.startHeightM, 0.02);
    // The dive: about five times its height in distance (Fig. 7c of the source).
    close(g.rangeM - g.diveStartM, DIVE_DISTANCE_PER_HEIGHT * g.diveHeightM, 0.01);
    expect(g.diveHeightM).toBeLessThan(g.startHeightM);
  });

  it('shares out a very short flight between climb and dive', () => {
    const g = glideTrajectory(60_000, 6800)!;
    expect(g.diveStartM).toBeGreaterThan(0);
    expect(g.diveStartM).toBeLessThan(60_000);
    const points = glidePoints(g);
    expect(points.at(-1)!.downrangeM).toBeCloseTo(60_000, 3);
    expect(points.at(-1)!.altitudeM).toBeCloseTo(0, 6);
  });

  it('refuses a target the glider cannot reach while hypersonic', () => {
    expect(glideTrajectory(glideReachM(6000) * 1.01, 6000)).toBeNull();
    expect(glideTrajectory(glideReachM(6000) * 0.99, 6000)).not.toBeNull();
  });
});

describe('glide flight plans', () => {
  it('plans a glider from its published speed', () => {
    const plan = planFlight('glide', 6_000_000, 'minimumEnergy', { glideSpeedMs: 6800, publishedRangeM: 6_000_000 })!;
    expect(plan.kind).toBe('glide');
    expect(plan.glide).not.toBeNull();
    expect(plan.ballistic).toBeNull();
    expect(plan.speedMs).toBe(6800);
    // About 55 km at the start, and some sixteen minutes of glide over 6,000 km.
    expect(plan.apogeeM).toBeGreaterThan(50_000);
    expect(plan.apogeeM).toBeLessThan(60_000);
    expect(plan.flightTimeS / 60).toBeGreaterThan(15);
    expect(plan.flightTimeS / 60).toBeLessThan(18);
    expect(plan.explanation.id).toBe('glide');
    expect(plan.explanation.sources).toContain('tracyWright2020');
  });

  it('ignores the shape of path, which is for ballistic missiles', () => {
    const a = planFlight('glide', 3_000_000, 'lofted', { glideSpeedMs: 6000 })!;
    const b = planFlight('glide', 3_000_000, 'depressed', { glideSpeedMs: 6000 })!;
    expect(a.flightTimeS).toBe(b.flightTimeS);
  });

  it('without a published speed, starts just fast enough for its published range', () => {
    const plan = planFlight('glide', 2_000_000, 'minimumEnergy', { publishedRangeM: 2_500_000 })!;
    close(plan.speedMs, startSpeedForRangeM(2_500_000), 1e-12);
    expect(planFlight('glide', 2_600_000, 'minimumEnergy', { publishedRangeM: 2_500_000 })).toBeNull();
  });

  it('reaches at least its published range, more when its speed takes it further', () => {
    expect(reachM('glide', 6_000_000, 'minimumEnergy', { glideSpeedMs: 6800 })).toBeGreaterThan(10_000_000);
    close(reachM('glide', 6_000_000, 'minimumEnergy', { glideSpeedMs: 5000 }), 6_000_000, 1e-12);
    close(reachM('glide', 2_500_000, 'lofted'), 2_500_000, 1e-9);
  });

  it('is not faster than a ballistic missile over intercontinental ranges (as the source finds)', () => {
    const range = 10_000_000;
    const glide = planFlight('glide', range, 'minimumEnergy', { glideSpeedMs: 6800 })!;
    const ballistic = ballisticTrajectory(range, 'depressed')!;
    expect(glide.flightTimeS).toBeGreaterThan(ballistic.flightTimeS);
  });
});

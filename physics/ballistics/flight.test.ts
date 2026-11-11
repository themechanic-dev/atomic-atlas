import { describe, expect, it } from 'vitest';
import { CRUISE_ALTITUDE_M, flightKind, planFlight, positionAt, reachM } from './flight';
import { ballisticTrajectory, SUBSONIC_CRUISE_SPEED } from './trajectory';

describe('flight plans', () => {
  it('treats cruise missiles as aircraft and everything else as ballistic', () => {
    expect(flightKind('cruise')).toBe('cruise');
    for (const category of ['icbm', 'slbm', 'irbm', 'mrbm', 'srbm']) expect(flightKind(category)).toBe('ballistic');
  });

  it('gives no plan for no distance', () => {
    expect(planFlight('icbm', 0)).toBeNull();
    expect(planFlight('cruise', -5)).toBeNull();
  });

  it('times a cruise missile as distance over speed, close to the ground', () => {
    const plan = planFlight('cruise', 2_400_000)!;
    expect(plan.kind).toBe('cruise');
    expect(plan.flightTimeS).toBeCloseTo(2_400_000 / SUBSONIC_CRUISE_SPEED, 6);
    expect(plan.apogeeM).toBe(CRUISE_ALTITUDE_M);
    expect(plan.ballistic).toBeNull();
    expect(plan.points[0]!.downrangeM).toBe(0);
    expect(plan.points.at(-1)!.downrangeM).toBeCloseTo(2_400_000, 3);
  });

  it('carries the ballistic trajectory into the plan', () => {
    const plan = planFlight('icbm', 9_000_000, 'minimumEnergy')!;
    const t = ballisticTrajectory(9_000_000, 'minimumEnergy')!;
    expect(plan.kind).toBe('ballistic');
    expect(plan.flightTimeS).toBe(t.flightTimeS);
    expect(plan.apogeeM).toBe(t.apogeeM);
    expect(plan.speedMs).toBe(t.burnoutSpeedMs);
    expect(plan.explanation.sources).toContain('bmw1971');
    expect(plan.points.at(-1)!.timeS).toBeCloseTo(t.flightTimeS, 3);
  });

  it('writes the climb angle of the chosen path into the explanation', () => {
    expect(planFlight('icbm', 5e6, 'minimumEnergy')!.explanation.formula).toContain('φ = (π − Ψ) / 4');
    expect(planFlight('icbm', 5e6, 'lofted')!.explanation.formula).toContain('φ = 1.5 (π − Ψ) / 4');
    expect(planFlight('icbm', 5e6, 'depressed')!.explanation.formula).toContain('φ = 0.5 (π − Ψ) / 4');
  });
});

describe('position along a flight', () => {
  const plan = planFlight('icbm', 8_000_000)!;

  it('starts at the launch point and ends at the target', () => {
    expect(positionAt(plan, -10).downrangeM).toBe(0);
    expect(positionAt(plan, 0).downrangeM).toBe(0);
    expect(positionAt(plan, plan.flightTimeS + 60).downrangeM).toBeCloseTo(8_000_000, 0);
  });

  it('is highest half way through, at the apogee', () => {
    const mid = positionAt(plan, plan.flightTimeS / 2);
    expect(mid.altitudeM / plan.apogeeM).toBeGreaterThan(0.995);
    expect(mid.downrangeM / plan.rangeM).toBeCloseTo(0.5, 2);
  });

  it('moves forward all the time', () => {
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const p = positionAt(plan, (plan.flightTimeS * i) / 200);
      expect(p.downrangeM).toBeGreaterThanOrEqual(last);
      last = p.downrangeM;
    }
  });
});

describe('reach on each shape of path', () => {
  it('is the published range on the minimum-energy path and for cruise missiles', () => {
    expect(reachM('icbm', 10_000_000, 'minimumEnergy')).toBe(10_000_000);
    expect(reachM('cruise', 2_500_000, 'lofted')).toBe(2_500_000);
    expect(reachM('icbm', 0, 'lofted')).toBe(0);
  });

  it('is shorter on a lofted or depressed path, and needs exactly the speed the missile has', () => {
    const available = ballisticTrajectory(10_000_000, 'minimumEnergy')!.burnoutSpeedMs;
    for (const shape of ['lofted', 'depressed'] as const) {
      const reach = reachM('icbm', 10_000_000, shape);
      expect(reach).toBeGreaterThan(5_000_000);
      expect(reach).toBeLessThan(10_000_000);
      expect(ballisticTrajectory(reach, shape)!.burnoutSpeedMs / available).toBeCloseTo(1, 5);
    }
  });

  it('never lets a flight ask for more speed than the published range implies', () => {
    for (const range of [500_000, 2_000_000, 6_000_000, 12_000_000]) {
      const available = ballisticTrajectory(range, 'minimumEnergy')!.burnoutSpeedMs;
      for (const shape of ['lofted', 'depressed'] as const) {
        const reach = reachM('irbm', range, shape);
        for (const f of [0.2, 0.6, 1]) {
          expect(ballisticTrajectory(reach * f, shape)!.burnoutSpeedMs).toBeLessThanOrEqual(available * 1.000001);
        }
      }
    }
  });
});

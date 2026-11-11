// Tests for the ballistic trajectory equations of Bate, Mueller & White, chapter 6.
//
// The closed-form results are checked two ways: against values that follow directly
// from the book's equations, and against a step-by-step simulation of the same flight
// under gravity alone, which shares no formula with them.

import { describe, expect, it } from 'vitest';
import {
  ballisticTrajectory,
  cruiseFlightTimeS,
  EARTH_RADIUS,
  maximumRangeM,
  minimumEnergyAngle,
  MU_EARTH,
  trajectoryFor,
  trajectoryPoints,
} from './trajectory';

const rel = (actual: number, expected: number): number => Math.abs(actual - expected) / expected;
const DEG = Math.PI / 180;

/** Flies a point mass from the surface under inverse-square gravity (RK4) until it comes back down. */
function simulate(speed: number, angle: number): { rangeM: number; timeS: number; apogeeM: number } {
  let x = EARTH_RADIUS;
  let y = 0;
  let vx = speed * Math.sin(angle); // radial
  let vy = speed * Math.cos(angle); // along the ground
  const accel = (px: number, py: number): [number, number] => {
    const r3 = Math.hypot(px, py) ** 3;
    return [(-MU_EARTH * px) / r3, (-MU_EARTH * py) / r3];
  };
  const dt = 0.25;
  let t = 0;
  let apogee = 0;
  for (;;) {
    const [a1x, a1y] = accel(x, y);
    const [a2x, a2y] = accel(x + (vx * dt) / 2, y + (vy * dt) / 2);
    const [a3x, a3y] = accel(x + (vx * dt) / 2 + (a1x * dt * dt) / 4, y + (vy * dt) / 2 + (a1y * dt * dt) / 4);
    const [a4x, a4y] = accel(x + vx * dt + (a2x * dt * dt) / 2, y + vy * dt + (a2y * dt * dt) / 2);
    const nx = x + vx * dt + ((a1x + a2x + a3x) * dt * dt) / 6;
    const ny = y + vy * dt + ((a1y + a2y + a3y) * dt * dt) / 6;
    const nvx = vx + ((a1x + 2 * a2x + 2 * a3x + a4x) * dt) / 6;
    const nvy = vy + ((a1y + 2 * a2y + 2 * a3y + a4y) * dt) / 6;
    const before = Math.hypot(x, y) - EARTH_RADIUS;
    const after = Math.hypot(nx, ny) - EARTH_RADIUS;
    if (t > 1 && after <= 0) {
      const f = before / (before - after);
      const ex = x + (nx - x) * f;
      const ey = y + (ny - y) * f;
      return { rangeM: Math.atan2(ey, ex) * EARTH_RADIUS, timeS: t + dt * f, apogeeM: apogee };
    }
    x = nx;
    y = ny;
    vx = nvx;
    vy = nvy;
    t += dt;
    apogee = Math.max(apogee, after);
    if (t > 20000) throw new Error('did not come down');
  }
}

describe('minimum-energy trajectory over a quarter of the globe (Psi = 90 degrees)', () => {
  const quarter = (Math.PI / 2) * EARTH_RADIUS;
  const t = ballisticTrajectory(quarter)!;

  it('Q = 2 sin 45 / (1 + sin 45) = 0.8284 and the flight-path angle is 22.5 degrees', () => {
    expect(t.q).toBeCloseTo(0.8284, 4);
    expect(t.flightPathAngle / DEG).toBeCloseTo(22.5, 6);
  });

  it('burnout speed about 7.2 km/s, apogee about 1,320 km, flight about 32 minutes', () => {
    expect(rel(t.burnoutSpeedMs, 7200)).toBeLessThan(0.01);
    expect(rel(t.apogeeM, 1_320_000)).toBeLessThan(0.01);
    expect(rel(t.flightTimeS / 60, 32.2)).toBeLessThan(0.01);
  });

  it('eccentricity is tan 22.5 = 0.4142', () => {
    expect(t.eccentricity).toBeCloseTo(Math.tan(22.5 * DEG), 4);
  });
});

describe('closed form against a step-by-step simulation', () => {
  it.each([300, 1000, 3000, 5500, 8000, 10000, 13000, 16000])('minimum energy, %d km', (km) => {
    const t = ballisticTrajectory(km * 1000)!;
    const flown = simulate(t.burnoutSpeedMs, t.flightPathAngle);
    expect(rel(flown.rangeM, t.rangeM)).toBeLessThan(0.002);
    expect(rel(flown.timeS, t.flightTimeS)).toBeLessThan(0.002);
    expect(rel(flown.apogeeM, t.apogeeM)).toBeLessThan(0.002);
  });

  it.each(['lofted', 'depressed'] as const)('%s, 8,000 km', (shape) => {
    const t = ballisticTrajectory(8_000_000, shape)!;
    const flown = simulate(t.burnoutSpeedMs, t.flightPathAngle);
    expect(rel(flown.rangeM, t.rangeM)).toBeLessThan(0.002);
    expect(rel(flown.timeS, t.flightTimeS)).toBeLessThan(0.002);
  });
});

describe('shape of the flight', () => {
  const range = 8_000_000;
  const optimum = ballisticTrajectory(range)!;
  const lofted = ballisticTrajectory(range, 'lofted')!;
  const depressed = ballisticTrajectory(range, 'depressed')!;

  it('the minimum-energy flight needs the least speed', () => {
    expect(optimum.burnoutSpeedMs).toBeLessThan(lofted.burnoutSpeedMs);
    expect(optimum.burnoutSpeedMs).toBeLessThan(depressed.burnoutSpeedMs);
  });

  it('lofted is higher and slower to arrive, depressed lower and quicker', () => {
    expect(lofted.apogeeM).toBeGreaterThan(optimum.apogeeM);
    expect(lofted.flightTimeS).toBeGreaterThan(optimum.flightTimeS);
    expect(depressed.apogeeM).toBeLessThan(optimum.apogeeM);
    expect(depressed.flightTimeS).toBeLessThan(optimum.flightTimeS);
  });

  it('short flights are flat: 45 degrees and an apogee of a quarter of the range', () => {
    const short = ballisticTrajectory(100_000)!;
    expect(short.flightPathAngle / DEG).toBeGreaterThan(44);
    expect(rel(short.apogeeM, 25_000)).toBeLessThan(0.02);
  });

  it('longer ranges take longer and need more speed', () => {
    let speed = 0;
    let time = 0;
    for (const km of [500, 1500, 3000, 5500, 9000, 12000, 15000]) {
      const t = ballisticTrajectory(km * 1000)!;
      expect(t.burnoutSpeedMs).toBeGreaterThan(speed);
      expect(t.flightTimeS).toBeGreaterThan(time);
      speed = t.burnoutSpeedMs;
      time = t.flightTimeS;
    }
  });

  it('never needs orbital speed (7.9 km/s) for less than half the globe', () => {
    expect(ballisticTrajectory(18_000_000)!.burnoutSpeedMs).toBeLessThan(7910);
  });
});

describe('maximum range for a burnout speed', () => {
  it('is the range of the minimum-energy trajectory with that speed', () => {
    for (const km of [800, 4000, 11000]) {
      const t = ballisticTrajectory(km * 1000)!;
      expect(rel(maximumRangeM(t.burnoutSpeedMs), km * 1000)).toBeLessThan(1e-6);
    }
  });

  it('a steeper or flatter launch with the same speed falls short', () => {
    const t = ballisticTrajectory(6_000_000)!;
    const steeper = simulate(t.burnoutSpeedMs, t.flightPathAngle + 6 * DEG);
    const flatter = simulate(t.burnoutSpeedMs, t.flightPathAngle - 6 * DEG);
    expect(steeper.rangeM).toBeLessThan(t.rangeM);
    expect(flatter.rangeM).toBeLessThan(t.rangeM);
  });
});

describe('points along the flight', () => {
  const t = ballisticTrajectory(10_000_000)!;
  const points = trajectoryPoints(t, 200);

  it('start and end on the ground, at time 0 and at the flight time', () => {
    expect(points[0]!.altitudeM).toBeLessThan(1);
    expect(points[0]!.timeS).toBeCloseTo(0, 6);
    expect(points[200]!.altitudeM).toBeLessThan(1);
    expect(rel(points[200]!.timeS, t.flightTimeS)).toBeLessThan(1e-6);
    expect(rel(points[200]!.downrangeM, t.rangeM)).toBeLessThan(1e-9);
  });

  it('peak at mid-range, at the apogee height and half the flight time', () => {
    const mid = points[100]!;
    expect(rel(mid.altitudeM, t.apogeeM)).toBeLessThan(1e-6);
    expect(rel(mid.timeS, t.flightTimeS / 2)).toBeLessThan(1e-6);
    for (const p of points) expect(p.altitudeM).toBeLessThanOrEqual(t.apogeeM + 1);
  });

  it('time always moves forward, and the missile is slowest at the top', () => {
    for (let i = 1; i < points.length; i++) expect(points[i]!.timeS).toBeGreaterThan(points[i - 1]!.timeS);
    expect(points[100]!.speedMs).toBeLessThan(points[0]!.speedMs);
    expect(rel(points[0]!.speedMs, t.burnoutSpeedMs)).toBeLessThan(1e-9);
  });
});

describe('edge cases', () => {
  it('gives nothing for a range of zero or more than the globe', () => {
    expect(ballisticTrajectory(0)).toBeNull();
    expect(ballisticTrajectory(50_000_000)).toBeNull();
    expect(trajectoryFor(5_000_000, 0)).toBeNull();
  });

  it('the minimum-energy angle falls from 45 degrees towards 0 at half the globe', () => {
    expect(minimumEnergyAngle(0) / DEG).toBeCloseTo(45, 9);
    expect(minimumEnergyAngle(Math.PI)).toBeCloseTo(0, 9);
  });

  it('level flight: 2,500 km at 240 m/s takes about 2 hours 54 minutes', () => {
    expect(rel(cruiseFlightTimeS(2_500_000, 240) / 3600, 2.894)).toBeLessThan(0.001);
  });
});

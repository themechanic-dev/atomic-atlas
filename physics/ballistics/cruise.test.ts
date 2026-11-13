import { describe, expect, it } from 'vitest';
import { CRUISE_HIGH_ALTITUDE_M, CRUISE_LOW_ALTITUDE_M, cruiseSpeed } from './cruise';
import { planFlight, reachM } from './flight';
import { SUBSONIC_CRUISE_SPEED } from './trajectory';

describe('cruise speed', () => {
  it('uses a published speed in km/h as given, low over the ground', () => {
    const c = cruiseSpeed({ speedKmh: 880 });
    expect(c.speedMs).toBeCloseTo(880 / 3.6, 9);
    expect(c.altitudeM).toBe(CRUISE_LOW_ALTITUDE_M);
    expect(c.published).toBe(true);
    expect(c.mach).toBeNull();
  });

  it('turns a subsonic Mach number into a speed with the speed of sound near the ground', () => {
    const c = cruiseSpeed({ speedMach: 0.58 });
    // At the 100 m it flies at, sound travels at 339.9 m/s, a hair slower than at sea level.
    expect(Math.abs(c.speedMs / (0.58 * 340.29) - 1)).toBeLessThan(0.002);
    expect(c.altitudeM).toBe(CRUISE_LOW_ALTITUDE_M);
    expect(c.high).toBe(false);
  });

  it('turns a supersonic Mach number into a speed with the speed of sound of the stratosphere', () => {
    const c = cruiseSpeed({ speedMach: 3 });
    // 295.07 m/s between 11 and 20 km (U.S. Standard Atmosphere 1976): about 3,190 km/h.
    expect(c.soundSpeedMs).toBeCloseTo(295.07, 1);
    expect(c.speedMs).toBeCloseTo(885.2, 0);
    expect(c.altitudeM).toBe(CRUISE_HIGH_ALTITUDE_M);
    expect(c.high).toBe(true);
  });

  it('prefers the Mach number when both are given, and falls back to the typical speed', () => {
    expect(cruiseSpeed({ speedMach: 2, speedKmh: 500 }).mach).toBe(2);
    const none = cruiseSpeed(undefined);
    expect(none.speedMs).toBe(SUBSONIC_CRUISE_SPEED);
    expect(none.published).toBe(false);
    expect(cruiseSpeed({ speedMach: 0, speedKmh: null }).published).toBe(false);
  });
});

describe('cruise flight plans', () => {
  it('time an ASMP at Mach 3 over its 300 km in under six minutes, high up', () => {
    const plan = planFlight('cruise', 300_000, 'minimumEnergy', { speedMach: 3 })!;
    expect(plan.flightTimeS).toBeCloseTo(300_000 / plan.speedMs, 9);
    expect(plan.flightTimeS / 60).toBeGreaterThan(5.5);
    expect(plan.flightTimeS / 60).toBeLessThan(5.8);
    expect(plan.apogeeM).toBe(CRUISE_HIGH_ALTITUDE_M);
    expect(plan.points.every((p) => p.altitudeM === CRUISE_HIGH_ALTITUDE_M)).toBe(true);
    expect(plan.cruise?.mach).toBe(3);
    expect(plan.explanation.formula).toContain('M · a(h)');
    expect(plan.explanation.sources).toContain('ussa1976');
  });

  it('time a missile with a speed in km/h without the atmosphere', () => {
    const plan = planFlight('cruise', 2_500_000, 'minimumEnergy', { speedKmh: 880 })!;
    expect(plan.flightTimeS / 3600).toBeCloseTo(2500 / 880, 9);
    expect(plan.explanation.sources).toEqual([]);
    expect(plan.explanation.where).toContain('published speed');
  });

  it('keep the typical subsonic speed when none is published', () => {
    const plan = planFlight('cruise', 1_000_000)!;
    expect(plan.speedMs).toBe(SUBSONIC_CRUISE_SPEED);
    expect(plan.cruise?.published).toBe(false);
    expect(plan.explanation.uncertainty).toBe('±20%');
  });

  it('do not change how far a cruise missile reaches', () => {
    expect(reachM('cruise', 600_000, 'lofted', { speedMach: 3 })).toBe(600_000);
  });
});

// From a weapon category and a distance to a flight plan: how it flies, how high,
// how long, with the explanation behind the numbers.

import type { Explanation, SourceId } from '../sources';
import { CRUISE_LOW_ALTITUDE_M, cruiseSpeed, type CruiseSpeed } from './cruise';
import {
  GLIDE_BALLISTIC_COEFFICIENT,
  GLIDE_LIFT_TO_DRAG,
  glidePoints,
  glideReachM,
  glideTrajectory,
  startSpeedForRangeM,
  type GlideTrajectory,
} from './glide';
import {
  ballisticTrajectory,
  cruiseFlightTimeS,
  trajectoryPoints,
  type BallisticTrajectory,
  type TrajectoryPoint,
  type TrajectoryShape,
} from './trajectory';

export type FlightKind = 'ballistic' | 'cruise' | 'glide';

/** What is published about how a weapon flies, in SI units where it has units; all of it optional. */
export interface FlightVehicle {
  /** Published range, metres: sets a glider's start speed when no speed is published. */
  publishedRangeM?: number | null;
  /** Published speed of a glider at the start of its glide, m/s. */
  glideSpeedMs?: number | null;
  /** Published cruise speed as a Mach number. */
  speedMach?: number | null;
  /** Published cruise speed in km/h. */
  speedKmh?: number | null;
}

/**
 * Speed a glider starts its glide at: the published one, or else the one that just reaches
 * its published range (or, failing that too, the target) before it slows below Mach 5.
 */
export function glideStartSpeedMs(vehicle: FlightVehicle | undefined, rangeM: number): number {
  if (vehicle?.glideSpeedMs && vehicle.glideSpeedMs > 0) return vehicle.glideSpeedMs;
  return startSpeedForRangeM(vehicle?.publishedRangeM && vehicle.publishedRangeM > 0 ? vehicle.publishedRangeM : rangeM);
}

/** Height at which a subsonic cruise missile is drawn and timed: it follows the ground at tens of metres. */
export const CRUISE_ALTITUDE_M = CRUISE_LOW_ALTITUDE_M;
/** Ground distance over which a high-flying cruise missile is drawn coming down, against its height. */
export const CRUISE_DESCENT_PER_HEIGHT = 3;

export interface FlightPlan {
  kind: FlightKind;
  rangeM: number;
  /** Flight time in seconds: free flight for ballistic missiles, the whole flight for cruise missiles. */
  flightTimeS: number;
  /** Highest point above the surface, metres. */
  apogeeM: number;
  /** Speed at burnout and at re-entry (ballistic) or cruise speed, m/s. */
  speedMs: number;
  ballistic: BallisticTrajectory | null;
  glide: GlideTrajectory | null;
  cruise: CruiseSpeed | null;
  /** Positions along the flight: time, distance over the ground, height. */
  points: TrajectoryPoint[];
  explanation: Explanation;
}

/** The climb angle at burnout as written in the explanation, for each shape of path. */
const ANGLE_FORMULA: Record<TrajectoryShape, string> = {
  minimumEnergy: '(π − Ψ) / 4',
  lofted: '1.5 (π − Ψ) / 4',
  depressed: '0.5 (π − Ψ) / 4',
};

/** Cruise missiles fly like aircraft, gliders glide; everything else with a range is ballistic. */
export function flightKind(category: string): FlightKind {
  return category === 'cruise' ? 'cruise' : category === 'glide' ? 'glide' : 'ballistic';
}

export function planFlight(category: string, rangeM: number, shape: TrajectoryShape = 'minimumEnergy', vehicle?: FlightVehicle): FlightPlan | null {
  if (!(rangeM > 0)) return null;

  if (flightKind(category) === 'glide') {
    const g = glideTrajectory(rangeM, glideStartSpeedMs(vehicle, rangeM));
    if (!g) return null;
    return {
      kind: 'glide',
      rangeM,
      flightTimeS: g.flightTimeS,
      apogeeM: g.startHeightM,
      speedMs: g.startSpeedMs,
      ballistic: null,
      glide: g,
      cruise: null,
      points: glidePoints(g),
      explanation: {
        id: 'glide',
        formula:
          'ρ(h) = 2β (g − v²/r) / ((L/D) v²);  d = ((L/D) r / 2) ln((1 − v₁²/(g r)) / (1 − v₀²/(g r)));  t = (L/D) √(r/g) (artanh(v₀/√(g r)) − artanh(v₁/√(g r)))',
        inputs: [
          { symbol: 'd', labelKey: 'groundRange', value: rangeM, quantity: 'length' },
          { symbol: 'v₀', labelKey: 'glideSpeed', value: g.startSpeedMs, quantity: 'speed' },
          { symbol: 'L/D', labelKey: 'liftToDrag', value: GLIDE_LIFT_TO_DRAG, quantity: 'number' },
          { symbol: 'β', labelKey: 'ballisticCoefficient', value: GLIDE_BALLISTIC_COEFFICIENT, quantity: 'number' },
        ],
        outputs: [
          { symbol: 'h₀', labelKey: 'glideHeight', value: g.startHeightM, quantity: 'length' },
          { symbol: 'v₁', labelKey: 'diveSpeed', value: g.diveSpeedMs, quantity: 'speed' },
          { symbol: 't', labelKey: 'flightTime', value: g.flightTimeS / 3600, quantity: 'time' },
        ],
        sources: ['tracyWright2020', 'eggers1958', 'ussa1976'],
        where: 'Tracy & Wright (2020) Eqs. (1) and (7), HTV-2 figures; glide range: Eggers, Allen & Neice (1958); air density: U.S. Standard Atmosphere 1976',
        uncertainty: '±20%',
      },
    };
  }

  if (flightKind(category) === 'cruise') {
    const c = cruiseSpeed(vehicle);
    const time = cruiseFlightTimeS(rangeM, c.speedMs);
    const count = 64;
    // A missile flying high is drawn coming down over the last stretch, three times its
    // height, so the line meets the target. A drawing aid: the time stays distance over speed.
    const descent = c.high ? Math.min(CRUISE_DESCENT_PER_HEIGHT * c.altitudeM, rangeM / 2) : 0;
    const distances = new Set<number>();
    for (let i = 0; i <= count; i++) distances.add((rangeM * i) / count);
    if (descent > 0) distances.add(rangeM - descent);
    const points: TrajectoryPoint[] = [...distances]
      .sort((a, b) => a - b)
      .map((d) => ({
        timeS: d / c.speedMs,
        downrangeM: d,
        altitudeM: descent > 0 && d > rangeM - descent ? (c.altitudeM * (rangeM - d)) / descent : c.altitudeM,
        speedMs: c.speedMs,
      }));
    const distance = { symbol: 'd', labelKey: 'groundRange', value: rangeM, quantity: 'length' as const };
    const speed = { symbol: 'v', labelKey: 'cruiseSpeed', value: c.speedMs, quantity: 'speed' as const };
    const duration = { symbol: 't', labelKey: 'flightTime', value: time / 3600, quantity: 'time' as const };
    const sources: SourceId[] = c.mach !== null ? ['ussa1976'] : [];
    return {
      kind: 'cruise',
      rangeM,
      flightTimeS: time,
      apogeeM: c.altitudeM,
      speedMs: c.speedMs,
      ballistic: null,
      glide: null,
      cruise: c,
      points,
      explanation:
        c.mach !== null
          ? {
              id: 'cruise',
              formula: 'v = M · a(h);  t = d / v',
              inputs: [
                distance,
                { symbol: 'M', labelKey: 'machNumber', value: c.mach, quantity: 'number' },
                { symbol: 'a', labelKey: 'soundSpeed', value: c.soundSpeedMs ?? 0, quantity: 'speed' },
              ],
              outputs: [speed, duration],
              sources,
              where: c.high
                ? 'published Mach number (catalog source), for flight at high altitude; speed of sound in the stratosphere (11-20 km): U.S. Standard Atmosphere 1976'
                : 'published Mach number (catalog source); speed of sound at 100 m: U.S. Standard Atmosphere 1976',
              uncertainty: '±10%',
            }
          : {
              id: 'cruise',
              formula: 't = d / v',
              inputs: [distance, speed],
              outputs: [duration],
              // Plain distance over speed: the published speed of the missile (catalog source),
              // or a round figure when none is published.
              sources,
              where: c.published ? 'published speed (catalog source)' : '',
              uncertainty: c.published ? '±10%' : '±20%',
            },
    };
  }

  const t = ballisticTrajectory(rangeM, shape);
  if (!t) return null;
  return {
    kind: 'ballistic',
    rangeM,
    flightTimeS: t.flightTimeS,
    apogeeM: t.apogeeM,
    speedMs: t.burnoutSpeedMs,
    ballistic: t,
    glide: null,
    cruise: null,
    points: trajectoryPoints(t, 120),
    explanation: {
      id: 'trajectory',
      formula: `Ψ = d / R;  φ = ${ANGLE_FORMULA[shape]};  Q = 2 sin(Ψ/2) / (sin(2φ + Ψ/2) + sin(Ψ/2));  v = √(Q μ / R);  a = R / (2 − Q);  e = √(1 + Q (Q − 2) cos²φ);  h = a (1 + e) − R;  t = 2 √(a³/μ) (π − E₁ + e sin E₁)`,
      inputs: [
        { symbol: 'd', labelKey: 'groundRange', value: rangeM, quantity: 'length' },
        { symbol: 'φ', labelKey: 'flightPathAngle', value: (t.flightPathAngle * 180) / Math.PI, quantity: 'angle' },
      ],
      outputs: [
        { symbol: 'v', labelKey: 'burnoutSpeed', value: t.burnoutSpeedMs, quantity: 'speed' },
        { symbol: 'h', labelKey: 'apogee', value: t.apogeeM, quantity: 'length' },
        { symbol: 't', labelKey: 'flightTime', value: t.flightTimeS / 3600, quantity: 'time' },
      ],
      sources: ['bmw1971'],
      where: 'Bate, Mueller & White (1971) §6.2',
      uncertainty: '±5%',
    },
  };
}

/**
 * How far a weapon reaches on a given shape of path.
 *
 * The published range is taken as the furthest the missile can throw its warheads, which is
 * the minimum-energy path. A steeper or flatter path needs more speed for the same distance,
 * so with the same speed at burnout it comes down sooner: this finds that distance.
 * Cruise missiles fly their published range whatever the setting. A glider reaches as far
 * as its glide model takes it from its published speed before it slows below Mach 5, and at
 * least its published range (sources often give only a lower bound, "more than").
 */
export function reachM(category: string, publishedRangeM: number, shape: TrajectoryShape = 'minimumEnergy', vehicle?: FlightVehicle): number {
  if (!(publishedRangeM > 0)) return 0;
  if (flightKind(category) === 'glide') {
    return Math.max(publishedRangeM, glideReachM(glideStartSpeedMs({ ...vehicle, publishedRangeM }, publishedRangeM)));
  }
  if (flightKind(category) === 'cruise' || shape === 'minimumEnergy') return publishedRangeM;
  const best = ballisticTrajectory(publishedRangeM, 'minimumEnergy');
  if (!best) return publishedRangeM;
  const available = best.burnoutSpeedMs;
  let lo = 0;
  let hi = publishedRangeM;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const t = ballisticTrajectory(mid, shape);
    if (t && t.burnoutSpeedMs <= available) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Position along the flight at a time after launch: linear between the stored points, clamped at both ends. */
export function positionAt(plan: FlightPlan, timeS: number): TrajectoryPoint {
  const points = plan.points;
  if (timeS <= 0) return points[0]!;
  const last = points[points.length - 1]!;
  if (timeS >= last.timeS) return last;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.timeS <= timeS) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const f = (timeS - a.timeS) / (b.timeS - a.timeS);
  return {
    timeS,
    downrangeM: a.downrangeM + f * (b.downrangeM - a.downrangeM),
    altitudeM: a.altitudeM + f * (b.altitudeM - a.altitudeM),
    speedMs: a.speedMs + f * (b.speedMs - a.speedMs),
  };
}

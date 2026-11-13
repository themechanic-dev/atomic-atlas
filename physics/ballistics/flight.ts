// From a weapon category and a distance to a flight plan: how it flies, how high,
// how long, with the explanation behind the numbers.

import type { Explanation } from '../sources';
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
  SUBSONIC_CRUISE_SPEED,
  trajectoryPoints,
  type BallisticTrajectory,
  type TrajectoryPoint,
  type TrajectoryShape,
} from './trajectory';

export type FlightKind = 'ballistic' | 'cruise' | 'glide';

/** What is published about a glider: its speed at the start of the glide, or only its range. */
export interface GlideVehicle {
  /** Published speed at the start of the glide, m/s. */
  startSpeedMs?: number | null;
  /** Published range, metres: sets the start speed when no speed is published. */
  publishedRangeM?: number | null;
}

/**
 * Speed a glider starts its glide at: the published one, or else the one that just reaches
 * its published range (or, failing that too, the target) before it slows below Mach 5.
 */
export function glideStartSpeedMs(vehicle: GlideVehicle | undefined, rangeM: number): number {
  if (vehicle?.startSpeedMs && vehicle.startSpeedMs > 0) return vehicle.startSpeedMs;
  return startSpeedForRangeM(vehicle?.publishedRangeM && vehicle.publishedRangeM > 0 ? vehicle.publishedRangeM : rangeM);
}

/** Height at which a cruise missile is drawn and timed: it follows the ground at tens of metres. */
export const CRUISE_ALTITUDE_M = 100;

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

export function planFlight(category: string, rangeM: number, shape: TrajectoryShape = 'minimumEnergy', vehicle?: GlideVehicle): FlightPlan | null {
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
    const time = cruiseFlightTimeS(rangeM, SUBSONIC_CRUISE_SPEED);
    const count = 64;
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i <= count; i++) {
      points.push({ timeS: (time * i) / count, downrangeM: (rangeM * i) / count, altitudeM: CRUISE_ALTITUDE_M, speedMs: SUBSONIC_CRUISE_SPEED });
    }
    return {
      kind: 'cruise',
      rangeM,
      flightTimeS: time,
      apogeeM: CRUISE_ALTITUDE_M,
      speedMs: SUBSONIC_CRUISE_SPEED,
      ballistic: null,
      glide: null,
      points,
      explanation: {
        id: 'cruise',
        formula: 't = d / v',
        inputs: [
          { symbol: 'd', labelKey: 'groundRange', value: rangeM, quantity: 'length' },
          { symbol: 'v', labelKey: 'cruiseSpeed', value: SUBSONIC_CRUISE_SPEED, quantity: 'speed' },
        ],
        outputs: [{ symbol: 't', labelKey: 'flightTime', value: time / 3600, quantity: 'time' }],
        // Plain distance over speed; the speed is a round figure, not a published value for one missile.
        sources: [],
        where: '',
        uncertainty: '±20%',
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
export function reachM(category: string, publishedRangeM: number, shape: TrajectoryShape = 'minimumEnergy', vehicle?: GlideVehicle): number {
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

// Flight of a hypersonic boost-glide vehicle: a rocket lifts it to the upper air and lets it
// go fast and level; from there it flies on its own lift, slowed all the way by the air,
// and dives on its target at the end.
//
// Source: C. L. Tracy and D. Wright, "Modeling the Performance of Hypersonic Boost-Glide
// Missiles", Science & Global Security 28 (2020) 135-170.
//   - equation (7): in level glide, lift plus the outward pull of flying round the Earth
//     carry the weight, (L/D) ρ v² / (2β) + v²/r = g, which gives the density, and so the
//     height, at which the glider flies at each speed
//   - equation (1) with a level path: drag slows it, dv/dt = −ρ v² / (2β)
//   - the glider figures, from published analyses of the HTV-2 test glider: lift-to-drag
//     ratio L/D = 2.6 and ballistic coefficient β = m / (C_d A) = 13,000 kg/m²
// Put together, the slowing is dv/dt = −(g − v²/r) / (L/D), which integrates in closed form
// to the classic glide range of Eggers, Allen & Neice (NACA Report 1382, 1958):
//   d = (L/D) r / 2 · ln((1 − v₁²/(g r)) / (1 − v₀²/(g r)))
//   t = (L/D) √(r/g) · (artanh(v₀/√(g r)) − artanh(v₁/√(g r)))
// Checks against the source: from 6 km/s the speed is halved after about 6,000 km of glide
// (Fig. 3), the glider flies at 49.7 km at 6 km/s, and from 6.1 km/s it reaches about
// 7,500 km (Acton 2015, quoted by the source).
//
// Simplifications:
//   - the glide begins over the launch point: the boost, the climb and the pull-up into
//     level flight are not timed, as the powered climb of a ballistic missile is not
//   - a straight path along the great circle, no turns, on a round Earth that does not turn
//   - the dive at the end is drawn as a straight line at the speed the glide ended with;
//     as in the source's example (Fig. 7c) it covers about five times its height in
//     distance. The climb at the start is drawn the same way. Both are drawing aids.
//   - the vehicle figures of the HTV-2 are used for every glider: no other set is public.

import { heightForDensity, standardAtmosphere } from './atmosphere';
import { EARTH_RADIUS, MU_EARTH, type TrajectoryPoint } from './trajectory';

/** Lift-to-drag ratio of the HTV-2 test glider (Tracy & Wright 2020, after Acton 2015). */
export const GLIDE_LIFT_TO_DRAG = 2.6;
/** Ballistic coefficient m / (C_d A) of the HTV-2 test glider, kg/m² (Tracy & Wright 2020). */
export const GLIDE_BALLISTIC_COEFFICIENT = 13_000;
/** Gravity at the surface, m/s², consistent with the ballistic model. */
const G = MU_EARTH / EARTH_RADIUS ** 2;
/** Speed of a circular orbit at the surface, √(g r), m/s: no glider reaches it. */
export const CIRCULAR_SPEED = Math.sqrt(G * EARTH_RADIUS);
/** Hypersonic flight is flight at Mach 5 and above: the glide is counted down to there. */
export const HYPERSONIC_MACH = 5;
/** Ground distance of the drawn dive against the height it starts from (Fig. 7c of the source). */
export const DIVE_DISTANCE_PER_HEIGHT = 5;
/** Ground distance of the drawn climb against the height the glide starts at. */
const CLIMB_DISTANCE_PER_HEIGHT = 2;

const K = GLIDE_LIFT_TO_DRAG;
const clampSpeed = (v: number): number => Math.min(Math.max(v, 0), 0.999 * CIRCULAR_SPEED);
const share = (v: number): number => 1 - (clampSpeed(v) / CIRCULAR_SPEED) ** 2;

/** Air density at which the glider flies level at a speed, kg/m³ (equation 7 of the source). */
export function equilibriumDensity(speedMs: number): number {
  const v = Math.max(clampSpeed(speedMs), 1);
  return (2 * GLIDE_BALLISTIC_COEFFICIENT * (G - (v * v) / EARTH_RADIUS)) / (K * v * v);
}

/** Height at which the glider flies level at a speed, metres. */
export function glideHeightM(speedMs: number): number {
  return heightForDensity(equilibriumDensity(speedMs));
}

let endSpeed: number | null = null;
/**
 * Speed at which the glide stops being hypersonic: Mach 5 in the air at the height the
 * glider flies at that speed (about 1.5 km/s, at about 24 km). Found by a few rounds of
 * substitution, which settle quickly.
 */
export function glideEndSpeedMs(): number {
  if (endSpeed !== null) return endSpeed;
  let v = 1500;
  for (let i = 0; i < 30; i++) v = HYPERSONIC_MACH * standardAtmosphere(glideHeightM(v)).soundSpeedMs;
  endSpeed = v;
  return v;
}

/** Ground distance covered while the glider slows from one speed to another, metres. */
export function glideRangeM(fromSpeedMs: number, toSpeedMs: number): number {
  if (!(toSpeedMs < fromSpeedMs)) return 0;
  return ((K * EARTH_RADIUS) / 2) * Math.log(share(toSpeedMs) / share(fromSpeedMs));
}

/** Time taken to slow from one speed to another, seconds. */
export function glideTimeS(fromSpeedMs: number, toSpeedMs: number): number {
  if (!(toSpeedMs < fromSpeedMs)) return 0;
  const root = Math.sqrt(EARTH_RADIUS / G);
  return K * root * (Math.atanh(clampSpeed(fromSpeedMs) / CIRCULAR_SPEED) - Math.atanh(clampSpeed(toSpeedMs) / CIRCULAR_SPEED));
}

/** Speed left after gliding a distance, m/s; 0 when the glider cannot get that far. */
export function speedAfterM(startSpeedMs: number, distanceM: number): number {
  const left = 1 - share(startSpeedMs) * Math.exp((2 * Math.max(0, distanceM)) / (K * EARTH_RADIUS));
  return left > 0 ? CIRCULAR_SPEED * Math.sqrt(left) : 0;
}

/** Speed at the start of the glide that reaches a distance while still hypersonic, m/s. */
export function startSpeedForRangeM(rangeM: number): number {
  const v = CIRCULAR_SPEED * Math.sqrt(1 - share(glideEndSpeedMs()) * Math.exp((-2 * Math.max(0, rangeM)) / (K * EARTH_RADIUS)));
  return clampSpeed(v);
}

/** How far a glider starting at a speed flies before it slows below Mach 5, metres. */
export function glideReachM(startSpeedMs: number): number {
  return glideRangeM(startSpeedMs, glideEndSpeedMs());
}

export interface GlideTrajectory {
  rangeM: number;
  /** Speed at the start of the glide, m/s. */
  startSpeedMs: number;
  /** Height the glide starts at, metres. */
  startHeightM: number;
  /** Ground distance over which the climb to the glide height is drawn, metres. */
  climbM: number;
  /** Speed when the dive on the target begins, m/s. */
  diveSpeedMs: number;
  /** Height the dive begins from, metres. */
  diveHeightM: number;
  /** Ground distance from the launch point to the start of the dive, metres. */
  diveStartM: number;
  /** Time from the start of the glide to the impact, seconds. */
  flightTimeS: number;
}

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * The glide to a target at a ground distance, starting at a speed. Returns null when the
 * glider would slow below Mach 5 before it gets there.
 */
export function glideTrajectory(rangeM: number, startSpeedMs: number): GlideTrajectory | null {
  const v0 = clampSpeed(startSpeedMs);
  if (!(rangeM > 0) || !(v0 > 0)) return null;
  if (rangeM > glideReachM(v0) * (1 + 1e-9)) return null;
  const startHeightM = glideHeightM(v0);
  // The dive starts where the glider, still flying level, is five of its heights from the
  // target. Its height there depends on its speed there, so the point is found by a few
  // rounds of substitution; on a short flight climb and dive share out the distance.
  let dive = DIVE_DISTANCE_PER_HEIGHT * glideHeightM(speedAfterM(v0, rangeM));
  const climb = CLIMB_DISTANCE_PER_HEIGHT * startHeightM;
  for (let i = 0; i < 8; i++) {
    const at = Math.max(0, rangeM - dive);
    dive = DIVE_DISTANCE_PER_HEIGHT * glideHeightM(speedAfterM(v0, at));
  }
  const fit = Math.min(1, rangeM / (dive + climb));
  dive *= fit;
  const diveStartM = rangeM - dive;
  const diveSpeedMs = speedAfterM(v0, diveStartM);
  // The climb always ends before the dive begins, so the dive starts from the full glide height.
  const diveHeightM = glideHeightM(diveSpeedMs);
  const diveTime = Math.hypot(dive, diveHeightM) / Math.max(diveSpeedMs, 1);
  return {
    rangeM,
    startSpeedMs: v0,
    startHeightM,
    climbM: Math.min(climb * fit, diveStartM),
    diveSpeedMs,
    diveHeightM,
    diveStartM,
    flightTimeS: glideTimeS(v0, diveSpeedMs) + diveTime,
  };
}

/** Points along the glide, evenly spaced over the ground, with their times and heights. */
export function glidePoints(g: GlideTrajectory, count = 120): TrajectoryPoint[] {
  const climb = g.climbM;
  const dive = g.rangeM - g.diveStartM;
  const glideTime = glideTimeS(g.startSpeedMs, g.diveSpeedMs);
  const distances = new Set<number>();
  for (let i = 0; i <= count; i++) distances.add((g.rangeM * i) / count);
  // The corners of the drawn path, so the line keeps them exactly.
  distances.add(climb);
  distances.add(g.diveStartM);
  const points: TrajectoryPoint[] = [];
  for (const d of [...distances].sort((a, b) => a - b)) {
    if (d <= g.diveStartM) {
      const v = speedAfterM(g.startSpeedMs, d);
      const rise = climb > 0 ? smooth(d / climb) : 1;
      points.push({ timeS: glideTimeS(g.startSpeedMs, v), downrangeM: d, altitudeM: glideHeightM(v) * rise, speedMs: v });
    } else {
      const f = dive > 0 ? (d - g.diveStartM) / dive : 1;
      points.push({
        timeS: glideTime + (f * Math.hypot(dive, g.diveHeightM)) / Math.max(g.diveSpeedMs, 1),
        downrangeM: d,
        altitudeM: g.diveHeightM * (1 - f),
        speedMs: g.diveSpeedMs,
      });
    }
  }
  return points;
}

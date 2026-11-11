// Free flight of a ballistic missile: range, speed, height and time.
//
// Source: Bate, Mueller & White, "Fundamentals of Astrodynamics" (1971),
// chapter 6, "Ballistic Missile Trajectories". After its engines stop, a
// missile coasts on an ellipse around the centre of the Earth, like a
// satellite whose orbit happens to meet the ground. Everything here follows
// from that ellipse.
//
// Simplifications, the same the textbook makes for its range equations:
//   - a round Earth that does not turn (rotation shifts ranges by a few percent)
//   - burnout and re-entry at the surface: the powered climb and the passage
//     back through the air are not modelled, so the free-flight range is taken
//     equal to the ground range
//   - no air drag on the way down
//
// Symbols follow the book: Q = v^2 r / mu (1 would be a circular orbit, 2 escape),
// Psi the angle the flight covers as seen from the Earth's centre, phi the
// flight-path angle above the horizon at burnout.

/** Gravitational parameter of the Earth, m^3/s^2. */
export const MU_EARTH = 3.986004418e14;
/** Mean radius of the Earth, m. */
export const EARTH_RADIUS = 6371008.8;

export type TrajectoryShape = 'minimumEnergy' | 'lofted' | 'depressed';

export interface BallisticTrajectory {
  /** Ground range, metres. */
  rangeM: number;
  /** Angle of the flight seen from the Earth's centre, radians. */
  rangeAngle: number;
  /** Speed at burnout (and again at re-entry), m/s. */
  burnoutSpeedMs: number;
  /** Flight-path angle above the horizon at burnout, radians. */
  flightPathAngle: number;
  /** Highest point above the surface, metres. */
  apogeeM: number;
  /** Time of free flight, seconds. */
  flightTimeS: number;
  /** Q of the book: v^2 r / mu. */
  q: number;
  /** Semi-major axis (m) and eccentricity of the ellipse. */
  semiMajorAxisM: number;
  eccentricity: number;
}

const HALF_WORLD = Math.PI * EARTH_RADIUS;

/** Flight-path angle of the minimum-energy trajectory: (pi - Psi) / 4.. */
export function minimumEnergyAngle(rangeAngle: number): number {
  return (Math.PI - rangeAngle) / 4;
}

/**
 * The free-flight ellipse for a ground range and a flight-path angle at burnout.
 * Free-flight range equation (section 6.2): sin(2 phi + Psi/2) = ((2 - Q) / Q) sin(Psi/2).
 * Returns null when no trajectory with that angle reaches that range.
 */
export function trajectoryFor(rangeM: number, flightPathAngle: number): BallisticTrajectory | null {
  if (!(rangeM > 0) || rangeM >= HALF_WORLD * 2) return null;
  const psi = rangeM / EARTH_RADIUS;
  const half = psi / 2;
  const s = Math.sin(2 * flightPathAngle + half);
  if (!(flightPathAngle > 0) || !(s > 0)) return null;

  const q = (2 * Math.sin(half)) / (s + Math.sin(half));
  if (!(q > 0) || q >= 2) return null;
  const r = EARTH_RADIUS;
  const a = r / (2 - q);
  const e = Math.sqrt(Math.max(0, 1 + q * (q - 2) * Math.cos(flightPathAngle) ** 2));
  const speed = Math.sqrt((q * MU_EARTH) / r);
  const apogee = a * (1 + e) - r;

  // Time of free flight (section 6.2): the eccentric anomaly at burnout, measured from perigee.
  const cosE1 = (e - Math.cos(half)) / (1 - e * Math.cos(half));
  const E1 = Math.acos(Math.max(-1, Math.min(1, cosE1)));
  const flightTime = 2 * Math.sqrt(a ** 3 / MU_EARTH) * (Math.PI - E1 + e * Math.sin(E1));

  return {
    rangeM,
    rangeAngle: psi,
    burnoutSpeedMs: speed,
    flightPathAngle,
    apogeeM: apogee,
    flightTimeS: flightTime,
    q,
    semiMajorAxisM: a,
    eccentricity: e,
  };
}

/**
 * The trajectory a missile would fly to a given range.
 *   minimumEnergy  the least burnout speed that reaches the range
 *   lofted         steeper: higher and slower to arrive (here 1.5 times the minimum-energy angle)
 *   depressed      flatter: lower and quicker (here 0.5 times the minimum-energy angle)
 * Lofted and depressed flights need more speed than the minimum-energy one for the same range.
 */
export function ballisticTrajectory(rangeM: number, shape: TrajectoryShape = 'minimumEnergy'): BallisticTrajectory | null {
  const psi = rangeM / EARTH_RADIUS;
  const optimum = minimumEnergyAngle(psi);
  const factor = shape === 'lofted' ? 1.5 : shape === 'depressed' ? 0.5 : 1;
  return trajectoryFor(rangeM, optimum * factor);
}

/**
 * The greatest range a burnout speed can reach, metres: sin(Psi/2) = Q / (2 - Q) (section 6.2).
 * Returns half the circumference when the speed is enough to reach anywhere.
 */
export function maximumRangeM(burnoutSpeedMs: number): number {
  const q = (burnoutSpeedMs ** 2 * EARTH_RADIUS) / MU_EARTH;
  if (q >= 1) return HALF_WORLD;
  return 2 * Math.asin(q / (2 - q)) * EARTH_RADIUS;
}

export interface TrajectoryPoint {
  /** Seconds since burnout. */
  timeS: number;
  /** Distance travelled along the ground track, metres. */
  downrangeM: number;
  /** Height above the surface, metres. */
  altitudeM: number;
  /** Speed, m/s. */
  speedMs: number;
}

/** Points along the flight, evenly spaced along the ground track, with their times (Kepler's equation). */
export function trajectoryPoints(t: BallisticTrajectory, count = 96): TrajectoryPoint[] {
  const { semiMajorAxisM: a, eccentricity: e, rangeAngle: psi } = t;
  const n = Math.sqrt(MU_EARTH / a ** 3);
  const p = a * (1 - e * e);
  // True anomaly runs from (pi - Psi/2) at burnout through pi at apogee to (pi + Psi/2).
  const meanAnomaly = (trueAnomaly: number): number => {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2));
    const positive = E < 0 ? E + 2 * Math.PI : E;
    return positive - e * Math.sin(positive);
  };
  const start = Math.PI - psi / 2;
  const m0 = meanAnomaly(start);
  const points: TrajectoryPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const s = (psi * i) / count;
    const nu = start + s;
    const r = e < 1e-12 ? a : p / (1 + e * Math.cos(nu));
    const speed = Math.sqrt(MU_EARTH * (2 / r - 1 / a));
    points.push({
      timeS: (meanAnomaly(nu) - m0) / n,
      downrangeM: s * EARTH_RADIUS,
      altitudeM: Math.max(0, r - EARTH_RADIUS),
      speedMs: speed,
    });
  }
  return points;
}

/** A missile or aircraft that flies level through the air: time is distance over speed. */
export function cruiseFlightTimeS(rangeM: number, speedMs: number): number {
  return speedMs > 0 ? rangeM / speedMs : Infinity;
}

/**
 * Typical cruise speed of a subsonic cruise missile, m/s (about Mach 0.7 near the ground).
 * A round figure for flight-time estimates; individual missiles differ.
 */
export const SUBSONIC_CRUISE_SPEED = 240;

// A Gaussian plume: how a release of gas or fine particles thins out downwind.
// This is the model of the HotSpot health physics codes, written from their published
// description.
//
// Source: S. G. Homann and F. Aluzzi, HotSpot Health Physics Codes Version 3.0 User's Guide,
// Lawrence Livermore National Laboratory (2013), chapter 7 "HotSpot Algorithms":
// the Gaussian equation, the standard-terrain (Briggs) dispersion coefficients, the change of
// wind speed with height, the sample-time rule and the source-depletion factor.
// Checked against the worked examples of chapter 4 of the same guide.

export type StabilityClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const STABILITY_CLASSES: readonly StabilityClass[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Height at which the weather service measures the wind, metres. */
const REFERENCE_HEIGHT_M = 10;
/** Height of a person's nose and mouth above the ground, metres (the guide's receptor height). */
export const RECEPTOR_HEIGHT_M = 1.5;

/** Crosswind spread of the plume at a distance, metres: standard (open country) terrain, 10-minute average. */
export function sigmaY(stability: StabilityClass, distanceM: number): number {
  const x = Math.max(distanceM, 0);
  const a = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 }[stability];
  return (a * x) / Math.sqrt(1 + 0.0001 * x);
}

/** Vertical spread of the plume at a distance, metres: standard (open country) terrain. */
export function sigmaZ(stability: StabilityClass, distanceM: number): number {
  const x = Math.max(distanceM, 0);
  switch (stability) {
    case 'A':
      return 0.2 * x;
    case 'B':
      return 0.12 * x;
    case 'C':
      return (0.08 * x) / Math.sqrt(1 + 0.0002 * x);
    case 'D':
      return (0.06 * x) / Math.sqrt(1 + 0.0015 * x);
    case 'E':
      return (0.03 * x) / (1 + 0.0003 * x);
    case 'F':
      return (0.016 * x) / (1 + 0.0003 * x);
  }
}

/** Exponent of the change of wind speed with height (standard terrain; Irwin 1979, as tabulated in the guide). */
const WIND_EXPONENT: Record<StabilityClass, number> = { A: 0.07, B: 0.07, C: 0.1, D: 0.15, E: 0.35, F: 0.55 };

/** Wind speed at the height of the release, from the speed at 10 m. Heights below 2 m count as 2 m. */
export function windAtHeight(wind10Ms: number, heightM: number, stability: StabilityClass): number {
  return wind10Ms * Math.pow(Math.max(heightM, 2) / REFERENCE_HEIGHT_M, WIND_EXPONENT[stability]);
}

/** Factor on the crosswind spread for a release that lasts longer than ten minutes: (t / 10 min)^0.2. */
export function sampleTimeFactor(durationMin: number): number {
  return Math.pow(Math.max(durationMin, 10) / 10, 0.2);
}

export interface PlumeConditions {
  stability: StabilityClass;
  /** Wind speed at 10 m, m/s. */
  wind10Ms: number;
  /** Height at which the material ends up in the air, metres. */
  releaseHeightM: number;
  /** How long the release lasts, minutes. */
  durationMin: number;
}

/**
 * Time-integrated concentration in the air per unit of activity released, s/m3, at a point
 * `downwindM` along the wind and `crosswindM` to the side, at the height people breathe.
 * Multiply by the activity released (Bq) for Bq.s/m3. No deposition or decay here.
 */
export function dilution(conditions: PlumeConditions, downwindM: number, crosswindM = 0, receptorHeightM = RECEPTOR_HEIGHT_M): number {
  if (!(downwindM > 0)) return 0;
  const { stability, releaseHeightM: h } = conditions;
  const u = windAtHeight(conditions.wind10Ms, h, stability);
  if (!(u > 0)) return 0;
  const sy = sigmaY(stability, downwindM) * sampleTimeFactor(conditions.durationMin);
  const sz = sigmaZ(stability, downwindM);
  if (!(sy > 0) || !(sz > 0)) return 0;
  const side = Math.exp(-0.5 * (crosswindM / sy) ** 2);
  const up = Math.exp(-0.5 * ((receptorHeightM - h) / sz) ** 2) + Math.exp(-0.5 * ((receptorHeightM + h) / sz) ** 2);
  return (side * up) / (2 * Math.PI * sy * sz * u);
}

/**
 * Share of the plume still in the air at a distance, after what has settled on the ground
 * on the way (source depletion): DF = exp(-(v/u) sqrt(2/pi) integral of exp(-H^2 / 2 sz^2) / sz dx).
 */
export function depletionFactor(conditions: PlumeConditions, depositionVelocityMs: number, downwindM: number): number {
  if (!(depositionVelocityMs > 0) || !(downwindM > 0)) return 1;
  const { stability, releaseHeightM: h } = conditions;
  const u = windAtHeight(conditions.wind10Ms, h, stability);
  // The integrand changes over many orders of distance: equal steps in the logarithm.
  const start = 1;
  const steps = 160;
  let integral = 0;
  const f = (x: number): number => {
    const sz = sigmaZ(stability, x);
    return Math.exp(-0.5 * (h / sz) ** 2) / sz;
  };
  if (downwindM <= start) return 1;
  for (let i = 0; i < steps; i++) {
    const a = start * Math.pow(downwindM / start, i / steps);
    const b = start * Math.pow(downwindM / start, (i + 1) / steps);
    integral += (b - a) * f(Math.sqrt(a * b));
  }
  return Math.exp(-(depositionVelocityMs / u) * Math.sqrt(2 / Math.PI) * integral);
}

/** Time for the plume to reach a distance, seconds. */
export function plumeArrivalS(conditions: PlumeConditions, downwindM: number): number {
  const u = windAtHeight(conditions.wind10Ms, conditions.releaseHeightM, conditions.stability);
  return u > 0 ? downwindM / u : Infinity;
}

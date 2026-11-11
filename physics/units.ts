// Unit conversions used by the physics modules.
// Internally everything is SI (metres, seconds, pascals) plus kilotons for yield.
// The published models are written in feet, miles, yards and psi, so each module
// converts at its edge and says so.

export const FT = 0.3048; // metres per foot
export const KFT = 304.8; // metres per kilofoot
export const YD = 0.9144; // metres per yard
export const MILE = 1609.344; // metres per statute mile
export const KM = 1000;

export const PSI = 6894.757; // pascals per psi
export const ATM_PSI = 14.696; // standard sea-level pressure, psi
export const MPH = 0.44704; // m/s per mile per hour
export const KMH = 1 / 3.6; // m/s per km/h

/** Speed of sound in standard sea-level air (15 °C), m/s. */
export const SOUND_SPEED = 340.29;

export const ftToM = (ft: number): number => ft * FT;
export const mToFt = (m: number): number => m / FT;
export const mToKft = (m: number): number => m / KFT;
export const kftToM = (kft: number): number => kft * KFT;
export const mToMi = (m: number): number => m / MILE;
export const miToM = (mi: number): number => mi * MILE;
export const mToYd = (m: number): number => m / YD;
export const ydToM = (yd: number): number => yd * YD;
export const psiToPa = (psi: number): number => psi * PSI;
export const paToPsi = (pa: number): number => pa / PSI;

/** Linear interpolation over sorted x values; clamps outside the table. */
export function interp(x: number, xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo]!;
  const x1 = xs[hi]!;
  const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  return ys[lo]! + t * (ys[hi]! - ys[lo]!);
}

/** Like interp, but continues the end segments instead of clamping. */
export function interpExtrapolate(x: number, xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return ys[0] ?? NaN;
  if (x < xs[0]!) {
    const slope = (ys[1]! - ys[0]!) / (xs[1]! - xs[0]!);
    return ys[0]! + slope * (x - xs[0]!);
  }
  if (x > xs[n - 1]!) {
    const slope = (ys[n - 1]! - ys[n - 2]!) / (xs[n - 1]! - xs[n - 2]!);
    return ys[n - 1]! + slope * (x - xs[n - 1]!);
  }
  return interp(x, xs, ys);
}

/**
 * Finds x in [lo, hi] where f(x) = target for a function that is monotonic on the interval.
 * Returns NaN when the target is not bracketed.
 */
export function bisect(f: (x: number) => number, target: number, lo: number, hi: number, iterations = 60): number {
  let flo = f(lo) - target;
  const fhi = f(hi) - target;
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return NaN;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo > 0 === fhi > 0) return NaN;
  for (let i = 0; i < iterations; i++) {
    const mid = 0.5 * (lo + hi);
    const fmid = f(mid) - target;
    if (fmid === 0) return mid;
    if (fmid > 0 === flo > 0) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) * Math.SQRT1_2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Gamma function for positive arguments (Lanczos approximation, g = 7). */
export function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const xm = x - 1;
  let a = c[0]!;
  const t = xm + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (xm + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, xm + 0.5) * Math.exp(-t) * a;
}

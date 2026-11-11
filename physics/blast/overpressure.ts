// Peak static overpressure on the ground from an air or surface burst.
//
// Model: H. L. Brode's analytic approximation (1986) of the height-of-burst
// curves, the same data that Glasstone & Dolan plot in Figs. 3.73a-c for a
// 1 kt burst over a nearly ideal surface at sea level. Other yields follow by
// cube-root scaling (Glasstone & Dolan §3.61-3.63).
//
// Stated accuracy of the fit: about 10 % in pressure. Tests in
// overpressure.test.ts reproduce the worked examples printed next to
// Figs. 3.73a, 3.73b and 3.73c.

import { bisect, kftToM, mToKft } from '../units';

/** Smallest scaled ground range the fit is evaluated at (kilofeet per kt^1/3). */
const MIN_SCALED_RANGE_KFT = 1e-4;

/**
 * Brode (1986) peak overpressure for a 1 kt burst.
 * @param z   height of burst divided by ground range (dimensionless)
 * @param r   scaled slant range, kilofeet / kt^(1/3)
 * @param y   scaled height of burst, kilofeet / kt^(1/3)
 * @returns   peak overpressure, psi
 */
function brode1kt(z: number, r: number, y: number): number {
  const z2 = z * z;
  const z5 = z ** 5;
  const z18 = z ** 18;

  // For very large z (directly below the burst) the ratios tend to finite limits;
  // dividing numerator and denominator keeps them finite in floating point.
  const ratio = (num: number, den: number): number => (Number.isFinite(num) && Number.isFinite(den) ? num / den : NaN);

  const a = 1.22 - ratio(3.908 * z2, 1 + 810.2 * z5);
  const b =
    2.321 +
    ratio(6.195 * z18, 1 + 1.113 * z18) -
    ratio(0.03831 * z ** 17, 1 + 0.02415 * z ** 17) +
    0.6692 / (1 + 4164 * z ** 8);
  const c = 4.153 - ratio(1.149 * z18, 1 + 1.641 * z18) - 1.1 / (1 + 2.771 * z ** 2.5);
  const d = -4.166 + ratio(25.76 * z ** 1.75, 1 + 1.382 * z18) + ratio(8.257 * z, 1 + 3.219 * z);
  const e = 1 - ratio(0.004642 * z18, 1 + 0.003886 * z18);
  const f = 0.6096 + ratio(2.879 * z ** 9.25, 1 + 2.359 * z ** 14.5) - ratio(17.5 * z2, 1 + 71.66 * z ** 3);
  const g = 1.83 + ratio(5.361 * z2, 1 + 0.3139 * z ** 6);
  const h =
    ratio(8.808 * z ** 1.5, 1 + 154.5 * z ** 3.5) -
    ratio(0.2905 + 64.67 * z5, 1 + 441.5 * z5) -
    ratio(1.389 * z, 1 + 49.03 * z5) +
    (1.094 * r * r) / ((781.2 - 123.4 * r + 37.98 * r ** 1.5 + r * r) * (1 + 2 * y));
  const y4 = y ** 4;
  const j = y === 0 ? 0 : (0.000629 * y4) / (3.493e-9 + y4) - (2.67 * y * y) / (1 + 1e7 * y ** 4.3);
  const k = y === 0 ? 5.18 : 5.18 + (0.2803 * y ** 3.5) / (3.788e-6 + y4);

  return 10.47 / r ** a + b / r ** c + (d * e) / (1 + f * r ** g) + h + j / r ** k;
}

/**
 * Peak overpressure on the ground.
 * @param yieldKt       total yield, kilotons
 * @param groundRangeM  distance from ground zero, metres
 * @param burstHeightM  height of burst, metres (0 = surface burst)
 * @returns peak static overpressure in psi
 */
export function peakOverpressurePsi(yieldKt: number, groundRangeM: number, burstHeightM: number): number {
  if (!(yieldKt > 0)) return 0;
  const scale = Math.cbrt(yieldKt);
  // The z^18 terms of the fit overflow far above z ~ 1e15; z is capped well below that,
  // which only affects points within centimetres of ground zero.
  const x = Math.max(mToKft(Math.max(groundRangeM, 0)) / scale, MIN_SCALED_RANGE_KFT);
  const y = mToKft(Math.max(burstHeightM, 0)) / scale;
  const z = Math.min(y / x, 1e6);
  const r = Math.hypot(x, y);
  const p = brode1kt(z, r, y);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/**
 * Largest ground range at which the peak overpressure is at least `psi`.
 * Returns 0 when that pressure is not reached anywhere on the ground.
 */
export function overpressureRadiusM(yieldKt: number, psi: number, burstHeightM: number): number {
  if (!(yieldKt > 0) || !(psi > 0)) return 0;
  const p = (rangeM: number): number => peakOverpressurePsi(yieldKt, rangeM, burstHeightM);
  const scale = Math.cbrt(yieldKt);

  // Walk inwards from far away until the pressure is reached, then refine.
  // Far limit: 60 kilofeet per kt^(1/3) is below 0.1 psi for any height of burst.
  let outer = kftToM(60) * scale;
  if (p(outer) >= psi) return outer;
  const inner = kftToM(MIN_SCALED_RANGE_KFT) * scale;
  const step = 0.97;
  let r = outer * step;
  while (r > inner) {
    if (p(r) >= psi) return bisect(p, psi, r, outer);
    outer = r;
    r *= step;
  }
  return p(inner) >= psi ? bisect(p, psi, inner, outer) : 0;
}

/**
 * Height of burst that pushes a given overpressure out to the greatest ground range
 * (the "knee" of the height-of-burst curve), found numerically.
 */
export function optimumBurstHeightM(yieldKt: number, psi: number): { heightM: number; radiusM: number } {
  const scale = Math.cbrt(yieldKt);
  const radiusAt = (hM: number): number => overpressureRadiusM(yieldKt, psi, hM);

  // Coarse scan over scaled heights, then golden-section refinement around the best one.
  const maxH = kftToM(8) * scale;
  let bestH = 0;
  let bestR = radiusAt(0);
  const steps = 80;
  for (let i = 1; i <= steps; i++) {
    const h = (maxH * i) / steps;
    const r = radiusAt(h);
    if (r > bestR) {
      bestR = r;
      bestH = h;
    }
  }
  let lo = Math.max(0, bestH - maxH / steps);
  let hi = Math.min(maxH, bestH + maxH / steps);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let rc = radiusAt(c);
  let rd = radiusAt(d);
  for (let i = 0; i < 40; i++) {
    if (rc > rd) {
      hi = d;
      d = c;
      rd = rc;
      c = hi - phi * (hi - lo);
      rc = radiusAt(c);
    } else {
      lo = c;
      c = d;
      rc = rd;
      d = lo + phi * (hi - lo);
      rd = radiusAt(d);
    }
  }
  const heightM = 0.5 * (lo + hi);
  return { heightM, radiusM: radiusAt(heightM) };
}

// Early (local) fallout from a surface burst: the WSEG-10 model.
//
// Source: D. W. Hanifen, "Documentation and Analysis of the WSEG-10 Fallout
// Prediction Model", AFIT thesis, 1980, equations (1)-(27) and the Fortran
// listing in its Appendix. WSEG-10 dates from 1959 and was the standard
// analytical fallout model for damage assessment for two decades.
//
// It predicts a smooth "mean case": an elongated pattern along the effective
// wind, exponential downwind and Gaussian crosswind, widened by wind shear.
// Real fallout is patchier (rain, terrain, changing winds); the thesis notes
// that the model loses activity below about 0.1 Mt.
//
// The model is written in megatons, statute miles, kilofeet, mph and hours.
// Those units are kept inside this file; the public functions take SI.

import { gamma, MILE, MPH, normalCdf } from '../units';

/** Source normalisation: 2e6 R/h at H+1 hour for 1 Mt of fission spread over 1 square mile (eq. 22). */
const SNC = 2e6;

const MI_PER_M = 1 / MILE;
const MPH_PER_MS = 1 / MPH;
/** (m/s per km) -> (mph per kilofoot) */
const SHEAR_UNIT = MPH_PER_MS * 0.3048;

export interface FalloutInput {
  /** Total yield, kilotons. */
  yieldKt: number;
  /** Fraction of the yield from fission, 0..1. Dose rates are proportional to it. */
  fissionFraction: number;
  /** Effective fallout wind speed, m/s. */
  windSpeedMs: number;
  /** Crosswind component of the wind shear across the cloud, (m/s) per km of height. */
  shearMsPerKm?: number;
  /**
   * Fraction of the fallout that comes down locally, 0..1. 1 for a contact surface burst;
   * smaller for bursts whose fireball barely touches the ground.
   */
  localFraction?: number;
}

export interface FalloutModel {
  input: Required<FalloutInput>;
  /** Height of the centre of the stabilised cloud, metres (eq. 1). */
  cloudCentreHeightM: number;
  /** Radius of the stabilised cloud, metres: 2 sigma_0 (the cloud diameter is 4 sigma_0). */
  cloudRadiusM: number;
  /** Time constant of fallout arrival, hours (eq. 8). */
  timeConstantH: number;
  /**
   * Dose rate at H+1 hour, R/h, at a point in wind coordinates:
   * x metres downwind of ground zero (negative = upwind), y metres crosswind.
   * As in WSEG-10 this is the "unit-time reference dose rate": all the fallout that
   * will arrive at the point, decayed back to one hour after the burst.
   */
  doseRateH1(xM: number, yM: number): number;
  /** Mean time of arrival of the fallout at a downwind distance, hours after the burst (eq. 26). */
  arrivalTimeH(xM: number): number;
  /** Half-width (metres) of the contour of a given H+1 dose rate at downwind distance x; 0 outside the contour. */
  contourHalfWidthM(xM: number, doseRate: number): number;
  /** Extent of a contour along the wind axis, metres: [upwind end (<= 0), downwind end]. null when not reached. */
  contourExtentM(doseRate: number): [number, number] | null;
  /**
   * Half-width of the cloud's path at a distance downwind, metres: two crosswind standard
   * deviations, σ_y of eq. (22), which starts from the stabilised cloud and widens with the
   * wind shear. Geometry only: the same whether or not any fallout comes down locally.
   */
  cloudPathHalfWidthM(xM: number): number;
}

export function wseg10(input: FalloutInput): FalloutModel {
  const full: Required<FalloutInput> = {
    shearMsPerKm: 0,
    localFraction: 1,
    ...input,
  };
  const yieldMt = Math.max(full.yieldKt, 1e-6) / 1000;
  const wind = Math.max(full.windSpeedMs, 0) * MPH_PER_MS; // mph
  const shear = Math.abs(full.shearMsPerKm) * SHEAR_UNIT; // mph per kilofoot

  const lnY = Math.log(yieldMt);
  const d = lnY + 2.42;
  const Hc = 44 + 6.1 * lnY - 0.205 * Math.abs(d) * d; // kilofeet (1)
  const sigma0 = Math.exp(0.7 + lnY / 3 - 3.25 / (4.0 + (lnY + 5.4) ** 2)); // miles (3)
  const sigma0Sq = sigma0 * sigma0;
  const sigmaH = 0.18 * Hc; // kilofeet (4)
  const Tc = 1.0573203 * (12 * (Hc / 60) - 2.5 * (Hc / 60) ** 2) * (1 - 0.5 * Math.exp(-((Hc / 25) ** 2))); // hours (8)

  const L0 = wind * Tc; // miles
  const L0Sq = L0 * L0;
  const sigmaXSq = (sigma0Sq * (L0Sq + 8 * sigma0Sq)) / (L0Sq + 2 * sigma0Sq);
  const sigmaX = Math.sqrt(sigmaXSq);
  const LSq = L0Sq + 2 * sigmaXSq;
  const L = Math.sqrt(LSq);
  const n = (L0Sq + sigmaXSq) / (L0Sq + 0.5 * sigmaXSq); // (15): 2 in calm air, 1 in wind
  const gNorm = 1 / (L * gamma(1 + 1 / n));

  const pAlpha = (0.001 * Hc * wind) / sigma0;
  const alpha1 = 1 / (1 + pAlpha); // (21)
  const phiScale = L0 / (L * alpha1 * sigmaX);

  const source = SNC * yieldMt * full.fissionFraction * full.localFraction;

  /** Crosswind standard deviation (miles) at downwind distance x (miles). */
  const sigmaY = (x: number): number => {
    const t10 = x + 2 * sigmaX;
    const growth = Math.min(1 + (8 * Math.abs(t10)) / L, 4);
    const shearTerm =
      (2 * sigmaXSq * Tc * Tc * sigmaH * sigmaH * shear * shear) / LSq +
      ((L0Sq / LSq) * Tc * Tc * sigmaH * sigmaH * shear * shear * t10 * t10) / LSq;
    return Math.sqrt(sigma0Sq * growth + shearTerm);
  };

  /** Adjustment for the area covered before the cloud stabilises (24). */
  const alpha2 = (x: number): number => (wind > 0 ? 1 / (1 + pAlpha * (1 - normalCdf((2 * x) / wind))) : 1);

  /** Dose rate on the wind axis, R/h, x in miles. */
  const axis = (x: number): number => {
    const g = Math.exp(-((Math.abs(x) / L) ** n)) * gNorm; // (18)
    const phi = normalCdf(phiScale * x); // (19)
    return (source * phi * g) / (Math.sqrt(2 * Math.PI) * sigmaY(x));
  };

  const doseRateH1 = (xM: number, yM: number): number => {
    const x = xM * MI_PER_M;
    const y = yM * MI_PER_M;
    const s = alpha2(x) * sigmaY(x);
    return axis(x) * Math.exp(-0.5 * (y / s) ** 2);
  };

  const arrivalTimeH = (xM: number): number => {
    const x = xM * MI_PER_M;
    const t10 = x + 2 * sigmaX;
    const t14 = L0Sq + 0.5 * sigmaXSq;
    return Math.sqrt(0.25 + ((L0Sq / LSq) * t10 * t10 * Tc * Tc + 2 * sigmaXSq) / t14);
  };

  const contourHalfWidthM = (xM: number, doseRate: number): number => {
    const x = xM * MI_PER_M;
    const a = axis(x);
    if (!(a > doseRate) || !(doseRate > 0)) return 0;
    return (alpha2(x) * sigmaY(x) * Math.sqrt(2 * Math.log(a / doseRate))) / MI_PER_M;
  };

  const contourExtentM = (doseRate: number): [number, number] | null => {
    // The axis dose rate peaks a little downwind of ground zero; find the peak, then both ends.
    const span = Math.max(L * 40, sigma0 * 40);
    let peakX = 0;
    let peak = axis(0);
    const steps = 400;
    for (let i = -steps / 10; i <= steps; i++) {
      const x = (span * i) / steps / 4;
      const a = axis(x);
      if (a > peak) {
        peak = a;
        peakX = x;
      }
    }
    if (!(peak > doseRate)) return null;
    const solve = (inside: number, outside: number): number => {
      let lo = inside;
      let hi = outside;
      for (let i = 0; i < 70; i++) {
        const mid = 0.5 * (lo + hi);
        if (axis(mid) > doseRate) lo = mid;
        else hi = mid;
      }
      return 0.5 * (lo + hi);
    };
    return [solve(peakX, peakX - span) / MI_PER_M, solve(peakX, peakX + span) / MI_PER_M];
  };

  return {
    input: full,
    cloudCentreHeightM: Hc * 304.8,
    cloudRadiusM: (2 * sigma0) / MI_PER_M,
    timeConstantH: Tc,
    doseRateH1,
    arrivalTimeH,
    contourHalfWidthM,
    contourExtentM,
    cloudPathHalfWidthM: (xM) => (2 * sigmaY(Math.max(xM, 0) * MI_PER_M)) / MI_PER_M,
  };
}

/**
 * Dose accumulated in the open between two times after the burst, from the H+1 dose rate,
 * with the t^-1.2 decay of mixed fission products. Glasstone & Dolan (1977) eq. (9.150.1):
 *
 *     D = 5 R1 (t_from^-0.2 - t_to^-0.2)        times in hours, R1 in R/h
 *
 * The book gives it for times between 0.5 hour and 5,000 hours (200 days) after the burst.
 */
export function accumulatedDose(doseRateH1: number, fromH: number, toH: number): number {
  const a = Math.max(fromH, 1 / 60);
  const b = Math.max(toH, a);
  return 5 * doseRateH1 * (Math.pow(a, -0.2) - Math.pow(b, -0.2));
}

/** Dose rate at a later time from the H+1 value: R(t) = R1 t^-1.2. Glasstone & Dolan eq. (9.147.1). */
export function doseRateAt(doseRateH1: number, hoursAfterBurst: number): number {
  return doseRateH1 * Math.pow(Math.max(hoursAfterBurst, 1 / 60), -1.2);
}

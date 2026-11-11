// Thermal radiation: radiant exposure on the ground and skin-burn thresholds.
//
// Radiant exposure, Glasstone & Dolan (1977) eq. (7.96.2):
//
//     Q = 10^12 f W tau / (4 pi D^2)        [cal/cm^2, D in cm, W in kt]
//
// f   thermal partition: 0.35 for air bursts below 15,000 ft (Table 7.88),
//     0.18 for a contact surface burst, in between from Table 7.101.
// tau atmospheric transmittance to a target on the ground. Glasstone & Dolan
//     give it only as a chart for 12-mile visibility (Fig. 7.98). Here it is a
//     two-layer atmosphere fitted to that chart: a haze layer near the ground
//     and thin clear air above it. The fit reproduces the contours of
//     Fig. 7.98 within 0.06 in tau, and the slant ranges of Fig. 7.42 within
//     7 % from 1 kt to 1 Mt (up to 24 % too far at 10 Mt, where the two charts
//     of the book disagree with each other).
//
// Skin burns, Fig. 12.65: radiant exposure at which half of an unshielded
// population receives burns of a given degree, as a function of yield.

import { bisect, FT, interp } from '../units';

/** Visibility for which Fig. 7.98 is drawn: 12 statute miles ("typical clear day"). */
export const REFERENCE_VISIBILITY_M = 12 * 1609.344;

// Two-layer fit to Fig. 7.98 (extinction per metre at the ground, scale height in metres).
const HAZE_EXTINCTION = 0.02553 / 304.8;
const HAZE_SCALE_HEIGHT = 4.8319 * 304.8;
const CLEAR_EXTINCTION = 0.00082 / 304.8;
const CLEAR_SCALE_HEIGHT = 61.809 * 304.8;

/** Mean of exp(-z/H) along a straight path from the ground up to height h. */
function layerFactor(h: number, scaleHeight: number): number {
  const x = h / scaleHeight;
  return x < 1e-6 ? 1 - x / 2 : (1 - Math.exp(-x)) / x;
}

/**
 * Fraction of the thermal radiation that reaches a target on the ground.
 * @param slantRangeM  distance from the burst to the target
 * @param burstHeightM height of the burst above the target
 * @param visibilityM  ground-level visibility; scales the haze layer only
 */
export function transmittance(slantRangeM: number, burstHeightM: number, visibilityM = REFERENCE_VISIBILITY_M): number {
  const h = Math.max(burstHeightM, 0);
  const haze = HAZE_EXTINCTION * (REFERENCE_VISIBILITY_M / Math.max(visibilityM, 100));
  const opticalDepth =
    slantRangeM * (haze * layerFactor(h, HAZE_SCALE_HEIGHT) + CLEAR_EXTINCTION * layerFactor(h, CLEAR_SCALE_HEIGHT));
  return Math.exp(-opticalDepth);
}

// Table 7.101 (effective thermal partition for bursts near the surface). Its entries for
// all five yields fall close to one curve when the height is divided by 200 W^0.35 ft,
// the height at which the table reaches the air-burst value: 0 = contact burst, 1 = air burst.
const PARTITION_S = [0, 0.09, 0.16, 0.22, 0.33, 0.44, 0.6, 0.7, 0.85, 1.0];
const PARTITION_F = [0.18, 0.19, 0.21, 0.215, 0.235, 0.255, 0.27, 0.285, 0.33, 0.35];

/** Height (m) from which a burst radiates like a free air burst, per Table 7.101. */
export function airBurstThermalHeightM(yieldKt: number): number {
  return 200 * FT * Math.pow(yieldKt, 0.35);
}

/** Thermal partition f: fraction of the yield emitted as thermal radiation that can reach the ground. */
export function thermalPartition(yieldKt: number, burstHeightM: number): number {
  const s = Math.max(burstHeightM, 0) / airBurstThermalHeightM(yieldKt);
  return interp(s, PARTITION_S, PARTITION_F);
}

export interface ThermalConditions {
  yieldKt: number;
  burstHeightM: number;
  visibilityM?: number;
}

/** Radiant exposure on the ground, cal/cm^2, at a ground range from ground zero. */
export function radiantExposure(groundRangeM: number, c: ThermalConditions): number {
  const slant = Math.hypot(groundRangeM, c.burstHeightM);
  if (slant <= 0) return Infinity;
  const f = thermalPartition(c.yieldKt, c.burstHeightM);
  const tau = transmittance(slant, c.burstHeightM, c.visibilityM);
  const slantCm = slant * 100;
  return (1e12 * f * c.yieldKt * tau) / (4 * Math.PI * slantCm * slantCm);
}

/** Largest ground range at which the radiant exposure is at least `calPerCm2`; 0 when never reached. */
export function thermalRadiusM(calPerCm2: number, c: ThermalConditions): number {
  if (!(c.yieldKt > 0) || !(calPerCm2 > 0)) return 0;
  // Start a metre out: directly under a surface burst the formula has no finite value.
  const nearest = 1;
  if (radiantExposure(nearest, c) < calPerCm2) return 0;
  // Exposure falls monotonically with ground range; 2,000 km is beyond any case.
  const r = bisect((x) => radiantExposure(x, c), calPerCm2, nearest, 2e6, 80);
  return Number.isFinite(r) ? r : 0;
}

export type BurnDegree = 1 | 2 | 3;

/**
 * Radiant exposure (cal/cm^2) at which 50 % of an average unshielded population, taking no
 * evasive action, receives burns of the given degree. Straight lines read from Fig. 12.65:
 * larger yields deliver the energy more slowly, so more is needed for the same burn.
 */
export function burnThreshold(degree: BurnDegree, yieldKt: number): number {
  const logW = Math.log10(Math.min(Math.max(yieldKt, 1), 1e4));
  switch (degree) {
    case 1:
      return 2.0 + 0.4 * logW;
    case 2:
      return 4.0 + 0.74 * logW;
    case 3:
      return 6.0 + 1.23 * logW;
  }
}

/** Burst height used for the curves of Fig. 7.42: 200 W^0.4 ft. */
export function figure742BurstHeightM(yieldKt: number): number {
  return 200 * FT * Math.pow(yieldKt, 0.4);
}

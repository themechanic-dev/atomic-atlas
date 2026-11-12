// Height of the stabilised nuclear cloud as a function of yield.
//
// Source: Glasstone & Dolan (1977) Fig. 9.96, "Altitudes of the stabilized
// cloud top and cloud bottom as a function of total energy yield for surface
// or low air bursts" (mid-latitudes). Values read from the figure.

import { interp, kftToM } from '../units';

const LOG10_YIELD_KT = [0, 1, 2, 3, 4, Math.log10(3e4)];
const TOP_KFT = [10, 20, 40, 63, 100, 123];
const BOTTOM_KFT = [6, 11, 20, 37, 60, 85];

export interface CloudHeights {
  topM: number;
  bottomM: number;
}

export function stabilisedCloud(yieldKt: number): CloudHeights {
  const logW = Math.log10(Math.max(yieldKt, 1e-3));
  // Below 1 kt the figure has no data; the 1 kt values are scaled down with W^0.25,
  // which continues the slope of the curves at their low end.
  const sub = logW < 0 ? Math.pow(10, 0.25 * logW) : 1;
  return {
    topM: kftToM(interp(logW, LOG10_YIELD_KT, TOP_KFT)) * sub,
    bottomM: kftToM(interp(logW, LOG10_YIELD_KT, BOTTOM_KFT)) * sub,
  };
}

// Glasstone & Dolan (1977) Fig. 2.16, "Approximate values of stabilized cloud height and
// radius as a function of explosion yield for land surface or low air bursts", the radius
// curve, read from the figure (thousands of feet). The values are for about 10 minutes
// after the explosion (§2.16). §2.16 checks the low end: a 10 kt cloud is "roughly
// 10,000 feet" across.
const RADIUS_YIELD_KT = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 3e4];
const RADIUS_KFT = [1.6, 2.0, 3.0, 3.9, 4.6, 6.5, 8.7, 12.2, 19.4, 27.9, 40.7, 70.1, 112.8, 199.8, 300];
const LOG10_RADIUS_YIELD = RADIUS_YIELD_KT.map((w) => Math.log10(w));

/** Radius of the stabilised cloud (the head of the mushroom) about 10 minutes after the burst, metres. */
export function stabilisedCloudRadiusM(yieldKt: number): number {
  const logW = Math.log10(Math.max(yieldKt, 1e-3));
  // Below 1 kt the figure has no data: scaled down as the cube root of the yield.
  const sub = logW < 0 ? Math.pow(10, logW / 3) : 1;
  return kftToM(interp(logW, LOG10_RADIUS_YIELD, RADIUS_KFT)) * sub;
}

/**
 * Radius of the stem of the mushroom as a share of the cloud radius. Glasstone & Dolan
 * §2.17: "about half" below about 20 kilotons; in the megaton range "only one-fifth to
 * one-tenth". In between it is taken to fall evenly with the logarithm of the yield, to
 * 0.15 at 1 Mt (the middle of the range given) and 0.1 at 10 Mt and above.
 */
export function stemRadiusShare(yieldKt: number): number {
  return interp(Math.log10(Math.max(yieldKt, 1e-3)), [Math.log10(20), 3, 4], [0.5, 0.15, 0.1]);
}

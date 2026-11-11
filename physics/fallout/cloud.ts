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

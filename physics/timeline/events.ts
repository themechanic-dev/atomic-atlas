// When things happen after a detonation: the heat pulse, the arrival of the blast
// wave at a distance, the rise of the cloud. These time the playback of an explosion.
//
// Sources: Glasstone & Dolan (1977)
//   - blast arrival: shock-front speed, eq. (3.55.2), followed along the slant range;
//     checked against Figs. 3.77a-b (worked example) and the times quoted in §3.14
//   - heat pulse: time of the second maximum, t_max = 0.0417 W^0.44 s (§7.85), and
//     "by 10 t_max about 80 percent of the thermal energy has been emitted" (§7.86)
//   - cloud rise: Table 2.12, rate of rise of the cloud from a 1-megaton air burst

import { peakOverpressurePsi } from '../blast/overpressure';
import { shockSpeedMs } from '../blast/shock';
import { stabilisedCloud } from '../fallout/cloud';
import { ATM_PSI, interp } from '../units';

/** The overpressure of a shock that gives this reflected pressure on a surface it strikes head-on. */
function incidentFromReflectedPsi(reflectedPsi: number): number {
  // Inverse of eq. (3.56.2): p_r = 2 p (7 P0 + 4 p) / (7 P0 + p).
  let lo = 0;
  let hi = reflectedPsi;
  for (let i = 0; i < 50; i++) {
    const p = (lo + hi) / 2;
    if ((2 * p * (7 * ATM_PSI + 4 * p)) / (7 * ATM_PSI + p) > reflectedPsi) hi = p;
    else lo = p;
  }
  return (lo + hi) / 2;
}

/**
 * Peak overpressure of the blast wave in open air at a distance from the burst, psi.
 * Taken from the pressure the same wave gives on the ground straight below a burst at
 * that height, with the reflection removed.
 */
export function freeAirOverpressurePsi(yieldKt: number, distanceM: number): number {
  return incidentFromReflectedPsi(peakOverpressurePsi(yieldKt, 0, distanceM));
}

/**
 * Time after the detonation at which the blast wave reaches a point on the ground, seconds.
 * The front is followed from the burst along the straight line to the point, at the speed
 * that belongs to its strength at each distance. Within about 15 % of the book's charts.
 */
export function blastArrivalS(yieldKt: number, groundRangeM: number, burstHeightM: number): number {
  const slant = Math.hypot(groundRangeM, burstHeightM);
  if (!(slant > 0) || !(yieldKt > 0)) return 0;
  const start = Math.min(1, slant);
  const steps = 240;
  let time = 0;
  for (let i = 0; i < steps; i++) {
    const a = start * Math.pow(slant / start, i / steps);
    const b = start * Math.pow(slant / start, (i + 1) / steps);
    time += (b - a) / shockSpeedMs(freeAirOverpressurePsi(yieldKt, Math.sqrt(a * b)));
  }
  return time;
}

export interface HeatPulse {
  /** Time at which the fireball is brightest for the second, long time, seconds. */
  peakS: number;
  /** Time by which about 80 % of the heat has been given off (10 times the peak time), seconds. */
  mostEmittedS: number;
}

/** Timing of the heat pulse of an air burst below 15,000 feet. */
export function heatPulse(yieldKt: number): HeatPulse {
  const peakS = 0.0417 * Math.pow(Math.max(yieldKt, 0), 0.44);
  return { peakS, mostEmittedS: 10 * peakS };
}

// Table 2.12: height reached against time for a 1-megaton air burst. The last row is
// where the rise has nearly stopped; the cloud is taken to be at its full height from then on.
const RISE_MINUTES = [0, 0.3, 0.7, 1.1, 2.5, 3.8];
const RISE_MILES = [0, 2, 4, 6, 10, 12];

/** Share of its final height that the cloud has reached at a time after the burst (0 to 1). */
export function cloudRiseFraction(timeS: number): number {
  return interp(Math.max(0, timeS) / 60, RISE_MINUTES, RISE_MILES) / RISE_MILES[RISE_MILES.length - 1]!;
}

/** Height of the top of the cloud at a time after the burst, metres. A rough average, as the source says. */
export function cloudTopAtM(yieldKt: number, timeS: number): number {
  return stabilisedCloud(yieldKt).topM * cloudRiseFraction(timeS);
}

/** Time for the cloud to reach its full height, seconds. */
export const CLOUD_RISE_S = RISE_MINUTES[RISE_MINUTES.length - 1]! * 60;

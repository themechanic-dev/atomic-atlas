// Fireball size and the burst height below which local fallout matters.
//
// Source: Glasstone & Dolan (1977) §2.127-2.128.
//   R (at breakaway), air burst             = 110 W^0.4 ft      (2.127.1)
//   R (at breakaway), contact surface burst = 145 W^0.4 ft      (2.127.2)
//   "as a rough approximation the maximum radius may be taken to be about
//    twice that at the time of breakaway"                        (§2.127)
//   H (maximum for local fallout)           = 180 W^0.4 ft      (2.128.1)
// W is the yield in kilotons.

import { ftToM } from './units';

/** Height of burst (m) above which early, local fallout stops being a serious problem. Eq. (2.128.1). */
export function falloutFreeHeightM(yieldKt: number): number {
  return ftToM(180) * Math.pow(yieldKt, 0.4);
}

/**
 * How close the burst is to the ground on the scale that matters for the fireball:
 * 0 = contact surface burst, 1 = at the height where the fireball no longer touches the ground.
 */
export function surfaceInteraction(yieldKt: number, burstHeightM: number): number {
  const s = Math.max(burstHeightM, 0) / falloutFreeHeightM(yieldKt);
  return Math.min(Math.max(s, 0), 1);
}

/** Fireball radius at breakaway, metres. Between a contact burst and a free air burst the value is interpolated. */
export function fireballBreakawayRadiusM(yieldKt: number, burstHeightM: number): number {
  const s = surfaceInteraction(yieldKt, burstHeightM);
  const coefficientFt = 145 + (110 - 145) * s;
  return ftToM(coefficientFt) * Math.pow(yieldKt, 0.4);
}

/** Approximate maximum fireball radius, metres: twice the radius at breakaway (§2.127). */
export function fireballMaxRadiusM(yieldKt: number, burstHeightM: number): number {
  return 2 * fireballBreakawayRadiusM(yieldKt, burstHeightM);
}

/** True when the fireball at its largest reaches the ground. */
export function fireballTouchesGround(yieldKt: number, burstHeightM: number): boolean {
  return burstHeightM <= fireballMaxRadiusM(yieldKt, burstHeightM);
}

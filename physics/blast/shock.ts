// Properties of an ideal shock front in sea-level air, as functions of the peak
// overpressure: dynamic pressure, wind speed behind the front, shock speed and
// reflected pressure.
//
// Source: Glasstone & Dolan (1977) §3.55-3.56 (Rankine-Hugoniot relations for
// air with a specific-heat ratio of 1.4). Table 3.07 lists the same values.

import { ATM_PSI, SOUND_SPEED } from '../units';

/** Peak dynamic pressure q = 5 p^2 / (2 (7 P0 + p)), psi. Eq. (3.55.1). */
export function dynamicPressurePsi(overpressurePsi: number, ambientPsi = ATM_PSI): number {
  const p = Math.max(overpressurePsi, 0);
  return (2.5 * p * p) / (7 * ambientPsi + p);
}

/** Maximum wind speed behind the shock front, m/s. Eq. (3.55.3). */
export function windSpeedMs(overpressurePsi: number, ambientPsi = ATM_PSI, soundSpeed = SOUND_SPEED): number {
  const p = Math.max(overpressurePsi, 0);
  return ((5 * p) / (7 * ambientPsi)) * (soundSpeed / Math.sqrt(1 + (6 * p) / (7 * ambientPsi)));
}

/** Speed of the shock front, m/s. Eq. (3.55.2). */
export function shockSpeedMs(overpressurePsi: number, ambientPsi = ATM_PSI, soundSpeed = SOUND_SPEED): number {
  const p = Math.max(overpressurePsi, 0);
  return soundSpeed * Math.sqrt(1 + (6 * p) / (7 * ambientPsi));
}

/** Peak reflected overpressure for a shock striking a surface head-on, psi. Eq. (3.56.2). */
export function reflectedPressurePsi(overpressurePsi: number, ambientPsi = ATM_PSI): number {
  const p = Math.max(overpressurePsi, 0);
  return (2 * p * (7 * ambientPsi + 4 * p)) / (7 * ambientPsi + p);
}

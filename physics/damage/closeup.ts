// What happens at one point at a given distance from a detonation, in terms of things a
// close view can show: how much of a building is left, whether vehicles are overturned,
// whether fires can start, whether windows break.
//
// Sources: Glasstone & Dolan (1977)
//   - buildings: the damage levels of ./levels.ts; houses tested at 5 psi (destroyed) and
//     1.7 psi (repairable), §5.52-5.68, Figs. 5.57 and 5.59
//   - vehicles: trucks standing broadside to the blast overturned at 5 psi, §5.87-5.89, Fig. 5.89
//   - windows: glass shatters at 0.5 to 1 psi, Table 5.145
//   - fires: radiant exposure that ignites household tinder (newspaper, printed text),
//     Table 7.40: 6, 8 and 15 cal/cm2 for 35 kt, 1.4 Mt and 20 Mt
//   - parked aircraft: Table 5.153 (see ./infrastructure.ts)
//   - merchant ships: Figure 5.146, items 13m and 13s (digitised), Table 5.147b

import { dynamicPressurePsi, windSpeedMs } from '../blast/shock';
import { ftToM, interp } from '../units';
import { infrastructureFinding, type InfrastructureDamage } from './infrastructure';
import { damageBand, type DamageBand } from './levels';

const IGNITION_LOG_YIELD = [Math.log10(35), Math.log10(1400), Math.log10(20000)];
const IGNITION_CAL = [6, 8, 15];

/** Radiant exposure at which household tinder (newspaper) ignites, cal/cm2. Larger yields deliver their heat more slowly, so more is needed. */
export function tinderIgnitionCal(yieldKt: number): number {
  return interp(Math.log10(Math.max(yieldKt, 1e-3)), IGNITION_LOG_YIELD, IGNITION_CAL);
}

/** Peak overpressure from which vehicles standing broadside are overturned, psi. */
export const VEHICLE_OVERTURN_PSI = 5;
/** Peak overpressure from which window glass shatters, psi (upper end of the range in Table 5.145). */
export const WINDOW_BREAK_PSI = 1;

/**
 * Merchant ships: distance to moderate and severe damage for 1 kt, feet, scaling as W^(1/3).
 * Read from the nomogram of Figure 5.146 (items 13m, 13s); the same for a surface burst and
 * a burst at the optimum height. Stated accuracy ±20 %.
 */
export const SHIP_MODERATE_FT_1KT = 641;
export const SHIP_SEVERE_FT_1KT = 561;

/** Table 5.147b: severe = sunk, capsized or in need of rebuilding; moderate = immobilised, extensive repairs. */
export type ShipDamage = 'none' | 'moderate' | 'severe';

export function shipDamage(yieldKt: number, rangeM: number): ShipDamage {
  const scale = Math.cbrt(Math.max(yieldKt, 0));
  if (rangeM <= ftToM(SHIP_SEVERE_FT_1KT) * scale) return 'severe';
  if (rangeM <= ftToM(SHIP_MODERATE_FT_1KT) * scale) return 'moderate';
  return 'none';
}

export interface PointEffects {
  yieldKt: number;
  /** Distance from ground zero, metres. */
  rangeM: number;
  overpressurePsi: number;
  /** Radiant exposure, cal/cm2. */
  exposureCal: number;
  /** Time at which the blast wave arrives, seconds after the burst. */
  arrivalS: number;
}

export interface CloseupState {
  building: DamageBand;
  vehiclesOverturned: boolean;
  windowsBroken: boolean;
  firesStart: boolean;
  aircraft: InfrastructureDamage;
  ship: ShipDamage;
  /** Peak wind behind the blast front, m/s. */
  windMs: number;
  dynamicPsi: number;
}

export function closeupState(point: PointEffects): CloseupState {
  const psi = Math.max(point.overpressurePsi, 0);
  return {
    building: damageBand(psi),
    vehiclesOverturned: psi >= VEHICLE_OVERTURN_PSI,
    windowsBroken: psi >= WINDOW_BREAK_PSI,
    firesStart: point.exposureCal >= tinderIgnitionCal(point.yieldKt),
    aircraft: infrastructureFinding('airport', psi).damage,
    ship: shipDamage(point.yieldKt, point.rangeM),
    windMs: windSpeedMs(psi),
    dynamicPsi: dynamicPressurePsi(psi),
  };
}

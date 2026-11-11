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

import { dynamicPressurePsi, windSpeedMs } from '../blast/shock';
import { interp } from '../units';
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

export interface PointEffects {
  yieldKt: number;
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
    windMs: windSpeedMs(psi),
    dynamicPsi: dynamicPressurePsi(psi),
  };
}

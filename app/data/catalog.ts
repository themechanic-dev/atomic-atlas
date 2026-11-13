// The weapons catalog and the ready-made scenarios that ship with the app.
// Every record names the public source it comes from.

import type { GlideVehicle } from '@physics/ballistics/flight';
import type { BurstMode } from '@physics/detonation';
import scenariosJson from '@data/scenarios.json';
import weaponsJson from '@data/weapons.json';

export type CountryCode = 'US' | 'RU' | 'SU' | 'GB' | 'FR' | 'CN' | 'IN' | 'PK' | 'IL' | 'KP';
export type WeaponCategory = 'ICBM' | 'SLBM' | 'IRBM' | 'MRBM' | 'SRBM' | 'cruise' | 'glide' | 'bomb' | 'test';
export type WeaponStatus = 'active' | 'retired' | 'test' | 'development';

export interface SourceRef {
  title: string;
  publisher: string;
  date: string;
  url: string;
}

export interface Weapon {
  id: string;
  name: string;
  designations: string[];
  country: CountryCode;
  category: WeaponCategory;
  platform: string[];
  carrier: string;
  /** Maximum published range in km; null for bombs and test devices. */
  rangeKm: number | null;
  /** Published speed of a glide vehicle at the start of its glide, km/s. */
  glideSpeedKmS?: number;
  warheadsMax: number;
  mirv: boolean;
  /** Published yield options per warhead, kilotons, ascending. */
  yieldsKt: number[];
  /** Fraction of the yield from fission, where a public source states it. */
  fissionFraction: number | null;
  year: number;
  status: WeaponStatus;
  /** True when the figures are outside estimates, not official publications. */
  estimate: boolean;
  sources: SourceRef[];
  note?: string;
}

export interface PresetScenario {
  id: string;
  name: string;
  lat: number;
  lng: number;
  yieldKt: number;
  burstMode: BurstMode;
  heightM: number;
  fissionFraction: number;
  weaponId: string | null;
  /** Depth of the water at ground zero, metres, for a burst in water whose depth the map does not hold. */
  waterDepthM?: number;
  source: SourceRef;
}

export const WEAPONS: Weapon[] = weaponsJson as Weapon[];
export const PRESETS: PresetScenario[] = scenariosJson as PresetScenario[];

export const COUNTRIES: CountryCode[] = ['US', 'RU', 'SU', 'GB', 'FR', 'CN', 'IN', 'PK', 'IL', 'KP'];
export const CATEGORIES: WeaponCategory[] = ['ICBM', 'SLBM', 'IRBM', 'MRBM', 'SRBM', 'cruise', 'glide', 'bomb', 'test'];

export function weaponById(id: string | null): Weapon | null {
  return id ? (WEAPONS.find((w) => w.id === id) ?? null) : null;
}

/** What the glide model needs of a weapon: its published glide speed and range, in SI units. */
export function glideVehicle(weapon: Weapon): GlideVehicle {
  return {
    startSpeedMs: weapon.glideSpeedKmS ? weapon.glideSpeedKmS * 1000 : null,
    publishedRangeM: weapon.rangeKm !== null ? weapon.rangeKm * 1000 : null,
  };
}

/**
 * Fission fraction to assume for a weapon when no source gives one: pure fission for
 * yields up to 50 kt, half for larger (thermonuclear) weapons. Half is the figure
 * Glasstone & Dolan use for thermonuclear weapons throughout their charts and examples.
 */
export function assumedFissionFraction(weapon: Weapon, yieldKt: number): number {
  if (weapon.fissionFraction !== null) return weapon.fissionFraction;
  return yieldKt <= 50 ? 1 : 0.5;
}

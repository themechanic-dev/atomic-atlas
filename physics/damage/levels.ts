// Five levels of damage to ordinary buildings, by the peak overpressure that reaches them.
// The same levels are used wherever damage is drawn: the 3D map and the close view.
//
// The pressure bands are those of the blast rings (Glasstone & Dolan 1977, chapter 5;
// Office of Technology Assessment 1979, Table 3). How much of a building's height is
// left standing in the picture is a drawing choice, not a measurement.

export type DamageLevel = 0 | 1 | 2 | 3 | 4;

export interface DamageBand {
  level: DamageLevel;
  /** Lowest peak overpressure of the band, psi. */
  minPsi: number;
  /** Share of a building's height drawn standing, 0 to 1. */
  heightKept: number;
  id: 'none' | 'light' | 'severe' | 'collapse' | 'destroyed';
}

/** Strongest first. */
export const DAMAGE_BANDS: readonly DamageBand[] = [
  { level: 4, minPsi: 20, heightKept: 0.08, id: 'destroyed' },
  { level: 3, minPsi: 5, heightKept: 0.35, id: 'collapse' },
  { level: 2, minPsi: 2, heightKept: 0.85, id: 'severe' },
  { level: 1, minPsi: 1, heightKept: 1, id: 'light' },
  { level: 0, minPsi: 0, heightKept: 1, id: 'none' },
];

export function damageBand(overpressurePsi: number): DamageBand {
  const p = Number.isFinite(overpressurePsi) ? overpressurePsi : 0;
  return DAMAGE_BANDS.find((band) => p >= band.minPsi) ?? DAMAGE_BANDS[DAMAGE_BANDS.length - 1]!;
}

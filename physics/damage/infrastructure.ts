// What a blast wave of a given strength does to kinds of infrastructure, as far as the
// source says. These are general findings for a kind of installation (aircraft parked in
// the open, an electricity network), not an assessment of any particular place.
//
// Source: Glasstone & Dolan (1977)
//   - parked aircraft: Table 5.153 (transport airplanes)
//   - electric power: §5.99-5.105, two identical systems tested at 5 psi and at 1.7 psi

export type InfrastructureKind = 'airport' | 'power';

/** `beyond` means: stronger than anything the source reports a test for. */
export type InfrastructureDamage = 'none' | 'light' | 'moderate' | 'severe' | 'beyond';

export interface InfrastructureFinding {
  damage: InfrastructureDamage;
  /** Lowest peak overpressure of this finding, psi. */
  fromPsi: number;
  /** Where the source says it. */
  where: string;
}

const AIRCRAFT: InfrastructureFinding[] = [
  { damage: 'severe', fromPsi: 3, where: 'Table 5.153' },
  { damage: 'moderate', fromPsi: 2, where: 'Table 5.153' },
  { damage: 'light', fromPsi: 1, where: 'Table 5.153' },
  { damage: 'none', fromPsi: 0, where: 'Table 5.153' },
];

const POWER: InfrastructureFinding[] = [
  // Above the stronger of the two tests the source gives no figures.
  { damage: 'beyond', fromPsi: 5.5, where: '§5.99' },
  { damage: 'moderate', fromPsi: 5, where: '§5.101-5.105' },
  { damage: 'light', fromPsi: 1.7, where: '§5.99' },
  { damage: 'none', fromPsi: 0, where: '§5.99' },
];

const TABLES: Record<InfrastructureKind, InfrastructureFinding[]> = { airport: AIRCRAFT, power: POWER };

/** The source's finding for a kind of infrastructure at a peak overpressure. */
export function infrastructureFinding(kind: InfrastructureKind, overpressurePsi: number): InfrastructureFinding {
  const p = Number.isFinite(overpressurePsi) ? overpressurePsi : 0;
  const table = TABLES[kind];
  return table.find((row) => p >= row.fromPsi) ?? table[table.length - 1]!;
}

/** Lowest overpressure at which anything is reported for a kind: sites below it are not listed. */
export function infrastructureThresholdPsi(kind: InfrastructureKind): number {
  const table = TABLES[kind];
  return table[table.length - 2]!.fromPsi;
}

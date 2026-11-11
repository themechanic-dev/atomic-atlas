// Casualty estimate: effects at each distance x people living there.
//
// Blast, from the U.S. Office of Technology Assessment, "The Effects of Nuclear
// War" (1979), Figure 1, "Vulnerability of Population in Various Overpressure
// Zones":
//
//     over 12 psi   98 % killed    2 % injured
//     5 - 12 psi    50 % killed   40 % injured
//     2 - 5 psi      5 % killed   45 % injured
//     1 - 2 psi      0 % killed   25 % injured
//
// Burns, same report (Table 5 and the text before it): only people with a clear
// line of sight to the fireball are burned. "On a winter night less than 1
// percent of the population might be exposed ... on a clear summer weekend
// afternoon more than 25 percent might be exposed." Within the range of
// third-degree burns the exposed are counted as eventual fatalities, within the
// range of second-degree burns as injured.
//
// Initial radiation, same report: 300 rem kills about 10 %, 450 rem half and
// 600 rem 90 % of those exposed. Buildings reduce the dose (Glasstone & Dolan
// 1977, Table 8.72: 0.8-1.0 for gamma rays in a frame house, 0.3-0.6 in the
// lower stories of an apartment building).
//
// The result is a range, not a number. The low end combines the assumptions
// that give fewer casualties, the high end those that give more. It covers
// only the prompt effects: no fallout, no fire storm, no lack of medical care.

import { interp } from '../units';

export interface OverpressureZone {
  minPsi: number;
  killed: number;
  injured: number;
}

/** OTA (1979) Figure 1. Ordered from the highest pressure down. */
export const OTA_ZONES: readonly OverpressureZone[] = [
  { minPsi: 12, killed: 0.98, injured: 0.02 },
  { minPsi: 5, killed: 0.5, injured: 0.4 },
  { minPsi: 2, killed: 0.05, injured: 0.45 },
  { minPsi: 1, killed: 0, injured: 0.25 },
];

/** Fractions killed and injured by blast at a peak overpressure. */
export function blastVulnerability(psi: number): { killed: number; injured: number } {
  for (const zone of OTA_ZONES) {
    if (psi >= zone.minPsi) return { killed: zone.killed, injured: zone.injured };
  }
  return { killed: 0, injured: 0 };
}

// OTA (1979): 300 rem about 10 %, 450 rem 50 %, 600 rem 90 %. Straight lines between,
// none below 200 rem ("most people would recover"), all above 800.
const LETHAL_DOSE = [200, 300, 450, 600, 800];
const LETHAL_FRACTION = [0, 0.1, 0.5, 0.9, 1];

/** Fraction of people killed by a short whole-body dose (rem; for initial radiation taken equal to rad). */
export function radiationLethality(doseRem: number): number {
  return interp(doseRem, LETHAL_DOSE, LETHAL_FRACTION);
}

/** Dose from which radiation sickness needs care but most recover (OTA: 200 to 450 rem). */
export const RADIATION_INJURY_DOSE = 200;

export interface CasualtyAssumptions {
  /** Fraction of people with a clear line of sight to the fireball. */
  exposedFraction: number;
  /** Multiplier on every blast distance (model uncertainty). */
  blastRangeFactor: number;
  /** Fraction of the initial radiation dose that reaches people (shielding by buildings). */
  radiationTransmission: number;
}

export const ASSUMPTIONS = {
  /** Night, people indoors, blast ranges at the short end of the model accuracy. */
  low: { exposedFraction: 0.01, blastRangeFactor: 0.9, radiationTransmission: 0.5 },
  /** The usual single-number estimate: blast zones as published, few people outdoors. */
  central: { exposedFraction: 0.01, blastRangeFactor: 1, radiationTransmission: 0.8 },
  /** Clear summer afternoon, many people outdoors, blast ranges at the long end. */
  high: { exposedFraction: 0.25, blastRangeFactor: 1.1, radiationTransmission: 1 },
} as const satisfies Record<string, CasualtyAssumptions>;

/** The effects at a ground range, supplied by the detonation model. */
export interface EffectsAt {
  overpressurePsi(groundRangeM: number): number;
  radiantExposure(groundRangeM: number): number;
  /** Initial radiation dose in the open, rad; `high` selects the upper curve of the source. */
  initialDose(groundRangeM: number, high: boolean): number;
  /** Radiant exposure for 50 % second-degree and third-degree burns, cal/cm^2. */
  secondDegreeBurn: number;
  thirdDegreeBurn: number;
}

export interface CellOutcome {
  killed: number;
  injured: number;
}

/** Fractions of the people at one distance who are killed and injured, under one set of assumptions. */
export function outcomeAt(groundRangeM: number, effects: EffectsAt, a: CasualtyAssumptions, highDose: boolean): CellOutcome {
  // Blast: a longer reach is the same as standing closer.
  const psi = effects.overpressurePsi(groundRangeM / a.blastRangeFactor);
  const blast = blastVulnerability(psi);
  let alive = 1 - blast.killed;
  // Share of blast survivors who are injured by blast.
  let injuredShare = alive > 0 ? Math.min(blast.injured / alive, 1) : 0;

  // Burns among blast survivors with a line of sight to the fireball.
  const q = effects.radiantExposure(groundRangeM);
  if (q >= effects.thirdDegreeBurn) {
    alive *= 1 - a.exposedFraction;
  } else if (q >= effects.secondDegreeBurn) {
    injuredShare = 1 - (1 - injuredShare) * (1 - a.exposedFraction);
  }

  // Initial radiation among those still alive.
  const dose = effects.initialDose(groundRangeM, highDose) * a.radiationTransmission;
  const lethal = radiationLethality(dose);
  alive *= 1 - lethal;
  if (dose >= RADIATION_INJURY_DOSE) injuredShare = 1;

  return { killed: 1 - alive, injured: alive * injuredShare };
}

export interface PopulationSample {
  groundRangeM: number;
  people: number;
}

export interface CasualtyRange {
  low: number;
  central: number;
  high: number;
}

export interface CasualtyEstimate {
  killed: CasualtyRange;
  injured: CasualtyRange;
  /** People living inside the outermost blast zone (1 psi), central assumptions. */
  peopleInside1Psi: number;
  /** People in each OTA blast zone, central assumptions, ordered as OTA_ZONES. */
  peopleByZone: number[];
}

export function estimateCasualties(population: Iterable<PopulationSample>, effects: EffectsAt): CasualtyEstimate {
  const killed = { low: 0, central: 0, high: 0 };
  const injured = { low: 0, central: 0, high: 0 };
  const peopleByZone = OTA_ZONES.map(() => 0);

  for (const cell of population) {
    if (!(cell.people > 0)) continue;
    const low = outcomeAt(cell.groundRangeM, effects, ASSUMPTIONS.low, false);
    const central = outcomeAt(cell.groundRangeM, effects, ASSUMPTIONS.central, false);
    const high = outcomeAt(cell.groundRangeM, effects, ASSUMPTIONS.high, true);
    killed.low += cell.people * low.killed;
    killed.central += cell.people * central.killed;
    killed.high += cell.people * high.killed;
    injured.low += cell.people * low.injured;
    injured.central += cell.people * central.injured;
    injured.high += cell.people * high.injured;

    const psi = effects.overpressurePsi(cell.groundRangeM);
    const zone = OTA_ZONES.findIndex((z) => psi >= z.minPsi);
    if (zone >= 0) peopleByZone[zone]! += cell.people;
  }

  // More deaths can mean fewer injured survivors; report the injured range in order.
  const injuredValues = [injured.low, injured.central, injured.high];
  return {
    killed,
    injured: {
      low: Math.min(...injuredValues),
      central: injured.central,
      high: Math.max(...injuredValues),
    },
    peopleInside1Psi: peopleByZone.reduce((a, b) => a + b, 0),
    peopleByZone,
  };
}

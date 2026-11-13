// The radionuclides of reactor and reprocessing accidents, with the dose each gives.
//
// Sources:
//   - inhalation: ICRP Publication 119 (2012), Annex G, Table G.1, committed effective dose
//     per unit intake for adult members of the public, with the absorption type given below
//   - cloud and ground: K. F. Eckerman and J. C. Ryman, External Exposure to Radionuclides in
//     Air, Water, and Soil, Federal Guidance Report No. 12, EPA-402-R-93-081 (1993),
//     Tables III.1 (air submersion) and III.3 (contaminated ground surface), effective dose
//     equivalent. Where a short-lived daughter gives the gamma rays (Ba-137m, Rh-106, Pr-144,
//     Y-90, I-132) its coefficient is added to the parent's, with the branching for Ba-137m.
//   - half-lives: as printed in ICRP Publication 119
//   - deposition velocity 0.3 cm/s for particles and reactive gases, none for noble gases:
//     HotSpot User's Guide 3.0, chapter 7 "Plume Depletion"
//   - dose to the thyroid from breathing in radioiodine: the effective dose coefficient above
//     divided by the tissue weighting factor of the thyroid, 0.05 (ICRP Publication 60, as
//     tabulated in ICRP Publication 119). Since the effective dose is the weighted sum over all
//     organs, this is an upper bound; for radioiodine it is close, because nearly all of the
//     effective dose is to the thyroid: 98.5 % for I-131 and 92 % for I-133 in Federal Guidance
//     Report 11 (Table 2.1, inhalation, class D). Only iodine counts, as in the IAEA criterion
//     for iodine thyroid blocking.

const DAY = 86400;
const YEAR = 365.25 * DAY;

export interface Nuclide {
  id: string;
  halfLifeS: number;
  /** Committed effective dose per becquerel breathed in, Sv/Bq. 0 for noble gases. */
  inhalationSvPerBq: number;
  /** Committed equivalent dose to the thyroid per becquerel breathed in, Sv/Bq; radioiodine only, 0 for the rest. */
  thyroidInhalationSvPerBq: number;
  /** Lung absorption type of the inhalation coefficient, or 'gas' for noble gases. */
  absorption: 'F' | 'M' | 'gas';
  /** Effective dose rate inside the cloud, Sv per (Bq.s/m3). */
  submersionSvPerBqSM3: number;
  /** Effective dose rate above contaminated ground, Sv per (Bq.s/m2). */
  groundSvPerBqSM2: number;
  /** Speed at which it settles on the ground, m/s. */
  depositionVelocityMs: number;
}

const particle = 0.003;

/** Tissue weighting factor of the thyroid (ICRP Publication 60, as tabulated in ICRP Publication 119). */
export const THYROID_WEIGHT = 0.05;

type Entry = Omit<Nuclide, 'thyroidInhalationSvPerBq'> & { radioiodine?: boolean };

const ENTRIES: Entry[] = [
  { id: 'Kr-85', halfLifeS: 10.72 * YEAR, inhalationSvPerBq: 0, absorption: 'gas', submersionSvPerBqSM3: 1.19e-16, groundSvPerBqSM2: 0, depositionVelocityMs: 0 },
  { id: 'Xe-133', halfLifeS: 5.25 * DAY, inhalationSvPerBq: 0, absorption: 'gas', submersionSvPerBqSM3: 1.56e-15, groundSvPerBqSM2: 0, depositionVelocityMs: 0 },
  { id: 'I-131', radioiodine: true, halfLifeS: 8.04 * DAY, inhalationSvPerBq: 7.4e-9, absorption: 'F', submersionSvPerBqSM3: 1.82e-14, groundSvPerBqSM2: 3.76e-16, depositionVelocityMs: particle },
  { id: 'I-133', radioiodine: true, halfLifeS: 20.8 * 3600, inhalationSvPerBq: 1.5e-9, absorption: 'F', submersionSvPerBqSM3: 2.94e-14, groundSvPerBqSM2: 5.97e-16, depositionVelocityMs: particle },
  // Te-132 with its daughter I-132 (2.3 h).
  { id: 'Te-132', halfLifeS: 78.2 * 3600, inhalationSvPerBq: 2.0e-9, absorption: 'M', submersionSvPerBqSM3: 1.03e-14 + 1.12e-13, groundSvPerBqSM2: 2.28e-16 + 2.21e-15, depositionVelocityMs: particle },
  { id: 'Cs-134', halfLifeS: 2.062 * YEAR, inhalationSvPerBq: 6.6e-9, absorption: 'F', submersionSvPerBqSM3: 7.57e-14, groundSvPerBqSM2: 1.52e-15, depositionVelocityMs: particle },
  // Cs-137 with Ba-137m (94.6 % of decays).
  { id: 'Cs-137', halfLifeS: 30.0 * YEAR, inhalationSvPerBq: 4.6e-9, absorption: 'F', submersionSvPerBqSM3: 7.74e-18 + 0.946 * 2.88e-14, groundSvPerBqSM2: 2.85e-19 + 0.946 * 5.86e-16, depositionVelocityMs: particle },
  // Sr-90 with Y-90.
  { id: 'Sr-90', halfLifeS: 29.12 * YEAR, inhalationSvPerBq: 3.6e-8, absorption: 'M', submersionSvPerBqSM3: 7.53e-18 + 1.9e-16, groundSvPerBqSM2: 2.84e-19 + 5.32e-18, depositionVelocityMs: particle },
  // Ru-106 with Rh-106.
  { id: 'Ru-106', halfLifeS: 368.2 * DAY, inhalationSvPerBq: 2.8e-8, absorption: 'M', submersionSvPerBqSM3: 1.04e-14, groundSvPerBqSM2: 2.12e-16, depositionVelocityMs: particle },
  { id: 'Zr-95', halfLifeS: 63.98 * DAY, inhalationSvPerBq: 4.8e-9, absorption: 'M', submersionSvPerBqSM3: 3.6e-14, groundSvPerBqSM2: 7.23e-16, depositionVelocityMs: particle },
  // Ce-144 with Pr-144.
  { id: 'Ce-144', halfLifeS: 284.3 * DAY, inhalationSvPerBq: 3.6e-8, absorption: 'M', submersionSvPerBqSM3: 8.53e-16 + 1.95e-15, groundSvPerBqSM2: 2.03e-17 + 3.78e-17, depositionVelocityMs: particle },
];

export const NUCLIDES: Record<string, Nuclide> = Object.fromEntries(
  ENTRIES.map(({ radioiodine, ...entry }) => [
    entry.id,
    { ...entry, thyroidInhalationSvPerBq: radioiodine ? entry.inhalationSvPerBq / THYROID_WEIGHT : 0 },
  ]),
);

export function decayConstant(nuclide: Nuclide): number {
  return Math.LN2 / nuclide.halfLifeS;
}

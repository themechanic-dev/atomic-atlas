// The dose from a release of radioactive material into the air, at points downwind:
// what people breathe in while the plume passes, the radiation from the cloud itself,
// and the radiation from what settles on the ground.
//
// Sources: the plume model of ./plume.ts (HotSpot 3.0 User's Guide), the dose coefficients
// of ./nuclides.ts (ICRP Publication 119, Federal Guidance Report 12), the breathing rate
// 3.33e-4 m3/s of the HotSpot guide, and the generic criteria of IAEA GSR Part 7, Table II.2.

import type { Explanation } from '../sources';
import { decayConstant, NUCLIDES, type Nuclide } from './nuclides';
import { depletionFactor, dilution, plumeArrivalS, windAtHeight, type PlumeConditions } from './plume';

/** Breathing rate of an adult doing light work, m3/s (HotSpot default). */
export const BREATHING_RATE_M3S = 3.33e-4;
const DAY_S = 86400;
export const SEVEN_DAYS_S = 7 * DAY_S;
export const ONE_YEAR_S = 365.25 * DAY_S;

/** IAEA generic criteria for protective actions, as projected effective dose, Sv. */
export const IAEA_CRITERIA = {
  /** In the first 7 days: sheltering, evacuation. */
  urgentSv: 0.1,
  /** In the first year: temporary relocation. */
  relocationSv: 0.1,
} as const;

export interface ReleasedNuclide {
  nuclide: string;
  activityBq: number;
}

export interface Release {
  nuclides: ReleasedNuclide[];
  conditions: PlumeConditions;
}

export interface PointDose {
  /** Committed effective dose from breathing while the plume passes, Sv. */
  inhalationSv: number;
  /** Effective dose from the cloud while it passes, Sv. */
  cloudSv: number;
  /** Effective dose from the ground in the first 7 days, Sv. */
  ground7dSv: number;
  /** Effective dose from the ground in the first year, Sv. */
  ground1ySv: number;
  /** Projected effective dose in the first 7 days: plume passage plus ground, Sv. */
  first7dSv: number;
  /** Projected effective dose in the first year, Sv. */
  firstYearSv: number;
  /** Activity on the ground per nuclide right after the plume has passed, Bq/m2. */
  depositionBqM2: Record<string, number>;
  /** Time for the plume to arrive, seconds. */
  arrivalS: number;
}

/** Dose from a unit of ground contamination that decays, integrated over a time: (1 - e^(-lambda T)) / lambda. */
function integratedDecay(nuclide: Nuclide, periodS: number): number {
  const lambda = decayConstant(nuclide);
  return lambda * periodS < 1e-6 ? periodS : (1 - Math.exp(-lambda * periodS)) / lambda;
}

/**
 * The dose at a point `downwindM` along the wind and `crosswindM` to the side.
 * The ground dose assumes a person out of doors on open, flat ground the whole time, with
 * nothing washed away or dug in: an upper estimate, more so over a year than over a week.
 */
export function doseAt(release: Release, downwindM: number, crosswindM = 0): PointDose {
  const { conditions } = release;
  const perBq = dilution(conditions, downwindM, crosswindM);
  const arrivalS = plumeArrivalS(conditions, downwindM);
  const out: PointDose = {
    inhalationSv: 0,
    cloudSv: 0,
    ground7dSv: 0,
    ground1ySv: 0,
    first7dSv: 0,
    firstYearSv: 0,
    depositionBqM2: {},
    arrivalS,
  };
  for (const { nuclide: id, activityBq } of release.nuclides) {
    const nuclide = NUCLIDES[id];
    if (!nuclide || !(activityBq > 0)) continue;
    const inTransit = Math.exp(-decayConstant(nuclide) * arrivalS);
    const airborne = depletionFactor(conditions, nuclide.depositionVelocityMs, downwindM);
    // Time-integrated concentration at the point, Bq.s/m3.
    const exposure = activityBq * perBq * inTransit * airborne;
    const deposited = exposure * nuclide.depositionVelocityMs;
    out.inhalationSv += exposure * BREATHING_RATE_M3S * nuclide.inhalationSvPerBq;
    out.cloudSv += exposure * nuclide.submersionSvPerBqSM3;
    out.ground7dSv += deposited * nuclide.groundSvPerBqSM2 * integratedDecay(nuclide, SEVEN_DAYS_S);
    out.ground1ySv += deposited * nuclide.groundSvPerBqSM2 * integratedDecay(nuclide, ONE_YEAR_S);
    out.depositionBqM2[id] = deposited;
  }
  out.first7dSv = out.inhalationSv + out.cloudSv + out.ground7dSv;
  out.firstYearSv = out.inhalationSv + out.cloudSv + out.ground1ySv;
  return out;
}

/** Furthest distance the model is used to; beyond about 100 km one steady wind is no longer a fair picture. */
export const MAX_RANGE_M = 200_000;
const MIN_RANGE_M = 100;

/**
 * The furthest distance on the plume centreline at which a dose is still at or above a level,
 * metres. 0 when it is nowhere reached, MAX_RANGE_M when it is still exceeded at the end.
 */
export function distanceToDose(release: Release, pick: (dose: PointDose) => number, levelSv: number): number {
  const steps = 240;
  let furthest = 0;
  for (let i = 0; i <= steps; i++) {
    const x = MIN_RANGE_M * Math.pow(MAX_RANGE_M / MIN_RANGE_M, i / steps);
    if (pick(doseAt(release, x)) >= levelSv) furthest = x;
  }
  if (furthest <= 0 || furthest >= MAX_RANGE_M) return furthest;
  // Refine between the last point above and the next one.
  let lo = furthest;
  let hi = furthest * Math.pow(MAX_RANGE_M / MIN_RANGE_M, 1 / steps);
  for (let i = 0; i < 30; i++) {
    const mid = Math.sqrt(lo * hi);
    if (pick(doseAt(release, mid)) >= levelSv) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Half-width of the area in which a dose is at or above a level, at a distance downwind, metres. */
export function halfWidthAt(release: Release, pick: (dose: PointDose) => number, levelSv: number, downwindM: number): number {
  if (pick(doseAt(release, downwindM, 0)) < levelSv) return 0;
  let lo = 0;
  let hi = downwindM * 2 + 1000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pick(doseAt(release, downwindM, mid)) >= levelSv) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface ReleaseResult {
  release: Release;
  /** Distance out to which sheltering or evacuation would be warranted (100 mSv in 7 days), metres. */
  urgentRangeM: number;
  /** Distance out to which temporary relocation would be warranted (100 mSv in the first year), metres. */
  relocationRangeM: number;
  /** Wind speed at the height of the release, m/s. */
  windAtReleaseMs: number;
  explanation: Explanation;
}

export function assessRelease(release: Release): ReleaseResult {
  const urgentRangeM = distanceToDose(release, (dose) => dose.first7dSv, IAEA_CRITERIA.urgentSv);
  const relocationRangeM = distanceToDose(release, (dose) => dose.firstYearSv, IAEA_CRITERIA.relocationSv);
  const { conditions } = release;
  const total = release.nuclides.reduce((sum, entry) => sum + entry.activityBq, 0);
  const at10km = doseAt(release, 10_000);
  return {
    release,
    urgentRangeM,
    relocationRangeM,
    windAtReleaseMs: windAtHeight(conditions.wind10Ms, conditions.releaseHeightM, conditions.stability),
    explanation: {
      id: 'plume',
      formula:
        'C = Q / (2π σy σz u) · exp(−y² / 2σy²) · [exp(−(z−H)² / 2σz²) + exp(−(z+H)² / 2σz²)] · DF(x) · exp(−λx/u);  E = C · (BR · e_inh + e_cloud) + C · v_d · e_ground · (1 − e^(−λT)) / λ',
      inputs: [
        { symbol: 'Q', labelKey: 'activityReleased', value: total, quantity: 'activity' },
        { symbol: 'H', labelKey: 'releaseHeight', value: conditions.releaseHeightM, quantity: 'height' },
        { symbol: 'u', labelKey: 'windSpeed10', value: conditions.wind10Ms, quantity: 'speed' },
      ],
      outputs: [
        { symbol: 'E₇', labelKey: 'dose7dAt10km', value: at10km.first7dSv, quantity: 'effectiveDose' },
        { symbol: 'E₁', labelKey: 'dose1yAt10km', value: at10km.firstYearSv, quantity: 'effectiveDose' },
      ],
      sources: ['hotspot2013', 'icrp119', 'fgr12', 'iaeaGsr7'],
      where: 'HotSpot User\'s Guide 3.0, chapter 7; ICRP 119 Table G.1; FGR 12 Tables III.1 and III.3; IAEA GSR Part 7 Table II.2',
      uncertainty: 'rough',
    },
  };
}

// One detonation: from a scenario to every number the UI shows, each with the
// explanation behind it ("How was this calculated?").
//
// This file only combines the models in the sub-folders. It has no formulas of
// its own apart from circle areas.

import { optimumBurstHeightM, overpressureRadiusM, peakOverpressurePsi } from './blast/overpressure';
import { dynamicPressurePsi, windSpeedMs } from './blast/shock';
import type { EffectsAt } from './casualties/model';
import { stabilisedCloud, type CloudHeights } from './fallout/cloud';
import { effectiveWind, type EffectiveWind, type WindLevel } from './fallout/wind';
import { wseg10, type FalloutModel } from './fallout/wseg10';
import { falloutFreeHeightM, fireballMaxRadiusM, surfaceInteraction } from './fireball';
import { initialDose, initialDoseRadiusM } from './radiation/initial';
import type { Explanation } from './sources';
import {
  burnThreshold,
  radiantExposure,
  REFERENCE_VISIBILITY_M,
  thermalPartition,
  thermalRadiusM,
  transmittance,
} from './thermal/exposure';

export type BurstMode = 'airburst' | 'surface' | 'custom';

export interface Scenario {
  /** Total yield, kilotons. */
  yieldKt: number;
  /** 'airburst': height that maximises the 5 psi radius; 'surface': 0 m; 'custom': heightM. */
  burstMode: BurstMode;
  /** Height of burst in metres, used when burstMode is 'custom'. */
  heightM: number;
  /** Fraction of the yield from fission, 0..1. */
  fissionFraction: number;
  /** Ground-level visibility, metres. */
  visibilityM: number;
  /** Wind profile; an empty list means calm. */
  wind: WindLevel[];
  /** Crosswind shear to use when the profile has a single level, (m/s)/km. */
  defaultShearMsPerKm: number;
}

export const DEFAULT_SCENARIO: Scenario = {
  yieldKt: 100,
  burstMode: 'airburst',
  heightM: 0,
  fissionFraction: 0.5,
  visibilityM: REFERENCE_VISIBILITY_M,
  wind: [{ heightM: 10, speedMs: 6.7, fromDeg: 270 }],
  defaultShearMsPerKm: 0.5,
};

/** Pressure used to pick the height of an "optimum" air burst: 5 psi, where most houses collapse. */
export const AIRBURST_TARGET_PSI = 5;

/** The largest crosswind shear passed to the fallout model; beyond it WSEG-10 widens without limit. */
const MAX_SHEAR = 1.5;

export type EffectKind = 'fireball' | 'blast' | 'thermal' | 'radiation';

export interface EffectRing {
  /** Stable identifier, also the key of the label in the translations (`effect.<id>`). */
  id: string;
  kind: EffectKind;
  /** Ground range of the ring, metres. 0 when the effect does not reach the ground. */
  radiusM: number;
  /** Uncertainty span of the radius, when the source gives one. */
  radiusLowM?: number;
  radiusHighM?: number;
  areaM2: number;
  /** The threshold that defines the ring, in the unit natural to the effect. */
  threshold: number;
  thresholdUnit: 'psi' | 'cal/cm2' | 'rad' | 'none';
  explanation: Explanation;
}

export interface FalloutResult {
  /** False when the burst is too high for significant local fallout. */
  significant: boolean;
  /** Fraction of the fallout taken to come down locally, 0..1. */
  localFraction: number;
  model: FalloutModel | null;
  cloud: CloudHeights;
  wind: EffectiveWind;
  explanation: Explanation;
}

export interface DetonationResult {
  scenario: Scenario;
  /** Height of burst actually used, metres. */
  heightM: number;
  /** Height above which local fallout is not significant, metres. */
  falloutFreeHeightM: number;
  rings: EffectRing[];
  fallout: FalloutResult;
  /** The effects as functions of ground range, for casualty estimates and per-point readouts. */
  effects: EffectsAt;
  /** Largest ground range of any ring, metres. */
  maxRadiusM: number;
  /** Wind speed behind the shock front at the 5 psi ring, m/s. */
  windAt5PsiMs: number;
}

const area = (r: number): number => Math.PI * r * r;

export function resolveBurstHeightM(scenario: Scenario): number {
  switch (scenario.burstMode) {
    case 'surface':
      return 0;
    case 'custom':
      return Math.max(scenario.heightM, 0);
    case 'airburst':
      return optimumBurstHeightM(scenario.yieldKt, AIRBURST_TARGET_PSI).heightM;
  }
}

const BLAST_RINGS: Array<{ id: string; psi: number }> = [
  { id: 'blast20', psi: 20 },
  { id: 'blast5', psi: 5 },
  { id: 'blast2', psi: 2 },
  { id: 'blast1', psi: 1 },
];

const RADIATION_RING_RAD = 450;

export function detonate(scenario: Scenario): DetonationResult {
  const W = Math.max(scenario.yieldKt, 1e-3);
  const heightM = resolveBurstHeightM(scenario);
  const visibilityM = scenario.visibilityM;
  const thermal = { yieldKt: W, burstHeightM: heightM, visibilityM };
  const radiation = { yieldKt: W, burstHeightM: heightM, fissionFraction: scenario.fissionFraction };
  const rings: EffectRing[] = [];

  // --- Fireball ------------------------------------------------------------
  const fireballR = fireballMaxRadiusM(W, heightM);
  // What matters on the map is where the fireball meets the ground.
  const fireballGround = heightM < fireballR ? Math.sqrt(fireballR * fireballR - heightM * heightM) : 0;
  rings.push({
    id: 'fireball',
    kind: 'fireball',
    radiusM: fireballGround,
    areaM2: area(fireballGround),
    threshold: 0,
    thresholdUnit: 'none',
    explanation: {
      id: 'fireball',
      formula: 'R_max ≈ 2 × R_breakaway;  R_breakaway = 110 W^0.4 ft (air burst) … 145 W^0.4 ft (contact surface burst)',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: W, quantity: 'yield' },
        { symbol: 'H', labelKey: 'burstHeight', value: heightM, quantity: 'length' },
      ],
      outputs: [
        { symbol: 'R_max', labelKey: 'fireballRadius', value: fireballR, quantity: 'length' },
        { symbol: 'r', labelKey: 'radiusOnGround', value: fireballGround, quantity: 'length' },
      ],
      sources: ['gd1977'],
      where: '§2.127, eqs. (2.127.1) and (2.127.2)',
      uncertainty: 'rough',
    },
  });

  // --- Blast ---------------------------------------------------------------
  for (const ring of BLAST_RINGS) {
    const r = overpressureRadiusM(W, ring.psi, heightM);
    rings.push({
      id: ring.id,
      kind: 'blast',
      radiusM: r,
      radiusLowM: r * 0.9,
      radiusHighM: r * 1.1,
      areaM2: area(r),
      threshold: ring.psi,
      thresholdUnit: 'psi',
      explanation: {
        id: 'blast',
        formula: 'p = f(r / W^(1/3), H / W^(1/3));  r = r₁ × W^(1/3),  H = H₁ × W^(1/3)',
        inputs: [
          { symbol: 'W', labelKey: 'yield', value: W, quantity: 'yield' },
          { symbol: 'H', labelKey: 'burstHeight', value: heightM, quantity: 'length' },
          { symbol: 'p', labelKey: 'overpressure', value: ring.psi, quantity: 'pressure' },
        ],
        outputs: [
          { symbol: 'r', labelKey: 'radiusOnGround', value: r, quantity: 'length' },
          { symbol: 'q', labelKey: 'dynamicPressure', value: dynamicPressurePsi(ring.psi), quantity: 'pressure' },
          { symbol: 'u', labelKey: 'windSpeed', value: windSpeedMs(ring.psi), quantity: 'speed' },
        ],
        sources: ['brode1986', 'gd1977'],
        where: 'Brode (1986) fit to the height-of-burst curves; Glasstone & Dolan Figs. 3.73a–c, §3.61–3.63, eqs. (3.55.1)–(3.55.3)',
        uncertainty: '±10%',
      },
    });
  }

  // --- Thermal radiation ---------------------------------------------------
  const f = thermalPartition(W, heightM);
  for (const degree of [3, 2, 1] as const) {
    const q = burnThreshold(degree, W);
    const r = thermalRadiusM(q, thermal);
    const slant = Math.hypot(r, heightM);
    rings.push({
      id: `burn${degree}`,
      kind: 'thermal',
      radiusM: r,
      areaM2: area(r),
      threshold: q,
      thresholdUnit: 'cal/cm2',
      explanation: {
        id: 'thermal',
        formula: 'Q = 10¹² f W τ / (4π D²)   [cal/cm², D in cm];  D = √(r² + H²)',
        inputs: [
          { symbol: 'W', labelKey: 'yield', value: W, quantity: 'yield' },
          { symbol: 'H', labelKey: 'burstHeight', value: heightM, quantity: 'length' },
          { symbol: 'f', labelKey: 'thermalPartition', value: f, quantity: 'fraction' },
          { symbol: 'V', labelKey: 'visibility', value: visibilityM, quantity: 'length' },
          { symbol: 'Q', labelKey: 'radiantExposure', value: q, quantity: 'energyDensity' },
        ],
        outputs: [
          { symbol: 'r', labelKey: 'radiusOnGround', value: r, quantity: 'length' },
          { symbol: 'D', labelKey: 'slantRange', value: slant, quantity: 'length' },
          { symbol: 'τ', labelKey: 'transmittance', value: transmittance(slant, heightM, visibilityM), quantity: 'fraction' },
        ],
        sources: ['gd1977'],
        where: 'eq. (7.96.2); Tables 7.88 and 7.101 (f); Fig. 7.98 (τ, two-layer fit); Fig. 12.65 (burn thresholds)',
        uncertainty: '±25%',
      },
    });
  }

  // --- Initial radiation ---------------------------------------------------
  const radR = initialDoseRadiusM(RADIATION_RING_RAD, radiation);
  const radMid = 0.5 * (radR.low + radR.high);
  rings.push({
    id: 'radiation450',
    kind: 'radiation',
    radiusM: radMid,
    radiusLowM: radR.low,
    radiusHighM: radR.high,
    areaM2: area(radMid),
    threshold: RADIATION_RING_RAD,
    thresholdUnit: 'rad',
    explanation: {
      id: 'radiation',
      formula: 'D = W·n(D_s) + W·γ₂(D_s) + W_eff·F·γ_fp(D_s);  D_s = √(r² + H²)',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: W, quantity: 'yield' },
        { symbol: 'H', labelKey: 'burstHeight', value: heightM, quantity: 'length' },
        { symbol: 'F', labelKey: 'fissionFraction', value: scenario.fissionFraction, quantity: 'fraction' },
        { symbol: 'D', labelKey: 'dose', value: RADIATION_RING_RAD, quantity: 'dose' },
      ],
      outputs: [
        { symbol: 'r_min', labelKey: 'radiusLow', value: radR.low, quantity: 'length' },
        { symbol: 'r_max', labelKey: 'radiusHigh', value: radR.high, quantity: 'length' },
      ],
      sources: ['gd1977', 'glasstoneLib'],
      where: 'Figs. 8.123a–b (neutrons), 8.127a–b (secondary gamma rays), 8.130a–b and 8.132 (fission product gamma rays)',
      uncertainty: '×0.5–2',
    },
  });

  // --- Fallout -------------------------------------------------------------
  const cloud = stabilisedCloud(W);
  const profile = scenario.wind.length > 0 ? scenario.wind : [{ heightM: 10, speedMs: 0, fromDeg: 0 }];
  const wind = effectiveWind(profile, cloud);
  const shear = Math.min(profile.length > 1 ? wind.shearMsPerKm : scenario.defaultShearMsPerKm, MAX_SHEAR);
  const freeHeight = falloutFreeHeightM(W);
  const localFraction = 1 - surfaceInteraction(W, heightM);
  const significant = localFraction > 0 && scenario.fissionFraction > 0;
  const model = significant
    ? wseg10({
        yieldKt: W,
        fissionFraction: scenario.fissionFraction,
        windSpeedMs: wind.speedMs,
        shearMsPerKm: shear,
        localFraction,
      })
    : null;
  const fallout: FalloutResult = {
    significant,
    localFraction,
    model,
    cloud,
    wind: { ...wind, shearMsPerKm: shear },
    explanation: {
      id: 'fallout',
      formula: 'Ḋ(x, y) = K · W · F · φ(x) · g(x) · exp(−y² / 2(α₂σ_y)²) / (√(2π) σ_y);  g(x) = exp(−(|x|/L)ⁿ) / (L · Γ(1 + 1/n))',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: W, quantity: 'yield' },
        { symbol: 'F', labelKey: 'fissionFraction', value: scenario.fissionFraction, quantity: 'fraction' },
        { symbol: 'H', labelKey: 'burstHeight', value: heightM, quantity: 'length' },
        { symbol: 'H_f', labelKey: 'falloutFreeHeight', value: freeHeight, quantity: 'length' },
        { symbol: 'v', labelKey: 'effectiveWindSpeed', value: wind.speedMs, quantity: 'speed' },
        { symbol: 'θ', labelKey: 'effectiveWindFrom', value: wind.fromDeg, quantity: 'angle' },
      ],
      outputs: [
        { symbol: 'z_top', labelKey: 'cloudTop', value: cloud.topM, quantity: 'length' },
        { symbol: 'z_base', labelKey: 'cloudBottom', value: cloud.bottomM, quantity: 'length' },
        { symbol: 'k', labelKey: 'localFraction', value: localFraction, quantity: 'fraction' },
      ],
      sources: ['hanifen1980', 'gd1977'],
      where: 'WSEG-10, Hanifen (1980) eqs. (1)–(27); Glasstone & Dolan eq. (2.128.1), Fig. 9.96, §9.84, eqs. (9.147.1) and (9.150.1)',
      uncertainty: '×0.5–2',
    },
  };

  // --- Effects as functions of ground range ---------------------------------
  const effects: EffectsAt = {
    overpressurePsi: (r) => peakOverpressurePsi(W, r, heightM),
    radiantExposure: (r) => radiantExposure(r, thermal),
    initialDose: (r, high) => {
      const d = initialDose(Math.hypot(r, heightM), radiation);
      return high ? d.high.total : d.low.total;
    },
    secondDegreeBurn: burnThreshold(2, W),
    thirdDegreeBurn: burnThreshold(3, W),
  };

  const maxRadiusM = rings.reduce((m, ring) => Math.max(m, ring.radiusHighM ?? ring.radiusM), 0);

  return {
    scenario,
    heightM,
    falloutFreeHeightM: freeHeight,
    rings,
    fallout,
    effects,
    maxRadiusM,
    windAt5PsiMs: windSpeedMs(5),
  };
}

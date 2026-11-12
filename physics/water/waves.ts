// Surface water waves from a nuclear explosion in or on water.
//
// Height with distance: Glasstone & Dolan 1977, §6.119 (deep water, equation 6.119.1)
// and §6.121 (shallow water). Length and period of the peak wave: §6.119.
// Speed of the wave train: linear wave theory (USACE Coastal Engineering Manual,
// EM 1110-2-1100, Part II, Chapter 1), with the period of the peak wave.
// Growth as the wave runs into shallower water and the depth at which it breaks:
// Green's law and the breaking limit H ≈ 0.78 d of the same manual (Part II, Chapter 4).
//
// The published relations are in feet and kilotons; this module converts at its edge.
// The honest picture (§6.54, §6.120): the waves are short compared with a tsunami from
// an earthquake, they lose much of their energy breaking near the burst and again
// on the continental shelf, far from the coast they are modest.

import type { Explanation } from '../sources';
import { ftToM, mToFt } from '../units';

const G = 9.80665;

/** Depth of water relative to the yield: which of Glasstone's relations applies. */
export type WaterRegime = 'shallow' | 'transition' | 'deep';

/** Depths in feet that bound the two relations, for a yield in kilotons (§6.119, §6.121). */
export function regimeBoundsFt(yieldKt: number): { shallowMaxFt: number; deepMinFt: number; deepMaxFt: number } {
  const w4 = Math.pow(yieldKt, 0.25);
  return { shallowMaxFt: 100 * w4, deepMinFt: 256 * w4, deepMaxFt: 850 * w4 };
}

export function waterRegime(yieldKt: number, depthM: number): WaterRegime {
  const d = mToFt(depthM);
  const b = regimeBoundsFt(yieldKt);
  if (d <= b.shallowMaxFt) return 'shallow';
  if (d >= b.deepMinFt) return 'deep';
  return 'transition';
}

/**
 * The constant K of H = K / R (H and R in feet) for a yield and water depth.
 * Shallow: K = 150 d W^0.25 (§6.121). Deep: K = 40,500 W^0.54 (equation 6.119.1).
 * Between the two ranges the constant is interpolated on the logarithm of the depth.
 */
export function heightConstantFt2(yieldKt: number, depthM: number): number {
  const d = mToFt(depthM);
  const b = regimeBoundsFt(yieldKt);
  const shallow = (depthFt: number): number => 150 * depthFt * Math.pow(yieldKt, 0.25);
  const deep = 40_500 * Math.pow(yieldKt, 0.54);
  if (d <= b.shallowMaxFt) return shallow(d);
  if (d >= b.deepMinFt) return deep;
  const f = Math.log(d / b.shallowMaxFt) / Math.log(b.deepMinFt / b.shallowMaxFt);
  const lo = Math.log(shallow(b.shallowMaxFt));
  return Math.exp(lo + f * (Math.log(deep) - lo));
}

/** Period of the peak wave, seconds: T ≈ 14.1 W^0.144 (§6.119). */
export function peakWavePeriodS(yieldKt: number): number {
  return 14.1 * Math.pow(yieldKt, 0.144);
}

/** Length of the peak wave in deep water, metres: L ≈ 1010 W^0.288 feet (§6.119). */
export function peakWaveLengthM(yieldKt: number): number {
  return ftToM(1010 * Math.pow(yieldKt, 0.288));
}

/** Wave number k (1/m) of a wave of period T in water of depth d: ω² = g k tanh(k d). */
export function waveNumber(periodS: number, depthM: number): number {
  const omega = (2 * Math.PI) / periodS;
  const d = Math.max(depthM, 0.01);
  // Start from the deep-water value, or the shallow one if that is larger, then Newton.
  let k = Math.max((omega * omega) / G, omega / Math.sqrt(G * d));
  for (let i = 0; i < 40; i++) {
    const th = Math.tanh(k * d);
    const f = G * k * th - omega * omega;
    const df = G * th + G * k * d * (1 - th * th);
    const step = f / df;
    k -= step;
    if (Math.abs(step) < 1e-12 * k) break;
  }
  return k;
}

/** Group speed (the speed of the wave train and its energy), m/s. */
export function groupSpeed(periodS: number, depthM: number): number {
  const k = waveNumber(periodS, depthM);
  const kd = k * Math.max(depthM, 0.01);
  const c = (2 * Math.PI) / periodS / k;
  const n = kd > 20 ? 0.5 : 0.5 * (1 + (2 * kd) / Math.sinh(2 * kd));
  return n * c;
}

/** Height at which a wave breaks in water of a given depth: H ≈ 0.78 d. */
export const BREAKING_INDEX = 0.78;
/** The steepest a wave can be before it breaks in deep water: H / L ≈ 1/7. */
export const MAX_STEEPNESS = 1 / 7;

export interface WaveConditions {
  yieldKt: number;
  /** Depth of the water at surface zero, metres. */
  depthM: number;
}

/**
 * Highest wave (crest to trough) at a distance from surface zero, metres,
 * over water of the same depth as at surface zero. Capped where a wave cannot stand:
 * by the depth in shallow water and by the steepness limit in deep water.
 */
export function waveHeightM(conditions: WaveConditions, rangeM: number): number {
  const { yieldKt, depthM } = conditions;
  if (!(yieldKt > 0) || !(depthM > 0) || !(rangeM > 0)) return 0;
  const h = ftToM(heightConstantFt2(yieldKt, depthM) / mToFt(rangeM));
  const k = waveNumber(peakWavePeriodS(yieldKt), depthM);
  const length = (2 * Math.PI) / k;
  return Math.min(h, BREAKING_INDEX * depthM, MAX_STEEPNESS * length);
}

/** Distance at which the highest wave has fallen to a given height, metres. */
export function rangeForWaveHeight(conditions: WaveConditions, heightM: number): number {
  const { yieldKt, depthM } = conditions;
  if (!(yieldKt > 0) || !(depthM > 0) || !(heightM > 0)) return 0;
  return ftToM(heightConstantFt2(yieldKt, depthM) / mToFt(heightM));
}

/**
 * Time for the first waves to reach a distance over water of constant depth, seconds.
 * No surface gravity wave runs faster than the long-wave speed √(g d), and the leading
 * waves of the train travel close to it.
 */
export function waveArrivalS(conditions: WaveConditions, rangeM: number): number {
  return rangeM / Math.sqrt(G * Math.max(conditions.depthM, 0.01));
}

/** Time for the peak wave (period T of §6.119) to reach a distance, seconds: R / c_g. */
export function peakWaveArrivalS(conditions: WaveConditions, rangeM: number): number {
  return rangeM / groupSpeed(peakWavePeriodS(conditions.yieldKt), conditions.depthM);
}

/**
 * Height of a wave after it has run from depth d0 into depth d1 (Green's law,
 * H1 = H0 (d0/d1)^(1/4)), and whether it has broken on the way.
 */
export function shoal(heightM: number, fromDepthM: number, toDepthM: number): { heightM: number; broken: boolean } {
  if (!(heightM > 0) || !(toDepthM > 0) || toDepthM >= fromDepthM) return { heightM: Math.max(0, heightM), broken: false };
  const grown = heightM * Math.pow(fromDepthM / toDepthM, 0.25);
  const limit = BREAKING_INDEX * toDepthM;
  return grown > limit ? { heightM: limit, broken: true } : { heightM: grown, broken: false };
}

/**
 * Height of the breaking wave at the shore for a wave of height H in water of depth d:
 * the depth where the shoaling wave reaches H = 0.78 d. Taken as a rough upper estimate
 * of how high the water runs up the beach; flat shores and wide shelves give less.
 */
export function breakerHeightM(heightM: number, depthM: number): number {
  if (!(heightM > 0) || !(depthM > 0)) return 0;
  if (heightM >= BREAKING_INDEX * depthM) return heightM;
  // H (d0/db)^(1/4) = 0.78 db  →  db = (H d0^(1/4) / 0.78)^(4/5)
  const db = Math.pow((heightM * Math.pow(depthM, 0.25)) / BREAKING_INDEX, 0.8);
  return BREAKING_INDEX * db;
}

export interface WaveSummary {
  regime: WaterRegime;
  periodS: number;
  /** Length of the peak wave at the depth of surface zero, metres. */
  lengthM: number;
  /** Speed of the first waves (long-wave speed) at the depth of surface zero, m/s. */
  speedMs: number;
  /** Speed of the peak wave (group speed) at the depth of surface zero, m/s. */
  peakSpeedMs: number;
  /** Distance to waves of 10 m, 3 m and 1 m crest to trough, metres. */
  rangeTo10mM: number;
  rangeTo3mM: number;
  rangeTo1mM: number;
}

export function waveSummary(conditions: WaveConditions): WaveSummary {
  const periodS = peakWavePeriodS(conditions.yieldKt);
  const k = waveNumber(periodS, conditions.depthM);
  return {
    regime: waterRegime(conditions.yieldKt, conditions.depthM),
    periodS,
    lengthM: (2 * Math.PI) / k,
    speedMs: Math.sqrt(G * Math.max(conditions.depthM, 0.01)),
    peakSpeedMs: groupSpeed(periodS, conditions.depthM),
    rangeTo10mM: rangeForWaveHeight(conditions, 10),
    rangeTo3mM: rangeForWaveHeight(conditions, 3),
    rangeTo1mM: rangeForWaveHeight(conditions, 1),
  };
}

export function explainWaves(conditions: WaveConditions, rangeM: number): Explanation[] {
  const summary = waveSummary(conditions);
  const regime = summary.regime;
  return [
    {
      id: 'water.height',
      formula: regime === 'shallow' ? 'H ≈ 150 d W^0.25 / R  (feet)' : regime === 'deep' ? 'H ≈ 40,500 W^0.54 / R  (feet)' : 'between 150 d W^0.25 / R and 40,500 W^0.54 / R',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: conditions.yieldKt, quantity: 'yield' },
        { symbol: 'd', labelKey: 'waterDepth', value: conditions.depthM, quantity: 'height' },
        { symbol: 'R', labelKey: 'distance', value: rangeM, quantity: 'length' },
      ],
      outputs: [{ symbol: 'H', labelKey: 'waveHeight', value: waveHeightM(conditions, rangeM), quantity: 'height' }],
      sources: ['gd1977'],
      where: regime === 'shallow' ? '§6.121' : regime === 'deep' ? '§6.119, equation 6.119.1' : '§6.119 and §6.121, interpolated',
      uncertainty: regime === 'deep' ? '±35 % (§6.119)' : 'about a factor of 2 (Bikini BAKER, Table 6.57)',
    },
    {
      id: 'water.speed',
      formula: 'first waves: c = √(g d);  peak wave: T ≈ 14.1 W^0.144 s, ω² = g k tanh(k d), c_g = (ω/k) · ½ (1 + 2kd / sinh 2kd)',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: conditions.yieldKt, quantity: 'yield' },
        { symbol: 'd', labelKey: 'waterDepth', value: conditions.depthM, quantity: 'height' },
      ],
      outputs: [
        { symbol: 'T', labelKey: 'wavePeriod', value: summary.periodS / 3600, quantity: 'time' },
        { symbol: 'c', labelKey: 'waveSpeed', value: summary.speedMs, quantity: 'speed' },
        { symbol: 'c_g', labelKey: 'peakWaveSpeed', value: summary.peakSpeedMs, quantity: 'speed' },
      ],
      sources: ['gd1977', 'cem2002'],
      where: 'Glasstone §6.119; Coastal Engineering Manual Part II, Chapter 1',
    },
    {
      id: 'water.shore',
      formula: 'H₁ = H₀ (d₀/d₁)^¼  until  H = 0.78 d',
      inputs: [],
      outputs: [],
      sources: ['cem2002'],
      where: 'Coastal Engineering Manual Part II, Chapter 4 (Green’s law, depth-limited breaking)',
      uncertainty: 'rough upper estimate; wide shelves and flat shores take much of the energy (Glasstone §6.120)',
    },
  ];
}

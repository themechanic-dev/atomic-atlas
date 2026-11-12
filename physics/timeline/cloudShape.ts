// The shape of the mushroom cloud as it grows, for drawing it in 3D over the city:
// how high its top is, how wide and thick its head, how wide its stem, and its colour.
//
// Sources: Glasstone & Dolan (1977)
//   - height of the top in time: Table 2.12 (1-megaton air burst), as a share of the final height
//   - final top and base of the head: Fig. 9.96 (the same heights as the fallout model)
//   - final radius of the head, about 10 minutes after the burst: Fig. 2.16; the cloud
//     "attains its maximum height after about 10 minutes" and "continues to grow laterally" (§2.15)
//   - radius in time: Fig. 10.158c (1 megaton, lowest burst), read from the figure and taken
//     as a share of its radius at 10 minutes, so that it ends at the radius of Fig. 2.16;
//     times scaled with the cube root of the yield below 1 Mt (§10.158)
//   - stem radius: §2.17 (about half the cloud radius below 20 kt, a fifth to a tenth for megatons)
//   - colour: the fireball stops giving visible light after about a minute for 1 Mt (§2.05);
//     the cloud is "red or reddish brown" at first and turns white as it cools (§2.08)
// As the source says, these are rough averages: real clouds vary with the weather.
// Where the source gives the timing only for 1 megaton, the same timing is used for every yield,
// as the cloud rise already does. The smooth outline joining these sizes is a drawing aid.

import { stabilisedCloud, stabilisedCloudRadiusM, stemRadiusShare } from '../fallout/cloud';
import { interp } from '../units';
import { cloudRiseFraction, type HeatPulse } from './events';

/** The cloud has its stabilised size about 10 minutes after the burst (§2.15, Fig. 2.16). */
export const CLOUD_STABLE_S = 600;

// Fig. 10.158c, lowest curve: radius of the cloud against time, as a share of the radius
// at 10 minutes (read: 1 s 0.45 mi, 10 s 0.95, 30 s 1.2, 1 min 1.75, 2 min 2.9, 5 min 6.0,
// 15 min 9.8; 10 minutes about 8.2 mi between the 5 and 15 minute marks).
const SPREAD_S = [0, 1, 10, 30, 60, 120, 300, 600];
const SPREAD_SHARE = [0, 0.055, 0.115, 0.145, 0.21, 0.35, 0.73, 1];

/**
 * Share of its stabilised radius that the head of the cloud has reached at a time. The curve
 * is for 1 megaton; §10.158 says times may be scaled with the cube root of the yield between
 * the yields of the figures, so a smaller cloud spreads sooner. Above 1 Mt the 1 Mt timing is
 * kept, so every cloud has its Fig. 2.16 radius by about 10 minutes.
 */
export function cloudSpreadShare(timeS: number, yieldKt = 1000): number {
  const faster = Math.max(1, Math.cbrt(1000 / Math.max(yieldKt, 1e-3)));
  return interp(Math.max(0, timeS) * faster, SPREAD_S, SPREAD_SHARE);
}

export interface CloudShape {
  /** Height of the top of the cloud above the ground, metres. */
  topM: number;
  /** Height of the base of the head; can be below 0 early on, when the fireball still touches the ground. */
  headBottomM: number;
  /** Radius of the head, metres. */
  headRadiusM: number;
  /** Share of the head's thickness that lies below its widest part (0.5 for a ball, less as it flattens). */
  headLowerShare: number;
  /** Radius of the stem, metres; 0 when no stem is drawn. */
  stemRadiusM: number;
  /** How much visible light the fireball still gives, 0 to 1. */
  glow: number;
  /** How red-brown the cloud is, 0 (white) to 1. */
  brown: number;
}

export interface CloudGrowth {
  /** The cloud at a time after the burst, given the radius the fireball has then. */
  at(timeS: number, fireballM: number): CloudShape;
  /** The cloud once it has stabilised. */
  stabilised: { topM: number; bottomM: number; radiusM: number; stemRadiusM: number };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export function cloudGrowth(yieldKt: number, burstHeightM: number, heat: HeatPulse, fireballMaxM: number): CloudGrowth {
  const heights = stabilisedCloud(yieldKt);
  const radiusM = stabilisedCloudRadiusM(yieldKt);
  const stemShare = stemRadiusShare(yieldKt);
  // Thickness of the head against its radius once stabilised: below 2 the head is wider
  // than tall, as for megaton clouds; small clouds stay round (§2.17).
  const finalAspect = Math.max(0.3, (heights.topM - heights.bottomM) / radiusM);
  // The fireball rises from where it formed; what is left of the rise is shared out by Table 2.12.
  const start = burstHeightM + fireballMaxM;
  const climb = Math.max(0, heights.topM - start);
  // No mushroom stem under a burst high above the cloud base: no dust is drawn up to it.
  const hasStem = burstHeightM < heights.bottomM;
  // §2.05: for 1 Mt the fireball gives visible light for about a minute, about seven times the
  // time by which most of the heat is out (8.7 s); the same multiple is used for every yield.
  const glowEndS = 7 * heat.mostEmittedS;

  return {
    stabilised: { topM: heights.topM, bottomM: heights.bottomM, radiusM, stemRadiusM: hasStem ? stemShare * radiusM : 0 },
    at(timeS, fireballM) {
      const t = Math.max(0, timeS);
      const spread = cloudSpreadShare(t, yieldKt);
      const headRadiusM = Math.max(fireballM, radiusM * spread);
      // Early the head is the fireball, a ball; it takes the stabilised proportions as it spreads.
      const aspect = 2 + (finalAspect - 2) * clamp01(spread);
      const rise = cloudRiseFraction(t);
      const topM = burstHeightM + fireballM + climb * rise;
      // The base of the head rises with the top, to the base of Fig. 9.96: a large cloud that
      // spreads early does so as a flat head on its stem, not as a ball down to the ground.
      // The fireball itself is never squashed.
      const thickness = Math.max(0.2 * headRadiusM, Math.min(headRadiusM * aspect, Math.max(2 * fireballM, topM - heights.bottomM * rise)));
      // The stem is the dust drawn up by the afterwinds (§2.09): it grows in over the first
      // twenty seconds after the heat pulse, and widens with the head.
      const stemIn = smooth((t - heat.mostEmittedS) / 20);
      const glow = t <= heat.mostEmittedS ? 1 : 1 - smooth((t - heat.mostEmittedS) / Math.max(glowEndS - heat.mostEmittedS, 1e-6));
      const brown = 1 - smooth((t - glowEndS) / (2 * glowEndS));
      return {
        topM,
        headBottomM: topM - thickness,
        headRadiusM,
        headLowerShare: 0.5 - 0.14 * clamp01(spread),
        stemRadiusM: hasStem ? stemShare * headRadiusM * stemIn : 0,
        glow,
        brown,
      };
    },
  };
}

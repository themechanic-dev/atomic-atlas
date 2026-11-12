// The course of one detonation in time, ready to be played back: where the blast front
// is, how large the fireball has grown, how far the heat pulse and the cloud have got.
// Built once per result; reading it at a time is cheap.

import type { DetonationResult } from '../detonation';
import { shockSpeedMs } from '../blast/shock';
import type { Explanation } from '../sources';
import { CLOUD_RISE_S, freeAirOverpressurePsi, heatPulse, type HeatPulse } from './events';
import { CLOUD_STABLE_S, cloudGrowth, type CloudGrowth, type CloudShape } from './cloudShape';

export interface ArrivalCurve {
  /** Time at which the blast front reaches a ground range, seconds. */
  timeAtS(groundRangeM: number): number;
  /** Ground range the blast front has reached at a time, metres. 0 before it reaches the ground. */
  rangeAtM(timeS: number): number;
}

/**
 * Travel time of the blast front against distance from the burst, worked out once along
 * the slant range and then read for any point on the ground.
 */
export function arrivalCurve(yieldKt: number, burstHeightM: number, maxGroundRangeM: number): ArrivalCurve {
  const maxSlant = Math.hypot(Math.max(maxGroundRangeM, 1), burstHeightM) * 1.05;
  const steps = 360;
  const start = Math.min(1, maxSlant);
  const distances: number[] = [0, start];
  const times: number[] = [0, start / shockSpeedMs(freeAirOverpressurePsi(yieldKt, start))];
  for (let i = 0; i < steps; i++) {
    const a = start * Math.pow(maxSlant / start, i / steps);
    const b = start * Math.pow(maxSlant / start, (i + 1) / steps);
    const dt = (b - a) / shockSpeedMs(freeAirOverpressurePsi(yieldKt, Math.sqrt(a * b)));
    distances.push(b);
    times.push(times[times.length - 1]! + dt);
  }
  const read = (x: number, xs: number[], ys: number[]): number => {
    if (x <= xs[0]!) return ys[0]!;
    const last = xs.length - 1;
    if (x >= xs[last]!) {
      // Beyond the table the front moves on at its last speed.
      const slope = (ys[last]! - ys[last - 1]!) / (xs[last]! - xs[last - 1]!);
      return ys[last]! + (x - xs[last]!) * slope;
    }
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid;
      else hi = mid;
    }
    return ys[lo]! + ((x - xs[lo]!) / (xs[hi]! - xs[lo]!)) * (ys[hi]! - ys[lo]!);
  };
  return {
    timeAtS: (groundRangeM) => read(Math.hypot(Math.max(groundRangeM, 0), burstHeightM), distances, times),
    rangeAtM: (timeS) => {
      const slant = read(timeS, times, distances);
      return slant <= burstHeightM ? 0 : Math.sqrt(slant * slant - burstHeightM * burstHeightM);
    },
  };
}

/**
 * Radius of the fireball as it grows to its largest size at the peak of the heat pulse.
 * The shape of the growth (radius as time to the power 0.4) is a drawing aid; the largest
 * radius and the time are from the models.
 */
export function fireballRadiusAtM(maxRadiusM: number, pulse: HeatPulse, timeS: number): number {
  if (!(timeS > 0) || !(maxRadiusM > 0)) return 0;
  return maxRadiusM * Math.min(1, Math.pow(timeS / pulse.peakS, 0.4));
}

export interface TimelineEvent {
  /** `heatPeak`, `heatMost`, `cloudTop`, `cloudStable`, or the id of a blast ring. */
  id: string;
  timeS: number;
}

export interface BlastTimeline {
  arrival: ArrivalCurve;
  heat: HeatPulse;
  fireballMaxM: number;
  /** Events in the order they happen. */
  events: TimelineEvent[];
  /** Time by which every blast ring has been reached, seconds. */
  blastEndS: number;
  /** Length of the playback: until the cloud has its stabilised size, seconds. */
  durationS: number;
  cloudTopM(timeS: number): number;
  /** The mushroom cloud at a time, for drawing it. */
  cloudAt(timeS: number): CloudShape;
  /** The cloud once stabilised, about 10 minutes after the burst. */
  cloudFinal: CloudGrowth['stabilised'];
  explanation: Explanation;
}

export function blastTimeline(result: DetonationResult): BlastTimeline {
  const yieldKt = result.scenario.yieldKt;
  const blastRings = result.rings.filter((ring) => ring.kind === 'blast' && ring.radiusM > 0);
  const furthest = blastRings.reduce((max, ring) => Math.max(max, ring.radiusM), 0);
  const arrival = arrivalCurve(yieldKt, result.heightM, Math.max(furthest, 100));
  const heat = heatPulse(yieldKt);
  const events: TimelineEvent[] = [
    { id: 'heatPeak', timeS: heat.peakS },
    { id: 'heatMost', timeS: heat.mostEmittedS },
    ...blastRings.map((ring) => ({ id: ring.id, timeS: arrival.timeAtS(ring.radiusM) })),
    { id: 'cloudTop', timeS: CLOUD_RISE_S },
    { id: 'cloudStable', timeS: CLOUD_STABLE_S },
  ].sort((a, b) => a.timeS - b.timeS);
  const blastEndS = blastRings.reduce((max, ring) => Math.max(max, arrival.timeAtS(ring.radiusM)), 0);
  const shown = blastRings.find((ring) => ring.id === 'blast5') ?? blastRings[0];
  const fireballMaxM = result.rings.find((ring) => ring.id === 'fireball')?.radiusM || 0;
  const cloud = cloudGrowth(yieldKt, result.heightM, heat, fireballMaxM);
  const cloudAt = (timeS: number): CloudShape => cloud.at(timeS, fireballRadiusAtM(fireballMaxM, heat, timeS));
  return {
    arrival,
    heat,
    fireballMaxM,
    events,
    blastEndS,
    durationS: Math.max(CLOUD_STABLE_S, blastEndS) + 5,
    cloudTopM: (timeS) => cloudAt(timeS).topM,
    cloudAt,
    cloudFinal: cloud.stabilised,
    explanation: {
      id: 'arrival',
      formula:
        'U = c₀ √(1 + 6 p / 7 P₀);  D = √(d² + h²);  t = ∫₀ᴰ dr / U(p(r));  t_max = 0.0417 W^0.44 s;  ' +
        'H(t) = h + R_fb + (H_top − h − R_fb) f(t);  R(t) = max(R_fb, R_cloud s(t));  r_stem = k(W) R(t)',
      inputs: [
        { symbol: 'W', labelKey: 'yield', value: yieldKt, quantity: 'yield' },
        { symbol: 'h', labelKey: 'burstHeight', value: result.heightM, quantity: 'height' },
        { symbol: 'd', labelKey: 'radiusOnGround', value: shown?.radiusM ?? 0, quantity: 'length' },
      ],
      outputs: [
        { symbol: 't', labelKey: 'blastArrival', value: (shown ? arrival.timeAtS(shown.radiusM) : 0) / 3600, quantity: 'time' },
        { symbol: 't_max', labelKey: 'heatPeak', value: heat.peakS / 3600, quantity: 'time' },
        { symbol: 'H_top', labelKey: 'cloudTop', value: cloud.stabilised.topM, quantity: 'height' },
        { symbol: 'H_base', labelKey: 'cloudBottom', value: cloud.stabilised.bottomM, quantity: 'height' },
        { symbol: 'R_cloud', labelKey: 'cloudRadius', value: cloud.stabilised.radiusM, quantity: 'length' },
        { symbol: 'r_stem', labelKey: 'stemRadius', value: cloud.stabilised.stemRadiusM, quantity: 'length' },
      ],
      sources: ['gd1977'],
      where:
        'Glasstone & Dolan (1977) eq. 3.55.2, Figs. 3.77a-b, §3.14, §7.85-7.86; cloud: Table 2.12, Figs. 2.16, 9.96, 10.158c, §2.05, §2.08, §2.15-2.17',
      uncertainty: '±15%',
    },
  };
}

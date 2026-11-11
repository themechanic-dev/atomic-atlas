// From a wind profile (wind at several heights) to the single "effective wind"
// that a fallout pattern follows, plus the crosswind shear across the cloud.
//
// Effective wind: Glasstone & Dolan (1977) §9.84. "The effective wind ...
// should be obtained by first determining the average wind from the ground to
// the base and to the top of the stabilized cloud. The effective wind is then
// the mean of these two average winds."

import type { CloudHeights } from './cloud';

export interface WindLevel {
  /** Height above ground, metres. */
  heightM: number;
  /** Wind speed, m/s. */
  speedMs: number;
  /** Direction the wind blows FROM, degrees clockwise from north (meteorological convention). */
  fromDeg: number;
}

export interface EffectiveWind {
  speedMs: number;
  /** Direction the wind blows FROM, degrees. */
  fromDeg: number;
  /** Direction the fallout travels TOWARDS, degrees clockwise from north. */
  towardsDeg: number;
  /** Crosswind component of the shear between cloud bottom and cloud top, (m/s) per km. */
  shearMsPerKm: number;
}

interface Vec {
  e: number; // eastward component of the air motion
  n: number; // northward component
}

const D2R = Math.PI / 180;

function toVector(level: WindLevel): Vec {
  // "from 270" means the air moves towards 90 (east).
  const towards = (level.fromDeg + 180) * D2R;
  return { e: level.speedMs * Math.sin(towards), n: level.speedMs * Math.cos(towards) };
}

/** Wind vector at a height: linear between levels, constant below the lowest and above the highest. */
function vectorAt(levels: WindLevel[], heightM: number): Vec {
  const first = levels[0]!;
  const last = levels[levels.length - 1]!;
  if (heightM <= first.heightM) return toVector(first);
  if (heightM >= last.heightM) return toVector(last);
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1]!;
    const b = levels[i]!;
    if (heightM <= b.heightM) {
      const t = (heightM - a.heightM) / (b.heightM - a.heightM);
      const va = toVector(a);
      const vb = toVector(b);
      return { e: va.e + t * (vb.e - va.e), n: va.n + t * (vb.n - va.n) };
    }
  }
  return toVector(last);
}

/** Mean wind vector from the ground up to a height (numerical average of the profile). */
function meanTo(levels: WindLevel[], heightM: number): Vec {
  const steps = 200;
  let e = 0;
  let n = 0;
  for (let i = 0; i < steps; i++) {
    const v = vectorAt(levels, ((i + 0.5) / steps) * heightM);
    e += v.e;
    n += v.n;
  }
  return { e: e / steps, n: n / steps };
}

/** A calm, featureless profile for when no wind is given. */
export function uniformWind(speedMs: number, fromDeg: number): WindLevel[] {
  return [{ heightM: 10, speedMs, fromDeg }];
}

export function effectiveWind(profile: WindLevel[], cloud: CloudHeights): EffectiveWind {
  const levels = [...profile].sort((a, b) => a.heightM - b.heightM);
  if (levels.length === 0) return { speedMs: 0, fromDeg: 0, towardsDeg: 180, shearMsPerKm: 0 };

  const toBase = meanTo(levels, cloud.bottomM);
  const toTop = meanTo(levels, cloud.topM);
  const e = 0.5 * (toBase.e + toTop.e);
  const n = 0.5 * (toBase.n + toTop.n);
  const speedMs = Math.hypot(e, n);
  const towardsDeg = speedMs > 1e-9 ? ((Math.atan2(e, n) / D2R) % 360 + 360) % 360 : 180;
  const fromDeg = (towardsDeg + 180) % 360;

  // Shear: change of the wind across the cloud, per kilometre of height, perpendicular to the effective wind.
  const bottom = vectorAt(levels, cloud.bottomM);
  const top = vectorAt(levels, cloud.topM);
  const dz = Math.max(cloud.topM - cloud.bottomM, 1) / 1000;
  const de = (top.e - bottom.e) / dz;
  const dn = (top.n - bottom.n) / dz;
  const ux = speedMs > 1e-9 ? e / speedMs : 0;
  const uy = speedMs > 1e-9 ? n / speedMs : 1;
  const cross = Math.abs(de * uy - dn * ux);

  return { speedMs, fromDeg, towardsDeg, shearMsPerKm: cross };
}

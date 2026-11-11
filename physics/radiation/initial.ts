// Initial nuclear radiation: the dose delivered within the first minute, as a
// function of slant range.
//
// Source: Glasstone & Dolan (1977) §8.122-8.133. The total is the sum of three
// parts, each read from a chart in the book:
//   neutrons                 Fig. 8.123a (fission) / 8.123b (thermonuclear)
//   secondary gamma rays     Fig. 8.127a (fission) / 8.127b (thermonuclear)
//   fission product gammas   Fig. 8.130a, times an "effective yield" that
//                            accounts for the thin air behind the blast wave:
//                            Fig. 8.130b (low air burst), Fig. 8.132 (surface)
// The charts are for 0.9 of sea-level air density and give rad (tissue).
//
// For fission weapons the book prints two curves: "offense" (low) and "defense"
// (high). They bracket differences in weapon design, so this module returns
// both and the UI shows the span between them.
//
// Scaling rules (same paragraphs): neutron and secondary gamma doses are
// proportional to yield; a contact surface burst gives half, with linear
// interpolation up to 300 ft.

import curves from './gd-initial-radiation.json';
import { FT, interp, interpExtrapolate, mToYd } from '../units';
import { falloutFreeHeightM } from '../fireball';

type CurveKey =
  | 'ffgamma'
  | 'fissionsecondarygammaoffense'
  | 'fissionsecondarygammadefense'
  | 'fissionneutronoffense'
  | 'fissionneutrondefense'
  | 'thermonuclearneutron'
  | 'thermonuclearsecondarygamma';

interface Curve {
  x: number[];
  y: number[];
}

/** Sorts a digitised curve by range and removes points that double back. */
function clean(xs: readonly number[], ys: readonly number[]): Curve {
  const points = xs.map((x, i) => [x, ys[i]!] as const).sort((a, b) => a[0] - b[0]);
  const x: number[] = [];
  const y: number[] = [];
  for (const [px, py] of points) {
    if (x.length > 0 && px - x[x.length - 1]! < 1e-9) continue;
    x.push(px);
    y.push(py);
  }
  return { x, y };
}

const PER_KT = Object.fromEntries(
  Object.entries(curves.perKiloton).map(([key, c]) => [key, clean(c.slantRangeYd, c.log10RadPerKt)]),
) as Record<CurveKey, Curve>;

function effectiveYieldTable(table: Record<string, { log10YieldKt: number[]; log10EffectiveKt: number[] }>): Array<{
  rangeYd: number;
  curve: Curve;
}> {
  return Object.entries(table)
    .map(([range, c]) => ({ rangeYd: Number(range), curve: clean(c.log10YieldKt, c.log10EffectiveKt) }))
    .sort((a, b) => a.rangeYd - b.rangeYd);
}

const EFFECTIVE_SURFACE = effectiveYieldTable(curves.effectiveYieldSurface);
const EFFECTIVE_AIR = effectiveYieldTable(curves.effectiveYieldAirburst);

/** Dose per kiloton (rad) from one of the per-kiloton charts; the ends continue along the last slope. */
function perKt(key: CurveKey, slantRangeYd: number): number {
  const c = PER_KT[key];
  return Math.pow(10, interpExtrapolate(slantRangeYd, c.x, c.y));
}

/** log10 of the effective yield (kt) for the fission product gamma dose. */
function log10EffectiveYield(
  table: Array<{ rangeYd: number; curve: Curve }>,
  yieldKt: number,
  slantRangeYd: number,
): number {
  const logW = Math.log10(Math.max(yieldKt, 1e-3));
  const at = (entry: { curve: Curve }): number => {
    const { x, y } = entry.curve;
    // Below 1 kt and for points left of a curve there is no enhancement: effective yield = yield.
    if (logW <= x[0]!) return logW + (y[0]! - x[0]!);
    return interpExtrapolate(logW, x, y);
  };
  const ranges = table.map((e) => e.rangeYd);
  const values = table.map(at);
  // Inside 500 yd the enhancement fades out; beyond 6,000 yd the last curve is used.
  if (slantRangeYd <= ranges[0]!) return logW + (values[0]! - logW) * Math.max(slantRangeYd / ranges[0]!, 0);
  return interp(slantRangeYd, ranges, values);
}

export interface RadiationConditions {
  yieldKt: number;
  burstHeightM: number;
  /** Fraction of the yield that comes from fission, 0..1. */
  fissionFraction: number;
}

export interface InitialDose {
  neutron: number;
  secondaryGamma: number;
  fissionProductGamma: number;
  total: number;
}

/** Weapons with at least this fission fraction use the "fission weapon" charts. */
const FISSION_WEAPON_THRESHOLD = 0.8;

function doseFor(slantRangeM: number, c: RadiationConditions, variant: 'low' | 'high'): InitialDose {
  const yd = Math.max(mToYd(slantRangeM), 1);
  const fission = c.fissionFraction >= FISSION_WEAPON_THRESHOLD;
  // Surface correction for neutrons and secondary gammas: 0.5 at contact, 1 from 300 ft up.
  const heightFactor = interp(c.burstHeightM, [0, 300 * FT], [0.5, 1]);

  const neutronKey: CurveKey = fission
    ? variant === 'low'
      ? 'fissionneutronoffense'
      : 'fissionneutrondefense'
    : 'thermonuclearneutron';
  const gammaKey: CurveKey = fission
    ? variant === 'low'
      ? 'fissionsecondarygammaoffense'
      : 'fissionsecondarygammadefense'
    : 'thermonuclearsecondarygamma';

  const neutron = perKt(neutronKey, yd) * c.yieldKt * heightFactor;
  const secondaryGamma = perKt(gammaKey, yd) * c.yieldKt * heightFactor;

  // Fission product gammas: blend the surface and low-air-burst effective yields
  // by height, up to the 200 W^0.4 ft for which Fig. 8.130b is drawn.
  const surface = log10EffectiveYield(EFFECTIVE_SURFACE, c.yieldKt, yd);
  const air = log10EffectiveYield(EFFECTIVE_AIR, c.yieldKt, yd);
  const lowAirBurstHeight = (200 / 180) * falloutFreeHeightM(c.yieldKt);
  const blend = Math.min(Math.max(c.burstHeightM / lowAirBurstHeight, 0), 1);
  const effectiveKt = Math.pow(10, surface + (air - surface) * blend);
  const fissionProductGamma = perKt('ffgamma', yd) * effectiveKt * c.fissionFraction;

  return { neutron, secondaryGamma, fissionProductGamma, total: neutron + secondaryGamma + fissionProductGamma };
}

/** Initial radiation dose (rad, tissue) at a slant range. `low` and `high` bracket weapon design. */
export function initialDose(slantRangeM: number, c: RadiationConditions): { low: InitialDose; high: InitialDose } {
  return { low: doseFor(slantRangeM, c, 'low'), high: doseFor(slantRangeM, c, 'high') };
}

/**
 * Largest ground range at which the total initial dose is at least `rad`.
 * Returns the span between the low and high curves; 0 when the dose is not reached on the ground.
 */
export function initialDoseRadiusM(rad: number, c: RadiationConditions): { low: number; high: number } {
  const solve = (variant: 'low' | 'high'): number => {
    const dose = (groundM: number): number => doseFor(Math.hypot(groundM, c.burstHeightM), c, variant).total;
    if (dose(0) < rad) return 0;
    // The dose falls monotonically with range; search outwards for a bracket, then bisect in log space.
    let lo = 0;
    let hi = 200;
    while (dose(hi) >= rad && hi < 2e5) {
      lo = hi;
      hi *= 1.5;
    }
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (dose(mid) >= rad) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const a = solve('low');
  const b = solve('high');
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

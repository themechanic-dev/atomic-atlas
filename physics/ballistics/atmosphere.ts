// Temperature, pressure, density and speed of sound of the air up to 86 km.
//
// Source: U.S. Standard Atmosphere, 1976 (NOAA, NASA and USAF, NOAA-S/T 76-1562), the
// seven layers below 86 km, each with a constant rate of change of temperature with
// geopotential height (Table 4 of the source). Above 86 km the air of the last layer is
// carried on at a constant temperature, which is only used to keep the numbers finite.

/** Standard gravity, m/s² (the source's g₀). */
export const STANDARD_GRAVITY = 9.80665;
/** Gas constant over the molar mass of air, J/(kg K) (R* / M₀ of the source). */
const R_AIR = 8.31432 / 0.0289644;
/** Ratio of specific heats of air. */
const GAMMA = 1.4;
/** Earth radius used by the source to turn geometric height into geopotential height, m. */
const R0 = 6_356_766;
/** Top of the layers, geometric height, m. */
export const ATMOSPHERE_TOP_M = 86_000;

// Base of each layer: geopotential height (m), temperature (K), lapse rate (K/m), pressure (Pa).
const LAYERS: readonly { h: number; t: number; lapse: number; p: number }[] = [
  { h: 0, t: 288.15, lapse: -0.0065, p: 101_325 },
  { h: 11_000, t: 216.65, lapse: 0, p: 22_632.06 },
  { h: 20_000, t: 216.65, lapse: 0.001, p: 5_474.889 },
  { h: 32_000, t: 228.65, lapse: 0.0028, p: 868.0187 },
  { h: 47_000, t: 270.65, lapse: 0, p: 110.9063 },
  { h: 51_000, t: 270.65, lapse: -0.0028, p: 66.93887 },
  { h: 71_000, t: 214.65, lapse: -0.002, p: 3.95642 },
];

export interface Air {
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  soundSpeedMs: number;
}

/** The standard air at a geometric height above sea level, metres. */
export function standardAtmosphere(heightM: number): Air {
  const z = Math.max(0, heightM);
  const geopotential = (R0 * z) / (R0 + z);
  let layer = LAYERS[0]!;
  for (const candidate of LAYERS) if (geopotential >= candidate.h) layer = candidate;
  const dh = geopotential - layer.h;
  // The last layer ends at 84,852 m geopotential (86 km); above it the temperature stays put.
  const top = (R0 * ATMOSPHERE_TOP_M) / (R0 + ATMOSPHERE_TOP_M);
  let temperature: number;
  let pressure: number;
  if (layer.lapse === 0) {
    temperature = layer.t;
    pressure = layer.p * Math.exp((-STANDARD_GRAVITY * dh) / (R_AIR * layer.t));
  } else {
    const within = Math.min(dh, top - layer.h);
    temperature = layer.t + layer.lapse * within;
    pressure = layer.p * Math.pow(layer.t / temperature, STANDARD_GRAVITY / (R_AIR * layer.lapse));
    if (dh > within) pressure *= Math.exp((-STANDARD_GRAVITY * (dh - within)) / (R_AIR * temperature));
  }
  return {
    temperatureK: temperature,
    pressurePa: pressure,
    densityKgM3: pressure / (R_AIR * temperature),
    soundSpeedMs: Math.sqrt(GAMMA * R_AIR * temperature),
  };
}

/**
 * The height at which the standard air has a given density, metres; the density falls
 * steadily with height, so a simple halving search finds it. Clamped to 0 and to the
 * top of the layers.
 */
export function heightForDensity(densityKgM3: number): number {
  if (!(densityKgM3 > 0)) return ATMOSPHERE_TOP_M;
  if (densityKgM3 >= standardAtmosphere(0).densityKgM3) return 0;
  if (densityKgM3 <= standardAtmosphere(ATMOSPHERE_TOP_M).densityKgM3) return ATMOSPHERE_TOP_M;
  let lo = 0;
  let hi = ATMOSPHERE_TOP_M;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (standardAtmosphere(mid).densityKgM3 > densityKgM3) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

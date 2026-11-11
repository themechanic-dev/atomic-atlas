// Numbers for people: the user's units, sensible rounding, the user's locale.
// The physics layer works in SI; everything shown on screen goes through here.

import { locale } from '../i18n';
import { settings } from '../state/settings';
import type { Quantity } from '@physics/sources';

const MILE = 1609.344;
const FOOT = 0.3048;
const PSI_TO_KPA = 6.894757;
const CAL_CM2_TO_KJ_M2 = 41.84;

/** Rounds to a number of significant figures. */
export function roundSig(value: number, figures: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, figures - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

export function formatNumber(value: number, figures = 3): string {
  if (!Number.isFinite(value)) return '–';
  const rounded = roundSig(value, figures);
  const abs = Math.abs(rounded);
  const maximumFractionDigits = abs === 0 || abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : Math.min(6, figures + Math.ceil(-Math.log10(abs)) - 1);
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits }).format(rounded);
}

/** A whole number of people, rounded to two figures above a thousand. */
export function formatPeople(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const rounded = value >= 1000 ? roundSig(value, 2) : Math.round(value / 10) * 10;
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(Math.max(0, rounded));
}

/** A length in metres, shown in km/m or mi/ft. */
export function formatDistance(metres: number, figures = 3): string {
  if (!Number.isFinite(metres)) return '–';
  if (settings.value.distance === 'mi') {
    const miles = metres / MILE;
    if (miles < 0.1) return `${formatNumber(metres / FOOT, Math.min(figures, 2))} ft`;
    return `${formatNumber(miles, figures)} mi`;
  }
  if (metres < 1000) return `${formatNumber(metres, Math.min(figures, 3))} m`;
  return `${formatNumber(metres / 1000, figures)} km`;
}

/** An area in square metres, shown in km² or mi². */
export function formatArea(m2: number): string {
  if (!Number.isFinite(m2)) return '–';
  if (settings.value.distance === 'mi') return `${formatNumber(m2 / (MILE * MILE), 3)} mi²`;
  return `${formatNumber(m2 / 1e6, 3)} km²`;
}

/** A height in metres, shown in m or ft (heights of burst are small numbers). */
export function formatHeight(metres: number): string {
  if (!Number.isFinite(metres)) return '–';
  if (settings.value.distance === 'mi') return `${formatNumber(metres / FOOT, 3)} ft`;
  return metres >= 10000 ? `${formatNumber(metres / 1000, 3)} km` : `${formatNumber(metres, 3)} m`;
}

/** A speed in m/s, shown in km/h or mph. */
export function formatSpeed(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  if (settings.value.distance === 'mi') return `${formatNumber(ms / 0.44704, 3)} mph`;
  return `${formatNumber(ms * 3.6, 3)} km/h`;
}

/** An overpressure in psi, with kPa alongside: both are in common use. */
export function formatPressure(psi: number): string {
  if (!Number.isFinite(psi)) return '–';
  return `${formatNumber(psi, 3)} psi (${formatNumber(psi * PSI_TO_KPA, 3)} kPa)`;
}

/** Radiant exposure in cal/cm², with kJ/m² alongside. */
export function formatExposure(calPerCm2: number): string {
  if (!Number.isFinite(calPerCm2)) return '–';
  return `${formatNumber(calPerCm2, 3)} cal/cm² (${formatNumber(calPerCm2 * CAL_CM2_TO_KJ_M2, 3)} kJ/m²)`;
}

/** A yield in kilotons, shown in t, kt or Mt. */
export function formatYield(kt: number): string {
  if (!Number.isFinite(kt)) return '–';
  if (kt < 1) return `${formatNumber(kt * 1000, 3)} t`;
  if (kt < 1000) return `${formatNumber(kt, 3)} kt`;
  return `${formatNumber(kt / 1000, 3)} Mt`;
}

/** A dose in rad, with gray alongside (1 Gy = 100 rad). */
export function formatDose(rad: number): string {
  if (!Number.isFinite(rad)) return '–';
  return `${formatNumber(rad, 3)} rad (${formatNumber(rad / 100, 3)} Gy)`;
}

/** A fallout dose rate in R/h, with Sv/h alongside (taking 100 R as 1 Sv). */
export function formatDoseRate(rPerHour: number): string {
  if (!Number.isFinite(rPerHour)) return '–';
  const sv = rPerHour / 100;
  const svText = sv >= 1 ? `${formatNumber(sv, 3)} Sv/h` : `${formatNumber(sv * 1000, 3)} mSv/h`;
  return `${formatNumber(rPerHour, 3)} R/h (${svText})`;
}

/** A temperature in kelvin, shown in °C or °F. */
export function formatTemperature(kelvin: number): string {
  if (!Number.isFinite(kelvin)) return '–';
  const celsius = kelvin - 273.15;
  if (settings.value.temperature === 'F') return `${formatNumber((celsius * 9) / 5 + 32, 3)} °F`;
  return `${formatNumber(celsius, 3)} °C`;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '–';
  if (hours < 1 / 60) return `${formatNumber(hours * 3600, 2)} s`;
  if (hours < 1) return `${formatNumber(hours * 60, 2)} min`;
  if (hours < 48) return `${formatNumber(hours, 2)} h`;
  return `${formatNumber(hours / 24, 2)} d`;
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '–';
  return `${formatNumber(fraction * 100, 2)} %`;
}

export function formatAngle(degrees: number): string {
  return `${Math.round(((degrees % 360) + 360) % 360)}°`;
}

/** A latitude/longitude pair in degrees. */
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

/** Formats a physics value by its kind; used by "How was this calculated?". */
export function formatQuantity(value: number, quantity: Quantity): string {
  switch (quantity) {
    case 'length':
      return formatDistance(value);
    case 'height':
      return formatHeight(value);
    case 'area':
      return formatArea(value);
    case 'pressure':
      return formatPressure(value);
    case 'energyDensity':
      return formatExposure(value);
    case 'yield':
      return formatYield(value);
    case 'speed':
      return formatSpeed(value);
    case 'dose':
      return formatDose(value);
    case 'doseRate':
      return formatDoseRate(value);
    case 'time':
      return formatDuration(value);
    case 'angle':
      return formatAngle(value);
    case 'fraction':
      return formatNumber(value, 3);
    case 'count':
      return formatPeople(value);
    case 'number':
      return formatNumber(value, 3);
  }
}

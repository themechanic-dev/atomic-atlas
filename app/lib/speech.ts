// Short spoken summaries of a result, with units written out so a voice reads them well.

import type { DetonationResult } from '@physics/detonation';
import type { ReleaseResult } from '@physics/dispersion/release';
import { t } from '../i18n';
import { settings } from '../state/settings';
import type { WaterResult } from '../state/water';

const FOOT = 0.3048;
const MILE = 1609.344;

/** A number with two significant figures in the language of the app. */
function spokenNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const magnitude = Math.floor(Math.log10(value));
  const step = 10 ** (magnitude - 1);
  const rounded = Math.round(value / step) * step;
  return rounded.toLocaleString(settings.value.language === 'el' ? 'el-GR' : 'en-US', { maximumFractionDigits: Math.max(0, 1 - magnitude) });
}

export function spokenDistance(metres: number): string {
  if (settings.value.distance === 'mi') {
    const miles = metres / MILE;
    return miles < 0.2 ? t('speech.unit.ft', { n: spokenNumber(metres / FOOT) }) : t('speech.unit.mi', { n: spokenNumber(miles) });
  }
  return metres < 1000 ? t('speech.unit.m', { n: spokenNumber(metres) }) : t('speech.unit.km', { n: spokenNumber(metres / 1000) });
}

export function spokenYield(kt: number): string {
  if (kt >= 1000) return t('speech.unit.mt', { n: spokenNumber(kt / 1000) });
  if (kt < 1) return t('speech.unit.t', { n: spokenNumber(kt * 1000) });
  return t('speech.unit.kt', { n: spokenNumber(kt) });
}

function ring(result: DetonationResult, id: string): number {
  return result.rings.find((r) => r.id === id)?.radiusM ?? 0;
}

/** What the voice says after a detonation. */
export function detonationSpeech(result: DetonationResult, water: WaterResult | null): string {
  const burst = result.scenario.burstMode === 'surface' || result.heightM <= 0 ? t('speech.burst.surface') : t('speech.burst.air');
  const parts = [t('speech.detonation', { yield: spokenYield(result.scenario.yieldKt), burst })];
  const fireball = ring(result, 'fireball');
  if (fireball > 0) parts.push(t('speech.fireball', { r: spokenDistance(fireball) }));
  const psi5 = ring(result, 'blast5');
  if (psi5 > 0) parts.push(t('speech.blast5', { r: spokenDistance(psi5) }));
  const burn3 = ring(result, 'burn3');
  if (burn3 > 0) parts.push(t('speech.burn3', { r: spokenDistance(burn3) }));
  const psi1 = ring(result, 'blast1');
  if (psi1 > 0) parts.push(t('speech.blast1', { r: spokenDistance(psi1) }));
  if (water?.state === 'ready' && water.inWater && water.summary && water.summary.rangeTo3mM > 0) {
    parts.push(t('speech.waves', { r: spokenDistance(water.summary.rangeTo3mM) }));
  }
  if (result.fallout.significant) parts.push(t('speech.fallout'));
  return parts.join(' ');
}

/** What the voice says after an accident simulation. */
export function accidentSpeech(name: string, result: ReleaseResult): string {
  const parts = [t('speech.accident', { name })];
  if (result.iodineRangeM > 0) parts.push(t('speech.accident.iodine', { r: spokenDistance(result.iodineRangeM) }));
  parts.push(result.urgentRangeM > 0 ? t('speech.accident.urgent', { r: spokenDistance(result.urgentRangeM) }) : t('speech.accident.urgentNone'));
  if (result.relocationRangeM > 0) parts.push(t('speech.accident.relocation', { r: spokenDistance(result.relocationRangeM) }));
  return parts.join(' ');
}

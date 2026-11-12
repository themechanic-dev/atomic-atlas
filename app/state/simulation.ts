// The state of the detonation simulator: what the user set up, and what came out.

import { batch, computed, signal } from '@preact/signals';
import { estimateCasualties, type CasualtyEstimate } from '@physics/casualties/model';
import { DEFAULT_SCENARIO, detonate, type BurstMode, type DetonationResult, type Scenario } from '@physics/detonation';
import type { WindLevel } from '@physics/fallout/wind';
import { populationAround } from '../data/population';
import { fetchWeather, type WeatherSnapshot } from '../data/weather';
import type { LngLat } from '../lib/geo';
import { settings } from './settings';
import { clearWater, computeWater } from './water';

// --- Busy indicator ----------------------------------------------------------

/** Translation keys of the things the app is working on right now. */
export const busyReasons = signal<string[]>([]);
export const busy = computed(() => busyReasons.value.length > 0);

/** Shows the working indicator until the returned function is called. */
export function beginBusy(reasonKey: string): () => void {
  busyReasons.value = [...busyReasons.value, reasonKey];
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const index = busyReasons.value.indexOf(reasonKey);
    if (index >= 0) busyReasons.value = busyReasons.value.filter((_, i) => i !== index);
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- Scenario ----------------------------------------------------------------

export type WindMode = 'live' | 'manual';

export interface ScenarioForm {
  yieldKt: number;
  burstMode: BurstMode;
  heightM: number;
  fissionFraction: number;
  visibilityM: number;
  windMode: WindMode;
  /** Manual wind: speed in m/s and the direction it blows from, degrees. */
  manualWindSpeedMs: number;
  manualWindFromDeg: number;
  /** Catalog entry the yield was taken from, if any. */
  weaponId: string | null;
  /** True until the user types a fission fraction: it then follows the yield. */
  fissionAuto: boolean;
}

export const DEFAULT_FORM: ScenarioForm = {
  yieldKt: DEFAULT_SCENARIO.yieldKt,
  burstMode: DEFAULT_SCENARIO.burstMode,
  heightM: 500,
  fissionFraction: DEFAULT_SCENARIO.fissionFraction,
  visibilityM: DEFAULT_SCENARIO.visibilityM,
  windMode: 'manual',
  manualWindSpeedMs: 6.7,
  manualWindFromDeg: 270,
  weaponId: null,
  fissionAuto: true,
};

/**
 * Fission fraction assumed for a yield typed in by hand: pure fission up to 50 kt, half above.
 * Half is the figure Glasstone & Dolan use for thermonuclear weapons.
 */
export function defaultFissionFraction(yieldKt: number): number {
  return yieldKt <= 50 ? 1 : 0.5;
}

/** Sets a yield by hand: detaches the catalog entry and, unless the user fixed it, updates the fission fraction. */
export function setManualYield(yieldKt: number): void {
  const f = form.value;
  form.value = {
    ...f,
    yieldKt,
    weaponId: null,
    fissionFraction: f.fissionAuto ? defaultFissionFraction(yieldKt) : f.fissionFraction,
  };
}

export const form = signal<ScenarioForm>({ ...DEFAULT_FORM });
export const groundZero = signal<LngLat | null>(null);

export function updateForm(patch: Partial<ScenarioForm>): void {
  form.value = { ...form.value, ...patch };
}

// --- Weather -----------------------------------------------------------------

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const weather = signal<WeatherSnapshot | null>(null);
export const weatherState = signal<LoadState>('idle');
/** Where the current weather snapshot was taken. */
export const weatherPoint = signal<LngLat | null>(null);

let weatherAbort: AbortController | null = null;

export async function refreshWeather(point: LngLat): Promise<WeatherSnapshot | null> {
  weatherAbort?.abort();
  const abort = new AbortController();
  weatherAbort = abort;
  weatherState.value = 'loading';
  const end = beginBusy('busy.weather');
  try {
    const snapshot = await fetchWeather(point, abort.signal);
    batch(() => {
      weather.value = snapshot;
      weatherPoint.value = point;
      weatherState.value = 'ready';
    });
    return snapshot;
  } catch (error) {
    if (abort.signal.aborted) return null;
    console.warn('weather request failed', error);
    weatherState.value = 'error';
    return null;
  } finally {
    end();
  }
}

/** The wind profile the scenario uses right now. */
export function currentWind(): WindLevel[] {
  const f = form.value;
  if (f.windMode === 'live' && weather.value) return weather.value.levels;
  return [{ heightM: 10, speedMs: f.manualWindSpeedMs, fromDeg: f.manualWindFromDeg }];
}

export function buildScenario(): Scenario {
  const f = form.value;
  return {
    yieldKt: f.yieldKt,
    burstMode: f.burstMode,
    heightM: f.heightM,
    fissionFraction: f.fissionFraction,
    visibilityM: f.visibilityM,
    wind: currentWind(),
    defaultShearDeg: DEFAULT_SCENARIO.defaultShearDeg,
  };
}

// --- Result ------------------------------------------------------------------

export interface Detonation {
  id: number;
  at: LngLat;
  result: DetonationResult;
  /** True when the wind came from the live weather source. */
  liveWind: boolean;
  weatherTime: string | null;
}

export const detonation = signal<Detonation | null>(null);

export interface CasualtyState {
  state: LoadState | 'unavailable';
  estimate: CasualtyEstimate | null;
  /** People within the outermost ring that was searched. */
  populationSearched: number;
  epoch: number | null;
}

const NO_CASUALTIES: CasualtyState = { state: 'idle', estimate: null, populationSearched: 0, epoch: null };
export const casualties = signal<CasualtyState>(NO_CASUALTIES);

let nextId = 1;
/** The shortest time the working indicator stays up for a detonation, so it never just flickers. */
const MIN_BUSY_MS = 650;

/** Runs the simulation for the current form at the current ground zero. */
export async function runDetonation(): Promise<void> {
  const at = groundZero.value;
  if (!at) return;
  const end = beginBusy('busy.detonation');
  const started = performance.now();
  const id = nextId++;
  try {
    let liveWind = false;
    let weatherTime: string | null = null;
    if (form.value.windMode === 'live' && settings.value.weatherSource === 'openmeteo') {
      const snapshot = await refreshWeather(at);
      if (snapshot) {
        liveWind = true;
        weatherTime = snapshot.time;
      }
    }
    // Let the indicator paint before the calculation takes the thread.
    await sleep(30);
    const result = detonate(buildScenario());
    batch(() => {
      detonation.value = { id, at, result, liveWind, weatherTime };
      casualties.value = { ...NO_CASUALTIES, state: 'loading' };
      // Waves, if surface zero is on water; they follow when the depth has been read.
      void computeWater(id, at, result.scenario.yieldKt, result.heightM <= 0);
    });

    // Casualties need the population grid; they follow when it has loaded.
    const reach = Math.max(result.rings.find((r) => r.id === 'blast1')?.radiusM ?? 0, result.maxRadiusM) * 1.1;
    const population = await populationAround(at, reach);
    if (detonation.value?.id !== id) return; // a newer run replaced this one
    if (!population) {
      casualties.value = { ...NO_CASUALTIES, state: 'unavailable' };
    } else {
      casualties.value = {
        state: 'ready',
        estimate: estimateCasualties(population.samples, result.effects),
        populationSearched: population.total,
        epoch: population.epoch,
      };
    }
    const elapsed = performance.now() - started;
    if (elapsed < MIN_BUSY_MS) await sleep(MIN_BUSY_MS - elapsed);
  } catch (error) {
    console.error('detonation failed', error);
    if (detonation.value?.id === id) casualties.value = { ...NO_CASUALTIES, state: 'error' };
  } finally {
    end();
  }
}

export function clearDetonation(): void {
  batch(() => {
    detonation.value = null;
    casualties.value = NO_CASUALTIES;
    clearWater();
  });
}

// --- "How was this calculated?" ----------------------------------------------

/** Identifier of the result whose explanation is open: a ring id, 'fallout' or 'casualties'. */
export const explaining = signal<string | null>(null);

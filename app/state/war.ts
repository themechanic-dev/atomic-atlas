// A war scenario: several launches the user has placed by hand, each with its own time,
// played on one clock; a defence described in general terms; and what the warheads
// that get through would do.
//
// Nothing here chooses targets or launch times: every launch is one the user set up in the
// missile simulator and added to the scenario.

import { batch, computed, signal } from '@preact/signals';
import { planFlight, type FlightPlan } from '@physics/ballistics/flight';
import type { TrajectoryShape } from '@physics/ballistics/trajectory';
import { estimateCasualties } from '@physics/casualties/model';
import { DEFAULT_DEFENCE, leakProbability, phaseWindows, type DefencePhase, type DefenceSettings, type PhaseWindows } from '@physics/defence/layers';
import { detonate, DEFAULT_SCENARIO } from '@physics/detonation';
import { assumedFissionFraction, weaponById } from '../data/catalog';
import { populationAround } from '../data/population';
import { distanceM, type LngLat } from '../lib/geo';
import { clearMissiles, launchPoint, missile, reach, shape, targets, warheadYieldKt } from './missiles';

export interface Salvo {
  id: number;
  weaponId: string;
  yieldKt: number;
  from: LngLat;
  targets: LngLat[];
  shape: TrajectoryShape;
  /** Seconds after the start of the scenario. */
  launchAtS: number;
}

export const salvos = signal<Salvo[]>([]);
export const defence = signal<DefenceSettings>(DEFAULT_DEFENCE);

let nextId = 1;

/** Adds the launch set up in the missile simulator to the scenario, at a time, and clears the editor. */
export function addCurrentLaunch(launchAtS: number): void {
  const weapon = missile.value;
  const from = launchPoint.value;
  if (!weapon || !from || targets.value.length === 0) return;
  const limit = reach.value;
  const inRange = targets.value.filter((t) => distanceM(from, t) <= limit);
  if (inRange.length === 0) return;
  const salvo: Salvo = {
    id: nextId++,
    weaponId: weapon.id,
    yieldKt: warheadYieldKt.value ?? weapon.yieldsKt[weapon.yieldsKt.length - 1]!,
    from,
    targets: inRange,
    shape: shape.value,
    launchAtS: Math.max(0, launchAtS),
  };
  batch(() => {
    salvos.value = [...salvos.value, salvo].sort((a, b) => a.launchAtS - b.launchAtS);
    clearMissiles();
    warStop();
    warCasualties.value = NO_CASUALTIES;
  });
}

export function removeSalvo(id: number): void {
  batch(() => {
    salvos.value = salvos.value.filter((s) => s.id !== id);
    warStop();
    warCasualties.value = NO_CASUALTIES;
  });
}

export function clearWar(): void {
  batch(() => {
    salvos.value = [];
    warStop();
    warCasualties.value = NO_CASUALTIES;
  });
}

export function updateDefence(patch: Partial<Omit<DefenceSettings, 'layers'>>, phase?: DefencePhase, layer?: Partial<DefenceSettings['layers'][DefencePhase]>): void {
  const current = defence.value;
  defence.value = {
    ...current,
    ...patch,
    layers: phase && layer ? { ...current.layers, [phase]: { ...current.layers[phase], ...layer } } : current.layers,
  };
  warCasualties.value = NO_CASUALTIES;
}

// --- Flights -------------------------------------------------------------------

export interface WarFlight {
  salvoIndex: number;
  salvo: Salvo;
  targetIndex: number;
  target: LngLat;
  plan: FlightPlan;
  /** Phases measured from the launch of the salvo. */
  windows: PhaseWindows;
  /** When the free flight of the plan begins and the warhead arrives, scenario seconds. */
  freeFlightStartS: number;
  impactS: number;
  /** Chance that the warhead gets through the defence. */
  leak: number;
}

export const warFlights = computed<WarFlight[]>(() => {
  const settings = defence.value;
  const out: WarFlight[] = [];
  salvos.value.forEach((salvo, salvoIndex) => {
    const weapon = weaponById(salvo.weaponId);
    if (!weapon) return;
    salvo.targets.forEach((target, targetIndex) => {
      const plan = planFlight(weapon.category, distanceM(salvo.from, target), salvo.shape);
      if (!plan) return;
      const windows = phaseWindows(plan, settings);
      const boost = plan.kind === 'ballistic' ? Math.max(0, settings.boostS) : 0;
      out.push({
        salvoIndex,
        salvo,
        targetIndex,
        target,
        plan,
        windows,
        freeFlightStartS: salvo.launchAtS + boost,
        impactS: salvo.launchAtS + boost + plan.flightTimeS,
        leak: leakProbability(windows, settings),
      });
    });
  });
  return out;
});

export const warDuration = computed(() => warFlights.value.reduce((max, f) => Math.max(max, f.impactS), 0));

export interface WarEvent {
  timeS: number;
  kind: 'launch' | 'boostEnd' | 'terminal' | 'impact';
  salvoIndex: number;
  /** Target number within the salvo, for events of one warhead. */
  targetIndex: number | null;
}

/** What happens when, in order. The terminal phase and the impact are listed per warhead. */
export const warEvents = computed<WarEvent[]>(() => {
  const events: WarEvent[] = [];
  const seen = new Set<number>();
  for (const f of warFlights.value) {
    if (!seen.has(f.salvoIndex)) {
      seen.add(f.salvoIndex);
      events.push({ timeS: f.salvo.launchAtS, kind: 'launch', salvoIndex: f.salvoIndex, targetIndex: null });
      if (f.windows.boost) events.push({ timeS: f.salvo.launchAtS + f.windows.boost[1], kind: 'boostEnd', salvoIndex: f.salvoIndex, targetIndex: null });
    }
    if (f.windows.terminal && f.plan.kind === 'ballistic') events.push({ timeS: f.salvo.launchAtS + f.windows.terminal[0], kind: 'terminal', salvoIndex: f.salvoIndex, targetIndex: f.targetIndex });
    events.push({ timeS: f.impactS, kind: 'impact', salvoIndex: f.salvoIndex, targetIndex: f.targetIndex });
  }
  return events.sort((a, b) => a.timeS - b.timeS);
});

export interface WarSummary {
  warheads: number;
  /** Expected number that get through the defence. */
  arriving: number;
  /** Expected yield that gets through, kilotons. */
  arrivingYieldKt: number;
  /** Total yield launched, kilotons. */
  launchedYieldKt: number;
}

export const warSummary = computed<WarSummary>(() => {
  let arriving = 0;
  let arrivingYieldKt = 0;
  let launchedYieldKt = 0;
  for (const f of warFlights.value) {
    arriving += f.leak;
    arrivingYieldKt += f.leak * f.salvo.yieldKt;
    launchedYieldKt += f.salvo.yieldKt;
  }
  return { warheads: warFlights.value.length, arriving, arrivingYieldKt, launchedYieldKt };
});

// --- Casualties ------------------------------------------------------------------

export interface WarCasualties {
  state: 'idle' | 'loading' | 'ready' | 'unavailable';
  /** Expected killed and injured: each target's estimate times the chance its warhead arrives. */
  killed: { low: number; central: number; high: number };
  injured: { low: number; central: number; high: number };
  /** Targets worked out so far, of all. */
  done: number;
  total: number;
}

const NO_CASUALTIES: WarCasualties = { state: 'idle', killed: { low: 0, central: 0, high: 0 }, injured: { low: 0, central: 0, high: 0 }, done: 0, total: 0 };
export const warCasualties = signal<WarCasualties>(NO_CASUALTIES);

let casualtyRun = 0;

/**
 * Estimates the people killed and injured at every target, one after the other, each with
 * the warhead as an air burst at the height that maximises damage to houses. Targets close
 * together count the same people twice; the total is an upper estimate there.
 */
export async function estimateWarCasualties(): Promise<void> {
  const run = ++casualtyRun;
  const list = warFlights.value;
  const sum = { killed: { low: 0, central: 0, high: 0 }, injured: { low: 0, central: 0, high: 0 } };
  warCasualties.value = { ...NO_CASUALTIES, state: 'loading', total: list.length };
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    const weapon = weaponById(f.salvo.weaponId);
    const result = detonate({
      ...DEFAULT_SCENARIO,
      yieldKt: f.salvo.yieldKt,
      burstMode: 'airburst',
      fissionFraction: weapon ? assumedFissionFraction(weapon, f.salvo.yieldKt) : DEFAULT_SCENARIO.fissionFraction,
    });
    const radius = Math.max(result.rings.find((r) => r.id === 'blast1')?.radiusM ?? 0, result.maxRadiusM) * 1.1;
    const population = await populationAround(f.target, radius);
    if (run !== casualtyRun) return;
    if (population) {
      any = true;
      const e = estimateCasualties(population.samples, result.effects);
      for (const k of ['low', 'central', 'high'] as const) {
        sum.killed[k] += e.killed[k] * f.leak;
        sum.injured[k] += e.injured[k] * f.leak;
      }
    }
    warCasualties.value = { state: 'loading', ...sum, done: i + 1, total: list.length };
  }
  warCasualties.value = { state: any ? 'ready' : 'unavailable', ...sum, done: list.length, total: list.length };
}

// --- Playback --------------------------------------------------------------------

export const warClock = signal(0);
export const warPlaying = signal(false);
export const warRate = signal(60);
export const WAR_RATES = [10, 60, 300] as const;

let frame = 0;
let lastTick = 0;

function tick(now: number): void {
  if (!warPlaying.value) return;
  const elapsed = Math.min(now - lastTick, 1000) / 1000;
  lastTick = now;
  const next = warClock.value + elapsed * warRate.value;
  if (next >= warDuration.value) {
    batch(() => {
      warClock.value = warDuration.value;
      warPlaying.value = false;
    });
    return;
  }
  warClock.value = next;
  frame = requestAnimationFrame(tick);
}

export function warPlay(): void {
  if (warDuration.value <= 0) return;
  if (warClock.value >= warDuration.value) warClock.value = 0;
  lastTick = performance.now();
  warPlaying.value = true;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

export function warPause(): void {
  warPlaying.value = false;
  cancelAnimationFrame(frame);
}

export function warStop(): void {
  warPause();
  warClock.value = 0;
}

export function warSeek(seconds: number): void {
  warClock.value = Math.max(0, Math.min(warDuration.value, seconds));
}

// The state of the missile simulator: a weapon, where it is launched from, where its
// warheads come down, and the clock that plays the flight back.
//
// The user places every point by hand. Nothing here chooses or ranks targets.

import { batch, computed, signal } from '@preact/signals';
import { planFlight, reachM, type FlightPlan } from '@physics/ballistics/flight';
import type { TrajectoryShape } from '@physics/ballistics/trajectory';
import { assumedFissionFraction, WEAPONS, weaponById, type Weapon } from '../data/catalog';
import { isLand } from '../data/land';
import { distanceM, type LngLat } from '../lib/geo';
import { groundZero, runDetonation, updateForm } from './simulation';
import { mode } from './ui';

/** Weapons that fly somewhere: everything in the catalog with a range. */
export const MISSILES: Weapon[] = WEAPONS.filter((w) => w.rangeKm !== null);

export type PickTarget = 'launch' | 'target';

export const missileId = signal<string | null>(null);
export const launchPoint = signal<LngLat | null>(null);
export const targets = signal<LngLat[]>([]);
export const shape = signal<TrajectoryShape>('minimumEnergy');
/** What the next click on the globe places. */
export const picking = signal<PickTarget>('launch');
/** Yield per warhead chosen from the weapon's published options, kilotons. */
export const warheadYieldKt = signal<number | null>(null);

export const missile = computed<Weapon | null>(() => weaponById(missileId.value));

export interface Flight {
  target: LngLat;
  distanceM: number;
  /** False when the target is further than the weapon reaches on the chosen path. */
  inRange: boolean;
  /** The flight, when the target can be reached. */
  plan: FlightPlan | null;
}

/** How far the chosen weapon reaches on the chosen shape of path, metres. */
export const reach = computed(() => {
  const weapon = missile.value;
  return weapon ? reachM(weapon.category, (weapon.rangeKm ?? 0) * 1000, shape.value) : 0;
});

export const flights = computed<Flight[]>(() => {
  const weapon = missile.value;
  const from = launchPoint.value;
  if (!weapon || !from) return [];
  const limit = reach.value;
  return targets.value.map((target) => {
    const d = distanceM(from, target);
    const inRange = d <= limit;
    return { target, distanceM: d, inRange, plan: inRange ? planFlight(weapon.category, d, shape.value) : null };
  });
});

/** Time until the last warhead arrives, seconds. */
export const duration = computed(() => flights.value.reduce((max, f) => Math.max(max, f.plan?.flightTimeS ?? 0), 0));

// --- Launch platform against the place it is put -----------------------------

/** 'sea' when the launch point should be at sea but is on land, 'land' the other way round, null when fine. */
export const platformWarning = signal<'needsSea' | 'needsLand' | null>(null);

let warningRun = 0;
async function checkPlatform(): Promise<void> {
  const run = ++warningRun;
  const weapon = missile.value;
  const at = launchPoint.value;
  if (!weapon || !at) {
    platformWarning.value = null;
    return;
  }
  const land = await isLand(at);
  if (run !== warningRun) return;
  const platforms = weapon.platform;
  const seaOnly = platforms.length > 0 && platforms.every((p) => p === 'submarine' || p === 'ship');
  const landOnly = platforms.length > 0 && platforms.every((p) => p === 'silo' || p === 'road-mobile' || p === 'rail-mobile');
  platformWarning.value = land === null ? null : seaOnly && land ? 'needsSea' : landOnly && !land ? 'needsLand' : null;
}

// --- Editing -------------------------------------------------------------------

export function chooseMissile(id: string | null): void {
  const weapon = weaponById(id);
  batch(() => {
    missileId.value = weapon ? weapon.id : null;
    warheadYieldKt.value = weapon ? weapon.yieldsKt[weapon.yieldsKt.length - 1]! : null;
    // A missile with fewer warheads keeps only as many targets as it can carry.
    if (weapon) targets.value = targets.value.slice(0, weapon.warheadsMax);
    stop();
  });
  void checkPlatform();
}

/** Places the point the user is picking; after the launch point the next clicks place targets. */
export function placePoint(point: LngLat): void {
  batch(() => {
    if (picking.value === 'launch') {
      launchPoint.value = point;
      picking.value = 'target';
    } else {
      const max = missile.value?.warheadsMax ?? 1;
      const next = [...targets.value, point];
      // When every warhead has a target, a new click replaces the oldest.
      targets.value = next.length > max ? next.slice(next.length - max) : next;
    }
    stop();
  });
  void checkPlatform();
}

export function removeTarget(index: number): void {
  targets.value = targets.value.filter((_, i) => i !== index);
  stop();
}

export function clearMissiles(): void {
  batch(() => {
    launchPoint.value = null;
    targets.value = [];
    picking.value = 'launch';
    platformWarning.value = null;
    stop();
  });
}

// --- Playback ------------------------------------------------------------------

/** Seconds since launch shown on the globe. */
export const clock = signal(0);
export const playing = signal(false);
/** How many seconds of flight pass per second of watching. */
export const playbackRate = signal(60);
export const PLAYBACK_RATES = [10, 60, 300] as const;

let frame = 0;
let lastTick = 0;

function tick(now: number): void {
  if (!playing.value) return;
  const elapsed = Math.min(now - lastTick, 100) / 1000;
  lastTick = now;
  const next = clock.value + elapsed * playbackRate.value;
  if (next >= duration.value) {
    clock.value = duration.value;
    playing.value = false;
    return;
  }
  clock.value = next;
  frame = requestAnimationFrame(tick);
}

export function play(): void {
  if (duration.value <= 0) return;
  if (clock.value >= duration.value) clock.value = 0;
  playing.value = true;
  lastTick = performance.now();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

export function pause(): void {
  playing.value = false;
  cancelAnimationFrame(frame);
}

export function stop(): void {
  pause();
  clock.value = 0;
}

export function seek(seconds: number): void {
  clock.value = Math.max(0, Math.min(duration.value, seconds));
}

// --- From the globe to the city ------------------------------------------------

/** Opens the detonation simulator at a target, with this weapon's warhead, and runs it. */
export function showEffectsAt(index: number): void {
  const weapon = missile.value;
  const flight = flights.value[index];
  if (!weapon || !flight || !flight.plan) return;
  const yieldKt = warheadYieldKt.value ?? weapon.yieldsKt[weapon.yieldsKt.length - 1]!;
  pause();
  batch(() => {
    updateForm({
      yieldKt,
      weaponId: weapon.id,
      fissionFraction: assumedFissionFraction(weapon, yieldKt),
      fissionAuto: true,
      burstMode: 'airburst',
    });
    groundZero.value = flight.target;
    mode.value = 'detonation';
  });
  void runDetonation();
}

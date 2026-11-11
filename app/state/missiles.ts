// The state of the missile simulator: a weapon, where it is launched from, where its
// warheads come down, and the clock that plays the flight back.
//
// The user places every point by hand. Nothing here chooses or ranks targets.

import { batch, computed, signal } from '@preact/signals';
import { flightKind, planFlight, reachM, type FlightPlan } from '@physics/ballistics/flight';
import type { TrajectoryShape } from '@physics/ballistics/trajectory';
import { assumedFissionFraction, WEAPONS, weaponById, type Weapon } from '../data/catalog';
import { isLand } from '../data/land';
import { directedRate, LAUNCHER_HOLD_MS, LIFTOFF_MS, stageAt, timelineFor, type Stage, type Timeline } from '../globe/director';
import { distanceM, type LngLat } from '../lib/geo';
import { playBlast } from './blastPlayback';
import { settings } from './settings';
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
    cameFromFlight.value = false;
    stop();
  });
}

/** Back from the city map to the flight that led there. */
export function returnToFlight(): void {
  mode.value = 'missiles';
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

// --- The directed view of a flight ---------------------------------------------

/** True when the camera follows the flight by itself: launcher, launch, flight, last seconds. */
export const directed = signal(true);
/** The directed view as it is actually played: "less motion" in the settings switches it off. */
export const cinematic = computed(() => directed.value && !settings.value.reduceMotion);
/** True while the launcher is shown before lift-off. */
export const holding = signal(false);
/** 0 to 1 while the launcher gets ready (lid opens, missile is raised); 1 once the missile is away. */
export const launcherProgress = signal(0);
/** True while the lift-off is followed from close by; the flight clock still waits at zero. */
export const lifting = signal(false);
/** 0 to 1 through the lift-off. */
export const liftoffProgress = signal(0);
let holdStart = 0;

/** The parts of the flight in flight time. */
export const timeline = computed<Timeline>(() => {
  const weapon = missile.value;
  return timelineFor(duration.value, weapon ? flightKind(weapon.category) : 'ballistic');
});

/** Index of the flight the directed view follows: the last warhead to arrive. */
export const leadIndex = computed(() => {
  let best = -1;
  let longest = -1;
  flights.value.forEach((flight, index) => {
    if (flight.plan && flight.plan.flightTimeS > longest) {
      longest = flight.plan.flightTimeS;
      best = index;
    }
  });
  return best;
});

/** The part of the flight on screen now. */
export const stage = computed<Stage>(() => {
  if (duration.value <= 0) return 'idle';
  if (holding.value) return 'launcher';
  if (lifting.value) return 'boost';
  if (clock.value <= 0) return 'idle';
  return stageAt(clock.value, timeline.value);
});

/** True while the detonation on the city map was opened from a flight on the globe. */
export const cameFromFlight = signal(false);

/** How long the globe stays on the impact before the city map opens, milliseconds. */
const ARRIVAL_PAUSE_MS = 1500;
let arrivalTimer: ReturnType<typeof setTimeout> | undefined;

/** Indexes of the flights that reach their target. */
function reachable(): number[] {
  return flights.value.flatMap((flight, index) => (flight.plan ? [index] : []));
}

/** True when the played flight has one target only, so the app follows it down to the city by itself. */
export const followsToCity = computed(() => reachable().length === 1);

// When the last warhead has come down: with one target the city map opens by itself,
// with several the user chooses which one to look at.
function onArrival(): void {
  const indexes = reachable();
  if (indexes.length !== 1) return;
  clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => showEffectsAt(indexes[0]!), ARRIVAL_PAUSE_MS);
}

function tick(now: number): void {
  if (!playing.value) return;
  if (holding.value || lifting.value) {
    // The launcher gets ready, then the missile lifts off; the flight clock waits at zero.
    const since = now - holdStart;
    batch(() => {
      if (since < LAUNCHER_HOLD_MS) {
        launcherProgress.value = since / LAUNCHER_HOLD_MS;
      } else if (since < LAUNCHER_HOLD_MS + LIFTOFF_MS) {
        launcherProgress.value = 1;
        holding.value = false;
        lifting.value = true;
        liftoffProgress.value = (since - LAUNCHER_HOLD_MS) / LIFTOFF_MS;
      } else {
        launcherProgress.value = 1;
        liftoffProgress.value = 1;
        holding.value = false;
        lifting.value = false;
        lastTick = now;
      }
    });
    frame = requestAnimationFrame(tick);
    return;
  }
  // A slow computer still keeps the clock; only a long stall (a hidden window) is cut short.
  const elapsed = Math.min(now - lastTick, 1000) / 1000;
  lastTick = now;
  const rate = cinematic.value ? directedRate(stageAt(clock.value, timeline.value), playbackRate.value) : playbackRate.value;
  const next = clock.value + elapsed * rate;
  if (next >= duration.value) {
    clock.value = duration.value;
    playing.value = false;
    onArrival();
    return;
  }
  clock.value = next;
  frame = requestAnimationFrame(tick);
}

export function play(): void {
  clearTimeout(arrivalTimer);
  if (duration.value <= 0) return;
  if (clock.value >= duration.value) clock.value = 0;
  lastTick = performance.now();
  batch(() => {
    playing.value = true;
    if (clock.value === 0 && cinematic.value) {
      // A flight played from the start opens on its launcher.
      holding.value = true;
      holdStart = lastTick;
      launcherProgress.value = 0;
      liftoffProgress.value = 0;
    } else {
      launcherProgress.value = 1;
      liftoffProgress.value = 1;
    }
  });
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

export function pause(): void {
  clearTimeout(arrivalTimer);
  batch(() => {
    playing.value = false;
    // A pause on the launcher or during the lift-off puts things back as they were.
    if (holding.value || lifting.value) {
      holding.value = false;
      lifting.value = false;
      launcherProgress.value = 0;
      liftoffProgress.value = 0;
    }
  });
  cancelAnimationFrame(frame);
}

export function stop(): void {
  pause();
  batch(() => {
    clock.value = 0;
    launcherProgress.value = 0;
    liftoffProgress.value = 0;
  });
}

/** Jumps past the flight to the moment the last warhead comes down. */
export function skipToImpact(): void {
  if (duration.value <= 0) return;
  pause();
  batch(() => {
    launcherProgress.value = 1;
    liftoffProgress.value = 1;
    clock.value = duration.value;
  });
  onArrival();
}

export function seek(seconds: number): void {
  batch(() => {
    clock.value = Math.max(0, Math.min(duration.value, seconds));
    launcherProgress.value = clock.value > 0 ? 1 : 0;
    liftoffProgress.value = launcherProgress.value;
  });
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
    cameFromFlight.value = true;
    mode.value = 'detonation';
  });
  const follow = cinematic.value;
  void runDetonation().then(() => {
    // The directed view goes on: once the map has reached the city, the explosion plays.
    if (follow && mode.value === 'detonation') setTimeout(() => mode.value === 'detonation' && playBlast(), 2200);
  });
}

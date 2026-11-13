// The "director" of a missile flight: which part of the flight is on screen, how fast
// it is played, and which kind of launcher is shown. Pure logic, no drawing.
//
// A flight is shown in four parts: the launcher getting ready, the lift-off, the flight
// seen from space, and the last seconds above the target.
//
// The launcher and the lift-off are shown for a fixed few seconds of watching while the
// flight clock waits at zero: the flight model covers the coasting part only, so the
// powered climb is a picture, not a calculation. The last seconds are played slowly,
// whatever speed is chosen for the long middle part.

export type Stage = 'idle' | 'launcher' | 'boost' | 'midcourse' | 'terminal' | 'impact';

export type FlightKindName = 'ballistic' | 'cruise' | 'glide';

export interface Timeline {
  /** Flight time at which the close view of the target begins, seconds. */
  terminalStartS: number;
  /** Flight time of the last warhead to arrive, seconds. */
  durationS: number;
}

/** How long the launcher is shown getting ready, milliseconds of watching. */
export const LAUNCHER_HOLD_MS = 3600;
/** How long the lift-off is followed from close by, milliseconds of watching. */
export const LIFTOFF_MS = 5200;

/** Seconds of flight per second of watching during the last seconds. */
export const TERMINAL_RATE = 10;

export function timelineFor(durationS: number, kind: FlightKindName): Timeline {
  if (!(durationS > 0)) return { terminalStartS: 0, durationS: 0 };
  const terminal = kind === 'cruise' ? Math.min(60, durationS * 0.05) : Math.min(45, durationS * 0.12);
  return { terminalStartS: durationS - terminal, durationS };
}

/** The part of the flight at a time after lift-off. */
export function stageAt(timeS: number, timeline: Timeline): Stage {
  if (!(timeline.durationS > 0)) return 'idle';
  if (timeS >= timeline.durationS) return 'impact';
  if (timeS >= timeline.terminalStartS) return 'terminal';
  return 'midcourse';
}

/** Playback speed for a stage: the chosen speed, held back during the last seconds. */
export function directedRate(stage: Stage, chosenRate: number): number {
  if (stage === 'terminal') return Math.min(chosenRate, TERMINAL_RATE);
  return chosenRate;
}

export type LauncherKind = 'silo' | 'pad' | 'vehicle' | 'submarine' | 'ship' | 'aircraft';

/** The launcher drawn for a weapon: the first of its platforms that has a model. */
export function launcherKind(platforms: readonly string[]): LauncherKind {
  for (const platform of platforms) {
    if (platform === 'silo') return 'silo';
    if (platform === 'road-mobile' || platform === 'rail-mobile') return 'vehicle';
    if (platform === 'submarine') return 'submarine';
    if (platform === 'ship') return 'ship';
    if (platform === 'aircraft') return 'aircraft';
    // Early missiles stood in the open on a launch pad.
    if (platform === 'surface' || platform === 'tower') return 'pad';
  }
  return 'vehicle';
}

/** Smooth step from 0 to 1 as x goes from 0 to 1. */
export function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

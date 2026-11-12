// The arithmetic of a layered missile defence, in general terms: in which part of a flight
// a defence could act, and the share of warheads that would get through when each layer
// fires a number of independent shots, each with a chosen chance of success.
//
// Nothing here describes a real system. The chance of success per shot is a parameter the
// user sets; with independent shots the chance a warhead gets through a layer is
// (1 − p)^n, and through several layers the product of those.
// The length of the powered climb (boost) is a parameter too: the model ICBMs of the
// American Physical Society study of boost-phase intercept burned for 170 s (solid
// propellant) and 240 s (liquid).

import { positionAt, type FlightPlan } from '../ballistics/flight';
import type { Explanation } from '../sources';

export type DefencePhase = 'boost' | 'midcourse' | 'terminal';
export const DEFENCE_PHASES: readonly DefencePhase[] = ['boost', 'midcourse', 'terminal'];

export interface DefenceLayer {
  enabled: boolean;
  /** Shots fired at each warhead (or missile, in the boost phase). */
  shots: number;
  /** Chance that one shot destroys its target, 0 to 1. */
  killProbability: number;
}

export interface DefenceSettings {
  /** Length of the powered climb of a ballistic missile, seconds. */
  boostS: number;
  /** Height below which the descent counts as the terminal phase, metres. */
  terminalHeightM: number;
  layers: Record<DefencePhase, DefenceLayer>;
}

export const DEFAULT_DEFENCE: DefenceSettings = {
  boostS: 180,
  terminalHeightM: 100_000,
  layers: {
    boost: { enabled: false, shots: 1, killProbability: 0.5 },
    midcourse: { enabled: false, shots: 2, killProbability: 0.5 },
    terminal: { enabled: false, shots: 2, killProbability: 0.5 },
  },
};

/** Chance that a warhead gets through one layer: (1 − p)^n, or 1 when the layer is off. */
export function layerLeak(layer: DefenceLayer): number {
  if (!layer.enabled || layer.shots <= 0) return 1;
  const p = Math.min(1, Math.max(0, layer.killProbability));
  return Math.pow(1 - p, Math.round(layer.shots));
}

/** Time windows of a flight measured from launch, seconds: [start, end] of each phase, or null if it has none. */
export type PhaseWindows = Record<DefencePhase, [number, number] | null>;

/**
 * The phases of a flight. A ballistic missile climbs under power for `boostS`, then flies
 * free (the flight plan); the terminal phase begins where the descent passes below
 * `terminalHeightM`. A cruise missile flies low all the way: all of it is "terminal".
 */
export function phaseWindows(plan: FlightPlan, settings: Pick<DefenceSettings, 'boostS' | 'terminalHeightM'>): PhaseWindows {
  if (plan.kind === 'cruise') return { boost: null, midcourse: null, terminal: [0, plan.flightTimeS] };
  const boost = Math.max(0, settings.boostS);
  const end = boost + plan.flightTimeS;
  if (plan.apogeeM <= settings.terminalHeightM) {
    return { boost: boost > 0 ? [0, boost] : null, midcourse: null, terminal: [boost, end] };
  }
  // The descent passes the height once: find it between the highest point and the end.
  const points = plan.points;
  let top = 0;
  for (let i = 1; i < points.length; i++) if (points[i]!.altitudeM > points[top]!.altitudeM) top = i;
  let lo = points[top]!.timeS;
  let hi = plan.flightTimeS;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (positionAt(plan, mid).altitudeM > settings.terminalHeightM) lo = mid;
    else hi = mid;
  }
  return { boost: boost > 0 ? [0, boost] : null, midcourse: [boost, boost + lo], terminal: [boost + lo, end] };
}

/** Chance that a warhead on this flight gets through every layer that has a phase to act in. */
export function leakProbability(windows: PhaseWindows, settings: DefenceSettings): number {
  let leak = 1;
  for (const phase of DEFENCE_PHASES) if (windows[phase]) leak *= layerLeak(settings.layers[phase]);
  return leak;
}

export function explainDefence(settings: DefenceSettings): Explanation {
  const layers = DEFENCE_PHASES.map((phase) => settings.layers[phase]);
  const total = layers.reduce((product, layer) => product * layerLeak(layer), 1);
  return {
    id: 'defence',
    formula: 'P(through) = Π over layers (1 − p)^n',
    inputs: DEFENCE_PHASES.flatMap((phase) => {
      const layer = settings.layers[phase];
      return layer.enabled
        ? [
            { symbol: `n ${phase}`, labelKey: 'shots', value: layer.shots, quantity: 'number' as const },
            { symbol: `p ${phase}`, labelKey: 'killProbability', value: layer.killProbability, quantity: 'fraction' as const },
          ]
        : [];
    }),
    outputs: [{ symbol: 'P', labelKey: 'leakProbability', value: total, quantity: 'fraction' }],
    sources: ['aps2003'],
    where: 'independent shots; boost times: APS Study Group on Boost-Phase Intercept (2003), model ICBMs',
  };
}

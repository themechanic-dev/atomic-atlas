import { describe, expect, it } from 'vitest';
import { planFlight } from '../ballistics/flight';
import { DEFAULT_DEFENCE, layerLeak, leakProbability, phaseWindows } from './layers';

describe('layered defence arithmetic', () => {
  it('gives (1 - p)^n per layer', () => {
    expect(layerLeak({ enabled: true, shots: 2, killProbability: 0.5 })).toBeCloseTo(0.25, 12);
    expect(layerLeak({ enabled: false, shots: 2, killProbability: 0.9 })).toBe(1);
    expect(layerLeak({ enabled: true, shots: 0, killProbability: 0.9 })).toBe(1);
  });

  it('splits an ICBM flight into boost, midcourse and terminal', () => {
    const plan = planFlight('ICBM', 10_000_000)!;
    const w = phaseWindows(plan, DEFAULT_DEFENCE);
    expect(w.boost).toEqual([0, 180]);
    expect(w.midcourse![0]).toBe(180);
    expect(w.terminal![1]).toBeCloseTo(180 + plan.flightTimeS, 6);
    // Re-entry from 100 km takes a minute or two at the end of the flight.
    const terminal = w.terminal![1] - w.terminal![0];
    expect(terminal).toBeGreaterThan(20);
    expect(terminal).toBeLessThan(200);
  });

  it('has no midcourse for a flight that stays below the terminal height, and treats cruise missiles as terminal only', () => {
    const short = planFlight('SRBM', 150_000, 'depressed')!;
    expect(short.apogeeM).toBeLessThan(100_000);
    expect(phaseWindows(short, DEFAULT_DEFENCE).midcourse).toBeNull();
    const cruise = planFlight('cruise', 500_000)!;
    const w = phaseWindows(cruise, DEFAULT_DEFENCE);
    expect(w.boost).toBeNull();
    expect(w.terminal).toEqual([0, cruise.flightTimeS]);
  });

  it('multiplies the layers a flight passes through', () => {
    const plan = planFlight('ICBM', 8_000_000)!;
    const settings = {
      ...DEFAULT_DEFENCE,
      layers: {
        boost: { enabled: true, shots: 1, killProbability: 0.2 },
        midcourse: { enabled: true, shots: 2, killProbability: 0.5 },
        terminal: { enabled: true, shots: 1, killProbability: 0.6 },
      },
    };
    expect(leakProbability(phaseWindows(plan, settings), settings)).toBeCloseTo(0.8 * 0.25 * 0.4, 12);
  });
});

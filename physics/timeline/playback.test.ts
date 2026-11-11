import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, detonate } from '../detonation';
import { ftToM } from '../units';
import { blastArrivalS, heatPulse } from './events';
import { arrivalCurve, blastTimeline, fireballRadiusAtM } from './playback';

describe('arrival curve', () => {
  const curve = arrivalCurve(1, ftToM(500), ftToM(8000));

  it('agrees with the direct calculation', () => {
    for (const feet of [200, 1000, 2640, 5280, 7500]) {
      const direct = blastArrivalS(1, ftToM(feet), ftToM(500));
      expect(curve.timeAtS(ftToM(feet)) / direct).toBeGreaterThan(0.98);
      expect(curve.timeAtS(ftToM(feet)) / direct).toBeLessThan(1.02);
    }
  });

  it('gives back the distance for a time, and nothing before the front reaches the ground', () => {
    for (const d of [300, 900, 1600, 2300]) {
      expect(curve.rangeAtM(curve.timeAtS(d)) / d).toBeCloseTo(1, 2);
    }
    expect(curve.rangeAtM(curve.timeAtS(0) * 0.9)).toBe(0);
    expect(curve.rangeAtM(0)).toBe(0);
  });
});

describe('timeline of a detonation', () => {
  const result = detonate({ ...DEFAULT_SCENARIO, yieldKt: 100 });
  const timeline = blastTimeline(result);

  it('puts the events in order: heat first, then the rings from the inside out, the cloud last', () => {
    const ids = timeline.events.map((event) => event.id);
    expect(ids[0]).toBe('heatPeak');
    expect(ids[ids.length - 1]).toBe('cloudTop');
    const at = (id: string): number => timeline.events.find((event) => event.id === id)!.timeS;
    expect(at('blast5')).toBeLessThan(at('blast2'));
    expect(at('blast2')).toBeLessThan(at('blast1'));
    for (let i = 1; i < timeline.events.length; i++) expect(timeline.events[i]!.timeS).toBeGreaterThanOrEqual(timeline.events[i - 1]!.timeS);
  });

  it('has the blast front at each ring at the time of its event', () => {
    for (const ring of result.rings.filter((r) => r.kind === 'blast' && r.radiusM > 0)) {
      const time = timeline.events.find((event) => event.id === ring.id)!.timeS;
      expect(timeline.arrival.rangeAtM(time) / ring.radiusM).toBeCloseTo(1, 2);
    }
    expect(timeline.durationS).toBeGreaterThan(timeline.blastEndS);
  });

  it('explains itself with a source', () => {
    expect(timeline.explanation.sources).toContain('gd1977');
    expect(timeline.explanation.outputs[0]!.value).toBeGreaterThan(0);
  });
});

describe('fireball growth', () => {
  it('reaches its largest radius at the peak of the heat pulse and stays there', () => {
    const pulse = heatPulse(100);
    expect(fireballRadiusAtM(500, pulse, 0)).toBe(0);
    expect(fireballRadiusAtM(500, pulse, pulse.peakS / 10)).toBeLessThan(500);
    expect(fireballRadiusAtM(500, pulse, pulse.peakS)).toBe(500);
    expect(fireballRadiusAtM(500, pulse, 60)).toBe(500);
  });
});

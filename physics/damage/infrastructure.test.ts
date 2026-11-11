import { describe, expect, it } from 'vitest';
import { infrastructureFinding, infrastructureThresholdPsi } from './infrastructure';

describe('damage to infrastructure', () => {
  it('follows Table 5.153 for parked transport aircraft: light at 1, moderate at 2, severe at 3 psi', () => {
    expect(infrastructureFinding('airport', 0.5).damage).toBe('none');
    expect(infrastructureFinding('airport', 1).damage).toBe('light');
    expect(infrastructureFinding('airport', 2).damage).toBe('moderate');
    expect(infrastructureFinding('airport', 2.9).damage).toBe('moderate');
    expect(infrastructureFinding('airport', 3).damage).toBe('severe');
    expect(infrastructureFinding('airport', 40).damage).toBe('severe');
    expect(infrastructureThresholdPsi('airport')).toBe(1);
  });

  it('reports the two power system tests and says so above them', () => {
    expect(infrastructureFinding('power', 1).damage).toBe('none');
    expect(infrastructureFinding('power', 1.7).damage).toBe('light');
    expect(infrastructureFinding('power', 5).damage).toBe('moderate');
    expect(infrastructureFinding('power', 12).damage).toBe('beyond');
    expect(infrastructureFinding('power', Number.NaN).damage).toBe('none');
    expect(infrastructureThresholdPsi('power')).toBe(1.7);
  });
});

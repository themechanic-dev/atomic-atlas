import { describe, expect, it } from 'vitest';
import { shipDamage, closeupState, tinderIgnitionCal } from './closeup';

describe('close view of a point', () => {
  it('reads the ignition exposure of newspaper from Table 7.40', () => {
    expect(tinderIgnitionCal(35)).toBeCloseTo(6, 6);
    expect(tinderIgnitionCal(1400)).toBeCloseTo(8, 6);
    expect(tinderIgnitionCal(20000)).toBeCloseTo(15, 6);
    expect(tinderIgnitionCal(1)).toBe(6);
    expect(tinderIgnitionCal(200)).toBeGreaterThan(6);
    expect(tinderIgnitionCal(200)).toBeLessThan(8);
  });

  it('shows the Nevada house tests: destroyed at 5 psi, standing at 1.7 psi', () => {
    const at5 = closeupState({ yieldKt: 30, rangeM: 100_000, overpressurePsi: 5, exposureCal: 12, arrivalS: 4 });
    expect(at5.building.id).toBe('collapse');
    expect(at5.vehiclesOverturned).toBe(true);
    expect(at5.windowsBroken).toBe(true);
    expect(at5.firesStart).toBe(true);
    expect(at5.aircraft).toBe('severe');
    const at17 = closeupState({ yieldKt: 30, rangeM: 100_000, overpressurePsi: 1.7, exposureCal: 3, arrivalS: 9 });
    expect(at17.building.id).toBe('light');
    expect(at17.building.heightKept).toBe(1);
    expect(at17.vehiclesOverturned).toBe(false);
    expect(at17.firesStart).toBe(false);
    expect(at17.aircraft).toBe('light');
  });

  it('gives the wind behind the front: about 160 mph at 5 psi (Table 3.07)', () => {
    const state = closeupState({ yieldKt: 100, rangeM: 100_000, overpressurePsi: 5, exposureCal: 0, arrivalS: 5 });
    expect(state.windMs / 0.44704).toBeGreaterThan(155);
    expect(state.windMs / 0.44704).toBeLessThan(170);
  });

  it('leaves everything standing far away', () => {
    const far = closeupState({ yieldKt: 100, rangeM: 100_000, overpressurePsi: 0.3, exposureCal: 0.5, arrivalS: 40 });
    expect(far.building.level).toBe(0);
    expect(far.windowsBroken).toBe(false);
    expect(far.aircraft).toBe('none');
  });

  it('reads merchant ship damage from Figure 5.146', () => {
    // The worked example of Figure 5.146 gives cube-root scaling; 1 kt: severe to 561 ft, moderate to 641 ft.
    expect(shipDamage(1, 160)).toBe('severe');
    expect(shipDamage(1, 180)).toBe('moderate');
    expect(shipDamage(1, 200)).toBe('none');
    expect(shipDamage(1000, 1700)).toBe('severe');
    expect(shipDamage(1000, 1900)).toBe('moderate');
  });
});

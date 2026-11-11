import { describe, expect, it } from 'vitest';
import { DAMAGE_BANDS, damageBand } from './levels';

describe('damage levels', () => {
  it('follow the blast rings: 20, 5, 2 and 1 psi', () => {
    expect(damageBand(50).id).toBe('destroyed');
    expect(damageBand(20).level).toBe(4);
    expect(damageBand(19.9).level).toBe(3);
    expect(damageBand(5).level).toBe(3);
    expect(damageBand(4.9).level).toBe(2);
    expect(damageBand(2).level).toBe(2);
    expect(damageBand(1.5).level).toBe(1);
    expect(damageBand(0.5).level).toBe(0);
    expect(damageBand(Number.NaN).level).toBe(0);
  });

  it('leave less standing the worse the damage', () => {
    for (let i = 1; i < DAMAGE_BANDS.length; i++) {
      expect(DAMAGE_BANDS[i]!.minPsi).toBeLessThan(DAMAGE_BANDS[i - 1]!.minPsi);
      expect(DAMAGE_BANDS[i]!.heightKept).toBeGreaterThanOrEqual(DAMAGE_BANDS[i - 1]!.heightKept);
    }
  });
});

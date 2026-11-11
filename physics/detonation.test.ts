// Tests for the combined detonation result.

import { describe, expect, it } from 'vitest';
import { detonate, DEFAULT_SCENARIO, resolveBurstHeightM, type Scenario } from './detonation';
import { falloutFreeHeightM } from './fireball';
import { ftToM } from './units';

const scenario = (patch: Partial<Scenario>): Scenario => ({ ...DEFAULT_SCENARIO, ...patch });
const ringOf = (s: Scenario, id: string): number => detonate(s).rings.find((r) => r.id === id)!.radiusM;

describe('burst height', () => {
  it('surface bursts are at 0 m, custom heights are kept', () => {
    expect(resolveBurstHeightM(scenario({ burstMode: 'surface' }))).toBe(0);
    expect(resolveBurstHeightM(scenario({ burstMode: 'custom', heightM: 580 }))).toBe(580);
  });

  it('an optimum air burst pushes 5 psi further than a surface burst of the same yield', () => {
    expect(ringOf(scenario({ burstMode: 'airburst' }), 'blast5')).toBeGreaterThan(ringOf(scenario({ burstMode: 'surface' }), 'blast5') * 1.3);
  });
});

describe('rings', () => {
  it('are ordered: heavier blast inside lighter blast', () => {
    const d = detonate(scenario({ yieldKt: 300 }));
    const r = (id: string): number => d.rings.find((x) => x.id === id)!.radiusM;
    expect(r('blast20')).toBeLessThan(r('blast5'));
    expect(r('blast5')).toBeLessThan(r('blast2'));
    expect(r('blast2')).toBeLessThan(r('blast1'));
    expect(r('burn3')).toBeLessThan(r('burn2'));
    expect(r('burn2')).toBeLessThan(r('burn1'));
  });

  it('grow with yield', () => {
    for (const id of ['blast5', 'burn3', 'blast1']) {
      expect(ringOf(scenario({ yieldKt: 1000 }), id)).toBeGreaterThan(ringOf(scenario({ yieldKt: 100 }), id));
    }
  });

  it('every ring carries its explanation and at least one source', () => {
    for (const ring of detonate(DEFAULT_SCENARIO).rings) {
      expect(ring.explanation.formula.length).toBeGreaterThan(5);
      expect(ring.explanation.sources.length).toBeGreaterThan(0);
      expect(ring.explanation.where.length).toBeGreaterThan(3);
      expect(ring.areaM2).toBeCloseTo(Math.PI * ring.radiusM ** 2, 3);
    }
  });

  it('the fireball of a high air burst does not reach the ground', () => {
    const d = detonate(scenario({ yieldKt: 15, burstMode: 'custom', heightM: 580 }));
    expect(d.rings.find((r) => r.id === 'fireball')!.radiusM).toBe(0);
  });

  it('haze shortens the reach of burns but not of blast', () => {
    const clear = scenario({ yieldKt: 1000, visibilityM: 40000 });
    const hazy = scenario({ yieldKt: 1000, visibilityM: 5000 });
    expect(ringOf(hazy, 'burn3')).toBeLessThan(ringOf(clear, 'burn3') * 0.8);
    expect(ringOf(hazy, 'blast5')).toBeCloseTo(ringOf(clear, 'blast5'), 6);
  });
});

describe('Hiroshima as a whole (12.5 kt at 1,670 ft, Glasstone & Dolan §2.24)', () => {
  const d = detonate(scenario({ yieldKt: 12.5, burstMode: 'custom', heightM: ftToM(1670), fissionFraction: 1 }));

  it('no local fallout: the burst was far above the fallout-free height', () => {
    expect(ftToM(1670)).toBeGreaterThan(falloutFreeHeightM(12.5));
    expect(d.fallout.significant).toBe(false);
    expect(d.fallout.model).toBeNull();
  });

  it('third-degree burns reach further than heavy blast damage, as observed', () => {
    const r = (id: string): number => d.rings.find((x) => x.id === id)!.radiusM;
    expect(r('burn3')).toBeGreaterThan(r('blast5'));
  });
});

describe('fallout switch', () => {
  it('a surface burst has local fallout along the effective wind', () => {
    const d = detonate(scenario({ burstMode: 'surface', wind: [{ heightM: 10, speedMs: 8, fromDeg: 225 }] }));
    expect(d.fallout.significant).toBe(true);
    expect(d.fallout.localFraction).toBe(1);
    expect(d.fallout.wind.towardsDeg).toBeCloseTo(45, 6);
    expect(d.fallout.model!.contourExtentM(10)![1]).toBeGreaterThan(20000);
  });

  it('a clean (no fission) device has none', () => {
    expect(detonate(scenario({ burstMode: 'surface', fissionFraction: 0 })).fallout.significant).toBe(false);
  });
});

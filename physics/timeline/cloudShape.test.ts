import { describe, expect, it } from 'vitest';
import { stabilisedCloud, stabilisedCloudRadiusM, stemRadiusShare } from '../fallout/cloud';
import { ftToM, kftToM, miToM } from '../units';
import { heatPulse } from './events';
import { CLOUD_STABLE_S, cloudGrowth, cloudSpreadShare } from './cloudShape';

describe('stabilised cloud radius (Glasstone & Dolan Fig. 2.16)', () => {
  it('reads the figure', () => {
    expect(stabilisedCloudRadiusM(1000) / kftToM(27.9)).toBeCloseTo(1, 3);
    expect(stabilisedCloudRadiusM(100) / kftToM(8.7)).toBeCloseTo(1, 3);
    // Between the read points it follows the curve in the logarithm of the yield.
    expect(stabilisedCloudRadiusM(300)).toBeGreaterThan(stabilisedCloudRadiusM(200));
    expect(stabilisedCloudRadiusM(300)).toBeLessThan(stabilisedCloudRadiusM(500));
  });

  it('agrees with the 10 kt cloud of §2.16: about 10,000 feet across', () => {
    const across = 2 * stabilisedCloudRadiusM(10);
    expect(across / ftToM(10_000)).toBeGreaterThan(0.7);
    expect(across / ftToM(10_000)).toBeLessThan(1.3);
  });

  it('is wider than the cloud is tall in the megaton range (§2.17)', () => {
    expect(2 * stabilisedCloudRadiusM(10_000)).toBeGreaterThan(stabilisedCloud(10_000).topM);
    expect(2 * stabilisedCloudRadiusM(10)).toBeLessThan(stabilisedCloud(10).topM);
  });

  it('keeps shrinking below the figure', () => {
    expect(stabilisedCloudRadiusM(0.1)).toBeLessThan(stabilisedCloudRadiusM(1));
    expect(stabilisedCloudRadiusM(0.1)).toBeGreaterThan(0);
  });
});

describe('stem of the mushroom (§2.17)', () => {
  it('is about half the cloud radius below 20 kt and a fifth to a tenth for megatons', () => {
    expect(stemRadiusShare(10)).toBe(0.5);
    expect(stemRadiusShare(1000)).toBeCloseTo(0.15, 6);
    for (const w of [1000, 3000, 10_000, 30_000]) {
      expect(stemRadiusShare(w)).toBeLessThanOrEqual(0.2);
      expect(stemRadiusShare(w)).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe('growth of the cloud in time', () => {
  it('spreads as in Fig. 10.158c and reaches the radius of Fig. 2.16 at 10 minutes', () => {
    expect(cloudSpreadShare(0)).toBe(0);
    expect(cloudSpreadShare(60)).toBeCloseTo(0.21, 6);
    expect(cloudSpreadShare(CLOUD_STABLE_S)).toBe(1);
    for (let t = 1; t < 400; t *= 1.5) expect(cloudSpreadShare(t * 1.5)).toBeGreaterThan(cloudSpreadShare(t));
  });

  it('spreads sooner for a smaller yield, with the cube root of the yield (§10.158)', () => {
    // 8 kt is 1 Mt / 125: its times are a fifth.
    expect(cloudSpreadShare(12, 8)).toBeCloseTo(cloudSpreadShare(60), 6);
    expect(cloudSpreadShare(CLOUD_STABLE_S, 8)).toBe(1);
    // Above 1 Mt the 1 Mt timing is kept.
    expect(cloudSpreadShare(60, 10_000)).toBe(cloudSpreadShare(60));
  });

  const megaton = cloudGrowth(1000, 0, heatPulse(1000), 1000);

  it('has its stabilised dimensions at 10 minutes', () => {
    const end = megaton.at(CLOUD_STABLE_S, 1000);
    const heights = stabilisedCloud(1000);
    expect(end.topM / heights.topM).toBeCloseTo(1, 3);
    expect(end.headRadiusM / stabilisedCloudRadiusM(1000)).toBeCloseTo(1, 3);
    expect(end.headBottomM / heights.bottomM).toBeCloseTo(1, 3);
    expect(end.stemRadiusM / end.headRadiusM).toBeCloseTo(stemRadiusShare(1000), 3);
  });

  it('rises like Table 2.12 for 1 Mt: about 3 miles in 30 seconds, 5 in about a minute (§2.12)', () => {
    expect(megaton.at(30, 1000).topM / miToM(3)).toBeGreaterThan(0.8);
    expect(megaton.at(30, 1000).topM / miToM(3)).toBeLessThan(1.25);
    expect(megaton.at(60, 1000).topM / miToM(5)).toBeGreaterThan(0.85);
    expect(megaton.at(60, 1000).topM / miToM(5)).toBeLessThan(1.2);
  });

  it('starts as the fireball: a ball with no stem', () => {
    const early = megaton.at(1, 600);
    expect(early.headRadiusM).toBe(600);
    expect((early.topM - early.headBottomM) / 1200).toBeGreaterThan(0.95);
    expect(early.headLowerShare).toBeGreaterThan(0.49);
    expect(early.stemRadiusM).toBe(0);
    expect(early.glow).toBe(1);
  });

  it('stops glowing after about a minute and turns from red-brown to white (§2.05, §2.08)', () => {
    expect(megaton.at(30, 1000).glow).toBeGreaterThan(0.2);
    expect(megaton.at(65, 1000).glow).toBe(0);
    expect(megaton.at(60, 1000).brown).toBeGreaterThan(0.9);
    expect(megaton.at(CLOUD_STABLE_S, 1000).brown).toBe(0);
  });

  it('flattens a megaton head but leaves a small cloud round', () => {
    const big = megaton.at(CLOUD_STABLE_S, 1000);
    expect((big.topM - big.headBottomM) / big.headRadiusM).toBeLessThan(1.2);
    const small = cloudGrowth(15, 580, heatPulse(15), 150).at(CLOUD_STABLE_S, 150);
    expect((small.topM - small.headBottomM) / small.headRadiusM).toBeGreaterThan(1.6);
  });

  it('keeps the head of a very large cloud up on its stem while it spreads', () => {
    const bravo = cloudGrowth(15_000, 0, heatPulse(15_000), 3000);
    for (const t of [60, 90, 180, 300]) {
      const shape = bravo.at(t, 3000);
      expect(shape.headBottomM).toBeGreaterThan(0.3 * shape.topM);
    }
  });

  it('draws no stem under a burst above the base of the cloud', () => {
    const high = cloudGrowth(100, 20_000, heatPulse(100), 300);
    expect(high.at(CLOUD_STABLE_S, 300).stemRadiusM).toBe(0);
    expect(high.stabilised.stemRadiusM).toBe(0);
  });
});

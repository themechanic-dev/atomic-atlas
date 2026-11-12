import { describe, expect, it } from 'vitest';
import { heatPulse } from '@physics/timeline/events';
import { CLOUD_STABLE_S, cloudGrowth } from '@physics/timeline/cloudShape';
import { latheMesh, mushroomProfile } from './mushroom';

const hiroshima = cloudGrowth(15, 580, heatPulse(15), 150);
const surfaceMegaton = cloudGrowth(1000, 0, heatPulse(1000), 1000);

describe('outline of the mushroom cloud', () => {
  it('runs from the foot of the stem to the top of the head, on the axis', () => {
    const shape = hiroshima.at(CLOUD_STABLE_S, 150);
    const profile = mushroomProfile(shape);
    expect(profile[0]!.z).toBe(0);
    expect(profile[0]!.part).toBe(0);
    const top = profile[profile.length - 1]!;
    expect(top.r).toBeCloseTo(0, 6);
    expect(top.z).toBeCloseTo(shape.topM, 3);
    // The head is as wide as the physics says, and the stem is narrower.
    const widest = Math.max(...profile.filter((p) => p.part === 1).map((p) => p.r));
    expect(widest / shape.headRadiusM).toBeCloseTo(1, 3);
    const stemWidest = Math.max(...profile.filter((p) => p.part === 0 && p.z > shape.headBottomM * 0.2).map((p) => p.r));
    expect(stemWidest).toBeLessThan(shape.headRadiusM);
  });

  it('points its normals outwards: up at the top, out at the rim, down under the head', () => {
    const profile = mushroomProfile(surfaceMegaton.at(CLOUD_STABLE_S, 1000));
    const head = profile.filter((p) => p.part === 1);
    expect(head[head.length - 1]!.nz).toBeGreaterThan(0.9);
    const rim = head.reduce((best, p) => (p.r > best.r ? p : best));
    expect(rim.nr).toBeGreaterThan(0.9);
    expect(head[1]!.nz).toBeLessThan(0);
  });

  it('keeps a fireball that still touches the ground above it, with no stem yet', () => {
    const profile = mushroomProfile(surfaceMegaton.at(0.5, 900));
    expect(profile.length).toBeGreaterThan(10);
    expect(profile.every((p) => p.z >= 0)).toBe(true);
    expect(profile.every((p) => p.part === 1)).toBe(true);
  });

  it('is empty before the fireball has any size', () => {
    expect(mushroomProfile(surfaceMegaton.at(0, 0))).toEqual([]);
  });
});

describe('the cloud turned around its axis', () => {
  it('makes a closed ring of triangles for each step of the outline', () => {
    const profile = mushroomProfile(hiroshima.at(120, 150));
    const mesh = latheMesh(profile, 72);
    expect(mesh.vertices).toBe(profile.length * 73);
    expect(mesh.index.length).toBe(72 * (profile.length - 1) * 6);
    expect(Math.max(...mesh.index)).toBeLessThan(mesh.vertices);
    // The seam closes: the last column is where the first one is.
    const n = profile.length;
    expect(mesh.local[72 * n * 3]!).toBeCloseTo(mesh.local[0]!, 3);
    expect(mesh.local[72 * n * 3 + 1]!).toBeCloseTo(mesh.local[1]!, 3);
  });

  it('stays within the number of vertices a 16-bit index can reach', () => {
    const mesh = latheMesh(mushroomProfile(surfaceMegaton.at(CLOUD_STABLE_S, 1000)), 72);
    expect(mesh.vertices).toBeLessThan(65_536);
  });
});

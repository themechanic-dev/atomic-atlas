import type { EffectRing } from '@physics/detonation';
import type { Point } from 'geojson';
import { describe, expect, it } from 'vitest';
import { cloudPathFeatures, ringLabelFeatures } from './overlays';

const AT = { lng: 30, lat: 25 };
const ring = (id: string, radiusM: number): EffectRing => ({ id, radiusM }) as unknown as EffectRing;
const RINGS = [ring('blast5', 3100), ring('blast2', 5500), ring('burn2', 5850), ring('burn1', 7810), ring('blast1', 9070)];
const labels = (windTowardsDeg?: number) =>
  ringLabelFeatures(AT, RINGS, (r) => r.id, windTowardsDeg).features.map((f) => ({
    lng: (f.geometry as Point).coordinates[0],
    lat: (f.geometry as Point).coordinates[1],
    anchor: f.properties?.anchor as string,
  }));

describe('ring labels', () => {
  it('sit on the east side, reading to the right, when there is no wind', () => {
    for (const l of labels()) {
      expect(l.lng).toBeGreaterThan(AT.lng);
      expect(l.anchor).toBe('left');
    }
  });

  it('keep away from a cloud carried east: all on the west side, reading to the left', () => {
    for (const l of labels(90)) {
      expect(l.lng).toBeLessThan(AT.lng);
      expect(l.anchor).toBe('right');
    }
  });

  it('keep away from a cloud carried north: all south of ground zero', () => {
    for (const l of labels(0)) expect(l.lat).toBeLessThan(AT.lat);
  });
});

describe("the cloud's path", () => {
  const result = (speedMs: number, towardsDeg: number) =>
    ({ fallout: { wind: { speedMs, towardsDeg }, path: { firstDayM: speedMs * 86400, halfWidthM: (x: number) => 2000 + x / 50 } } }) as never;
  const ring = (r: ReturnType<typeof cloudPathFeatures>) => r.features[0]!.geometry.coordinates[0]!;

  it('runs downwind for a day: a cloud carried east ends far east of ground zero', () => {
    const coords = ring(cloudPathFeatures(AT, result(6.7, 90)));
    const east = Math.max(...coords.map((c) => c[0]!));
    // 6.7 m/s for 24 h is 579 km; a degree of longitude at 25° N is about 101 km.
    expect(east - AT.lng).toBeGreaterThan(5.5);
    expect(Math.min(...coords.map((c) => c[0]!))).toBeGreaterThan(AT.lng - 0.05);
  });

  it('is cut where the cloud has got to during playback', () => {
    const coords = ring(cloudPathFeatures(AT, result(6.7, 90), 20_000));
    expect(Math.max(...coords.map((c) => c[0]!)) - AT.lng).toBeLessThan(0.3);
  });

  it('is not drawn in calm air', () => {
    expect(cloudPathFeatures(AT, result(0, 180)).features).toHaveLength(0);
  });
});

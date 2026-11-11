// Tests for the parts of the web UI that do not need a browser: translations,
// settings, formatting inputs, geometry, the weather parser and the catalog.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import el from '../app/i18n/el.json';
import en from '../app/i18n/en.json';
import { parseWeather, weatherUrl } from '../app/data/weather';
import {
  alongGreatCircle,
  beyondHorizon,
  circleRing,
  destination,
  distanceM,
  fromWindFrame,
  initialBearing,
  pointInRing,
  sideViewHeading,
} from '../app/lib/geo';
import { DEFAULT_SETTINGS, parseSettings } from '../app/state/settings';
import scenarios from '../data/scenarios.json';
import { planFlight, reachM } from '../physics/ballistics/flight';
import weapons from '../data/weapons.json';

const root = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'public' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('translations', () => {
  const enKeys = Object.keys(en);
  const elKeys = Object.keys(el);

  it('Greek has every English key and no extra ones', () => {
    expect(elKeys.filter((k) => !(k in en))).toEqual([]);
    expect(enKeys.filter((k) => !(k in el))).toEqual([]);
  });

  it('placeholders match between the languages', () => {
    const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of enKeys) {
      expect(placeholders((el as Record<string, string>)[key]!), key).toEqual(placeholders((en as Record<string, string>)[key]!));
    }
  });

  it('no text is empty', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(el)]) expect(value.trim().length, key).toBeGreaterThan(0);
  });

  it('every key written out in the code exists', () => {
    const missing = new Set<string>();
    for (const file of sourceFiles('app')) {
      const text = readFileSync(join(root, file), 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([^'$]+)'/g)) {
        if (!(match[1]! in en)) missing.add(`${file}: ${match[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('every key built from data exists: effects, presets, countries, categories, platforms, status', () => {
    const needed = [
      ...['fireball', 'blast20', 'blast5', 'blast2', 'blast1', 'burn3', 'burn2', 'burn1', 'radiation450'].flatMap((id) => [`effect.${id}`, `effect.${id}.short`]),
      ...['fireball', 'blast', 'thermal', 'radiation', 'fallout'].flatMap((id) => [`how.${id}.body`, `how.${id}.uncertainty`]),
      ...scenarios.map((s) => `preset.${s.id}`),
      ...weapons.map((w) => `country.${w.country}`),
      ...weapons.map((w) => `category.${w.category}`),
      ...weapons.map((w) => `status.${w.status}`),
      ...weapons.flatMap((w) => w.platform.map((p) => `platform.${p}`)),
      ...['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((c) => `compass.${c}`),
      ...['openfreemap', 'builtin', 'satellite'].map((m) => `settings.map.${m}.hint`),
      ...['openmeteo', 'manual'].map((w) => `settings.weather.${w}.hint`),
      ...['airburst', 'surface', 'custom'].map((b) => `scenario.burst.${b}`),
    ];
    expect([...new Set(needed)].filter((k) => !(k in en))).toEqual([]);
  });
});

describe('settings', () => {
  it('start with English, kilometres, Celsius and the dark theme', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ language: 'en', distance: 'km', temperature: 'C', theme: 'dark' });
  });

  it('survive a round trip', () => {
    const custom = { ...DEFAULT_SETTINGS, language: 'el', distance: 'mi', temperature: 'F', theme: 'light', terrain3d: true } as const;
    expect(parseSettings(JSON.stringify(custom))).toEqual(custom);
  });

  it('ignore damaged or unknown values', () => {
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ language: 'xx', distance: 7, theme: 'neon', extra: true }))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('geometry', () => {
  const athens = { lat: 37.98, lng: 23.73 };

  it('destination and distance agree', () => {
    for (const bearing of [0, 37, 90, 181, 270, 333]) {
      const p = destination(athens, bearing, 12345);
      expect(distanceM(athens, p)).toBeCloseTo(12345, 0);
    }
  });

  it('a circle is closed and every point is at the radius', () => {
    const ring = circleRing(athens, 5000, 64);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) expect(distanceM(athens, { lng, lat })).toBeCloseTo(5000, 0);
  });

  it('wind coordinates: downwind of a westerly wind is to the east, left of the wind is north', () => {
    const downwind = fromWindFrame(athens, 90, 10000, 0);
    expect(downwind.lng).toBeGreaterThan(athens.lng);
    expect(downwind.lat).toBeCloseTo(athens.lat, 2);
    const left = fromWindFrame(athens, 90, 0, 10000);
    expect(left.lat).toBeGreaterThan(athens.lat);
  });

  it('circles near the antimeridian do not jump across the map', () => {
    const ring = circleRing({ lat: 11.7, lng: 179.9 }, 50000, 32);
    for (const [lng] of ring) expect(Math.abs(lng - 179.9)).toBeLessThan(2);
  });
});

describe('weather', () => {
  const response = {
    elevation: 99,
    current: {
      time: '2026-11-11T12:45',
      temperature_2m: 20.3,
      wind_speed_10m: 1.53,
      wind_direction_10m: 212,
      wind_speed_850hPa: 14.84,
      wind_direction_850hPa: 294,
      geopotential_height_850hPa: 1522,
      wind_speed_500hPa: 17.16,
      wind_direction_500hPa: 299,
      geopotential_height_500hPa: 5751,
      wind_speed_250hPa: 27.83,
      wind_direction_250hPa: 317,
      geopotential_height_250hPa: 10603.81,
    },
  };

  it('reads four wind levels with heights above ground', () => {
    const snapshot = parseWeather(response);
    expect(snapshot.levels).toHaveLength(4);
    expect(snapshot.levels[1]).toEqual({ heightM: 1423, speedMs: 14.84, fromDeg: 294 });
    expect(snapshot.temperatureK).toBeCloseTo(293.45, 2);
    expect(snapshot.time).toBe('2026-11-11T12:45');
  });

  it('drops pressure levels that lie below high ground', () => {
    const tibet = { ...response, elevation: 4500 };
    expect(parseWeather(tibet).levels.map((l) => Math.round(l.heightM))).toEqual([10, 1251, 6104]);
  });

  it('rejects an incomplete answer', () => {
    expect(() => parseWeather({ current: { temperature_2m: 1 } })).toThrow();
    expect(() => parseWeather({})).toThrow();
  });

  it('asks only for the point and the wind fields', () => {
    const url = new URL(weatherUrl({ lat: 37.98, lng: 23.73 }));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    expect(url.searchParams.get('current')).toContain('wind_speed_250hPa');
  });
});

describe('catalog', () => {
  it('has all nine nuclear-armed states', () => {
    const countries = new Set(weapons.map((w) => (w.country === 'SU' ? 'RU' : w.country)));
    expect([...countries].sort()).toEqual(['CN', 'FR', 'GB', 'IL', 'IN', 'KP', 'PK', 'RU', 'US']);
  });

  it('every entry has a unique id, a yield and a source that can be opened', () => {
    const ids = new Set<string>();
    for (const w of weapons) {
      expect(ids.has(w.id), w.id).toBe(false);
      ids.add(w.id);
      expect(w.yieldsKt.length, w.id).toBeGreaterThan(0);
      for (const y of w.yieldsKt) expect(y, w.id).toBeGreaterThan(0);
      expect(w.sources.length, w.id).toBeGreaterThan(0);
      for (const s of w.sources) expect(s.url, w.id).toMatch(/^https:\/\//);
      expect(w.warheadsMax, w.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('holds effects data only: no accuracy or targeting fields', () => {
    const allowed = new Set([
      'id', 'name', 'designations', 'country', 'category', 'platform', 'carrier', 'rangeKm', 'warheadsMax', 'mirv',
      'yieldsKt', 'fissionFraction', 'year', 'status', 'estimate', 'sources', 'note',
    ]);
    for (const w of weapons) for (const key of Object.keys(w)) expect(allowed.has(key), `${w.id}.${key}`).toBe(true);
    expect(JSON.stringify(weapons)).not.toMatch(/\bCEP\b|circular error/i);
  });

  it('presets point at catalog entries that exist', () => {
    for (const s of scenarios) {
      if (s.weaponId) expect(weapons.some((w) => w.id === s.weaponId), s.id).toBe(true);
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('every missile flies: a flight plan exists out to its published range on every path', () => {
    const missiles = weapons.filter((w) => w.rangeKm !== null);
    expect(missiles.length).toBeGreaterThan(30);
    for (const w of missiles) {
      const rangeM = (w.rangeKm as number) * 1000;
      expect(rangeM, w.id).toBeGreaterThan(0);
      expect(w.warheadsMax, w.id).toBeGreaterThanOrEqual(1);
      for (const shape of ['minimumEnergy', 'lofted', 'depressed'] as const) {
        const reach = reachM(w.category, rangeM, shape);
        expect(reach, w.id).toBeGreaterThan(0);
        expect(reach, w.id).toBeLessThanOrEqual(rangeM);
        const plan = planFlight(w.category, reach, shape);
        expect(plan, `${w.id} ${shape}`).not.toBeNull();
        expect(plan!.flightTimeS, w.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('great circles', () => {
  const athens = { lat: 37.98, lng: 23.73 };
  const tokyo = { lat: 35.68, lng: 139.69 };

  it('walks from one end to the other', () => {
    const total = distanceM(athens, tokyo);
    expect(distanceM(alongGreatCircle(athens, tokyo, 0), athens)).toBeLessThan(1);
    expect(distanceM(alongGreatCircle(athens, tokyo, 1), tokyo)).toBeLessThan(5);
    const mid = alongGreatCircle(athens, tokyo, 0.5);
    expect(distanceM(athens, mid) / total).toBeCloseTo(0.5, 6);
    expect(distanceM(mid, tokyo) / total).toBeCloseTo(0.5, 6);
  });

  it('gives the compass bearing of the start of the path', () => {
    expect(initialBearing({ lat: 0, lng: 0 }, { lat: 10, lng: 0 })).toBeCloseTo(0, 6);
    expect(initialBearing({ lat: 0, lng: 0 }, { lat: 0, lng: 10 })).toBeCloseTo(90, 6);
    expect(initialBearing({ lat: 0, lng: 0 }, { lat: -10, lng: 0 })).toBeCloseTo(180, 6);
    // Athens to Tokyo starts towards the north-east, over the Black Sea.
    const bearing = initialBearing(athens, tokyo);
    expect(bearing).toBeGreaterThan(40);
    expect(bearing).toBeLessThan(60);
  });

  it('tells inside from outside a ring', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    expect(pointInRing({ lng: 5, lat: 5 }, square)).toBe(true);
    expect(pointInRing({ lng: 15, lat: 5 }, square)).toBe(false);
    expect(pointInRing({ lng: 5, lat: -1 }, square)).toBe(false);
  });
});

describe('looking at the globe', () => {
  it('looks at a flight from the side that keeps north towards the top', () => {
    expect(sideViewHeading(90)).toBe(0); // eastward flight: look north
    expect(sideViewHeading(270)).toBe(0); // westward flight: look north
    expect(sideViewHeading(0)).toBe(90); // northward flight: look east
    for (let bearing = 0; bearing < 360; bearing += 7) {
      const heading = sideViewHeading(bearing);
      expect(Math.cos((heading * Math.PI) / 180)).toBeGreaterThanOrEqual(-1e-12);
      expect(Math.abs(Math.cos(((heading - bearing) * Math.PI) / 180))).toBeLessThan(1e-9);
    }
  });

  it('knows which ground is hidden behind the curve of the Earth', () => {
    const r = 6_371_000;
    const camera = { x: r * 3, y: 0, z: 0 }; // high above 0 N, 0 E
    expect(beyondHorizon(camera, { x: r, y: 0, z: 0 })).toBe(false); // straight below
    expect(beyondHorizon(camera, { x: -r, y: 0, z: 0 })).toBe(true); // the other side
    expect(beyondHorizon(camera, { x: 0, y: r, z: 0 })).toBe(true); // 90 degrees away: past the horizon from this height
    // From 3 radii the horizon is acos(1/3) = 70.5 degrees away.
    const at = (deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180), z: 0 });
    expect(beyondHorizon(camera, at(65))).toBe(false);
    expect(beyondHorizon(camera, at(76))).toBe(true);
    // A camera on or under the surface hides nothing.
    expect(beyondHorizon({ x: r * 0.9, y: 0, z: 0 }, at(170))).toBe(false);
  });
});

describe('the director of a flight', () => {
  it('splits a flight into the flight and its last seconds', async () => {
    const { stageAt, timelineFor } = await import('../app/globe/director');
    const icbm = timelineFor(1800, 'ballistic');
    expect(icbm).toEqual({ terminalStartS: 1755, durationS: 1800 });
    expect(stageAt(0.1, icbm)).toBe('midcourse');
    expect(stageAt(1754, icbm)).toBe('midcourse');
    expect(stageAt(1755, icbm)).toBe('terminal');
    expect(stageAt(1800, icbm)).toBe('impact');
    // A short flight keeps most of its time for the flight itself.
    const short = timelineFor(180, 'ballistic');
    expect(short.terminalStartS).toBeCloseTo(158.4, 6);
    const cruise = timelineFor(8000, 'cruise');
    expect(cruise.terminalStartS).toBe(7940);
    expect(stageAt(5, timelineFor(0, 'ballistic'))).toBe('idle');
  });

  it('plays the last seconds slowly, the rest at the chosen speed', async () => {
    const { directedRate, TERMINAL_RATE } = await import('../app/globe/director');
    expect(directedRate('terminal', 300)).toBe(TERMINAL_RATE);
    expect(directedRate('midcourse', 300)).toBe(300);
    expect(directedRate('terminal', 5)).toBe(5);
  });

  it('has a launcher for every platform in the catalog that carries a missile', async () => {
    const { launcherKind } = await import('../app/globe/director');
    expect(launcherKind(['silo'])).toBe('silo');
    expect(launcherKind(['road-mobile'])).toBe('vehicle');
    expect(launcherKind(['rail-mobile', 'silo'])).toBe('vehicle');
    expect(launcherKind(['submarine', 'ship'])).toBe('submarine');
    expect(launcherKind(['ship'])).toBe('ship');
    expect(launcherKind(['aircraft'])).toBe('aircraft');
    expect(launcherKind(['surface'])).toBe('pad');
    const known = new Set(['silo', 'road-mobile', 'rail-mobile', 'submarine', 'ship', 'aircraft', 'surface', 'tower']);
    for (const w of weapons.filter((entry) => entry.rangeKm !== null)) {
      expect(w.platform.some((p) => known.has(p)), w.id).toBe(true);
    }
  });
});

describe('infrastructure inside the blast rings', () => {
  it('lists the sites the blast reaches, nearest first, with the finding for their kind', async () => {
    const { affectedSites, parseSites } = await import('../app/data/infrastructure');
    const sites = parseSites({
      sources: { airports: '', power: '' },
      fuels: ['nuclear', 'hydro', 'coal', 'gas', 'oil', 'other'],
      airports: [
        [0.05, 0, 'Near field', 1],
        [0.5, 0, 'Far field', 0],
      ],
      power: [
        [0, 0.02, 'Close station', 3],
        [0, 0.09, 'Weakly reached station', 1],
      ],
    });
    // A made-up blast: 10 psi at the centre, falling by 1 psi per kilometre.
    const found = affectedSites(sites, { lng: 0, lat: 0 }, 9000, (rangeM) => 10 - rangeM / 1000);
    expect(found.map((entry) => entry.site.name)).toEqual(['Close station', 'Near field']);
    expect(found[0]!.finding.damage).toBe('beyond');
    expect(found[0]!.site.detail).toBe('gas');
    expect(found[1]!.finding.damage).toBe('severe');
    expect(found[1]!.rangeM).toBeGreaterThan(5000);
    // The far station gets 0 psi and the far field is outside the search range.
    expect(affectedSites(sites, { lng: 0, lat: 0 }, 100_000, () => 0.5)).toEqual([]);
  });

  it('ships a data file with both kinds and plausible coordinates', () => {
    const file = JSON.parse(readFileSync(join(__dirname, '../app/public/data/infrastructure/sites.json'), 'utf8')) as {
      airports: Array<[number, number, string, number]>;
      power: Array<[number, number, string, number]>;
      fuels: string[];
    };
    expect(file.airports.length).toBeGreaterThan(3000);
    expect(file.power.length).toBeGreaterThan(3000);
    for (const [lng, lat, name] of [...file.airports, ...file.power]) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(typeof name).toBe('string');
    }
    for (const station of file.power) expect(file.fuels[station[3]]).toBeDefined();
  });
});

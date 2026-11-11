// The Atomic Atlas mark: a hazard ring around the globe, with electron orbits.
// One drawing serves as app icon, as logo in the top bar and, animated, as the
// "working" indicator. Pure string building, so the same code runs in the
// browser and in the icon build script.

import { LAND_PATH } from './logo-land';

export type LogoVariant = 'full' | 'simple' | 'tiny';

export interface LogoOptions {
  /** 'full' for 64 px and up, 'simple' for 24-48 px, 'tiny' for 16 px. */
  variant?: LogoVariant;
  /** Unique suffix for gradient and clip ids when several logos share a page. */
  uid?: string;
  /** Rounded dark tile behind the mark (app icons). Without it the mark floats. */
  background?: boolean;
  /** Animation time in seconds. */
  t?: number;
  /** Slows the motion to a quarter (reduced-motion setting). */
  gentle?: boolean;
}

const D2R = Math.PI / 180;
const LON0 = 10 * D2R;
const LAT0 = 22 * D2R;
const GLOBE_R = 52;
const RING_OUT = 88;
const RING_IN = 76;

interface Orbit {
  rx: number;
  ry: number;
  tilt: number;
}
const ORBITS: Orbit[] = [
  { rx: 74, ry: 24, tilt: 24 },
  { rx: 74, ry: 24, tilt: -24 },
];
/** orbit index, laps per 3-second loop, phase */
const ELECTRONS = [
  { o: 0, laps: 1, ph: 0.0 },
  { o: 1, laps: 1, ph: 0.5 },
  { o: 1, laps: 2, ph: 0.0 },
];

const STRIPES: Record<LogoVariant, number> = { full: 36, simple: 18, tiny: 12 };

const f = (n: number): string => n.toFixed(2);

function ortho(lon: number, lat: number): [number, number, boolean] {
  const l = lon * D2R;
  const p = lat * D2R;
  const cosc = Math.sin(LAT0) * Math.sin(p) + Math.cos(LAT0) * Math.cos(p) * Math.cos(l - LON0);
  const x = Math.cos(p) * Math.sin(l - LON0);
  const y = Math.cos(LAT0) * Math.sin(p) - Math.sin(LAT0) * Math.cos(p) * Math.cos(l - LON0);
  return [x * GLOBE_R, -y * GLOBE_R, cosc >= 0];
}

function graticule(): string {
  let d = '';
  const line = (pts: Array<[number, number, boolean]>): void => {
    let pen = false;
    for (const [x, y, visible] of pts) {
      if (visible) {
        d += (pen ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        pen = true;
      } else pen = false;
    }
  };
  for (let lon = -180; lon < 180; lon += 30) {
    const pts: Array<[number, number, boolean]> = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(ortho(lon, lat));
    line(pts);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: Array<[number, number, boolean]> = [];
    for (let lon = -180; lon <= 180; lon += 3) pts.push(ortho(lon, lat));
    line(pts);
  }
  return d;
}

function orbitPoint(o: Orbit, th: number): [number, number] {
  const x = o.rx * Math.cos(th);
  const y = o.ry * Math.sin(th);
  const a = o.tilt * D2R;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

function arc(o: Orbit, from: number, to: number): string {
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const [x, y] = orbitPoint(o, from + ((to - from) * i) / 60);
    d += (i ? 'L' : 'M') + f(x) + ' ' + f(y);
  }
  return d;
}

function stripes(count: number): string {
  // Slanted yellow blocks; the black of the ring shows between them.
  const period = (360 / count) * D2R;
  const width = period / 2;
  const skew = period * 0.7;
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = i * period;
    const pts: Array<[number, number]> = [
      [RING_IN, a],
      [RING_IN, a + width],
      [RING_OUT, a + width + skew],
      [RING_OUT, a + skew],
    ];
    d += pts.map(([r, t], j) => (j ? 'L' : 'M') + f(r * Math.cos(t)) + ' ' + f(r * Math.sin(t))).join('') + 'Z';
  }
  return d;
}

/** Rotation of the ring in degrees and position of each electron at time t. */
export function logoPose(t: number, variant: LogoVariant = 'full', gentle = false): {
  ringDeg: number;
  electrons: Array<{ x: number; y: number; front: boolean }>;
} {
  const k = gentle ? 0.25 : 1;
  // The ring turns 30 degrees a second: nine stripe periods of the full variant in the
  // 3-second electron loop, so a recorded loop of the full mark is seamless.
  const ringDeg = (t * 30 * k) % 360;
  const count = variant === 'tiny' ? 1 : ELECTRONS.length;
  const electrons = ELECTRONS.slice(0, count).map((e) => {
    const th = 2 * Math.PI * ((e.laps * t * k) / 3 + e.ph);
    const [x, y] = orbitPoint(ORBITS[e.o]!, th);
    return { x, y, front: Math.sin(th) >= 0 };
  });
  return { ringDeg, electrons };
}

/** Inner SVG markup of the mark, for a viewBox of "-100 -100 200 200". */
export function logoMarkup(options: LogoOptions = {}): string {
  const variant = options.variant ?? 'full';
  const uid = options.uid ?? 'a';
  const pose = logoPose(options.t ?? 0.4, variant, options.gentle);
  const full = variant === 'full';
  const tiny = variant === 'tiny';
  const orbits = tiny ? ORBITS.slice(0, 1) : ORBITS;
  const orbitWidth = full ? 4.2 : tiny ? 9 : 6.5;
  const electronR = full ? 5.6 : tiny ? 11 : 8;
  const out: string[] = [];

  out.push(
    '<defs>',
    `<radialGradient id="gl${uid}" cx="38%" cy="34%" r="75%"><stop offset="0" stop-color="#ffc566"/><stop offset=".55" stop-color="#e8922a"/><stop offset="1" stop-color="#a85a14"/></radialGradient>`,
    `<radialGradient id="disc${uid}" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#6d7073"/><stop offset="1" stop-color="#45484b"/></radialGradient>`,
    `<linearGradient id="bg${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34312d"/><stop offset="1" stop-color="#211f1c"/></linearGradient>`,
    `<clipPath id="clip${uid}"><circle r="${GLOBE_R}"/></clipPath>`,
  );
  if (full) {
    out.push(
      `<filter id="glow${uid}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    );
  }
  out.push('</defs>');

  if (options.background) {
    out.push(`<rect x="-100" y="-100" width="200" height="200" rx="38" fill="url(#bg${uid})"/>`);
  }

  // Hazard ring (rotates).
  out.push(
    `<g data-part="ring" transform="rotate(${f(pose.ringDeg)})">`,
    `<circle r="${(RING_OUT + RING_IN) / 2}" fill="none" stroke="#1a1a1a" stroke-width="${RING_OUT - RING_IN}"/>`,
    `<path d="${stripes(STRIPES[variant])}" fill="#f2c230"/>`,
    `<circle r="${RING_OUT}" fill="none" stroke="#141414" stroke-width="${tiny ? 3 : 2}"/>`,
    `<circle r="${RING_IN}" fill="none" stroke="#141414" stroke-width="${tiny ? 3 : 2}"/>`,
    '</g>',
    `<circle r="${RING_IN - 1}" fill="url(#disc${uid})"/>`,
  );

  // Far halves of the orbits and the electrons behind the globe.
  out.push('<g opacity=".55">');
  for (const o of orbits) {
    out.push(`<path d="${arc(o, Math.PI, 2 * Math.PI)}" fill="none" stroke="#9a9da0" stroke-width="${orbitWidth}" stroke-linecap="round"/>`);
  }
  out.push('</g>');
  const electron = (index: number, layer: 'back' | 'front'): string => {
    const e = pose.electrons[index]!;
    const visible = layer === 'front' ? e.front : !e.front;
    const glow = full ? ` filter="url(#glow${uid})"` : '';
    return `<circle data-part="e${index}${layer}" r="${electronR}" cx="${f(e.x)}" cy="${f(e.y)}" fill="#f5c518" stroke="#7a5b00" stroke-width="1" opacity="${visible ? (layer === 'front' ? 1 : 0.55) : 0}"${glow}/>`;
  };
  pose.electrons.forEach((_, i) => out.push(electron(i, 'back')));

  // Globe.
  out.push(
    `<circle r="${GLOBE_R}" fill="url(#gl${uid})"/>`,
    `<g clip-path="url(#clip${uid})">`,
    `<path d="${LAND_PATH}" transform="scale(${GLOBE_R})" fill="#f6b450" stroke="#7a4f1d" stroke-width="${f((tiny ? 1.6 : 0.6) / GLOBE_R)}"/>`,
  );
  if (full) out.push(`<path d="${graticule()}" fill="none" stroke="#7c7f82" stroke-width="1.5" opacity=".9"/>`);
  out.push('</g>', `<circle r="${GLOBE_R}" fill="none" stroke="#6f7275" stroke-width="${tiny ? 4 : 2.4}"/>`);

  // Near halves of the orbits and the electrons in front.
  for (const o of orbits) {
    out.push(
      `<path d="${arc(o, 0, Math.PI)}" fill="none" stroke="#3c3f42" stroke-width="${orbitWidth + 2.2}" stroke-linecap="round"/>`,
      `<path d="${arc(o, 0, Math.PI)}" fill="none" stroke="#a9acaf" stroke-width="${orbitWidth}" stroke-linecap="round"/>`,
    );
  }
  pose.electrons.forEach((_, i) => out.push(electron(i, 'front')));

  return out.join('');
}

/** A complete SVG document of the mark. */
export function logoSvg(size: number, options: LogoOptions = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-100 -100 200 200">${logoMarkup(options)}</svg>`;
}

/** The variant that stays readable at a pixel size. */
export function variantForSize(px: number): LogoVariant {
  return px >= 64 ? 'full' : px >= 24 ? 'simple' : 'tiny';
}

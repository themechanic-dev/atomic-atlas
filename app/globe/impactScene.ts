// What the globe shows where a warhead comes down: the flash, the fireball, the blast wave
// running out over the ground and the mushroom cloud rising and spreading.
//
// Sizes come from the physics for the warhead's yield (an air burst at the height that
// pushes 5 psi furthest): the fireball's radius, the 1 psi radius, and the cloud's height,
// head and stem in time (physics/timeline/cloudShape.ts, Glasstone & Dolan). Only the
// timing is a picture: the ten minutes the cloud takes to stabilise are shown in about
// seven seconds of watching. The cloud is drawn as soft puffs placed over its shape.

import { Cartesian3, Color, Math as CesiumMath } from '@cesium/core';
import { BillboardCollection, type Billboard, type CesiumWidget, type Scene } from '@cesium/engine';
import { detonate, DEFAULT_SCENARIO } from '@physics/detonation';
import { blastTimeline, type BlastTimeline } from '@physics/timeline/playback';
import type { LngLat } from '../lib/geo';
import { glow, puff } from './sprites';

export interface ImpactInput {
  /** Stays the same for the same warhead, so its picture is kept while it plays. */
  key: string;
  at: LngLat;
  yieldKt: number;
  /** True once the warhead has come down. */
  arrived: boolean;
  /** Fewer puffs for a war with many warheads. */
  light?: boolean;
  /** How strongly it is drawn, 0 to 1: in a war, the chance that the warhead gets through. */
  weight?: number;
}

/** Seconds of watching in which the cloud reaches its stabilised size. */
const GROWTH_S = 7;
/** Seconds of cloud time it shows in that while. */
const CLOUD_S = 600;

interface Puff {
  billboard: Billboard;
  kind: 'head' | 'stem';
  /** Around the axis, radians. */
  angle: number;
  /** For the head: place round the rolled-up rim, radians; for the stem: height share. */
  u: number;
  /** Out from the middle, share. */
  reach: number;
  size: number;
}

interface Shown {
  input: ImpactInput;
  timeline: BlastTimeline;
  burstHeightM: number;
  ring1psiM: number;
  start: number;
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
  ground: Cartesian3;
  flash: Billboard;
  fireball: Billboard;
  wave: Billboard[];
  puffs: Puff[];
}

const timelines = new Map<number, { timeline: BlastTimeline; heightM: number; ring1psiM: number }>();

function physicsFor(yieldKt: number) {
  let found = timelines.get(yieldKt);
  if (!found) {
    const result = detonate({ ...DEFAULT_SCENARIO, yieldKt, burstMode: 'airburst', wind: [] });
    found = {
      timeline: blastTimeline(result),
      heightM: result.heightM,
      ring1psiM: result.rings.find((ring) => ring.id === 'blast1')?.radiusM ?? 0,
    };
    timelines.set(yieldKt, found);
  }
  return found;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function createImpactScene(widget: CesiumWidget) {
  const scene: Scene = widget.scene;
  const billboards = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
  const shown = new Map<string, Shown>();
  let seed = 1;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  function place(s: Shown, east: number, north: number, up: number): Cartesian3 {
    const g = s.ground;
    return new Cartesian3(
      g.x + s.east.x * east + s.north.x * north + s.up.x * up,
      g.y + s.east.y * east + s.north.y * north + s.up.y * up,
      g.z + s.east.z * east + s.north.z * north + s.up.z * up,
    );
  }

  function add(input: ImpactInput): Shown {
    const { timeline, heightM, ring1psiM } = physicsFor(input.yieldKt);
    const lambda = CesiumMath.toRadians(input.at.lng);
    const phi = CesiumMath.toRadians(input.at.lat);
    const s: Shown = {
      input,
      timeline,
      burstHeightM: heightM,
      ring1psiM,
      start: performance.now(),
      east: new Cartesian3(-Math.sin(lambda), Math.cos(lambda), 0),
      north: new Cartesian3(-Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi)),
      up: new Cartesian3(Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)),
      ground: Cartesian3.fromDegrees(input.at.lng, input.at.lat, 0),
      flash: null as unknown as Billboard,
      fireball: null as unknown as Billboard,
      wave: [],
      puffs: [],
    };
    const common = { sizeInMeters: true };
    // The blast wave: a thin bright ring of dust, drawn as glows round a circle.
    const waveCount = input.light ? 36 : 80;
    for (let i = 0; i < waveCount; i++) {
      s.wave.push(billboards.add({ ...common, image: puff(), position: s.ground, show: false }));
    }
    // The cloud: puffs over the rolled-up head and up the stem.
    seed = Math.floor(input.at.lng * 1000 + input.at.lat * 7) % 2147483646 || 7;
    const headCount = input.light ? 34 : 90;
    const stemCount = input.light ? 10 : 26;
    for (let i = 0; i < headCount + stemCount; i++) {
      const head = i < headCount;
      s.puffs.push({
        billboard: billboards.add({ ...common, image: puff(), position: s.ground, show: false }),
        kind: head ? 'head' : 'stem',
        angle: random() * Math.PI * 2,
        u: head ? random() * Math.PI * 2 : Math.pow(random(), 0.8),
        reach: head ? 0.55 + 0.45 * random() : 0.35 + 0.65 * random(),
        size: 0.85 + 0.4 * random(),
      });
    }
    s.fireball = billboards.add({ ...common, image: glow(), position: s.ground, show: false });
    s.flash = billboards.add({ ...common, image: glow(), position: s.ground, show: false });
    return s;
  }

  function remove(s: Shown): void {
    for (const b of [s.flash, s.fireball, ...s.wave, ...s.puffs.map((p) => p.billboard)]) billboards.remove(b);
  }

  /** Puts every billboard of an impact where its age says. Returns true while it still changes. */
  function draw(s: Shown, now: number): boolean {
    const watched = (now - s.start) / 1000;
    const w = Math.min(1, Math.max(0, s.input.weight ?? 1));
    if (!s.input.arrived) {
      for (const b of [s.flash, s.fireball, ...s.wave, ...s.puffs.map((p) => p.billboard)]) b.show = false;
      return false;
    }
    // Cloud time runs slowly at first, so the fireball and the first rise can be seen.
    const t = CLOUD_S * Math.pow(Math.min(1, watched / GROWTH_S), 1.6);
    const cloud = s.timeline.cloudAt(t);
    const fireballMax = Math.max(s.timeline.fireballMaxM, 50);
    // The flash: a huge white glow that fades within a second.
    const flash = 1 - smooth(watched / 0.9);
    s.flash.show = flash > 0.01;
    s.flash.position = place(s, 0, 0, s.burstHeightM);
    s.flash.width = s.flash.height = fireballMax * 40 * (0.6 + 0.4 * flash);
    s.flash.color = new Color(1, 0.98, 0.92, flash * w);
    // The fireball: bright while it still gives light, rising with the top of the cloud.
    s.fireball.show = cloud.glow > 0.02;
    const ballCenter = Math.max(s.burstHeightM, cloud.headBottomM + (cloud.topM - cloud.headBottomM) * 0.45);
    s.fireball.position = place(s, 0, 0, ballCenter);
    s.fireball.width = s.fireball.height = Math.max(fireballMax * 2.6, cloud.headRadiusM * 1.6);
    s.fireball.color = new Color(1, 0.62 + 0.3 * cloud.glow, 0.25 + 0.4 * cloud.glow, Math.min(1, cloud.glow * 1.2) * w);
    // The blast wave: out to the 1 psi radius in the first seconds, fading as it goes.
    const waveShare = smooth(watched / 3.2);
    const waveRadius = Math.max(s.ring1psiM, fireballMax * 4) * waveShare;
    const waveAlpha = 0.55 * (1 - smooth((watched - 1.2) / 3)) * w;
    s.wave.forEach((b, i) => {
      const a = (i / s.wave.length) * Math.PI * 2;
      b.show = waveAlpha > 0.01 && waveRadius > 0;
      b.position = place(s, Math.cos(a) * waveRadius, Math.sin(a) * waveRadius, waveRadius * 0.02);
      b.width = b.height = Math.max(waveRadius * 0.36, fireballMax);
      b.color = new Color(0.93, 0.88, 0.8, waveAlpha * 0.7);
    });
    // The cloud: white puffs turning from reddish brown, lit from below while the fireball glows.
    const white = new Color(0.97, 0.96, 0.95, 0.92);
    const brown = new Color(0.6, 0.42, 0.32, 0.92);
    const warm = new Color(1, 0.62, 0.3, 0.95);
    const thickness = Math.max(1, cloud.topM - cloud.headBottomM);
    const middle = cloud.headBottomM + thickness * cloud.headLowerShare;
    const shown = watched > 0.15;
    for (const p of s.puffs) {
      const b = p.billboard;
      let x: number;
      let y: number;
      let height: number;
      let size: number;
      if (p.kind === 'head') {
        // A rolled-up ring with a lid: the outer rim curls round, the middle fills the top.
        const rim = cloud.headRadiusM * (0.62 + 0.38 * Math.cos(p.u)) * p.reach;
        x = Math.cos(p.angle) * rim;
        y = Math.sin(p.angle) * rim;
        height = middle + Math.sin(p.u) * thickness * 0.42;
        size = cloud.headRadiusM * 0.62 * p.size;
      } else {
        const r = cloud.stemRadiusM * p.reach;
        x = Math.cos(p.angle) * r;
        y = Math.sin(p.angle) * r;
        height = Math.max(0, cloud.headBottomM) * p.u;
        size = Math.max(cloud.stemRadiusM * 1.5, 1) * p.size;
      }
      b.show = shown && size > 1 && (p.kind === 'head' || cloud.stemRadiusM > 1);
      b.position = place(s, x, y, height);
      b.width = b.height = size;
      const low = p.kind === 'stem' ? 1 : Math.max(0, -Math.sin(p.u));
      const tint = Color.lerp(white, brown, cloud.brown * 0.85, new Color());
      const color = Color.lerp(tint, warm, Math.min(1, cloud.glow * (0.4 + 0.6 * low)), new Color());
      color.alpha *= w;
      b.color = color;
    }
    return watched < GROWTH_S + 1;
  }

  let removeUpdate: (() => void) | null = null;
  const tick = (): void => {
    const now = performance.now();
    let moving = false;
    for (const s of shown.values()) moving = draw(s, now) || moving;
    if (moving) scene.requestRender();
  };
  removeUpdate = scene.preUpdate.addEventListener(tick);

  /** The impacts to show now; those no longer listed are removed. */
  function set(inputs: ImpactInput[]): void {
    const keys = new Set(inputs.map((i) => i.key));
    for (const [key, s] of shown) {
      if (!keys.has(key)) {
        remove(s);
        shown.delete(key);
      }
    }
    for (const input of inputs) {
      const s = shown.get(input.key);
      if (!s) {
        if (input.arrived) shown.set(input.key, add(input));
        continue;
      }
      if (input.arrived && !s.input.arrived) s.start = performance.now();
      s.input = input;
      if (!input.arrived) {
        remove(s);
        shown.delete(input.key);
      }
    }
    scene.requestRender();
  }

  /** The height of the stabilised cloud for a yield, for framing it. */
  const finalTopM = (yieldKt: number): number => physicsFor(yieldKt).timeline.cloudFinal.topM;

  function destroy(): void {
    removeUpdate?.();
    for (const s of shown.values()) remove(s);
    shown.clear();
    scene.primitives.remove(billboards);
  }

  return { set, finalTopM, destroy };
}

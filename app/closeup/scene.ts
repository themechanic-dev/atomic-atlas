// The close view: a small scene that shows what the effects at one distance do to ordinary
// things. Buildings, vehicles, trees and a few kinds of installation are built in code
// (builders.ts); they stand for kinds of things, not for real places. The scene is told a
// state (what gets damaged, from the physics) and a moment (how far the flash, the heat,
// the blast and the fires have got) and draws that, with flames, smoke and dust as
// particles (particles.ts).
//
// The reactor building of the nuclear plant and the dam itself are drawn in outline only:
// no public general model gives blast damage to them, so none is shown (ΣΧΕΔΙΟ §1: no
// weak points of installations). Everything around them follows the same criteria as
// in the other scenes.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CloseupState } from '@physics/damage/closeup';
import { aircraft as aircraftModel } from '../models/launchers';
import {
  airliner,
  block,
  building,
  car,
  cargoShip,
  chimney,
  coolingTower,
  cylinder,
  groundMaterial,
  harbourCrane,
  mesh,
  pylon,
  shed,
  std,
  streetLight,
  tank,
  transformer,
  tree,
  type BuildingSkin,
  type FacadeStyle,
} from './builders';
import { drawDust, drawFires, drawPlumes, glowTexture, puffTexture, SpriteBatch, type FireSpot, type Plume } from './particles';

export type SceneKind = 'street' | 'airport' | 'power' | 'nuclear' | 'dam' | 'refinery' | 'harbour';
export const SCENE_KINDS: readonly SceneKind[] = ['street', 'airport', 'power', 'nuclear', 'dam', 'refinery', 'harbour'];

export interface Moment {
  /** Brightness of the flash, 0 to 1. */
  flash: number;
  /** Strength of the heat pulse now, 0 to 1. */
  heat: number;
  /** 0 before the blast wave arrives, 1 once it has passed and things have come to rest. */
  blast: number;
  /** How far fires have grown, 0 to 1. */
  fire: number;
}

export interface SceneHandle {
  setKind(kind: SceneKind): void;
  setState(state: CloseupState): void;
  setMoment(moment: Moment): void;
  resize(): void;
  dispose(): void;
}

type Role = 'building' | 'vehicle' | 'aircraft' | 'tree' | 'tank' | 'pylon' | 'ship' | 'light-structure' | 'not-modelled';

interface Part {
  object: THREE.Object3D;
  role: Role;
  /** A fixed random number per part, so things do not all move alike. */
  seed: number;
  home: THREE.Vector3;
  skin?: BuildingSkin;
}

interface Burn {
  part: Part;
  /** Where the fire is, in the part's own frame. */
  local: THREE.Vector3;
  size: number;
  seed: number;
}

const PALETTE = {
  dark: { top: '#1d2633', horizon: '#6d7684', fog: 0x5c6470, water: 0x1f4257, light: 1.5, sun: 0xffd9b0 },
  light: { top: '#7fb0de', horizon: '#dfe8ee', fog: 0xd2dbe2, water: 0x3f7fa6, light: 2.6, sun: 0xfff2dd },
};

/** Where the camera stands and looks for each scene; the dam needs a higher view to show the lake. */
interface View {
  from: [number, number, number];
  at: [number, number, number];
  /** Where the haze begins and where it hides everything, metres from the camera. */
  fog: [number, number];
  /** How much further back the camera goes on a tall, narrow picture (a phone held upright). */
  narrow?: number;
}
const VIEWS: Partial<Record<string, View>> = {
  nuclear: { from: [38, 24, 52], at: [0, 8, -4], fog: [110, 280] },
  dam: { from: [40, 44, 74], at: [0, 9, -8], fog: [140, 340], narrow: 1.35 },
  harbour: { from: [44, 26, 56], at: [0, 6, 6], fog: [120, 300] },
};
const DEFAULT_VIEW: View = { from: [36, 20, 46], at: [0, 6, 0], fog: [100, 260] };

const SCORCH = new THREE.Color(0x24180f);
const CONCRETE = 0x9ea3a8;

/** Joins non-indexed copies of geometries (position and normal only) into one. */
function mergeBodies(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  let offset = 0;
  for (const g of flat) {
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    offset += g.getAttribute('position').count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return merged;
}

function skyTexture(top: string, horizon: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.75, horizon);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createScene(canvas: HTMLCanvasElement, theme: 'dark' | 'light'): SceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  const colors = PALETTE[theme];
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const sky = skyTexture(colors.top, colors.horizon);
  scene.background = sky;
  scene.fog = new THREE.Fog(colors.fog, 100, 260);
  // Soft light from all round, for the shine of glass, metal and water.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = theme === 'dark' ? 0.35 : 0.6;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  const hemisphere = new THREE.HemisphereLight(0xdfe8f2, 0x4a4338, theme === 'dark' ? 0.55 : 0.9);
  const sun = new THREE.DirectionalLight(colors.sun, colors.light);
  sun.position.set(-50, 70, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 260 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  // The burst is to the left: its light comes from there.
  const burst = new THREE.DirectionalLight(0xfff6d8, 0);
  burst.position.set(-80, 30, 0);
  scene.add(hemisphere, sun, burst);

  const world = new THREE.Group();
  scene.add(world);
  const flames = new SpriteBatch(1800, glowTexture(), true);
  const smoke = new SpriteBatch(2400, puffTexture(), false);
  scene.add(smoke.points, flames.points);

  let parts: Part[] = [];
  let burns: Burn[] = [];
  let plumes: Plume[] = [];
  /** Flames that burn whatever happens (a refinery flare). */
  let steadyFires: FireSpot[] = [];
  let view = DEFAULT_VIEW;
  let state: CloseupState | null = null;
  let moment: Moment = { flash: 0, heat: 0, blast: 0, fire: 0 };
  let seedCounter = 1;
  const random = (): number => {
    // A small repeatable generator: the scene looks the same every time.
    seedCounter = (seedCounter * 16807) % 2147483647;
    return seedCounter / 2147483647;
  };

  const add = (object: THREE.Object3D, role: Role, x: number, z: number, y = 0, skin?: BuildingSkin): Part => {
    object.position.set(x, y, z);
    world.add(object);
    const part: Part = { object, role, seed: random(), home: object.position.clone(), skin };
    parts.push(part);
    return part;
  };

  /** A fire on a part, at a point in its own frame, that starts when the fires do. */
  const burnOn = (part: Part, x: number, y: number, z: number, size: number): void => {
    burns.push({ part, local: new THREE.Vector3(x, y, z), size, seed: random() });
  };

  const FACADES: FacadeStyle[] = ['brick', 'concrete', 'plaster', 'glass'];
  const house = (x: number, z: number, w: number, h: number, d: number, style: FacadeStyle, tint = 0xffffff): Part => {
    const { group, skin } = building(w, h, d, style, tint);
    const part = add(group, 'building', x, z, 0, skin);
    // Fire breaks out in a window on the front and on the roof.
    burnOn(part, w * 0.18, Math.min(h - 2, 4.5), d / 2 + 0.4, 2.2);
    burnOn(part, -w * 0.2, h + 0.4, d * 0.1, 2.8);
    return part;
  };

  const vehicle = (x: number, z: number, color: number, long = 4.4, turn = 0): void => {
    const c = car(color, long);
    c.rotation.y = turn;
    add(c, 'vehicle', x, z);
  };

  const plant = (x: number, z: number): void => {
    const t = tree(Math.floor(random() * 9));
    const s = 0.85 + random() * 0.4;
    t.scale.setScalar(s);
    add(t, 'tree', x, z);
  };

  /**
   * A structure whose damage is not modelled: a see-through body drawn as a sketch of lines.
   * `lines` are pairs of points; without them the sharp edges of the body are drawn.
   */
  const outline = (geometry: THREE.BufferGeometry, x: number, z: number, lines?: THREE.Vector3[]): void => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: CONCRETE, transparent: true, opacity: theme === 'dark' ? 0.2 : 0.28, depthWrite: false, roughness: 1 }),
    );
    body.userData.noShadow = true;
    const sketch = lines ? new THREE.BufferGeometry().setFromPoints(lines) : new THREE.EdgesGeometry(geometry, 20);
    const edges = new THREE.LineSegments(sketch, new THREE.LineBasicMaterial({ color: theme === 'dark' ? 0xe9e4da : 0x343a41 }));
    group.add(body, edges);
    add(group, 'not-modelled', x, z);
  };

  /** Lines of a cylinder with a dome: rims, a few uprights, meridians and rings of the dome. */
  const domeSketch = (radius: number, height: number): THREE.Vector3[] => {
    const points: THREE.Vector3[] = [];
    const ring = (y: number, r: number, steps = 40): void => {
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const b = ((i + 1) / steps) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Vector3(Math.cos(b) * r, y, Math.sin(b) * r));
      }
    };
    ring(0, radius);
    ring(height, radius);
    for (const latitude of [0.35, 0.7]) ring(height + Math.sin(latitude * (Math.PI / 2)) * radius, Math.cos(latitude * (Math.PI / 2)) * radius, 32);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const d = Math.sin(a);
      points.push(new THREE.Vector3(c * radius, 0, d * radius), new THREE.Vector3(c * radius, height, d * radius));
      for (let i = 0; i < 8; i++) {
        const p = (i / 8) * (Math.PI / 2);
        const q = ((i + 1) / 8) * (Math.PI / 2);
        points.push(
          new THREE.Vector3(c * radius * Math.cos(p), height + radius * Math.sin(p), d * radius * Math.cos(p)),
          new THREE.Vector3(c * radius * Math.cos(q), height + radius * Math.sin(q), d * radius * Math.cos(q)),
        );
      }
    }
    return points;
  };

  /** A low hill of the valley side, for the dam. */
  const hill = (x: number, z: number, w: number, h: number, d: number): void => {
    const geometry = new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 9, 3);
    geometry.translate(0, h / 2, 0);
    geometry.scale(1, 1, d / w);
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 0.3 + p.getZ(i) * 0.2) * 1.4 * (p.getY(i) / h));
    geometry.computeVertexNormals();
    world.add(mesh(geometry, std(theme === 'dark' ? 0x3d5240 : 0x6f8f5c, 1), x, 0, z));
  };

  /** A flat stretch of ground of a kind. */
  const strip = (x: number, z: number, w: number, d: number, kind: 'asphalt' | 'grass' | 'paving' | 'gravel', y = 0.02): void => {
    const m = mesh(new THREE.PlaneGeometry(w, d), groundMaterial(kind, w, d), x, y, z);
    m.rotation.x = -Math.PI / 2;
    world.add(m);
  };

  /** Painted lines along a road. */
  const markings = (z: number, length: number): void => {
    const paint = std(0xe9e5d8, 0.7);
    for (let x = -length / 2; x < length / 2; x += 6) {
      const m = mesh(new THREE.PlaneGeometry(3, 0.18), paint, x, 0.035, z);
      m.rotation.x = -Math.PI / 2;
      world.add(m);
    }
  };

  const water = (x: number, z: number, w: number, d: number, y = 0.03): void => {
    const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: colors.water, roughness: 0.12, metalness: 0.3 }), x, y, z);
    m.rotation.x = -Math.PI / 2;
    m.userData.noShadowCast = true;
    world.add(m);
  };

  function disposeWorld(): void {
    for (const child of [...world.children]) {
      world.remove(child);
      child.traverse((node) => {
        const m = node as THREE.Mesh;
        m.geometry?.dispose();
      });
    }
  }

  function build(kind: SceneKind): void {
    disposeWorld();
    parts = [];
    burns = [];
    plumes = [];
    steadyFires = [];
    seedCounter = 7;
    view = VIEWS[kind] ?? DEFAULT_VIEW;
    const fog = scene.fog as THREE.Fog;
    [fog.near, fog.far] = view.fog;
    strip(0, 0, 600, 600, 'grass', 0);

    if (kind === 'street') {
      strip(0, 8, 600, 10, 'asphalt');
      markings(8, 160);
      strip(0, 1.8, 600, 2.5, 'paving', 0.06);
      strip(0, 14.2, 600, 2.5, 'paving', 0.06);
      house(-24, -6, 11, 13, 10, 'brick');
      house(-9, -7, 10, 24, 11, 'glass');
      house(5, -6, 11, 10, 10, 'plaster', 0xf2e6d0);
      house(19, -7, 10, 16, 11, 'concrete');
      house(33, -6, 9, 9, 9, 'brick', 0xd9b8a8);
      house(-14, 24, 12, 8, 9, 'plaster');
      house(8, 25, 14, 11, 9, FACADES[1]!);
      house(26, 23, 9, 7, 8, 'brick');
      vehicle(-12, 6, 0xc0392b);
      vehicle(-1, 10, 0x2e86c1, 4.4, Math.PI);
      vehicle(10, 6, 0xd4ac0d);
      vehicle(22, 10, 0x7f8c8d, 6.4, Math.PI);
      vehicle(32, 6, 0xecf0f1);
      for (const x of [-30, -17, 0, 13, 27]) plant(x, 1.6);
      for (const x of [-22, 4, 30]) add(streetLight(), 'light-structure', x, 14.5);
    } else if (kind === 'airport') {
      strip(0, 16, 600, 22, 'asphalt');
      markings(16, 300);
      strip(-4, -2, 90, 22, 'paving', 0.03);
      add(shed(24, 10, 16, 0xb7bec5, 0x8a939b, 0.3), 'building', -26, -18);
      house(6, -20, 16, 8, 10, 'glass');
      const tower = new THREE.Group();
      tower.add(cylinder(1.5, 2.2, 18, std(0xd6d2c8, 0.85), 16));
      tower.add(cylinder(3.4, 2.6, 3.2, std(0x22303c, 0.15, 0.6), 12, 0, 18));
      tower.add(cylinder(3.6, 3.6, 0.5, std(0xd6d2c8, 0.85), 12, 0, 21.2));
      add(tower, 'building', 28, -14);
      const planes: Array<[number, number, number]> = [
        [-12, -1, 0.15],
        [12, -3, -0.25],
        [-2, 14, Math.PI + 0.1],
      ];
      for (const [x, z, turn] of planes) {
        const plane = airliner(aircraftModel());
        plane.rotation.y = turn;
        add(plane, 'aircraft', x, z);
      }
      vehicle(22, 3, 0xd4ac0d, 5.5);
      vehicle(-30, 5, 0xecf0f1, 6.5);
    } else if (kind === 'power') {
      strip(0, 18, 600, 9, 'asphalt');
      strip(4, -4, 90, 30, 'gravel', 0.03);
      add(shed(28, 16, 16, 0x8a97a3, 0x5d6772, 0.2), 'building', -20, -14);
      const stack = chimney(40, 1.8);
      add(stack, 'light-structure', 0, -18);
      plumes.push({ x: 0, y: 40.5, z: -18, size: 3.2, seed: 0.2, color: [0.55, 0.55, 0.56] });
      for (let i = 0; i < 4; i++) add(transformer(), 'tank', 12 + i * 5.5, -4);
      for (let i = 0; i < 3; i++) add(pylon(), 'pylon', -34 + i * 30, 8);
      vehicle(4, 16.5, 0x2e86c1);
      for (const x of [-38, 36]) plant(x, 14);
    } else if (kind === 'nuclear') {
      strip(0, 21, 600, 9, 'asphalt');
      strip(-2, 0, 90, 26, 'paving', 0.03);
      // The reactor building in front: a cylinder with a dome, in outline only.
      const reactor = new THREE.CylinderGeometry(8.5, 8.5, 14, 32, 1);
      reactor.translate(0, 7, 0);
      const dome = new THREE.SphereGeometry(8.5, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(0, 14, 0);
      outline(mergeBodies(reactor, dome), -2, -4, domeSketch(8.5, 14));
      // Turbine hall and offices: ordinary steel and concrete buildings.
      add(shed(22, 15, 15, 0x9aa7b2, 0x6c7783, 0.18), 'building', -28, -14);
      house(-32, 10, 10, 9, 8, 'concrete');
      // A cooling tower: a thin concrete shell, drawn like the other tall light structures,
      // with its steam rising.
      add(coolingTower(32, 10), 'light-structure', -18, -58);
      plumes.push({ x: -18, y: 32, z: -58, size: 7, seed: 0.5, color: [0.93, 0.94, 0.95] });
      // Switchyard and the lines that leave it.
      for (let i = 0; i < 3; i++) add(transformer(), 'tank', 16 + i * 5.5, -6);
      add(pylon(), 'pylon', 22, 9);
      add(pylon(), 'pylon', 34, -20);
      vehicle(-6, 19.5, 0x2e86c1);
      vehicle(8, 22.5, 0xc0392b, 4.4, Math.PI);
      for (const x of [-34, 38]) plant(x, 16);
    } else if (kind === 'dam') {
      // A concrete gravity dam across a valley, the lake behind it, a power house at its foot.
      const length = 74;
      // Steep face towards the lake, sloping face downstream (negative x of the shape).
      const section = new THREE.Shape([new THREE.Vector2(-14, 0), new THREE.Vector2(2, 0), new THREE.Vector2(1.5, 22), new THREE.Vector2(-2.5, 22)]);
      const dam = new THREE.ExtrudeGeometry(section, { depth: length, bevelEnabled: false });
      // The section is drawn across the river, then turned: the shape's x becomes -z (downstream towards the camera).
      dam.rotateY(Math.PI / 2);
      dam.translate(-length / 2, 0, 0);
      // Its outline, with the joints between the concrete blocks across both faces and the crest.
      const edges = new THREE.EdgesGeometry(dam, 20).getAttribute('position');
      const sketch: THREE.Vector3[] = [];
      for (let i = 0; i < edges.count; i++) sketch.push(new THREE.Vector3(edges.getX(i), edges.getY(i), edges.getZ(i)));
      for (let k = 1; k < 6; k++) {
        const x = -length / 2 + (k * length) / 6;
        const toe = new THREE.Vector3(x, 0, 14);
        const crestDown = new THREE.Vector3(x, 22, 2.5);
        const crestUp = new THREE.Vector3(x, 22, -1.5);
        const heel = new THREE.Vector3(x, 0, -2);
        sketch.push(toe, crestDown, crestDown.clone(), crestUp, crestUp.clone(), heel);
      }
      outline(dam, 0, -10, sketch);
      water(0, -72, length + 14, 120, 20);
      water(0, 40, 12, 70);
      hill(-66, -34, 60, 30, 96);
      hill(66, -34, 60, 30, 96);
      house(-14, 9, 18, 9, 9, 'concrete');
      for (let i = 0; i < 2; i++) add(transformer(), 'tank', 2 + i * 5.5, 6);
      add(pylon(), 'pylon', 14, 18);
      add(pylon(), 'pylon', -2, 34);
      // Two cars on the road along the crest.
      vehicle(-14, -9.5, 0xd4ac0d);
      vehicle(8, -9.5, 0x7f8c8d, 4.4, Math.PI);
      parts[parts.length - 1]!.home.y = 22;
      parts[parts.length - 2]!.home.y = 22;
      for (const [x, z] of [
        [-26, 18],
        [22, 26],
        [-24, 30],
        [26, 12],
      ] as const)
        plant(x, z);
    } else if (kind === 'refinery') {
      strip(0, 20, 600, 9, 'asphalt');
      strip(0, -4, 110, 36, 'gravel', 0.03);
      for (const [x, z, r, h] of [
        [-26, -12, 7.5, 9],
        [-7, -14, 7.5, 9],
        [12, -12, 5.5, 11],
        [27, -14, 5.5, 11],
        [-17, 6, 4.5, 7],
      ] as const) {
        const part = add(tank(r, h), 'tank', x, z);
        burnOn(part, 0, h + r * 0.15, 0, r * 0.9);
      }
      // Columns, a pipe rack and a flare stack that always burns.
      const steel = std(0x8d969e, 0.45, 0.6);
      for (const [x, h] of [
        [2, 28],
        [7, 22],
      ] as const)
        add(cylinder(1.0, 1.2, h, steel, 14), 'light-structure', x, 4);
      const rack = new THREE.Group();
      for (let x = -22; x <= 22; x += 5.5) {
        rack.add(block(0.4, 5, 0.4, steel, x, -1.2), block(0.4, 5, 0.4, steel, x, 1.2));
      }
      for (const [y, z, r] of [
        [5.2, -0.6, 0.35],
        [5.2, 0.4, 0.45],
        [3.4, 0, 0.3],
      ] as const) {
        const pipe = mesh(new THREE.CylinderGeometry(r, r, 46, 10), std(0xb7bec4, 0.5, 0.5), 0, y, z);
        pipe.rotation.z = Math.PI / 2;
        rack.add(pipe);
      }
      add(rack, 'light-structure', 2, 12);
      add(cylinder(0.6, 0.8, 34, std(0xb04030, 0.6), 10), 'light-structure', 38, -24);
      steadyFires.push({ x: 38, y: 34.5, z: -24, size: 1.6, seed: 0.7 });
      vehicle(-22, 18.5, 0xc0392b, 7);
    } else {
      // A harbour: quay, sheds, a cargo ship alongside and two cranes.
      water(0, 46, 600, 80);
      strip(0, -10, 600, 32, 'paving', 0.04);
      world.add(block(600, 1.2, 1.2, std(0x6b6f75, 0.9), 0, 5.4));
      add(shed(22, 10, 13, 0xa6aeb5, 0x7b858e, 0.25), 'building', -26, -16);
      house(8, -17, 13, 8, 10, 'concrete');
      const ship = cargoShip();
      add(ship, 'ship', -2, 15);
      for (const [x, z] of [
        [-4, 15],
        [10, 15],
      ] as const)
        burnOn(parts[parts.length - 1]!, x, 8, z - 15, 2.6);
      for (const x of [-18, 16]) add(harbourCrane(), 'pylon', x, 2);
      // Containers stacked on the quay.
      const stackColors = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x27ae60];
      for (let i = 0; i < 6; i++) {
        const stack = new THREE.Group();
        for (let s = 0; s < 2; s++) stack.add(block(6, 2.5, 2.4, std(stackColors[(i + s) % 4]!, 0.7, 0.2), 0, 0, s * 2.55));
        const part = add(stack, 'tank', 24 + (i % 3) * 6.4, -6 + Math.floor(i / 3) * 2.6);
        if (i === 1) burnOn(part, 0, 5.2, 0, 2.2);
      }
      vehicle(-4, -4, 0x7f8c8d, 6.5);
    }
    // Everything solid casts and takes shadows.
    world.traverse((node) => {
      const m = node as THREE.Mesh;
      if (!m.isMesh || m.userData.noShadow) return;
      m.castShadow = !m.userData.noShadowCast;
      m.receiveShadow = true;
    });
    apply();
  }

  const scratch = new THREE.Vector3();

  /** Puts every part where the state and the moment say it is. */
  function place(): void {
    const s = state;
    const blast = moment.blast;
    const level = s ? s.building.level : 0;
    const push = s ? Math.min(1, s.dynamicPsi / 0.6) : 0;
    const fireGlow = s?.firesStart ? moment.fire : 0;
    for (const part of parts) {
      const { object, role, seed, home } = part;
      object.position.copy(home);
      object.rotation.set(0, object.rotation.y, 0);
      object.scale.set(object.scale.x, 1, object.scale.z);
      object.visible = true;
      if (role === 'building') {
        const kept = s ? s.building.heightKept : 1;
        object.scale.y = 1 + (kept - 1) * blast;
        if (level >= 3) object.rotation.z = -blast * 0.08 * (0.5 + seed);
        const skin = part.skin;
        if (skin) {
          const broken = Boolean(s?.windowsBroken && blast > 0.15);
          for (const m of skin.walls) {
            const map = broken ? skin.facade.broken : skin.facade.whole;
            if (m.map !== map) {
              m.map = map;
              m.needsUpdate = true;
            }
            m.color.copy(skin.base).lerp(SCORCH, Math.min(0.8, (level >= 2 ? 0.25 * level : 0) * blast + 0.4 * fireGlow));
            // Windows glow with the heat pulse and with the fire inside.
            const flicker = 0.75 + 0.25 * Math.sin(performance.now() / 180 + part.seed * 40);
            m.emissive.setRGB(moment.heat * 0.9 + fireGlow * 0.85 * flicker, moment.heat * 0.4 + fireGlow * 0.26 * flicker, fireGlow * 0.04);
          }
        }
      } else if (role === 'vehicle') {
        if (s?.vehiclesOverturned) {
          object.rotation.x = blast * (Math.PI / 2 + seed * 1.2);
          object.position.x += blast * (5 + seed * 6);
          object.position.y += Math.sin(Math.min(1, blast) * Math.PI) * 1.2 + blast * 0.6;
        } else {
          object.position.x += blast * push * 1.5 * seed;
        }
      } else if (role === 'aircraft') {
        const damage = s?.aircraft ?? 'none';
        if (damage === 'severe') {
          object.rotation.x = blast * (0.5 + seed * 0.6);
          object.rotation.z = blast * (0.3 + seed * 0.4);
          object.position.x += blast * (8 + seed * 8);
        } else if (damage === 'moderate') {
          object.rotation.z = blast * 0.12 * (seed + 0.3);
          object.position.x += blast * 2.5;
        }
      } else if (role === 'tree') {
        const bend = level >= 3 ? Math.PI / 2 : level >= 2 ? 0.7 : 0.25 * push;
        object.rotation.z = -blast * bend * (0.7 + 0.3 * seed);
      } else if (role === 'tank') {
        if (level >= 2) {
          object.rotation.z = -blast * 0.12 * level * (0.4 + seed);
          object.position.x += blast * (level - 1) * 1.2;
          object.scale.y = 1 - blast * 0.12 * (level - 1);
        }
      } else if (role === 'pylon' || role === 'light-structure') {
        // In the power system test at 5 psi one weaker tower came down; the stronger ones stood.
        const falls = level >= 3 && (role === 'pylon' ? seed > 0.45 || level >= 4 : level >= 4);
        if (falls) object.rotation.z = -blast * (Math.PI / 2 - 0.08);
        else object.rotation.z = -blast * 0.04 * level;
      } else if (role === 'ship') {
        // Glasstone Table 5.147b: severe = sunk or capsized, moderate = immobilised (shown listing).
        const damage = s?.ship ?? 'none';
        if (damage === 'severe') {
          object.rotation.x = blast * (Math.PI / 2 - 0.15);
          object.position.y -= blast * 3.5;
          object.position.z += blast * 4;
        } else if (damage === 'moderate') {
          object.rotation.x = blast * 0.28;
          object.position.z += blast * 2.5;
        } else {
          object.rotation.x = blast * 0.12 * Math.min(1, push) * (level >= 3 ? 2.2 : 1);
          object.position.z += blast * push * 2;
        }
      }
    }
    // The flash lights everything from the side of the burst and washes the sky out.
    burst.intensity = moment.flash * 14 + moment.heat * 3.5;
    hemisphere.intensity = (theme === 'dark' ? 0.55 : 0.9) + moment.flash * 4;
    renderer.toneMappingExposure = 1.05 + moment.flash * 1.6;
  }

  let clockStart = performance.now();

  /** Draws flames, smoke and dust for this frame. */
  function particles(): boolean {
    const time = (performance.now() - clockStart) / 1000;
    const s = state;
    flames.begin();
    smoke.begin();
    const burning = Boolean(s?.firesStart) && moment.fire > 0.02;
    if (burning) {
      const spots: FireSpot[] = burns.map((b) => {
        b.part.object.updateMatrixWorld();
        scratch.copy(b.local).applyMatrix4(b.part.object.matrixWorld);
        return { x: scratch.x, y: scratch.y, z: scratch.z, size: b.size, seed: b.seed };
      });
      drawFires(flames, smoke, spots, moment.fire, time);
    }
    drawFires(flames, smoke, steadyFires, 1, time, 0.2);
    drawPlumes(smoke, plumes, time);
    const dustStrength = s ? Math.min(1, s.dynamicPsi / 0.3 + (s.building.level >= 2 ? 0.4 : 0)) : 0;
    drawDust(smoke, moment.blast, dustStrength, 70);
    flames.end();
    smoke.end();
    return burning || plumes.length > 0 || steadyFires.length > 0 || (moment.blast > 0 && moment.blast < 1);
  }

  function render(): void {
    place();
    particles();
    renderer.render(scene, camera);
  }

  // Flames and smoke move by themselves: while anything burns or rises the scene redraws
  // itself, about thirty times a second.
  let frame = 0;
  let last = 0;
  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop);
    if (now - last < 32) return;
    last = now;
    place();
    const moving = particles();
    renderer.render(scene, camera);
    if (!moving) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const animate = (): void => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  function apply(): void {
    render();
    animate();
  }

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // A tall, narrow picture needs the camera further back to hold the same scene.
    const back = camera.aspect < 1 ? (1 / camera.aspect) * (view.narrow ?? 1) : 1;
    const [x, y, z] = view.from;
    camera.position.set(x * back, y * back, z * back);
    camera.lookAt(...view.at);
    const fog = scene.fog as THREE.Fog;
    fog.near = view.fog[0] * back;
    fog.far = view.fog[1] * back;
    camera.far = Math.max(600, view.fog[1] * back * 1.2);
    camera.updateProjectionMatrix();
    // Sprite sizes are in metres: pixels per metre at one metre away.
    const scale = (height * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    flames.setScale(scale);
    smoke.setScale(scale);
    apply();
  }

  build('street');
  resize();

  return {
    setKind(kind) {
      clockStart = performance.now();
      build(kind);
      resize();
    },
    setState(next) {
      state = next;
      apply();
    },
    setMoment(next) {
      moment = next;
      apply();
    },
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      disposeWorld();
      flames.dispose();
      smoke.dispose();
      environment.dispose();
      sky.dispose();
      renderer.dispose();
    },
  };
}

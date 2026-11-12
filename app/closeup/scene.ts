// The close view: a small low-poly scene that shows what the effects at one distance do
// to ordinary things. Buildings, vehicles, trees and a few kinds of installation are made
// from simple shapes in code, in one style; they stand for kinds of things, not for real
// places. The scene is told a state (what gets damaged, from the physics) and a moment
// (how far the flash, the heat, the blast and the fires have got) and draws that.
//
// The reactor building of the nuclear plant and the dam itself are drawn in outline only:
// no public general model gives blast damage to them, so none is shown (ΣΧΕΔΙΟ §1: no
// weak points of installations). Everything around them follows the same criteria as
// in the other scenes.

import * as THREE from 'three';
import type { CloseupState } from '@physics/damage/closeup';

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

type Role = 'building' | 'vehicle' | 'aircraft' | 'tree' | 'window' | 'tank' | 'pylon' | 'ship' | 'flame' | 'light-structure' | 'not-modelled';

interface Part {
  object: THREE.Object3D;
  role: Role;
  /** A fixed random number per part, so things do not all move alike. */
  seed: number;
  home: THREE.Vector3;
  color?: THREE.Color;
}

const PALETTE = {
  dark: { sky: 0x232a32, ground: 0x4a4f55, road: 0x26292e, grass: 0x3d5644, water: 0x24506b, yard: 0x40454b },
  light: { sky: 0xdfe7ee, ground: 0xb9b3a6, road: 0x6f7378, grass: 0x8fae7a, water: 0x6fa3c7, yard: 0x9d988e },
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
  nuclear: { from: [36, 22, 48], at: [0, 7, 0], fog: [95, 230] },
  dam: { from: [40, 44, 74], at: [0, 9, -8], fog: [130, 320], narrow: 1.35 },
};
const DEFAULT_VIEW: View = { from: [34, 19, 44], at: [0, 5, 2], fog: [90, 220] };

const STONE = 0xb8a98f;
const CONCRETE = 0x9ea3a8;
const METAL = 0x7d8a96;
const WOOD = 0xa9794e;
const SCORCH = new THREE.Color(0x2a1d16);

/** A box that stands on the ground: its origin is the middle of its base, so it can be squashed from the top. */
function block(w: number, h: number, d: number, color: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(0, h / 2, 0);
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

function cylinder(radiusTop: number, radiusBottom: number, h: number, color: number, sides = 10): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, sides);
  geometry.translate(0, h / 2, 0);
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

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

export function createScene(canvas: HTMLCanvasElement, theme: 'dark' | 'light'): SceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  const colors = PALETTE[theme];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const sky = new THREE.Color(colors.sky);
  scene.background = sky.clone();
  scene.fog = new THREE.Fog(colors.sky, 90, 220);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
  camera.position.set(34, 19, 44);
  camera.lookAt(0, 5, 2);
  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.position.set(-40, 60, 30);
  // The burst is to the left: its light comes from there.
  const burst = new THREE.DirectionalLight(0xfff6d8, 0);
  burst.position.set(-80, 30, 0);
  scene.add(ambient, sun, burst);

  const world = new THREE.Group();
  scene.add(world);
  let parts: Part[] = [];
  let view = DEFAULT_VIEW;
  let state: CloseupState | null = null;
  let moment: Moment = { flash: 0, heat: 0, blast: 0, fire: 0 };
  let seedCounter = 1;
  const random = (): number => {
    // A small repeatable generator: the scene looks the same every time.
    seedCounter = (seedCounter * 16807) % 2147483647;
    return seedCounter / 2147483647;
  };

  const add = (object: THREE.Object3D, role: Role, x: number, z: number, y = 0): THREE.Object3D => {
    object.position.set(x, y, z);
    world.add(object);
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.MeshLambertMaterial | undefined;
    parts.push({ object, role, seed: random(), home: object.position.clone(), color: material?.color?.clone() });
    return object;
  };

  const flame = (x: number, z: number, y: number, size: number): void => {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.5, size * 1.6, 6).translate(0, size * 0.8, 0),
      new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.9 }),
    );
    add(mesh, 'flame', x, z, y);
  };

  const building = (x: number, z: number, w: number, h: number, d: number, color: number): void => {
    const group = new THREE.Group();
    group.add(block(w, h, d, color));
    // Windows on the side that faces the camera.
    const rows = Math.max(1, Math.floor(h / 3.4));
    const columns = Math.max(1, Math.floor(w / 3));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }));
        pane.position.set(-w / 2 + (c + 0.5) * (w / columns), 2 + r * 3.4, d / 2 + 0.03);
        pane.userData.window = true;
        group.add(pane);
      }
    }
    add(group, 'building', x, z);
    (parts[parts.length - 1] as Part).color = new THREE.Color(color);
    flame(x + w * 0.2, z + d / 2 + 0.6, 0, 2.6);
  };

  const car = (x: number, z: number, color: number, long = 4.2): void => {
    const group = new THREE.Group();
    const body = block(long, 1, 1.8, color);
    body.position.y = 0.35;
    const cabin = block(long * 0.5, 0.8, 1.6, 0x23272b);
    cabin.position.y = 1.35;
    group.add(body, cabin);
    add(group, 'vehicle', x, z);
  };

  const tree = (x: number, z: number): void => {
    const group = new THREE.Group();
    group.add(cylinder(0.25, 0.35, 3, 0x6b4a2f, 6));
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 0), new THREE.MeshLambertMaterial({ color: 0x4f8a4a, flatShading: true }));
    crown.position.y = 4.4;
    group.add(crown);
    add(group, 'tree', x, z);
  };

  /**
   * A structure whose damage is not modelled: a see-through body drawn as a sketch of lines.
   * `lines` are pairs of points; without them the sharp edges of the body are drawn.
   */
  const outline = (geometry: THREE.BufferGeometry, x: number, z: number, lines?: THREE.Vector3[]): void => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: CONCRETE, transparent: true, opacity: theme === 'dark' ? 0.2 : 0.28, depthWrite: false }),
    );
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

  const pylon = (x: number, z: number): void => {
    const group = new THREE.Group();
    const mast = cylinder(0.25, 0.9, 20, 0x8f9aa3, 4);
    const arm = block(9, 0.4, 0.4, 0x8f9aa3);
    arm.position.y = 16;
    const arm2 = block(6, 0.4, 0.4, 0x8f9aa3);
    arm2.position.y = 19;
    group.add(mast, arm, arm2);
    add(group, 'pylon', x, z);
  };

  /** A low hill of the valley side, for the dam. */
  const hill = (x: number, z: number, w: number, h: number, d: number): void => {
    const geometry = new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 7, 1);
    geometry.translate(0, h / 2, 0);
    geometry.scale(1, 1, d / w);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: colors.grass, flatShading: true }));
    mesh.position.set(x, 0, z);
    world.add(mesh);
  };

  const ground = (color: number, w = 400, d = 400): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };

  const strip = (x: number, z: number, w: number, d: number, color: number, y = 0.02): void => {
    const mesh = ground(color, w, d);
    mesh.position.set(x, y, z);
    world.add(mesh);
  };

  function build(kind: SceneKind): void {
    for (const child of [...world.children]) {
      world.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
    parts = [];
    seedCounter = 7;
    view = VIEWS[kind] ?? DEFAULT_VIEW;
    const fog = scene.fog as THREE.Fog;
    [fog.near, fog.far] = view.fog;
    world.add(ground(colors.ground));

    if (kind === 'street') {
      strip(0, 8, 400, 9, colors.road);
      strip(0, -6, 60, 14, colors.grass, 0.01);
      building(-22, -8, 10, 12, 9, STONE);
      building(-8, -9, 9, 22, 10, CONCRETE);
      building(6, -8, 11, 9, 9, WOOD);
      building(21, -9, 10, 15, 10, METAL);
      building(-14, 22, 12, 7, 8, WOOD);
      building(8, 23, 14, 10, 9, STONE);
      car(-12, 6.5, 0xc0392b);
      car(-2, 9.5, 0x2e86c1);
      car(9, 6.5, 0xd4ac0d);
      car(20, 9.5, 0x7f8c8d, 6.5);
      for (const x of [-28, -1, 14, 30]) tree(x, 1.5);
    } else if (kind === 'airport') {
      strip(0, 14, 400, 16, colors.road);
      strip(0, 14, 400, 0.5, 0xe8e8e8, 0.03);
      strip(-4, -4, 70, 16, colors.yard, 0.02);
      building(-24, -16, 22, 9, 12, METAL);
      building(8, -18, 14, 7, 9, CONCRETE);
      const tower = cylinder(1.6, 2, 16, CONCRETE, 8);
      const cab = cylinder(3, 2.4, 3, 0x2b3a47, 8);
      cab.position.y = 16;
      const towerGroup = new THREE.Group();
      towerGroup.add(tower, cab);
      add(towerGroup, 'building', 26, -14);
      for (const [x, z] of [
        [-10, -2],
        [10, -4],
        [-2, 12],
      ] as const) {
        const plane = new THREE.Group();
        const fuselage = cylinder(1.2, 1.2, 16, 0xe9ecef, 8);
        fuselage.rotation.z = Math.PI / 2;
        fuselage.position.set(8, 2.4, 0);
        const wing = block(3.2, 0.3, 18, 0xcfd6dc);
        wing.position.y = 2.1;
        const fin = block(2.2, 3.4, 0.3, 0xf5a524);
        fin.position.set(-6.5, 2.8, 0);
        plane.add(fuselage, wing, fin);
        add(plane, 'aircraft', x, z);
      }
      car(20, 2, 0xd4ac0d, 5);
    } else if (kind === 'power') {
      strip(0, 16, 400, 8, colors.road);
      building(-18, -12, 26, 14, 14, METAL);
      const stack = cylinder(1.4, 2.2, 34, CONCRETE, 10);
      add(stack, 'light-structure', -2, -14);
      for (let i = 0; i < 4; i++) {
        const transformer = block(3, 3.2, 2.4, 0x5f6b76);
        add(transformer, 'tank', 10 + i * 5, -2);
      }
      for (let i = 0; i < 3; i++) pylon(-30 + i * 30, 8);
      car(4, 14.5, 0x2e86c1);
    } else if (kind === 'nuclear') {
      strip(0, 19, 400, 8, colors.road);
      strip(-2, 0, 80, 22, colors.yard, 0.02);
      // The reactor building in front: a cylinder with a dome, in outline only.
      const reactor = new THREE.CylinderGeometry(8.5, 8.5, 14, 32, 1);
      reactor.translate(0, 7, 0);
      const dome = new THREE.SphereGeometry(8.5, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(0, 14, 0);
      outline(mergeBodies(reactor, dome), -2, -4, domeSketch(8.5, 14));
      // Turbine hall and offices: ordinary steel and concrete buildings.
      building(-26, -12, 22, 13, 13, METAL);
      building(-30, 9, 9, 9, 8, CONCRETE);
      // A cooling tower: a thin concrete shell, drawn like the other tall light structures.
      // Narrowest at three quarters of its height, a little wider again at the top.
      const profile = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((t) => new THREE.Vector2(5 + 4.5 * ((t - 0.75) / 0.75) ** 2, t * 30));
      const tower = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 20),
        new THREE.MeshLambertMaterial({ color: 0xc9ccd0, flatShading: true, side: THREE.DoubleSide }),
      );
      add(tower, 'light-structure', -18, -54);
      // Switchyard and the lines that leave it.
      for (let i = 0; i < 3; i++) add(block(3, 3.2, 2.4, 0x5f6b76), 'tank', 14 + i * 5, -6);
      pylon(20, 8);
      pylon(30, -18);
      car(-6, 17.5, 0x2e86c1);
      car(8, 20.5, 0xc0392b);
      for (const x of [-30, 34]) tree(x, 15);
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
      strip(0, -72, length + 10, 120, colors.water, 20);
      strip(0, 40, 12, 70, colors.water, 0.03);
      hill(-66, -34, 60, 30, 96);
      hill(66, -34, 60, 30, 96);
      building(-14, 9, 18, 9, 9, CONCRETE);
      for (let i = 0; i < 2; i++) add(block(3, 3.2, 2.4, 0x5f6b76), 'tank', 2 + i * 5, 6);
      pylon(12, 18);
      pylon(-2, 32);
      // Two cars on the road along the crest.
      car(-14, -9.5, 0xd4ac0d, 4.2);
      car(8, -9.5, 0x7f8c8d, 4.2);
      parts[parts.length - 1]!.home.y = 22;
      parts[parts.length - 2]!.home.y = 22;
      for (const [x, z] of [
        [-26, 18],
        [22, 26],
        [-24, 30],
      ] as const)
        tree(x, z);
    } else if (kind === 'refinery') {
      strip(0, 18, 400, 8, colors.road);
      for (const [x, z, r, h] of [
        [-24, -10, 7, 8],
        [-6, -12, 7, 8],
        [12, -10, 5, 10],
        [26, -12, 5, 10],
        [-16, 6, 4, 6],
      ] as const) {
        add(cylinder(r, r, h, 0xd9dde1, 14), 'tank', x, z);
        flame(x, z, h, 4);
      }
      for (const x of [2, 8]) add(cylinder(0.9, 1.1, 26, METAL, 8), 'light-structure', x, 4);
      const pipes = block(46, 0.6, 0.6, 0x8f9aa3);
      pipes.position.y = 3;
      add(pipes, 'light-structure', 2, 10);
      car(-20, 16.5, 0xc0392b, 7);
    } else {
      strip(0, 40, 400, 70, colors.water, 0.03);
      strip(0, 2, 400, 6, 0x6b6f75, 0.05);
      building(-22, -14, 20, 9, 12, METAL);
      building(10, -14, 12, 7, 10, CONCRETE);
      const ship = new THREE.Group();
      const hull = block(44, 5, 9, 0x2f3b46);
      const deck = block(10, 6, 7, 0xe9ecef);
      deck.position.set(-14, 5, 0);
      const funnel = cylinder(1.2, 1.4, 4, 0xf5a524, 8);
      funnel.position.set(-15, 11, 0);
      ship.add(hull, deck, funnel);
      for (let i = 0; i < 4; i++) {
        const box = block(5, 2.4, 2.4, [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x27ae60][i]!);
        box.position.set(-2 + i * 6, 5, 0);
        ship.add(box);
      }
      add(ship, 'ship', 0, 14);
      const crane = new THREE.Group();
      crane.add(cylinder(0.5, 0.8, 18, 0xf5a524, 4));
      const jib = block(16, 0.6, 0.6, 0xf5a524);
      jib.position.set(6, 17, 0);
      crane.add(jib);
      add(crane, 'pylon', 24, 0);
      car(-6, 0.5, 0x7f8c8d, 6);
    }
    apply();
  }

  /** Puts every part where the state and the moment say it is, and draws the picture. */
  function apply(): void {
    const s = state;
    const blast = moment.blast;
    const level = s ? s.building.level : 0;
    const push = s ? Math.min(1, s.dynamicPsi / 0.6) : 0;
    for (const part of parts) {
      const { object, role, seed, home } = part;
      object.position.copy(home);
      object.rotation.set(0, role === 'aircraft' ? 0 : 0, 0);
      object.scale.set(1, 1, 1);
      object.visible = true;
      if (role === 'building') {
        const kept = s ? s.building.heightKept : 1;
        object.scale.y = 1 + (kept - 1) * blast;
        if (level >= 3) object.rotation.z = -blast * 0.08 * (0.5 + seed);
        object.traverse((node) => {
          if (node.userData.window) node.visible = !(s?.windowsBroken && blast > 0.15);
        });
        const mesh = (object as THREE.Group).children[0] as THREE.Mesh | undefined;
        const material = mesh?.material as THREE.MeshLambertMaterial | undefined;
        if (material && part.color) {
          material.color.copy(part.color).lerp(SCORCH, Math.min(0.75, (level >= 2 ? 0.25 * level : 0) * blast + (s?.firesStart ? 0.35 * moment.fire : 0)));
          material.emissive.setRGB(moment.heat * 0.5, moment.heat * 0.22, 0);
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
          object.rotation.y = blast * (0.6 + seed);
          object.position.x += blast * (8 + seed * 8);
        } else if (damage === 'moderate') {
          object.rotation.y = blast * 0.35 * (seed + 0.3);
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
      } else if (role === 'flame') {
        const burning = Boolean(s?.firesStart) && moment.fire > 0.02;
        object.visible = burning;
        const flicker = 0.8 + 0.25 * Math.sin(performance.now() / 70 + seed * 20);
        object.scale.setScalar(Math.max(0.01, moment.fire * flicker));
      }
    }
    // The flash lights everything from the side of the burst and washes the sky out.
    burst.intensity = moment.flash * 9 + moment.heat * 2.5;
    ambient.intensity = 1.1 + moment.flash * 3;
    (scene.background as THREE.Color).copy(sky).lerp(new THREE.Color(0xfff7dc), Math.min(1, moment.flash * 0.9 + moment.heat * 0.25));
    renderer.render(scene, camera);
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
    camera.updateProjectionMatrix();
    const fog = scene.fog as THREE.Fog;
    fog.near = view.fog[0] * back;
    fog.far = view.fog[1] * back;
    camera.far = Math.max(400, view.fog[1] * back * 1.2);
    camera.updateProjectionMatrix();
    apply();
  }

  build('street');
  resize();

  return {
    setKind(kind) {
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
      build('street');
      renderer.dispose();
    },
  };
}

// The models of the launch view: generic missiles and launchers, built in code from smooth
// shapes (lathed bodies, extruded plates, lattices). They are drawn to look like their
// kind of thing, not like any particular weapon or platform, and carry no technical detail.
//
// Frame of every model: x forward (towards the target), y up, z to the right; metres at
// life size. Missiles stand along +y with their tail at the origin; their back (-x) is
// the side that faces up once they lean over.

import * as THREE from 'three';

// ---------------------------------------------------------------- materials

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** One shared material per look, so the meshes that use it are joined into one batch. */
function paint(hex: number, metalness = 0.1, roughness = 0.6, glow = 0): THREE.MeshStandardMaterial {
  const key = `${hex}|${metalness}|${roughness}|${glow}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, metalness, roughness });
    if (glow > 0) {
      m.emissive.setHex(hex);
      m.emissiveIntensity = glow;
    }
    materials.set(key, m);
  }
  return m;
}

const C = {
  white: () => paint(0xeeebe4, 0.15, 0.45),
  black: () => paint(0x16181b, 0.2, 0.5),
  amber: () => paint(0xf5a524, 0.2, 0.45),
  nozzle: () => paint(0x3a3d42, 0.85, 0.35),
  gunmetal: () => paint(0x838d96, 0.55, 0.4),
  concrete: () => paint(0x9a9c98, 0, 0.9),
  concreteDark: () => paint(0x6c6f6e, 0, 0.92),
  pit: () => paint(0x0b0c0e, 0, 1),
  steel: () => paint(0x7c858d, 0.75, 0.38),
  steelDark: () => paint(0x41474d, 0.7, 0.45),
  tower: () => paint(0xb5462d, 0.35, 0.55),
  olive: () => paint(0x56603f, 0.15, 0.62),
  oliveDark: () => paint(0x3d4530, 0.15, 0.66),
  tyre: () => paint(0x1a1b1c, 0, 0.85),
  hub: () => paint(0x5d6252, 0.4, 0.5),
  glass: () => paint(0x1d2a33, 0.6, 0.12),
  hull: () => paint(0x1d242a, 0.35, 0.55),
  hullDeck: () => paint(0x2b343b, 0.3, 0.6),
  navy: () => paint(0x6f7a83, 0.35, 0.5),
  navyDark: () => paint(0x4e5860, 0.35, 0.55),
  boot: () => paint(0x7a2a25, 0.2, 0.6),
  aircraft: () => paint(0xc8cdd2, 0.45, 0.4),
  aircraftDark: () => paint(0x8c949b, 0.5, 0.45),
  foam: () => paint(0xd9e6ec, 0, 0.95),
};

// ---------------------------------------------------------------- shape helpers

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** A body of revolution about +y from (radius, height) points. */
function lathe(points: Array<[number, number]>, material: THREE.Material, segments = 40, phiStart = 0, phiLength = Math.PI * 2): THREE.Mesh {
  return mesh(
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
      segments,
      phiStart,
      phiLength,
    ),
    material,
  );
}

/** The same, lying along +x (its +y becomes +x). */
function latheX(points: Array<[number, number]>, material: THREE.Material, segments = 40): THREE.Mesh {
  const m = lathe(points, material, segments);
  m.geometry.rotateZ(-Math.PI / 2);
  return m;
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 24): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
}

/** A plate cut to an outline in the x–y plane, `thickness` deep along z, centred on z = 0. */
function plate(outline: Array<[number, number]>, thickness: number, material: THREE.Material, bevel = 0): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, thickness - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -thickness / 2 + bevel);
  return mesh(geometry, material);
}

/** A thin wing or fin, its outline drawn in the x–z plane (z out to the tip), `thickness` high. */
function wing(outline: Array<[number, number]>, thickness: number, material: THREE.Material): THREE.Mesh {
  const m = plate(
    outline.map(([x, z]) => [x, z]),
    thickness,
    material,
    Math.min(0.12, thickness * 0.3),
  );
  // Outline y becomes z (towards the tip); the thickness ends up vertical.
  m.geometry.rotateX(Math.PI / 2);
  return m;
}

/** A beam between two points. */
function beam(a: THREE.Vector3, b: THREE.Vector3, size: number, material: THREE.Material): THREE.Mesh {
  const length = a.distanceTo(b);
  const m = box(size, length, size, material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** The radius of a tangent ogive nose of length `length` and base radius `r`, at `t` from base (0) to tip (1). */
function ogive(r: number, length: number, t: number): number {
  const rho = (r * r + length * length) / (2 * r);
  const x = t * length;
  return Math.sqrt(Math.max(0, rho * rho - x * x)) + r - rho;
}

function noseProfile(r: number, length: number, base: number, steps = 14, blunt = 0.06): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([Math.max(ogive(r, length, t), i === steps ? 0 : r * blunt * (1 - t)), base + t * length]);
  }
  points.push([0, base + length]);
  return points;
}

// ---------------------------------------------------------------- missiles

/** Length and radius of the missile models, metres at life size. */
export const MISSILE_LENGTH_M = 20;
export const MISSILE_RADIUS_M = 1.7;

/** A three-stage missile: white body, dark bands, a black-and-white roll pattern, a nozzle. */
export function ballisticMissile(): THREE.Group {
  const g = new THREE.Group();
  const R = MISSILE_RADIUS_M;
  // The nozzle under the tail.
  g.add(
    lathe(
      [
        [R * 0.62, 0],
        [R * 0.55, 0.25],
        [R * 0.36, 0.8],
        [R * 0.3, 1.0],
        [R * 0.45, 1.05],
      ],
      C.nozzle(),
      32,
    ),
  );
  g.add(lathe([[0.01, 0.3], [R * 0.55, 0.3]], C.pit(), 24));
  // First stage, with a flared skirt at the bottom.
  g.add(
    lathe(
      [
        [R * 0.5, 0.95],
        [R * 1.07, 1.0],
        [R * 1.07, 1.5],
        [R, 2.1],
        [R, 9.2],
      ],
      C.white(),
    ),
  );
  // Roll pattern: black quarters on the upper part of the first stage.
  for (let k = 0; k < 4; k++) {
    g.add(lathe([[R * 1.004, 6.8], [R * 1.004, 9.2]], k % 2 ? C.black() : C.white(), 12, (k * Math.PI) / 2, Math.PI / 2));
  }
  // Interstage, second stage, the narrower third stage, the nose.
  g.add(lathe([[R, 9.2], [R * 0.99, 9.95]], C.black()));
  g.add(lathe([[R * 0.97, 9.95], [R * 0.97, 14.6]], C.white()));
  g.add(lathe([[R * 0.97, 14.6], [R * 0.86, 15.2]], C.black()));
  g.add(lathe([[R * 0.86, 15.2], [R * 0.86, 16.4]], C.white()));
  g.add(lathe(noseProfile(R * 0.86, MISSILE_LENGTH_M - 16.4, 16.4), C.white()));
  // A thin amber ring and a few panel joints.
  g.add(lathe([[R * 0.975, 13.4], [R * 0.975, 13.65]], C.amber(), 32));
  for (const y of [3.6, 5.2, 11.8]) g.add(lathe([[R * 1.012, y], [R * 1.012, y + 0.08]], C.black(), 32));
  // A cable duct along the back, and four small fins on the skirt.
  g.add(box(0.28, 7.8, 0.42, C.white(), -R * 1.04, 5.6, 0));
  for (let k = 0; k < 4; k++) {
    const fin = plate(
      [
        [0, 0],
        [1.35, 0.1],
        [1.35, 1.0],
        [0, 2.7],
      ],
      0.16,
      C.black(),
      0.04,
    );
    const holder = new THREE.Group();
    fin.position.set(R * 0.98, 1.1, 0);
    holder.add(fin);
    holder.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
    g.add(holder);
  }
  return g;
}

/** A cruise missile: a slim body with a pointed nose, swept wings, a tail cross and a belly intake. */
export function cruiseMissile(): THREE.Group {
  const g = new THREE.Group();
  const L = MISSILE_LENGTH_M;
  const R = 1.05;
  g.add(
    lathe(
      [
        [R * 0.55, 0],
        [R * 0.62, 0.3],
        [R, 1.6],
        [R, L - 4.2],
        ...noseProfile(R, 4.2, L - 4.2, 12, 0.02).slice(1),
      ],
      C.gunmetal(),
    ),
  );
  g.add(lathe([[R * 0.5, -0.1], [R * 0.56, 0.32]], C.nozzle(), 24));
  g.add(lathe([[R * 1.01, L - 6.4], [R * 1.01, L - 6.1]], C.amber(), 32));
  // Wings swept back, along z, from the middle of the body.
  const wingOutline: Array<[number, number]> = [
    [0, 0],
    [-1.0, 5.6],
    [-2.0, 5.6],
    [-2.6, 0],
  ];
  for (const side of [1, -1]) {
    const w = wing(wingOutline, 0.22, C.gunmetal());
    w.geometry.rotateZ(Math.PI / 2);
    const holder = new THREE.Group();
    holder.add(w);
    holder.position.set(-R * 0.2, L * 0.55, 0);
    holder.scale.z = side;
    g.add(holder);
  }
  // Tail cross.
  for (let k = 0; k < 4; k++) {
    const fin = plate(
      [
        [0, 0],
        [1.5, 0.6],
        [1.5, 1.6],
        [0, 2.4],
      ],
      0.14,
      C.gunmetal(),
      0.03,
    );
    const holder = new THREE.Group();
    fin.position.set(R * 0.9, 0.4, 0);
    holder.add(fin);
    holder.rotation.y = (k * Math.PI) / 2 + Math.PI / 4;
    g.add(holder);
  }
  // The engine intake under the belly (+x faces down once it flies level).
  g.add(box(0.7, 2.4, 1.0, C.steelDark(), R * 0.95, 3.4, 0));
  return g;
}

// ---------------------------------------------------------------- silo

/** The silo around the tube: a concrete apron, a raised collar, rails for the lid, a fence. */
export function siloBase(): THREE.Group {
  const g = new THREE.Group();
  // An eight-sided apron with a chamfered edge.
  const apron = lathe(
    [
      [16, 0],
      [15.2, 0.55],
      [0.01, 0.55],
    ],
    C.concrete(),
    8,
    Math.PI / 8,
  );
  g.add(apron);
  // The collar around the opening, and the dark tube with steel rings inside.
  // Profiles run up the outside and in over the top, so every face looks outwards; the
  // collar's profile goes on down the inside of the opening, whose faces then look inwards.
  // The globe hides what is below the ground, so the opening is a dark floor just above it.
  g.add(
    lathe(
      [
        [5.6, 0.55],
        [4.9, 1.95],
        [3.6, 1.95],
        [3.25, 1.6],
        [3.25, 0.6],
      ],
      C.concreteDark(),
      48,
    ),
  );
  g.add(lathe([[3.25, 1.05], [3.25, 0.9]], C.steelDark(), 48));
  g.add(lathe([[3.26, 0.62], [0.01, 0.62]], C.pit(), 40));
  // Rails the lid runs on, out to the right.
  for (const x of [-3.1, 3.1]) {
    g.add(box(0.6, 0.5, 21, C.steel(), x, 1.2, 7));
    g.add(box(1.1, 0.7, 21, C.concreteDark(), x, 0.75, 7));
  }
  g.add(box(9.4, 0.9, 1.0, C.concreteDark(), 0, 1.0, 17.6));
  // Hatches, a small equipment house and an antenna mast.
  for (const [x, z] of [
    [-9, -6],
    [9.5, -4],
  ] as const) {
    g.add(box(2.4, 0.4, 2.4, C.steelDark(), x, 0.75, z));
    g.add(box(2.0, 0.2, 2.0, C.steel(), x, 0.98, z));
  }
  g.add(box(4.2, 2.6, 3.0, C.concreteDark(), -10, 1.85, 8));
  const mast = cyl(0.12, 0.18, 9, C.steel(), 8);
  mast.position.set(10, 5, 9);
  g.add(mast);
  for (const y of [6.5, 8.2]) g.add(box(0.1, 0.1, 2.2, C.steel(), 10, y, 9));
  // Hazard marks around the opening.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const mark = box(0.9, 0.06, 0.5, k % 2 ? C.amber() : C.black(), Math.cos(a) * 5.0, 1.98, Math.sin(a) * 5.0);
    mark.rotation.y = -a;
    g.add(mark);
  }
  // A fence of posts and two wires around the site.
  const fence = 21;
  const posts = 32;
  for (let k = 0; k < posts; k++) {
    const a = (k / posts) * Math.PI * 2;
    const post = cyl(0.07, 0.07, 2.6, C.steel(), 6);
    post.position.set(Math.cos(a) * fence, 1.3, Math.sin(a) * fence);
    g.add(post);
    const b = ((k + 1) / posts) * Math.PI * 2;
    for (const y of [1.4, 2.4]) {
      g.add(beam(new THREE.Vector3(Math.cos(a) * fence, y, Math.sin(a) * fence), new THREE.Vector3(Math.cos(b) * fence, y, Math.sin(b) * fence), 0.04, C.steel()));
    }
  }
  return g;
}

/** The heavy lid that slides off the opening, with striped edges. */
export function siloLid(): THREE.Group {
  const g = new THREE.Group();
  const lid = plate(
    [
      [-4.2, -4.2],
      [4.2, -4.2],
      [4.2, 4.2],
      [-4.2, 4.2],
    ],
    1.4,
    C.concreteDark(),
    0.25,
  );
  lid.geometry.rotateX(Math.PI / 2);
  g.add(lid);
  g.add(box(6.4, 0.12, 6.4, C.steelDark(), 0, 0.72, 0));
  for (let k = 0; k < 10; k++) g.add(box(0.84, 0.14, 0.3, k % 2 ? C.amber() : C.black(), -3.8 + k * 0.84, 0.74, -4.0));
  for (let k = 0; k < 10; k++) g.add(box(0.84, 0.14, 0.3, k % 2 ? C.black() : C.amber(), -3.8 + k * 0.84, 0.74, 4.0));
  // Wheels on the rails.
  for (const x of [-3.1, 3.1]) for (const z of [-3, 3]) {
    const wheel = cyl(0.45, 0.45, 0.4, C.steel(), 16);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -0.55, z);
    g.add(wheel);
  }
  return g;
}

// ---------------------------------------------------------------- launch pad

/** An open launch pad: apron, flame trench, launch table and a red lattice service tower behind it. */
export function launchPad(): THREE.Group {
  const g = new THREE.Group();
  g.add(lathe([[18, 0], [17, 0.5], [0.01, 0.5]], C.concrete(), 48));
  g.add(box(30, 0.2, 6, C.pit(), -8, 0.45, 0));
  g.add(box(30, 0.6, 0.7, C.concreteDark(), -8, 0.75, 3.3));
  g.add(box(30, 0.6, 0.7, C.concreteDark(), -8, 0.75, -3.3));
  // The launch table on four legs over the trench.
  g.add(box(6, 0.8, 6, C.steelDark(), 0, 2.4, 0));
  for (const x of [-2.6, 2.6]) for (const z of [-2.6, 2.6]) g.add(box(0.6, 2, 0.6, C.steelDark(), x, 1.2, z));
  g.add(lathe([[2.2, 2.8], [2.5, 3.1], [2.5, 3.3], [1.9, 3.3]], C.steel(), 32));
  // The tower, behind the missile (seen beside it from the side): four corner posts, floors
  // every 3 m and crossed braces.
  const tx = -6.5;
  const s = 1.6;
  const height = 26;
  const corners = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ] as const;
  for (const [x, z] of corners) g.add(beam(new THREE.Vector3(tx + x, 0.5, z), new THREE.Vector3(tx + x, height, z), 0.32, C.tower()));
  for (let y = 3; y <= height; y += 3) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      g.add(beam(new THREE.Vector3(tx + ax, y, az), new THREE.Vector3(tx + bx, y, bz), 0.22, C.tower()));
      g.add(beam(new THREE.Vector3(tx + ax, y - 3, az), new THREE.Vector3(tx + bx, y, bz), 0.12, C.tower()));
    }
  }
  g.add(box(4.4, 0.3, 4.4, C.steelDark(), tx, height, 0));
  // Arms reaching to the missile, and a small crane on top.
  for (const y of [8, 15]) g.add(box(-tx - 2.3, 0.7, 1.0, C.tower(), (tx - 2.3) / 2, y, 0));
  g.add(beam(new THREE.Vector3(tx, height, 0), new THREE.Vector3(tx + 1, height + 4, 0), 0.25, C.tower()));
  g.add(beam(new THREE.Vector3(tx + 1, height + 4, 0), new THREE.Vector3(tx + 6, height + 3, 0), 0.2, C.tower()));
  return g;
}

// ---------------------------------------------------------------- road-mobile launcher

/** Where the missile's tail lies on the truck: at the pivot of the erector, metres. */
export const TRUCK_PIVOT = { x: -11.2, y: 5.0 } as const;

/** A long eight-wheeled launcher truck; its erector is a separate model. */
export function launcherTruck(): THREE.Group {
  const g = new THREE.Group();
  // Chassis and long body, with the cab at the front (+x).
  g.add(box(23.5, 0.7, 2.6, C.oliveDark(), 0, 1.25, 0));
  const body = plate(
    [
      [-11.8, 0],
      [7.0, 0],
      [7.0, 1.25],
      [-11.2, 1.25],
      [-11.8, 0.8],
    ],
    3.6,
    C.olive(),
    0.12,
  );
  body.position.y = 1.55;
  g.add(body);
  // Wheel arches over each axle, then the wheels with their hubs.
  const axles = [-9.6, -6.6, 3.2, 6.2];
  for (const x of axles) {
    for (const z of [-1.55, 1.55]) {
      const tyre = cyl(1.0, 1.0, 0.7, C.tyre(), 28);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(x, 1.0, z);
      g.add(tyre);
      const hub = cyl(0.55, 0.55, 0.74, C.hub(), 16);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, 1.0, z);
      g.add(hub);
      const arch = lathe([[1.25, -0.42], [1.25, 0.42]], C.oliveDark(), 20, 0, Math.PI);
      arch.geometry.rotateX(Math.PI / 2);
      arch.position.set(x, 1.0, z * 1.02);
      g.add(arch);
    }
  }
  // The cab: a sloped windscreen and side windows.
  const cab = plate(
    [
      [0, 0],
      [4.4, 0],
      [4.6, 1.0],
      [4.0, 2.5],
      [0.4, 2.6],
      [0, 2.2],
    ],
    3.5,
    C.olive(),
    0.18,
  );
  cab.position.set(7.1, 1.4, 0);
  g.add(cab);
  const screen = box(0.12, 1.15, 3.0, C.glass(), 11.15, 3.25, 0);
  screen.rotation.z = 0.36;
  g.add(screen);
  for (const z of [-1.78, 1.78]) g.add(box(2.6, 0.8, 0.06, C.glass(), 9.0, 3.4, z));
  g.add(box(0.5, 0.5, 3.2, C.oliveDark(), 11.8, 1.6, 0));
  for (const z of [-1.3, 1.3]) g.add(box(0.1, 0.32, 0.5, C.amber(), 11.95, 2.2, z));
  // Stabiliser jacks lowered at the back, the erector's pivot and stowage boxes along the side.
  for (const z of [-1.7, 1.7]) {
    g.add(box(0.35, 1.9, 0.35, C.steelDark(), -11.0, 0.95, z));
    g.add(box(1.0, 0.15, 1.0, C.steelDark(), -11.0, 0.08, z));
  }
  // The pivot of the erector at the back.
  g.add(box(1.6, 2.2, 3.0, C.steelDark(), -11.0, 3.9, 0));
  for (const x of [-4.5, -1.5, 1.5]) for (const z of [-1.86, 1.86]) g.add(box(2.4, 0.9, 0.14, C.oliveDark(), x, 2.0, z));
  return g;
}

/** The erector the missile lies on: a cradle along +y on the missile's +x side (towards the truck). */
export function launcherErector(): THREE.Group {
  const g = new THREE.Group();
  const offset = MISSILE_RADIUS_M + 0.45;
  for (const z of [-0.9, 0.9]) g.add(box(0.5, 16.5, 0.35, C.oliveDark(), offset, 8.4, z));
  for (let y = 1.5; y < 16.5; y += 2.4) {
    g.add(box(0.4, 0.35, 2.2, C.oliveDark(), offset, y, 0));
    // Clamps around the missile.
    const clamp = lathe([[MISSILE_RADIUS_M + 0.12, y - 0.18], [MISSILE_RADIUS_M + 0.12, y + 0.18]], C.steelDark(), 24, -Math.PI / 2, Math.PI);
    g.add(clamp);
  }
  return g;
}

// ---------------------------------------------------------------- submarine

/** A submarine on the surface, long and dark, with its sail, a raised missile deck and an open hatch. */
export function submarine(): THREE.Group {
  const g = new THREE.Group();
  const L = 104;
  const R = 5.6;
  // The hull: rounded bow, long straight middle, tapering stern. Its centre is below the water.
  const profile: Array<[number, number]> = [];
  profile.push([0.01, -L / 2]);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    profile.push([R * Math.pow(t, 0.55) * (0.25 + 0.75 * t), -L / 2 + t * 34]);
  }
  profile.push([R, 20]);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    profile.push([R * Math.sqrt(1 - t * t * 0.985), 20 + t * 32]);
  }
  profile.push([0.01, L / 2]);
  const hull = latheX(profile, C.hull(), 48);
  hull.position.y = -1.8;
  g.add(hull);
  // The raised missile deck behind the sail, with rows of hatches.
  const deck = plate(
    [
      [-28, 0],
      [8, 0],
      [9.5, 1.4],
      [-26, 1.4],
    ],
    6.4,
    C.hullDeck(),
    0.5,
  );
  deck.position.y = 2.9;
  g.add(deck);
  for (let k = 0; k < 8; k++) {
    for (const z of [-1.6, 1.6]) {
      const x = 6 - k * 4.1;
      const open = Math.abs(x - -12) < 1.5 && z < 0;
      const hatch = lathe([[1.15, 0], [1.15, 0.12], [1.0, 0.2], [0.01, 0.2]], open ? C.pit() : C.hull(), 24);
      hatch.position.set(x, 4.32, z);
      g.add(hatch);
    }
  }
  // The open hatch cover, standing up beside its tube.
  const cover = cyl(1.15, 1.15, 0.2, C.hull(), 24);
  cover.rotation.x = Math.PI / 2;
  cover.position.set(-12, 5.5, -2.95);
  g.add(cover);
  // The sail: a tall streamlined fin with planes on its sides.
  const sail = plate(
    [
      [0, 0],
      [-1.2, 7.2],
      [8.8, 7.2],
      [10.5, 0],
    ],
    2.6,
    C.hull(),
    0.6,
  );
  sail.position.set(13, 3.3, 0);
  g.add(sail);
  for (const side of [1, -1]) {
    const plane = wing(
      [
        [0, 0],
        [-0.4, 4.2],
        [-2.4, 4.2],
        [-3.2, 0],
      ],
      0.35,
      C.hull(),
    );
    plane.position.set(19.5, 7.4, 0);
    plane.scale.z = side;
    g.add(plane);
  }
  g.add(box(0.4, 1.6, 0.4, C.steelDark(), 15.5, 11.2, 0));
  g.add(box(0.25, 2.4, 0.25, C.steelDark(), 17, 11.6, 0.5));
  // The stern: a rudder above the water and planes to the sides.
  const rudder = plate(
    [
      [0, 0],
      [-2.2, 6.5],
      [-6, 6.5],
      [-6.6, 0],
    ],
    0.5,
    C.hull(),
    0.15,
  );
  rudder.position.set(-40, -0.5, 0);
  g.add(rudder);
  for (const side of [1, -1]) {
    const plane = wing(
      [
        [0, 0],
        [-1.6, 5.2],
        [-4.2, 5.2],
        [-5.2, 0],
      ],
      0.4,
      C.hull(),
    );
    plane.position.set(-40.5, -1.4, side * 1.6);
    plane.scale.z = side;
    g.add(plane);
  }
  // White water along the sides and a wake behind.
  const foam = lathe([[R * 1.25, 0], [0.01, 0]], C.foam(), 48);
  foam.geometry.scale((L * 0.5 + 5) / (R * 1.25), 1, 1);
  foam.position.set(-1, 0.12, 0);
  g.add(foam);
  return g;
}

// ---------------------------------------------------------------- ship

/** A grey warship: a pointed hull, a stepped superstructure, a mast, a funnel and a deck of launch cells. */
export function warship(): THREE.Group {
  const g = new THREE.Group();
  // Top view of the hull: a sharp bow at +x, a square stern.
  const outline: Array<[number, number]> = [
    [-32, -3.6],
    [14, -4.3],
    [24, -3.4],
    [33, 0],
    [24, 3.4],
    [14, 4.3],
    [-32, 3.6],
  ];
  const hull = plate(outline, 6.4, C.navyDark(), 0.4);
  hull.geometry.rotateX(Math.PI / 2);
  hull.position.y = 1.7;
  g.add(hull);
  const deck = plate(outline, 0.2, C.navy(), 0.05);
  deck.geometry.rotateX(Math.PI / 2);
  deck.position.y = 4.95;
  g.add(deck);
  // A dark red band at the waterline.
  const band = plate(outline, 0.7, C.boot(), 0);
  band.geometry.rotateX(Math.PI / 2);
  band.geometry.scale(1.004, 1, 1.02);
  band.position.y = -1.0;
  g.add(band);
  // Launch cells ahead of the bridge.
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.add(box(1.0, 0.12, 1.0, C.steelDark(), 10.5 + i * 1.25, 5.1, -1.9 + j * 1.25));
  }
  g.add(box(5.6, 0.1, 5.6, C.navyDark(), 12.4, 5.06, 0));
  // A gun on the foredeck.
  const gun = lathe([[1.6, 0], [1.4, 1.3], [0.8, 1.8], [0.01, 1.8]], C.navy(), 20);
  gun.position.set(22, 5, 0);
  g.add(gun);
  const barrel = cyl(0.15, 0.2, 5.5, C.navyDark(), 10);
  barrel.rotation.z = -Math.PI / 2 + 0.08;
  barrel.position.set(24.6, 6.3, 0);
  g.add(barrel);
  // The superstructure, in steps, with a dark band of bridge windows.
  const bridge = plate(
    [
      [0, 0],
      [9, 0],
      [7.8, 5.2],
      [0.5, 5.2],
    ],
    7.6,
    C.navy(),
    0.2,
  );
  bridge.position.set(-1, 5, 0);
  g.add(bridge);
  const windows = box(0.2, 0.9, 6.8, C.glass(), 7.3, 9.3, 0);
  windows.rotation.z = 0.22;
  g.add(windows);
  const hangar = plate(
    [
      [0, 0],
      [16, 0],
      [16, 4.2],
      [0.8, 4.2],
    ],
    7.2,
    C.navy(),
    0.2,
  );
  hangar.position.set(-24, 5, 0);
  g.add(hangar);
  // Funnel, mast with yards and a radar.
  const funnel = plate(
    [
      [0, 0],
      [5, 0],
      [4.4, 5.2],
      [0.4, 5.2],
    ],
    3.2,
    C.navyDark(),
    0.3,
  );
  funnel.position.set(-8, 9, 0);
  g.add(funnel);
  g.add(box(4.2, 0.5, 2.4, C.black(), -5.6, 14.3, 0));
  const mast = cyl(0.3, 0.5, 12, C.navy(), 10);
  mast.position.set(3, 16, 0);
  g.add(mast);
  for (const [y, w] of [
    [17.5, 5],
    [20, 3],
  ] as const)
    g.add(box(0.3, 0.3, w, C.navy(), 3, y, 0));
  g.add(box(0.5, 1.6, 2.8, C.navyDark(), 3, 22.4, 0));
  return g;
}

// ---------------------------------------------------------------- aircraft

/** A large swept-wing jet: long fuselage, four engines under the wings, a tall fin. */
export function aircraft(): THREE.Group {
  const g = new THREE.Group();
  const L = 44;
  const R = 2.4;
  const profile: Array<[number, number]> = [[0.01, -L / 2]];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    profile.push([R * (0.18 + 0.82 * Math.sqrt(t)), -L / 2 + t * 13]);
  }
  profile.push([R, 12]);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    profile.push([R * Math.sqrt(1 - t * t) * (1 - 0.05 * t), 12 + t * 10]);
  }
  profile.push([0.01, L / 2]);
  const body = latheX(profile, C.aircraft(), 40);
  g.add(body);
  // Cockpit windows.
  const windows = lathe([[R * 1.004, 0], [R * 1.004, 1.1]], C.glass(), 16, -Math.PI * 0.42, Math.PI * 0.84);
  windows.geometry.rotateZ(-Math.PI / 2);
  windows.position.set(15.6, 0.3, 0);
  g.add(windows);
  // Wings: swept back, with a little dihedral.
  const wingOutline: Array<[number, number]> = [
    [5, 0],
    [-8.6, 22],
    [-11.6, 22],
    [-5.5, 0],
  ];
  for (const side of [1, -1]) {
    const w = wing(wingOutline, 0.6, C.aircraft());
    w.rotation.x = side * -0.06;
    w.position.set(0, -0.9, side * 1.2);
    w.scale.z = side;
    g.add(w);
    // Two engines under each wing, hanging on pylons.
    for (const [x, z] of [
      [-0.2, 7.5],
      [-5.0, 14.0],
    ] as const) {
      const nacelle = latheX(
        [
          [0.6, -2.4],
          [0.95, -1.8],
          [1.05, 0],
          [1.0, 1.6],
          [0.82, 1.9],
        ],
        C.aircraftDark(),
        24,
      );
      nacelle.position.set(x, -2.3, side * z);
      g.add(nacelle);
      // Dark intake at the front and exhaust at the back.
      const intake = latheX([[0.8, 1.85], [0.01, 1.85]], C.pit(), 20);
      intake.position.set(x, -2.3, side * z);
      g.add(intake);
      const exhaust = latheX([[0.01, -2.35], [0.58, -2.35]], C.pit(), 20);
      exhaust.position.set(x, -2.3, side * z);
      g.add(exhaust);
      g.add(box(2.4, 1.0, 0.25, C.aircraft(), x + 0.3, -1.5, side * z));
    }
  }
  // Tailplane and fin.
  for (const side of [1, -1]) {
    const tail = wing(
      [
        [-14.5, 0],
        [-19.5, 8.2],
        [-21, 8.2],
        [-19, 0],
      ],
      0.35,
      C.aircraft(),
    );
    tail.position.set(0, 0.6, side * 0.8);
    tail.scale.z = side;
    g.add(tail);
  }
  const fin = plate(
    [
      [-13, 0],
      [-19.5, 9.5],
      [-21.4, 9.5],
      [-21.2, 0],
    ],
    0.45,
    C.aircraft(),
    0.12,
  );
  fin.position.y = 1.6;
  g.add(fin);
  g.add(box(1.4, 0.3, 0.5, C.amber(), -20.2, 11.0, 0));
  return g;
}

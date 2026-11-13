// The things of the close view, built in code: buildings with windowed fronts and roofs,
// cars, trees, street lights, a cargo ship, harbour cranes, sheds, tanks, a chimney, pylons,
// a cooling tower. They stand for kinds of things, not for real places; sizes are metres.

import * as THREE from 'three';

// ---------------------------------------------------------------- materials and textures

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** A shared material per look. */
export function std(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    cache.set(key, m);
  }
  return m;
}

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export type FacadeStyle = 'brick' | 'concrete' | 'plaster' | 'glass' | 'metal';

const WALL: Record<FacadeStyle, string> = {
  brick: '#8a4f3d',
  concrete: '#a7a9a6',
  plaster: '#d8cdb6',
  glass: '#56697a',
  metal: '#8e979e',
};

/** A little grain over a wall colour. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  let seed = 3;
  for (let i = 0; i < (w * h) / 6; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % w;
    seed = (seed * 16807) % 2147483647;
    const y = seed % h;
    ctx.fillStyle = seed % 2 ? `rgba(0,0,0,${amount})` : `rgba(255,255,255,${amount * 0.7})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

interface Facade {
  whole: THREE.CanvasTexture;
  broken: THREE.CanvasTexture;
  /** White where the windows are: they glow when the building burns. */
  glow: THREE.CanvasTexture;
}

const facades = new Map<FacadeStyle, Facade>();

/** One storey-high, one-bay-wide cell of a front (3.4 m by 3 m), repeated over the walls. */
export function facade(style: FacadeStyle): Facade {
  let f = facades.get(style);
  if (f) return f;
  const W = 96;
  const H = 108;
  const glass = style === 'glass';
  const win = glass ? { x: 4, y: 8, w: 88, h: 92 } : style === 'metal' ? { x: 30, y: 20, w: 36, h: 22 } : { x: 24, y: 26, w: 48, h: 56 };
  const wall = (ctx: CanvasRenderingContext2D): void => {
    ctx.fillStyle = WALL[style];
    ctx.fillRect(0, 0, W, H);
    if (style === 'brick') {
      ctx.strokeStyle = 'rgba(40,20,14,0.35)';
      for (let y = 0; y < H; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        for (let x = (y / 6) % 2 ? 0 : 8; x < W; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 6);
          ctx.stroke();
        }
      }
    }
    if (style === 'metal') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 2, H);
    }
    grain(ctx, W, H, 0.05);
    // A floor band.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, H - 6, W, 6);
  };
  const whole = canvas(W, H, (ctx) => {
    wall(ctx);
    const g = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
    g.addColorStop(0, glass ? '#9cc3df' : '#a9cce6');
    g.addColorStop(1, glass ? '#2f4a60' : '#33485a');
    ctx.fillStyle = g;
    ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.strokeStyle = glass ? 'rgba(30,40,50,0.8)' : 'rgba(240,236,228,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(win.x, win.y, win.w, win.h);
    ctx.beginPath();
    ctx.moveTo(win.x + win.w / 2, win.y);
    ctx.lineTo(win.x + win.w / 2, win.y + win.h);
    ctx.stroke();
  });
  const broken = canvas(W, H, (ctx) => {
    wall(ctx);
    ctx.fillStyle = '#121416';
    ctx.fillRect(win.x, win.y, win.w, win.h);
    // A few shards left in the frame.
    ctx.fillStyle = 'rgba(150,180,200,0.55)';
    ctx.beginPath();
    ctx.moveTo(win.x, win.y);
    ctx.lineTo(win.x + win.w * 0.3, win.y);
    ctx.lineTo(win.x, win.y + win.h * 0.4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(win.x + win.w, win.y + win.h);
    ctx.lineTo(win.x + win.w * 0.75, win.y + win.h);
    ctx.lineTo(win.x + win.w, win.y + win.h * 0.7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(win.x, win.y, win.w, win.h);
  });
  const glow = canvas(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(win.x + 2, win.y + 2, win.w - 4, win.h - 4);
  });
  f = { whole, broken, glow };
  facades.set(style, f);
  return f;
}

let groundTextures: Record<string, THREE.CanvasTexture> | null = null;

/** Tiling textures for the ground: asphalt, grass, paving, gravel. */
export function groundTexture(kind: 'asphalt' | 'grass' | 'paving' | 'gravel'): THREE.CanvasTexture {
  groundTextures ??= {};
  let t = groundTextures[kind];
  if (!t) {
    const base = { asphalt: '#3a3d41', grass: '#4f6b45', paving: '#8f8b84', gravel: '#77736b' }[kind];
    t = canvas(128, 128, (ctx) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 128, 128);
      grain(ctx, 128, 128, kind === 'grass' ? 0.12 : 0.09);
      if (kind === 'paving') {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        for (let i = 0; i <= 128; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 128);
          ctx.moveTo(0, i);
          ctx.lineTo(128, i);
          ctx.stroke();
        }
      }
      if (kind === 'grass') {
        let seed = 9;
        for (let i = 0; i < 400; i++) {
          seed = (seed * 16807) % 2147483647;
          ctx.fillStyle = seed % 3 ? 'rgba(120,150,80,0.25)' : 'rgba(30,50,25,0.25)';
          ctx.fillRect(seed % 128, (seed >> 7) % 128, 3, 3);
        }
      }
    });
    groundTextures[kind] = t;
  }
  return t;
}

/** A material for a stretch of ground `w` by `d` metres, with its texture repeated every `tile` metres. */
export function groundMaterial(kind: 'asphalt' | 'grass' | 'paving' | 'gravel', w: number, d: number, tile = 8): THREE.MeshStandardMaterial {
  const map = groundTexture(kind).clone();
  map.needsUpdate = true;
  map.repeat.set(w / tile, d / tile);
  return new THREE.MeshStandardMaterial({ map, roughness: kind === 'asphalt' ? 0.92 : 1 });
}

// ---------------------------------------------------------------- small helpers

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

/** A box standing on y = 0 at (x, z). */
export function block(w: number, h: number, d: number, material: THREE.Material, x = 0, z = 0, y = 0): THREE.Mesh {
  return box(w, h, d, material, x, y + h / 2, z);
}

export function cylinder(rTop: number, rBottom: number, h: number, material: THREE.Material, segments = 20, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material, x, y + h / 2, z);
}

export function beam(a: THREE.Vector3, b: THREE.Vector3, size: number, material: THREE.Material): THREE.Mesh {
  const m = box(size, a.distanceTo(b), size, material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** A plate cut to an outline in the x–y plane, `depth` thick along z, centred. */
export function plate(outline: Array<[number, number]>, depth: number, material: THREE.Material, bevel = 0): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2 + bevel);
  return mesh(g, material);
}

// ---------------------------------------------------------------- buildings

export interface BuildingSkin {
  /** The wall materials, whose colour is darkened by fire and whose texture shows broken windows. */
  walls: THREE.MeshStandardMaterial[];
  facade: Facade;
  base: THREE.Color;
}

/** Scales the texture coordinates of a box's walls so one cell is one storey by one bay. */
function wallUVs(geometry: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  // Faces in order: +x, -x, +y, -y, +z, -z; four corners each.
  const widths = [d, d, w, d, w, w];
  for (let face = 0; face < 6; face++) {
    if (face === 2 || face === 3) continue;
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(widths[face]! / 3.4)), uv.getY(i) * Math.max(1, Math.round(h / 3)));
    }
  }
  uv.needsUpdate = true;
}

/**
 * A building on the ground with windowed walls, a flat roof with a parapet and a few
 * things on the roof. Its origin is the middle of its base, so it can be squashed.
 */
export function building(w: number, h: number, d: number, style: FacadeStyle, tint = 0xffffff): { group: THREE.Group; skin: BuildingSkin } {
  const f = facade(style);
  const group = new THREE.Group();
  const walls: THREE.MeshStandardMaterial[] = [];
  const wall = (): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      map: f.whole,
      color: tint,
      roughness: style === 'glass' ? 0.25 : 0.85,
      metalness: style === 'glass' ? 0.4 : 0,
      emissiveMap: f.glow,
      emissive: 0x000000,
    });
    walls.push(m);
    return m;
  };
  const roof = std(0x55595d, 0.95);
  const geometry = new THREE.BoxGeometry(w, h, d);
  wallUVs(geometry, w, h, d);
  geometry.translate(0, h / 2, 0);
  const shared = wall();
  group.add(mesh(geometry, [shared, shared, roof, roof, shared, shared]));
  // Parapet round the roof.
  const lip = std(0x6e7176, 0.9);
  const p = 0.35;
  group.add(box(w, 0.9, p, lip, 0, h + 0.45, d / 2 - p / 2), box(w, 0.9, p, lip, 0, h + 0.45, -d / 2 + p / 2));
  group.add(box(p, 0.9, d, lip, w / 2 - p / 2, h + 0.45, 0), box(p, 0.9, d, lip, -w / 2 + p / 2, h + 0.45, 0));
  // Roof things: a plant room, units, a tank.
  if (w > 6 && d > 6) {
    group.add(block(w * 0.3, 2.2, d * 0.3, std(0x7b7f84, 0.85), -w * 0.18, -d * 0.12, h));
    group.add(block(1.4, 1.0, 1.0, std(0x9aa0a6, 0.6, 0.3), w * 0.25, d * 0.22, h));
    group.add(block(1.4, 1.0, 1.0, std(0x9aa0a6, 0.6, 0.3), w * 0.25, d * 0.05, h));
    if (h > 12) group.add(cylinder(0.9, 0.9, 1.8, std(0x8a6d4a, 0.8), 14, w * 0.28, h + 0.6, -d * 0.25));
  }
  // A door and a canopy on the front.
  group.add(box(2.2, 2.6, 0.1, std(0x2a2d31, 0.4, 0.4), w * 0.15, 1.3, d / 2 + 0.03));
  group.add(box(3.2, 0.2, 1.2, std(0x6e7176, 0.8), w * 0.15, 2.9, d / 2 + 0.6));
  return { group, skin: { walls, facade: f, base: new THREE.Color(tint) } };
}

/** A shed with a pitched roof (a hangar, a warehouse, a turbine hall). */
export function shed(w: number, h: number, d: number, wallColor: number, roofColor: number, ridge = 0.25): THREE.Group {
  const group = new THREE.Group();
  const f = facade('metal');
  const geometry = new THREE.BoxGeometry(w, h, d);
  wallUVs(geometry, w, h, d);
  geometry.translate(0, h / 2, 0);
  const walls = new THREE.MeshStandardMaterial({ map: f.whole, color: wallColor, roughness: 0.75, metalness: 0.2 });
  group.add(mesh(geometry, walls));
  const rise = d * ridge;
  const roof = plate(
    [
      [-d / 2 - 0.4, 0],
      [d / 2 + 0.4, 0],
      [0, rise],
    ],
    w + 0.6,
    std(roofColor, 0.6, 0.35),
  );
  roof.rotation.y = Math.PI / 2;
  roof.position.y = h;
  group.add(roof);
  // Big doors on the front.
  group.add(box(w * 0.5, h * 0.75, 0.15, std(0x5d646b, 0.6, 0.4), 0, (h * 0.75) / 2, d / 2 + 0.05));
  return group;
}

// ---------------------------------------------------------------- street things

/** A car: a rounded body, a glass cabin and four wheels, about 4.4 m long. */
export function car(color: number, long = 4.4): THREE.Group {
  const g = new THREE.Group();
  const k = long / 4.4;
  const body = plate(
    [
      [-2.2, 0.35],
      [2.2, 0.35],
      [2.25, 0.8],
      [1.9, 1.0],
      [-2.0, 1.05],
      [-2.25, 0.85],
    ],
    1.78,
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 }),
    0.08,
  );
  body.scale.set(k, 1, 1);
  g.add(body);
  const cabin = plate(
    [
      [-1.5, 1.0],
      [1.1, 1.0],
      [0.55, 1.5],
      [-1.15, 1.52],
    ],
    1.55,
    std(0x1e2933, 0.15, 0.6),
    0.05,
  );
  cabin.scale.set(k, 1, 1);
  g.add(cabin);
  const tyre = std(0x16171a, 0.9);
  for (const x of [-1.35 * k, 1.35 * k]) {
    for (const z of [-0.82, 0.82]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), tyre, x, 0.36, z);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
  }
  g.add(box(0.05, 0.14, 0.3, std(0xfff4cc, 0.3), 2.24 * k, 0.75, 0.55), box(0.05, 0.14, 0.3, std(0xfff4cc, 0.3), 2.24 * k, 0.75, -0.55));
  return g;
}

/** A broad-leaved tree: a trunk and a crown of a few overlapping lumps. */
export function tree(seed = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(0.22, 0.32, 3.2, std(0x5b4130, 0.95), 7));
  const greens = [0x4b7a42, 0x5a8a4a, 0x3f6b3a];
  for (let i = 0; i < 4; i++) {
    const a = seed * 3 + i * 1.9;
    const r = 1.4 + ((i * 7 + seed * 3) % 5) * 0.12;
    const lump = mesh(new THREE.IcosahedronGeometry(r, 1), std(greens[(i + seed) % 3]!, 0.9), Math.cos(a) * 0.8, 4.2 + (i % 2) * 0.8, Math.sin(a) * 0.8);
    g.add(lump);
  }
  return g;
}

export function streetLight(): THREE.Group {
  const g = new THREE.Group();
  const metal = std(0x50565c, 0.5, 0.6);
  g.add(cylinder(0.08, 0.12, 7, metal, 8));
  g.add(box(1.6, 0.1, 0.1, metal, 0.7, 7, 0));
  g.add(box(0.6, 0.15, 0.3, std(0xfff1c9, 0.3), 1.4, 6.92, 0));
  return g;
}

// ---------------------------------------------------------------- harbour

/** A cargo ship: black hull with a red bottom, white bridge at the stern, rows of containers. */
export function cargoShip(): THREE.Group {
  const g = new THREE.Group();
  const L = 46;
  const outline: Array<[number, number]> = [
    [-L / 2, -4.6],
    [L / 2 - 8, -4.8],
    [L / 2, 0],
    [L / 2 - 8, 4.8],
    [-L / 2, 4.6],
  ];
  const top = plate(outline, 4.2, std(0x1f2428, 0.6, 0.3), 0.2);
  top.rotation.x = Math.PI / 2;
  top.position.y = 3.2;
  const bottom = plate(outline, 2.4, std(0x7d2722, 0.7, 0.2), 0.1);
  bottom.rotation.x = Math.PI / 2;
  bottom.scale.set(0.97, 0.94, 1);
  bottom.position.y = 0.6;
  const deck = plate(outline, 0.15, std(0x6e5b4a, 0.85), 0);
  deck.rotation.x = Math.PI / 2;
  deck.position.y = 5.35;
  g.add(top, bottom, deck);
  // Bridge and funnel at the stern.
  const bridge = building(7, 8, 9.4, 'plaster', 0xffffff).group;
  bridge.position.set(-L / 2 + 5, 5.3, 0);
  g.add(bridge);
  g.add(block(2.4, 4, 2.4, std(0xc0392b, 0.6), -L / 2 + 2.5, 0, 13.3));
  // Containers: rows across the deck, two or three high.
  const colors = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x27ae60, 0xe67e22, 0x7f8c8d, 0x8e44ad];
  let n = 0;
  for (let x = -L / 2 + 11; x < L / 2 - 9; x += 6.4) {
    for (let z = -3.6; z <= 3.6; z += 2.45) {
      const stack = 2 + ((n * 7) % 3 === 0 ? 1 : 0);
      for (let s = 0; s < stack; s++) {
        const c = colors[(n * 5 + s * 3) % colors.length]!;
        g.add(block(6.0, 2.5, 2.35, std(c, 0.7, 0.2), x, z, 5.4 + s * 2.55));
      }
      n++;
    }
  }
  return g;
}

/** A ship-to-shore crane: a tall orange gantry with its boom out over the water (+z). */
export function harbourCrane(): THREE.Group {
  const g = new THREE.Group();
  const paint = std(0xe0782a, 0.55, 0.3);
  const legs: Array<[number, number]> = [
    [-6, -5],
    [6, -5],
    [-6, 5],
    [6, 5],
  ];
  for (const [x, z] of legs) g.add(beam(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.85, 26, z), 0.9, paint));
  for (const y of [12, 26]) {
    g.add(beam(new THREE.Vector3(-6, y, -5), new THREE.Vector3(6, y, -5), 0.7, paint), beam(new THREE.Vector3(-6, y, 5), new THREE.Vector3(6, y, 5), 0.7, paint));
    g.add(beam(new THREE.Vector3(-6, y, -5), new THREE.Vector3(-6, y, 5), 0.7, paint), beam(new THREE.Vector3(6, y, -5), new THREE.Vector3(6, y, 5), 0.7, paint));
  }
  // The boom reaching out over the water, the machinery house and the ties.
  g.add(box(2.2, 1.6, 48, paint, 0, 27.5, 14));
  g.add(block(7, 4, 8, std(0xd9d4c8, 0.6), 0, -2, 28.3));
  g.add(beam(new THREE.Vector3(0, 40, -4), new THREE.Vector3(0, 28, 34), 0.4, paint), beam(new THREE.Vector3(0, 40, -4), new THREE.Vector3(0, 28, -10), 0.4, paint));
  g.add(beam(new THREE.Vector3(0, 28, -4), new THREE.Vector3(0, 40, -4), 0.8, paint));
  return g;
}

// ---------------------------------------------------------------- industry

/** A storage tank with a shallow dome, a stair winding up its side and a rail round the top. */
export function tank(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xdfe2e4, 0.55, 0.2);
  g.add(cylinder(r, r, h, white, 36));
  const dome = new THREE.LatheGeometry(
    Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return new THREE.Vector2(r * Math.cos((t * Math.PI) / 2) + 0.001, h + r * 0.18 * Math.sin((t * Math.PI) / 2));
    }),
    36,
  );
  g.add(mesh(dome, std(0xcfd3d6, 0.6, 0.2)));
  // Bands, a stair and a rail.
  for (const y of [h * 0.33, h * 0.66]) g.add(cylinder(r + 0.03, r + 0.03, 0.18, std(0xb8bdc1, 0.6, 0.3), 36, 0, y));
  const rail = std(0x5d646b, 0.5, 0.6);
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 0.9;
    const a1 = ((i + 1) / steps) * Math.PI * 0.9;
    g.add(
      beam(
        new THREE.Vector3(Math.cos(a0) * (r + 0.4), (i / steps) * h, Math.sin(a0) * (r + 0.4)),
        new THREE.Vector3(Math.cos(a1) * (r + 0.4), ((i + 1) / steps) * h, Math.sin(a1) * (r + 0.4)),
        0.18,
        rail,
      ),
    );
  }
  const ring = new THREE.TorusGeometry(r * 0.98, 0.06, 6, 40);
  ring.rotateX(Math.PI / 2);
  g.add(mesh(ring, rail, 0, h + 0.9, 0));
  return g;
}

/** A tall chimney with red and white bands. */
export function chimney(h: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * h;
    const r0 = r * (1.3 - 0.3 * (i / bands));
    const r1 = r * (1.3 - 0.3 * ((i + 1) / bands));
    const top = i >= bands - 3;
    g.add(cylinder(r1, r0, h / bands, std(top ? (i % 2 ? 0xc0392b : 0xf2f0ea) : 0xb4b1aa, 0.8), 20, 0, y0));
  }
  g.add(cylinder(r * 1.05, r * 1.05, 0.5, std(0x2b2d30, 0.9), 20, 0, h));
  return g;
}

/** A lattice pylon with two cross-arms. */
export function pylon(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0x9aa3aa, 0.5, 0.6);
  const H = 24;
  const foot = 2.4;
  const legs: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const at = (sx: number, sz: number, y: number): THREE.Vector3 => {
    const w = foot * (1 - (y / H) * 0.8);
    return new THREE.Vector3(sx * w, y, sz * w);
  };
  for (const [sx, sz] of legs) g.add(beam(at(sx, sz, 0), at(sx, sz, H), 0.18, steel));
  for (let y = 0; y < H; y += 4) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = legs[k]!;
      const [bx, bz] = legs[(k + 1) % 4]!;
      g.add(beam(at(ax, az, y), at(bx, bz, y + 4), 0.08, steel));
      g.add(beam(at(ax, az, y + 4), at(bx, bz, y + 4), 0.1, steel));
    }
  }
  for (const [y, w] of [
    [17, 7],
    [21, 5],
  ] as const) {
    g.add(box(w * 2, 0.3, 0.5, steel, 0, y, 0));
    for (const s of [-1, 1]) g.add(cylinder(0.12, 0.12, 1.4, std(0x7e8f6a, 0.4), 6, s * (w - 0.3), y - 1.6, 0));
  }
  return g;
}

/** A transformer: a tank with cooling fins and three bushings on top. */
export function transformer(): THREE.Group {
  const g = new THREE.Group();
  const grey = std(0x5f6b76, 0.6, 0.4);
  g.add(block(3, 2.8, 2.2, grey));
  for (let i = 0; i < 6; i++) g.add(block(0.12, 2.2, 0.6, grey, -1.2 + i * 0.48, 1.4, 0.2));
  for (const x of [-0.8, 0, 0.8]) g.add(cylinder(0.12, 0.18, 1.3, std(0x8a6a4a, 0.4), 8, x, 2.8, 0));
  return g;
}

/** A cooling tower: a thin concrete shell, narrowest at three quarters of its height. */
export function coolingTower(h = 30, r = 9): THREE.Mesh {
  const profile = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return new THREE.Vector2(r * (0.56 + 0.5 * ((t - 0.75) / 0.75) ** 2), t * h);
  });
  return mesh(new THREE.LatheGeometry(profile, 40), new THREE.MeshStandardMaterial({ color: 0xcfd1cf, roughness: 0.9, side: THREE.DoubleSide }));
}

/** A small airliner for the airfield, using the aircraft of the launch view scaled down. */
export function airliner(model: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  model.scale.setScalar(0.48);
  model.position.y = 2.2;
  g.add(model);
  // Landing gear.
  const gear = std(0x2a2d31, 0.6, 0.4);
  for (const [x, z] of [
    [6, 0],
    [-1, 1.4],
    [-1, -1.4],
  ] as const) g.add(cylinder(0.12, 0.12, 1.4, gear, 6, x, 0.4, z), mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 12).rotateX(Math.PI / 2), gear, x, 0.4, z));
  return g;
}

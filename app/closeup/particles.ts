// Fire, smoke, steam and dust for the close view, as point sprites drawn in two batches
// (glowing and shading). Every particle is worked out from the time alone, with no state
// kept between frames: a particle's age is the fractional part of the time times its
// rate, plus its own offset. So the picture is the same at the same moment, and nothing
// builds up while the view is closed.

import * as THREE from 'three';

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, n: number) => void, n = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  draw(canvas.getContext('2d')!, n);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round glow. */
export const glowTexture = (): THREE.CanvasTexture =>
  canvasTexture((ctx, n) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  });

/** A lumpy puff, lighter on top. */
export const puffTexture = (): THREE.CanvasTexture =>
  canvasTexture((ctx, n) => {
    let seed = 5;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 10; i++) {
      const r = n * (0.15 + random() * 0.15);
      const x = n / 2 + (random() - 0.5) * n * 0.38;
      const y = n / 2 + (random() - 0.5) * n * 0.38;
      const shade = Math.round(215 + 40 * (1 - y / n));
      const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, `rgba(${shade},${shade},${shade},0.9)`);
      g.addColorStop(0.7, `rgba(${shade - 35},${shade - 35},${shade - 35},0.5)`);
      g.addColorStop(1, 'rgba(150,150,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 128);

const VERTEX = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  uniform float scale;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint.rgb * t.rgb, vTint.a * t.a);
    #include <colorspace_fragment>
  }
`;

/** A batch of point sprites whose positions, sizes and colours are written every frame. */
export class SpriteBatch {
  readonly points: THREE.Points;
  private readonly position: Float32Array;
  private readonly size: Float32Array;
  private readonly tint: Float32Array;
  private count = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, texture: THREE.Texture, additive: boolean) {
    const geometry = new THREE.BufferGeometry();
    this.position = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.tint = new Float32Array(capacity * 4);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 500 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    // Glowing sprites are drawn after the smoke, so flames shine through it.
    this.points.renderOrder = additive ? 3 : 2;
  }

  /** Pixels per metre at one metre away: the canvas height over the height the view spans there. */
  setScale(pixelsPerUnit: number): void {
    this.material.uniforms.scale!.value = pixelsPerUnit;
  }

  begin(): void {
    this.count = 0;
  }

  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.count * 3 >= this.position.length || a <= 0.003 || size <= 0) return;
    const i = this.count++;
    this.position.set([x, y, z], i * 3);
    this.size[i] = size;
    this.tint.set([r, g, b, a], i * 4);
  }

  end(): void {
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'size', 'tint']) (geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Where something burns: a spot, how big the fire is, and a number of its own. */
export interface FireSpot {
  x: number;
  y: number;
  z: number;
  size: number;
  seed: number;
}

/** Where steam or smoke rises steadily, whatever happens. */
export interface Plume {
  x: number;
  y: number;
  z: number;
  size: number;
  seed: number;
  color: [number, number, number];
}

const fract = (x: number): number => x - Math.floor(x);
/** A repeatable random number from 0 to 1 for a pair of whole numbers. */
const hash = (a: number, b: number): number => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

/**
 * Writes the flames and smoke of every fire spot. `level` is how far the fires have grown
 * (0 to 1); `wind` is the drift of the smoke along x, metres per metre of rise.
 */
export function drawFires(glow: SpriteBatch, smoke: SpriteBatch, spots: readonly FireSpot[], level: number, time: number, wind = 0.35): void {
  if (level <= 0.01) return;
  for (let e = 0; e < spots.length; e++) {
    const s = spots[e]!;
    const size = s.size * (0.35 + 0.65 * level);
    // Flames: rising, narrowing, from white-yellow through orange to a dull red.
    const flames = 12;
    for (let i = 0; i < flames; i++) {
      const age = fract(time * (1.3 + 0.4 * hash(e, i)) + i / flames + s.seed);
      const spread = (hash(i, e + 3) - 0.5) * size * 0.9;
      const sway = Math.sin(time * 6 + i * 1.7 + s.seed * 10) * size * 0.12 * age;
      const x = s.x + spread * (1 - age * 0.6) + sway;
      const z = s.z + (hash(e + 7, i) - 0.5) * size * 0.9 * (1 - age * 0.6);
      const y = s.y + age * size * 1.9;
      // Additive sprites pile up towards white: keep them orange and faint, a yellow core low down.
      const r = 1;
      const g = 0.62 - 0.45 * age;
      const b = 0.2 - 0.18 * age;
      const a = Math.sin(Math.PI * Math.min(1, age * 1.15)) * 0.42;
      glow.push(x, y, z, size * (1.25 - 0.8 * age), r, g, b, a);
    }
    // A low bright glow at the base.
    glow.push(s.x, s.y + size * 0.3, s.z, size * 2.4, 1, 0.45, 0.12, 0.18 * level);
    glow.push(s.x, s.y + size * 0.35, s.z, size * 0.8, 1, 0.85, 0.5, 0.35 * level);
    // Smoke: dark, growing, drifting with the wind, thinning out as it climbs.
    const puffs = 10;
    for (let i = 0; i < puffs; i++) {
      const age = fract(time * (0.12 + 0.05 * hash(i, e + 11)) + i / puffs + s.seed * 0.37);
      const rise = size * 1.6 + age * size * 14;
      const x = s.x + rise * wind + (hash(e, i + 21) - 0.5) * size * (1 + age * 3);
      const z = s.z + (hash(e + 13, i) - 0.5) * size * (1 + age * 3);
      const grey = 0.16 + 0.12 * age;
      const a = Math.min(1, age * 6) * (1 - age) * 0.8 * level;
      smoke.push(x, s.y + rise, z, size * (1.6 + age * 6), grey, grey * 0.95, grey * 0.9, a);
    }
  }
}

/** Steam or smoke that rises steadily from a stack or a cooling tower. */
export function drawPlumes(smoke: SpriteBatch, plumes: readonly Plume[], time: number, wind = 0.25): void {
  for (let e = 0; e < plumes.length; e++) {
    const p = plumes[e]!;
    const puffs = 14;
    for (let i = 0; i < puffs; i++) {
      const age = fract(time * 0.07 + i / puffs + p.seed);
      const rise = age * p.size * 12;
      const x = p.x + rise * wind + (hash(e + 31, i) - 0.5) * p.size * (0.4 + age * 2);
      const z = p.z + (hash(i, e + 37) - 0.5) * p.size * (0.4 + age * 2);
      const a = Math.min(1, age * 5) * (1 - age) * 0.75;
      smoke.push(x, p.y + rise, z, p.size * (1.1 + age * 4), p.color[0], p.color[1], p.color[2], a);
    }
  }
}

/**
 * The dust the blast wave raises: a wall of brown dust sweeping across the scene from the
 * side of the burst (-x), thinning behind the front. `blast` runs from 0 (not arrived) to 1.
 */
export function drawDust(smoke: SpriteBatch, blast: number, strength: number, extent: number): void {
  if (blast <= 0 || blast >= 1 || strength <= 0.02) return;
  const front = -extent + blast * extent * 3.2;
  const fade = (1 - blast) * Math.min(1, strength);
  const n = 70;
  for (let i = 0; i < n; i++) {
    const behind = hash(i, 91) * extent * 0.9;
    const x = front - behind;
    if (x < -extent * 1.3 || x > extent * 1.3) continue;
    const z = (hash(i, 17) - 0.5) * extent * 2.2;
    const y = hash(93, i) * 6 + behind * 0.12;
    const a = (1 - behind / (extent * 0.9)) * 0.55 * fade;
    smoke.push(x, y, z, 9 + behind * 0.35, 0.62, 0.55, 0.46, a);
  }
}

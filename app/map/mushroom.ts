// The mushroom cloud in 3D over the city map, during playback. Its size at each moment comes
// from the physics (`physics/timeline/cloudShape.ts`); here it is only drawn: an outline turned
// around the vertical axis (stem, then the head), roughened with noise so it reads as cloud.
//
// Drawn as a MapLibre custom layer with MapLibre's own projection code in the shader, so it
// stands on the globe and on the flat map alike, and is hidden behind nearer buildings.

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl';
import type { CloudShape } from '@physics/timeline/cloudShape';
import type { LngLat } from '../lib/geo';

export const MUSHROOM_LAYER = 'aa-mushroom';

const EXTENT = 8192;
const EARTH_RADIUS = 6371008.8;

/** One point of the outline: radius and height in metres, the outward normal, and stem (0) or head (1). */
export interface ProfilePoint {
  r: number;
  z: number;
  nr: number;
  nz: number;
  part: 0 | 1;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * The outline of the cloud from the foot of the stem up to the top of the head, on the axis.
 * The head is a rounded lens (a ball while it is still the fireball, flatter as it spreads)
 * whose underside rises towards the stem, like the rolled rim of the toroid (Glasstone §2.07).
 */
export function mushroomProfile(shape: CloudShape, headSteps = 48, stemSteps = 14): ProfilePoint[] {
  const a = shape.headRadiusM;
  const thickness = shape.topM - shape.headBottomM;
  if (!(a > 1) || !(thickness > 1)) return [];
  const lower = thickness * shape.headLowerShare;
  const upper = thickness - lower;
  const middle = shape.headBottomM + lower;
  const flat = clamp01((0.5 - shape.headLowerShare) / 0.14);
  // Exponent of the rounded lens: 1 is an ellipse; smaller is boxier.
  const e = 2 / (2 + 0.7 * flat);
  const head = (phi: number): [number, number] => {
    const c = Math.abs(Math.cos(phi));
    const s = Math.sin(phi);
    const r = a * Math.pow(c, e);
    if (s >= 0) return [r, middle + upper * Math.pow(s, e)];
    const lift = lower * 0.55 * flat * (1 - r / a) ** 2;
    return [r, middle - lower * Math.pow(-s, e) + lift];
  };

  const points: Array<[number, number, 0 | 1]> = [];
  // The stem widens a little where it runs into the head, and spreads at its foot.
  const stemTop = Math.min(shape.stemRadiusM * 1.15, a * 0.9);
  let phi0 = -Math.PI / 2;
  if (stemTop > 0.5) {
    phi0 = -Math.acos(Math.pow(stemTop / a, 1 / e));
    const join = head(phi0)[1];
    if (join > 1) {
      for (let k = 0; k < stemSteps; k++) {
        const z = (join * k) / stemSteps;
        // Narrower low down, as wide as §2.17 says where it meets the head; a skirt of dust at the foot.
        const taper = 0.55 + 0.45 * smooth(0.1, 1, z / join);
        const foot = 1 + 0.4 * Math.exp(-z / (0.05 * join + 1));
        const neck = 1 + 0.15 * smooth(0.8, 1, z / join);
        points.push([shape.stemRadiusM * taper * foot * neck, z, 0]);
      }
    } else {
      phi0 = -Math.PI / 2;
    }
  }
  for (let k = 0; k <= headSteps; k++) {
    const [r, z] = head(phi0 + ((Math.PI / 2 - phi0) * k) / headSteps);
    points.push([r, z, 1]);
  }

  // Nothing below the ground: a fireball that still touches it is cut flat there.
  const clamped = points.map(([r, z, part]) => [r, Math.max(0, z), part] as [number, number, 0 | 1]);
  return clamped.map(([r, z, part], i) => {
    const before = clamped[Math.max(0, i - 1)]!;
    const after = clamped[Math.min(clamped.length - 1, i + 1)]!;
    const dr = after[0] - before[0];
    const dz = after[1] - before[1];
    const length = Math.hypot(dr, dz) || 1;
    // Outward normal of an outline walked from the bottom up: (dz, -dr).
    return { r, z, nr: dz / length, nz: -dr / length, part };
  });
}

export interface LatheMesh {
  /** East, north, up in metres from ground zero, three per vertex. */
  local: Float32Array;
  normal: Float32Array;
  part: Float32Array;
  index: Uint16Array;
  vertices: number;
}

/** Turns the outline around the vertical axis. */
export function latheMesh(profile: ProfilePoint[], segments: number): LatheMesh {
  const n = profile.length;
  const vertices = n * (segments + 1);
  const local = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const part = new Float32Array(vertices);
  for (let j = 0; j <= segments; j++) {
    const angle = (2 * Math.PI * j) / segments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let i = 0; i < n; i++) {
      const p = profile[i]!;
      const v = j * n + i;
      local[v * 3] = p.r * c;
      local[v * 3 + 1] = p.r * s;
      local[v * 3 + 2] = p.z;
      normal[v * 3] = p.nr * c;
      normal[v * 3 + 1] = p.nr * s;
      normal[v * 3 + 2] = p.nz;
      part[v] = p.part;
    }
  }
  const index = new Uint16Array(Math.max(0, segments * (n - 1) * 6));
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = (j + 1) * n + i;
      index[k++] = a;
      index[k++] = b;
      index[k++] = a + 1;
      index[k++] = a + 1;
      index[k++] = b;
      index[k++] = b + 1;
    }
  }
  return { local, normal, part, index, vertices };
}

const NOISE = `
float aaHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float aaNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(aaHash(i), aaHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(aaHash(i + vec3(0.0, 1.0, 0.0)), aaHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(aaHash(i + vec3(0.0, 0.0, 1.0)), aaHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(aaHash(i + vec3(0.0, 1.0, 1.0)), aaHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float aaFbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * aaNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return sum;
}
`;

const vertexSource = (prelude: string, define: string): string => `#version 300 es
precision highp float;
${prelude}
${define}
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec3 a_local;
layout(location = 2) in vec3 a_normal;
layout(location = 3) in float a_part;
uniform float u_ground;
uniform float u_units_per_m;
uniform float u_noise_scale;
uniform float u_bump_head;
uniform float u_bump_stem;
uniform float u_time;
out vec3 v_normal;
out vec3 v_local;
out float v_part;
out float v_billow;
${NOISE}
void main() {
  // Billows that roll slowly upwards, the circulation of the toroid.
  float billow = aaFbm(a_local * u_noise_scale + vec3(0.0, 0.0, -u_time)) - 0.47;
  float amplitude = mix(u_bump_stem, u_bump_head, a_part);
  vec3 d = a_normal * billow * 2.0 * amplitude;
  float height = max(a_local.z + d.z, 0.0);
  vec2 pos = a_pos + vec2(d.x, -d.y) * u_units_per_m;
  gl_Position = projectTileFor3D(pos, u_ground + height);
  v_normal = a_normal;
  v_local = a_local;
  v_part = a_part;
  v_billow = billow;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_local;
in float v_part;
in float v_billow;
uniform vec3 u_light;
uniform vec3 u_white;
uniform float u_glow;
uniform float u_brown;
uniform float u_alpha;
uniform float u_ambient;
uniform float u_noise_scale;
uniform float u_time;
out vec4 fragColor;
${NOISE}
void main() {
  vec3 n = normalize(v_normal);
  float sun = max(dot(n, u_light), 0.0);
  float texture = aaFbm(v_local * u_noise_scale * 3.0 + vec3(0.0, 0.0, -u_time * 1.5));
  float under = clamp(-n.z, 0.0, 1.0);
  // Red-brown at first, white as it cools (Glasstone §2.08); the stem is dust drawn up from the ground.
  vec3 base = mix(u_white, vec3(0.50, 0.28, 0.17), u_brown);
  base = mix(vec3(0.60, 0.54, 0.47), base, 0.3 + 0.7 * v_part);
  float light = (u_ambient + (1.0 - u_ambient) * sun) * (1.0 - 0.38 * under) * (0.8 + 0.4 * texture) * (0.92 + 0.5 * v_billow);
  vec3 colour = base * light;
  // While the fireball still gives light: white-hot, then orange.
  vec3 hot = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.93, 0.72), u_glow * u_glow * u_glow);
  float glow = u_glow * mix(0.3, 1.0, v_part);
  colour = mix(colour, hot * (0.8 + 0.45 * texture) * (1.0 + 0.25 * glow), glow);
  float alpha = mix(u_alpha, 1.0, glow);
  fragColor = vec4(colour * alpha, alpha);
}`;


const UNIFORMS = [
  'u_projection_matrix',
  'u_projection_tile_mercator_coords',
  'u_projection_clipping_plane',
  'u_projection_transition',
  'u_projection_fallback_matrix',
  'u_ground',
  'u_units_per_m',
  'u_noise_scale',
  'u_bump_head',
  'u_bump_stem',
  'u_time',
  'u_light',
  'u_white',
  'u_glow',
  'u_brown',
  'u_alpha',
  'u_ambient',
] as const;

interface Program {
  program: WebGLProgram;
  uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, prelude: string, define: string): Program {
  const shader = (type: number, source: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`mushroom shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource(prelude, define)));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`mushroom program: ${gl.getProgramInfoLog(program)}`);
  const uniforms = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Program['uniforms'];
  return { program, uniforms };
}

export interface MushroomView {
  at: LngLat;
  shape: CloudShape;
  /** Seconds since the burst: moves the billows. */
  timeS: number;
  /** Radius of the stabilised cloud: fixes the size of the billows for the whole playback. */
  finalRadiusM: number;
  theme: 'light' | 'dark';
}

export interface MushroomLayer extends CustomLayerInterface {
  /** Shows the cloud as it is at a moment, or hides it. */
  show(view: MushroomView | null): void;
}

/** Light from high in the south-east, in east-north-up. */
const LIGHT = (() => {
  const v = [0.45, -0.35, 0.82];
  const length = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((x) => x / length) as [number, number, number];
})();

export function createMushroomLayer(segments: number): MushroomLayer {
  let map: MapLibreMap | null = null;
  let view: MushroomView | null = null;
  let dirty = true;
  let count = 0;
  let tile = { x: 0, y: 0, z: 0, unitsPerM: 1 };
  let buffers: { vao: WebGLVertexArrayObject; pos: WebGLBuffer; local: WebGLBuffer; normal: WebGLBuffer; part: WebGLBuffer; index: WebGLBuffer } | null = null;
  const programs = new Map<string, Program>();

  /** A tile around ground zero, small enough for exact positions and large enough to hold the cloud. */
  const placeTile = (current: MushroomView): void => {
    const lat = (current.at.lat * Math.PI) / 180;
    const metresAcross = 2 * Math.PI * EARTH_RADIUS * Math.cos(lat);
    const reach = Math.max(current.finalRadiusM * 1.6, 200);
    const z = Math.max(0, Math.min(15, Math.floor(Math.log2((3 * metresAcross) / reach))));
    const scale = 2 ** z;
    const mx = (current.at.lng + 180) / 360;
    const my = (1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2;
    tile = { x: Math.floor(mx * scale), y: Math.floor(my * scale), z, unitsPerM: (EXTENT * scale) / metresAcross };
  };

  const upload = (gl: WebGL2RenderingContext, current: MushroomView): void => {
    if (!buffers) return;
    const mesh = latheMesh(mushroomProfile(current.shape), segments);
    count = mesh.index.length;
    placeTile(current);
    const scale = 2 ** tile.z;
    const lat = (current.at.lat * Math.PI) / 180;
    const ox = ((current.at.lng + 180) / 360) * scale - tile.x;
    const oy = ((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2) * scale - tile.y;
    const pos = new Float32Array(mesh.vertices * 2);
    for (let v = 0; v < mesh.vertices; v++) {
      pos[v * 2] = ox * EXTENT + mesh.local[v * 3]! * tile.unitsPerM;
      pos[v * 2 + 1] = oy * EXTENT - mesh.local[v * 3 + 1]! * tile.unitsPerM;
    }
    const fill = (buffer: WebGLBuffer, data: Float32Array): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    };
    gl.bindVertexArray(buffers.vao);
    fill(buffers.pos, pos);
    fill(buffers.local, mesh.local);
    fill(buffers.normal, mesh.normal);
    fill(buffers.part, mesh.part);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  };

  return {
    id: MUSHROOM_LAYER,
    type: 'custom',
    renderingMode: '3d',

    show(next) {
      view = next;
      dirty = true;
      map?.triggerRepaint();
    },

    onAdd(added, gl) {
      map = added;
      const gl2 = gl as WebGL2RenderingContext;
      const vao = gl2.createVertexArray()!;
      const make = (): WebGLBuffer => gl2.createBuffer()!;
      buffers = { vao, pos: make(), local: make(), normal: make(), part: make(), index: make() };
      gl2.bindVertexArray(vao);
      const attribute = (location: number, buffer: WebGLBuffer, size: number): void => {
        gl2.bindBuffer(gl2.ARRAY_BUFFER, buffer);
        gl2.enableVertexAttribArray(location);
        gl2.vertexAttribPointer(location, size, gl2.FLOAT, false, 0, 0);
      };
      attribute(0, buffers.pos, 2);
      attribute(1, buffers.local, 3);
      attribute(2, buffers.normal, 3);
      attribute(3, buffers.part, 1);
      gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, buffers.index);
      gl2.bindVertexArray(null);
      dirty = true;
    },

    onRemove(_removed, gl) {
      const gl2 = gl as WebGL2RenderingContext;
      if (buffers) {
        gl2.deleteVertexArray(buffers.vao);
        for (const b of [buffers.pos, buffers.local, buffers.normal, buffers.part, buffers.index]) gl2.deleteBuffer(b);
      }
      for (const p of programs.values()) gl2.deleteProgram(p.program);
      programs.clear();
      buffers = null;
      map = null;
    },

    render(gl, args: CustomRenderMethodInput) {
      const current = view;
      if (!current || !buffers || !map) return;
      const gl2 = gl as WebGL2RenderingContext;
      if (dirty) {
        upload(gl2, current);
        dirty = false;
      }
      if (count === 0) return;
      let program = programs.get(args.shaderData.variantName);
      if (!program) {
        program = compile(gl2, args.shaderData.vertexShaderPrelude, args.shaderData.define);
        programs.set(args.shaderData.variantName, program);
      }
      const data = args.getProjectionData({ tileID: { wrap: 0, canonical: { x: tile.x, y: tile.y, z: tile.z } }, applyGlobeMatrix: true });
      const u = program.uniforms;
      gl2.useProgram(program.program);
      gl2.uniformMatrix4fv(u.u_projection_matrix!, false, Float32Array.from(data.mainMatrix as ArrayLike<number>));
      if (u.u_projection_fallback_matrix) gl2.uniformMatrix4fv(u.u_projection_fallback_matrix, false, Float32Array.from(data.fallbackMatrix as ArrayLike<number>));
      if (u.u_projection_tile_mercator_coords) gl2.uniform4fv(u.u_projection_tile_mercator_coords, data.tileMercatorCoords);
      if (u.u_projection_clipping_plane) gl2.uniform4fv(u.u_projection_clipping_plane, data.clippingPlane);
      if (u.u_projection_transition) gl2.uniform1f(u.u_projection_transition, data.projectionTransition);

      const shape = current.shape;
      const terrain = map.getTerrain() ? (map.queryTerrainElevation([current.at.lng, current.at.lat]) ?? 0) : 0;
      gl2.uniform1f(u.u_ground, terrain);
      gl2.uniform1f(u.u_units_per_m, tile.unitsPerM);
      gl2.uniform1f(u.u_noise_scale, 1 / Math.max(0.3 * current.finalRadiusM, 40));
      gl2.uniform1f(u.u_bump_head, 0.11 * shape.headRadiusM * (1 - 0.8 * shape.glow));
      gl2.uniform1f(u.u_bump_stem, 0.15 * shape.stemRadiusM);
      gl2.uniform1f(u.u_time, current.timeS * 0.004);
      gl2.uniform3fv(u.u_light, LIGHT);
      gl2.uniform3fv(u.u_white, current.theme === 'dark' ? [0.84, 0.83, 0.81] : [0.95, 0.94, 0.92]);
      // On the light map the shadowed side is lighter, as the sky lights it more.
      gl2.uniform1f(u.u_ambient, current.theme === 'dark' ? 0.42 : 0.56);
      gl2.uniform1f(u.u_glow, shape.glow);
      gl2.uniform1f(u.u_brown, shape.brown);
      // Seen from straight above the cloud lets the rings under it show through.
      gl2.uniform1f(u.u_alpha, 0.5 + 0.43 * smooth(15, 50, map.getPitch()));

      gl2.bindVertexArray(buffers.vao);
      gl2.enable(gl2.DEPTH_TEST);
      gl2.depthFunc(gl2.LEQUAL);
      gl2.disable(gl2.CULL_FACE);
      // First only the nearest surface into the depth buffer, then its colour once: a see-through
      // cloud shows no inner faces whatever the order of the triangles.
      gl2.colorMask(false, false, false, false);
      gl2.depthMask(true);
      gl2.drawElements(gl2.TRIANGLES, count, gl2.UNSIGNED_SHORT, 0);
      gl2.colorMask(true, true, true, true);
      gl2.enable(gl2.BLEND);
      gl2.blendFunc(gl2.ONE, gl2.ONE_MINUS_SRC_ALPHA);
      gl2.drawElements(gl2.TRIANGLES, count, gl2.UNSIGNED_SHORT, 0);
      gl2.bindVertexArray(null);
    },
  };
}

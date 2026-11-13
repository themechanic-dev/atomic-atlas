// Writes a Three.js group as a binary glTF 2.0 file (GLB), so the globe (CesiumJS) can draw
// the same models the close view draws. The models are built with x forward, y up and z to
// the right; glTF looks forward along +z, so they are turned a quarter round the vertical
// on the way out: (x, y, z) becomes (-z, y, x). CesiumJS then turns glTF's +z forward back
// into its own +x. Only what the models here use is written: meshes
// with positions, normals and indices, and metallic-roughness materials with a colour and
// an optional glow. Every mesh is placed with its transform baked in, and meshes that share
// a material are joined into one primitive, so a model is a handful of draw calls.

import * as THREE from 'three';

interface Batch {
  material: THREE.MeshStandardMaterial;
  positions: number[];
  normals: number[];
  indices: number[];
}

function materialKey(m: THREE.MeshStandardMaterial): string {
  return [m.color.getHexString(), m.metalness.toFixed(2), m.roughness.toFixed(2), m.emissive.getHexString(), m.emissiveIntensity.toFixed(2), m.side].join('|');
}

/** Collects the meshes of a group into one batch per material, in the group's own frame. */
function collect(root: THREE.Object3D): Batch[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<string, Batch>();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const key = materialKey(material);
    let batch = batches.get(key);
    if (!batch) {
      batch = { material, positions: [], normals: [], indices: [] };
      batches.set(key, batch);
    }
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const geometry = mesh.geometry.attributes.normal ? mesh.geometry : mesh.geometry.clone();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    const base = batch.positions.length / 3;
    // A mirrored transform turns the triangles inside out; their order is then reversed.
    const flip = matrix.determinant() < 0;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      normal.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      batch.positions.push(-point.z, point.y, point.x);
      batch.normals.push(-normal.z, normal.y, normal.x);
    }
    const index = geometry.getIndex();
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      if (flip) batch.indices.push(base + a, base + c, base + b);
      else batch.indices.push(base + a, base + b, base + c);
    }
  });
  return [...batches.values()].filter((b) => b.indices.length > 0);
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** The group as a GLB file. */
export function toGlb(root: THREE.Object3D): ArrayBuffer {
  const batches = collect(root);
  const chunks: ArrayBuffer[] = [];
  let byteLength = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const addView = (data: ArrayBuffer, target: number): number => {
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength, target });
    chunks.push(data);
    const padded = pad4(data.byteLength);
    if (padded > data.byteLength) chunks.push(new ArrayBuffer(padded - data.byteLength));
    byteLength += padded;
    return bufferViews.length - 1;
  };
  const materials: object[] = [];
  const primitives: object[] = [];
  for (const batch of batches) {
    const positions = new Float32Array(batch.positions);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, positions[i + k]!);
        max[k] = Math.max(max[k]!, positions[i + k]!);
      }
    }
    const big = positions.length / 3 > 65535;
    const indices = big ? new Uint32Array(batch.indices) : new Uint16Array(batch.indices);
    accessors.push({ bufferView: addView(positions.buffer, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max });
    const positionAccessor = accessors.length - 1;
    accessors.push({ bufferView: addView(new Float32Array(batch.normals).buffer, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3' });
    const normalAccessor = accessors.length - 1;
    accessors.push({ bufferView: addView(indices.buffer as ArrayBuffer, 34963), componentType: big ? 5125 : 5123, count: indices.length, type: 'SCALAR' });
    const indexAccessor = accessors.length - 1;
    const m = batch.material;
    const glow = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
    materials.push({
      pbrMetallicRoughness: {
        // Three keeps colours linear, as glTF wants them.
        baseColorFactor: [...m.color.toArray(), m.opacity],
        metallicFactor: m.metalness,
        roughnessFactor: m.roughness,
      },
      ...(glow.r + glow.g + glow.b > 0 ? { emissiveFactor: glow.toArray().map((c) => Math.min(1, c)) } : {}),
      ...(m.side === THREE.DoubleSide ? { doubleSided: true } : {}),
      ...(m.transparent ? { alphaMode: 'BLEND' } : {}),
    });
    primitives.push({ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: materials.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: 'Atomic Atlas' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLength + 8 + byteLength;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  let at = 20 + jsonLength;
  view.setUint32(at, byteLength, true);
  view.setUint32(at + 4, 0x004e4942, true); // "BIN"
  at += 8;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk), at);
    at += chunk.byteLength;
  }
  return out;
}

const urls = new Map<string, string>();

/** A blob address for a model, built once per name. */
export function modelUrl(name: string, build: () => THREE.Object3D): string {
  let url = urls.get(name);
  if (!url) {
    url = URL.createObjectURL(new Blob([toGlb(build())], { type: 'model/gltf-binary' }));
    urls.set(name, url);
  }
  return url;
}

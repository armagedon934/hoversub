// Minimal glTF 2.0 binary (.glb) writer for the preview objects with an embedded PBR material.
// Works on byte parts so that 4K/8K PNG textures can be embedded without concatenating them.
//
// Conventions: glTF texture coordinates have their origin at the top-left of the image, so the
// writer receives UVs already converted (v_gltf = 1 - v_three). Normal textures use the OpenGL
// (+Y) convention required by glTF. The ORM texture serves both occlusionTexture (R) and
// metallicRoughnessTexture (G = roughness, B = metallic), exactly as glTF defines those channels.

export interface GlbMesh {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  /** glTF orientation: v = 0 at the top of the texture image. */
  uvs: Float32Array;
  indices: Uint32Array;
  translation?: [number, number, number];
  /** Quaternion x, y, z, w. */
  rotation?: [number, number, number, number];
}

export interface GlbImage {
  parts: Uint8Array[];
  length: number;
}

export interface GlbMaterial {
  name: string;
  baseColor: GlbImage;
  normal: GlbImage;
  orm: GlbImage;
  emissive?: GlbImage | null;
  emissiveStrength?: number;
}

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;

function pad4(n: number): number {
  return (4 - (n % 4)) % 4;
}

export function buildGlb(meshes: GlbMesh[], mat: GlbMaterial, generator = 'Material Foundry'): { parts: Uint8Array[]; length: number } {
  const bin: Uint8Array[] = [];
  let binLen = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const addView = (parts: Uint8Array[], length: number, target?: number): number => {
    const view: Record<string, unknown> = { buffer: 0, byteOffset: binLen, byteLength: length };
    if (target) view.target = target;
    bin.push(...parts);
    binLen += length;
    const p = pad4(length);
    if (p) {
      bin.push(new Uint8Array(p));
      binLen += p;
    }
    bufferViews.push(view);
    return bufferViews.length - 1;
  };
  const bytes = (a: Float32Array | Uint32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  const gltfMeshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  meshes.forEach((m, k) => {
    const count = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < 3; c++) {
        const v = m.positions[i * 3 + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const pos = accessors.push({ bufferView: addView([bytes(m.positions)], m.positions.byteLength, ARRAY_BUFFER), componentType: FLOAT, count, type: 'VEC3', min, max }) - 1;
    const nrm = accessors.push({ bufferView: addView([bytes(m.normals)], m.normals.byteLength, ARRAY_BUFFER), componentType: FLOAT, count, type: 'VEC3' }) - 1;
    const uv = accessors.push({ bufferView: addView([bytes(m.uvs)], m.uvs.byteLength, ARRAY_BUFFER), componentType: FLOAT, count, type: 'VEC2' }) - 1;
    const idx = accessors.push({ bufferView: addView([bytes(m.indices)], m.indices.byteLength, ELEMENT_ARRAY_BUFFER), componentType: UNSIGNED_INT, count: m.indices.length, type: 'SCALAR' }) - 1;
    gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pos, NORMAL: nrm, TEXCOORD_0: uv }, indices: idx, material: 0, mode: 4 }] });
    const node: Record<string, unknown> = { name: m.name, mesh: k };
    if (m.translation) node.translation = m.translation;
    if (m.rotation) node.rotation = m.rotation;
    nodes.push(node);
  });

  const images: Record<string, unknown>[] = [];
  const textures: Record<string, unknown>[] = [];
  const addTexture = (img: GlbImage, name: string): number => {
    images.push({ name, mimeType: 'image/png', bufferView: addView(img.parts, img.length) });
    textures.push({ sampler: 0, source: images.length - 1 });
    return textures.length - 1;
  };
  const baseTex = addTexture(mat.baseColor, 'basecolor');
  const normalTex = addTexture(mat.normal, 'normal');
  const ormTex = addTexture(mat.orm, 'orm');
  const material: Record<string, unknown> = {
    name: mat.name,
    pbrMetallicRoughness: { baseColorTexture: { index: baseTex }, metallicRoughnessTexture: { index: ormTex }, metallicFactor: 1, roughnessFactor: 1 },
    normalTexture: { index: normalTex },
    occlusionTexture: { index: ormTex },
  };
  const extensionsUsed: string[] = [];
  if (mat.emissive) {
    material.emissiveTexture = { index: addTexture(mat.emissive, 'emissive') };
    material.emissiveFactor = [1, 1, 1];
    const strength = mat.emissiveStrength ?? 1;
    if (strength !== 1) {
      material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: strength } };
      extensionsUsed.push('KHR_materials_emissive_strength');
    }
  }

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials: [material],
    textures,
    images,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLen }],
  };
  if (extensionsUsed.length) json.extensionsUsed = extensionsUsed;

  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jp = pad4(jsonBytes.length);
  if (jp) {
    const padded = new Uint8Array(jsonBytes.length + jp).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const total = 12 + 8 + jsonBytes.length + 8 + binLen;
  if (total > 0xffffffff) throw new Error('GLB exceeds 4 GB');
  const header = new Uint8Array(12);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, 0x46546c67, true); // 'glTF'
  hv.setUint32(4, 2, true);
  hv.setUint32(8, total, true);
  const jh = new Uint8Array(8);
  new DataView(jh.buffer).setUint32(0, jsonBytes.length, true);
  new DataView(jh.buffer).setUint32(4, 0x4e4f534a, true); // 'JSON'
  const bh = new Uint8Array(8);
  new DataView(bh.buffer).setUint32(0, binLen, true);
  new DataView(bh.buffer).setUint32(4, 0x004e4942, true); // 'BIN\0'
  return { parts: [header, jh, jsonBytes, bh, ...bin], length: total };
}

/** Parse the JSON chunk of a GLB (used by tests and verification). */
export function readGlbJson(glb: Uint8Array): { json: Record<string, unknown>; binOffset: number; binLength: number } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  const total = dv.getUint32(8, true);
  if (total !== glb.length) throw new Error(`GLB length mismatch (${total} vs ${glb.length})`);
  const jl = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('First chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jl)));
  const bo = 20 + jl;
  const bl = dv.getUint32(bo, true);
  if (dv.getUint32(bo + 4, true) !== 0x004e4942) throw new Error('Second chunk is not BIN');
  return { json, binOffset: bo + 8, binLength: bl };
}

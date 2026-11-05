// Strip generation for very large (4K/8K) textures. A strip is a band of rows that is generated,
// turned into normals and quantized independently, so the full-resolution float fields never need
// to exist at once. Normals use the wrapped rows directly above and below the strip, which makes
// them bit-identical to the whole-image path.

import { generateFieldBand, resolveSettings } from './generate';
import { computeNormalsStrip, packMaps } from './maps';
import { num, type MaterialSettings } from './types';

export interface StripData {
  y0: number;
  rows: number;
  size: number;
  /** RGB 8-bit sRGB base color. */
  base: Uint8Array;
  /** RGB 8-bit normal, OpenGL convention. */
  normal8: Uint8Array;
  /** RGB 16-bit normal, OpenGL convention (only when requested). */
  normal16: Uint16Array | null;
  rough: Uint8Array;
  metal: Uint8Array;
  height16: Uint16Array;
  /** RGB 8-bit emissive, or null when the material does not emit. */
  emissive: Uint8Array | null;
  /** Physical relief depth of the material (fraction of tile width, before relief strength). */
  depth: number;
}

function rgb(rgba: Uint8ClampedArray): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = rgba[i * 4];
    out[i * 3 + 1] = rgba[i * 4 + 1];
    out[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return out;
}

export function generateStrip(
  settings: MaterialSettings,
  size: number,
  y0: number,
  y1: number,
  withNormal16: boolean,
  onProgress?: (f: number) => void,
  isCancelled?: () => boolean,
): StripData {
  const s = resolveSettings(settings);
  const rows = y1 - y0;
  const fields = generateFieldBand(s, size, y0, y1, onProgress, isCancelled);
  const above = generateFieldBand(s, size, (y0 - 1 + size) % size, ((y0 - 1 + size) % size) + 1).height;
  const below = generateFieldBand(s, size, y1 % size, (y1 % size) + 1).height;
  const normals = computeNormalsStrip(above, fields.height, below, size, rows, fields.depth, num(s.params, 'relief', 1));
  const packed = packMaps(size, fields.albedo, normals, fields.rough, fields.metal, new Float32Array(size * rows), fields.height, fields.emissive, rows);
  return {
    y0,
    rows,
    size,
    base: rgb(packed.baseColor),
    normal8: rgb(packed.normal),
    normal16: withNormal16 ? packed.normal16 : null,
    rough: packed.roughness,
    metal: packed.metallic,
    height16: packed.height16,
    emissive: packed.emissive ? rgb(packed.emissive) : null,
    depth: fields.depth,
  };
}

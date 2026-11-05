// Derivation of secondary maps (normal, AO) from the height field, and 8-bit packing.
// All neighbourhood operations wrap around the texture edges (toroidal indexing) so the
// derived maps are exactly as periodic as the height field they come from.

import { linearTo8 } from './color';

export type NormalConvention = 'opengl' | 'directx';

/**
 * Tangent-space normals from a periodic height field using central differences.
 *
 * Height h is in [0, 1] and represents `depth` tile-widths of physical relief, scaled by
 * `strength`. The slope is therefore resolution independent: dh/du = (h[x+1] - h[x-1]) * N / 2.
 * Image row 0 is the top of the texture, i.e. v = 1 - y / N, so dh/dv = -dh/dy.
 *
 * OpenGL convention (Y+): n = normalize(-dh/du * k, -dh/dv * k, 1), green up.
 * Returned array holds 3 floats per pixel in [-1, 1] (OpenGL convention).
 */
export function computeNormals(height: Float32Array, size: number, depth: number, strength: number): Float32Array {
  const out = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const yu = y === 0 ? size - 1 : y - 1; // row above (towards top)
    const yd = y === size - 1 ? 0 : y + 1; // row below
    normalRow(height, yu * size, height, y * size, height, yd * size, size, depth, strength, out, y * size * 3);
  }
  return out;
}

/**
 * Normals for one image row. `up`, `mid` and `down` hold the rows above, at and below the target
 * row (at the given offsets). Shared by the whole-image path and the strip-based (8K) path so both
 * produce bit-identical results.
 */
export function normalRow(
  up: Float32Array,
  upOff: number,
  mid: Float32Array,
  midOff: number,
  down: Float32Array,
  downOff: number,
  size: number,
  depth: number,
  strength: number,
  out: Float32Array,
  outOff: number,
): void {
  const k = depth * strength * size * 0.5;
  for (let x = 0; x < size; x++) {
    const xl = x === 0 ? size - 1 : x - 1;
    const xr = x === size - 1 ? 0 : x + 1;
    const dhdu = (mid[midOff + xr] - mid[midOff + xl]) * k;
    const dhdy = (down[downOff + x] - up[upOff + x]) * k;
    const dhdv = -dhdy;
    let nx = -dhdu;
    let ny = -dhdv;
    let nz = 1;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= inv;
    ny *= inv;
    nz *= inv;
    const o = outOff + x * 3;
    out[o] = nx;
    out[o + 1] = ny;
    out[o + 2] = nz;
  }
}

/**
 * Normals for a strip of rows [0, rows) given the strip's height plus the (wrapped) rows directly
 * above and below it.
 */
export function computeNormalsStrip(
  above: Float32Array,
  strip: Float32Array,
  below: Float32Array,
  size: number,
  rows: number,
  depth: number,
  strength: number,
): Float32Array {
  const out = new Float32Array(size * rows * 3);
  for (let y = 0; y < rows; y++) {
    const up = y === 0 ? above : strip;
    const upOff = y === 0 ? 0 : (y - 1) * size;
    const down = y === rows - 1 ? below : strip;
    const downOff = y === rows - 1 ? 0 : (y + 1) * size;
    normalRow(up, upOff, strip, y * size, down, downOff, size, depth, strength, out, y * size * 3);
  }
  return out;
}

/** Periodic separable box blur (radius r pixels) using running sums. */
export function boxBlurPeriodic(src: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const w = 2 * r + 1;
  const inv = 1 / w;
  // Horizontal
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + (((i % size) + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum * inv;
      const add = x + r + 1;
      const rem = x - r;
      sum += src[row + (((add % size) + size) % size)] - src[row + (((rem % size) + size) % size)];
    }
  }
  // Vertical
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[(((i % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum * inv;
      const add = y + r + 1;
      const rem = y - r;
      sum += tmp[(((add % size) + size) % size) * size + x] - tmp[(((rem % size) + size) % size) * size + x];
    }
  }
  return out;
}

/** Approximate Gaussian blur by three periodic box blurs. */
export function gaussPeriodic(src: Float32Array, size: number, radiusPx: number): Float32Array {
  const r = Math.max(1, Math.round(radiusPx / 1.7));
  let a = boxBlurPeriodic(src, size, r);
  a = boxBlurPeriodic(a, size, r);
  return boxBlurPeriodic(a, size, r);
}

/**
 * Height-based ambient occlusion approximation (cavity estimate, not ray traced).
 * For several radii (defined in tile units, so results are resolution independent) the local
 * average height is compared to the pixel height; pixels below their surroundings are darkened
 * in proportion to the implied occlusion angle.
 */
export function computeAO(height: Float32Array, size: number, depth: number, strength: number): Float32Array {
  const radii = AO_RADII;
  const weights = AO_WEIGHTS;
  const occ = new Float32Array(size * size);
  const relief = depth * strength;
  for (let k = 0; k < radii.length; k++) {
    const rPx = radii[k] * size;
    if (rPx < 0.75) continue;
    const blurred = gaussPeriodic(height, size, rPx);
    const scale = relief / radii[k];
    const w = weights[k];
    for (let i = 0; i < occ.length; i++) {
      const d = blurred[i] - height[i];
      if (d > 0) {
        const angle = Math.atan(d * scale) / (Math.PI / 2); // 0..1
        occ[i] += w * angle;
      }
    }
  }
  const ao = new Float32Array(size * size);
  for (let i = 0; i < occ.length; i++) {
    const o = Math.min(1, occ[i] * 1.6);
    ao[i] = 1 - o;
  }
  return ao;
}

const AO_RADII = [0.004, 0.012, 0.032];
const AO_WEIGHTS = [0.35, 0.4, 0.35];

/**
 * AO for very large textures (4K/8K): the neighbourhood averages used by computeAO are low-pass
 * by nature, so they are computed once on a smaller proxy of the same periodic height field and
 * sampled bilinearly. Only the per-pixel comparison uses the full-resolution height.
 */
export interface AOProxy {
  size: number;
  /** Blurred proxy heights per radius (null when the radius is below one proxy pixel). */
  blurs: (Float32Array | null)[];
  scales: number[];
  weights: number[];
}

export function buildAOProxy(heightP: Float32Array, P: number, depth: number, strength: number): AOProxy {
  const relief = depth * strength;
  return {
    size: P,
    blurs: AO_RADII.map((r) => (r * P < 0.75 ? null : gaussPeriodic(heightP, P, r * P))),
    scales: AO_RADII.map((r) => relief / r),
    weights: AO_WEIGHTS,
  };
}

/** Periodic bilinear sample of a proxy grid at texture coordinate (u, v) in image orientation (row 0 = top). */
function samplePeriodic(a: Float32Array, P: number, u: number, vImg: number): number {
  const fx = u * P - 0.5;
  const fy = vImg * P - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % P) + P) % P;
  const xb = (xa + 1) % P;
  const ya = ((y0 % P) + P) % P;
  const yb = (ya + 1) % P;
  const r0 = a[ya * P + xa] + (a[ya * P + xb] - a[ya * P + xa]) * tx;
  const r1 = a[yb * P + xa] + (a[yb * P + xb] - a[yb * P + xa]) * tx;
  return r0 + (r1 - r0) * ty;
}

/** AO for pixel (x, y) of a size x size texture with full-resolution height h. */
export function aoFromProxy(p: AOProxy, x: number, y: number, size: number, h: number): number {
  const u = (x + 0.5) / size;
  const vImg = (y + 0.5) / size;
  let occ = 0;
  for (let k = 0; k < p.blurs.length; k++) {
    const b = p.blurs[k];
    if (!b) continue;
    const d = samplePeriodic(b, p.size, u, vImg) - h;
    if (d > 0) occ += p.weights[k] * (Math.atan(d * p.scales[k]) / (Math.PI / 2));
  }
  return 1 - Math.min(1, occ * 1.6);
}

export interface PackedMaps {
  size: number;
  /** RGBA 8-bit sRGB base color (alpha 255). */
  baseColor: Uint8ClampedArray;
  /** RGBA 8-bit tangent-space normal in OpenGL (Y+) convention. */
  normal: Uint8ClampedArray;
  /** RGB 16-bit tangent-space normal in OpenGL (Y+) convention (for 16-bit normal exports). */
  normal16: Uint16Array;
  /** Single channel 8-bit maps. */
  roughness: Uint8Array;
  metallic: Uint8Array;
  ao: Uint8Array;
  /** 16-bit height, 0 = lowest, 65535 = highest. */
  height16: Uint16Array;
  /** RGBA 8-bit sRGB emissive color, or null. */
  emissive: Uint8ClampedArray | null;
}

export function quantize8(x: number): number {
  const v = Math.round(x * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function quantize16(x: number): number {
  const v = Math.round(x * 65535);
  return v < 0 ? 0 : v > 65535 ? 65535 : v;
}

export function packMaps(
  size: number,
  albedo: Float32Array,
  normals: Float32Array,
  rough: Float32Array,
  metal: Float32Array,
  ao: Float32Array,
  height: Float32Array,
  emissive: Float32Array | null,
  rows = size,
): PackedMaps {
  const n = size * rows;
  const baseColor = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);
  const normal16 = new Uint16Array(n * 3);
  const roughness = new Uint8Array(n);
  const metallic = new Uint8Array(n);
  const ao8 = new Uint8Array(n);
  const height16 = new Uint16Array(n);
  const em = emissive ? new Uint8ClampedArray(n * 4) : null;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const i4 = i * 4;
    baseColor[i4] = linearTo8(albedo[i3]);
    baseColor[i4 + 1] = linearTo8(albedo[i3 + 1]);
    baseColor[i4 + 2] = linearTo8(albedo[i3 + 2]);
    baseColor[i4 + 3] = 255;
    normal[i4] = quantize8(normals[i3] * 0.5 + 0.5);
    normal[i4 + 1] = quantize8(normals[i3 + 1] * 0.5 + 0.5);
    normal[i4 + 2] = quantize8(normals[i3 + 2] * 0.5 + 0.5);
    normal[i4 + 3] = 255;
    normal16[i3] = quantize16(normals[i3] * 0.5 + 0.5);
    normal16[i3 + 1] = quantize16(normals[i3 + 1] * 0.5 + 0.5);
    normal16[i3 + 2] = quantize16(normals[i3 + 2] * 0.5 + 0.5);
    roughness[i] = quantize8(rough[i]);
    metallic[i] = quantize8(metal[i]);
    ao8[i] = quantize8(ao[i]);
    const h = height[i];
    height16[i] = Math.round((h < 0 ? 0 : h > 1 ? 1 : h) * 65535);
    if (em && emissive) {
      em[i4] = linearTo8(emissive[i3]);
      em[i4 + 1] = linearTo8(emissive[i3 + 1]);
      em[i4 + 2] = linearTo8(emissive[i3 + 2]);
      em[i4 + 3] = 255;
    }
  }
  return { size, baseColor, normal, normal16, roughness, metallic, ao: ao8, height16, emissive: em };
}

/** Invert the green channel of an RGBA normal map (OpenGL <-> DirectX). Returns a new array. */
export function convertNormalConvention(rgbaOpenGL: Uint8ClampedArray, convention: NormalConvention): Uint8ClampedArray {
  if (convention === 'opengl') return rgbaOpenGL;
  const out = new Uint8ClampedArray(rgbaOpenGL);
  for (let i = 1; i < out.length; i += 4) out[i] = 255 - out[i];
  return out;
}

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
  const k = depth * strength * size * 0.5;
  for (let y = 0; y < size; y++) {
    const yu = y === 0 ? size - 1 : y - 1; // row above (towards top)
    const yd = y === size - 1 ? 0 : y + 1; // row below
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const xl = x === 0 ? size - 1 : x - 1;
      const xr = x === size - 1 ? 0 : x + 1;
      const dhdu = (height[row + xr] - height[row + xl]) * k;
      const dhdy = (height[yd * size + x] - height[yu * size + x]) * k;
      const dhdv = -dhdy;
      let nx = -dhdu;
      let ny = -dhdv;
      let nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const o = (row + x) * 3;
      out[o] = nx;
      out[o + 1] = ny;
      out[o + 2] = nz;
    }
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
  const radii = [0.004, 0.012, 0.032];
  const weights = [0.35, 0.4, 0.35];
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

export interface PackedMaps {
  size: number;
  /** RGBA 8-bit sRGB base color (alpha 255). */
  baseColor: Uint8ClampedArray;
  /** RGBA 8-bit tangent-space normal in OpenGL (Y+) convention. */
  normal: Uint8ClampedArray;
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

export function packMaps(
  size: number,
  albedo: Float32Array,
  normals: Float32Array,
  rough: Float32Array,
  metal: Float32Array,
  ao: Float32Array,
  height: Float32Array,
  emissive: Float32Array | null,
): PackedMaps {
  const n = size * size;
  const baseColor = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);
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
  return { size, baseColor, normal, roughness, metallic, ao: ao8, height16, emissive: em };
}

/** Invert the green channel of an RGBA normal map (OpenGL <-> DirectX). Returns a new array. */
export function convertNormalConvention(rgbaOpenGL: Uint8ClampedArray, convention: NormalConvention): Uint8ClampedArray {
  if (convention === 'opengl') return rgbaOpenGL;
  const out = new Uint8ClampedArray(rgbaOpenGL);
  for (let i = 1; i < out.length; i += 4) out[i] = 255 - out[i];
  return out;
}

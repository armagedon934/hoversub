// Periodic (tileable) noise primitives.
//
// Every function here takes texture coordinates (u, v) in the unit square and an integer
// frequency. Lattice indices are wrapped modulo the frequency, so f(u + 1, v) === f(u, v) and
// f(u, v + 1) === f(u, v) exactly (up to floating point evaluation of identical arguments).
// Because all frequencies are integers, sums, products and domain warps built from these
// functions remain periodic on the unit square too.

import { hash2, imod, rehash, unit } from './hash';


const GRAD_COUNT = 256;
const GX = new Float64Array(GRAD_COUNT);
const GY = new Float64Array(GRAD_COUNT);
for (let i = 0; i < GRAD_COUNT; i++) {
  const a = ((i + 0.5) / GRAD_COUNT) * Math.PI * 2;
  GX[i] = Math.cos(a);
  GY[i] = Math.sin(a);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Periodic 2D gradient noise in lattice space. (x, y) are lattice coordinates; the lattice
 * repeats every px cells horizontally and py cells vertically. Output is roughly in [-1, 1].
 */
export function gradNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xf0 = Math.floor(x);
  const yf0 = Math.floor(y);
  const fx = x - xf0;
  const fy = y - yf0;
  const ipx = px | 0;
  const ipy = py | 0;
  let x0 = (xf0 | 0) % ipx;
  if (x0 < 0) x0 += ipx;
  let y0 = (yf0 | 0) % ipy;
  if (y0 < 0) y0 += ipy;
  const x1 = x0 + 1 === ipx ? 0 : x0 + 1;
  const y1 = y0 + 1 === ipy ? 0 : y0 + 1;
  // Inline hashing: row hashes are shared between the two corners of each row.
  const s = Math.imul(seed | 0, 0x9e3779b1);
  const hx0 = Math.imul(x0, 0x27d4eb2d);
  const hx1 = Math.imul(x1, 0x27d4eb2d);
  const hy0 = Math.imul(y0, 0x165667b1) ^ s;
  const hy1 = Math.imul(y1, 0x165667b1) ^ s;
  const g00 = mix32(hx0 ^ hy0) & 255;
  const g10 = mix32(hx1 ^ hy0) & 255;
  const g01 = mix32(hx0 ^ hy1) & 255;
  const g11 = mix32(hx1 ^ hy1) & 255;
  const n00 = GX[g00] * fx + GY[g00] * fy;
  const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
  const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
  const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = n00 + sx * (n10 - n00);
  const b = n01 + sx * (n11 - n01);
  return (a + sy * (b - a)) * 1.4142;
}

/** Final avalanche step of hash2 (kept identical so gradNoise matches hash2-based lattices). */
function mix32(h0: number): number {
  let h = h0 >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Periodic value noise (smooth interpolation of random lattice values), output in [0, 1]. */
export function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xf0 = Math.floor(x);
  const yf0 = Math.floor(y);
  const fx = x - xf0;
  const fy = y - yf0;
  const x0 = imod(xf0, px);
  const y0 = imod(yf0, py);
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const sx = fade(fx);
  const sy = fade(fy);
  const a = unit(hash2(x0, y0, seed));
  const b = unit(hash2(x1, y0, seed));
  const c = unit(hash2(x0, y1, seed));
  const d = unit(hash2(x1, y1, seed));
  const ab = a + sx * (b - a);
  const cd = c + sx * (d - c);
  return ab + sy * (cd - ab);
}

/** Single octave of periodic gradient noise in UV space with integer frequencies. */
export function noiseUV(u: number, v: number, fx: number, fy: number, seed: number): number {
  return gradNoise(u * fx, v * fy, fx, fy, seed);
}

/**
 * Tileable fractal noise (fBm) in UV space. `freq` must be an integer; each octave doubles it,
 * keeping every octave periodic on the unit square. Output roughly in [-1, 1].
 */
export function fbm(u: number, v: number, freq: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradNoise(u * f, v * f, f, f, seed + i * 1013);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Anisotropic tileable fBm: separate integer base frequencies along u and v. */
export function fbmAniso(
  u: number,
  v: number,
  fx: number,
  fy: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let ax = fx;
  let ay = fy;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gradNoise(u * ax, v * ay, ax, ay, seed + i * 1013);
    norm += amp;
    amp *= gain;
    ax *= 2;
    ay *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal style noise in [0, 1]: sharp crests where the gradient noise crosses zero. */
export function ridged(u: number, v: number, freq: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  let weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(gradNoise(u * f, v * f, f, f, seed + i * 1013));
    n *= n;
    n *= weight;
    weight = Math.min(1, Math.max(0, n * 1.6));
    sum += amp * n;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Billow noise in [0, 1]: absolute value of fBm octaves, giving rounded lumps. */
export function billow(u: number, v: number, freq: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * Math.abs(gradNoise(u * f, v * f, f, f, seed + i * 1013));
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

export interface VoronoiResult {
  /** Distance to nearest feature point, in UV units. */
  f1: number;
  /** Distance to second nearest feature point, in UV units. */
  f2: number;
  /** Distance to the nearest Voronoi cell border, in UV units. */
  edge: number;
  /** Hash identifying the nearest cell (stable across tile boundaries). */
  id: number;
  /** Offset from the sample to the nearest feature point, in UV units. */
  dx: number;
  dy: number;
  /** Hash of the second nearest cell. */
  id2: number;
  /** Internal cache of the 5x5 feature points around the last evaluated cell. */
  cache: VoronoiCache;
}

interface VoronoiCache {
  key: string;
  xi: number;
  yi: number;
  px: Float64Array; // feature point x in cell units (unwrapped)
  py: Float64Array;
  ids: Uint32Array;
}

export function makeVoronoiResult(): VoronoiResult {
  return {
    f1: 0,
    f2: 0,
    edge: 0,
    id: 0,
    dx: 0,
    dy: 0,
    id2: 0,
    cache: { key: '', xi: 0, yi: 0, px: new Float64Array(25), py: new Float64Array(25), ids: new Uint32Array(25) },
  };
}

/**
 * Periodic Voronoi / Worley evaluation with `nx` x `ny` cells per tile.
 * jitter in [0, 1] controls how far feature points stray from cell centres.
 * When `withEdge` is true the distance to the nearest cell border is computed with the
 * two-pass bisector method (over the cached 5x5 neighbourhood), otherwise `edge` is
 * approximated as (f2 - f1) / 2.
 *
 * Feature points come from hashes of wrapped cell indices, so the diagram is periodic.
 * The 5x5 neighbourhood of feature points is cached on `out`, which makes scanline
 * evaluation (neighbouring pixels share a cell) much cheaper.
 */
export function voronoi(
  u: number,
  v: number,
  nx: number,
  ny: number,
  seed: number,
  jitter: number,
  out: VoronoiResult,
  withEdge = true,
): VoronoiResult {
  const sx = 1 / nx;
  const sy = 1 / ny;
  const x = u * nx;
  const y = v * ny;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const c = out.cache;
  const key = `${nx},${ny},${seed},${jitter}`;
  if (c.key !== key || c.xi !== xi || c.yi !== yi) {
    c.key = key;
    c.xi = xi;
    c.yi = yi;
    let k = 0;
    for (let j = -2; j <= 2; j++) {
      const cj = yi + j;
      let wj = cj % ny;
      if (wj < 0) wj += ny;
      for (let i = -2; i <= 2; i++) {
        const ci = xi + i;
        let wi = ci % nx;
        if (wi < 0) wi += nx;
        const h = hash2(wi, wj, seed);
        c.px[k] = ci + 0.5 + jitter * (unit(h) - 0.5);
        c.py[k] = cj + 0.5 + jitter * (unit(rehash(h, 1)) - 0.5);
        c.ids[k] = h;
        k++;
      }
    }
  }
  let f1 = 1e9;
  let f2 = 1e9;
  let mx = 0;
  let my = 0;
  let mk = 12;
  let id = 0;
  let id2 = 0;
  for (let j = 1; j <= 3; j++) {
    for (let i = 1; i <= 3; i++) {
      const k = j * 5 + i;
      const ddx = (c.px[k] - x) * sx;
      const ddy = (c.py[k] - y) * sy;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) {
        f2 = f1;
        id2 = id;
        f1 = d;
        mx = ddx;
        my = ddy;
        mk = k;
        id = c.ids[k];
      } else if (d < f2) {
        f2 = d;
        id2 = c.ids[k];
      }
    }
  }
  out.f1 = Math.sqrt(f1);
  out.f2 = Math.sqrt(f2);
  out.id = id;
  out.id2 = id2;
  out.dx = mx;
  out.dy = my;
  if (!withEdge) {
    out.edge = (out.f2 - out.f1) * 0.5;
    return out;
  }
  let edge = 1e9;
  for (let k = 0; k < 25; k++) {
    if (k === mk) continue;
    const rx = (c.px[k] - x) * sx;
    const ry = (c.py[k] - y) * sy;
    const ex = rx - mx;
    const ey = ry - my;
    const el2 = ex * ex + ey * ey;
    if (el2 < 1e-18) continue;
    // Only points closer than the current edge bound can define a nearer bisector.
    const d = ((mx + rx) * 0.5 * ex + (my + ry) * 0.5 * ey) / Math.sqrt(el2);
    if (d < edge) edge = d;
  }
  out.edge = edge;
  return out;
}

/** Hermite smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Segment distance helper (point p to segment a-b), all in the same units. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ll = abx * abx + aby * aby;
  const t = ll > 0 ? clamp01((apx * abx + apy * aby) / ll) : 0;
  const qx = apx - abx * t;
  const qy = apy - aby * t;
  return Math.sqrt(qx * qx + qy * qy);
}

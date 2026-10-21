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
  const x0 = imod(xf0, px);
  const y0 = imod(yf0, py);
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const g00 = hash2(x0, y0, seed) & 255;
  const g10 = hash2(x1, y0, seed) & 255;
  const g01 = hash2(x0, y1, seed) & 255;
  const g11 = hash2(x1, y1, seed) & 255;
  const n00 = GX[g00] * fx + GY[g00] * fy;
  const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
  const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
  const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  const sx = fade(fx);
  const sy = fade(fy);
  const a = n00 + sx * (n10 - n00);
  const b = n01 + sx * (n11 - n01);
  return (a + sy * (b - a)) * 1.4142;
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
  /** Exact distance to the nearest Voronoi cell border, in UV units. */
  edge: number;
  /** Hash identifying the nearest cell (stable across tile boundaries). */
  id: number;
  /** Offset from the sample to the nearest feature point, in UV units. */
  dx: number;
  dy: number;
  /** Hash of the second nearest cell (useful for cross-cell blending). */
  id2: number;
}

export function makeVoronoiResult(): VoronoiResult {
  return { f1: 0, f2: 0, edge: 0, id: 0, dx: 0, dy: 0, id2: 0 };
}

/**
 * Periodic Voronoi / Worley evaluation with `nx` x `ny` cells per tile.
 * jitter in [0, 1] controls how far feature points stray from cell centres.
 * When `withEdge` is true the exact border distance is computed (two-pass method),
 * otherwise `edge` is approximated as (f2 - f1) / 2.
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
  let f1 = 1e9;
  let f2 = 1e9;
  let mx = 0;
  let my = 0;
  let mi = 0;
  let mj = 0;
  let id = 0;
  let id2 = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ci = xi + i;
      const cj = yi + j;
      const h = hash2(imod(ci, nx), imod(cj, ny), seed);
      const px = ci + 0.5 + jitter * (unit(h) - 0.5);
      const py = cj + 0.5 + jitter * (unit(rehash(h, 1)) - 0.5);
      const ddx = (px - x) * sx;
      const ddy = (py - y) * sy;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) {
        f2 = f1;
        id2 = id;
        f1 = d;
        mx = ddx;
        my = ddy;
        mi = ci;
        mj = cj;
        id = h;
      } else if (d < f2) {
        f2 = d;
        id2 = h;
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
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      const ci = mi + i;
      const cj = mj + j;
      if (ci === mi && cj === mj) continue;
      const h = hash2(imod(ci, nx), imod(cj, ny), seed);
      const px = ci + 0.5 + jitter * (unit(h) - 0.5);
      const py = cj + 0.5 + jitter * (unit(rehash(h, 1)) - 0.5);
      const rx = (px - x) * sx;
      const ry = (py - y) * sy;
      const ex = rx - mx;
      const ey = ry - my;
      const el = Math.sqrt(ex * ex + ey * ey);
      if (el < 1e-9) continue;
      const d = ((mx + rx) * 0.5 * ex + (my + ry) * 0.5 * ey) / el;
      if (d < edge) edge = d;
    }
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

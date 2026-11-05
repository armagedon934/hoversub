// Helpers shared by family generators.

import type { RGB } from '../color';
import type { Fields, GenContext } from '../fields';
import { clamp01, lerp } from '../noise';

/** Write one pixel of all scalar/color fields. */
export function writePixel(
  f: Fields,
  i: number,
  c: RGB,
  height: number,
  rough: number,
  metal: number,
): void {
  const i3 = i * 3;
  f.albedo[i3] = c[0];
  f.albedo[i3 + 1] = c[1];
  f.albedo[i3 + 2] = c[2];
  f.height[i] = height < 0 ? 0 : height > 1 ? 1 : height;
  f.rough[i] = rough < 0.02 ? 0.02 : rough > 1 ? 1 : rough;
  f.metal[i] = metal < 0 ? 0 : metal > 1 ? 1 : metal;
}

export function writeEmissive(f: Fields, i: number, r: number, g: number, b: number): void {
  if (!f.emissive) return;
  const i3 = i * 3;
  f.emissive[i3] = r;
  f.emissive[i3 + 1] = g;
  f.emissive[i3 + 2] = b;
}

/**
 * Roughness bias: maps r through a Schlick-style bias curve. bias = 0.5 leaves values unchanged,
 * lower values make every surface glossier, higher values rougher, preserving ordering
 * (so material semantics such as "rust is rougher than bare metal" are kept).
 */
export function roughBias(r: number, bias: number): number {
  const b = Math.min(0.97, Math.max(0.03, bias));
  if (Math.abs(b - 0.5) < 1e-4) return r;
  const x = clamp01(r);
  return x / ((1 / b - 2) * (1 - x) + 1);
}

/**
 * Palette simplification for the stylized end of the Stylized <-> Natural control: continuous
 * variation values are snapped toward a small number of discrete tones.
 */
export function tone(t: number, natural: number, levels = 4): number {
  if (natural >= 0.999) return t;
  const q = Math.min(levels - 1, Math.floor(clamp01(t) * levels)) / (levels - 1);
  return lerp(q, t, natural);
}

/** Edge irregularity scale: stylized shapes are cleaner. */
export function edgeNoiseScale(natural: number): number {
  return lerp(0.15, 1, natural);
}

/** Bevel width scale: stylized shapes get broader, cleaner bevels. */
export function bevelScale(natural: number): number {
  return lerp(1.9, 1, natural);
}

/** Fine-detail octave count scaled by the style (stylized drops high-frequency octaves). */
export function styledOctaves(ctx: GenContext, freq: number, wanted: number): number {
  const w = Math.max(1, Math.round(lerp(Math.min(2, wanted), wanted, ctx.natural)));
  return ctx.octaves(freq, w);
}

/** Bevel profile: 0 at the gap edge, rising to 1 over `width` with a rounded shoulder. */
export function bevelProfile(insideDist: number, width: number): number {
  if (insideDist <= 0) return 0;
  const t = insideDist >= width ? 1 : insideDist / width;
  return 1 - (1 - t) * (1 - t);
}

/** Report progress every few rows. */
export function rowProgress(ctx: GenContext, y: number): void {
  if ((y & 7) === 0) ctx.progress((y - ctx.y0) / Math.max(1, ctx.y1 - ctx.y0));
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function mulRGB(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function tintRGB(a: RGB, t: RGB): RGB {
  return [a[0] * t[0], a[1] * t[1], a[2] * t[2]];
}

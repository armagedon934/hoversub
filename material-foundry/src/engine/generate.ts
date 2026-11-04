// Generation pipeline: material fields -> derived maps -> packed 8/16-bit image data.
//
// Field generation is split into row bands so it can run on several workers in parallel.
// Derived maps (normals, AO) need the complete periodic height field and run afterwards.

import { CancelledError, createFields, makeContext, type Fields } from './fields';
import { computeAO, computeNormals, packMaps, type PackedMaps } from './maps';
import { getFamily, resolveParams } from './registry';
import { num, type MaterialSettings } from './types';
import { gradNoise } from './noise';
import { subSeed } from './hash';

export type ProgressFn = (stage: string, fraction: number) => void;

export interface GeneratedMaterial {
  size: number;
  maps: PackedMaps;
  hasEmissive: boolean;
  /** Suggested emission multiplier for engines (the emissive map stores unit-intensity color). */
  emissionStrength: number;
  /** Physical relief depth as a fraction of the tile width, already multiplied by relief strength. */
  reliefDepth: number;
  /** Settings with all parameters resolved (defaults filled in). */
  settings: MaterialSettings;
  timings: Record<string, number>;
}

export const GENERATOR_VERSION = 1;

/** Normalize settings so every parameter is present and valid. */
export function resolveSettings(settings: MaterialSettings): MaterialSettings {
  const family = getFamily(settings.family);
  return { ...settings, seed: settings.seed | 0, params: resolveParams(family, settings.params) };
}

/** Generate material fields for rows [y0, y1) of a size x size texture. */
export function generateFieldBand(
  settings: MaterialSettings,
  size: number,
  y0: number,
  y1: number,
  onProgress?: (fraction: number) => void,
  isCancelled?: () => boolean,
  offset: [number, number] = [0, 0],
): Fields {
  const s = resolveSettings(settings);
  const family = getFamily(s.family);
  const fields = createFields(size, family.emits(s.params), y1 - y0);
  const ctx = makeContext(
    size,
    s.seed,
    num(s.params, 'style', 1),
    (f) => {
      if (isCancelled?.()) throw new CancelledError();
      onProgress?.(f);
    },
    y0,
    y1,
    offset[0],
    offset[1],
  );
  family.generate(ctx, s.params, fields);
  applyMicroDetail(fields, family.micro ?? DEFAULT_MICRO, num(s.params, 'detail', 0.5), s.seed, size, y0, offset);
  onProgress?.(1);
  return fields;
}

const DEFAULT_MICRO = { albedo: 0.05, height: 0.003, rough: 0.04 };
/** Micro-detail octave frequencies (cycles per tile). Each is used only below size / 3, so the
 * preview resolutions (up to 1024) are unaffected and 2K / 4K / 8K exports gain 1 / 2 / 3 octaves. */
export const MICRO_FREQS = [384, 768, 1536, 3072];

/**
 * Resolution-dependent micro detail: periodic gradient-noise grain applied after the family
 * generator. Height amplitude falls off as 1/frequency so the normal-map slope it adds is similar
 * at every resolution.
 */
export function applyMicroDetail(
  f: Fields,
  micro: { albedo: number; height: number; rough: number },
  detail: number,
  seed: number,
  size: number,
  y0: number,
  offset: [number, number] = [0, 0],
): void {
  const freqs = MICRO_FREQS.filter((fr) => fr <= size / 3);
  if (!freqs.length || detail <= 0) return;
  const k = 0.4 + detail;
  const sd = subSeed(seed, 'micro');
  for (let y = 0; y < f.rows; y++) {
    const v = (y0 + y + 0.5) / size + offset[1];
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size + offset[0];
      let m = 0;
      let mh = 0;
      // A periodic warp (in lattice units) breaks up the regular zero-crossing grid that a single
      // gradient-noise octave would otherwise show at 1:1 magnification.
      const wf = 96;
      const wx = 0.7 * gradNoise(u * wf, v * wf, wf, wf, sd + 7);
      const wy = 0.7 * gradNoise(u * wf, v * wf, wf, wf, sd + 11);
      for (let o = 0; o < freqs.length; o++) {
        const fr = freqs[o];
        const n = gradNoise(u * fr + wx * (o + 1), v * fr + wy * (o + 1), fr, fr, sd + o * 101);
        m += n * (o === 0 ? 1 : 0.7);
        mh += n * (384 / fr);
      }
      const i = y * size + x;
      const a = 1 + micro.albedo * k * m;
      f.albedo[i * 3] *= a;
      f.albedo[i * 3 + 1] *= a;
      f.albedo[i * 3 + 2] *= a;
      const h = f.height[i] + micro.height * k * mh;
      f.height[i] = h < 0 ? 0 : h > 1 ? 1 : h;
      const r = f.rough[i] + micro.rough * k * m;
      f.rough[i] = r < 0.02 ? 0.02 : r > 1 ? 1 : r;
    }
  }
}

/** Concatenate row bands (in order) into one complete field set. */
export function assembleBands(size: number, bands: Fields[]): Fields {
  if (bands.length === 1 && bands[0].rows === size) return bands[0];
  const withEm = bands.some((b) => b.emissive !== null);
  const out = createFields(size, withEm, size);
  out.depth = bands[0].depth;
  let row = 0;
  for (const b of bands) {
    out.albedo.set(b.albedo, row * size * 3);
    out.height.set(b.height, row * size);
    out.rough.set(b.rough, row * size);
    out.metal.set(b.metal, row * size);
    if (out.emissive && b.emissive) out.emissive.set(b.emissive, row * size * 3);
    row += b.rows;
    }
  if (row !== size) throw new Error(`Band assembly covered ${row} of ${size} rows`);
  return out;
}

/** Derive normals and AO from complete fields and pack all maps. */
export function finishMaterial(
  fields: Fields,
  settings: MaterialSettings,
  onProgress?: ProgressFn,
  isCancelled?: () => boolean,
): GeneratedMaterial {
  const s = resolveSettings(settings);
  const family = getFamily(s.family);
  const size = fields.size;
  const report = onProgress ?? (() => {});
  const check = () => {
    if (isCancelled?.()) throw new CancelledError();
  };
  const timings: Record<string, number> = {};
  const relief = num(s.params, 'relief', 1);
  let t0 = performance.now();
  report('Deriving normal map', 0);
  const normals = computeNormals(fields.height, size, fields.depth, relief);
  timings.normals = performance.now() - t0;
  check();
  t0 = performance.now();
  report('Approximating ambient occlusion', 0.35);
  const ao = computeAO(fields.height, size, fields.depth, relief);
  timings.ao = performance.now() - t0;
  check();
  t0 = performance.now();
  report('Packing maps', 0.8);
  const maps = packMaps(size, fields.albedo, normals, fields.rough, fields.metal, ao, fields.height, fields.emissive);
  timings.pack = performance.now() - t0;
  report('Done', 1);
  const emits = family.emits(s.params);
  return {
    size,
    maps,
    hasEmissive: emits,
    emissionStrength: emits ? num(s.params, 'emissionIntensity', 1) : 0,
    reliefDepth: fields.depth * relief,
    settings: s,
    timings,
  };
}

export interface GenerateOptions {
  size: number;
  settings: MaterialSettings;
  onProgress?: ProgressFn;
  isCancelled?: () => boolean;
}

/** Single-threaded convenience used by tests, scripts and small thumbnails. */
export function generateMaterial(opts: GenerateOptions): GeneratedMaterial {
  const t0 = performance.now();
  const report = opts.onProgress ?? (() => {});
  report('Generating material fields', 0);
  const fields = generateFieldBand(opts.settings, opts.size, 0, opts.size, (f) => report('Generating material fields', 0.75 * f), opts.isCancelled);
  const tFields = performance.now() - t0;
  const g = finishMaterial(fields, opts.settings, (stage, f) => report(stage, 0.75 + 0.25 * f), opts.isCancelled);
  g.timings.fields = tFields;
  return g;
}

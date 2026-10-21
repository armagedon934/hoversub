// Generation pipeline: material fields -> derived maps -> packed 8/16-bit image data.
//
// Field generation is split into row bands so it can run on several workers in parallel.
// Derived maps (normals, AO) need the complete periodic height field and run afterwards.

import { CancelledError, createFields, makeContext, type Fields } from './fields';
import { computeAO, computeNormals, packMaps, type PackedMaps } from './maps';
import { getFamily, resolveParams } from './registry';
import { num, type MaterialSettings } from './types';

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
  );
  family.generate(ctx, s.params, fields);
  onProgress?.(1);
  return fields;
}

/** Concatenate row bands (in order) into one complete field set. */
export function assembleBands(size: number, bands: Fields[]): Fields {
  if (bands.length === 1 && bands[0].rows === size) return bands[0];
  const withEm = bands.some((b) => b.emissive !== null);
  const out = createFields(size, withEm, size);
  out.depth = bands[0].depth;
  let row = 0;
  for (const b of bands) {
    const n = b.rows * size;
    out.albedo.set(b.albedo, row * size * 3);
    out.height.set(b.height, row * size);
    out.rough.set(b.rough, row * size);
    out.metal.set(b.metal, row * size);
    if (out.emissive && b.emissive) out.emissive.set(b.emissive, row * size * 3);
    row += b.rows;
    void n;
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

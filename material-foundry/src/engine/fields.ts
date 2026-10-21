// Material field storage and the generation context passed to family generators.

export interface Fields {
  size: number;
  /** Number of rows stored (equals size for a complete field set, fewer for a band). */
  rows: number;
  /** Linear RGB albedo, 3 floats per pixel, row-major, row 0 = top of image. */
  albedo: Float32Array;
  /** Height in [0, 1]: 0 = deepest recess, 1 = highest surface. */
  height: Float32Array;
  /** Perceptual roughness in [0, 1]. */
  rough: Float32Array;
  /** Metalness in [0, 1]. */
  metal: Float32Array;
  /** Linear RGB emissive color (unit intensity), or null when the material does not emit. */
  emissive: Float32Array | null;
  /**
   * Physical depth of the full height range, as a fraction of the tile width.
   * Used to derive normal slopes and AO consistently at any resolution.
   */
  depth: number;
}

export function createFields(size: number, withEmissive: boolean, rows = size): Fields {
  const n = size * rows;
  return {
    size,
    rows,
    albedo: new Float32Array(n * 3),
    height: new Float32Array(n),
    rough: new Float32Array(n),
    metal: new Float32Array(n),
    emissive: withEmissive ? new Float32Array(n * 3) : null,
    depth: 0.03,
  };
}

export class CancelledError extends Error {
  constructor() {
    super('Generation cancelled');
    this.name = 'CancelledError';
  }
}

export interface GenContext {
  size: number;
  /** Row range to generate: [y0, y1). Arrays in the output Fields start at row y0. */
  y0: number;
  y1: number;
  seed: number;
  /** 0 = stylized, 1 = natural. */
  natural: number;
  /** Report progress of the field stage in [0, 1]. */
  progress(fraction: number): void;
  /**
   * Number of fBm octaves to evaluate starting at integer frequency `freq`, capped so the
   * finest octave stays below the Nyquist limit of the current resolution.
   */
  octaves(freq: number, wanted: number): number;
}

export function makeContext(
  size: number,
  seed: number,
  natural: number,
  progress: (f: number) => void,
  y0 = 0,
  y1 = size,
): GenContext {
  return {
    size,
    y0,
    y1,
    seed,
    natural,
    progress,
    octaves(freq: number, wanted: number): number {
      // Finest feature frequency f * 2^(k-1) should stay below size / 3 cycles per tile.
      const limit = size / 3;
      let k = 0;
      let f = freq;
      while (k < wanted && f <= limit) {
        k++;
        f *= 2;
      }
      return Math.max(1, k);
    },
  };
}

/** Convert a UV-space width to pixels at the current resolution (minimum one pixel for AA). */
export function aaWidth(ctx: GenContext, uvWidth: number): number {
  return Math.max(uvWidth, 1.0 / ctx.size);
}

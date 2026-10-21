// Integer hashing and seeded random helpers.
// Everything here is pure and deterministic: the same inputs always give the same outputs,
// independent of platform, which is what makes generated materials reproducible.

/** 32-bit avalanche hash of two integer coordinates and a seed. Returns an unsigned 32-bit int. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash of one integer and a seed. */
export function hash1(x: number, seed: number): number {
  return hash2(x, 0x5bd1e995, seed);
}

/** Map a 32-bit hash to [0, 1). */
export function unit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Derive a further hash from an existing one (cheap re-mix). */
export function rehash(h: number, k: number): number {
  let x = (h ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Random value in [0,1) for integer cell (x, y) with a stream index k. */
export function rand2(x: number, y: number, seed: number, k = 0): number {
  return unit(rehash(hash2(x, y, seed), k));
}

/** Combine a base seed with a string tag so that different layers get independent streams. */
export function subSeed(seed: number, tag: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193) >>> 0;
  }
  return rehash(h, 7) | 0;
}

/** Small seeded PRNG (mulberry32) for sequential choices such as glyph construction. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Positive modulo for integers. */
export function imod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

/** Positive fractional wrap into [0, 1). */
export function wrap01(x: number): number {
  return x - Math.floor(x);
}

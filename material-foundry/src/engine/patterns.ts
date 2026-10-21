// Structured, periodic layouts (bricks, tiles, planks, panels, ashlar blocks) and periodic
// feature generators (cracks, scratches). Every layout is defined on the unit square with
// integer counts, so cells that cross the tile boundary continue seamlessly on the other side.
// Cell identities are hashed from wrapped indices, so a cell keeps its identity (and therefore
// its color, tilt, knots or chips) on both sides of the boundary.

import { hash2, imod, rehash, unit } from './hash';
import { clamp01, fbm, makeVoronoiResult, smoothstep, voronoi } from './noise';

export interface CellSample {
  /** Offset from the cell centre in UV units. */
  lx: number;
  ly: number;
  /** Half extents of the cell in UV units (before gaps are applied). */
  hx: number;
  hy: number;
  /** Stable hash of the cell. */
  id: number;
  /** Wrapped integer row / column (layout dependent). */
  row: number;
  col: number;
  /** Extra flag (e.g. header brick, rotated basket-weave pair, checker parity). */
  kind: number;
}

export function makeCell(): CellSample {
  return { lx: 0, ly: 0, hx: 0, hy: 0, id: 0, row: 0, col: 0, kind: 0 };
}

/** Signed distance to a rounded rectangle centred at the origin (negative inside). */
export function sdRoundRect(px: number, py: number, hx: number, hy: number, r: number): number {
  const rr = Math.min(r, hx, hy);
  const qx = Math.abs(px) - hx + rr;
  const qy = Math.abs(py) - hy + rr;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rr;
}

export type BrickBond = 'running' | 'stack' | 'english' | 'flemish' | 'basket';

/**
 * Brick layouts. `cols` bricks per row across the tile, `rows` rows (must be even for bonds that
 * alternate). Stagger is the running-bond offset of odd rows as a fraction of a brick.
 */
export function brickCell(
  u: number,
  v: number,
  cols: number,
  rows: number,
  bond: BrickBond,
  stagger: number,
  seed: number,
  out: CellSample,
): CellSample {
  const y = v * rows;
  const row = Math.floor(y);
  const wrow = imod(row, rows);
  const fy = y - row;
  const rowH = 1 / rows;
  if (bond === 'basket') {
    // Square blocks of two bricks, alternating horizontal and vertical pairs (checkerboard).
    const bx = u * cols;
    const by = v * (rows / 2);
    const ci = Math.floor(bx);
    const cj = Math.floor(by);
    const fx = bx - ci;
    const fyb = by - cj;
    const wc = imod(ci, cols);
    const wr = imod(cj, rows / 2);
    const horizontal = (wc + wr) % 2 === 0;
    const cw = 1 / cols;
    const ch = 2 / rows;
    if (horizontal) {
      const half = fyb < 0.5 ? 0 : 1;
      out.lx = (fx - 0.5) * cw;
      out.ly = (fyb - (half + 0.5) / 2) * ch;
      out.hx = cw / 2;
      out.hy = ch / 4;
      out.id = hash2(wc * 2 + half, wr, seed);
    } else {
      const half = fx < 0.5 ? 0 : 1;
      out.lx = (fx - (half + 0.5) / 2) * cw;
      out.ly = (fyb - 0.5) * ch;
      out.hx = cw / 4;
      out.hy = ch / 2;
      out.id = hash2(wc * 2 + half, wr + 7919, seed);
    }
    out.row = wr;
    out.col = wc;
    out.kind = horizontal ? 0 : 1;
    return out;
  }
  let unitsPerRow = cols;
  let offset = 0;
  let header = false;
  if (bond === 'running') {
    offset = wrow % 2 === 1 ? stagger : 0;
  } else if (bond === 'english') {
    // Alternating stretcher rows and header rows (headers are half-length bricks).
    header = wrow % 2 === 1;
    if (header) {
      unitsPerRow = cols * 2;
      offset = 0.5;
    }
  }
  if (bond === 'flemish') {
    // Each row alternates stretcher (1.0) and header (0.5): pairs of 1.5 units.
    const pairs = cols;
    const x = u * pairs * 1.5 + (wrow % 2 === 1 ? 0.75 : 0);
    const p = Math.floor(x / 1.5);
    const fx = x - p * 1.5;
    const unitW = 1 / (pairs * 1.5);
    if (fx < 1) {
      out.lx = (fx - 0.5) * unitW;
      out.hx = 0.5 * unitW;
      out.kind = 0;
      out.id = hash2(imod(p, pairs) * 2, wrow, seed);
    } else {
      out.lx = (fx - 1.25) * unitW;
      out.hx = 0.25 * unitW;
      out.kind = 1;
      out.id = hash2(imod(p, pairs) * 2 + 1, wrow, seed);
    }
    out.ly = (fy - 0.5) * rowH;
    out.hy = 0.5 * rowH;
    out.row = wrow;
    out.col = imod(p, pairs);
    return out;
  }
  const x = u * unitsPerRow + offset;
  const col = Math.floor(x);
  const fx = x - col;
  const wcol = imod(col, unitsPerRow);
  const colW = 1 / unitsPerRow;
  out.lx = (fx - 0.5) * colW;
  out.ly = (fy - 0.5) * rowH;
  out.hx = colW / 2;
  out.hy = rowH / 2;
  out.id = hash2(wcol, wrow, seed);
  out.row = wrow;
  out.col = wcol;
  out.kind = header ? 1 : 0;
  return out;
}

/**
 * Ashlar (coursed, irregular) stone layout. Course heights and block widths are jittered by
 * `irregularity`, using hashes of wrapped indices so the jitter tiles perfectly.
 */
export function ashlarCell(
  u: number,
  v: number,
  rows: number,
  blocksPerRow: number,
  irregularity: number,
  seed: number,
  out: CellSample,
): CellSample {
  const rowEdge = (i: number) => {
    const wi = imod(i, rows);
    const j = (unit(hash2(wi, 991, seed)) - 0.5) * 0.55 * irregularity;
    return (i + j) / rows;
  };
  const y = v * rows;
  let r = Math.floor(y);
  // Adjust to the jittered course containing v.
  if (v < rowEdge(r)) r -= 1;
  else if (v >= rowEdge(r + 1)) r += 1;
  const y0 = rowEdge(r);
  const y1 = rowEdge(r + 1);
  const wr = imod(r, rows);
  const rowHash = hash2(wr, 4049, seed);
  const delta = Math.round((unit(rehash(rowHash, 3)) - 0.5) * 2.2 * irregularity);
  const n = Math.max(1, blocksPerRow + delta);
  const shift = unit(rehash(rowHash, 5));
  const colEdge = (k: number) => {
    const wk = imod(k, n);
    const j = (unit(hash2(wk, wr + 31337, seed)) - 0.5) * 0.6 * irregularity;
    return (k + j + shift) / n;
  };
  const x = u * n - shift;
  let c = Math.floor(x);
  if (u < colEdge(c)) c -= 1;
  else if (u >= colEdge(c + 1)) c += 1;
  const x0 = colEdge(c);
  const x1 = colEdge(c + 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  out.lx = u - cx;
  out.ly = v - cy;
  out.hx = (x1 - x0) / 2;
  out.hy = (y1 - y0) / 2;
  out.id = hash2(imod(c, n), wr, seed ^ 0x51ed);
  out.row = wr;
  out.col = imod(c, n);
  out.kind = 0;
  return out;
}

/** Plank layout: `rows` boards across v, each row cut into `perRow` boards with a random offset. */
export function plankCell(
  u: number,
  v: number,
  rows: number,
  perRow: number,
  seed: number,
  out: CellSample,
): CellSample {
  const y = v * rows;
  const r = Math.floor(y);
  const wr = imod(r, rows);
  const fy = y - r;
  const shift = unit(hash2(wr, 77, seed));
  const x = u * perRow + shift;
  const c = Math.floor(x);
  const fx = x - c;
  out.lx = (fx - 0.5) / perRow;
  out.ly = (fy - 0.5) / rows;
  out.hx = 0.5 / perRow;
  out.hy = 0.5 / rows;
  out.row = wr;
  out.col = imod(c, perRow);
  out.id = hash2(out.col, wr, seed ^ 0x2b1d);
  out.kind = 0;
  return out;
}

export type TileLayout = 'grid' | 'offset' | 'hex' | 'checker';

/**
 * Tile layouts. For hex tiles `across` hexagons per row and an even number of rows chosen to
 * keep hexagons close to regular inside a square tile.
 * Returns cell sample plus, for hexagons, the hexagon apothem in `hx` (hy = hx).
 */
export function tileCell(
  u: number,
  v: number,
  across: number,
  down: number,
  layout: TileLayout,
  seed: number,
  out: CellSample,
): CellSample {
  if (layout === 'hex') {
    const rows = hexRows(across);
    const rowH = 1 / rows;
    const colW = 1 / across;
    const sy = hexStretch(across);
    const r0 = Math.floor(v * rows);
    let best = 1e9;
    for (let dr = -1; dr <= 1; dr++) {
      const r = r0 + dr;
      const wr = imod(r, rows);
      const off = wr % 2 === 1 ? 0.5 : 0;
      const c0 = Math.floor(u * across - off + 0.5);
      for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc;
        const cx = (c + off) * colW;
        const cy = (r + 0.5) * rowH;
        const d = sdHexagon(u - cx, v - cy, colW / 2, sy);
        if (d < best) {
          best = d;
          out.lx = u - cx;
          out.ly = v - cy;
          out.row = wr;
          out.col = imod(c, across);
        }
      }
    }
    out.hx = colW / 2;
    out.hy = colW / 2;
    out.id = hash2(out.col, out.row, seed);
    out.kind = 0;
    return out;
  }
  const rows = down;
  const y = v * rows;
  const r = Math.floor(y);
  const wr = imod(r, rows);
  const off = layout === 'offset' && wr % 2 === 1 ? 0.5 : 0;
  const x = u * across + off;
  const c = Math.floor(x);
  const wc = imod(c, across);
  out.lx = (x - c - 0.5) / across;
  out.ly = (y - r - 0.5) / rows;
  out.hx = 0.5 / across;
  out.hy = 0.5 / rows;
  out.row = wr;
  out.col = wc;
  out.id = hash2(wc, wr, seed);
  out.kind = layout === 'checker' ? (wc + wr) % 2 : 0;
  return out;
}

/** Number of hex rows (even) that best approximates regular hexagons for a given column count. */
export function hexRows(across: number): number {
  // Pointy-top hexagons: row spacing = 0.866 * column spacing  =>  rows ≈ across / 0.866.
  let rows = Math.round(across / 0.866);
  if (rows % 2 === 1) rows += 1;
  return Math.max(2, rows);
}

/**
 * Signed distance to the boundary of a pointy-top hexagon with apothem `a` (distance from
 * centre to flat side), with local offset (px, py) in UV units, stretched vertically by `sy`
 * to correct for the integer row approximation.
 */
export function sdHexagon(px: number, py: number, a: number, sy: number): number {
  const x = Math.abs(px);
  const y = Math.abs(py * sy);
  // Pointy-top: flat sides are vertical (left/right), apothem along x.
  return Math.max(x, x * 0.5 + y * 0.8660254) - a;
}

/** Vertical stretch that maps the integer hex row spacing onto regular hexagon spacing. */
export function hexStretch(across: number): number {
  const rows = hexRows(across);
  // Regular row spacing for column width w is 0.866 * w. Actual spacing is 1 / rows.
  return (0.8660254 / across) / (1 / rows);
}

/** Panel grid with optional half-panel offset of odd rows. */
export function panelCell(u: number, v: number, cols: number, rows: number, offsetRows: boolean, seed: number, out: CellSample): CellSample {
  const y = v * rows;
  const r = Math.floor(y);
  const wr = imod(r, rows);
  const off = offsetRows && wr % 2 === 1 ? 0.5 : 0;
  const x = u * cols + off;
  const c = Math.floor(x);
  const wc = imod(c, cols);
  out.lx = (x - c - 0.5) / cols;
  out.ly = (y - r - 0.5) / rows;
  out.hx = 0.5 / cols;
  out.hy = 0.5 / rows;
  out.row = wr;
  out.col = wc;
  out.id = hash2(wc, wr, seed);
  out.kind = 0;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cracks

const crackVor = makeVoronoiResult();

export interface CrackOptions {
  /** Voronoi cells per tile defining the crack network scale. */
  cells: number;
  /** 0..1 proportion of the network that is visible. */
  density: number;
  /** Crack half width in UV units. */
  width: number;
  /** Jaggedness of crack paths, 0..1. */
  jag: number;
  /** Octave limit helper for the current resolution. */
  octaves: (freq: number, wanted: number) => number;
}

/**
 * Periodic crack network. Returns crack strength in [0, 1] (1 at the crack centre).
 * Cracks follow Voronoi borders of a domain-warped coordinate system; a low-frequency mask
 * decides which segments are present so that density can be dialled from none to many.
 */
export function crackField(u: number, v: number, seed: number, o: CrackOptions): number {
  if (o.density <= 0.001) return 0;
  const wOct = o.octaves(8, 3);
  const wu = u + o.jag * 0.045 * fbm(u, v, 4, 2, seed + 11) + o.jag * 0.012 * fbm(u, v, 16, wOct, seed + 23);
  const wv = v + o.jag * 0.045 * fbm(u, v, 4, 2, seed + 37) + o.jag * 0.012 * fbm(u, v, 16, wOct, seed + 41);
  voronoi(wu, wv, o.cells, o.cells, seed + 101, 0.9, crackVor, true);
  const mask = fbm(u, v, 2, 3, seed + 59) * 0.5 + 0.5;
  const threshold = 1 - o.density;
  const vis = smoothstep(threshold - 0.06, threshold + 0.1, mask);
  if (vis <= 0) return 0;
  const wVar = 0.55 + 0.45 * (fbm(u, v, 8, 2, seed + 71) * 0.5 + 0.5);
  const w = Math.max(o.width * wVar * vis, 1e-6);
  return clamp01(1 - crackVor.edge / w) * vis;
}

// ---------------------------------------------------------------------------------------------
// Scratches

export interface ScratchOptions {
  /** Grid cells per tile used to scatter scratches. */
  cells: number;
  /** Scratches per cell. */
  perCell: number;
  /** Scratch length as a fraction of the cell size (max 2 with radius 2 search). */
  length: number;
  /** Main direction in radians and spread in radians. */
  angle: number;
  spread: number;
  /** Scratch half width in UV units. */
  width: number;
}

/**
 * Periodic scratch layer: short straight segments scattered on a wrapped grid. Distances are
 * evaluated in unwrapped coordinates around the sample, while segment parameters come from
 * wrapped cell indices, so scratches crossing the tile boundary continue on the opposite side.
 * Returns scratch strength in [0, 1].
 */
export function scratchField(u: number, v: number, seed: number, o: ScratchOptions): number {
  const g = o.cells;
  const x = u * g;
  const y = v * g;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const half = Math.min(o.length, 2) * 0.5;
  const R = half <= 1 ? 1 : 2;
  const wCells = o.width * g;
  let best = 0;
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const ci = xi + i;
      const cj = yi + j;
      const h0 = hash2(imod(ci, g), imod(cj, g), seed);
      for (let s = 0; s < o.perCell; s++) {
        const h = rehash(h0, s * 5 + 1);
        const cx = ci + unit(h);
        const cy = cj + unit(rehash(h, 2));
        const a = o.angle + (unit(rehash(h, 3)) - 0.5) * 2 * o.spread;
        const len = half * (0.45 + 0.55 * unit(rehash(h, 4)));
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        // Project sample onto the segment.
        const px = x - cx;
        const py = y - cy;
        const t = px * dx + py * dy;
        if (t < -len || t > len) continue;
        const perp = Math.abs(-px * dy + py * dx);
        if (perp > wCells * 1.5) continue;
        const along = 1 - (t / len) * (t / len); // taper towards the ends
        const strength = (0.35 + 0.65 * unit(rehash(h, 6))) * Math.sqrt(Math.max(0, along));
        const prof = clamp01(1 - perp / wCells);
        const val = prof * strength;
        if (val > best) best = val;
      }
    }
  }
  return best;
}

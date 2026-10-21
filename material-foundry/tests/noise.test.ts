import { describe, expect, it } from 'vitest';
import { billow, fbm, fbmAniso, gradNoise, makeVoronoiResult, ridged, valueNoise, voronoi } from '../src/engine/noise';
import { ashlarCell, brickCell, crackField, makeCell, plankCell, scratchField, tileCell, panelCell } from '../src/engine/patterns';
import { makeContext } from '../src/engine/fields';
import { mulberry32 } from '../src/engine/hash';

const rnd = mulberry32(12345);
const samples = Array.from({ length: 400 }, () => [rnd(), rnd()] as const);
const shifts = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [2, -3],
] as const;

function expectPeriodic(f: (u: number, v: number) => number, tol = 1e-9) {
  for (const [u, v] of samples) {
    const a = f(u, v);
    for (const [du, dv] of shifts) {
      const b = f(u + du, v + dv);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(a)));
    }
  }
}

describe('periodic noise primitives', () => {
  it('gradient and value noise repeat with their lattice period', () => {
    expectPeriodic((u, v) => gradNoise(u * 7, v * 5, 7, 5, 99));
    expectPeriodic((u, v) => valueNoise(u * 6, v * 6, 6, 6, 3));
  });

  it('fBm, anisotropic fBm, ridged and billow are periodic on the unit square', () => {
    expectPeriodic((u, v) => fbm(u, v, 3, 6, 11));
    expectPeriodic((u, v) => fbmAniso(u, v, 2, 48, 3, 7));
    expectPeriodic((u, v) => ridged(u, v, 4, 5, 21));
    expectPeriodic((u, v) => billow(u, v, 5, 4, 8));
  });

  it('domain warping with periodic warp fields stays periodic', () => {
    expectPeriodic((u, v) => {
      const wu = u + 0.1 * fbm(u, v, 2, 3, 1);
      const wv = v + 0.1 * fbm(u, v, 2, 3, 2);
      return fbm(wu, wv, 4, 4, 3);
    });
  });

  it('Voronoi distances, edges and cell ids are periodic', () => {
    const r = makeVoronoiResult();
    expectPeriodic((u, v) => voronoi(u, v, 7, 9, 5, 0.9, r, true).f1);
    expectPeriodic((u, v) => voronoi(u, v, 7, 9, 5, 0.9, r, true).edge);
    expectPeriodic((u, v) => voronoi(u, v, 7, 9, 5, 0.9, r, true).id);
  });

  it('Voronoi edge distance is exact on a regular grid (jitter 0)', () => {
    const r = makeVoronoiResult();
    // Cell borders of a 4x4 regular grid lie at multiples of 0.25.
    voronoi(0.3, 0.6, 4, 4, 1, 0, r, true);
    expect(r.edge).toBeCloseTo(0.05, 9);
  });

  it('noise is deterministic and seed-dependent', () => {
    expect(fbm(0.3, 0.7, 4, 5, 42)).toBe(fbm(0.3, 0.7, 4, 5, 42));
    expect(fbm(0.3, 0.7, 4, 5, 42)).not.toBe(fbm(0.3, 0.7, 4, 5, 43));
  });
});

describe('periodic layouts and feature generators', () => {
  const ctx = makeContext(512, 1, 1, () => {});
  it('brick bonds assign the same brick (id and local offset) at equivalent coordinates', () => {
    for (const bond of ['running', 'stack', 'english', 'flemish', 'basket'] as const) {
      const a = makeCell();
      const b = makeCell();
      const rows = bond === 'basket' ? 8 : 12;
      for (const [u, v] of samples) {
        brickCell(u, v, 4, rows, bond, 0.5, 7, a);
        for (const [du, dv] of shifts) {
          brickCell(u + du, v + dv, 4, rows, bond, 0.5, 7, b);
          expect(b.id).toBe(a.id);
          expect(b.lx).toBeCloseTo(a.lx, 9);
          expect(b.ly).toBeCloseTo(a.ly, 9);
        }
      }
    }
  });

  it('ashlar, plank, panel and tile layouts are periodic', () => {
    const a = makeCell();
    const b = makeCell();
    const layouts: ((u: number, v: number, c: ReturnType<typeof makeCell>) => void)[] = [
      (u, v, c) => ashlarCell(u, v, 5, 3, 0.8, 9, c),
      (u, v, c) => plankCell(u, v, 5, 2, 9, c),
      (u, v, c) => panelCell(u, v, 3, 4, true, 9, c),
      (u, v, c) => tileCell(u, v, 6, 6, 'grid', 9, c),
      (u, v, c) => tileCell(u, v, 4, 8, 'offset', 9, c),
      (u, v, c) => tileCell(u, v, 8, 8, 'hex', 9, c),
      (u, v, c) => tileCell(u, v, 4, 4, 'checker', 9, c),
    ];
    for (const layout of layouts) {
      for (const [u, v] of samples) {
        layout(u, v, a);
        for (const [du, dv] of shifts) {
          layout(u + du, v + dv, b);
          expect(b.id).toBe(a.id);
          expect(b.kind).toBe(a.kind);
          expect(b.lx).toBeCloseTo(a.lx, 7);
          expect(b.ly).toBeCloseTo(a.ly, 7);
        }
      }
    }
  });

  it('cracks and scratches wrap across the tile boundary', () => {
    expectPeriodic((u, v) => crackField(u, v, 3, { cells: 5, density: 0.8, width: 0.004, jag: 1, octaves: ctx.octaves }), 1e-7);
    expectPeriodic((u, v) => scratchField(u, v, 3, { cells: 6, perCell: 3, length: 1.8, angle: 0.2, spread: 3, width: 0.001 }), 1e-7);
  });
});

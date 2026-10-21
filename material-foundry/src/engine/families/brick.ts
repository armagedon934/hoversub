import { hexToLinear, type RGB } from '../color';
import { subSeed, unit, rehash } from '../hash';
import { clamp01, fbm, fbmAniso, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { brickCell, makeCell, sdRoundRect, type BrickBond } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, wearParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, edgeNoiseScale, mixRGB, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const brickFamily: FamilyDefinition = {
  id: 'brick_wall',
  label: 'Brick Wall',
  slug: 'brick_wall',
  description: 'Fired clay bricks in mortar with selectable bonds, mortar depth, worn edges and color variation.',
  params: [
    color('colorA', 'Brick color', '#9b4b32'),
    color('colorB', 'Brick variation', '#6f3426'),
    color('mortarColor', 'Mortar color', '#a39b8c'),
    select(
      'bond',
      'Bond / layout',
      [
        ['running', 'Running bond'],
        ['stack', 'Stack bond'],
        ['english', 'English bond'],
        ['flemish', 'Flemish bond'],
        ['basket', 'Basket weave'],
      ],
      'running',
      'pattern',
    ),
    range('bricksAcross', 'Bricks across', 2, 10, 4, 'pattern', { integer: true, help: 'Bricks (or pairs) per row across one texture tile. Sets brick width.' }),
    range('rows', 'Brick rows', 4, 24, 12, 'pattern', { integer: true, step: 2, help: 'Rows per tile (even). Sets brick height.' }),
    range('stagger', 'Stagger', 0, 0.5, 0.5, 'pattern', { visibleIf: (p) => p.bond === 'running', help: 'Offset of alternate rows, as a fraction of a brick.' }),
    range('mortarWidth', 'Mortar width', 0, 1, 0.4, 'pattern'),
    range('mortarDepth', 'Mortar depth', 0, 1, 0.55, 'pattern'),
    styleParam(),
    reliefParam(),
    detailParam(0.5),
    roughnessParam(0.5),
    range('colorVariation', 'Color variation', 0, 1, 0.5, 'surface'),
    wearParam('Edge wear & chips', 0.35),
    range('grime', 'Grime & streaks', 0, 1, 0.25, 'wear'),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'colorVariation', amount: 0.2 },
    { key: 'wear', amount: 0.2 },
    { key: 'grime', amount: 0.2 },
    { key: 'detail', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const cM = hexToLinear(str(p, 'mortarColor'));
    const bond = str(p, 'bond', 'running') as BrickBond;
    let cols = Math.round(num(p, 'bricksAcross', 4));
    let rows = Math.round(num(p, 'rows', 12));
    if (rows % 2 === 1) rows += 1;
    if (bond === 'basket') {
      // The checkerboard of brick pairs needs even block counts in both directions to tile.
      if (cols % 2 === 1) cols += 1;
      if (rows % 4 !== 0) rows += 4 - (rows % 4);
    }
    const stagger = num(p, 'stagger', 0.5);
    const mw = lerp(0.0012, 0.009, num(p, 'mortarWidth', 0.4));
    const mortarH = lerp(0.62, 0.08, num(p, 'mortarDepth', 0.55));
    const detail = num(p, 'detail', 0.5);
    const rbias = num(p, 'roughness', 0.5);
    const cvar = num(p, 'colorVariation', 0.5);
    const wear = num(p, 'wear', 0.35);
    const grime = num(p, 'grime', 0.25);
    const edgeN = edgeNoiseScale(nat);
    const bevelW = (0.0018 + wear * 0.0035) * bevelScale(nat);
    out.depth = 0.022;

    const sEdge = subSeed(seed, 'edge');
    const sChip = subSeed(seed, 'chip');
    const sFace = subSeed(seed, 'face');
    const sCol = subSeed(seed, 'color');
    const sGrime = subSeed(seed, 'grime');
    const sPit = subSeed(seed, 'pits');
    const cell = makeCell();
    const vor = makeVoronoiResult();
    const oEdge = styledOctaves(ctx, 24, 3);
    const oFace = styledOctaves(ctx, 16, 5);
    const oCol = styledOctaves(ctx, 12, 4);
    const pitCells = 64;
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N + ctx.offsetV;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N + ctx.offsetU;
        const i = (y - ctx.y0) * N + x;
        brickCell(u, v, cols, rows, bond, stagger, seed, cell);
        const id = cell.id;
        const r1 = unit(rehash(id, 1));
        const r2 = unit(rehash(id, 2));
        const r3 = unit(rehash(id, 3)) - 0.5;
        const r4 = unit(rehash(id, 4)) - 0.5;
        const r5 = unit(rehash(id, 5));
        // Brick shape: rounded rectangle inset by half the mortar joint, with irregular edges.
        let sdf = sdRoundRect(cell.lx, cell.ly, cell.hx - mw, cell.hy - mw, bevelW * 0.8);
        sdf += edgeN * 0.0016 * fbm(u, v, 24, oEdge, sEdge);
        const chipN = fbm(u, v, 20, 3, sChip) * 0.5 + 0.5;
        const chip = smoothstep(0.62 - wear * 0.22, 0.8, chipN) * wear * 0.006 * lerp(0.5, 1, nat);
        sdf += chip;
        const inside = -sdf;
        const prof = bevelProfile(inside, bevelW);

        // Face height: slight tilt per brick, broad unevenness and fine pitting.
        const tilt = (r3 * cell.lx / cell.hx + r4 * cell.ly / cell.hy) * 0.035;
        const faceN = fbm(u, v, 16, oFace, sFace);
        let pit = 0;
        if (detail > 0.01 && nat > 0.2 && N >= 256) {
          voronoi(u, v, pitCells, pitCells, sPit, 1, vor, false);
          const pr = 0.18 * (unit(vor.id) < 0.35 ? 1 : 0);
          pit = (1 - smoothstep(0, pr / pitCells, vor.f1)) * detail * nat;
        }
        const faceTop = 0.86 + tilt + faceN * 0.05 * (0.4 + detail) - pit * 0.08;
        const mortarN = fbm(u, v, 48, styledOctaves(ctx, 48, 3), sFace + 9);
        const mH = mortarH + mortarN * 0.04;
        const h = mH + (faceTop - mH) * prof;

        // Color.
        const t = tone(clamp01(r1 * (0.4 + cvar)), nat, 3);
        const base = mixRGB(cA, cB, t);
        const bright = 1 + (r2 - 0.5) * 0.45 * cvar;
        const mott = fbm(u, v, 12, oCol, sCol) * 0.5 + 0.5;
        const mottT = tone(mott, nat, 3);
        // Flashed (darkened) ends on some bricks.
        let flash = 0;
        if (r5 < 0.18 * cvar) {
          const e = cell.lx / cell.hx;
          flash = smoothstep(0.2, 1, r3 > 0 ? e : -e) * 0.45;
        }
        const k = bright * (0.82 + 0.3 * mottT) * (1 - flash) * (1 - pit * 0.35);
        let br = base[0] * k;
        let bg = base[1] * k;
        let bb = base[2] * k;
        // Worn, slightly dusty edges where the bevel and chips expose softer clay.
        const edgeWear = (1 - prof) * wear * 0.35;
        br = lerp(br, cM[0] * 0.9, edgeWear * 0.5);
        bg = lerp(bg, cM[1] * 0.9, edgeWear * 0.5);
        bb = lerp(bb, cM[2] * 0.9, edgeWear * 0.5);

        const mortarGrit = 0.82 + 0.3 * (mortarN * 0.5 + 0.5);
        const m = smoothstep(0, 0.6, prof);
        c[0] = lerp(cM[0] * mortarGrit, br, m);
        c[1] = lerp(cM[1] * mortarGrit, bg, m);
        c[2] = lerp(cM[2] * mortarGrit, bb, m);

        // Grime: broad soiling, vertical rain streaks, dirt collecting in the joints.
        if (grime > 0) {
          const g1 = fbm(u, v, 3, 3, sGrime) * 0.5 + 0.5;
          const streak = fbmAniso(u, v, 24, 2, 3, sGrime + 5) * 0.5 + 0.5;
          const dirt = clamp01(grime * (smoothstep(0.45, 0.8, g1) * 0.6 + smoothstep(0.5, 0.85, streak) * 0.5 + (1 - m) * 0.4));
          const dk = 1 - dirt * 0.45;
          c[0] *= dk;
          c[1] *= dk * 0.98;
          c[2] *= dk * 0.95;
        }

        const roughFace = 0.78 + 0.1 * faceN + pit * 0.1;
        const roughMortar = 0.93;
        const r = lerp(roughMortar, roughFace, m);
        writePixel(out, i, c, h, roughBias(r, rbias), 0);
      }
    }
  },
};

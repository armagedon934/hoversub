import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { clamp01, fbm, lerp, ridged, smoothstep } from '../noise';
import { crackField, hexStretch, makeCell, sdHexagon, sdRoundRect, tileCell, type TileLayout } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, wearParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, mixRGB, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const tilesFamily: FamilyDefinition = {
  id: 'tiles',
  label: 'Ceramic & Stone Tiles',
  slug: 'tiles',
  description: 'Glazed ceramic or matte stone tiles with grout, bevelled edges, per-tile variation and optional damage.',
  params: [
    color('colorA', 'Tile color', '#e8e2d6'),
    color('colorB', 'Tile variation', '#c4b9a6'),
    color('groutColor', 'Grout color', '#8e897f'),
    select(
      'layout',
      'Layout',
      [
        ['grid', 'Square grid'],
        ['offset', 'Offset rows'],
        ['hex', 'Hexagons'],
        ['checker', 'Checkerboard'],
      ],
      'grid',
      'pattern',
    ),
    range('tilesAcross', 'Tiles across', 2, 16, 6, 'pattern', { integer: true }),
    range('tilesDown', 'Tiles down', 2, 32, 6, 'pattern', {
      integer: true,
      visibleIf: (p) => p.layout === 'grid' || p.layout === 'offset',
      help: 'Rows per tile. Use twice the "across" count for 2:1 subway tiles.',
    }),
    range('groutWidth', 'Grout width', 0, 1, 0.35, 'pattern'),
    range('bevel', 'Edge bevel', 0, 1, 0.5, 'pattern'),
    select('finish', 'Finish', [['glazed', 'Glazed ceramic'], ['stone', 'Matte stone'], ['marble', 'Polished marble']], 'glazed', 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.4),
    roughnessParam(0.5),
    range('colorVariation', 'Color variation', 0, 1, 0.35, 'surface'),
    range('unevenness', 'Surface unevenness', 0, 1, 0.3, 'surface'),
    wearParam('Damage (chips & cracks)', 0.1),
    range('groutDirt', 'Grout dirt', 0, 1, 0.3, 'wear'),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'colorVariation', amount: 0.15 },
    { key: 'wear', amount: 0.12 },
    { key: 'unevenness', amount: 0.15 },
    { key: 'groutDirt', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const cG = hexToLinear(str(p, 'groutColor'));
    const layout = str(p, 'layout', 'grid') as TileLayout;
    let across = Math.round(num(p, 'tilesAcross', 6));
    // Alternating patterns need even counts to tile seamlessly.
    if (layout === 'checker' && across % 2 === 1) across += 1;
    let down = layout === 'grid' || layout === 'offset' ? Math.round(num(p, 'tilesDown', across)) : across;
    if (layout === 'offset' && down % 2 === 1) down += 1;
    const gw = lerp(0.0008, 0.006, num(p, 'groutWidth', 0.35));
    const bevel = num(p, 'bevel', 0.5);
    const finish = str(p, 'finish', 'glazed');
    const detail = num(p, 'detail', 0.4);
    const rbias = num(p, 'roughness', 0.5);
    const cvar = num(p, 'colorVariation', 0.35);
    const unev = num(p, 'unevenness', 0.3);
    const dmg = num(p, 'wear', 0.1);
    const gDirt = num(p, 'groutDirt', 0.3);
    const bevelW = lerp(0.0008, 0.006, bevel) * bevelScale(nat);
    const sy = hexStretch(across);
    out.depth = 0.012;

    const sE = subSeed(seed, 'edge');
    const sF = subSeed(seed, 'face');
    const sV = subSeed(seed, 'vein');
    const sC = subSeed(seed, 'crack');
    const sG = subSeed(seed, 'grout');
    const cell = makeCell();
    const oF = styledOctaves(ctx, 8, 5);
    const oV = styledOctaves(ctx, 3, 6);
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N + ctx.offsetV;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N + ctx.offsetU;
        const i = (y - ctx.y0) * N + x;
        tileCell(u, v, across, down, layout, seed, cell);
        const id = cell.id;
        const r1 = unit(rehash(id, 1));
        const r2 = unit(rehash(id, 2));
        const r3 = unit(rehash(id, 3)) - 0.5;
        const r4 = unit(rehash(id, 4)) - 0.5;
        const damaged = unit(rehash(id, 6)) < dmg * 0.7;
        let sdf =
          layout === 'hex'
            ? sdHexagon(cell.lx, cell.ly, cell.hx - gw, sy)
            : sdRoundRect(cell.lx, cell.ly, cell.hx - gw, cell.hy - gw, bevelW * 0.6);
        // Chips along edges of damaged tiles.
        if (dmg > 0) {
          const chipN = fbm(u, v, 24, 3, sE) * 0.5 + 0.5;
          sdf += smoothstep(0.6, 0.8, chipN) * dmg * 0.006 * (damaged ? 1.5 : 0.4) * lerp(0.4, 1, nat);
        }
        const prof = bevelProfile(-sdf, bevelW);
        const lxN = cell.lx / cell.hx;
        const lyN = cell.ly / cell.hy;
        const faceN = fbm(u, v, 8, oF, sF);
        let top = 0.8 + (r3 * lxN + r4 * lyN) * 0.03 * unev + faceN * 0.04 * unev;
        let crack = 0;
        const cleft = finish === 'stone' ? ridged(u, v, 10, styledOctaves(ctx, 10, 4), sF + 13) : 0;
        if (damaged) {
          crack = crackField(u, v, sC, { cells: Math.max(3, across), density: 0.85, width: 0.0012, jag: 0.8, octaves: ctx.octaves });
          crack *= smoothstep(0.3, 1, prof);
          top -= crack * 0.3;
        }
        const h = 0.2 + (top - 0.2 + cleft * 0.07 * unev) * prof + (1 - prof) * 0.03 * fbm(u, v, 48, styledOctaves(ctx, 48, 2), sG);

        // Tile color.
        let tT = tone(clamp01(r1 * (0.25 + cvar)), nat, 3);
        let base: RGB = layout === 'checker' ? (cell.kind === 1 ? cB : cA) : mixRGB(cA, cB, tT);
        if (layout === 'checker') tT = r1 * cvar * 0.3;
        const bright = 1 + (r2 - 0.5) * 0.18 * cvar;
        let rough: number;
        let k = bright;
        if (finish === 'glazed') {
          // Glaze pools slightly darker/more saturated toward the bevel; tiny pinholes.
          const pool = (1 - smoothstep(0, bevelW * 1.8, -sdf)) * 0.12;
          k *= 1 - pool + faceN * 0.02 * detail;
          rough = 0.1 + 0.04 * (faceN * 0.5 + 0.5) + r2 * 0.03;
        } else if (finish === 'stone') {
          const mott = tone(fbm(u, v, 6, oF, sF + 3) * 0.5 + 0.5, nat, 3);
          k *= 0.78 + 0.4 * mott;
          base = mixRGB(base, cB, (1 - mott) * 0.35);
          rough = 0.72 + 0.1 * faceN;
        } else {
          // Marble: soft clouds and sharp veins, continuous across tiles of one slab.
          const vein = ridged(u + 0.1 * fbm(u, v, 2, 3, sV + 1), v, 3, oV, sV);
          const vt = smoothstep(0.7, 0.98, vein);
          base = mixRGB(base, cB, vt * 0.8);
          k *= 0.95 + 0.08 * faceN;
          rough = 0.12 + 0.04 * vt;
        }
        k *= 1 - crack * 0.55;
        const m = smoothstep(0, 0.5, prof);
        const gn = fbm(u, v, 64, styledOctaves(ctx, 64, 2), sG) * 0.5 + 0.5;
        const gd = clamp01(gDirt * (0.5 + 0.8 * (fbm(u, v, 4, 3, sG + 2) * 0.5 + 0.5)));
        const gk = (0.88 + 0.2 * gn) * (1 - gd * 0.45);
        c[0] = lerp(cG[0] * gk, base[0] * k, m);
        c[1] = lerp(cG[1] * gk, base[1] * k, m);
        c[2] = lerp(cG[2] * gk, base[2] * k, m);
        rough = lerp(0.9, rough + crack * 0.3, m);
        writePixel(out, i, c, h, roughBias(rough, rbias), 0);
      }
    }
  },
};

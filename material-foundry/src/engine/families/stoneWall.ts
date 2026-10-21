import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { billow, clamp01, fbm, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { ashlarCell, crackField, makeCell, sdRoundRect } from '../patterns';
import { color, crackParams, detailParam, range, reliefParam, roughnessParam, select, styleParam, wearParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, edgeNoiseScale, mixRGB, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const stoneWallFamily: FamilyDefinition = {
  id: 'stone_wall',
  label: 'Stone Block Wall',
  slug: 'stone_wall',
  description: 'Dressed ashlar courses or irregular rubble stones set in recessed mortar, with chips and cracks.',
  params: [
    color('colorA', 'Stone color', '#8c857a'),
    color('colorB', 'Stone variation', '#6c675f'),
    color('mortarColor', 'Mortar color', '#5a554d'),
    select('layout', 'Layout', [['ashlar', 'Ashlar courses'], ['rubble', 'Rubble stones']], 'ashlar', 'pattern'),
    range('rows', 'Courses', 3, 10, 5, 'pattern', { integer: true, visibleIf: (p) => p.layout === 'ashlar' }),
    range('blocksPerRow', 'Blocks per course', 2, 8, 3, 'pattern', { integer: true, visibleIf: (p) => p.layout === 'ashlar' }),
    range('stones', 'Stone count', 3, 12, 6, 'pattern', { integer: true, visibleIf: (p) => p.layout === 'rubble', help: 'Stones across one tile.' }),
    range('irregularity', 'Irregularity', 0, 1, 0.5, 'pattern'),
    range('mortarWidth', 'Mortar width', 0, 1, 0.4, 'pattern'),
    range('mortarDepth', 'Mortar depth', 0, 1, 0.7, 'pattern'),
    styleParam(),
    reliefParam(),
    detailParam(0.55),
    roughnessParam(0.5),
    range('faceRoughness', 'Face unevenness', 0, 1, 0.5, 'surface'),
    range('colorVariation', 'Color variation', 0, 1, 0.5, 'surface'),
    wearParam('Chips & edge wear', 0.35),
    ...crackParams(0.2, 0.35),
    range('dirt', 'Dirt in recesses', 0, 1, 0.35, 'wear'),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'irregularity', amount: 0.2 },
    { key: 'colorVariation', amount: 0.2 },
    { key: 'wear', amount: 0.2 },
    { key: 'crackDensity', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const cM = hexToLinear(str(p, 'mortarColor'));
    const layout = str(p, 'layout', 'ashlar');
    const rows = Math.round(num(p, 'rows', 5));
    const perRow = Math.round(num(p, 'blocksPerRow', 3));
    const stones = Math.round(num(p, 'stones', 6));
    const irr = num(p, 'irregularity', 0.5);
    const mw = lerp(0.0015, 0.011, num(p, 'mortarWidth', 0.4));
    const mortarH = lerp(0.55, 0.05, num(p, 'mortarDepth', 0.7));
    const detail = num(p, 'detail', 0.55);
    const rbias = num(p, 'roughness', 0.5);
    const faceRough = num(p, 'faceRoughness', 0.5);
    const cvar = num(p, 'colorVariation', 0.5);
    const wear = num(p, 'wear', 0.35);
    const crackD = num(p, 'crackDensity', 0.2);
    const crackW = lerp(0.0008, 0.004, num(p, 'crackWidth', 0.35));
    const dirt = num(p, 'dirt', 0.35);
    const edgeN = edgeNoiseScale(nat);
    const bevelW = (0.004 + wear * 0.006) * bevelScale(nat);
    out.depth = 0.03;

    const sEdge = subSeed(seed, 'edge');
    const sFace = subSeed(seed, 'face');
    const sCol = subSeed(seed, 'col');
    const sCrack = subSeed(seed, 'crack');
    const sChip = subSeed(seed, 'chip');
    const sRub = subSeed(seed, 'rubble');
    const cell = makeCell();
    const vor = makeVoronoiResult();
    const oEdge = styledOctaves(ctx, 12, 4);
    const oFace = styledOctaves(ctx, 6, 6);
    const oCol = styledOctaves(ctx, 8, 5);
    const ny = Math.max(2, Math.round(stones * 1.35));
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        let sdf: number;
        let id: number;
        let tiltX = 0;
        let tiltY = 0;
        let cellScale: number;
        if (layout === 'rubble') {
          const wu = u + 0.012 * irr * fbm(u, v, 6, 2, sRub);
          const wv = v + 0.012 * irr * fbm(u, v, 6, 2, sRub + 3);
          voronoi(wu, wv, stones, ny, sRub + 7, lerp(0.35, 0.95, irr), vor, true);
          sdf = mw - vor.edge;
          id = vor.id;
          cellScale = 0.5 / stones;
          tiltX = -vor.dx / cellScale;
          tiltY = -vor.dy / cellScale;
        } else {
          ashlarCell(u, v, rows, perRow, irr, seed, cell);
          const corner = (0.002 + 0.004 * irr) * bevelScale(nat);
          sdf = sdRoundRect(cell.lx, cell.ly, cell.hx - mw, cell.hy - mw, corner);
          id = cell.id;
          cellScale = Math.min(cell.hx, cell.hy);
          tiltX = cell.lx / cell.hx;
          tiltY = cell.ly / cell.hy;
        }
        sdf += edgeN * 0.0035 * fbm(u, v, 12, oEdge, sEdge);
        const chipN = fbm(u, v, 14, 3, sChip) * 0.5 + 0.5;
        sdf += smoothstep(0.58 - wear * 0.2, 0.78, chipN) * wear * 0.012 * lerp(0.4, 1, nat);

        const r1 = unit(rehash(id, 1));
        const r2 = unit(rehash(id, 2));
        const r3 = unit(rehash(id, 3)) - 0.5;
        const r4 = unit(rehash(id, 4)) - 0.5;
        const prof = bevelProfile(-sdf, bevelW);

        // Stone face: broad bulge toward the centre, per-stone tilt, chiselled unevenness.
        const bulge = layout === 'rubble' ? 1 - Math.min(1, (tiltX * tiltX + tiltY * tiltY) * 0.5) : 1 - 0.25 * (tiltX * tiltX + tiltY * tiltY);
        const faceN = fbm(u, v, 6, oFace, sFace);
        const chisel = billow(u, v, 10, styledOctaves(ctx, 10, 3), sFace + 5);
        let faceTop = 0.72 + 0.12 * bulge + (r3 * tiltX + r4 * tiltY) * 0.06;
        faceTop += faceRough * (faceN * 0.1 + (chisel - 0.35) * 0.08 * nat);
        faceTop += detail * 0.035 * fbm(u, v, 48, styledOctaves(ctx, 48, 3), sFace + 9);

        // Cracks cut into the stone faces only.
        let crack = 0;
        if (crackD > 0) {
          crack = crackField(u, v, sCrack, { cells: 5, density: crackD, width: crackW, jag: lerp(0.4, 1, nat), octaves: ctx.octaves }) * smoothstep(0.5, 1, prof);
        }
        faceTop -= crack * 0.35;
        const mortarN = fbm(u, v, 40, styledOctaves(ctx, 40, 3), sFace + 17);
        const mH = mortarH + 0.05 * mortarN;
        const h = mH + (faceTop - mH) * prof;

        // Color: per-stone hue/value choice, mineral mottling, darkened cracks and recesses.
        const t = tone(clamp01(r1 * (0.3 + cvar)), nat, 3);
        const base = mixRGB(cA, cB, t);
        const mott = tone(fbm(u, v, 8, oCol, sCol) * 0.5 + 0.5, nat, 3);
        const speck = detail * nat * (fbm(u, v, 64, ctx.octaves(64, 2), sCol + 3) > 0.45 ? 1 : 0);
        const k = (1 + (r2 - 0.5) * 0.35 * cvar) * (0.85 + 0.28 * mott) * (1 - 0.15 * speck) * (1 - crack * 0.5);
        const m = smoothstep(0.0, 0.5, prof);
        const grit = 0.85 + 0.25 * (mortarN * 0.5 + 0.5);
        c[0] = lerp(cM[0] * grit, base[0] * k, m);
        c[1] = lerp(cM[1] * grit, base[1] * k, m);
        c[2] = lerp(cM[2] * grit, base[2] * k, m);
        if (dirt > 0) {
          const low = clamp01(1 - (h - mortarH) / 0.35);
          const dn = fbm(u, v, 5, 3, sCol + 11) * 0.5 + 0.5;
          const d = clamp01(dirt * (low * 0.7 + smoothstep(0.55, 0.85, dn) * 0.4));
          const dk = 1 - 0.45 * d;
          c[0] *= dk;
          c[1] *= dk * 0.97;
          c[2] *= dk * 0.92;
        }
        const roughFace = 0.8 + 0.08 * faceN - 0.1 * speck;
        const r = lerp(0.94, roughFace, m);
        writePixel(out, i, c, h, roughBias(r, rbias), 0);
      }
    }
  },
};

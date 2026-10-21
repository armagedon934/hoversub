import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { clamp01, fbm, fbmAniso, gradNoise, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { crackField } from '../patterns';
import { color, crackParams, detailParam, range, reliefParam, roughnessParam, select, styleParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const concreteFamily: FamilyDefinition = {
  id: 'concrete',
  label: 'Concrete',
  slug: 'concrete',
  description: 'Cast concrete with pores, exposed aggregate, water stains, optional formwork marks and cracks.',
  params: [
    color('colorA', 'Concrete color', '#9d9a93'),
    color('colorB', 'Stain color', '#5c5a54'),
    color('aggregateColor', 'Aggregate color', '#8a7f72'),
    range('scale', 'Mottling scale', 1, 6, 2, 'pattern', { integer: true }),
    select('formwork', 'Formwork marks', [['none', 'None'], ['panels', 'Panels & tie holes'], ['boards', 'Board-formed']], 'none', 'pattern'),
    range('pores', 'Pores & bug holes', 0, 1, 0.4, 'surface'),
    range('aggregate', 'Exposed aggregate', 0, 1, 0.2, 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.5),
    roughnessParam(0.5),
    range('stains', 'Stains & streaks', 0, 1, 0.35, 'wear'),
    ...crackParams(0.15, 0.3),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'stains', amount: 0.2 },
    { key: 'pores', amount: 0.15 },
    { key: 'aggregate', amount: 0.15 },
    { key: 'crackDensity', amount: 0.12 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cS = hexToLinear(str(p, 'colorB'));
    const cG = hexToLinear(str(p, 'aggregateColor'));
    const s = Math.round(num(p, 'scale', 2));
    const form = str(p, 'formwork', 'none');
    const pores = num(p, 'pores', 0.4);
    const agg = num(p, 'aggregate', 0.2);
    const detail = num(p, 'detail', 0.5);
    const rbias = num(p, 'roughness', 0.5);
    const stains = num(p, 'stains', 0.35);
    const crackD = num(p, 'crackDensity', 0.15);
    const crackW = lerp(0.0006, 0.003, num(p, 'crackWidth', 0.3));
    out.depth = 0.012;

    const sM = subSeed(seed, 'mottle');
    const sP = subSeed(seed, 'pores');
    const sP2 = subSeed(seed, 'bugholes');
    const sA = subSeed(seed, 'agg');
    const sSt = subSeed(seed, 'stain');
    const sC = subSeed(seed, 'crack');
    const sF = subSeed(seed, 'form');
    const vor = makeVoronoiResult();
    const oM = styledOctaves(ctx, 2 * s, 6);
    const oF = styledOctaves(ctx, 64, 3);
    const c: RGB = [0, 0, 0];
    const boards = 8;

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        const mott = fbm(u, v, 2 * s, oM, sM);
        const cloud = fbm(u, v, 1, 3, sM + 5);
        let h = 0.62 + 0.04 * mott + 0.03 * cloud;
        const fine = fbm(u, v, 64, oF, sM + 9);
        h += 0.03 * fine * detail;
        let k = 1 + 0.12 * tone(mott * 0.5 + 0.5, nat, 4) - 0.06 + 0.06 * cloud;
        let rough = 0.82 + 0.06 * fine;
        let r0 = cA[0];
        let g0 = cA[1];
        let b0 = cA[2];

        // Formwork imprint.
        if (form === 'panels') {
          const gx = Math.min(Math.abs(u - 0.5), u, 1 - u); // seams at u = 0 / 0.5
          const gy = Math.min(Math.abs(v - 0.5), v, 1 - v);
          const seam = 1 - smoothstep(0.0008, 0.0022, Math.min(gx, gy));
          const lip = (1 - smoothstep(0.0, 0.006, Math.min(gx, gy))) * 0.5;
          h += lip * 0.04 - seam * 0.12;
          k *= 1 - seam * 0.25;
          // Tie holes: 2x2 per panel (panel = half tile).
          const tu = (u * 4) % 1;
          const tv = (v * 4) % 1;
          const dx = (tu - 0.5) / 4;
          const dy = (tv - 0.5) / 4;
          const d = Math.sqrt(dx * dx + dy * dy);
          const hole = 1 - smoothstep(0.006, 0.0075, d);
          const ring = (1 - smoothstep(0.0075, 0.016, d)) * (1 - hole);
          h -= hole * 0.3;
          k *= 1 - hole * 0.55 - ring * 0.12;
          rough += ring * 0.05;
        } else if (form === 'boards') {
          const bv = v * boards;
          const bi = Math.floor(bv);
          const fr = bv - bi;
          const step = (unit(rehash(subSeed(sF, 'b'), (bi % boards + boards) % boards)) - 0.5) * 0.08;
          const joint = 1 - smoothstep(0.0, 0.03, Math.min(fr, 1 - fr));
          const grain = fbmAniso(u, v, 3, 96, styledOctaves(ctx, 96, 2), sF + bi) * 0.5;
          h += step + grain * 0.035 - joint * 0.06;
          k *= 1 + step * 1.4 + grain * 0.08 - joint * 0.12;
        }

        // Pores and bug holes (small sharp recesses).
        let pore = 0;
        if (pores > 0 && N >= 128) {
          voronoi(u, v, 56, 56, sP, 1, vor, false);
          if (unit(vor.id) < pores * 0.6) {
            const rr = (0.08 + 0.18 * unit(rehash(vor.id, 2))) / 56;
            pore = 1 - smoothstep(rr * 0.5, rr, vor.f1);
          }
          voronoi(u, v, 16, 16, sP2, 1, vor, false);
          if (unit(vor.id) < pores * 0.35) {
            const rr = (0.06 + 0.12 * unit(rehash(vor.id, 2))) / 16;
            pore = Math.max(pore, 1 - smoothstep(rr * 0.6, rr, vor.f1));
          }
          pore *= lerp(0.5, 1, nat);
        }
        h -= pore * 0.28;
        k *= 1 - pore * 0.4;
        rough += pore * 0.08;

        // Exposed aggregate stones.
        let stone = 0;
        if (agg > 0) {
          voronoi(u, v, 22, 22, sA, 0.9, vor, false);
          const sel = unit(vor.id) < 0.25 + agg * 0.6;
          if (sel) {
            const rr = (0.22 + 0.2 * unit(rehash(vor.id, 3))) / 22;
            const edgeN = 1 + 0.25 * gradNoise(u * 64, v * 64, 64, 64, sA + 7) * nat;
            stone = (1 - smoothstep(rr * 0.75, rr, vor.f1 * edgeN)) * smoothstep(0, 0.6, agg + 0.1);
            if (stone > 0) {
              const tint = unit(rehash(vor.id, 5));
              const sc = 0.7 + 0.6 * tint;
              const mixT = stone * Math.min(1, agg * 1.6);
              r0 = lerp(r0, cG[0] * sc, mixT);
              g0 = lerp(g0, cG[1] * sc, mixT);
              b0 = lerp(b0, cG[2] * sc * (0.9 + 0.2 * tint), mixT);
              h += stone * 0.06 * agg;
              rough -= stone * 0.2 * agg;
            }
          }
        }

        // Cracks.
        let crack = 0;
        if (crackD > 0) {
          crack = crackField(u, v, sC, { cells: 4, density: crackD, width: crackW, jag: lerp(0.5, 1, nat), octaves: ctx.octaves });
          h -= crack * 0.4;
          k *= 1 - crack * 0.55;
        }

        // Stains: broad damp patches plus vertical run-off streaks.
        let stain = 0;
        if (stains > 0) {
          const patch = smoothstep(0.52, 0.85, fbm(u + 0.05 * cloud, v, 3, 4, sSt) * 0.5 + 0.5);
          const streak = smoothstep(0.55, 0.9, fbmAniso(u, v, 28, 2, 3, sSt + 3) * 0.5 + 0.5) * smoothstep(0.3, 0.7, fbm(u, v, 2, 2, sSt + 4) * 0.5 + 0.5);
          stain = clamp01(stains * (patch * 0.8 + streak * 0.9));
          stain = tone(stain, nat, 3);
        }
        c[0] = lerp(r0 * k, cS[0], stain * 0.6);
        c[1] = lerp(g0 * k, cS[1], stain * 0.6);
        c[2] = lerp(b0 * k, cS[2], stain * 0.6);
        rough -= stain * 0.12;
        writePixel(out, i, c, h, roughBias(rough, rbias), 0);
      }
    }
  },
};

import { hexToLinear, type RGB } from '../color';
import { hash1, imod, subSeed, unit } from '../hash';
import { clamp01, fbm, lerp, makeVoronoiResult, ridged, smoothstep, voronoi } from '../noise';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { mixRGB, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const rockFamily: FamilyDefinition = {
  id: 'rough_rock',
  label: 'Rough Rock',
  slug: 'rough_rock',
  description: 'Natural rock with broad fractured forms, sedimentary layering, mineral veins and fine grain.',
  params: [
    color('colorA', 'Rock color', '#6b6259'),
    color('colorB', 'Light mineral', '#9c9081'),
    color('colorC', 'Vein & speck color', '#d6cfc2'),
    range('scale', 'Form scale', 1, 6, 2, 'pattern', { integer: true, help: 'Number of large rock forms across the tile.' }),
    range('strata', 'Layering', 0, 1, 0.4, 'pattern'),
    select('strataDir', 'Layer direction', [['h', 'Horizontal'], ['d', 'Diagonal']], 'h', 'pattern', { visibleIf: (p) => (p.strata as number) > 0 }),
    range('sharpness', 'Fracture sharpness', 0, 1, 0.55, 'pattern'),
    range('veins', 'Mineral veins', 0, 1, 0.2, 'pattern'),
    range('specks', 'Mineral specks', 0, 1, 0.35, 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.6),
    roughnessParam(0.5),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'strata', amount: 0.15 },
    { key: 'sharpness', amount: 0.15 },
    { key: 'veins', amount: 0.15 },
    { key: 'specks', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const cC = hexToLinear(str(p, 'colorC'));
    const s = Math.round(num(p, 'scale', 2));
    const strata = num(p, 'strata', 0.4);
    const diag = str(p, 'strataDir', 'h') === 'd';
    const sharp = num(p, 'sharpness', 0.55);
    const veins = num(p, 'veins', 0.2);
    const specks = num(p, 'specks', 0.35);
    const detail = num(p, 'detail', 0.6);
    const rbias = num(p, 'roughness', 0.5);
    out.depth = 0.05;

    const sW = subSeed(seed, 'warp');
    const sB = subSeed(seed, 'base');
    const sV = subSeed(seed, 'vein');
    const sS = subSeed(seed, 'speck');
    const sG = subSeed(seed, 'grain');
    const sL = subSeed(seed, 'layer');
    const vor = makeVoronoiResult();
    const f0 = 2 * s;
    const oBase = styledOctaves(ctx, f0, 7);
    const oGrain = styledOctaves(ctx, 32, 4);
    const layers = 7 * s;
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        // Domain warp keeps periodicity because the warp field itself tiles.
        const wu = u + 0.07 * fbm(u, v, s, 3, sW);
        const wv = v + 0.07 * fbm(u, v, s, 3, sW + 1);
        const smooth = fbm(wu, wv, f0, oBase, sB) * 0.5 + 0.5;
        const rid = ridged(wu, wv, f0, oBase, sB + 3);
        let h = lerp(smooth, rid * 0.9 + 0.05, sharp);

        // Sedimentary layering: periodic bands with a terraced (ledge) profile.
        let band = 0;
        let bandId = 0;
        if (strata > 0) {
          const phase = layers * (diag ? wu + wv : wv) + 1.5 * fbm(u, v, s, 3, sL);
          bandId = Math.floor(phase);
          const fr = phase - bandId;
          const ledge = smoothstep(0.0, lerp(0.25, 0.6, nat), fr) * (1 - smoothstep(0.85, 1.0, fr) * 0.6);
          band = ledge;
          h = lerp(h, h * 0.65 + ledge * 0.35, strata);
        }

        // Mineral veins: thin lines along zero crossings of a warped noise field.
        let vein = 0;
        if (veins > 0) {
          const vn = fbm(wu * 1 + 0.03 * fbm(u, v, 8, 2, sV + 3), wv, s * 2, styledOctaves(ctx, s * 2, 4), sV);
          const w = 0.012 + 0.03 * veins;
          vein = (1 - smoothstep(0, w, Math.abs(vn))) * smoothstep(0.3, 0.7, fbm(u, v, s, 2, sV + 9) * 0.5 + 0.5 + veins * 0.4);
        }

        // Specks: small crystalline inclusions.
        let speck = 0;
        if (specks > 0 && N >= 128) {
          voronoi(u, v, 72, 72, sS, 1, vor, false);
          const on = unit(vor.id) < specks * 0.55;
          if (on) speck = 1 - smoothstep(0.0025, 0.0055, vor.f1);
          speck *= nat * 0.7 + 0.3;
        }

        const grain = fbm(u, v, 32, oGrain, sG);
        h += grain * 0.06 * detail + vein * 0.02 - speck * 0.01;
        h = clamp01(h * 0.92 + 0.04);

        // Color from height, layer and minerals; recesses darker and cooler.
        const bandTone = strata > 0 ? (unit(hash1(imod(bandId, layers), sL)) - 0.5) * 0.35 * strata : 0;
        const t = tone(clamp01(smooth * 0.9 + bandTone + 0.1 * grain), nat, 4);
        const base = mixRGB(cA, cB, t);
        const cav = smoothstep(0.15, 0.55, h);
        const k = (0.7 + 0.35 * cav) * (1 + 0.1 * grain * detail) * (1 + band * 0.04 * strata);
        c[0] = base[0] * k;
        c[1] = base[1] * k;
        c[2] = base[2] * k;
        const mineral = Math.max(vein, speck);
        c[0] = lerp(c[0], cC[0], mineral);
        c[1] = lerp(c[1], cC[1], mineral);
        c[2] = lerp(c[2], cC[2], mineral);

        const r = 0.86 - 0.08 * cav + 0.05 * grain - 0.35 * mineral;
        writePixel(out, i, c, h, roughBias(r, rbias), 0);
      }
    }
  },
};

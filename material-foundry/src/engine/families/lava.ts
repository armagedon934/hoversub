import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { billow, clamp01, fbm, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { color, detailParam, range, reliefParam, roughnessParam, styleParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { roughBias, rowProgress, styledOctaves, tone, writeEmissive, writePixel } from './common';

export const lavaFamily: FamilyDefinition = {
  id: 'lava_rock',
  label: 'Lava / Emissive Cracked Rock',
  slug: 'lava_rock',
  description: 'Dark raised basalt crust broken into plates, with glowing molten material only in the recessed cracks.',
  params: [
    color('colorA', 'Crust color', '#2b2624'),
    color('colorB', 'Ash highlight', '#5a514b'),
    color('emissionColor', 'Glow color', '#ff5a14', { group: 'emission' }),
    range('emissionIntensity', 'Glow intensity', 0, 10, 4, 'emission', { help: 'Emission strength multiplier used by the preview and recorded in exports.' }),
    range('heat', 'Heat coverage', 0, 1, 0.65, 'emission', { help: 'How many of the cracks are still molten.' }),
    range('glowSpread', 'Glow spread', 0, 1, 0.3, 'emission', { help: 'How far the glow climbs the crack walls (never onto the crust tops).' }),
    range('plates', 'Crust plates', 3, 14, 6, 'pattern', { integer: true }),
    range('crackWidth', 'Crack width', 0, 1, 0.45, 'pattern'),
    range('subCracks', 'Secondary cracks', 0, 1, 0.5, 'pattern'),
    styleParam(),
    reliefParam(),
    detailParam(0.55),
    roughnessParam(0.5),
  ],
  emits: (p) => (p.emissionIntensity as number) > 0,
  variationKeys: [
    { key: 'heat', amount: 0.12 },
    { key: 'crackWidth', amount: 0.12 },
    { key: 'subCracks', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cCr = hexToLinear(str(p, 'colorA'));
    const cAsh = hexToLinear(str(p, 'colorB'));
    const cGlow = hexToLinear(str(p, 'emissionColor'));
    const heat = num(p, 'heat', 0.65);
    const spread = num(p, 'glowSpread', 0.3);
    const n = Math.round(num(p, 'plates', 6));
    const cw = lerp(0.002, 0.011, num(p, 'crackWidth', 0.45));
    const sub = num(p, 'subCracks', 0.5);
    const detail = num(p, 'detail', 0.55);
    const rbias = num(p, 'roughness', 0.5);
    out.depth = 0.04;

    const sW = subSeed(seed, 'warp');
    const sV = subSeed(seed, 'plates');
    const sV2 = subSeed(seed, 'sub');
    const sH = subSeed(seed, 'heat');
    const sC = subSeed(seed, 'crust');
    const vor = makeVoronoiResult();
    const vor2 = makeVoronoiResult();
    const oW = styledOctaves(ctx, 8, 3);
    const oC = styledOctaves(ctx, 12, 5);
    // Hot core color is pushed toward yellow-white; cooler edges toward deep red.
    const hot: RGB = [Math.min(1, cGlow[0] * 1.0 + 0.35), Math.min(1, cGlow[1] * 1.6 + 0.25), Math.min(1, cGlow[2] * 1.4 + 0.05)];
    const cool: RGB = [cGlow[0] * 0.55, cGlow[1] * 0.12, cGlow[2] * 0.08];
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        const jag = lerp(0.3, 1, nat);
        const wu = u + jag * (0.03 * fbm(u, v, 4, 2, sW) + 0.006 * fbm(u, v, 16, oW, sW + 2));
        const wv = v + jag * (0.03 * fbm(u, v, 4, 2, sW + 1) + 0.006 * fbm(u, v, 16, oW, sW + 3));
        voronoi(wu, wv, n, n, sV, 0.85, vor, true);
        let edge = vor.edge;
        const wVar = 0.6 + 0.8 * (fbm(u, v, 6, 2, sW + 5) * 0.5 + 0.5);
        let w = cw * wVar;
        if (sub > 0) {
          voronoi(wu, wv, n * 2, n * 2, sV2, 0.9, vor2, true);
          const subMask = smoothstep(1 - sub, 1 - sub + 0.25, fbm(u, v, 3, 2, sV2 + 3) * 0.5 + 0.5);
          const e2 = vor2.edge + (1 - subMask) * 0.05;
          if (e2 < edge) {
            edge = e2;
            w *= 0.55;
          }
        }
        // Crack profile: 1 at the crack centre, 0 on the crust.
        const crack = 1 - smoothstep(w * 0.35, w, edge);
        // Crust plates: raised, slightly domed, with rough lumpy tops.
        const plateBevel = w + 0.012 + 0.01 * (1 - nat);
        const shoulder = smoothstep(w * 0.7, plateBevel, edge);
        const lump = billow(u, v, 12, oC, sC);
        const fine = fbm(u, v, 48, styledOctaves(ctx, 48, 3), sC + 7);
        const pr = unit(rehash(vor.id, 3));
        let h = 0.08 + shoulder * (0.62 + 0.1 * pr + 0.18 * lump + 0.05 * fine * detail);
        h = clamp01(h);

        // Heat: which cracks are molten, and how strongly.
        const heatN = fbm(u, v, 3, 3, sH) * 0.5 + 0.5;
        const molten = smoothstep(1 - heat - 0.1, 1 - heat + 0.15, heatN);
        // Glow region: the crack floor plus (optionally) the lower crack walls.
        const wall = (1 - shoulder) * (1 - crack);
        const glowMask = clamp01(crack + wall * spread * 0.9) * molten;
        const temp = tone(clamp01(crack * (0.55 + 0.45 * heatN) + 0.15 * fbm(u, v, 24, 2, sH + 2)), nat, 4);
        const er = lerp(cool[0], hot[0], temp) * glowMask;
        const eg = lerp(cool[1], hot[1], temp) * glowMask;
        const eb = lerp(cool[2], hot[2], temp) * glowMask;
        writeEmissive(out, i, er, eg, eb);

        // Albedo: dark basalt with ash on the high, weathered parts; dark red-brown in cracks.
        const ash = smoothstep(0.55, 0.9, lump * 0.7 + (fbm(u, v, 5, 3, sC + 3) * 0.5 + 0.5) * 0.5) * shoulder;
        const k = 0.8 + 0.3 * tone(lump, nat, 3) + 0.08 * fine * detail;
        c[0] = lerp(cCr[0] * k, cAsh[0], ash * 0.6);
        c[1] = lerp(cCr[1] * k, cAsh[1], ash * 0.6);
        c[2] = lerp(cCr[2] * k, cAsh[2], ash * 0.6);
        const crackAlb: RGB = [0.08 + 0.1 * molten, 0.025, 0.012];
        const inCrack = 1 - shoulder;
        c[0] = lerp(c[0], crackAlb[0], inCrack);
        c[1] = lerp(c[1], crackAlb[1], inCrack);
        c[2] = lerp(c[2], crackAlb[2], inCrack);
        const rough = lerp(0.9 + 0.05 * lump - 0.1 * ash * 0, 0.45, crack * molten);
        writePixel(out, i, c, h, roughBias(rough, rbias), 0);
      }
    }
  },
};

import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { billow, clamp01, fbm, fbmAniso, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { color, detailParam, range, reliefParam, roughnessParam, styleParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const rustFamily: FamilyDefinition = {
  id: 'rusted_metal',
  label: 'Rusted Metal',
  slug: 'rusted_metal',
  description: 'Steel plate with irregular corrosion patches, flaking oxide, pitting and run-off streaks. Rust is dielectric; bare steel is metallic.',
  params: [
    color('colorA', 'Bare metal color', '#8e9092'),
    color('colorB', 'Rust (light)', '#b0592b'),
    color('colorC', 'Rust (dark)', '#4b2a1b'),
    range('coverage', 'Rust coverage', 0, 1, 0.5, 'pattern'),
    range('scale', 'Corrosion scale', 1, 8, 3, 'pattern', { integer: true, help: 'Number of corrosion clusters across the tile.' }),
    range('pitting', 'Pitting', 0, 1, 0.5, 'pattern'),
    range('flaking', 'Flaking & build-up', 0, 1, 0.45, 'pattern'),
    range('streaks', 'Run-off streaks', 0, 1, 0.3, 'wear'),
    range('millScale', 'Mill scale on metal', 0, 1, 0.4, 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.55),
    roughnessParam(0.5),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'coverage', amount: 0.12 },
    { key: 'pitting', amount: 0.15 },
    { key: 'streaks', amount: 0.15 },
    { key: 'flaking', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cM = hexToLinear(str(p, 'colorA'));
    const cL = hexToLinear(str(p, 'colorB'));
    const cD = hexToLinear(str(p, 'colorC'));
    const cov = num(p, 'coverage', 0.5);
    const s = Math.round(num(p, 'scale', 3));
    const pitting = num(p, 'pitting', 0.5);
    const flaking = num(p, 'flaking', 0.45);
    const streaks = num(p, 'streaks', 0.3);
    const mill = num(p, 'millScale', 0.4);
    const detail = num(p, 'detail', 0.55);
    const rbias = num(p, 'roughness', 0.5);
    out.depth = 0.008;

    const sC = subSeed(seed, 'corr');
    const sW = subSeed(seed, 'warp');
    const sP = subSeed(seed, 'pit');
    const sF = subSeed(seed, 'flake');
    const sS = subSeed(seed, 'streak');
    const sMs = subSeed(seed, 'mill');
    const vor = makeVoronoiResult();
    const vorF = makeVoronoiResult();
    const oC = styledOctaves(ctx, 2 * s, 7);
    const oF = styledOctaves(ctx, 24, 4);
    const threshold = 1 - cov;
    const soft = lerp(0.015, 0.06, nat);
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N + ctx.offsetV;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N + ctx.offsetU;
        const i = (y - ctx.y0) * N + x;
        const wu = u + 0.05 * fbm(u, v, s, 3, sW);
        const wv = v + 0.05 * fbm(u, v, s, 3, sW + 1);
        const corr = fbm(wu, wv, 2 * s, oC, sC, 0.55) * 0.5 + 0.5;
        // Remap so coverage is roughly the rusted area fraction.
        const cv = clamp01((corr - 0.5) * 1.8 + 0.5);
        const rust = smoothstep(threshold - soft, threshold + soft, cv);
        const deep = smoothstep(threshold + 0.05, threshold + 0.35, cv); // patch interior: heavier corrosion

        // Pitting: concentrated in and around rust patches.
        let pit = 0;
        if (pitting > 0 && N >= 128) {
          voronoi(u, v, 48, 48, sP, 1, vor, false);
          const near = smoothstep(threshold - 0.2, threshold + 0.1, cv);
          if (unit(vor.id) < pitting * 0.45 * near) {
            const rr = (0.06 + 0.3 * unit(rehash(vor.id, 2)) ** 2) / 48;
            pit = 1 - smoothstep(rr * 0.3, rr, vor.f1);
          }
        }
        // Flaky, lumpy oxide build-up.
        const flake = billow(u, v, 24, oF, sF);
        const fine = fbm(u, v, 64, styledOctaves(ctx, 64, 2), sF + 3);

        // Flaking plates: oxide scale breaks into plates whose edges lift.
        let plateEdge = 0;
        let plateTone = 0;
        if (flaking > 0) {
          voronoi(wu, wv, 6 * s, 6 * s, sF + 11, 0.9, vorF, true);
          plateEdge = (1 - smoothstep(0, 0.012 / s, vorF.edge)) * deep;
          plateTone = (unit(vorF.id) - 0.5) * deep;
        }
        // Height: rust sits slightly proud of the metal, with lumps; pits go down.
        let h = 0.45 + rust * (0.12 + 0.25 * flaking * flake + 0.08 * deep + 0.12 * flaking * plateEdge) + 0.03 * fine * detail;
        h -= pit * 0.3;

        // Metal appearance: steel with darker mill-scale patches.
        const ms = mill > 0 ? smoothstep(0.4, 0.7, fbm(u, v, 3, 4, sMs) * 0.5 + 0.5) * mill : 0;
        let mr = cM[0] * (1 - 0.55 * ms);
        let mg = cM[1] * (1 - 0.55 * ms);
        let mb = cM[2] * (1 - 0.5 * ms);
        let mRough = 0.38 + 0.15 * ms + 0.05 * fine;

        // Streaks: thin oxide stains running down (dielectric-ish film on metal).
        let stain = 0;
        if (streaks > 0) {
          const st = fbmAniso(u, v, 20, 2, 3, sS) * 0.5 + 0.5;
          const src = smoothstep(threshold - 0.3, threshold, fbm(wu, wv + 0.06, 2 * s, 3, sC, 0.55) * 0.9 + 0.5);
          stain = clamp01(smoothstep(0.5, 0.85, st) * streaks * (0.4 + 0.6 * src)) * (1 - rust);
          mr = lerp(mr, cD[0] * 1.2, stain * 0.7);
          mg = lerp(mg, cD[1] * 1.2, stain * 0.7);
          mb = lerp(mb, cD[2] * 1.2, stain * 0.7);
          mRough = lerp(mRough, 0.75, stain);
        }

        // Rust color: dark base with orange crusts on the raised flakes.
        const rt = tone(clamp01(0.35 + 0.5 * flake + 0.25 * fine - 0.3 * deep * (1 - flake) + 0.2 * plateTone * flaking + 0.1 * plateEdge), nat, 3);
        const rr2 = lerp(cD[0], cL[0], rt);
        const rg2 = lerp(cD[1], cL[1], rt);
        const rb2 = lerp(cD[2], cL[2], rt);
        const pitDark = 1 - pit * 0.55;
        c[0] = lerp(mr, rr2, rust) * pitDark;
        c[1] = lerp(mg, rg2, rust) * pitDark;
        c[2] = lerp(mb, rb2, rust) * pitDark;
        const rRough = 0.82 + 0.1 * flake;
        const rough = lerp(mRough, rRough, rust) + pit * 0.1;
        // Rust and oxide stains are not metals; bare steel is.
        const metal = (1 - rust) * (1 - stain * 0.85) * (1 - pit * 0.5);
        writePixel(out, i, c, h, roughBias(rough, rbias), metal);
      }
    }
  },
};

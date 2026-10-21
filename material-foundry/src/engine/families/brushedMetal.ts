import { hexToLinear, type RGB } from '../color';
import { subSeed } from '../hash';
import { clamp01, fbm, fbmAniso, lerp, smoothstep } from '../noise';
import { scratchField } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, wearParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { roughBias, rowProgress, tone, writePixel } from './common';

export const brushedMetalFamily: FamilyDefinition = {
  id: 'brushed_metal',
  label: 'Brushed Metal',
  slug: 'brushed_metal',
  description: 'Fully metallic sheet with directional brushing, fine scratches and smudged roughness variation.',
  params: [
    color('colorA', 'Metal color (F0)', '#c9cacc', { help: 'Reflectance color of the metal. Steel/aluminium are near-neutral; copper and brass are warm.' }),
    select('direction', 'Brush direction', [['h', 'Horizontal'], ['v', 'Vertical']], 'h', 'pattern'),
    range('brushStrength', 'Brushing strength', 0, 1, 0.6, 'pattern'),
    range('brushCoarseness', 'Brush coarseness', 0, 1, 0.4, 'pattern'),
    range('smudges', 'Smudges', 0, 1, 0.25, 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.5),
    roughnessParam(0.4),
    wearParam('Scratches', 0.3),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'brushStrength', amount: 0.15 },
    { key: 'smudges', amount: 0.2 },
    { key: 'wear', amount: 0.2 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const vertical = str(p, 'direction', 'h') === 'v';
    const brushS = num(p, 'brushStrength', 0.6);
    const coarse = num(p, 'brushCoarseness', 0.4);
    const smudges = num(p, 'smudges', 0.25);
    const detail = num(p, 'detail', 0.5);
    const rbias = num(p, 'roughness', 0.4);
    const wear = num(p, 'wear', 0.3);
    out.depth = 0.0025;

    const sB = subSeed(seed, 'brush');
    const sS = subSeed(seed, 'scratch');
    const sM = subSeed(seed, 'smudge');
    // Brush lines: very low frequency along the stroke, high across it.
    const across1 = Math.round(lerp(160, 48, coarse));
    const across2 = across1 * 4;
    const o1 = ctx.octaves(across1, 3);
    const o2 = Math.max(0, ctx.octaves(across2, 2) - (across2 > N / 3 ? 1 : 0));
    const scrFine = { cells: 6, perCell: 4, length: 1.8, angle: 0, spread: 0.12, width: 0.0005 };
    const scrRand = { cells: 5, perCell: 2, length: 1.4, angle: 0, spread: Math.PI, width: 0.0007 };
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const vy = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const ux = (x + 0.5) / N;
        // Work in brush space: "u" runs along the stroke.
        const u = vertical ? vy : ux;
        const v = vertical ? ux : vy;
        const i = (y - ctx.y0) * N + x;
        let brush = fbmAniso(u, v, 2, across1, o1, sB, 0.6);
        if (o2 > 0 && nat > 0.2) brush = brush * 0.65 + 0.35 * fbmAniso(u, v, 3, across2, o2, sB + 7, 0.6);
        brush = tone(brush * 0.5 + 0.5, nat, 4) * 2 - 1;
        const broad = fbm(u, v, 2, 3, sB + 13);
        // Scratches: mostly along the brushing direction, a few random ones scaled by wear.
        const sc1 = wear > 0 ? scratchField(u, v, sS, scrFine) * wear : 0;
        const sc2 = wear > 0.05 ? scratchField(u, v, sS + 5, scrRand) * wear * 0.8 : 0;
        const scr = Math.max(sc1, sc2);
        const sm = smudges > 0 ? smoothstep(0.55, 0.85, fbm(u, v, 4, 4, sM) * 0.5 + 0.5) * smudges : 0;

        const h = clamp01(0.5 + 0.18 * brush * brushS * (0.5 + detail) - 0.3 * scr + 0.02 * broad);
        const k = 1 + 0.035 * brush * brushS + 0.03 * broad - 0.04 * sm + 0.05 * scr;
        c[0] = cA[0] * k;
        c[1] = cA[1] * k;
        c[2] = cA[2] * k;
        let rough = 0.32 + 0.1 * brush * brushS + 0.05 * broad + 0.18 * sm + 0.12 * scr;
        rough = clamp01(rough);
        // Brushed metal is always a conductor: metallic = 1 everywhere.
        writePixel(out, i, c, h, roughBias(rough, rbias), 1);
      }
    }
  },
};

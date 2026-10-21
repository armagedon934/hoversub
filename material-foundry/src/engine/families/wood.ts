import { hexToLinear, saturate, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { clamp01, fbm, gradNoise, lerp, smoothstep } from '../noise';
import { makeCell, plankCell, scratchField, sdRoundRect } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, wearParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, mixRGB, roughBias, rowProgress, tone, writePixel } from './common';

const BIG = 1 << 20; // effectively non-periodic lattice for plank-local noise

interface Knot {
  a: number; // along-plank position (UV, from plank start)
  b: number; // across-plank offset from centre (UV)
  r: number; // radius (UV)
}

export const woodFamily: FamilyDefinition = {
  id: 'wood_planks',
  label: 'Wood Planks',
  slug: 'wood_planks',
  description: 'Horizontal boards with flat-sawn growth rings, knots, recessed seams and oiled, varnished or weathered finishes.',
  params: [
    color('colorA', 'Wood color', '#a8743f'),
    color('colorB', 'Grain color', '#6a4223'),
    range('plankRows', 'Planks across', 2, 12, 5, 'pattern', { integer: true, help: 'Board rows per tile. Fewer rows means wider planks.' }),
    range('plankLength', 'Boards per row', 1, 4, 2, 'pattern', { integer: true, help: 'Board pieces per row; ends are staggered between rows.' }),
    range('grainStrength', 'Grain strength', 0, 1, 0.6, 'pattern'),
    range('ringScale', 'Ring density', 0, 1, 0.5, 'pattern'),
    range('knots', 'Knot amount', 0, 1, 0.35, 'pattern'),
    range('seamDepth', 'Seam depth', 0, 1, 0.5, 'pattern'),
    select('finish', 'Finish', [['oiled', 'Oiled'], ['varnished', 'Varnished'], ['weathered', 'Weathered']], 'oiled', 'surface'),
    styleParam(),
    reliefParam(),
    detailParam(0.5),
    roughnessParam(0.5),
    range('plankVariation', 'Plank color variation', 0, 1, 0.45, 'surface'),
    wearParam('Worn finish & scratches', 0.25),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'plankVariation', amount: 0.2 },
    { key: 'knots', amount: 0.2 },
    { key: 'grainStrength', amount: 0.12 },
    { key: 'wear', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const rows = Math.round(num(p, 'plankRows', 5));
    const perRow = Math.round(num(p, 'plankLength', 2));
    const grainS = num(p, 'grainStrength', 0.6);
    const ringSp = lerp(0.011, 0.0035, num(p, 'ringScale', 0.5));
    const knotAmt = num(p, 'knots', 0.35);
    const seamD = num(p, 'seamDepth', 0.5);
    const finish = str(p, 'finish', 'oiled');
    const detail = num(p, 'detail', 0.5);
    const rbias = num(p, 'roughness', 0.5);
    const pvar = num(p, 'plankVariation', 0.45);
    const wear = num(p, 'wear', 0.25);
    const weathered = finish === 'weathered';
    const gap = lerp(0.0004, 0.0022, seamD);
    const seamH = lerp(0.6, 0.05, seamD);
    const bevelW = 0.0025 * bevelScale(nat);
    out.depth = weathered ? 0.014 : 0.01;

    const sG = subSeed(seed, 'grain');
    const sW = subSeed(seed, 'wear');
    const sS = subSeed(seed, 'scratch');
    const cell = makeCell();
    const fineFibres = N >= 1024 && ctx.natural > 0.3;
    const c: RGB = [0, 0, 0];
    const knotCache = new Map<number, Knot[]>();
    const getKnots = (id: number, hx: number, hy: number): Knot[] => {
      let k = knotCache.get(id);
      if (k) return k;
      k = [];
      const count = Math.floor(unit(rehash(id, 20)) * (knotAmt * 3.2));
      for (let j = 0; j < count; j++) {
        k.push({
          a: (0.1 + 0.8 * unit(rehash(id, 21 + j * 3))) * hx * 2,
          b: (unit(rehash(id, 22 + j * 3)) - 0.5) * hy * 1.3,
          r: hy * (0.18 + 0.28 * unit(rehash(id, 23 + j * 3))),
        });
      }
      knotCache.set(id, k);
      return k;
    };
    const scratchO = { cells: 8, perCell: 3, length: 1.6, angle: 0, spread: Math.PI, width: 0.0006 };

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        plankCell(u, v, rows, perRow, seed, cell);
        const id = cell.id;
        const r1 = unit(rehash(id, 1));
        const r2 = unit(rehash(id, 2));
        const r3 = unit(rehash(id, 3));
        const r4 = unit(rehash(id, 4));
        const r5 = unit(rehash(id, 5));
        const a = cell.lx + cell.hx; // along the plank, from its start (continuous across tile wrap)
        const b = cell.ly; // across the plank, centred
        const offA = r4 * 50;
        const offB = r5 * 50;

        // Knots: grain lines flow around each knot (the across-board coordinate is pushed away
        // from the knot centre), and the knot itself is a dark elliptical core with tight rings.
        let bb = b;
        let knotCore = 0;
        let knotRing = 0;
        const knots = getKnots(id, cell.hx, cell.hy);
        for (let k = 0; k < knots.length; k++) {
          const kn = knots[k];
          const dx = a - kn.a;
          const dy = b - kn.b;
          const fa = Math.exp(-(dx * dx) / (kn.r * kn.r * 9));
          const fb = Math.exp(-Math.abs(dy) / (kn.r * 1.6));
          bb -= Math.sign(dy) * kn.r * 1.15 * fa * fb;
          const ex = dx / (kn.r * 0.85);
          const ey = dy / kn.r;
          const rr = Math.sqrt(ex * ex + ey * ey);
          if (rr < 1.25) {
            knotCore = Math.max(knotCore, 1 - smoothstep(0.6, 1.0, rr));
            const ring = 0.5 + 0.5 * Math.cos(rr * Math.PI * 2 * 3.5);
            knotRing = Math.max(knotRing, ring * (1 - smoothstep(0.7, 1.2, rr)));
          }
        }

        // Flat-sawn growth rings: distance from a virtual log axis running (almost) parallel to
        // the plank. The small tilt produces the occasional cathedral arch along the board.
        const axisB = (r1 - 0.5) * cell.hy * 2.6;
        const z0 = cell.hy * (0.8 + 3 * r2);
        const slope = (r3 - 0.5) * 0.05;
        const z = z0 + slope * (a - cell.hx);
        const db = bb - axisB;
        const d = Math.sqrt(db * db + z * z);
        // Gentle, low-frequency wander of the rings plus slight ring-width irregularity.
        const wander = ringSp * (0.9 * gradNoise(a * 3 + offA, b * 4 + offB, BIG, BIG, sG) + 0.25 * gradNoise(a * 14 + offA, b * 40 + offB, BIG, BIG, sG + 1));
        const phase = (d + wander) / ringSp;
        const fr = phase - Math.floor(phase);
        // Earlywood -> latewood: a thin dark band at the end of each ring, sharper when stylized.
        const lateStart = lerp(0.62, 0.72, nat);
        const late = smoothstep(lateStart, lerp(0.86, 0.94, nat), fr) * (1 - smoothstep(0.96, 1.0, fr));
        // Fine fibres / pores running along the grain.
        const fib = gradNoise(a * 8 + offA, b * 320 + offB, BIG, BIG, sG + 2) * 0.5 +
          (fineFibres ? gradNoise(a * 20 + offA, b * 900 + offB, BIG, BIG, sG + 3) * 0.3 * nat : 0);
        const grain = clamp01(late * grainS + fib * 0.18 * detail);

        // Plank profile with recessed seams and slightly eased edges.
        const sdf = sdRoundRect(cell.lx, cell.ly, cell.hx - gap, cell.hy - gap, 0.001);
        const prof = bevelProfile(-sdf, bevelW);
        const cup = (b / cell.hy) * (b / cell.hy) * 0.03 * (r3 - 0.3);
        let top = 0.8 + (r2 - 0.5) * 0.05 + cup - grain * 0.015;
        if (weathered) top += late * 0.08 * grainS - fib * 0.02 * detail; // soft earlywood erodes

        // Worn finish: traffic paths and scratches.
        const wearMask = wear > 0 ? smoothstep(0.45, 0.85, fbm(u, v, 3, 3, sW) * 0.5 + 0.5 + wear * 0.35) * wear : 0;
        const scr = wear > 0.02 ? scratchField(u, v, sS, scratchO) * wear : 0;
        top -= scr * 0.03;
        const h = seamH + (top - seamH) * prof;

        // Color.
        const t = tone(clamp01(0.5 + (r1 - 0.5) * 1.6 * pvar), nat, 3);
        const plankBase = mixRGB(cA, mixRGB(cA, cB, 0.55), t * 0.8);
        const bright = 1 + (r5 - 0.5) * 0.35 * pvar;
        const gT = tone(grain, nat, 3);
        let col = mixRGB(plankBase, cB, gT * 0.75);
        // Subtle mineral streaks running along the board.
        const streak = gradNoise(a * 2 + offA, b * 60 + offB, BIG, BIG, sG + 5) * 0.08 * pvar;
        let r = col[0] * bright * (1 + streak);
        let g = col[1] * bright * (1 + streak);
        let bl = col[2] * bright * (1 + streak);
        let rough = 0.6;
        if (finish === 'varnished') {
          rough = 0.28 + 0.05 * late;
          const s2 = saturate([r, g, bl], 1.12);
          r = s2[0] * 0.92;
          g = s2[1] * 0.92;
          bl = s2[2] * 0.92;
        } else if (finish === 'oiled') {
          rough = 0.55 + 0.08 * late;
        } else {
          // Weathered: UV greying toward silver, dry and rough.
          const l = 0.22 * (0.7 + 0.3 * (1 - gT));
          const grey: RGB = [l * 0.95, l * 0.93, l * 0.88];
          const wT = 0.75;
          r = lerp(r, grey[0], wT);
          g = lerp(g, grey[1], wT);
          bl = lerp(bl, grey[2], wT);
          rough = 0.86 + 0.06 * late;
        }
        // Knots stay dark under every finish (resin-rich, dense wood).
        const knotT = Math.min(1, knotCore * 0.9 + knotRing * 0.35);
        if (knotT > 0) {
          const kc = mixRGB(cB, [0.02, 0.012, 0.006], weathered ? 0.75 : 0.45);
          r = lerp(r, kc[0], knotT);
          g = lerp(g, kc[1], knotT);
          bl = lerp(bl, kc[2], knotT);
        }
        // Worn areas: finish removed -> lighter, rougher; scratches catch light differently.
        const lighten = 1 + wearMask * 0.22 + scr * 0.3;
        r *= lighten;
        g *= lighten;
        bl *= lighten * 0.97;
        rough = lerp(rough, Math.max(rough, 0.7), wearMask * 0.8) + scr * 0.15;
        rough += knotCore * -0.05;
        const m = smoothstep(0, 0.7, prof);
        c[0] = lerp(r * 0.25, r, m);
        c[1] = lerp(g * 0.25, g, m);
        c[2] = lerp(bl * 0.25, bl, m);
        rough = lerp(0.9, rough, m);
        writePixel(out, i, c, h, roughBias(rough, rbias), 0);
      }
    }
  },
};

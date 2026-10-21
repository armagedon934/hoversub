import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { billow, clamp01, fbm, gradNoise, lerp, makeVoronoiResult, smoothstep, voronoi } from '../noise';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam } from '../params';
import { num, str, type FamilyDefinition } from '../types';
import { mixRGB, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const sandFamily: FamilyDefinition = {
  id: 'sand_earth',
  label: 'Sand & Earth',
  slug: 'sand_earth',
  description: 'Loose ground: broad sand/soil variation, wind ripples, grains, scattered pebbles, damp patches and dry cracked mud.',
  params: [
    color('colorA', 'Sand color', '#c9a878'),
    color('colorB', 'Earth color', '#7d5d40'),
    color('stoneColor', 'Pebble color', '#7c766c'),
    range('scale', 'Variation scale', 1, 6, 2, 'pattern', { integer: true }),
    range('earthMix', 'Earth amount', 0, 1, 0.25, 'pattern'),
    range('ripples', 'Ripple strength', 0, 1, 0.5, 'pattern'),
    range('rippleScale', 'Ripple count', 4, 40, 14, 'pattern', { integer: true, visibleIf: (p) => (p.ripples as number) > 0 }),
    select('rippleDir', 'Ripple direction', [['h', 'Horizontal'], ['v', 'Vertical'], ['d', 'Diagonal']], 'h', 'pattern', { visibleIf: (p) => (p.ripples as number) > 0 }),
    range('stones', 'Pebbles', 0, 1, 0.2, 'pattern'),
    range('stoneSize', 'Pebble size', 0, 1, 0.45, 'pattern', { visibleIf: (p) => (p.stones as number) > 0 }),
    styleParam(),
    reliefParam(),
    detailParam(0.6),
    roughnessParam(0.5),
    range('moisture', 'Damp patches', 0, 1, 0, 'wear'),
    range('dryCracks', 'Dry mud cracks', 0, 1, 0, 'wear'),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'earthMix', amount: 0.15 },
    { key: 'stones', amount: 0.15 },
    { key: 'moisture', amount: 0.1 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cS = hexToLinear(str(p, 'colorA'));
    const cE = hexToLinear(str(p, 'colorB'));
    const cP = hexToLinear(str(p, 'stoneColor'));
    const s = Math.round(num(p, 'scale', 2));
    const earthMix = num(p, 'earthMix', 0.25);
    const ripples = num(p, 'ripples', 0.5);
    const rk = Math.round(num(p, 'rippleScale', 14));
    const rdir = str(p, 'rippleDir', 'h');
    const stones = num(p, 'stones', 0.2);
    const stoneCells = Math.round(lerp(30, 8, num(p, 'stoneSize', 0.45)));
    const detail = num(p, 'detail', 0.6);
    const rbias = num(p, 'roughness', 0.5);
    const moist = num(p, 'moisture', 0);
    const cracks = num(p, 'dryCracks', 0);
    out.depth = 0.03;

    const sB = subSeed(seed, 'broad');
    const sR = subSeed(seed, 'ripple');
    const sG = subSeed(seed, 'grain');
    const sP = subSeed(seed, 'pebble');
    const sM = subSeed(seed, 'moist');
    const sC = subSeed(seed, 'cracks');
    const vor = makeVoronoiResult();
    const vorC = makeVoronoiResult();
    const oB = styledOctaves(ctx, 2 * s, 6);
    const oG = styledOctaves(ctx, 64, 3);
    const c: RGB = [0, 0, 0];

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N + ctx.offsetV;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N + ctx.offsetU;
        const i = (y - ctx.y0) * N + x;
        const broad = fbm(u, v, 2 * s, oB, sB);
        const earth = smoothstep(0.55 - earthMix * 0.6, 0.75 - earthMix * 0.6, fbm(u, v, s, 4, sB + 3) * 0.5 + 0.5) * Math.min(1, earthMix * 3);
        let h = 0.45 + 0.12 * broad;

        // Wind ripples: asymmetric (gentle windward, steep lee) periodic waves, warped.
        let rip = 0;
        if (ripples > 0) {
          const coord = rdir === 'v' ? u : rdir === 'd' ? u + v : v;
          const phase = rk * coord + 1.3 * fbm(u, v, 2, 3, sR) + 0.25 * fbm(u, v, 6, 2, sR + 1);
          const fr = phase - Math.floor(phase);
          const peak = lerp(0.82, 0.7, nat);
          const prof = fr < peak ? smoothstep(0, peak, fr) : 1 - smoothstep(peak, 1, fr);
          const amp = smoothstep(0.2, 0.7, fbm(u, v, 2, 2, sR + 3) * 0.5 + 0.7) * ripples * (1 - earth * 0.8);
          rip = prof * amp;
          h += (rip - 0.5 * amp) * 0.22;
        }

        // Grains and clumps.
        const grain = fbm(u, v, 64, oG, sG);
        const clump = billow(u, v, 16, styledOctaves(ctx, 16, 3), sG + 3);
        h += grain * 0.03 * detail + earth * (clump - 0.3) * 0.08;

        // Dry mud cracks: polygonal plates with curled edges, in earthy areas mostly.
        let crack = 0;
        let plateId = 0;
        if (cracks > 0) {
          const wu = u + 0.01 * fbm(u, v, 12, 2, sC);
          const wv = v + 0.01 * fbm(u, v, 12, 2, sC + 1);
          voronoi(wu, wv, 7, 7, sC + 2, 0.9, vorC, true);
          plateId = vorC.id;
          const w = 0.0015 + 0.004 * cracks;
          const presence = smoothstep(0.25, 0.6, cracks + earth * 0.5);
          crack = (1 - smoothstep(w * 0.4, w, vorC.edge)) * presence;
          const curl = (1 - smoothstep(w, w + 0.02, vorC.edge)) * presence;
          h += curl * 0.05 * cracks - crack * 0.3;
        }

        // Pebbles partially buried in sand: rotated ellipses with irregular outlines.
        let pebble = 0;
        let pebbleId = 0;
        if (stones > 0) {
          voronoi(u, v, stoneCells, stoneCells, sP, 0.85, vor, false);
          if (unit(vor.id) < stones * 0.95) {
            const rr = (0.3 + 0.22 * unit(rehash(vor.id, 2))) / stoneCells;
            const ang = unit(rehash(vor.id, 5)) * Math.PI;
            const elong = 0.65 + 0.35 * unit(rehash(vor.id, 6));
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const px = -vor.dx * ca - -vor.dy * sa;
            const py = (-vor.dx * sa + -vor.dy * ca) / elong;
            const en = 1 + 0.18 * gradNoise(u * 48, v * 48, 48, 48, sP + 5) * nat;
            const d = (Math.sqrt(px * px + py * py) * en) / rr;
            if (d < 1) {
              pebble = Math.sqrt(1 - d * d);
              pebbleId = vor.id;
            }
          }
        }
        const pebH = 0.45 + pebble * 0.35;
        const isPeb = smoothstep(0.0, 0.25, pebble);
        h = lerp(h, Math.max(h, pebH), isPeb);

        // Color.
        const bt = tone(broad * 0.5 + 0.5, nat, 4);
        let base = mixRGB(cS, cE, earth);
        let k = 0.85 + 0.25 * bt + 0.06 * grain * detail + (rip - 0.5) * 0.08 * ripples;
        if (cracks > 0) {
          k *= 1 - crack * 0.55;
          k *= 1 + (unit(rehash(plateId, 3)) - 0.5) * 0.08 * cracks;
        }
        let rough = 0.9 + 0.05 * grain;
        // Damp patches: darker, more saturated, glossier.
        if (moist > 0) {
          const wet = smoothstep(0.5, 0.75, fbm(u, v, 2, 4, sM) * 0.5 + 0.5 + moist * 0.35) * moist;
          k *= 1 - wet * 0.45;
          base = mixRGB(base, [base[0] * 1.1, base[1] * 0.95, base[2] * 0.85], wet * 0.5);
          rough -= wet * 0.45;
        }
        c[0] = base[0] * k;
        c[1] = base[1] * k;
        c[2] = base[2] * k;
        if (isPeb > 0) {
          const pt = unit(rehash(pebbleId, 4));
          const hueT = unit(rehash(pebbleId, 7));
          const pk = (0.55 + 0.75 * pt) * (0.9 + 0.15 * grain) * (0.85 + 0.25 * pebble);
          const pc: RGB = [cP[0] * pk * (0.9 + 0.25 * hueT), cP[1] * pk * (0.97 + 0.06 * hueT), cP[2] * pk * (1.05 - 0.2 * hueT)];
          c[0] = lerp(c[0], pc[0], isPeb);
          c[1] = lerp(c[1], pc[1], isPeb);
          c[2] = lerp(c[2], pc[2], isPeb);
          rough = lerp(rough, 0.62, isPeb);
        }
        writePixel(out, i, c, clamp01(h), roughBias(rough, rbias), 0);
      }
    }
  },
};

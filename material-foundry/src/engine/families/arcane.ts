import { hexToLinear, type RGB } from '../color';
import { mulberry32, rehash, subSeed, unit } from '../hash';
import { clamp01, fbm, lerp, segDist, smoothstep } from '../noise';
import { makeCell, panelCell, sdRoundRect } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, toggle, wearParam } from '../params';
import { bool, num, str, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, mixRGB, roughBias, rowProgress, styledOctaves, tone, writeEmissive, writePixel } from './common';

/** A procedurally constructed glyph in normalized [-1, 1] coordinates. */
interface Glyph {
  segs: number[]; // flat list of x0, y0, x1, y1
  rings: number[]; // radius list
  arcs: number[]; // radius, startAngle, endAngle
  dots: number[]; // x, y, r
}

const NODES = [-0.55, 0, 0.55];

/**
 * Build an original rune-like glyph from a seed: strokes between nodes of a 3x3 lattice,
 * optional mirror symmetry, arcs, rings and dots. No external symbol sets are used.
 */
export function buildGlyph(seed: number, complexity: number, frame: boolean): Glyph {
  const rnd = mulberry32(seed);
  const edges: [number, number, number, number][] = [];
  for (let a = 0; a < 9; a++) {
    for (let b = a + 1; b < 9; b++) {
      const ax = a % 3;
      const ay = Math.floor(a / 3);
      const bx = b % 3;
      const by = Math.floor(b / 3);
      if (Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1) edges.push([NODES[ax], NODES[ay], NODES[bx], NODES[by]]);
    }
  }
  const g: Glyph = { segs: [], rings: [], arcs: [], dots: [] };
  const mirror = rnd() < 0.65;
  const count = 2 + Math.floor(complexity * 4 + rnd() * 2);
  const used = new Set<string>();
  const add = (e: [number, number, number, number]) => {
    const key = e.map((v) => v.toFixed(2)).join(',');
    const rkey = [e[2], e[3], e[0], e[1]].map((v) => v.toFixed(2)).join(',');
    if (used.has(key) || used.has(rkey)) return;
    used.add(key);
    g.segs.push(e[0], e[1], e[2], e[3]);
  };
  // A spine gives most glyphs a readable backbone.
  if (rnd() < 0.7) {
    add([0, -0.55, 0, 0]);
    add([0, 0, 0, 0.55]);
  }
  for (let k = 0; k < count; k++) {
    const e = edges[Math.floor(rnd() * edges.length)];
    add(e);
    if (mirror) add([-e[0], e[1], -e[2], e[3]]);
  }
  if (rnd() < 0.35 + complexity * 0.3) {
    const r = 0.25 + rnd() * 0.25;
    const a0 = rnd() * Math.PI * 2;
    g.arcs.push(r, a0, a0 + Math.PI * (0.6 + rnd() * 0.9));
  }
  const dots = Math.floor(rnd() * (1 + complexity * 3));
  for (let k = 0; k < dots; k++) {
    const nx = NODES[Math.floor(rnd() * 3)];
    const ny = NODES[Math.floor(rnd() * 3)];
    g.dots.push(nx * 1.35, ny * 1.35, 0.075);
  }
  if (frame) {
    g.rings.push(0.92);
    if (complexity > 0.6 && rnd() < 0.5) g.rings.push(0.78);
  }
  return g;
}

/** Distance (in normalized glyph units) from a point to the glyph's stroke centrelines. */
export function glyphDistance(g: Glyph, x: number, y: number): number {
  let d = 1e9;
  const s = g.segs;
  for (let k = 0; k < s.length; k += 4) {
    const dd = segDist(x, y, s[k], s[k + 1], s[k + 2], s[k + 3]);
    if (dd < d) d = dd;
  }
  const r = Math.sqrt(x * x + y * y);
  for (let k = 0; k < g.rings.length; k++) d = Math.min(d, Math.abs(r - g.rings[k]));
  for (let k = 0; k < g.arcs.length; k += 3) {
    const rad = g.arcs[k];
    let a = Math.atan2(y, x);
    const a0 = g.arcs[k + 1];
    const a1 = g.arcs[k + 2];
    while (a < a0) a += Math.PI * 2;
    if (a <= a1) d = Math.min(d, Math.abs(r - rad));
    else {
      const ex0 = Math.cos(a0) * rad - x;
      const ey0 = Math.sin(a0) * rad - y;
      const ex1 = Math.cos(a1) * rad - x;
      const ey1 = Math.sin(a1) * rad - y;
      d = Math.min(d, Math.sqrt(ex0 * ex0 + ey0 * ey0), Math.sqrt(ex1 * ex1 + ey1 * ey1));
    }
  }
  for (let k = 0; k < g.dots.length; k += 3) {
    const dx = x - g.dots[k];
    const dy = y - g.dots[k + 1];
    d = Math.min(d, Math.max(0, Math.sqrt(dx * dx + dy * dy) - g.dots[k + 2]));
  }
  return d;
}

export const arcaneFamily: FamilyDefinition = {
  id: 'arcane_stone',
  label: 'Arcane Stone',
  slug: 'arcane_stone',
  description: 'Carved stone slabs bearing original procedurally constructed rune glyphs, with glowing, metal or plain inlays.',
  params: [
    color('colorA', 'Stone color', '#5f6168'),
    color('colorB', 'Stone variation', '#45474f'),
    color('runeColor', 'Inlay / glow color', '#4fd0ff', { help: 'Glow color for glowing inlays, or metal color for metal inlays.' }),
    select('inlay', 'Inlay', [['glow', 'Glowing'], ['metal', 'Metal'], ['carved', 'Carved only']], 'glow', 'emission'),
    range('emissionIntensity', 'Glow intensity', 0, 10, 2, 'emission', { visibleIf: (p) => p.inlay === 'glow' }),
    range('blocks', 'Slabs across', 1, 6, 2, 'pattern', { integer: true }),
    range('runeDensity', 'Rune frequency', 0, 1, 0.75, 'pattern', { help: 'Fraction of slabs carrying a glyph.' }),
    range('complexity', 'Glyph complexity', 0, 1, 0.5, 'pattern'),
    toggle('frame', 'Glyph rings & borders', true, 'pattern'),
    range('jointWidth', 'Joint width', 0, 1, 0.35, 'pattern'),
    styleParam(),
    reliefParam(),
    detailParam(0.5),
    roughnessParam(0.5),
    wearParam('Wear & chips', 0.3),
  ],
  emits: (p) => p.inlay === 'glow' && (p.emissionIntensity as number) > 0,
  variationKeys: [
    { key: 'wear', amount: 0.15 },
    { key: 'complexity', amount: 0.2 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cA = hexToLinear(str(p, 'colorA'));
    const cB = hexToLinear(str(p, 'colorB'));
    const cR = hexToLinear(str(p, 'runeColor'));
    const inlay = str(p, 'inlay', 'glow');
    const blocks = Math.round(num(p, 'blocks', 2));
    const density = num(p, 'runeDensity', 0.75);
    const complexity = num(p, 'complexity', 0.5);
    const frame = bool(p, 'frame', true);
    const jw = lerp(0.0015, 0.008, num(p, 'jointWidth', 0.35));
    const detail = num(p, 'detail', 0.5);
    const rbias = num(p, 'roughness', 0.5);
    const wear = num(p, 'wear', 0.3);
    const bevelW = (0.004 + wear * 0.004) * bevelScale(nat);
    out.depth = 0.02;

    const sE = subSeed(seed, 'edge');
    const sF = subSeed(seed, 'face');
    const sG = subSeed(seed, 'glyph');
    const sC = subSeed(seed, 'col');
    const sL = subSeed(seed, 'glow');
    const cell = makeCell();
    const oF = styledOctaves(ctx, 8, 6);
    const glyphs = new Map<number, Glyph | null>();
    const c: RGB = [0, 0, 0];
    const strokeW = lerp(0.085, 0.06, complexity);

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N + ctx.offsetV;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N + ctx.offsetU;
        const i = (y - ctx.y0) * N + x;
        panelCell(u, v, blocks, blocks, false, seed, cell);
        const id = cell.id;
        let glyph = glyphs.get(id);
        if (glyph === undefined) {
          glyph = unit(rehash(id, 9)) < density ? buildGlyph(rehash(id, sG), complexity, frame) : null;
          glyphs.set(id, glyph);
        }
        let sdf = sdRoundRect(cell.lx, cell.ly, cell.hx - jw, cell.hy - jw, 0.003 * bevelScale(nat));
        const chipN = fbm(u, v, 18, 3, sE) * 0.5 + 0.5;
        sdf += smoothstep(0.6 - wear * 0.2, 0.8, chipN) * wear * 0.01 * lerp(0.4, 1, nat);
        sdf += 0.002 * nat * fbm(u, v, 16, 3, sE + 3);
        const prof = bevelProfile(-sdf, bevelW);
        const faceN = fbm(u, v, 8, oF, sF);
        const r1 = unit(rehash(id, 1));
        let top = 0.78 + 0.05 * faceN + detail * 0.03 * fbm(u, v, 48, styledOctaves(ctx, 48, 3), sF + 5) + (r1 - 0.5) * 0.04;

        // Carved channel: glyph strokes plus an inset border groove.
        let channel = 0;
        let glyphChannel = 0;
        const half = Math.min(cell.hx, cell.hy);
        if (glyph) {
          const scale = half * 0.62;
          const gx = cell.lx / scale;
          const gy = cell.ly / scale;
          let d = glyphDistance(glyph, gx, gy);
          d += wear * 0.03 * nat * fbm(u, v, 32, 2, sE + 7); // eroded carving edges
          channel = 1 - smoothstep(strokeW * 0.55, strokeW, d);
          glyphChannel = channel;
        }
        if (frame) {
          const inset = half * 0.12;
          const bd = Math.abs(sdRoundRect(cell.lx, cell.ly, cell.hx - inset, cell.hy - inset, half * 0.06));
          const bw = half * 0.018;
          channel = Math.max(channel, (1 - smoothstep(bw * 0.5, bw, bd)) * 0.9);
        }
        const onFace = smoothstep(0.6, 1, prof);
        channel *= onFace;
        glyphChannel *= onFace;
        const carveDepth = inlay === 'metal' ? 0.06 : 0.22;
        top -= channel * carveDepth;
        const h = 0.12 + (top - 0.12) * prof;

        // Stone color.
        const t = tone(clamp01(r1 * 0.8 + 0.25 * faceN), nat, 3);
        const base = mixRGB(cA, cB, t);
        const k = 0.85 + 0.25 * tone(fbm(u, v, 6, oF, sC) * 0.5 + 0.5, nat, 3);
        c[0] = base[0] * k;
        c[1] = base[1] * k;
        c[2] = base[2] * k;
        let rough = 0.8 + 0.06 * faceN;
        let metal = 0;
        const inJoint = 1 - smoothstep(0, 0.5, prof);
        c[0] *= 1 - inJoint * 0.55;
        c[1] *= 1 - inJoint * 0.55;
        c[2] *= 1 - inJoint * 0.55;
        if (channel > 0) {
          if (inlay === 'glow') {
            // Only the glyph strokes glow; the border groove is carved stone.
            const flick = 0.7 + 0.3 * (fbm(u, v, 6, 2, sL) * 0.5 + 0.5);
            const core = glyphChannel * glyphChannel * flick;
            writeEmissive(out, i, cR[0] * core, cR[1] * core, cR[2] * core);
            // Inlay material itself: dark, tinted glassy filling.
            c[0] = lerp(c[0], cR[0] * 0.2, glyphChannel);
            c[1] = lerp(c[1], cR[1] * 0.2, glyphChannel);
            c[2] = lerp(c[2], cR[2] * 0.2, glyphChannel);
            const groove = channel - glyphChannel;
            const dk = 1 - Math.max(0, groove) * 0.4;
            c[0] *= dk;
            c[1] *= dk;
            c[2] *= dk;
            rough = lerp(rough, 0.35, glyphChannel);
          } else if (inlay === 'metal') {
            c[0] = lerp(c[0], cR[0], channel);
            c[1] = lerp(c[1], cR[1], channel);
            c[2] = lerp(c[2], cR[2], channel);
            rough = lerp(rough, 0.3 + 0.1 * faceN, channel);
            metal = channel > 0.5 ? 1 : channel * 2;
          } else {
            const dk = 1 - channel * 0.4;
            c[0] *= dk;
            c[1] *= dk;
            c[2] *= dk;
            rough = lerp(rough, 0.9, channel);
          }
        }
        writePixel(out, i, c, h, roughBias(rough, rbias), metal);
      }
    }
  },
};

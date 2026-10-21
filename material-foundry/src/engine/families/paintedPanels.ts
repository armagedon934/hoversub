import { hexToLinear, type RGB } from '../color';
import { rehash, subSeed, unit } from '../hash';
import { clamp01, fbm, lerp, smoothstep } from '../noise';
import { makeCell, panelCell, scratchField, sdHexagon, sdRoundRect } from '../patterns';
import { color, detailParam, range, reliefParam, roughnessParam, select, styleParam, toggle, wearParam } from '../params';
import { num, str, bool, type FamilyDefinition } from '../types';
import { bevelProfile, bevelScale, roughBias, rowProgress, styledOctaves, tone, writePixel } from './common';

export const paintedPanelsFamily: FamilyDefinition = {
  id: 'painted_panels',
  label: 'Painted Metal Panels',
  slug: 'painted_panels',
  description: 'Painted sheet panels with recessed seams, rivets or bolts, and edge wear exposing primer and bare metal.',
  params: [
    color('colorA', 'Paint color', '#3e6a58'),
    color('colorB', 'Primer color', '#8b3d2b'),
    color('metalColor', 'Bare metal color', '#a3a5a8'),
    range('panelsX', 'Panels across', 1, 6, 2, 'pattern', { integer: true }),
    range('panelsY', 'Panels down', 1, 6, 2, 'pattern', { integer: true }),
    toggle('offsetRows', 'Offset alternate rows', false, 'pattern'),
    range('seamWidth', 'Seam width', 0, 1, 0.4, 'pattern'),
    select('fasteners', 'Fasteners', [['rivets', 'Rivets'], ['bolts', 'Hex bolts'], ['none', 'None']], 'rivets', 'pattern'),
    range('rivetSpacing', 'Fastener spacing', 0, 1, 0.5, 'pattern', { visibleIf: (p) => p.fasteners !== 'none' }),
    range('rivetSize', 'Fastener size', 0, 1, 0.5, 'pattern', { visibleIf: (p) => p.fasteners !== 'none' }),
    styleParam(),
    reliefParam(),
    detailParam(0.4),
    roughnessParam(0.5),
    wearParam('Edge wear', 0.4),
    range('scratches', 'Scratches', 0, 1, 0.3, 'wear'),
    range('dirt', 'Dirt & grime', 0, 1, 0.3, 'wear'),
  ],
  emits: () => false,
  variationKeys: [
    { key: 'wear', amount: 0.15 },
    { key: 'scratches', amount: 0.15 },
    { key: 'dirt', amount: 0.15 },
  ],
  generate(ctx, p, out) {
    const N = ctx.size;
    const nat = ctx.natural;
    const seed = ctx.seed;
    const cP = hexToLinear(str(p, 'colorA'));
    const cPr = hexToLinear(str(p, 'colorB'));
    const cMe = hexToLinear(str(p, 'metalColor'));
    const px = Math.round(num(p, 'panelsX', 2));
    const offsetRows = bool(p, 'offsetRows', false);
    let py = Math.round(num(p, 'panelsY', 2));
    if (offsetRows && py % 2 === 1) py += 1; // offset rows alternate, so an even count is needed to tile
    const seam = lerp(0.0008, 0.005, num(p, 'seamWidth', 0.4));
    const fasteners = str(p, 'fasteners', 'rivets');
    const spacing = lerp(0.03, 0.12, num(p, 'rivetSpacing', 0.5));
    const rs = lerp(0.0035, 0.009, num(p, 'rivetSize', 0.5));
    const detail = num(p, 'detail', 0.4);
    const rbias = num(p, 'roughness', 0.5);
    const wear = num(p, 'wear', 0.4);
    const scratches = num(p, 'scratches', 0.3);
    const dirt = num(p, 'dirt', 0.3);
    const bevelW = 0.003 * bevelScale(nat);
    const inset = rs * 2.4 + seam;
    out.depth = 0.01;

    const sW = subSeed(seed, 'wear');
    const sS = subSeed(seed, 'scr');
    const sD = subSeed(seed, 'dirt');
    const sO = subSeed(seed, 'orange');
    const cell = makeCell();
    const oW = styledOctaves(ctx, 16, 5);
    const scrO = { cells: 6, perCell: 3, length: 1.7, angle: 0.3, spread: Math.PI, width: 0.0006 };
    const c: RGB = [0, 0, 0];

    // Distance to the nearest fastener in panel-local coordinates.
    const fastenerDist = (lx: number, ly: number, hx: number, hy: number): [number, number, number] => {
      const ax = hx - inset;
      const ay = hy - inset;
      if (ax <= 0 || ay <= 0) return [1, 0, 0];
      let best = 1e9;
      let bx = 0;
      let by = 0;
      // Horizontal edges.
      const nxs = Math.max(2, Math.round((2 * ax) / spacing) + 1);
      const stepx = (2 * ax) / (nxs - 1);
      const kx = Math.min(nxs - 1, Math.max(0, Math.round((lx + ax) / stepx)));
      const fx = -ax + kx * stepx;
      for (const ey of [-ay, ay]) {
        const dx = lx - fx;
        const dy = ly - ey;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
      const nys = Math.max(2, Math.round((2 * ay) / spacing) + 1);
      const stepy = (2 * ay) / (nys - 1);
      const ky = Math.min(nys - 1, Math.max(0, Math.round((ly + ay) / stepy)));
      const fy = -ay + ky * stepy;
      for (const ex of [-ax, ax]) {
        const dx = lx - ex;
        const dy = ly - fy;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
      return [Math.sqrt(best), bx, by];
    };

    for (let y = ctx.y0; y < ctx.y1; y++) {
      rowProgress(ctx, y);
      const v = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const i = (y - ctx.y0) * N + x;
        panelCell(u, v, px, py, offsetRows, seed, cell);
        const r1 = unit(rehash(cell.id, 1)) - 0.5;
        const r2 = unit(rehash(cell.id, 2)) - 0.5;
        const sdf = sdRoundRect(cell.lx, cell.ly, cell.hx - seam, cell.hy - seam, 0.004 * bevelScale(nat));
        const prof = bevelProfile(-sdf, bevelW);
        // Sheet faces: very slightly warped (oil-canning) per panel.
        const warp = (1 - (cell.lx / cell.hx) ** 2) * (1 - (cell.ly / cell.hy) ** 2) * 0.04 * r1;
        let top = 0.7 + warp + r2 * 0.02;

        // Fasteners.
        let fast = 0;
        let fastTop = 0;
        if (fasteners !== 'none') {
          const [d, fx, fy] = fastenerDist(cell.lx, cell.ly, cell.hx, cell.hy);
          if (fasteners === 'rivets') {
            if (d < rs) {
              const t = d / rs;
              fast = 1;
              fastTop = Math.sqrt(1 - t * t);
            } else {
              fast = 1 - smoothstep(rs, rs * 1.15, d);
            }
            top += fastTop * 0.18;
          } else {
            const hex = sdHexagon(fx, fy, rs * 0.85, 1);
            const washer = d - rs * 1.25;
            if (washer < 0) {
              top += 0.05;
              fast = 1;
            }
            if (hex < 0) {
              top += 0.17 + Math.min(0.03, -hex * 4);
              fastTop = 1;
            }
          }
        }

        // Paint wear: concentrated on panel edges, fastener heads and random spots.
        const edgeProx = 1 - smoothstep(0, 0.02 + wear * 0.02, -sdf);
        const wn = fbm(u, v, 16, oW, sW) * 0.5 + 0.5;
        const wearField = clamp01(edgeProx * 0.8 + fastTop * 0.7 + (wn - 0.5) * 1.2) * wear;
        const chip = smoothstep(0.35, lerp(0.38, 0.5, nat), wearField * (0.6 + 0.8 * wn));
        const toMetal = smoothstep(0.55, lerp(0.58, 0.7, nat), wearField * (0.5 + wn));
        const scr = scratches > 0 ? scratchField(u, v, sS, scrO) * scratches : 0;
        const scrMetal = smoothstep(0.25, 0.5, scr);
        const exposedMetal = Math.max(toMetal, scrMetal);
        const exposedPrimer = Math.max(chip, scr * 0.6) * (1 - exposedMetal);
        top -= chip * 0.025 + exposedMetal * 0.015;
        top += detail * 0.012 * fbm(u, v, 48, styledOctaves(ctx, 48, 3), sO); // paint orange-peel

        const h = 0.15 + (top - 0.15) * prof;

        // Layered color: paint -> primer -> metal.
        const pv = 1 + r1 * 0.08 + (tone(fbm(u, v, 4, 3, sO + 3) * 0.5 + 0.5, nat, 3) - 0.5) * 0.1;
        c[0] = cP[0] * pv;
        c[1] = cP[1] * pv;
        c[2] = cP[2] * pv;
        c[0] = lerp(c[0], cPr[0], exposedPrimer);
        c[1] = lerp(c[1], cPr[1], exposedPrimer);
        c[2] = lerp(c[2], cPr[2], exposedPrimer);
        c[0] = lerp(c[0], cMe[0], exposedMetal);
        c[1] = lerp(c[1], cMe[1], exposedMetal);
        c[2] = lerp(c[2], cMe[2], exposedMetal);
        let rough = lerp(lerp(0.45, 0.7, exposedPrimer), 0.32, exposedMetal);
        // Grime gathers in seams and around fasteners; dielectric dirt on top of everything.
        if (dirt > 0) {
          const seamDirt = 1 - smoothstep(0, 0.012, -sdf);
          const ring = fast > 0 && fastTop === 0 ? 0.6 : 0;
          const g = clamp01(dirt * (seamDirt * 0.8 + ring + smoothstep(0.55, 0.85, fbm(u, v, 3, 4, sD) * 0.5 + 0.5) * 0.5));
          const dk = 1 - g * 0.55;
          c[0] *= dk;
          c[1] *= dk * 0.97;
          c[2] *= dk * 0.92;
          rough = lerp(rough, 0.85, g * 0.6);
        }
        const inSeam = 1 - smoothstep(0, 0.5, prof);
        c[0] *= 1 - inSeam * 0.5;
        c[1] *= 1 - inSeam * 0.5;
        c[2] *= 1 - inSeam * 0.5;
        const metal = exposedMetal * (1 - inSeam);
        writePixel(out, i, c, h, roughBias(rough, rbias), metal);
      }
    }
  },
};

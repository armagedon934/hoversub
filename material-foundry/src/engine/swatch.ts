// Lit 2D swatch used for gallery / variation thumbnails and the no-WebGL fallback view.
// This is a preview rendering (simple directional light + ambient) computed from the maps;
// it is never written back into any texture map.

import type { PackedMaps } from './maps';

const toLin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toSrgb8(x: number): number {
  const c = x <= 0 ? 0 : x >= 1 ? 1 : x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

export interface SwatchLight {
  /** Light direction in tangent space (x right, y up, z out of surface). */
  dir: [number, number, number];
  intensity: number;
  emissionStrength: number;
}

export const DEFAULT_SWATCH_LIGHT: SwatchLight = { dir: [-0.45, 0.55, 0.7], intensity: 1, emissionStrength: 1 };

/** Render an RGBA swatch the same size as the maps. */
export function renderSwatch(m: PackedMaps, light: SwatchLight = DEFAULT_SWATCH_LIGHT): Uint8ClampedArray {
  const n = m.size * m.size;
  const out = new Uint8ClampedArray(n * 4);
  let [lx, ly, lz] = light.dir;
  const ll = Math.hypot(lx, ly, lz);
  lx /= ll;
  ly /= ll;
  lz /= ll;
  // Half vector with the viewer straight above.
  let hx = lx;
  let hy = ly;
  let hz = lz + 1;
  const hl = Math.hypot(hx, hy, hz);
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const emK = Math.min(3, light.emissionStrength) * 0.6;
  for (let i = 0; i < n; i++) {
    const i4 = i * 4;
    const nx = m.normal[i4] / 127.5 - 1;
    const ny = m.normal[i4 + 1] / 127.5 - 1;
    const nz = m.normal[i4 + 2] / 127.5 - 1;
    const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
    const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
    const rough = Math.max(0.04, m.roughness[i] / 255);
    const metal = m.metallic[i] / 255;
    const ao = m.ao[i] / 255;
    const a2 = rough * rough * rough * rough;
    const d = ndh * ndh * (a2 - 1) + 1;
    const D = a2 / (Math.PI * d * d);
    const specK = Math.min(D * 0.25, 6) * ndl;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let c = 0; c < 3; c++) {
      const base = toLin[m.baseColor[i4 + c]];
      const f0 = 0.04 * (1 - metal) + base * metal;
      const diff = base * (1 - metal);
      let v = diff * (ndl * 0.95 * light.intensity + 0.22 * ao) + f0 * (specK * light.intensity + 0.35 * ao);
      if (m.emissive) v += toLin[m.emissive[i4 + c]] * emK;
      if (c === 0) r = v;
      else if (c === 1) g = v;
      else b = v;
    }
    out[i4] = toSrgb8(r / (1 + r * 0.15));
    out[i4 + 1] = toSrgb8(g / (1 + g * 0.15));
    out[i4 + 2] = toSrgb8(b / (1 + b * 0.15));
    out[i4 + 3] = 255;
  }
  return out;
}

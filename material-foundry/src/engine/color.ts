// Color helpers. Material colors are authored as sRGB hex strings, blended in linear space,
// and encoded back to 8-bit sRGB for base color / emissive maps.

export type RGB = [number, number, number];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && HEX_RE.test(s);
}

/** Parse "#rrggbb" into linear RGB components. */
export function hexToLinear(hex: string): RGB {
  const m = HEX_RE.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

export function linearToHex(c: RGB): string {
  const to = (x: number) =>
    Math.round(linearToSrgb(x) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

// Lookup table for fast linear -> 8-bit sRGB encoding (4096 entries, max error < 0.5 LSB).
const LUT_SIZE = 4096;
const SRGB_LUT = new Uint8Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  SRGB_LUT[i] = Math.round(linearToSrgb(i / LUT_SIZE) * 255);
}

export function linearTo8(c: number): number {
  if (!(c > 0)) return 0;
  if (c >= 1) return 255;
  // Use exact conversion in the darkest range where the LUT step is coarse relative to sRGB.
  if (c < 0.01) return Math.round(linearToSrgb(c) * 255);
  return SRGB_LUT[(c * LUT_SIZE + 0.5) | 0];
}

export function mix3(out: RGB, a: RGB, b: RGB, t: number): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function luminance(c: RGB): number {
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

/** Adjust saturation of a linear color around its luminance. */
export function saturate(c: RGB, s: number): RGB {
  const l = luminance(c);
  return [l + (c[0] - l) * s, l + (c[1] - l) * s, l + (c[2] - l) * s];
}

/** Scale a color's brightness (linear multiply). */
export function scale3(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Shift hue slightly by rotating in a simple YIQ-like space (small angles only). */
export function hueShift(c: RGB, angle: number): RGB {
  const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const i = 0.596 * c[0] - 0.274 * c[1] - 0.322 * c[2];
  const q = 0.211 * c[0] - 0.523 * c[1] + 0.312 * c[2];
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  const i2 = i * cs - q * sn;
  const q2 = i * sn + q * cs;
  return [
    Math.max(0, y + 0.956 * i2 + 0.621 * q2),
    Math.max(0, y - 0.272 * i2 - 0.647 * q2),
    Math.max(0, y - 1.106 * i2 + 1.703 * q2),
  ];
}

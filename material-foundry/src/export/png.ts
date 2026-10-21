// Minimal lossless PNG encoder (8-bit gray/RGB/RGBA and 16-bit gray) built on fflate's zlib.
// Works identically in the browser, in Web Workers and in Node (used by tests and scripts).

import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, start = 0, end = data.length, crc = 0xffffffff): number {
  let c = crc;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return c;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out, 4, 8 + data.length) ^ 0xffffffff;
  dv.setUint32(8 + data.length, crc >>> 0);
  return out;
}

export type PngColorType = 'gray' | 'rgb' | 'rgba';

export interface PngOptions {
  width: number;
  height: number;
  colorType: PngColorType;
  bitDepth: 8 | 16;
  /** Mark the image as sRGB encoded (color data). Omit for non-color data maps. */
  srgb?: boolean;
  /** zlib level 1..9 */
  level?: number;
  /** Optional tEXt metadata. */
  text?: Record<string, string>;
}

const CHANNELS: Record<PngColorType, number> = { gray: 1, rgb: 3, rgba: 4 };
const TYPE_CODE: Record<PngColorType, number> = { gray: 0, rgb: 2, rgba: 6 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Encode raw samples. `samples` holds width*height*channels values: bytes for 8-bit, and
 * 0..65535 integers for 16-bit (written big-endian as PNG requires).
 */
export function encodePng(samples: ArrayLike<number>, o: PngOptions): Uint8Array {
  const ch = CHANNELS[o.colorType];
  const bpp = ch * (o.bitDepth / 8); // bytes per pixel
  const stride = o.width * bpp;
  if (samples.length !== o.width * o.height * ch) {
    throw new Error(`PNG encode: expected ${o.width * o.height * ch} samples, got ${samples.length}`);
  }
  // Serialize to raw bytes.
  const raw = new Uint8Array(stride * o.height);
  if (o.bitDepth === 8) {
    for (let i = 0; i < raw.length; i++) raw[i] = samples[i];
  } else {
    for (let i = 0, j = 0; i < samples.length; i++, j += 2) {
      const v = samples[i];
      raw[j] = (v >>> 8) & 0xff;
      raw[j + 1] = v & 0xff;
    }
  }
  // Adaptive filtering (per-row heuristic: minimum sum of absolute signed residuals).
  const filtered = new Uint8Array((stride + 1) * o.height);
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  for (let y = 0; y < o.height; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    let bestType = 0;
    let bestScore = Infinity;
    for (let t = 0; t < 5; t++) {
      const outRow = cand[t];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const cur = raw[row + x];
        const a = x >= bpp ? raw[row + x - bpp] : 0;
        const b = prev >= 0 ? raw[prev + x] : 0;
        const c = prev >= 0 && x >= bpp ? raw[prev + x - bpp] : 0;
        let val: number;
        switch (t) {
          case 0:
            val = cur;
            break;
          case 1:
            val = cur - a;
            break;
          case 2:
            val = cur - b;
            break;
          case 3:
            val = cur - ((a + b) >> 1);
            break;
          default:
            val = cur - paeth(a, b, c);
        }
        val &= 0xff;
        outRow[x] = val;
        score += val < 128 ? val : 256 - val;
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = t;
      }
    }
    // Recompute the winning row fully (the loop above may have stopped early).
    const outRow = cand[bestType];
    for (let x = 0; x < stride; x++) {
      const cur = raw[row + x];
      const a = x >= bpp ? raw[row + x - bpp] : 0;
      const b = prev >= 0 ? raw[prev + x] : 0;
      const c = prev >= 0 && x >= bpp ? raw[prev + x - bpp] : 0;
      let val: number;
      switch (bestType) {
        case 0:
          val = cur;
          break;
        case 1:
          val = cur - a;
          break;
        case 2:
          val = cur - b;
          break;
        case 3:
          val = cur - ((a + b) >> 1);
          break;
        default:
          val = cur - paeth(a, b, c);
      }
      outRow[x] = val & 0xff;
    }
    const o2 = y * (stride + 1);
    filtered[o2] = bestType;
    filtered.set(outRow, o2 + 1);
  }
  const idat = zlibSync(filtered, { level: (o.level ?? 6) as 6 });

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, o.width);
  dv.setUint32(4, o.height);
  ihdr[8] = o.bitDepth;
  ihdr[9] = TYPE_CODE[o.colorType];
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (o.srgb) parts.push(chunk('sRGB', new Uint8Array([0])));
  if (o.text) {
    for (const [k, v] of Object.entries(o.text)) {
      const enc = new TextEncoder().encode(`${k}\0${v}`);
      parts.push(chunk('tEXt', enc));
    }
  }
  parts.push(chunk('IDAT', idat));
  parts.push(chunk('IEND', new Uint8Array(0)));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Drop alpha from an RGBA buffer. */
export function rgbaToRgb(rgba: ArrayLike<number>): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = rgba[i * 4];
    out[i * 3 + 1] = rgba[i * 4 + 1];
    out[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return out;
}

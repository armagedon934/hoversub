// Test helpers: an independent minimal PNG decoder (for round-trip checks) and image statistics.
import { unzlibSync } from 'fflate';

export interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  channels: number;
  /** Samples (8- or 16-bit values) in row-major order. */
  data: number[] | Uint16Array | Uint8Array;
  chunks: string[];
  crcOk: boolean;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  sig.forEach((b, i) => {
    if (bytes[i] !== b) throw new Error('bad PNG signature');
  });
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  const chunks: string[] = [];
  let crcOk = true;
  while (off < bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const data = bytes.subarray(off + 8, off + 8 + len);
    const crc = dv.getUint32(off + 8 + len);
    if (crc32(bytes.subarray(off + 4, off + 8 + len)) !== crc) crcOk = false;
    chunks.push(type);
    if (type === 'IHDR') {
      const h = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = h.getUint32(0);
      height = h.getUint32(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const total = idat.reduce((a, b) => a + b.length, 0);
  const z = new Uint8Array(total);
  let p = 0;
  for (const d of idat) {
    z.set(d, p);
    p += d.length;
  }
  const raw = unzlibSync(z);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 0;
  const bpp = (channels * bitDepth) / 8;
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  let data: Uint8Array | Uint16Array = out;
  if (bitDepth === 16) {
    const d16 = new Uint16Array(width * height * channels);
    for (let i = 0; i < d16.length; i++) d16[i] = (out[i * 2] << 8) | out[i * 2 + 1];
    data = d16;
  }
  return { width, height, bitDepth, colorType, channels, data, chunks, crcOk };
}

/** Mean absolute difference between horizontally / vertically adjacent texels, split into
 * interior pairs and wrap-around pairs (last column -> first column, last row -> first row). */
export function seamStats(get: (x: number, y: number) => number, size: number) {
  let interiorX = 0;
  let wrapX = 0;
  let interiorY = 0;
  let wrapY = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 1; x++) interiorX += Math.abs(get(x + 1, y) - get(x, y));
    wrapX += Math.abs(get(0, y) - get(size - 1, y));
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size - 1; y++) interiorY += Math.abs(get(x, y + 1) - get(x, y));
    wrapY += Math.abs(get(x, 0) - get(x, size - 1));
  }
  return {
    interiorX: interiorX / (size * (size - 1)),
    wrapX: wrapX / size,
    interiorY: interiorY / (size * (size - 1)),
    wrapY: wrapY / size,
  };
}

export function variance(a: ArrayLike<number>, stride = 1, offset = 0): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let i = offset; i < a.length; i += stride) {
    s += a[i];
    s2 += a[i] * a[i];
    n++;
  }
  const m = s / n;
  return s2 / n - m * m;
}

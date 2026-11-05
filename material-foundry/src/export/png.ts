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

const FILTER_TYPES = 5;

/** Apply PNG filter `t` to one row; returns the score (sum of absolute signed residuals). */
function filterRow(t: number, raw: Uint8Array, prev: Uint8Array | null, bpp: number, out: Uint8Array, limit: number): number {
  const stride = raw.length;
  let score = 0;
  for (let x = 0; x < stride; x++) {
    const cur = raw[x];
    const a = x >= bpp ? raw[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= bpp ? prev[x - bpp] : 0;
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
    out[x] = val;
    score += val < 128 ? val : 256 - val;
    if (score >= limit) return score;
  }
  return score;
}

const IDAT_TARGET = 1 << 20;

export interface PngParts {
  /** The PNG file as consecutive byte parts (header, IDAT chunks, IEND). */
  parts: Uint8Array[];
  length: number;
  /** CRC-32 of the complete file (as needed for ZIP entries). */
  crc: number;
}

/**
 * Streaming PNG encoder: rows are filtered and deflated as they arrive, so an 8192x8192 image never
 * has to exist in memory uncompressed. Output is a list of parts (IDAT chunks of ~1 MB).
 *
 * Compression uses the platform's native CompressionStream('deflate') (zlib format). fflate's
 * streaming Zlib class was not used here: it produced corrupt streams for some sparse inputs pushed
 * in many pieces (found by this project's tests); its one-shot zlibSync is fine and is used by
 * encodePng below.
 */
export class PngStreamEncoder {
  private readonly o: PngOptions;
  private readonly ch: number;
  private readonly bpp: number;
  private readonly stride: number;
  private prev: Uint8Array | null = null;
  private rowsDone = 0;
  private readonly writer: WritableStreamDefaultWriter<BufferSource>;
  private readonly reading: Promise<void>;
  private pending: Uint8Array[] = [];
  private pendingLen = 0;
  private batch: Uint8Array[] = [];
  private batchLen = 0;
  private readonly out: Uint8Array[] = [];
  private length = 0;
  private fileCrc = 0xffffffff;
  private readonly cand: Uint8Array[];
  private finished = false;

  constructor(o: PngOptions) {
    this.o = o;
    this.ch = CHANNELS[o.colorType];
    this.bpp = this.ch * (o.bitDepth / 8);
    this.stride = o.width * this.bpp;
    this.cand = Array.from({ length: FILTER_TYPES }, () => new Uint8Array(this.stride));
    this.emitHeader();
    const cs = new CompressionStream('deflate');
    this.writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    this.reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          this.pending.push(value);
          this.pendingLen += value.length;
          if (this.pendingLen >= IDAT_TARGET) this.flushIdat();
        }
      }
      if (this.pendingLen > 0) this.flushIdat();
    })();
  }

  private emitHeader(): void {
    const o = this.o;
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, o.width);
    dv.setUint32(4, o.height);
    ihdr[8] = o.bitDepth;
    ihdr[9] = TYPE_CODE[o.colorType];
    this.emit(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    this.emit(chunk('IHDR', ihdr));
    if (o.srgb) this.emit(chunk('sRGB', new Uint8Array([0])));
    if (o.text) for (const [k, v] of Object.entries(o.text)) this.emit(chunk('tEXt', new TextEncoder().encode(`${k}\0${v}`)));
  }

  private emit(part: Uint8Array): void {
    this.out.push(part);
    this.length += part.length;
    this.fileCrc = crc32(part, 0, part.length, this.fileCrc);
  }

  private flushIdat(): void {
    const data = new Uint8Array(this.pendingLen);
    let off = 0;
    for (const p of this.pending) {
      data.set(p, off);
      off += p.length;
    }
    this.pending = [];
    this.pendingLen = 0;
    this.emit(chunk('IDAT', data));
  }

  private async writeBatch(): Promise<void> {
    if (!this.batchLen) return;
    const data = new Uint8Array(this.batchLen);
    let off = 0;
    for (const b of this.batch) {
      data.set(b, off);
      off += b.length;
    }
    this.batch = [];
    this.batchLen = 0;
    await this.writer.ready;
    await this.writer.write(data);
  }

  /** Push `rows` complete rows of samples (bytes for 8-bit, 0..65535 for 16-bit). */
  async pushRows(samples: ArrayLike<number>, rows: number): Promise<void> {
    const perRow = this.o.width * this.ch;
    if (samples.length < perRow * rows) throw new Error('PNG stream: not enough samples');
    if (this.rowsDone + rows > this.o.height) throw new Error('PNG stream: too many rows');
    for (let r = 0; r < rows; r++) {
      const raw = serializeRow(samples, r * perRow, perRow, this.o.bitDepth, this.stride);
      const line = new Uint8Array(this.stride + 1);
      writeFilteredLine(raw, this.prev, this.bpp, this.cand, line);
      this.prev = raw;
      this.rowsDone++;
      this.batch.push(line);
      this.batchLen += line.length;
      if (this.batchLen >= 1 << 18) await this.writeBatch();
    }
  }

  async finish(): Promise<PngParts> {
    if (this.finished) throw new Error('PNG stream already finished');
    if (this.rowsDone !== this.o.height) throw new Error(`PNG stream: ${this.rowsDone} of ${this.o.height} rows written`);
    this.finished = true;
    await this.writeBatch();
    await this.writer.close();
    await this.reading;
    this.emit(chunk('IEND', new Uint8Array(0)));
    return { parts: this.out, length: this.length, crc: (this.fileCrc ^ 0xffffffff) >>> 0 };
  }
}

function serializeRow(samples: ArrayLike<number>, base: number, perRow: number, bitDepth: number, stride: number): Uint8Array {
  const raw = new Uint8Array(stride);
  if (bitDepth === 8) {
    for (let i = 0; i < perRow; i++) raw[i] = samples[base + i];
  } else {
    for (let i = 0, j = 0; i < perRow; i++, j += 2) {
      const v = samples[base + i];
      raw[j] = (v >>> 8) & 0xff;
      raw[j + 1] = v & 0xff;
    }
  }
  return raw;
}

/** Choose the best filter for a row (minimum sum of absolute residuals) and write type + data into `line`. */
function writeFilteredLine(raw: Uint8Array, prev: Uint8Array | null, bpp: number, cand: Uint8Array[], line: Uint8Array): void {
  let best = 0;
  let bestScore = Infinity;
  for (let t = 0; t < FILTER_TYPES; t++) {
    const sc = filterRow(t, raw, prev, bpp, cand[t], bestScore);
    if (sc < bestScore) {
      bestScore = sc;
      best = t;
    }
  }
  filterRow(best, raw, prev, bpp, cand[best], Infinity);
  line[0] = best;
  line.set(cand[best], 1);
}

/** Concatenate parts into one buffer. */
export function joinParts(parts: Uint8Array[], length?: number): Uint8Array {
  const out = new Uint8Array(length ?? parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Encode raw samples in one shot (fflate zlibSync). `samples` holds width*height*channels values:
 * bytes for 8-bit, and 0..65535 integers for 16-bit (written big-endian as PNG requires).
 */
export function encodePng(samples: ArrayLike<number>, o: PngOptions): Uint8Array {
  const ch = CHANNELS[o.colorType];
  if (samples.length !== o.width * o.height * ch) {
    throw new Error(`PNG encode: expected ${o.width * o.height * ch} samples, got ${samples.length}`);
  }
  const bpp = ch * (o.bitDepth / 8);
  const stride = o.width * bpp;
  const perRow = o.width * ch;
  const filtered = new Uint8Array((stride + 1) * o.height);
  const cand = Array.from({ length: FILTER_TYPES }, () => new Uint8Array(stride));
  const line = new Uint8Array(stride + 1);
  let prev: Uint8Array | null = null;
  for (let y = 0; y < o.height; y++) {
    const raw = serializeRow(samples, y * perRow, perRow, o.bitDepth, stride);
    writeFilteredLine(raw, prev, bpp, cand, line);
    filtered.set(line, y * (stride + 1));
    prev = raw;
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, o.width);
  dv.setUint32(4, o.height);
  ihdr[8] = o.bitDepth;
  ihdr[9] = TYPE_CODE[o.colorType];
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (o.srgb) parts.push(chunk('sRGB', new Uint8Array([0])));
  if (o.text) for (const [k, v] of Object.entries(o.text)) parts.push(chunk('tEXt', new TextEncoder().encode(`${k}\0${v}`)));
  parts.push(chunk('IDAT', zlibSync(filtered, { level: (o.level ?? 6) as 6 })));
  parts.push(chunk('IEND', new Uint8Array(0)));
  return joinParts(parts);
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

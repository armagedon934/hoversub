// Minimal ZIP writer (store method) that works on lists of byte parts, so multi-hundred-megabyte
// 8K exports can be assembled into a Blob without ever being concatenated in memory.

import { crc32 } from './png';

export interface ZipEntry {
  name: string;
  parts: Uint8Array[];
  length: number;
  /** CRC-32 of the entry data. */
  crc: number;
}

export function entryFromBytes(name: string, data: Uint8Array): ZipEntry {
  return { name, parts: [data], length: data.length, crc: (crc32(data) ^ 0xffffffff) >>> 0 };
}

function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/** Build a stored (uncompressed) ZIP archive as a list of parts. Throws above the 4 GB ZIP32 limit. */
export function zipParts(entries: ZipEntry[], when = new Date()): { parts: Uint8Array[]; length: number } {
  const enc = new TextEncoder();
  const [time, date] = dosDateTime(when);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const lh = new Uint8Array(30 + name.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0x0800, true); // UTF-8 names
    dv.setUint16(8, 0, true); // stored
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, e.crc, true);
    dv.setUint32(18, e.length, true);
    dv.setUint32(22, e.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.length, true);
    cv.setUint32(24, e.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    parts.push(lh, ...e.parts);
    offset += lh.length + e.length;
    if (offset > 0xffffffff) throw new Error('Archive exceeds the 4 GB ZIP limit');
  }
  const cdStart = offset;
  let cdLen = 0;
  for (const c of central) {
    parts.push(c);
    cdLen += c.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdLen, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end);
  return { parts, length: cdStart + cdLen + 22 };
}

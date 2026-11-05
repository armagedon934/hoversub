// Streaming encoder for strip-based (4K/8K) exports: receives strips in row order and feeds each
// requested map into its own streaming PNG encoder. AO (and the AO channel of ORM) is computed per
// pixel from the full-resolution height and a low-resolution periodic proxy (see aoFromProxy).

import { aoFromProxy, buildAOProxy, quantize8, type AOProxy } from '../engine/maps';
import type { StripData } from '../engine/strip';
import type { ExportOptions, MapId } from './exporter';
import { PngStreamEncoder, type PngParts } from './png';

export interface StripEncoderConfig {
  size: number;
  maps: MapId[];
  opts: ExportOptions;
  level?: number;
  /** Required when 'ao' or 'orm' is requested. */
  proxy?: { size: number; height: Float32Array; depth: number; strength: number };
}

export type StripInput = Partial<StripData> & { y0: number; rows: number };

/** Which strip arrays a set of maps needs (used to route data to encoder workers). */
export function stripFieldsFor(maps: MapId[]): (keyof StripData)[] {
  const need = new Set<keyof StripData>();
  for (const m of maps) {
    if (m === 'basecolor') need.add('base');
    if (m === 'normal') {
      need.add('normal8');
      need.add('normal16');
    }
    if (m === 'roughness' || m === 'orm') need.add('rough');
    if (m === 'metallic' || m === 'orm') need.add('metal');
    if (m === 'height' || m === 'ao' || m === 'orm') need.add('height16');
    if (m === 'emissive') need.add('emissive');
  }
  return [...need];
}

export class StripEncoderSet {
  private readonly cfg: StripEncoderConfig;
  private readonly encoders = new Map<MapId, PngStreamEncoder>();
  private readonly proxy: AOProxy | null;
  private nextRow = 0;
  private busy = false;

  constructor(cfg: StripEncoderConfig) {
    this.cfg = cfg;
    const { size, opts } = cfg;
    const level = cfg.level ?? 6;
    for (const m of cfg.maps) {
      const base = { width: size, height: size, level };
      let enc: PngStreamEncoder;
      switch (m) {
        case 'basecolor':
        case 'emissive':
          enc = new PngStreamEncoder({ ...base, colorType: 'rgb', bitDepth: 8, srgb: true });
          break;
        case 'normal':
          enc = new PngStreamEncoder({ ...base, colorType: 'rgb', bitDepth: opts.normalBitDepth === 16 ? 16 : 8 });
          break;
        case 'height':
          enc = new PngStreamEncoder({ ...base, colorType: 'gray', bitDepth: opts.heightBitDepth });
          break;
        case 'orm':
          enc = new PngStreamEncoder({ ...base, colorType: 'rgb', bitDepth: 8 });
          break;
        default:
          enc = new PngStreamEncoder({ ...base, colorType: 'gray', bitDepth: 8 });
      }
      this.encoders.set(m, enc);
    }
    const needsAo = cfg.maps.includes('ao') || cfg.maps.includes('orm');
    if (needsAo) {
      if (!cfg.proxy) throw new Error('AO export needs a height proxy');
      this.proxy = buildAOProxy(cfg.proxy.height, cfg.proxy.size, cfg.proxy.depth, cfg.proxy.strength);
    } else this.proxy = null;
  }

  async pushStrip(s: StripInput): Promise<void> {
    if (this.busy) throw new Error('pushStrip called before the previous strip finished');
    if (s.y0 !== this.nextRow) throw new Error(`Strip out of order: got row ${s.y0}, expected ${this.nextRow}`);
    this.busy = true;
    const { size, opts } = this.cfg;
    const n = size * s.rows;
    let ao: Uint8Array | null = null;
    if (this.proxy) {
      const h = s.height16!;
      ao = new Uint8Array(n);
      for (let r = 0; r < s.rows; r++) {
        const y = s.y0 + r;
        for (let x = 0; x < size; x++) {
          const i = r * size + x;
          ao[i] = quantize8(aoFromProxy(this.proxy, x, y, size, h[i] / 65535));
        }
      }
    }
    for (const [m, enc] of this.encoders) {
      switch (m) {
        case 'basecolor':
          await enc.pushRows(s.base!, s.rows);
          break;
        case 'emissive':
          await enc.pushRows(s.emissive!, s.rows);
          break;
        case 'normal': {
          const dx = opts.normalConvention === 'directx';
          if (opts.normalBitDepth === 16) {
            let d: Uint16Array = s.normal16!;
            if (dx) {
              d = new Uint16Array(d);
              for (let i = 1; i < d.length; i += 3) d[i] = 65535 - d[i];
            }
            await enc.pushRows(d, s.rows);
          } else {
            let d: Uint8Array = s.normal8!;
            if (dx) {
              d = new Uint8Array(d);
              for (let i = 1; i < d.length; i += 3) d[i] = 255 - d[i];
            }
            await enc.pushRows(d, s.rows);
          }
          break;
        }
        case 'roughness':
          await enc.pushRows(s.rough!, s.rows);
          break;
        case 'metallic':
          await enc.pushRows(s.metal!, s.rows);
          break;
        case 'height':
          if (opts.heightBitDepth === 16) await enc.pushRows(s.height16!, s.rows);
          else await enc.pushRows(Uint8Array.from(s.height16!, (h) => Math.round(h / 257)), s.rows);
          break;
        case 'ao':
          await enc.pushRows(ao!, s.rows);
          break;
        case 'orm': {
          const orm = new Uint8Array(n * 3);
          for (let i = 0; i < n; i++) {
            orm[i * 3] = ao![i];
            orm[i * 3 + 1] = s.rough![i];
            orm[i * 3 + 2] = s.metal![i];
          }
          await enc.pushRows(orm, s.rows);
          break;
        }
      }
    }
    this.busy = false;
    this.nextRow += s.rows;
  }

  async finish(): Promise<{ map: MapId; png: PngParts }[]> {
    const out: { map: MapId; png: PngParts }[] = [];
    for (const [map, enc] of this.encoders) out.push({ map, png: await enc.finish() });
    return out;
  }
}

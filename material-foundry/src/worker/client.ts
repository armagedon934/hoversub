// High-level generation / export API on top of the worker pool.

import { resolveSettings, type GeneratedMaterial } from '../engine/generate';
import { CancelledError, createFields } from '../engine/fields';
import type { StripData } from '../engine/strip';
import { stripFieldsFor, type StripEncoderConfig } from '../export/stripEncoder';
import type { PngParts } from '../export/png';

import { getFamily } from '../engine/registry';
import type { MaterialSettings } from '../engine/types';
import { applicableMaps, mapsSubset, type ExportOptions, type MapId } from '../export/exporter';
import { fieldsTransferables } from './protocol';
import { JobToken, Priority, WorkerPool } from './pool';

let pool: WorkerPool | null = null;

export function getPool(): WorkerPool {
  if (!pool) {
    const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    const n = Math.max(2, Math.min(6, hc - 1));
    pool = new WorkerPool(() => new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' }), n);
  }
  return pool;
}

export type ProgressCallback = (stage: string, fraction: number) => void;

const BAND_ROWS = 32;

/** Generate a material using all pool workers (row bands in parallel, then derivation). */
export async function generateParallel(
  settings: MaterialSettings,
  size: number,
  opts: { priority: Priority; token: JobToken; onProgress?: ProgressCallback },
): Promise<GeneratedMaterial> {
  const p = getPool();
  const t0 = performance.now();
  const bandRows = size <= 128 ? size : BAND_ROWS;
  const bandCount = Math.ceil(size / bandRows);
  const bandProgress = new Float32Array(bandCount);
  const report = () => {
    let s = 0;
    for (let i = 0; i < bandCount; i++) s += bandProgress[i];
    opts.onProgress?.('Generating material fields', (0.75 * s) / bandCount);
  };
  report();
  // The complete field set is allocated once; each band is copied in as soon as it arrives so
  // its buffers can be released immediately (keeps peak memory near one copy of the fields).
  const resolved = resolveSettings(settings);
  const fields = createFields(size, getFamily(resolved.family).emits(resolved.params), size);
  const bandPromises: Promise<void>[] = [];
  for (let b = 0; b < bandCount; b++) {
    const y0 = b * bandRows;
    const y1 = Math.min(size, y0 + bandRows);
    bandPromises.push(
      p
        .run(
          { kind: 'band', settings, size, y0, y1 },
          {
            priority: opts.priority,
            token: opts.token,
            onProgress: (_s, f) => {
              bandProgress[b] = f;
              report();
            },
          },
        )
        .then((r) => {
          if (r.kind !== 'band') throw new Error('Unexpected worker result');
          const f = r.fields;
          fields.depth = f.depth;
          fields.albedo.set(f.albedo, y0 * size * 3);
          fields.height.set(f.height, y0 * size);
          fields.rough.set(f.rough, y0 * size);
          fields.metal.set(f.metal, y0 * size);
          if (fields.emissive && f.emissive) fields.emissive.set(f.emissive, y0 * size * 3);
          bandProgress[b] = 1;
          report();
        }),
    );
  }
  try {
    await Promise.all(bandPromises);
  } catch (e) {
    opts.token.cancel(); // stop sibling bands
    throw e;
  }
  const tFields = performance.now() - t0;
  const r = await p.run(
    { kind: 'finish', settings, fields },
    {
      priority: opts.priority,
      token: opts.token,
      transfer: fieldsTransferables(fields),
      onProgress: (stage, f) => opts.onProgress?.(stage, 0.75 + 0.25 * f),
    },
  );
  if (r.kind !== 'finish') throw new Error('Unexpected worker result');
  r.material.timings.fields = tFields;
  r.material.timings.total = performance.now() - t0;
  opts.onProgress?.('Done', 1);
  return r.material;
}

export async function generateThumbnail(
  settings: MaterialSettings,
  size: number,
  token: JobToken,
  priority = Priority.Normal,
): Promise<{ material: GeneratedMaterial; swatch: Uint8ClampedArray }> {
  const r = await getPool().run({ kind: 'thumb', settings, size }, { priority, token });
  if (r.kind !== 'thumb') throw new Error('Unexpected worker result');
  return { material: r.material, swatch: r.swatch };
}

export async function encodeMapInWorker(
  material: GeneratedMaterial,
  map: MapId,
  opts: ExportOptions,
  token: JobToken,
  priority = Priority.Normal,
): Promise<Uint8Array> {
  const r = await getPool().run({ kind: 'encode', maps: mapsSubset(material.maps, map), map, opts }, { priority, token });
  if (r.kind !== 'encode') throw new Error('Unexpected worker result');
  return r.png;
}

/** Encode all applicable maps in parallel and assemble the ZIP in a worker. */
export async function buildZipInWorkers(
  material: GeneratedMaterial,
  opts: ExportOptions,
  includeOrm: boolean,
  token: JobToken,
  onProgress?: ProgressCallback,
): Promise<{ name: string; data: Uint8Array; files: string[] }> {
  const maps = applicableMaps(material.hasEmissive, includeOrm);
  const encoded: Partial<Record<MapId, Uint8Array>> = {};
  let done = 0;
  onProgress?.('Encoding PNG maps', 0);
  await Promise.all(
    maps.map(async (m) => {
      encoded[m] = await encodeMapInWorker(material, m, opts, token, Priority.Background);
      done++;
      onProgress?.(`Encoding PNG maps (${done}/${maps.length})`, (0.9 * done) / maps.length);
    }),
  );
  onProgress?.('Writing ZIP archive', 0.92);
  const transfer = Object.values(encoded).map((a) => (a as Uint8Array).buffer as ArrayBuffer);
  const r = await getPool().run(
    {
      kind: 'zip',
      settings: material.settings,
      size: material.size,
      maps: null,
      hasEmissive: material.hasEmissive,
      emissionStrength: material.emissionStrength,
      reliefDepth: material.reliefDepth,
      opts,
      includeOrm,
      encoded,
    },
    { priority: Priority.Background, token, transfer },
  );
  if (r.kind !== 'zip') throw new Error('Unexpected worker result');
  onProgress?.('Done', 1);
  return { name: r.name, data: r.data, files: r.files };
}

export { JobToken, Priority };

// ------------------------------------------------------------------------------------------------
// Strip-based streaming export for 4K / 8K


export const STREAM_THRESHOLD = 4096;
const STRIP_ROWS = 64;
const AO_PROXY_SIZE = 1024;

export interface StreamedFile {
  map: MapId;
  png: PngParts;
}

export interface StreamResult {
  files: StreamedFile[];
  hasEmissive: boolean;
  emissionStrength: number;
  reliefDepth: number;
  settings: MaterialSettings;
}

/** Groups of maps handled by separate encoder workers (balanced by raw bytes). */
function encoderGroups(maps: MapId[]): MapId[][] {
  const a: MapId[] = maps.filter((m) => m === 'basecolor' || m === 'normal' || m === 'emissive');
  const b = maps.filter((m) => !a.includes(m));
  return [a, b].filter((g) => g.length > 0);
}

/**
 * Generate `maps` at `size` strip by strip on the worker pool and stream them into PNG encoders
 * running in dedicated workers. Peak memory stays far below one uncompressed 8K map set.
 */
export async function streamExportMaps(
  settings: MaterialSettings,
  size: number,
  maps: MapId[],
  opts: ExportOptions,
  token: JobToken,
  onProgress?: ProgressCallback,
): Promise<StreamResult> {
  const p = getPool();
  const resolved = resolveSettings(settings);
  const family = getFamily(resolved.family);
  const hasEmissive = family.emits(resolved.params);
  const list = maps.filter((m) => m !== 'emissive' || hasEmissive);
  if (!list.length) throw new Error('Nothing to export for this material.');
  const relief = Number(resolved.params.relief ?? 1);

  // 1. Low-resolution proxy (gives AO neighbourhood averages and the material's relief depth).
  onProgress?.('Preparing AO proxy', 0);
  const proxyMat = await generateParallel(resolved, Math.min(AO_PROXY_SIZE, size), { priority: Priority.Background, token });
  const proxyHeight = Float32Array.from(proxyMat.maps.height16, (h) => h / 65535);
  const depth = proxyMat.reliefDepth / relief;

  // 2. Encoder workers.
  const groups = encoderGroups(list);
  const workers = groups.map(() => new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' }));
  const kill = () => workers.forEach((w) => w.terminate());
  token.onCancel(kill);
  const strips = Math.ceil(size / STRIP_ROWS);
  const acked = groups.map(() => 0);
  let failed: Error | null = null;
  let wake: (() => void) | null = null;
  const signal = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const done: Promise<StreamedFile[]>[] = workers.map(
    (w, gi) =>
      new Promise<StreamedFile[]>((resolve) => {
        w.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === 'ack') {
            acked[gi]++;
            signal();
          } else if (m.type === 'done') resolve(m.files as StreamedFile[]);
          else if (m.type === 'error') {
            failed = new Error(m.message);
            signal();
          }
        };
        w.onerror = (ev) => {
          ev.preventDefault();
          failed = new Error(ev.message || 'Encoder worker crashed');
          signal();
        };
      }),
  );
  groups.forEach((g, gi) => {
    const cfg: StripEncoderConfig = { size, maps: g, opts, level: 6 };
    if (g.includes('ao') || g.includes('orm')) cfg.proxy = { size: proxyMat.size, height: proxyHeight, depth, strength: relief };
    workers[gi].postMessage({ type: 'init', cfg });
  });

  // 3. Generate strips with a bounded window, deliver them to the encoders in row order.
  const window = Math.max(4, p.size * 2);
  const ready = new Map<number, StripData>();
  let dispatched = 0;
  let delivered = 0;
  const wantNormal16 = opts.normalBitDepth === 16 && list.includes('normal');
  const fieldsPerGroup = groups.map((g) => stripFieldsFor(g));
  const report = () => {
    const minAck = Math.min(...acked);
    onProgress?.(`Generating and encoding ${size}px strips (${minAck}/${strips})`, 0.04 + 0.9 * (minAck / strips));
  };
  try {
    while (Math.min(...acked) < strips) {
      if (failed) throw failed;
      if (token.cancelled) throw new CancelledError();
      while (dispatched < strips && dispatched - Math.min(...acked) < window) {
        const k = dispatched++;
        const y0 = k * STRIP_ROWS;
        const y1 = Math.min(size, y0 + STRIP_ROWS);
        p.run({ kind: 'strip', settings: resolved, size, y0, y1, normal16: wantNormal16 }, { priority: Priority.Background, token })
          .then((r) => {
            if (r.kind !== 'strip') throw new Error('Unexpected worker result');
            ready.set(k, r.strip);
            signal();
          })
          .catch((e: unknown) => {
            failed = e instanceof Error ? e : new Error(String(e));
            signal();
          });
      }
      while (ready.has(delivered)) {
        const s = ready.get(delivered)!;
        ready.delete(delivered);
        delivered++;
        groups.forEach((_, gi) => {
          const part: Record<string, unknown> = { y0: s.y0, rows: s.rows };
          const transfer: ArrayBuffer[] = [];
          for (const f of fieldsPerGroup[gi]) {
            const v = s[f] as ArrayBufferView | null;
            if (v && ArrayBuffer.isView(v)) {
              part[f] = v;
              transfer.push(v.buffer as ArrayBuffer);
            }
          }
          workers[gi].postMessage({ type: 'strip', strip: part }, transfer);
        });
      }
      report();
      if (Math.min(...acked) >= strips) break;
      await new Promise<void>((resolve) => (wake = resolve));
    }
    onProgress?.('Finishing PNG streams', 0.95);
    workers.forEach((w) => w.postMessage({ type: 'finish' }));
    const files = (await Promise.race([
      Promise.all(done),
      new Promise<never>((_, reject) => {
        const check = setInterval(() => {
          if (failed || token.cancelled) {
            clearInterval(check);
            reject(failed ?? new CancelledError());
          }
        }, 100);
        Promise.all(done).finally(() => clearInterval(check));
      }),
    ])).flat();
    onProgress?.('Done', 1);
    return { files, hasEmissive, emissionStrength: proxyMat.emissionStrength, reliefDepth: proxyMat.reliefDepth, settings: resolved };
  } catch (e) {
    token.cancel();
    throw e;
  } finally {
    kill();
  }
}

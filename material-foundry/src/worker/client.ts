// High-level generation / export API on top of the worker pool.

import { resolveSettings, type GeneratedMaterial } from '../engine/generate';
import { createFields } from '../engine/fields';
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

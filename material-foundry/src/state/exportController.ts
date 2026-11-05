// Export orchestration: regenerates the material natively at the export resolution (never
// upscales), encodes maps in workers, and triggers browser downloads. One export at a time.

import { create } from 'zustand';
import { CancelledError } from '../engine/fields';
import type { GeneratedMaterial } from '../engine/generate';
import { serializeSettings } from '../engine/schema';
import type { MaterialSettings } from '../engine/types';
import { applicableMaps, buildReadme, fileBase, mapFileName, type ExportOptions, type MapId } from '../export/exporter';
import { entryFromBytes, zipParts, type ZipEntry } from '../export/zipwriter';
import { buildGlb, type GlbImage } from '../export/glb';
import { buildModelMeshes, type HeightGrid, type ModelOptions } from '../preview/modelExport';
import type { PreviewShape } from './persistence';
import { buildZipInWorkers, encodeMapInWorker, generateParallel, JobToken, Priority, STREAM_THRESHOLD, streamExportMaps } from '../worker/client';
import { settingsKey } from './thumbs';
import { useStore } from './store';

interface ExportState {
  running: boolean;
  label: string;
  stage: string;
  fraction: number;
  token: JobToken | null;
  lastResult: string | null;
  error: string | null;
}

export const useExport = create<ExportState>(() => ({
  running: false,
  label: '',
  stage: '',
  fraction: 0,
  token: null,
  lastResult: null,
  error: null,
}));

let cache: { key: string; material: GeneratedMaterial } | null = null;

export function downloadBytes(data: Uint8Array | Blob, name: string, mime: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function materialAt(settings: MaterialSettings, size: number, token: JobToken, onProgress: (s: string, f: number) => void): Promise<GeneratedMaterial> {
  const key = `${settingsKey(settings)}|${settings.name}|${size}`;
  if (cache && cache.key === key) return cache.material;
  cache = null; // release the previous export-resolution material before generating a new one
  const m = await generateParallel(settings, size, { priority: Priority.Background, token, onProgress });
  // Keep it for follow-up single-map downloads, except very large materials (~300 MB at 4096).
  if (size <= 2048) cache = { key, material: m };
  return m;
}

function exportOptions(): ExportOptions {
  const p = useStore.getState().prefs;
  return { normalConvention: p.normalConvention, heightBitDepth: p.heightBitDepth, normalBitDepth: p.normalBitDepth };
}

async function run(label: string, body: (token: JobToken, progress: (stage: string, f: number) => void) => Promise<string>): Promise<void> {
  if (useExport.getState().running) {
    useStore.getState().toast('info', 'An export is already running. Cancel it or wait for it to finish.');
    return;
  }
  const token = new JobToken(true);
  useExport.setState({ running: true, label, stage: 'Starting…', fraction: 0, token, error: null });
  const progress = (stage: string, fraction: number) => useExport.setState({ stage, fraction });
  try {
    const result = await body(token, progress);
    useExport.setState({ running: false, token: null, stage: 'Done', fraction: 1, lastResult: result });
    useStore.getState().toast('success', result);
  } catch (e) {
    if (e instanceof CancelledError || token.cancelled) {
      useExport.setState({ running: false, token: null, stage: 'Cancelled', fraction: 0 });
      useStore.getState().toast('info', 'Export cancelled.');
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      useExport.setState({ running: false, token: null, error: msg, stage: 'Failed' });
      useStore.getState().toast('error', `Export failed: ${msg}`);
    }
  }
}

export function cancelExport(): void {
  useExport.getState().token?.cancel();
}

export function exportZip(): Promise<void> {
  const { settings, prefs } = useStore.getState();
  const size = prefs.exportRes;
  const opts = exportOptions();
  if (size >= STREAM_THRESHOLD) return exportZipStreamed(settings, size, opts, prefs.includeOrm);
  return run(`ZIP · ${size}px`, async (token, progress) => {
    const m = await materialAt(settings, size, token, (s, f) => progress(`${s} (${size}px)`, f * 0.7));
    const z = await buildZipInWorkers(m, opts, prefs.includeOrm, token, (s, f) => progress(s, 0.7 + f * 0.3));
    downloadBytes(z.data, z.name, 'application/zip');
    return `Downloaded ${z.name} (${(z.data.length / 1048576).toFixed(1)} MB, ${z.files.length} files).`;
  });
}

export function exportSingleMap(map: MapId): Promise<void> {
  const { settings, prefs } = useStore.getState();
  const size = prefs.exportRes;
  const opts = exportOptions();
  if (size >= STREAM_THRESHOLD) {
    return run(`${map} · ${size}px`, async (token, progress) => {
      const r = await streamExportMaps(settings, size, [map], opts, token, progress);
      const f = r.files.find((x) => x.map === map);
      if (!f) throw new Error('This material has no emissive map.');
      const name = mapFileName(r.settings, map, size, opts);
      downloadBytes(new Blob(f.png.parts as BlobPart[], { type: 'image/png' }), name, 'image/png');
      return `Downloaded ${name} (${(f.png.length / 1048576).toFixed(1)} MB).`;
    });
  }
  return run(`${map} · ${size}px`, async (token, progress) => {
    const m = await materialAt(settings, size, token, (s, f) => progress(`${s} (${size}px)`, f * 0.85));
    if (map === 'emissive' && !m.hasEmissive) throw new Error('This material has no emissive map.');
    progress('Encoding PNG', 0.88);
    const png = await encodeMapInWorker(m, map, opts, token, Priority.Background);
    const name = mapFileName(m.settings, map, size, opts);
    downloadBytes(png, name, 'image/png');
    return `Downloaded ${name}.`;
  });
}

/** 4K/8K ZIP: strips are generated on the pool and streamed into PNG encoders; the archive is a Blob of parts. */
function exportZipStreamed(settings: MaterialSettings, size: number, opts: ExportOptions, includeOrm: boolean): Promise<void> {
  return run(`ZIP · ${size}px`, async (token, progress) => {
    const maps = applicableMaps(true, includeOrm);
    const r = await streamExportMaps(settings, size, maps, opts, token, progress);
    const entries: ZipEntry[] = r.files.map((f) => ({ name: mapFileName(r.settings, f.map, size, opts), parts: f.png.parts, length: f.png.length, crc: f.png.crc }));
    const enc = new TextEncoder();
    entries.push(entryFromBytes('settings.json', enc.encode(serializeSettings(r.settings, { resolution: size, normalConvention: opts.normalConvention, heightBitDepth: opts.heightBitDepth }))));
    entries.push(
      entryFromBytes(
        'README.txt',
        enc.encode(
          buildReadme({
            settings: r.settings,
            size,
            files: r.files.map((f) => ({ map: f.map, name: mapFileName(r.settings, f.map, size, opts) })),
            opts,
            hasEmissive: r.hasEmissive,
            emissionStrength: r.emissionStrength,
            reliefDepth: r.reliefDepth,
            generatedAt: new Date().toISOString(),
          }),
        ),
      ),
    );
    const z = zipParts(entries);
    const name = `${fileBase(r.settings)}_${size}.zip`;
    downloadBytes(new Blob(z.parts as BlobPart[], { type: 'application/zip' }), name, 'application/zip');
    return `Downloaded ${name} (${(z.length / 1048576).toFixed(1)} MB, ${entries.length} files).`;
  });
}

export function exportSettingsJson(): void {
  const { settings, prefs } = useStore.getState();
  const text = serializeSettings(settings, { resolution: prefs.exportRes, normalConvention: prefs.normalConvention, heightBitDepth: prefs.heightBitDepth });
  const name = `${fileBase(settings)}_settings.json`;
  downloadBytes(new TextEncoder().encode(text), name, 'application/json');
  useStore.getState().toast('success', `Downloaded ${name}.`);
}

/** Preview snapshot provider, registered by the 3D viewport. */
let snapshotProvider: (() => Promise<Blob>) | null = null;
export function registerSnapshotProvider(fn: (() => Promise<Blob>) | null): void {
  snapshotProvider = fn;
}

export async function exportPreviewPng(): Promise<void> {
  const { settings } = useStore.getState();
  if (!snapshotProvider) {
    useStore.getState().toast('warning', 'Switch to the 3D preview to capture a preview image.');
    return;
  }
  try {
    const blob = await snapshotProvider();
    const name = `${fileBase(settings)}_preview.png`;
    downloadBytes(blob, name, 'image/png');
    useStore.getState().toast('success', `Downloaded ${name}.`);
  } catch (e) {
    useStore.getState().toast('error', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Export a preview object as a glTF binary (.glb) with the material's textures embedded at the
 * export resolution (4K/8K textures are streamed). Optionally bakes the height map into the mesh.
 */
export function exportModel(shape: PreviewShape, bakeDisplacement: boolean): Promise<void> {
  const { settings, prefs } = useStore.getState();
  const size = prefs.exportRes;
  const tile = prefs.tileSize;
  const glbOpts: ExportOptions = { normalConvention: 'opengl', heightBitDepth: 16, normalBitDepth: 8 };
  return run(`GLB · ${shape} · ${size}px`, async (token, progress) => {
    const want: MapId[] = ['basecolor', 'normal', 'orm', 'emissive'];
    const images: Partial<Record<MapId, GlbImage>> = {};
    let emissionStrength = 0;
    let reliefDepth = 0;
    let resolved = settings;
    let heightGrid: HeightGrid | null = null;
    if (size >= STREAM_THRESHOLD) {
      const r = await streamExportMaps(settings, size, want, glbOpts, token, (s, f) => progress(s, f * 0.85));
      for (const f of r.files) images[f.map] = { parts: f.png.parts, length: f.png.length };
      emissionStrength = r.hasEmissive ? r.emissionStrength : 0;
      reliefDepth = r.reliefDepth;
      resolved = r.settings;
    } else {
      const m = await materialAt(settings, size, token, (s, f) => progress(`${s} (${size}px)`, f * 0.6));
      for (const map of want) {
        if (map === 'emissive' && !m.hasEmissive) continue;
        progress(`Encoding ${map} texture`, 0.6 + 0.06 * Object.keys(images).length);
        const png = await encodeMapInWorker(m, map, glbOpts, token, Priority.Background);
        images[map] = { parts: [png], length: png.length };
      }
      emissionStrength = m.hasEmissive ? m.emissionStrength : 0;
      reliefDepth = m.reliefDepth;
      resolved = m.settings;
      heightGrid = { size: m.size, data: m.maps.height16 };
    }
    let displacement: ModelOptions['displacement'];
    if (bakeDisplacement) {
      if (!heightGrid) {
        progress('Generating height for displacement (2048px)', 0.86);
        const hm = await generateParallel(settings, 2048, { priority: Priority.Background, token });
        heightGrid = { size: hm.size, data: hm.maps.height16 };
      }
      displacement = { height: heightGrid, metres: reliefDepth * tile * prefs.displacementScale };
    }
    progress('Building mesh', 0.92);
    const meshes = buildModelMeshes({ shape, tileSize: tile, displacement });
    const glb = buildGlb(meshes, {
      name: resolved.name,
      baseColor: images.basecolor!,
      normal: images.normal!,
      orm: images.orm!,
      emissive: images.emissive ?? null,
      emissiveStrength: emissionStrength,
    });
    const name = `${fileBase(resolved)}_${shape}${bakeDisplacement ? '_displaced' : ''}_${size}.glb`;
    downloadBytes(new Blob(glb.parts as BlobPart[], { type: 'model/gltf-binary' }), name, 'model/gltf-binary');
    const tris = meshes.reduce((a, m) => a + m.indices.length / 3, 0);
    return `Downloaded ${name} (${(glb.length / 1048576).toFixed(1)} MB, ${tris.toLocaleString('en-US')} triangles).`;
  });
}

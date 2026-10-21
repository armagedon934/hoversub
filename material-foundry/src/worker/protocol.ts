import type { Fields } from '../engine/fields';
import type { GeneratedMaterial } from '../engine/generate';
import type { PackedMaps } from '../engine/maps';
import type { MaterialSettings } from '../engine/types';
import type { ExportOptions, MapId } from '../export/exporter';

export type TaskRequest =
  | { kind: 'band'; settings: MaterialSettings; size: number; y0: number; y1: number }
  | { kind: 'finish'; settings: MaterialSettings; fields: Fields }
  | { kind: 'thumb'; settings: MaterialSettings; size: number }
  | { kind: 'encode'; maps: PackedMaps; map: MapId; opts: ExportOptions }
  | {
      kind: 'zip';
      settings: MaterialSettings;
      size: number;
      maps: null;
      hasEmissive: boolean;
      emissionStrength: number;
      reliefDepth: number;
      opts: ExportOptions;
      includeOrm: boolean;
      encoded: Partial<Record<MapId, Uint8Array>>;
    };

export type TaskResult =
  | { kind: 'band'; fields: Fields }
  | { kind: 'finish'; material: GeneratedMaterial }
  | { kind: 'thumb'; material: GeneratedMaterial; swatch: Uint8ClampedArray }
  | { kind: 'encode'; png: Uint8Array }
  | { kind: 'zip'; name: string; data: Uint8Array; files: string[] };

export interface WorkerRequestMessage {
  taskId: number;
  request: TaskRequest;
}

export type WorkerResponseMessage =
  | { taskId: number; type: 'progress'; stage: string; fraction: number }
  | { taskId: number; type: 'result'; result: TaskResult }
  | { taskId: number; type: 'error'; message: string };

/** Collect the transferable buffers of maps/fields to avoid structured-clone copies. */
export function mapsTransferables(m: PackedMaps): ArrayBuffer[] {
  const list = [m.baseColor, m.normal, m.roughness, m.metallic, m.ao, m.height16];
  if (m.emissive) list.push(m.emissive);
  return list.map((a) => a.buffer as ArrayBuffer);
}

export function fieldsTransferables(f: Fields): ArrayBuffer[] {
  const list: ArrayBufferView[] = [f.albedo, f.height, f.rough, f.metal];
  if (f.emissive) list.push(f.emissive);
  return list.map((a) => a.buffer as ArrayBuffer);
}

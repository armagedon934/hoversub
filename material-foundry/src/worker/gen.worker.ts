/// <reference lib="webworker" />
// Generic generation worker: executes one small task at a time (a row band of material fields,
// map derivation, a thumbnail, PNG encoding or ZIP assembly). Long jobs are split into many
// tasks by the pool, which is what makes cancellation and prioritisation responsive.

import { finishMaterial, generateFieldBand, generateMaterial } from '../engine/generate';
import { renderSwatch } from '../engine/swatch';
import { buildZip, encodeMap } from '../export/exporter';
import { fieldsTransferables, mapsTransferables, type TaskResult, type WorkerRequestMessage, type WorkerResponseMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerResponseMessage, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

self.onmessage = (e: MessageEvent<WorkerRequestMessage>) => {
  const { taskId, request } = e.data;
  const progress = (stage: string, fraction: number) => post({ taskId, type: 'progress', stage, fraction });
  try {
    let result: TaskResult;
    let transfer: Transferable[] = [];
    switch (request.kind) {
      case 'band': {
        let last = 0;
        const fields = generateFieldBand(request.settings, request.size, request.y0, request.y1, (f) => {
          const now = performance.now();
          if (now - last > 60) {
            last = now;
            progress('fields', f);
          }
        });
        result = { kind: 'band', fields };
        transfer = fieldsTransferables(fields);
        break;
      }
      case 'finish': {
        const material = finishMaterial(request.fields, request.settings, progress);
        result = { kind: 'finish', material };
        transfer = mapsTransferables(material.maps);
        break;
      }
      case 'thumb': {
        const material = generateMaterial({ size: request.size, settings: request.settings });
        const swatch = renderSwatch(material.maps, { dir: [-0.45, 0.55, 0.7], intensity: 1, emissionStrength: material.emissionStrength });
        result = { kind: 'thumb', material, swatch };
        transfer = [...mapsTransferables(material.maps), swatch.buffer as ArrayBuffer];
        break;
      }
      case 'encode': {
        const png = encodeMap(request.maps, request.map, request.opts);
        result = { kind: 'encode', png };
        transfer = [png.buffer as ArrayBuffer];
        break;
      }
      case 'zip': {
        const z = buildZip(request);
        result = { kind: 'zip', ...z };
        transfer = [z.data.buffer as ArrayBuffer];
        break;
      }
    }
    post({ taskId, type: 'result', result }, transfer);
  } catch (err) {
    post({ taskId, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

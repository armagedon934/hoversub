/// <reference lib="webworker" />
// Runs Python with Pyodide (real CPython compiled to WebAssembly) inside this worker. The worker
// has no access to files on the computer; network functions are removed before user code runs.
// sys.settrace records every executed line with the variables of each active function.

declare const self: DedicatedWorkerGlobalScope;
export {};

interface PyodideLike {
  runPython(code: string): unknown;
  globals: { set(name: string, value: unknown): void };
  setStdout?(o: unknown): void;
  toPy?(v: unknown): unknown;
}

import { PY_RUNNER } from './pyRunner';

let pyodide: Promise<PyodideLike> | null = null;


async function load(base: string): Promise<PyodideLike> {
  const mod = (await import(/* @vite-ignore */ `${base}pyodide.mjs`)) as { loadPyodide(o: { indexURL: string }): Promise<PyodideLike> };
  const py = await mod.loadPyodide({ indexURL: base });
  // No network for user code: remove the browser's network functions from this worker.
  for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    try {
      (self as unknown as Record<string, unknown>)[k] = undefined;
    } catch {
      /* ignore */
    }
  }
  py.runPython('import sys\nsys.modules["pyodide_http"] = None');
  return py;
}

self.onmessage = async (e: MessageEvent<{ id: number; base: string; code: string; inputs: string[]; trace: boolean }>) => {
  const { id, base, code, inputs, trace } = e.data;
  try {
    pyodide ??= load(base);
    const py = await pyodide;
    py.globals.set('__user_code', code);
    py.globals.set('__inputs', py.toPy ? py.toPy(inputs) : inputs);
    py.globals.set('__trace', trace);
    const json = py.runPython(PY_RUNNER) as string;
    self.postMessage({ id, ok: true, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

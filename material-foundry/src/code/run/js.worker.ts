/// <reference lib="webworker" />
// Runs JavaScript in an isolated worker: no page, no files, network functions removed. Output of
// console.log is collected; prompt() answers come from the input lines given before the run.
// The main thread stops the worker if it runs too long.

declare const self: DedicatedWorkerGlobalScope;
export {};

for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker']) {
  try {
    Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false });
  } catch {
    /* ignore */
  }
}

// new Function puts 3 lines before user code: "function anonymous(args", ") {" and "use strict".
const WRAP_LINES = 3;

class NeedInput extends Error {}

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}

self.onmessage = (e: MessageEvent<{ code: string; inputs: string[] }>) => {
  const out: string[] = [];
  const inputs = [...e.data.inputs];
  const log = (...a: unknown[]) => {
    if (out.length < 2000) out.push(a.map(show).join(' '));
  };
  const fakeConsole = { log, info: log, warn: log, error: log, table: log };
  const prompt = (q?: string) => {
    if (q) out.push(String(q));
    const v = inputs.shift();
    if (v === undefined) throw new NeedInput(q ? String(q) : '');
    out.push(`> ${v}`);
    return v;
  };
  try {
    const fn = new Function('console', 'prompt', 'alert', `"use strict";\n${e.data.code}`);
    fn(fakeConsole, prompt, log);
    self.postMessage({ output: out, error: null });
  } catch (err) {
    if (err instanceof NeedInput) {
      self.postMessage({ output: out, error: null, needInput: err.message });
      return;
    }
    const er = err as Error;
    const m = /<anonymous>:(\d+):(\d+)/.exec(er.stack ?? '');
    const line = m ? Math.max(0, parseInt(m[1], 10) - 1 - WRAP_LINES) : -1;
    self.postMessage({ output: out, error: { type: er.name ?? 'Error', message: er.message, line } });
  }
};

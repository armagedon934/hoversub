/// <reference lib="webworker" />
// Code analysis worker: keeps parsed files and answers analysis queries off the main thread.
// It only reads text; it never executes any of the code it analyses.

import { CodeEngine } from '../analysis/engine';
import { configureTreeSitter } from '../languages/treesitter';
import { setLocale, type Locale } from '../i18n';
import runtimeUrl from 'web-tree-sitter/tree-sitter.wasm?url';

declare const self: DedicatedWorkerGlobalScope;

export type CodeRequest =
  | { op: 'init'; grammarBase: string; locale: Locale }
  | { op: 'locale'; locale: Locale }
  | { op: 'open'; path: string; text: string; language?: string; keep: boolean }
  | { op: 'element'; path: string; offset: number }
  | { op: 'flow'; path: string }
  | { op: 'check'; path: string; text: string }
  | { op: 'close'; path: string };

const engine = new CodeEngine();
let ready = false;

self.onmessage = async (e: MessageEvent<{ id: number; req: CodeRequest }>) => {
  const { id, req } = e.data;
  try {
    let result: unknown;
    switch (req.op) {
      case 'init':
        configureTreeSitter({
          runtime: () => new URL(runtimeUrl, self.location.href).href,
          grammar: (g) => `${req.grammarBase}tree-sitter-${g}.wasm`,
        });
        setLocale(req.locale, false);
        ready = true;
        result = true;
        break;
      case 'locale':
        setLocale(req.locale, false);
        result = true;
        break;
      case 'open': {
        if (!ready) throw new Error('Worker not initialised');
        const r = await engine.open(req.path, req.text, req.language);
        if (!req.keep) engine.close(req.path);
        result = r;
        self.postMessage({ id, ok: true, result }, [r.highlight.buffer]);
        return;
      }
      case 'element':
        result = engine.element(req.path, req.offset);
        break;
      case 'flow':
        result = engine.fileFlow(req.path);
        break;
      case 'check':
        result = await engine.checkSyntax(req.path, req.text);
        break;
      case 'close':
        engine.close(req.path);
        result = true;
        break;
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

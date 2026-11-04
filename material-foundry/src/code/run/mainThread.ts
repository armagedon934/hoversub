// Tree-sitter for the main thread (the C# runner and Mini-Unity run here so they can pause for
// input and draw every frame). Grammar files are served by the app itself, never downloaded.

import runtimeUrl from 'web-tree-sitter/tree-sitter.wasm?url';
import { configureTreeSitter } from '../languages/treesitter';

let done = false;

export function ensureMainThreadTreeSitter(): void {
  if (done) return;
  done = true;
  configureTreeSitter({
    runtime: () => new URL(runtimeUrl, document.baseURI).href,
    grammar: (g) => new URL(`grammars/tree-sitter-${g}.wasm`, document.baseURI).href,
  });
}

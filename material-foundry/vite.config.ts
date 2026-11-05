import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Tree-sitter grammars used by the "Understand Code" module (see src/code/languages/registry.ts). */
const GRAMMARS = ['python', 'javascript', 'typescript', 'tsx', 'html', 'css', 'c', 'cpp', 'c_sharp', 'java', 'rust', 'go', 'php', 'ruby', 'kotlin', 'json', 'bash', 'toml'];
const GRAMMAR_DIR = resolve(__dirname, 'node_modules/tree-sitter-wasms/out');

/**
 * Serves the grammar .wasm files at /grammars/ during development and copies them into the build,
 * so the app never needs the internet to parse code.
 */
function treeSitterGrammars(): Plugin {
  return {
    name: 'tree-sitter-grammars',
    configureServer(server) {
      server.middlewares.use('/grammars/', (req, res, next) => {
        const m = /^\/tree-sitter-([a-z_]+)\.wasm$/.exec((req.url ?? '').split('?')[0]);
        const file = m && GRAMMARS.includes(m[1]) ? resolve(GRAMMAR_DIR, `tree-sitter-${m[1]}.wasm`) : null;
        if (!file || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/wasm');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const g of GRAMMARS) {
        this.emitFile({ type: 'asset', fileName: `grammars/tree-sitter-${g}.wasm`, source: readFileSync(resolve(GRAMMAR_DIR, `tree-sitter-${g}.wasm`)) });
      }
    },
  };
}

/** Python (Pyodide) runtime files, served at /pyodide/ and copied into the build: Python runs offline. */
const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const PYODIDE_DIR = resolve(__dirname, 'node_modules/pyodide');
const TYPES: Record<string, string> = { mjs: 'text/javascript', wasm: 'application/wasm', zip: 'application/zip', json: 'application/json' };

function pyodideFiles(): Plugin {
  return {
    name: 'pyodide-files',
    configureServer(server) {
      server.middlewares.use('/pyodide/', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!PYODIDE_FILES.includes(name)) return next();
        res.setHeader('Content-Type', TYPES[name.split('.').pop()!] ?? 'application/octet-stream');
        res.end(readFileSync(resolve(PYODIDE_DIR, name)));
      });
    },
    generateBundle() {
      for (const f of PYODIDE_FILES) this.emitFile({ type: 'asset', fileName: `pyodide/${f}`, source: readFileSync(resolve(PYODIDE_DIR, f)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), treeSitterGrammars(), pyodideFiles()],
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});

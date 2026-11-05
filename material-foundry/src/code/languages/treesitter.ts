// Lazy Tree-sitter loader. Grammars are WebAssembly files served by the application itself
// (copied from the tree-sitter-wasms package at build time) or read from node_modules in tests.
// Nothing is downloaded from the internet.

import { Language, Parser } from 'web-tree-sitter';

type Locator = (file: string) => string;

let locateRuntime: Locator | null = null;
let locateGrammar: Locator = (g) => `node_modules/tree-sitter-wasms/out/tree-sitter-${g}.wasm`;
let initPromise: Promise<void> | null = null;
const languages = new Map<string, Promise<Language>>();
const parsers = new Map<string, Parser>();

/** Configure where the runtime and grammar .wasm files are found (browser worker). */
export function configureTreeSitter(opts: { runtime?: Locator; grammar?: Locator }): void {
  if (opts.runtime) locateRuntime = opts.runtime;
  if (opts.grammar) locateGrammar = opts.grammar;
}

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init(locateRuntime ? { locateFile: (f: string) => locateRuntime!(f) } : undefined);
  }
  return initPromise;
}

export async function loadGrammar(grammar: string): Promise<Language> {
  await init();
  let p = languages.get(grammar);
  if (!p) {
    p = Language.load(locateGrammar(grammar));
    languages.set(grammar, p);
    p.catch(() => languages.delete(grammar));
  }
  return p;
}

/** A parser instance per grammar (parsers are reused; parsing is synchronous). */
export async function getParser(grammar: string): Promise<Parser> {
  const lang = await loadGrammar(grammar);
  let parser = parsers.get(grammar);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(lang);
    parsers.set(grammar, parser);
  }
  return parser;
}

export type { Language, Parser };
export type { Node as SyntaxNode, Tree } from 'web-tree-sitter';

// Project-level analysis: resolves imports to project files, builds the dependency graph,
// finds where names are defined and used across files, and assembles a plain-language overview
// (what the project is, where it starts, which files matter). Facts carry confidence levels:
// manifest contents and resolved paths are "verified"; guesses from names and conventions are
// "likely" or "assumption".

import { baseName, extensionOf, getLanguage } from '../languages/registry';
import type { Confidence, Fact, FileSummary, ImportInfo, SymbolDef, SymbolRef } from './types';

export interface ProjectFile {
  path: string;
  size: number;
  languageId: string;
  summary?: FileSummary;
  /** Reason the file was not analysed (binary, too large, ignored). */
  skipped?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: ImportInfo['kind'];
  spec: string;
}

export interface ProjectIndex {
  files: ProjectFile[];
  paths: Set<string>;
  edges: DependencyEdge[];
  /** External libraries/packages and the files that use them. */
  externals: Map<string, string[]>;
  importedBy: Map<string, string[]>;
  imports: Map<string, string[]>;
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '';
}

export function joinPath(dir: string, rel: string): string {
  const parts = (dir ? `${dir}/${rel}` : rel).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const JS_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.vue', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function firstExisting(paths: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) if (paths.has(c)) return c;
  return null;
}

function bySuffix(paths: Set<string>, suffix: string): string | null {
  for (const p of paths) if (p === suffix || p.endsWith(`/${suffix}`)) return p;
  return null;
}

/** Resolve an import to a project path (null = external or unknown). */
export function resolveImport(from: string, imp: ImportInfo, languageId: string, paths: Set<string>): string | null {
  const dir = dirname(from);
  const spec = imp.spec.trim().replace(/^["'<]|["'>]$/g, '');
  if (!spec || /^(https?:|data:|mailto:|\/\/)/.test(spec)) return null;
  const rel = (s: string) => (s.startsWith('/') ? s.slice(1) : joinPath(dir, s));
  switch (languageId) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const b = rel(spec);
        const noJs = b.replace(/\.(js|jsx|mjs)$/, '');
        return firstExisting(paths, [...JS_EXT.map((e) => b + e), ...JS_EXT.map((e) => noJs + e)]);
      }
      return null;
    case 'python': {
      const dots = /^\.+/.exec(spec)?.[0].length ?? 0;
      const mod = spec.slice(dots).replace(/\./g, '/');
      let base = dir;
      for (let i = 1; i < dots; i++) base = dirname(base);
      const roots = dots ? [base] : [dir, '', 'src', dirname(dir)];
      for (const r of roots) {
        const b = mod ? joinPath(r, mod) : r;
        const hit = firstExisting(paths, [`${b}.py`, `${b}/__init__.py`]);
        if (hit) return hit;
      }
      // "from pkg import module": try names as modules.
      for (const n of imp.names) {
        const hit = firstExisting(paths, [joinPath(dots ? base : dir, `${mod}/${n}.py`), `${mod}/${n}.py`]);
        if (hit) return hit;
      }
      return null;
    }
    case 'c':
    case 'cpp':
      if (imp.external) return null;
      return firstExisting(paths, [rel(spec)]) ?? bySuffix(paths, spec);
    case 'go': {
      const seg = spec.split('/');
      for (let k = Math.max(0, seg.length - 3); k < seg.length; k++) {
        const suffix = seg.slice(k).join('/');
        for (const p of paths) if (p.endsWith('.go') && (dirname(p) === suffix || dirname(p).endsWith(`/${suffix}`))) return p;
      }
      return null;
    }
    case 'rust':
      if (imp.kind === 'mod') return firstExisting(paths, [joinPath(dir, `${spec}.rs`), joinPath(dir, `${spec}/mod.rs`)]);
      if (spec.startsWith('crate::') || spec.startsWith('super::') || spec.startsWith('self::')) {
        const parts = spec.replace(/^(crate|super|self)::/, '').split('::');
        const root = spec.startsWith('crate::') ? (paths.has('src/lib.rs') || paths.has('src/main.rs') ? 'src' : dir) : spec.startsWith('super::') ? dirname(dir) : dir;
        for (let k = parts.length; k > 0; k--) {
          const b = joinPath(root, parts.slice(0, k).join('/'));
          const hit = firstExisting(paths, [`${b}.rs`, `${b}/mod.rs`]);
          if (hit) return hit;
        }
      }
      return null;
    case 'java':
    case 'kotlin': {
      const p = spec.replace(/\.\*$/, '').replace(/\./g, '/');
      return bySuffix(paths, `${p}.java`) ?? bySuffix(paths, `${p}.kt`);
    }
    case 'php':
      if (imp.kind === 'use') return bySuffix(paths, `${spec.replace(/\\/g, '/').replace(/^\//, '')}.php`);
      return firstExisting(paths, [rel(spec)]) ?? bySuffix(paths, spec);
    case 'ruby':
      return firstExisting(paths, [rel(spec.endsWith('.rb') ? spec : `${spec}.rb`), `lib/${spec}.rb`]);
    case 'lua':
      return firstExisting(paths, [`${spec.replace(/\./g, '/')}.lua`, joinPath(dir, `${spec.replace(/\./g, '/')}.lua`), `${spec.replace(/\./g, '/')}/init.lua`]);
    case 'scss': {
      const b = rel(spec);
      const d = dirname(b);
      const n = baseName(b);
      return firstExisting(paths, [b, `${b}.scss`, `${b}.css`, joinPath(d, `_${n}.scss`), `${b}.sass`, `${b}.less`]);
    }
    default:
      return firstExisting(paths, [rel(spec.split('?')[0].split('#')[0])]);
  }
}

function externalName(spec: string, languageId: string): string {
  if (languageId === 'javascript' || languageId === 'typescript' || languageId === 'tsx') {
    const parts = spec.split('/');
    return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  }
  if (languageId === 'python') return spec.replace(/^\.+/, '').split('.')[0];
  if (languageId === 'rust') return spec.split('::')[0];
  if (languageId === 'java' || languageId === 'kotlin' || languageId === 'csharp') return spec.split('.').slice(0, 2).join('.');
  return spec;
}

export function buildProjectIndex(files: ProjectFile[]): ProjectIndex {
  const paths = new Set(files.map((f) => f.path));
  const edges: DependencyEdge[] = [];
  const externals = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const imports = new Map<string, string[]>();
  for (const f of files) {
    if (!f.summary) continue;
    for (const imp of f.summary.imports) {
      const to = resolveImport(f.path, imp, f.languageId, paths);
      imp.resolved = to;
      if (to && to !== f.path) {
        imp.external = false;
        edges.push({ from: f.path, to, kind: imp.kind, spec: imp.spec });
        if (!importedBy.get(to)?.includes(f.path)) importedBy.set(to, [...(importedBy.get(to) ?? []), f.path]);
        if (!imports.get(f.path)?.includes(to)) imports.set(f.path, [...(imports.get(f.path) ?? []), to]);
      } else if (!to && !/^(\.|\/)/.test(imp.spec) && imp.kind !== 'link' && imp.kind !== 'mod') {
        imp.external = true;
        const name = externalName(imp.spec, f.languageId);
        const list = externals.get(name) ?? [];
        if (!list.includes(f.path)) list.push(f.path);
        externals.set(name, list);
      }
    }
  }
  return { files, paths, edges, externals, importedBy, imports };
}

export interface CrossRefs {
  defs: { path: string; def: SymbolDef }[];
  refs: { path: string; ref: SymbolRef }[];
}

/** Where a name is defined and used across the whole project (name-based: "likely"). */
export function crossReferences(index: ProjectIndex, name: string, opts: { onlyTopLevel?: boolean } = {}): CrossRefs {
  const defs: CrossRefs['defs'] = [];
  const refs: CrossRefs['refs'] = [];
  for (const f of index.files) {
    if (!f.summary) continue;
    for (const d of f.summary.symbols) if (d.name === name && d.kind !== 'parameter' && (!opts.onlyTopLevel || d.scope === 0)) defs.push({ path: f.path, def: d });
    for (const r of f.summary.refs) if (r.name === name) refs.push({ path: f.path, ref: r });
  }
  return { defs, refs };
}

// ---------------------------------------------------------------------------------------------
// File roles

export interface FileRole {
  role: string;
  /** One-sentence plain explanation. */
  explanation: string;
  confidence: Confidence;
}

const FOLDER_ROLES: [RegExp, string, string][] = [
  [/(^|\/)(tests?|__tests__|spec|specs)(\/|$)/i, 'Tests', 'automatic checks that the code works as expected'],
  [/(^|\/)(components?|widgets?)(\/|$)/i, 'User-interface pieces', 'reusable parts of the screen (buttons, panels, forms)'],
  [/(^|\/)(pages?|views?|screens?|templates?)(\/|$)/i, 'Screens / pages', 'the screens or pages people see'],
  [/(^|\/)(routes?|api|controllers?|handlers?|endpoints?)(\/|$)/i, 'Request handling', 'code that answers requests (for example from a browser or another program)'],
  [/(^|\/)(models?|entities|schemas?|types?)(\/|$)/i, 'Data models', 'descriptions of the kinds of data the program works with'],
  [/(^|\/)(services?|providers?|stores?|state)(\/|$)/i, 'Services / state', 'shared logic and stored information used by other parts'],
  [/(^|\/)(utils?|helpers?|lib|common|shared|core)(\/|$)/i, 'Helpers', 'small reusable tools used by other files'],
  [/(^|\/)(styles?|css|scss|themes?)(\/|$)/i, 'Styling', 'how things look (colours, sizes, layout)'],
  [/(^|\/)(assets?|static|public|images?|img|media|fonts?)(\/|$)/i, 'Assets', 'pictures, fonts and other files that are shown or downloaded as they are'],
  [/(^|\/)(config|configs|settings|conf)(\/|$)/i, 'Settings', 'configuration that changes how the program behaves'],
  [/(^|\/)(scripts?|tools?|bin)(\/|$)/i, 'Scripts / tools', 'helper programs for developers (building, testing, deploying)'],
  [/(^|\/)(docs?|documentation)(\/|$)/i, 'Documentation', 'explanations written for people'],
  [/(^|\/)(migrations?|db|database|sql)(\/|$)/i, 'Database', 'database structure and changes'],
  [/(^|\/)(workers?|jobs?|tasks?)(\/|$)/i, 'Background work', 'work that runs in the background'],
  [/(^|\/)(web|www|frontend|client|ui|site)(\/|$)/i, 'Web / user interface', 'the part people see and click (web pages, screens)'],
  [/(^|\/)(server|backend|api-server)(\/|$)/i, 'Server side', 'the part that runs on a server and answers requests'],
  [/(^|\/)(data|datasets?|fixtures|seeds?)(\/|$)/i, 'Data', 'data files, examples or database contents'],
  [/(^|\/)(i18n|locales?|lang|translations?)(\/|$)/i, 'Translations', 'texts in different languages'],
];

export function fileRole(path: string, summary: FileSummary | undefined, index: ProjectIndex | null, entries: Set<string>): FileRole {
  const name = baseName(path).toLowerCase();
  const lang = getLanguage(summary?.languageId ?? 'unknown');
  if (entries.has(path)) return { role: 'Starting point', explanation: 'This is (probably) where the program starts running.', confidence: 'likely' };
  if (/^readme/.test(name)) return { role: 'Read-me', explanation: 'The introduction to the project, written by its authors.', confidence: 'verified' };
  if (/^(license|licence|copying)/.test(name)) return { role: 'License', explanation: 'The legal terms for using and sharing this code.', confidence: 'verified' };
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|composer\.json|gemfile|package\.swift|.*\.csproj|requirements.*\.txt|setup\.py|cmakelists\.txt)$/.test(name))
    return { role: 'Project manifest', explanation: 'Describes the project: its name, the libraries it needs, and the commands to build or run it.', confidence: 'verified' };
  if (/(^|[._-])(test|spec)s?([._-]|$)|^test_/.test(name) || /(^|\/)(tests?|__tests__)\//.test(path)) return { role: 'Test', explanation: 'Automatic checks that verify other code works correctly.', confidence: 'likely' };
  if (/lock(\.json|\.yaml)?$|\.lock$/.test(name)) return { role: 'Lock file', explanation: 'An automatically generated list of exact library versions. People normally do not edit it.', confidence: 'verified' };
  if (/^\.env/.test(name)) return { role: 'Secret settings', explanation: 'Settings for the environment (addresses, passwords, keys). Be careful: it may contain secrets.', confidence: 'likely' };
  if (/(config|rc)(\.[a-z]+)?$|^\.[a-z]+rc$|\.config\.(js|ts|mjs|cjs)$|^tsconfig|^vite\.config|^webpack|^babel|^eslint|^prettier/.test(name))
    return { role: 'Tool settings', explanation: 'Settings for a development tool (how to build, check or format the code).', confidence: 'likely' };
  if (name === 'dockerfile' || name.endsWith('.dockerfile') || /^docker-compose/.test(name)) return { role: 'Container recipe', explanation: 'Instructions for packaging the application to run anywhere.', confidence: 'verified' };
  if (lang.kind === 'style') return { role: 'Styling', explanation: 'Controls how things look: colours, sizes, spacing, layout.', confidence: 'verified' };
  if (lang.kind === 'markup') return { role: 'Page structure', explanation: 'Describes what is on a page (text, buttons, images).', confidence: 'verified' };
  if (lang.kind === 'docs') return { role: 'Documentation', explanation: 'Text written for people, not for the computer.', confidence: 'verified' };
  if (lang.kind === 'data') return { role: 'Data / settings', explanation: 'Stores data or settings; it contains no instructions.', confidence: 'verified' };
  for (const [re, role, what] of FOLDER_ROLES) if (re.test(path)) return { role, explanation: `Its folder name suggests it contains ${what}.`, confidence: 'assumption' };
  const used = index?.importedBy.get(path)?.length ?? 0;
  if (used >= 3) return { role: 'Shared building block', explanation: `Used by ${used} other files, so it is an important shared part.`, confidence: 'verified' };
  if (summary && summary.symbols.some((s) => s.kind === 'class')) return { role: 'Code (classes)', explanation: 'Program code that defines classes (blueprints for objects).', confidence: 'verified' };
  if (summary && summary.symbols.some((s) => s.kind === 'function' || s.kind === 'method')) return { role: 'Code (functions)', explanation: 'Program code that defines functions (reusable steps).', confidence: 'verified' };
  return { role: lang.kind === 'code' || lang.kind === 'script' ? 'Code' : 'File', explanation: lang.about, confidence: 'likely' };
}

// ---------------------------------------------------------------------------------------------
// Overview

export interface EntryPoint {
  path: string;
  reason: string;
  confidence: Confidence;
}

export interface Component {
  folder: string;
  files: string[];
  role: string;
  explanation: string;
  confidence: Confidence;
  mainLanguage: string;
}

export interface ProjectOverview {
  name: string;
  /** Short everyday description, sentence by sentence, each with confidence. */
  summary: Fact[];
  kind: Fact;
  languages: { id: string; name: string; files: number; lines: number }[];
  entryPoints: EntryPoint[];
  importantFiles: { path: string; reason: string }[];
  components: Component[];
  /** Connections between components (folder level). */
  componentLinks: { from: string; to: string; count: number }[];
  settingsFiles: string[];
  externalLibraries: { name: string; usedBy: number }[];
  readmeIntro?: string;
  scripts: { name: string; command: string }[];
  stats: { files: number; analysed: number; skipped: number; lines: number };
  unknowns: string[];
}

const FRAMEWORK_HINTS: [string, string][] = [
  ['react', 'React (a library for building user interfaces)'],
  ['vue', 'Vue (a library for building user interfaces)'],
  ['svelte', 'Svelte (a user-interface framework)'],
  ['next', 'Next.js (a website framework built on React)'],
  ['express', 'Express (a web server library)'],
  ['fastify', 'Fastify (a web server library)'],
  ['three', 'three.js (3D graphics in the browser)'],
  ['electron', 'Electron (desktop apps built with web technology)'],
  ['flask', 'Flask (a Python web framework)'],
  ['django', 'Django (a Python web framework)'],
  ['fastapi', 'FastAPI (a Python web API framework)'],
  ['numpy', 'NumPy (numbers and data in Python)'],
  ['pandas', 'pandas (tables of data in Python)'],
  ['torch', 'PyTorch (machine learning)'],
  ['tensorflow', 'TensorFlow (machine learning)'],
  ['pygame', 'pygame (games in Python)'],
  ['tokio', 'Tokio (asynchronous Rust)'],
  ['actix_web', 'Actix Web (a Rust web framework)'],
  ['spring', 'Spring (a Java framework for servers)'],
  ['laravel', 'Laravel (a PHP web framework)'],
  ['rails', 'Ruby on Rails (a web framework)'],
];

function componentOf(path: string): string {
  const parts = path.split('/');
  if (parts.length === 1) return '(project root)';
  if ((parts[0] === 'src' || parts[0] === 'app' || parts[0] === 'lib') && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

export function projectOverview(index: ProjectIndex, readText: (path: string) => string | undefined, folderName = 'project'): ProjectOverview {
  const files = index.files;
  const analysed = files.filter((f) => f.summary);
  const summary: Fact[] = [];
  const unknowns: string[] = [];
  const entryPoints: EntryPoint[] = [];
  const scripts: { name: string; command: string }[] = [];
  let name = folderName;
  let kind: Fact = { text: 'A software project', confidence: 'assumption' };
  const frameworks: string[] = [];
  const has = (p: string) => index.paths.has(p);

  // Manifests.
  const pkgPath = files.find((f) => /(^|\/)package\.json$/.test(f.path) && !f.path.includes('node_modules'))?.path;
  if (pkgPath) {
    try {
      const pkg = JSON.parse(readText(pkgPath) ?? '{}');
      if (typeof pkg.name === 'string') name = pkg.name;
      if (typeof pkg.description === 'string' && pkg.description) summary.push({ text: `The project describes itself as: "${pkg.description}"`, confidence: 'verified' });
      const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
      for (const [k, label] of FRAMEWORK_HINTS) if (deps.some((d) => d === k || d.startsWith(`${k}-`) || d === `@${k}/core`)) frameworks.push(label);
      for (const [k, v] of Object.entries(pkg.scripts ?? {})) if (typeof v === 'string') scripts.push({ name: k, command: v });
      const main = typeof pkg.main === 'string' ? joinPath(dirname(pkgPath), pkg.main) : null;
      if (main && has(main)) entryPoints.push({ path: main, reason: 'package.json names it as "main" (the file other programs load first).', confidence: 'verified' });
      const start = pkg.scripts?.start ?? pkg.scripts?.dev;
      if (typeof start === 'string') {
        const m = /(?:node|ts-node|tsx|deno run|bun)\s+([\w./-]+\.(?:m?js|ts|tsx))/.exec(start);
        if (m && has(joinPath(dirname(pkgPath), m[1]))) entryPoints.push({ path: joinPath(dirname(pkgPath), m[1]), reason: `The start command "${start}" runs it.`, confidence: 'verified' });
      }
      kind = { text: frameworks.length ? `A JavaScript/TypeScript project using ${frameworks.join(', ')}` : 'A JavaScript/TypeScript (Node.js) project', confidence: 'likely' };
    } catch {
      unknowns.push(`${pkgPath} could not be read as valid JSON.`);
    }
  }
  const pyManifest = files.find((f) => /(^|\/)(pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile)$/.test(f.path));
  if (pyManifest) {
    const txt = (readText(pyManifest.path) ?? '').toLowerCase();
    for (const [k, label] of FRAMEWORK_HINTS) if (new RegExp(`(^|[\\s"'=])${k}([\\s<>=~!"'\\[]|$)`, 'm').test(txt) && !frameworks.includes(label)) frameworks.push(label);
    if (!pkgPath) kind = { text: frameworks.length ? `A Python project using ${frameworks.join(', ')}` : 'A Python project', confidence: 'likely' };
  }
  if (has('Cargo.toml') && !pkgPath) kind = { text: 'A Rust project (built with Cargo)', confidence: 'verified' };
  if (has('go.mod') && !pkgPath) kind = { text: 'A Go project', confidence: 'verified' };
  if ((has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) && !pkgPath) kind = { text: 'A Java/Kotlin project (built with Maven or Gradle)', confidence: 'verified' };
  if (files.some((f) => f.path.endsWith('.csproj') || f.path.endsWith('.sln')) && !pkgPath) kind = { text: 'A C#/.NET project', confidence: 'verified' };
  if (has('composer.json') && !pkgPath) kind = { text: 'A PHP project', confidence: 'verified' };
  if (has('Gemfile') && !pkgPath) kind = { text: 'A Ruby project', confidence: 'verified' };
  if (has('CMakeLists.txt') || (has('Makefile') && files.some((f) => /\.(c|cpp|cc|h|hpp)$/.test(f.path)))) if (!pkgPath) kind = { text: 'A C/C++ project', confidence: 'likely' };

  if (kind.confidence === 'assumption') {
    // No manifest: describe the project by its main programming language.
    const codeLangs = new Map<string, number>();
    for (const f of analysed) {
      const l = getLanguage(f.languageId);
      if (l.kind === 'code' || l.kind === 'script') codeLangs.set(l.name, (codeLangs.get(l.name) ?? 0) + (f.summary?.lineCount ?? 0));
    }
    const main = [...codeLangs.entries()].sort((a, b) => b[1] - a[1])[0];
    const hasWeb = files.some((f) => f.languageId === 'html');
    if (main) kind = { text: `A ${main[0]} project${hasWeb && main[0] !== 'JavaScript' ? ' with a web page' : ''}`, confidence: 'likely' };
  }
  // Entry points from code.
  for (const f of analysed) {
    for (const h of f.summary!.hints) {
      if (h.startsWith('entry:python-main')) entryPoints.push({ path: f.path, reason: 'It contains `if __name__ == "__main__":`, which runs when the file is started directly.', confidence: 'verified' });
      else if (h.startsWith('entry:main-function') && /^(c|cpp|go|rust|java|csharp|kotlin|swift)$/.test(f.languageId))
        entryPoints.push({ path: f.path, reason: 'It defines a function called "main", where programs in this language start.', confidence: 'verified' });
    }
  }
  const conventional: [RegExp, string][] = [
    [/^(src\/)?(main|app|index|server|manage|run|__main__)\.(py|js|ts|mjs|go|rs)$/, 'Its file name is a common name for the starting file.'],
    [/^index\.html?$/, 'index.html is the page a browser opens first.'],
    [/^src\/main\.(tsx|ts|jsx|js)$/, 'src/main is the usual starting file of a web app built with Vite.'],
    [/^(Program|Main)\.cs$/, 'Program.cs is the usual starting file of a C# app.'],
  ];
  for (const f of files) for (const [re, why] of conventional) if (re.test(f.path) && !entryPoints.some((e) => e.path === f.path)) entryPoints.push({ path: f.path, reason: why, confidence: 'likely' });
  if (!entryPoints.length) unknowns.push('No clear starting point was found. The program may be a library (used by other programs) or start in a way that needs running it to find out.');

  // Languages.
  const langMap = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    const e = langMap.get(f.languageId) ?? { files: 0, lines: 0 };
    e.files++;
    e.lines += f.summary?.lineCount ?? 0;
    langMap.set(f.languageId, e);
  }
  const languages = [...langMap.entries()].map(([id, v]) => ({ id, name: getLanguage(id).name, ...v })).sort((a, b) => b.lines - a.lines);

  // README.
  const readme = files.find((f) => /^readme(\.md|\.txt|\.rst)?$/i.test(f.path)) ?? files.find((f) => /(^|\/)readme(\.md|\.txt)?$/i.test(f.path));
  let readmeIntro: string | undefined;
  if (readme) {
    const txt = readText(readme.path) ?? '';
    const para = txt
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^(#|!\[|\[!\[|<|```|\||-{3,}|={3,})/.test(p) && p.length > 30);
    if (para) {
      readmeIntro = para.replace(/\s+/g, ' ').slice(0, 400);
      summary.push({ text: `The authors' read-me says: "${readmeIntro}${para.length > 400 ? '…' : ''}"`, confidence: 'verified' });
    }
  } else unknowns.push('There is no README file, so the authors did not leave an introduction.');

  // Components.
  const compMap = new Map<string, string[]>();
  for (const f of files) {
    const c = componentOf(f.path);
    compMap.set(c, [...(compMap.get(c) ?? []), f.path]);
  }
  const components: Component[] = [...compMap.entries()]
    .map(([folder, list]) => {
      const role = FOLDER_ROLES.find(([re]) => re.test(`${folder}/`));
      const langCount = new Map<string, number>();
      for (const p of list) {
        const l = files.find((f) => f.path === p)!.languageId;
        langCount.set(l, (langCount.get(l) ?? 0) + 1);
      }
      const mainLanguage = getLanguage([...langCount.entries()].sort((a, b) => b[1] - a[1])[0][0]).name;
      return {
        folder,
        files: list,
        role: role ? role[1] : folder === '(project root)' ? 'Top-level files' : 'Code',
        explanation: role ? `By its name, this folder contains ${role[2]}.` : folder === '(project root)' ? 'Files directly in the main folder: usually settings, the read-me and starting files.' : `A group of ${list.length} files, mostly ${mainLanguage}.`,
        confidence: (role ? 'assumption' : 'likely') as Confidence,
        mainLanguage,
      };
    })
    .sort((a, b) => b.files.length - a.files.length);
  const linkCount = new Map<string, number>();
  for (const e of index.edges) {
    const a = componentOf(e.from);
    const b = componentOf(e.to);
    if (a === b) continue;
    linkCount.set(`${a}\u0000${b}`, (linkCount.get(`${a}\u0000${b}`) ?? 0) + 1);
  }
  const componentLinks = [...linkCount.entries()].map(([k, count]) => {
    const [from, to] = k.split('\u0000');
    return { from, to, count };
  });

  // Important files.
  const score = new Map<string, { s: number; reasons: string[] }>();
  const add = (p: string, s: number, r: string) => {
    const e = score.get(p) ?? { s: 0, reasons: [] };
    e.s += s;
    if (!e.reasons.includes(r)) e.reasons.push(r);
    score.set(p, e);
  };
  for (const e of entryPoints) add(e.path, 10, 'starting point');
  for (const [p, by] of index.importedBy) add(p, by.length * 2, `used by ${by.length} file${by.length === 1 ? '' : 's'}`);
  if (readme) add(readme.path, 6, 'introduction for people');
  if (pkgPath) add(pkgPath, 6, 'project manifest');
  for (const f of files) if (/(^|\/)(pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|composer\.json|Gemfile)$/.test(f.path)) add(f.path, 5, 'project manifest');
  for (const f of analysed) {
    const defs = f.summary!.symbols.filter((s) => s.kind === 'function' || s.kind === 'class' || s.kind === 'method').length;
    if (defs >= 8) add(f.path, Math.min(6, defs / 4), `${defs} functions/classes`);
  }
  const importantFiles = [...score.entries()]
    .sort((a, b) => b[1].s - a[1].s)
    .slice(0, 10)
    .map(([path, v]) => ({ path, reason: v.reasons.join(', ') }));

  const settingsFiles = files
    .filter((f) => {
      const l = getLanguage(f.languageId);
      return (l.kind === 'data' || l.kind === 'build' || /config|settings|\.env/i.test(f.path)) && !/lock/.test(baseName(f.path).toLowerCase()) && f.languageId !== 'plaintext';
    })
    .map((f) => f.path)
    .slice(0, 30);
  const externalLibraries = [...index.externals.entries()].map(([n, by]) => ({ name: n, usedBy: by.length })).sort((a, b) => b.usedBy - a.usedBy);

  // Everyday summary.
  const totalLines = files.reduce((a, f) => a + (f.summary?.lineCount ?? 0), 0);
  summary.unshift({ text: `${kind.text}.`, confidence: kind.confidence });
  if (frameworks.length) summary.push({ text: `It builds on: ${frameworks.join('; ')}.`, confidence: 'verified' });
  summary.push({
    text: `It has ${files.length} files (${totalLines.toLocaleString('en-US')} lines). Most of it is written in ${languages
      .slice(0, 3)
      .map((l) => l.name)
      .join(', ')}.`,
    confidence: 'verified',
  });
  if (entryPoints.length) summary.push({ text: `It probably starts in ${entryPoints[0].path}.`, confidence: entryPoints[0].confidence === 'verified' ? 'likely' : entryPoints[0].confidence });
  if (externalLibraries.length) summary.push({ text: `It uses ${externalLibraries.length} outside librar${externalLibraries.length === 1 ? 'y' : 'ies'} (ready-made code written by others), for example ${externalLibraries.slice(0, 3).map((e) => e.name).join(', ')}.`, confidence: 'verified' });
  if (index.edges.length) summary.push({ text: `Its files are connected by ${index.edges.length} "import" links (one file using another).`, confidence: 'verified' });
  unknowns.push('What the program actually does when it runs can only be guessed from its code: Understand Code never runs the project.');
  const skipped = files.filter((f) => f.skipped).length;
  return {
    name,
    summary,
    kind,
    languages,
    entryPoints: dedupe(entryPoints),
    importantFiles,
    components,
    componentLinks,
    settingsFiles,
    externalLibraries,
    readmeIntro,
    scripts,
    stats: { files: files.length, analysed: analysed.length, skipped, lines: totalLines },
    unknowns,
  };
}

function dedupe(list: EntryPoint[]): EntryPoint[] {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)));
}

export function isLikelyConfig(path: string): boolean {
  return ['json', 'yml', 'yaml', 'toml', 'ini', 'env', 'cfg', 'conf', 'properties'].includes(extensionOf(path));
}

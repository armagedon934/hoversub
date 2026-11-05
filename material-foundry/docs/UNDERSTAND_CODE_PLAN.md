# UNDERSTAND CODE — architecture inspection and implementation plan

## 1. What already exists (inspection)

| Area | Existing implementation | Reuse for the code module |
| --- | --- | --- |
| Stack | TypeScript 5.9, React 19, Vite 7, zustand 5, lucide-react icons, three.js 0.186 | Same stack; no new UI framework |
| Layout | `src/ui/App.tsx`: top bar + 3-column grid (library / viewport / controls), dialogs, toasts | Top bar gets a mode switch; the code module replaces the three material columns while active, so material state is untouched |
| Design language | `src/styles.css`: CSS variables (dark charcoal, amber accent), buttons, segmented controls, panels, dialogs, toasts | Reused directly; the module adds a light theme by overriding the same variables inside its own container |
| State | zustand stores (`state/store.ts`), localStorage persistence with validation (`state/persistence.ts`) | New independent store for the code module; same validation approach |
| Workers | Worker pool with job tokens (`worker/pool.ts`) for material generation | A dedicated, single code-analysis worker (different workload: one parser instance with cached trees) |
| Export | Stored-ZIP writer (`export/zipwriter.ts`), download helper (`state/exportController.ts`) | Reused to download changed files and backups as ZIP |
| Material tools / 3D preview | Families, presets, renderer, GLB export | Unchanged |
| Offline | Everything runs locally; no network calls at runtime | Code module follows the same rule; adds a service worker so the built app also loads offline after the first visit |
| Tests | Vitest (Node) + Playwright scripts | Same tooling; new test files for the code module |

## 2. Key decisions

1. **Parsing: Tree-sitter (web-tree-sitter 0.25.10) with prebuilt grammars from `tree-sitter-wasms` 0.1.13**,
   loaded lazily per language from the app's own origin (copied into the build by a small Vite plugin; never
   fetched from the internet). A compatibility probe showed these grammars parse real code correctly for Python,
   JavaScript, TypeScript, TSX, HTML, CSS, C, C++, C#, Java, Rust, Go, PHP, Ruby, Swift, Kotlin, JSON, Bash and TOML.
   The Lua and YAML grammars in that package fail with this runtime, and SQL, XML and PowerShell have no grammar.
2. **Lexer adapters** (hand-written, deterministic) for Lua, YAML, SQL, XML/SVG, PowerShell, INI/.env/properties,
   Dockerfile, Makefile, Markdown and Batch: tokens, brackets, comments, strings, keywords and heuristic
   definitions. They are labelled as "token-level analysis" in the UI — never presented as full understanding.
3. **Plain-text mode** for unknown formats: lines, words, numbers, brackets, repeated names; explicitly says the
   language is not recognised.
4. **Analysis runs in a Web Worker** (`code.worker.ts`) that keeps parsed trees per file; the same engine code runs
   in Node for tests.
5. **Explanations are generated locally** from a knowledge base (concepts × 5 levels, simpler variants, examples,
   per-language keyword and operator dictionaries) combined with facts from static analysis. Every fact carries a
   confidence: *Verified* (read from the syntax tree), *Likely* (name-based linking, heuristics), *Assumption*
   (guessed from names/conventions) or *Unknown* (needs running the code or more context). No AI service is used.
6. **Safe editing**: files are copied into an in-app workspace (IndexedDB). Changes are proposed, previewed as a
   diff, syntax-checked by re-parsing, and applied only after confirmation; every apply creates a restore point.
   Undo/redo, history and side-by-side comparison work on the workspace. Writing back to the user's disk is a
   separate, explicitly confirmed action (File System Access API where the browser supports it), otherwise changed
   files are downloaded as a ZIP. Original files are never overwritten silently.
7. **No code execution**: opening, analysing or editing never runs project code; file contents are rendered as text
   only (no HTML rendering).
8. **Optional local AI is not included** in this version; the UI states what the offline engine can and cannot do.

## 3. Module layout

```
src/code/
  languages/   registry (detection), tree-sitter loader, lexer adapters, per-language keyword data
  analysis/    element classification, symbols & references, brackets, functions, imports, project overview, flow
  knowledge/   concepts (5 levels), keywords, operators, glossary
  explain/     explanation generator (level, variant, confidence)
  workspace/   files, edits, history, restore points, diff, proposals ("what if I change this?")
  worker/      code analysis worker + client
  ui/          CodeModule and its panels
```

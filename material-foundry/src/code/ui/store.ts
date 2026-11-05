// State of the "Understand Code" module: the workspace, project analysis, the open file, the
// selected element, explanation preferences and the "what if" flow.

import { create } from 'zustand';
import { playUi } from './uiSound';
import type { OpenResult } from '../analysis/engine';
import { buildProjectIndex, crossReferences, projectOverview, type ProjectIndex, type ProjectOverview } from '../analysis/project';
import type { ElementInfo, FileSummary, FlowStep, Range } from '../analysis/types';
import type { CrossFileInfo, Level } from '../explain/explain';
import { detectLanguage } from '../languages/registry';
import { getLocale, setLocale, tr, type Locale } from '../i18n';
import { SAMPLE_NAME, SAMPLE_NAME_RU, sampleFiles } from '../sample/sampleProject';
import { createStore } from '../workspace/idb';
import { Workspace } from '../workspace/workspace';
import { getCodeClient } from '../worker/client';
import type { LoadResult } from './fileLoading';
import { applyTheme, isThemeId, themeById, type ThemeId } from './themes';

export type CodeView = 'welcome' | 'learn' | 'workshop' | 'unity' | 'shooter' | 'errors' | 'code' | 'overview' | 'map' | 'changes' | 'glossary';
export type DiagramKind = 'auto' | 'flow' | 'connections' | 'data' | 'files';

export interface Prefs {
  /** Base of the theme (decides the colours of code words); follows the chosen palette. */
  theme: 'dark' | 'light';
  /** One of the 10 looks of the program. */
  palette: ThemeId;
  fontSize: number;
  spacing: boolean;
  level: Level;
  /** Show the "what to do next" helper. */
  hints: boolean;
  locale: Locale;
  /** A calmer, very readable font with more letter spacing. */
  readable: boolean;
}

const PREFS_KEY = 'mf.code.prefs.v1';
const LEVEL_SESSION_KEY = 'mf.code.level';

function loadPrefs(): Prefs {
  const d: Prefs = { theme: 'dark', palette: 'graphite', fontSize: 16, spacing: false, level: 2, hints: true, locale: getLocale(), readable: false };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    if (raw.theme === 'light' || raw.theme === 'dark') d.theme = raw.theme;
    if (isThemeId(raw.palette)) d.palette = raw.palette;
    else d.palette = d.theme === 'light' ? 'paper' : 'graphite';
    d.theme = themeById(d.palette).base;
    if (typeof raw.fontSize === 'number' && raw.fontSize >= 12 && raw.fontSize <= 24) d.fontSize = raw.fontSize;
    if (typeof raw.spacing === 'boolean') d.spacing = raw.spacing;
    if (typeof raw.hints === 'boolean') d.hints = raw.hints;
    if (typeof raw.readable === 'boolean') d.readable = raw.readable;
    if ([1, 2, 3, 4, 5].includes(raw.level)) d.level = raw.level;
    const s = Number(sessionStorage.getItem(LEVEL_SESSION_KEY));
    if ([1, 2, 3, 4, 5].includes(s)) d.level = s as Level;
  } catch {
    /* defaults */
  }
  return d;
}

export interface FileEntry {
  path: string;
  size: number;
  languageId: string;
  skipped?: string;
}

export interface Selection {
  offset: number;
  element: ElementInfo;
  cross?: CrossFileInfo;
}

export interface Highlight {
  start: number;
  end: number;
  kind: 'selected' | 'ref' | 'def' | 'partner' | 'scope' | 'changed' | 'search';
}

interface State {
  ready: boolean;
  busy: string | null;
  progress: number;
  error: string | null;
  notes: string[];
  projectName: string;
  files: FileEntry[];
  summaries: Record<string, FileSummary>;
  index: ProjectIndex | null;
  overview: ProjectOverview | null;
  /** Bumped whenever workspace contents change (re-render diff markers etc.). */
  wsVersion: number;
  view: CodeView;
  openPath: string | null;
  open: OpenResult | null;
  openText: string;
  selection: Selection | null;
  highlights: Highlight[];
  scrollTo: { line: number; nonce: number } | null;
  simplerStep: number;
  showExample: boolean;
  diagram: DiagramKind;
  fileFlow: FlowStep[] | null;
  prefs: Prefs;
  whatIfOpen: boolean;
  handles: Map<string, FileSystemFileHandle>;
  rootDir: FileSystemDirectoryHandle | null;
  canWriteToDisk: boolean;
  toasts: { id: number; kind: 'info' | 'success' | 'warning' | 'error'; text: string }[];
  /** Concept to show when the glossary opens. */
  glossaryConcept: string | null;
  /** How many elements the user has clicked (for the step-by-step helper). */
  clicks: number;

  init: () => Promise<void>;
  loadProject: (r: LoadResult) => Promise<void>;
  openExample: () => Promise<void>;
  openFile: (path: string, select?: { offset?: number; line?: number }) => Promise<void>;
  select: (offset: number) => Promise<void>;
  clearSelection: () => void;
  setView: (v: CodeView) => void;
  setLevel: (l: Level) => void;
  simpler: () => void;
  toggleExample: () => void;
  setDiagram: (d: DiagramKind) => void;
  showUses: () => void;
  goToDefinition: () => Promise<void>;
  setPrefs: (p: Partial<Prefs>) => void;
  setWhatIf: (open: boolean) => void;
  refreshAfterChange: (paths: string[]) => Promise<void>;
  toast: (kind: 'info' | 'success' | 'warning' | 'error', text: string) => void;
  closeProject: () => Promise<void>;
}

export const workspace = new Workspace(null);
let toastId = 1;

function textOf(path: string): string {
  return workspace.text(path) ?? '';
}

async function analyseAll(paths: string[], set: (p: Partial<State>) => void, get: () => State): Promise<void> {
  const client = getCodeClient();
  const summaries = { ...get().summaries };
  let done = 0;
  for (const p of paths) {
    const f = workspace.files.get(p);
    if (!f || f.skipped) continue;
    try {
      const r = await client.open(p, f.current, false);
      summaries[p] = r.summary;
    } catch {
      /* listed without analysis */
    }
    done++;
    if (done % 10 === 0 || done === paths.length) set({ progress: done / Math.max(1, paths.length), busy: tr(`Reading the project: ${done} of ${paths.length} files`, `Читаю проект: ${done} из ${paths.length} файлов`) });
  }
  const files = get().files.map((f) => ({ ...f, languageId: summaries[f.path]?.languageId ?? f.languageId }));
  const index = buildProjectIndex(files.map((f) => ({ path: f.path, size: f.size, languageId: f.languageId, summary: summaries[f.path], skipped: f.skipped })));
  const overview = projectOverview(index, (p) => workspace.text(p), get().projectName);
  set({ summaries, index, overview, files });
}

export const useCode = create<State>((set, get) => ({
  ready: false,
  busy: null,
  progress: 0,
  error: null,
  notes: [],
  projectName: '',
  files: [],
  summaries: {},
  index: null,
  overview: null,
  wsVersion: 0,
  view: 'welcome',
  openPath: null,
  open: null,
  openText: '',
  selection: null,
  highlights: [],
  scrollTo: null,
  simplerStep: 0,
  showExample: false,
  diagram: 'auto',
  fileFlow: null,
  prefs: loadPrefs(),
  whatIfOpen: false,
  handles: new Map(),
  rootDir: null,
  canWriteToDisk: false,
  toasts: [],
  glossaryConcept: null,
  clicks: 0,

  async init() {
    if (get().ready) return;
    const store = await createStore();
    (workspace as unknown as { store: unknown }).store = store;
    workspace.onChange(() => set({ wsVersion: get().wsVersion + 1 }));
    set({ ready: true });
    const restored = await workspace.restoreSession().catch(() => false);
    if (restored) {
      const files = [...workspace.files.values()].map((f) => ({ path: f.path, size: f.size, languageId: detectLanguage(f.path, f.current.slice(0, 2000)).language.id, skipped: f.skipped }));
      set({ projectName: workspace.name, files, view: 'overview', busy: tr('Reading the project…', 'Читаю проект…'), notes: [tr('Your previous session was restored from this browser (including your changes and history).', 'Прошлая работа восстановлена из этого браузера (вместе с изменениями и историей).')] });
      try {
        await analyseAll(files.map((f) => f.path), set, get);
      } finally {
        set({ busy: null });
      }
    }
  },

  async loadProject(r) {
    set({ busy: tr('Opening files…', 'Открываю файлы…'), progress: 0, error: null, selection: null, open: null, openPath: null, highlights: [] });
    try {
      await workspace.load(r.name, r.files.map((f) => ({ path: f.path, text: f.text, size: f.size, skipped: f.skipped })));
      const files = r.files.map((f) => ({ path: f.path, size: f.size, languageId: detectLanguage(f.path, f.text.slice(0, 2000)).language.id, skipped: f.skipped }));
      set({ projectName: r.name, files, summaries: {}, notes: r.notes, handles: r.handles, rootDir: r.root ?? null, canWriteToDisk: r.handles.size > 0 && !!r.root });
      await analyseAll(files.filter((f) => !f.skipped).map((f) => f.path), set, get);
      const first = files.length === 1 && !files[0].skipped ? files[0].path : null;
      if (first) await get().openFile(first);
      else set({ view: 'overview' });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ busy: null });
    }
  },

  async openExample() {
    const ru = getLocale() === 'ru';
    await get().loadProject({ name: ru ? SAMPLE_NAME_RU : SAMPLE_NAME, files: sampleFiles(ru ? 'ru' : 'en').map((f) => ({ ...f, size: f.text.length })), handles: new Map(), notes: [] });
  },

  async openFile(path, sel) {
    const f = workspace.files.get(path);
    if (!f) return;
    if (f.skipped) {
      set({ openPath: path, open: null, openText: '', view: 'code', selection: null, highlights: [] });
      return;
    }
    set({ busy: tr(`Reading ${path}…`, `Читаю ${path}…`) });
    try {
      const r = await getCodeClient().open(path, f.current, true);
      set({ openPath: path, open: r, openText: f.current, view: 'code', selection: null, highlights: [], fileFlow: null, simplerStep: 0, showExample: false });
      if (sel?.offset !== undefined) await get().select(sel.offset);
      else if (sel?.line !== undefined) set({ scrollTo: { line: sel.line, nonce: Date.now() } });
      else set({ scrollTo: { line: 0, nonce: Date.now() } });
    } catch (e) {
      get().toast('error', tr(`Could not read ${path}: `, `Не удалось прочитать ${path}: `) + (e instanceof Error ? e.message : String(e)));
    } finally {
      set({ busy: null });
    }
  },

  async select(offset) {
    const path = get().openPath;
    if (!path || !get().open) return;
    const el = await getCodeClient().element(path, offset);
    const highlights: Highlight[] = [{ start: el.range.start, end: el.range.end, kind: 'selected' }];
    if (el.bracket?.partner) highlights.push({ start: el.bracket.partner.start, end: el.bracket.partner.end, kind: 'partner' });
    if (el.bracket?.openRange && el.bracket.closeRange) highlights.push({ start: el.bracket.openRange.end, end: el.bracket.closeRange.start, kind: 'scope' });
    let cross: CrossFileInfo | undefined;
    const index = get().index;
    const name = el.symbolName;
    if (index && name && el.kind !== 'keyword' && el.kind !== 'string' && el.kind !== 'comment') {
      const isLocal = (el.definitions ?? []).some((d) => d.scope !== 0);
      if (!isLocal) {
        const cr = crossReferences(index, name);
        cross = {
          definitionsElsewhere: cr.defs.filter((d) => d.path !== path).map((d) => ({ path: d.path, line: d.def.range.line, kind: d.def.kind })),
          usesElsewhere: cr.refs.filter((r) => r.path !== path && r.ref.role !== 'definition').map((r) => ({ path: r.path, line: r.ref.range.line, role: r.ref.role })),
        };
      }
    }
    set({ selection: { offset, element: el, cross }, highlights, simplerStep: 0, showExample: false, clicks: get().clicks + 1 });
  },

  clearSelection() {
    set({ selection: null, highlights: [] });
  },

  setView(v) {
    set({ view: v });
  },

  setLevel(l) {
    try {
      sessionStorage.setItem(LEVEL_SESSION_KEY, String(l));
    } catch {
      /* ignore */
    }
    get().setPrefs({ level: l });
  },

  simpler() {
    set({ simplerStep: get().simplerStep + 1 });
  },

  toggleExample() {
    set({ showExample: !get().showExample });
  },

  setDiagram(d) {
    set({ diagram: d });
    if (d === 'flow' && !get().fileFlow && get().openPath) getCodeClient().flow(get().openPath!).then((f) => set({ fileFlow: f }));
  },

  showUses() {
    const s = get().selection;
    if (!s) return;
    const hl: Highlight[] = get().highlights.filter((h) => h.kind === 'selected' || h.kind === 'partner' || h.kind === 'scope');
    for (const r of s.element.references ?? []) hl.push({ start: r.range.start, end: r.range.end, kind: 'ref' });
    for (const d of s.element.definitions ?? []) hl.push({ start: d.range.start, end: d.range.end, kind: 'def' });
    set({ highlights: hl });
    const n = (s.element.references ?? []).length;
    get().toast('info', n ? tr(`${n} place${n === 1 ? '' : 's'} highlighted in this file.`, `В этом файле подсвечено мест: ${n}.`) : tr('No other uses in this file.', 'В этом файле больше нигде не используется.'));
  },

  async goToDefinition() {
    const s = get().selection;
    if (!s) return;
    const def = s.element.definitions?.[0];
    if (def) {
      await get().select(def.range.start);
      set({ scrollTo: { line: def.range.line, nonce: Date.now() } });
      return;
    }
    const other = s.cross?.definitionsElsewhere[0];
    if (other) {
      const sum = get().summaries[other.path];
      const d = sum?.symbols.find((x) => x.range.line === other.line && x.name === s.element.symbolName);
      await get().openFile(other.path, d ? { offset: d.range.start } : { line: other.line });
      set({ scrollTo: { line: other.line, nonce: Date.now() } });
      return;
    }
    get().toast('info', tr('Where this is created could not be found in the project. It probably comes from the language itself or from a library.', 'Где это создаётся, в проекте не найдено. Скорее всего, это часть самого языка или библиотеки.'));
  },

  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    // choosing "dark"/"light" picks the matching classic palette; a palette sets its base
    if (p.theme && !p.palette) prefs.palette = p.theme === 'light' ? 'paper' : 'graphite';
    prefs.theme = themeById(prefs.palette).base;
    if (p.palette || p.theme) applyTheme(prefs.palette);
    if (p.locale && p.locale !== getLocale()) {
      setLocale(p.locale);
      getCodeClient().setLocale(p.locale);
    }
    set({ prefs });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  },

  setWhatIf(open) {
    set({ whatIfOpen: open });
  },

  async refreshAfterChange(paths) {
    const client = getCodeClient();
    const summaries = { ...get().summaries };
    for (const p of paths) {
      try {
        summaries[p] = (await client.open(p, textOf(p), false)).summary;
      } catch {
        /* keep previous */
      }
    }
    set({ summaries });
    const files = get().files;
    const index = buildProjectIndex(files.map((f) => ({ path: f.path, size: f.size, languageId: f.languageId, summary: summaries[f.path], skipped: f.skipped })));
    set({ index, overview: projectOverview(index, (p) => workspace.text(p), get().projectName) });
    const open = get().openPath;
    if (open && paths.includes(open)) {
      const prevSel = get().selection;
      const r = await client.open(open, textOf(open), true);
      set({ open: r, openText: textOf(open), selection: null, highlights: [], fileFlow: null });
      if (prevSel && prevSel.offset < textOf(open).length) await get().select(Math.min(prevSel.offset, textOf(open).length - 1)).catch(() => {});
    }
  },

  toast(kind, text) {
    const t = { id: toastId++, kind, text };
    playUi(kind === 'error' ? 'error' : 'notice');
    set({ toasts: [...get().toasts, t].slice(-3) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), kind === 'error' || kind === 'warning' ? 9000 : 4000);
  },

  async closeProject() {
    await workspace.clear();
    set({ projectName: '', files: [], summaries: {}, index: null, overview: null, view: 'welcome', openPath: null, open: null, openText: '', selection: null, highlights: [], handles: new Map(), rootDir: null, canWriteToDisk: false, notes: [] });
  },
}));

export function rangeLabel(r: Range): string {
  return r.line === r.endLine ? tr(`line ${r.line + 1}`, `строка ${r.line + 1}`) : tr(`lines ${r.line + 1}–${r.endLine + 1}`, `строки ${r.line + 1}–${r.endLine + 1}`);
}

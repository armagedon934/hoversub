// The Workshop's code editor (CodeMirror 6): colours, suggestions with explanations, the grey
// "what comes next" ghost text (Tab accepts, Esc hides), friendly live checks with one-click fixes.
// Everything here runs in the browser; nothing is executed.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus, hasNextSnippetField, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, indentUnit, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, MatchDecorator, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { pick, tr } from '../i18n';
import { CPP_WORDS, CS_WORDS, JS_WORDS, PY_WORDS, UNITY_EVENTS, csMembers, type ApiItem } from './api';
import { lintCode, type LintFinding } from './lint';
import { openBlocks, predict, withIndent, type EditLang, type Prediction } from './predict';

// ------------------------------------------------------------------------------------ language

export function languageExtension(lang: EditLang): Extension {
  switch (lang) {
    case 'cs':
      return StreamLanguage.define(csharp);
    case 'py':
      return python();
    case 'js':
      return javascript();
    default:
      return cpp();
  }
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword], color: 'var(--ws-kw)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--ws-type)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--ws-str)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--ws-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--ws-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--ws-fn)' },
  { tag: [t.propertyName], color: 'var(--ws-prop)' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--ws-meta)' },
  { tag: t.invalid, color: 'var(--ws-bad)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--ws-font, 16px)', backgroundColor: 'var(--cm-panel)', color: 'var(--cm-text)' },
  '.cm-scroller': { fontFamily: 'var(--ws-mono, ui-monospace, "Cascadia Code", Consolas, monospace)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--cm-accent)', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'var(--cm-panel-2)', color: 'var(--cm-muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--cm-accent) 8%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--cm-accent) 14%, transparent)', color: 'var(--cm-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--cm-accent) 30%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--cm-accent)', borderLeftWidth: '2px' },
  '.cm-tooltip': { backgroundColor: 'var(--cm-panel)', color: 'var(--cm-text)', border: '1px solid var(--cm-line)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.3)' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important', lineHeight: '1.5' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--cm-accent) !important', color: 'var(--accent-ink, #fff) !important' },
  '.cm-completionInfo': { maxWidth: '340px', padding: '8px 12px', lineHeight: '1.5', whiteSpace: 'normal' },
  '.cm-completionDetail': { opacity: '0.7', marginLeft: '8px', fontStyle: 'normal' },
  '.cm-ghost': { color: 'var(--cm-muted)', opacity: '0.75', fontStyle: 'italic', whiteSpace: 'pre', pointerEvents: 'none' },
  '.cm-ghost-hint': { fontSize: '0.75em', marginLeft: '10px', padding: '0 6px', borderRadius: '6px', border: '1px solid var(--cm-line)', fontStyle: 'normal' },
  '.cm-diagnostic': { padding: '6px 10px', lineHeight: '1.5', maxWidth: '420px' },
  '.cm-diagnosticAction': { backgroundColor: 'var(--cm-accent)', color: 'var(--accent-ink, #fff)', borderRadius: '6px', padding: '2px 8px', marginLeft: '8px' },
  '.cm-snippetField': { backgroundColor: 'color-mix(in srgb, var(--cm-accent) 18%, transparent)', borderRadius: '3px' },
  '.cm-panels': { backgroundColor: 'var(--cm-panel-2)', color: 'var(--cm-text)' },
});

// ----------------------------------------------------------------------------------- completion

function infoNode(item: ApiItem): () => Node {
  return () => {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = item.label + (item.detail && !item.detail.startsWith('(') ? '' : item.detail ?? '');
    const p = document.createElement('div');
    p.textContent = pick(item.info);
    d.append(b, p);
    return d;
  };
}

function toCompletion(item: ApiItem, boost = 0): Completion {
  const base = { label: item.label, detail: item.detail, type: item.kind === 'keyword' ? 'keyword' : item.kind === 'enum' ? 'enum' : item.kind, info: infoNode(item), boost };
  return item.snippet ? snippetCompletion(item.snippet, base) : base;
}

/** Names the learner created in this text (variables, methods, classes). */
function ownNames(doc: string, lang: EditLang): Completion[] {
  const out = new Map<string, Completion>();
  const re = lang === 'py' ? /\b(?:def|class)\s+(\w+)|^\s*(\w+)\s*=[^=]/gm : /\b(?:[A-Z]\w*(?:<[^<>]*>)?|int|float|double|bool|string|var|let|const|auto|char|void)\s+(\w+)\s*[=;,(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const name = m[1] ?? m[2];
    if (!name || out.has(name) || /^(return|new|if|else|class|public|private)$/.test(name)) continue;
    out.set(name, { label: name, type: 'variable', detail: tr('yours', 'твоё'), boost: 2 });
  }
  return [...out.values()];
}

function completionSource(lang: EditLang) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const doc = ctx.state.doc.toString();
    const member = ctx.matchBefore(/[\w.<>()]*\.\w*$/);
    if (member && lang === 'cs') {
      const dot = member.text.lastIndexOf('.');
      const receiver = member.text.slice(0, dot).replace(/^.*?([\w.]+(?:\(\))?)$/, '$1');
      const items = csMembers(receiver, doc);
      if (items.length) return { from: member.from + dot + 1, options: items.map((i) => toCompletion(i)), validFor: /^\w*$/ };
    }
    if (member && lang === 'py' && /random\.\w*$/.test(member.text)) {
      const dot = member.text.lastIndexOf('.');
      return { from: member.from + dot + 1, options: PY_WORDS.filter((w) => w.label.startsWith('random.')).map((w) => toCompletion({ ...w, label: w.label.slice(7), snippet: w.snippet?.replace(/^random\./, '') })), validFor: /^\w*$/ };
    }
    const word = ctx.matchBefore(/[\w#[\]]+$/);
    if (!word && !ctx.explicit) return null;
    const from = word?.from ?? ctx.pos;
    const options: Completion[] = [];
    if (lang === 'cs') {
      const blocks = openBlocks(doc.slice(0, ctx.pos));
      const inClassTop = blocks.length >= 1 && /\bclass\b/.test(blocks[blocks.length - 1]);
      if (inClassTop && /MonoBehaviour/.test(doc)) {
        for (const e of UNITY_EVENTS) {
          if (new RegExp(`void\\s+${e.name}\\s*\\(`).test(doc)) continue;
          options.push(snippetCompletion(`${e.signature}\n{\n\t\${}\n}`, { label: e.signature, displayLabel: e.name, detail: tr('Unity event', 'событие Unity'), type: 'method', boost: 5, info: () => document.createTextNode(pick(e.info)) }));
        }
      }
      options.push(...CS_WORDS.map((w) => toCompletion(w)));
    } else if (lang === 'py') options.push(...PY_WORDS.map((w) => toCompletion(w)));
    else if (lang === 'js') options.push(...JS_WORDS.map((w) => toCompletion(w)));
    else options.push(...CPP_WORDS.map((w) => toCompletion(w)));
    options.push(...ownNames(doc, lang));
    return { from, options, validFor: /^[\w#]*$/ };
  };
}

// ----------------------------------------------------------------------------------- ghost text

interface Ghost {
  pos: number;
  text: string;
  why: string;
  fromAi?: boolean;
}

export const setGhost = StateEffect.define<Ghost | null>();

class GhostWidget extends WidgetType {
  constructor(readonly g: Ghost) {
    super();
  }
  eq(o: GhostWidget) {
    return o.g.text === this.g.text && o.g.pos === this.g.pos && o.g.fromAi === this.g.fromAi;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-ghost';
    s.textContent = this.g.text;
    s.setAttribute('aria-hidden', 'true');
    s.dataset.testid = 'ghost-text';
    const hint = document.createElement('span');
    hint.className = 'cm-ghost-hint';
    hint.textContent = this.g.fromAi ? tr('AI guess · Tab', 'догадка ИИ · Tab') : 'Tab ↹';
    s.append(hint);
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(v, tr0) {
    for (const e of tr0.effects) if (e.is(setGhost)) return e.value;
    if (tr0.docChanged || tr0.selection) return null;
    return v;
  },
  provide: (f) => EditorView.decorations.from(f, (g) => (g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g), side: 1 }).range(g.pos)]) : Decoration.none)),
});

export function currentGhost(state: EditorState): Ghost | null {
  return state.field(ghostField, false) ?? null;
}

export function acceptGhost(view: EditorView): boolean {
  const g = currentGhost(view.state);
  if (!g) return false;
  const line = view.state.doc.lineAt(g.pos);
  const text = withIndent(g.text, line.text);
  view.dispatch({ changes: { from: g.pos, insert: text }, selection: { anchor: g.pos + text.length }, userEvent: 'input.complete' });
  return true;
}

/** Inserts a prediction at the cursor (used by the side panel buttons). */
export function insertPrediction(view: EditorView, p: Prediction): void {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  let text = withIndent(p.text, line.text);
  let from = pos;
  // A whole-line guess on an empty line: start at the line's indentation.
  if (!line.text.trim()) from = line.to;
  else if (pos === line.to && !/^[)>\w(<:]/.test(p.text) && !p.text.startsWith(' ')) {
    text = '\n' + /^\s*/.exec(line.text)![0] + text;
  }
  view.dispatch({ changes: { from, to: from, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.complete' });
  view.focus();
}

function ghostPlugin(lang: EditLang, onPredictions: (p: Prediction[]) => void) {
  return ViewPlugin.fromClass(
    class {
      timer = 0;
      constructor(view: EditorView) {
        this.schedule(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged) this.schedule(u.view);
      }
      schedule(view: EditorView) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.compute(view), 260);
      }
      compute(view: EditorView) {
        const s = view.state;
        const sel = s.selection.main;
        if (!sel.empty) return onPredictions([]);
        const pos = sel.head;
        const doc = s.doc.toString();
        const list = predict(lang, doc.slice(0, pos), doc.slice(pos));
        onPredictions(list);
        if (!view.hasFocus || completionStatus(s) === 'active' || hasNextSnippetField(s) || !list.length) return;
        const g = list[0];
        if (currentGhost(s)?.text === g.text) return;
        view.dispatch({ effects: setGhost.of({ pos, text: g.text, why: pick(g.why) }) });
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );
}

// ------------------------------------------------------------------------------------- checks

export interface LiveProblem {
  line: number;
  col: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix?: { label: string; from: number; to: number; text: string };
}

export type SyntaxChecker = (text: string) => Promise<{ line: number; col: number; endCol?: number; message: string }[]>;

function liveLinter(lang: EditLang, fileName: () => string, syntax: SyntaxChecker, onProblems: (p: LiveProblem[]) => void) {
  return linter(
    async (view) => {
      const text = view.state.doc.toString();
      const doc = view.state.doc;
      const problems: LiveProblem[] = [];
      const diags: Diagnostic[] = [];
      const at = (line: number, col: number) => {
        const l = doc.line(Math.min(Math.max(1, line + 1), doc.lines));
        return Math.min(l.from + Math.max(0, col), l.to);
      };
      let syn: Awaited<ReturnType<SyntaxChecker>> = [];
      try {
        syn = await syntax(text);
      } catch {
        syn = [];
      }
      for (const p of syn.slice(0, 8)) {
        const from = at(p.line, p.col);
        const to = Math.max(from + 1, at(p.line, p.endCol ?? p.col + 1));
        diags.push({ from: Math.min(from, doc.length), to: Math.min(to, doc.length), severity: 'error', message: p.message, source: tr('grammar', 'грамматика') });
        problems.push({ line: p.line, col: p.col, severity: 'error', message: p.message });
      }
      const synLines = new Set(syn.map((p) => p.line));
      const lints: LintFinding[] = lintCode(lang, text, fileName());
      for (const f of lints) {
        if (synLines.has(f.line) && f.severity !== 'error') continue;
        const from = at(f.line, f.from);
        const to = Math.max(from, at(f.line, f.to));
        const fix = f.fix ? { label: f.fix.label, from, to, text: f.fix.text } : undefined;
        diags.push({
          from,
          to,
          severity: f.severity,
          message: f.message,
          source: f.code,
          actions: fix ? [{ name: fix.label, apply: (v, a, b) => v.dispatch({ changes: { from: a, to: b, insert: fix.text } }) }] : undefined,
        });
        problems.push({ line: f.line, col: f.from, severity: f.severity, message: f.message, fix });
      }
      problems.sort((a, b) => a.line - b.line || a.col - b.col);
      onProblems(problems);
      return diags;
    },
    { delay: 450 },
  );
}

// ------------------------------------------------------------------------------------- editor

export interface EditorOptions {
  doc: string;
  lang: EditLang;
  fileName: () => string;
  syntax: SyntaxChecker;
  onChange: (text: string) => void;
  onCursor: (offset: number) => void;
  onPredictions: (p: Prediction[]) => void;
  onProblems: (p: LiveProblem[]) => void;
  /** Ctrl+Enter. */
  onRun: () => void;
  /** Alt+A or Ctrl+Shift+Space: ask the local AI (when enabled). */
  onAskAi?: () => void;
  ghost: boolean;
  /** Extra CodeMirror extensions (e.g. highlighting the blanks ___ of a mission). */
  extra?: Extension[];
}

export interface WorkshopEditor {
  view: EditorView;
  setLang(lang: EditLang): void;
  setGhostEnabled(on: boolean): void;
  setText(text: string): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, o: EditorOptions): WorkshopEditor {
  const langC = new Compartment();
  const smartC = new Compartment();
  const lintC = new Compartment();
  let lang = o.lang;
  let ghostOn = o.ghost;
  // Async checks of a closed editor must not overwrite the panel of the next one.
  let alive = true;
  const onProblems = (p: LiveProblem[]) => alive && o.onProblems(p);
  const onPredictions = (p: Prediction[]) => alive && o.onPredictions(p);
  const smart = () => [
    autocompletion({ override: [completionSource(lang)], activateOnTyping: true, icons: true, maxRenderedOptions: 40, defaultKeymap: true }),
    ghostOn ? [ghostField, ghostPlugin(lang, onPredictions)] : ghostPluginListOnly(lang, onPredictions),
  ];
  const lint = () => liveLinter(lang, o.fileName, o.syntax, onProblems);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: o.doc,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        syntaxHighlighting(highlight),
        theme,
        lintGutter(),
        langC.of(languageExtension(lang)),
        smartC.of(smart()),
        lintC.of(lint()),
        Prec.highest(
          keymap.of([
            { key: 'Tab', run: acceptGhost },
            { key: 'Escape', run: (v) => (currentGhost(v.state) ? (v.dispatch({ effects: setGhost.of(null) }), true) : false) },
            { key: 'Mod-Enter', run: () => (o.onRun(), true) },
            { key: 'Alt-a', run: () => (o.onAskAi?.(), !!o.onAskAi) },
            { key: 'Mod-Shift-Space', run: () => (o.onAskAi?.(), !!o.onAskAi) },
          ]),
        ),
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) o.onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) o.onCursor(u.state.selection.main.head);
        }),
        EditorView.contentAttributes.of({ 'aria-label': tr('Code editor', 'Редактор кода'), 'data-testid': 'ws-editor-content', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        ...(o.extra ?? []),
      ],
    }),
  });
  return {
    view,
    setLang(l) {
      lang = l;
      view.dispatch({ effects: [langC.reconfigure(languageExtension(l)), smartC.reconfigure(smart()), lintC.reconfigure(lint())] });
    },
    setGhostEnabled(on) {
      ghostOn = on;
      view.dispatch({ effects: smartC.reconfigure(smart()) });
    },
    setText(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 } });
    },
    destroy() {
      alive = false;
      view.destroy();
    },
  };
}

/** Guesses go only to the side panel (ghost text turned off). */
function ghostPluginListOnly(lang: EditLang, onPredictions: (p: Prediction[]) => void) {
  return [ghostField, ViewPlugin.fromClass(
    class {
      timer = 0;
      update(u: ViewUpdate) {
        if (!u.docChanged && !u.selectionSet) return;
        clearTimeout(this.timer);
        const s = u.state;
        this.timer = window.setTimeout(() => {
          const pos = s.selection.main.head;
          const doc = s.doc.toString();
          onPredictions(s.selection.main.empty ? predict(lang, doc.slice(0, pos), doc.slice(pos)) : []);
        }, 300);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  )];
}

/** Shows a guess from the local AI as ghost text at the cursor. */
export function showAiGhost(view: EditorView, text: string, why: string): void {
  const pos = view.state.selection.main.head;
  view.dispatch({ effects: setGhost.of({ pos, text, why, fromAi: true }) });
  view.focus();
}

/** Highlights every ___ (a blank to fill in a mission) so it is easy to find. */
export function blankHighlighter(): Extension {
  const deco = new MatchDecorator({ regexp: /___/g, decoration: Decoration.mark({ class: 'cm-blank', attributes: { title: tr('Fill this blank', 'Заполни этот пропуск') } }) });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = deco.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = deco.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

// "What if I change this?" — turns a goal expressed in simple words into the smallest reasonable
// edit, explains every modification, lists what may be affected, and names the risks. Nothing is
// applied here: the UI shows the proposal, checks the syntax of the result, and applies it only
// after explicit confirmation (which also creates a restore point).

import type { ElementInfo, Fact, Range } from '../analysis/types';
import type { ProjectIndex } from '../analysis/project';
import { crossReferences } from '../analysis/project';
import { OPERATORS, keywordEntry } from '../knowledge/keywords';
import { LineIndex } from '../analysis/lines';

export type Goal = 'change-value' | 'change-operator' | 'rename' | 'disable-line' | 'remove-line' | 'edit-line' | 'flip-boolean';

export interface GoalOption {
  goal: Goal;
  label: string;
  description: string;
}

export interface ProposalInput {
  goal: Goal;
  element: ElementInfo;
  path: string;
  /** Current text of every workspace file (for cross-file renames). */
  files: Map<string, string>;
  index?: ProjectIndex | null;
  newValue?: string;
  newName?: string;
  newOperator?: string;
  newLine?: string;
}

export interface AffectedPlace {
  path: string;
  line: number;
  what: string;
  confidence: Fact['confidence'];
}

export interface Proposal {
  ok: boolean;
  /** Why no proposal could be made (shown instead of a diff). */
  problem?: string;
  label: string;
  edits: { path: string; before: string; after: string }[];
  /** One plain sentence per modification. */
  explanations: string[];
  affected: AffectedPlace[];
  risks: Fact[];
  /** Current behaviour, in plain words. */
  current: string;
}

const LINE_COMMENT: Record<string, string> = {
  python: '#', ruby: '#', bash: '#', yaml: '#', toml: '#', ini: '#', dockerfile: '#', makefile: '#', powershell: '#', gitignore: '#',
  javascript: '//', typescript: '//', tsx: '//', c: '//', cpp: '//', csharp: '//', java: '//', rust: '//', go: '//', php: '//', swift: '//', kotlin: '//', scss: '//',
  lua: '--', sql: '--', batch: 'REM',
};
const WRAP_COMMENT: Record<string, [string, string]> = { html: ['<!-- ', ' -->'], xml: ['<!-- ', ' -->'], markdown: ['<!-- ', ' -->'], css: ['/* ', ' */'] };

export function commentSyntax(languageId: string): { line?: string; wrap?: [string, string] } {
  return { line: LINE_COMMENT[languageId], wrap: WRAP_COMMENT[languageId] };
}

const IDENT_RE: Record<string, RegExp> = {
  php: /^\$?[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/,
  powershell: /^\$?[A-Za-z_][A-Za-z0-9_-]*$/,
  css: /^-?[A-Za-z_][A-Za-z0-9_-]*$/,
  scss: /^\$?-?[A-Za-z_][A-Za-z0-9_-]*$/,
  yaml: /^[A-Za-z_][A-Za-z0-9_.-]*$/,
  ini: /^[A-Za-z_][A-Za-z0-9_.-]*$/,
};

export function goalsFor(el: ElementInfo): GoalOption[] {
  const out: GoalOption[] = [];
  const name = el.symbolName ?? el.text;
  if (el.kind === 'number' || el.kind === 'string' || el.kind === 'css-value')
    out.push({ goal: 'change-value', label: el.kind === 'string' ? 'Change this text' : 'Change this value', description: `Replace ${el.kind === 'string' ? 'the text' : el.text} with something else.` });
  if (el.kind === 'boolean') out.push({ goal: 'flip-boolean', label: `Switch it to ${/^(true|True|TRUE)$/.test(el.text) ? 'false' : 'true'}`, description: 'Turn yes into no (or no into yes).' });
  if (el.kind === 'operator' && OPERATORS[el.operator?.symbol ?? '']?.alternatives.length) out.push({ goal: 'change-operator', label: 'Use a different symbol', description: `Replace "${el.operator!.symbol}" with another operator.` });
  if (['variable', 'parameter', 'function-definition', 'function-call', 'class-definition', 'property', 'constant'].includes(el.kind) && name && el.mode !== 'plain')
    out.push({ goal: 'rename', label: `Rename "${name}"`, description: 'Give it a clearer name everywhere it is used.' });
  if (el.statementRange && el.mode !== 'plain') {
    const cs = commentSyntax(el.languageId);
    if (cs.line || cs.wrap) out.push({ goal: 'disable-line', label: 'Switch this line off (keep it as a note)', description: 'Turn the line into a comment so the computer ignores it. Easy to switch back on.' });
    out.push({ goal: 'remove-line', label: 'Delete this line', description: 'Remove the whole line (or statement).' });
  }
  out.push({ goal: 'edit-line', label: 'Write my own change for this line', description: 'Type the new version of the line yourself; you will see a preview first.' });
  return out;
}

function replaceRange(text: string, r: { start: number; end: number }, insert: string): string {
  return text.slice(0, r.start) + insert + text.slice(r.end);
}

function statementLines(text: string, range: Range): { start: number; end: number; firstLine: number; lastLine: number } {
  const li = new LineIndex(text);
  const firstLine = range.line;
  const lastLine = range.endLine;
  const start = li.starts[firstLine];
  const end = lastLine + 1 < li.starts.length ? li.starts[lastLine + 1] : text.length;
  return { start, end, firstLine, lastLine };
}

function validIdentifier(name: string, languageId: string): string | null {
  const re = IDENT_RE[languageId] ?? /^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/;
  if (!name) return 'Please type a name.';
  if (/\s/.test(name)) return 'A name cannot contain spaces. Use an underscore (_) or capital letters instead, like total_price or totalPrice.';
  if (!re.test(name)) return 'This name contains characters that are not allowed here. Use letters, digits and _ (and do not start with a digit).';
  const kw = keywordEntry(languageId, name);
  if (kw && kw.concept !== 'boolean' && kw.concept !== 'null') return `"${name}" is a special word of the language and cannot be used as a name.`;
  return null;
}

export function propose(p: ProposalInput): Proposal {
  const el = p.element;
  const text = p.files.get(p.path) ?? '';
  const name = el.symbolName ?? el.text;
  const base: Proposal = { ok: false, label: '', edits: [], explanations: [], affected: [], risks: [], current: describeCurrent(el) };
  const fail = (problem: string): Proposal => ({ ...base, problem });
  const lineNo = el.range.line + 1;
  const file = p.path.split('/').pop();

  // The element must still be where the analysis found it (the file may have changed since).
  if (text.slice(el.range.start, el.range.end) !== el.text && el.text) return fail('The file changed after you selected this. Please click it again.');

  switch (p.goal) {
    case 'change-value':
    case 'flip-boolean': {
      let v = p.goal === 'flip-boolean' ? flipBoolean(el.text) : (p.newValue ?? '');
      if (p.goal === 'change-value') {
        if (el.kind === 'number') {
          if (!/^-?(\d[\d_]*\.?\d*([eE][-+]?\d+)?|0x[0-9a-fA-F]+|\.\d+)[a-zA-Z%]*$/.test(v.trim())) return fail('Please type a number, like 10 or 2.5.');
          v = v.trim();
        } else if (el.kind === 'string') {
          const m = /^([a-zA-Z]*)("""|'''|["'`])([\s\S]*)\2$/.exec(el.text);
          if (m) {
            const quote = m[2];
            if (quote.length === 1 && v.includes(quote)) v = v.split(quote).join(`\\${quote}`);
            if (quote.length === 1 && v.includes('\n')) return fail('This kind of text must stay on one line.');
            v = `${m[1]}${quote}${v}${quote}`;
          }
        }
        if (v === el.text) return fail('The new value is the same as the current one.');
      }
      const after = replaceRange(text, el.range, v);
      base.edits.push({ path: p.path, before: text, after });
      base.label = `Changed ${short(el.text)} to ${short(v)} on line ${lineNo} of ${file}`;
      base.explanations.push(`Line ${lineNo}: ${short(el.text)} becomes ${short(v)}. Nothing else is changed.`);
      if (el.statement) base.affected.push({ path: p.path, line: el.range.line, what: `This line: ${short(el.statement, 70)}`, confidence: 'verified' });
      if (el.kind === 'string') {
        const same = countOccurrences(p.files, el.text, p.path, el.range.start);
        if (same.length) {
          base.risks.push({ text: `The exact same text appears in ${same.length} other place${same.length === 1 ? '' : 's'}. If some code compares against it, those places may no longer match.`, confidence: 'likely' });
          for (const s of same.slice(0, 8)) base.affected.push({ path: s.path, line: s.line, what: 'Same text (may need to match)', confidence: 'assumption' });
        }
      }
      if (el.enclosingFunction) base.risks.push({ text: `Every time the function "${el.enclosingFunction}" runs, it will use the new value.`, confidence: 'verified' });
      base.risks.push({ text: 'Whether the result is still correct depends on what the program needs — this cannot be checked without running it.', confidence: 'unknown' });
      break;
    }
    case 'change-operator': {
      const sym = el.operator?.symbol ?? el.text;
      const alt = p.newOperator ?? OPERATORS[sym]?.alternatives[0];
      if (!alt) return fail('There is no suggested replacement for this symbol.');
      const after = replaceRange(text, el.range, alt);
      base.edits.push({ path: p.path, before: text, after });
      base.label = `Changed "${sym}" to "${alt}" on line ${lineNo} of ${file}`;
      base.explanations.push(`Line ${lineNo}: "${sym}" (${OPERATORS[sym]?.name ?? 'operator'}) becomes "${alt}" (${OPERATORS[alt]?.name ?? 'operator'}): ${OPERATORS[alt]?.meaning ?? ''}.`);
      if (el.operator?.left && el.operator.right) base.explanations.push(`So "${el.operator.left} ${sym} ${el.operator.right}" becomes "${el.operator.left} ${alt} ${el.operator.right}".`);
      base.affected.push({ path: p.path, line: el.range.line, what: `This line: ${short(el.statement ?? '', 70)}`, confidence: 'verified' });
      if (el.enclosingFunction) base.risks.push({ text: `The result of "${el.enclosingFunction}" will be different, and so will everything that uses its result.`, confidence: 'likely' });
      if (OPERATORS[sym] && OPERATORS[alt] && /compar|equal|less|greater/.test(OPERATORS[sym].name + OPERATORS[alt].name)) base.risks.push({ text: 'Changing a comparison changes which cases are treated as true. Check the boundary values (e.g. exactly equal).', confidence: 'verified' });
      break;
    }
    case 'rename': {
      const newName = (p.newName ?? '').trim();
      const problem = validIdentifier(newName, el.languageId);
      if (problem) return fail(problem);
      if (newName === name) return fail('The new name is the same as the current one.');
      // Places in this file (scope-aware where the analysis supports it).
      const ranges = new Map<string, { start: number; end: number; line: number }[]>();
      const local = new Map<number, { start: number; end: number; line: number }>();
      for (const r of el.references ?? []) if (r.name === name) local.set(r.range.start, { start: r.range.start, end: r.range.end, line: r.range.line });
      for (const d of el.definitions ?? []) local.set(d.range.start, { start: d.range.start, end: d.range.end, line: d.range.line });
      local.set(el.range.start, { start: el.range.start, end: el.range.end, line: el.range.line });
      ranges.set(p.path, [...local.values()]);
      const isLocal = (el.definitions ?? []).length > 0 && (el.definitions ?? []).every((d) => d.scope !== 0 || d.kind === 'parameter');
      // Other files (name-based) for things defined at file level — only files of the same
      // language family that are connected to this file by an import, in either direction.
      const unrelated: { path: string; line: number }[] = [];
      if (!isLocal && p.index) {
        const fam = (l: string) => (l === 'typescript' || l === 'tsx' ? 'javascript' : l === 'cpp' ? 'c' : l);
        const myLang = fam(el.languageId);
        const connected = new Set<string>([...(p.index.imports.get(p.path) ?? []), ...(p.index.importedBy.get(p.path) ?? [])]);
        const langOf = new Map(p.index.files.map((f) => [f.path, fam(f.languageId)]));
        const cr = crossReferences(p.index, name);
        const take = (path: string, r: { start: number; end: number; line: number }) => {
          if (path === p.path) return;
          if (langOf.get(path) !== myLang || !connected.has(path)) {
            unrelated.push({ path, line: r.line });
            return;
          }
          const list = ranges.get(path) ?? [];
          if (!list.some((x) => x.start === r.start)) list.push(r);
          ranges.set(path, list);
        };
        for (const r of cr.refs) take(r.path, { start: r.ref.range.start, end: r.ref.range.end, line: r.ref.range.line });
        for (const d of cr.defs) take(d.path, { start: d.def.range.start, end: d.def.range.end, line: d.def.range.line });
      }
      let total = 0;
      for (const [path, list] of ranges) {
        const before = p.files.get(path);
        if (before === undefined) continue;
        let after = before;
        const sorted = [...list].sort((a, b) => b.start - a.start);
        for (const r of sorted) {
          if (after.slice(r.start, r.end) !== name) continue; // stale or different token
          after = replaceRange(after, r, newName);
          total++;
          base.affected.push({ path, line: r.line, what: `"${name}" → "${newName}"`, confidence: path === p.path && isLocal && el.mode === 'syntax-tree' ? 'verified' : 'likely' });
        }
        if (after !== before) base.edits.push({ path, before, after });
      }
      base.affected.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)));
      base.label = `Renamed "${name}" to "${newName}" (${total} place${total === 1 ? '' : 's'})`;
      base.explanations.push(`"${name}" is replaced by "${newName}" in ${total} place${total === 1 ? '' : 's'}${base.edits.length > 1 ? ` across ${base.edits.length} files` : ''}.`);
      if (isLocal) base.explanations.push('The name is local to one function, so only that function is affected.');
      const clash = (p.index?.files ?? []).some((f) => f.summary?.symbols.some((s) => s.name === newName)) || new RegExp(`\\b${newName.replace(/[$]/g, '\\$')}\\b`).test(text);
      if (clash) base.risks.push({ text: `The name "${newName}" already exists somewhere. Two different things with the same name can be confused by the computer.`, confidence: 'likely' });
      if (!isLocal && base.edits.length > 1) base.risks.push({ text: 'Places in other files are found by spelling, in files connected to this one by an import. Check the list below.', confidence: 'likely' });
      if (unrelated.length) {
        const files = [...new Set(unrelated.map((u) => u.path))];
        base.risks.push({ text: `The same name also appears in ${files.length} unrelated file${files.length === 1 ? '' : 's'} (${files.slice(0, 3).join(', ')}). They are probably a different thing and are NOT renamed.`, confidence: 'likely' });
      }
      if (el.definitions?.some((d) => d.exported)) base.risks.push({ text: 'This name is exported: code outside this project (or loaded by name, for example from settings or a web page) may still use the old name.', confidence: 'likely' });
      base.risks.push({ text: 'Names built from text while the program runs (for example getattr(obj, "name")) cannot be found and are not renamed.', confidence: 'unknown' });
      break;
    }
    case 'disable-line':
    case 'remove-line': {
      const range = el.statementRange ?? el.range;
      const sl = statementLines(text, range);
      const block = text.slice(sl.start, sl.end);
      let replacement = '';
      if (p.goal === 'disable-line') {
        const cs = commentSyntax(el.languageId);
        if (cs.line) {
          replacement = block.replace(/^([ \t]*)(?=\S)/gm, `$1${cs.line} `);
        } else if (cs.wrap) {
          const indent = /^[ \t]*/.exec(block)?.[0] ?? '';
          const nl = block.endsWith('\n') ? '\n' : '';
          replacement = `${indent}${cs.wrap[0]}${block.trim()}${cs.wrap[1]}${nl}`;
        } else return fail('This file type has no way to write a comment, so a line cannot be switched off. You can delete it instead.');
        // Python needs at least one statement in a block: add "pass" when switching off the only line.
        if (el.languageId === 'python' && isOnlyStatementInBlock(text, sl)) replacement += `${/^[ \t]*/.exec(block)?.[0] ?? ''}pass\n`;
      }
      const after = text.slice(0, sl.start) + replacement + text.slice(sl.end);
      base.edits.push({ path: p.path, before: text, after });
      const lines = sl.firstLine === sl.lastLine ? `line ${sl.firstLine + 1}` : `lines ${sl.firstLine + 1}–${sl.lastLine + 1}`;
      base.label = p.goal === 'disable-line' ? `Switched off ${lines} of ${file}` : `Deleted ${lines} of ${file}`;
      base.explanations.push(p.goal === 'disable-line' ? `${cap(lines)} become a comment: the computer will skip ${sl.firstLine === sl.lastLine ? 'it' : 'them'}, but the text stays so you can switch it back on.` : `${cap(lines)} ${sl.firstLine === sl.lastLine ? 'is' : 'are'} removed.`);
      if (sl.firstLine !== sl.lastLine) base.explanations.push('The whole statement is included, because it continues over several lines.');
      // What the removed code provided.
      const defsHere = (el.definitions ?? []).filter((d) => d.range.line >= sl.firstLine && d.range.line <= sl.lastLine);
      const statementText = block;
      if (/\breturn\b/.test(statementText)) base.risks.push({ text: 'This line gives back the function\'s result. Without it, the function will give back nothing (or continue to later lines).', confidence: 'likely' });
      if (el.kind === 'function-call' || /\w\s*\(/.test(statementText)) base.risks.push({ text: 'A function called on this line will no longer run here, so whatever it does (saving, printing, changing data) will not happen.', confidence: 'likely' });
      const assigned = /^\s*(?:(?:const|let|var|local|val|auto|int|float|double|string)\s+)?([A-Za-z_$][\w$]*)\s*(?:[:=]|\+=|-=)/.exec(statementText)?.[1];
      if (assigned && p.files.get(p.path)) {
        const later = countWord(text.slice(sl.end), assigned);
        if (later) base.risks.push({ text: `"${assigned}" gets its value on this line and is used ${later} more time${later === 1 ? '' : 's'} below. Those uses will see an old value or an error.`, confidence: 'likely' });
      }
      for (const d of defsHere) base.affected.push({ path: p.path, line: d.range.line, what: `Defines "${d.name}"`, confidence: 'verified' });
      if (/[{}()[\]]/.test(statementText) && !balanced(statementText)) base.risks.push({ text: 'The removed text contains an unbalanced bracket. The code around it will probably break.', confidence: 'verified' });
      break;
    }
    case 'edit-line': {
      const range = el.statementRange ?? el.range;
      const li = new LineIndex(text);
      const line = range.line;
      const start = li.starts[line];
      const end = line + 1 < li.starts.length ? li.starts[line + 1] - 1 : text.length;
      const before = text.slice(start, end);
      const newLine = (p.newLine ?? '').replace(/\r?\n$/, '');
      if (newLine === before) return fail('The new line is the same as the current one.');
      const after = text.slice(0, start) + newLine + text.slice(end);
      base.edits.push({ path: p.path, before: text, after });
      base.label = `Edited line ${line + 1} of ${file}`;
      base.explanations.push(`Line ${line + 1} is replaced by the text you typed.`);
      base.affected.push({ path: p.path, line, what: 'The edited line', confidence: 'verified' });
      base.risks.push({ text: 'A hand-written change can do anything. The preview checks the grammar of the language, but not whether the program still does the right thing.', confidence: 'unknown' });
      break;
    }
  }
  if (!base.edits.length) return fail('Nothing would change.');
  return { ...base, ok: true };
}

function flipBoolean(t: string): string {
  const map: Record<string, string> = { true: 'false', false: 'true', True: 'False', False: 'True', TRUE: 'FALSE', FALSE: 'TRUE', yes: 'no', no: 'yes', on: 'off', off: 'on', $true: '$false', $false: '$true' };
  return map[t] ?? t;
}

export function describeCurrent(el: ElementInfo): string {
  switch (el.kind) {
    case 'number':
      return `Right now this is the number ${el.text}${el.statement ? `, used in: ${short(el.statement, 80)}` : ''}.`;
    case 'string':
      return `Right now this is the text ${short(el.text, 60)}.`;
    case 'operator':
      return `Right now "${el.operator?.symbol}" ${OPERATORS[el.operator?.symbol ?? '']?.meaning ?? 'is used here'}.`;
    case 'variable':
    case 'parameter':
      return `Right now "${el.symbolName}" is used in ${(el.references ?? []).length} place${(el.references ?? []).length === 1 ? '' : 's'} in this file.`;
    case 'function-definition':
    case 'function-call':
      return `Right now the function "${el.symbolName}" is ${el.kind === 'function-call' ? 'used' : 'defined'} here.`;
    default:
      return el.statement ? `Right now this line is: ${short(el.statement, 90)}` : 'Right now this part of the code is as shown.';
  }
}

function short(s: string, n = 30): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function countWord(text: string, word: string): number {
  const re = new RegExp(`(^|[^\\w$])${word.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g');
  return (text.match(re) ?? []).length;
}

function countOccurrences(files: Map<string, string>, needle: string, skipPath: string, skipOffset: number): { path: string; line: number }[] {
  const out: { path: string; line: number }[] = [];
  for (const [path, text] of files) {
    if (needle.length < 3) break;
    let i = text.indexOf(needle);
    let li: LineIndex | null = null;
    while (i >= 0 && out.length < 50) {
      if (!(path === skipPath && i === skipOffset)) {
        li ??= new LineIndex(text);
        out.push({ path, line: li.lineOf(i) });
      }
      i = text.indexOf(needle, i + needle.length);
    }
  }
  return out;
}

function balanced(s: string): boolean {
  const st: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const c of s.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) {
    if (c === '(' || c === '[' || c === '{') st.push(c);
    else if (pairs[c]) {
      if (st.pop() !== pairs[c]) return false;
    }
  }
  return st.length === 0;
}

function isOnlyStatementInBlock(text: string, sl: { start: number; end: number }): boolean {
  const lines = text.split('\n');
  const li = new LineIndex(text);
  const first = li.lineOf(sl.start);
  const last = li.lineOf(Math.max(sl.start, sl.end - 1));
  const indent = /^[ \t]*/.exec(lines[first])?.[0].length ?? 0;
  if (indent === 0) return false;
  const prev = lines.slice(0, first).reverse().find((l) => l.trim());
  const next = lines.slice(last + 1).find((l) => l.trim());
  const prevIndent = prev ? /^[ \t]*/.exec(prev)![0].length : 0;
  const nextIndent = next ? /^[ \t]*/.exec(next)![0].length : 0;
  return prevIndent < indent && nextIndent < indent && !!prev && /:\s*(#.*)?$/.test(prev);
}

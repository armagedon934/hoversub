// Token-level analysis for languages without a syntax tree (Lua, YAML, SQL, XML, PowerShell, INI,
// Dockerfile, Makefile, Markdown, Batch, SCSS) and plain-text mode for unknown files.
// Everything name-based is reported as "likely": without a full parse, scopes and meaning are
// inferred from patterns, not proven.

import { lex, type Token } from '../languages/lexer';
import { getLanguage } from '../languages/registry';
import { keywordConcept, keywordMeaning, operatorCategory } from '../knowledge/keywords';
import { LineIndex, short } from './lines';
import { TOKEN_CLASSES, type ElementInfo, type ElementKind, type Fact, type FileSummary, type ImportInfo, type SymbolDef, type SymbolKind, type SymbolRef } from './types';

export interface TokenAnalysis {
  summary: FileSummary;
  highlight: Int32Array;
  tokens: Token[];
  /** Index of the partner bracket token for each bracket token (-1 when unmatched). */
  partners: Map<number, number>;
}

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

export function analyzeTokens(text: string, path: string, languageId: string): TokenAnalysis {
  const lang = getLanguage(languageId);
  const lines = new LineIndex(text);
  const tokens = lex(lang.mode === 'plain' ? 'plaintext' : languageId, text);
  const highlight = new Int32Array(tokens.length * 3);
  tokens.forEach((t, i) => {
    highlight[i * 3] = t.start;
    highlight[i * 3 + 1] = t.end;
    highlight[i * 3 + 2] = TOKEN_CLASSES.indexOf(t.cls);
  });
  const tx = (t: Token) => text.slice(t.start, t.end);
  const R = (t: Token) => lines.range(t.start, t.end);
  // Brackets.
  const partners = new Map<number, number>();
  const stack: number[] = [];
  const issues: FileSummary['issues'] = [];
  tokens.forEach((t, i) => {
    if (t.cls !== 'bracket') return;
    const c = tx(t);
    if (OPEN[c]) stack.push(i);
    else if (c === ')' || c === ']' || c === '}') {
      const top = stack[stack.length - 1];
      if (top !== undefined && OPEN[tx(tokens[top])] === c) {
        stack.pop();
        partners.set(top, i);
        partners.set(i, top);
      } else {
        partners.set(i, -1);
        if (issues.length < 50) issues.push({ range: R(t), message: `This "${c}" has no matching opening bracket.` });
      }
    }
  });
  for (const i of stack) {
    partners.set(i, -1);
    if (issues.length < 50) issues.push({ range: R(tokens[i]), message: `This "${tx(tokens[i])}" is never closed.` });
  }

  const symbols: SymbolDef[] = [];
  const refs: SymbolRef[] = [];
  const imports: ImportInfo[] = [];
  const hints: string[] = [];
  const addSym = (t: Token, kind: SymbolKind, name = tx(t), extra: Partial<SymbolDef> = {}) => {
    if (symbols.some((s) => s.name === name && s.kind === kind)) return;
    const line = lines.lineOf(t.start);
    symbols.push({ name, kind, range: R(t), fullRange: lines.range(lines.starts[line], lines.starts[line + 1] ? lines.starts[line + 1] - 1 : text.length), container: null, scope: 0, exported: false, signature: short(lines.lineText(text, line), 90), ...extra });
  };
  const next = (i: number, skipNl = true) => {
    for (let j = i + 1; j < tokens.length; j++) if (skipNl || lines.lineOf(tokens[j].start) === lines.lineOf(tokens[i].start)) return j;
    return -1;
  };

  const yamlPath: { indent: number; key: string }[] = [];
  tokens.forEach((t, i) => {
    const w = tx(t);
    const lw = w.toLowerCase();
    const n1 = next(i);
    const nt = n1 >= 0 ? tx(tokens[n1]) : '';
    switch (languageId) {
      case 'lua':
        if (t.cls === 'keyword' && w === 'function' && n1 >= 0 && tokens[n1].cls !== 'bracket') {
          let j = n1;
          let nameTok = tokens[j];
          while (j + 2 < tokens.length && (tx(tokens[j + 1]) === '.' || tx(tokens[j + 1]) === ':')) {
            j += 2;
            nameTok = tokens[j];
          }
          const params: string[] = [];
          if (tx(tokens[j + 1] ?? t) === '(') for (let k = j + 2; k < tokens.length && tx(tokens[k]) !== ')'; k++) if (tokens[k].cls === 'variable') params.push(tx(tokens[k]));
          addSym(nameTok, 'function', tx(nameTok), { params });
        } else if (t.cls === 'keyword' && w === 'local' && n1 >= 0 && tokens[n1].cls === 'variable') addSym(tokens[n1], 'variable');
        else if (t.cls === 'variable' && w === 'require' && n1 >= 0) {
          const s = tokens[n1].cls === 'string' ? tokens[n1] : tokens[next(n1)] ?? null;
          if (s && s.cls === 'string') imports.push({ spec: tx(s).replace(/^["']|["']$/g, ''), kind: 'require', range: R(t), names: [] });
        }
        break;
      case 'swift':
        if (t.cls === 'keyword' && w === 'func' && n1 >= 0) {
          const params: string[] = [];
          if (tx(tokens[n1 + 1] ?? t) === '(')
            for (let k = n1 + 2, depth = 0; k < tokens.length; k++) {
              const v = tx(tokens[k]);
              if (v === '(') depth++;
              else if (v === ')' && depth-- === 0) break;
              else if (depth === 0 && tx(tokens[k + 1] ?? t) === ':' && tokens[k].cls !== 'keyword') params.push(v);
            }
          addSym(tokens[n1], symbols.some((x) => x.kind === 'class') && lines.lineText(text, lines.lineOf(t.start)).startsWith(' ') ? 'method' : 'function', tx(tokens[n1]), { params });
        } else if (t.cls === 'keyword' && /^(class|struct|enum|protocol|actor|extension)$/.test(w) && n1 >= 0 && tokens[n1].cls !== 'keyword') addSym(tokens[n1], 'class');
        else if (t.cls === 'keyword' && (w === 'let' || w === 'var') && n1 >= 0 && tokens[n1].cls !== 'bracket') addSym(tokens[n1], w === 'let' ? 'constant' : 'variable');
        else if (t.cls === 'keyword' && w === 'import' && n1 >= 0) imports.push({ spec: tx(tokens[n1]), kind: 'import', range: R(t), names: [] });
        break;
      case 'sql':
        if (t.cls === 'keyword' && lw === 'create') {
          let j = n1;
          let objType = '';
          while (j >= 0 && tokens[j].cls === 'keyword' && j - i < 8) {
            const k = tx(tokens[j]).toLowerCase();
            if (/^(table|view|function|procedure|index|trigger|database|schema)$/.test(k)) objType = k;
            j = next(j);
          }
          if (j >= 0 && objType) addSym(tokens[j], objType === 'table' || objType === 'view' ? 'table' : objType === 'function' || objType === 'procedure' ? 'function' : 'variable', tx(tokens[j]).replace(/[`"[\]]/g, ''));
        }
        break;
      case 'powershell':
        if (t.cls === 'keyword' && lw === 'function' && n1 >= 0) addSym(tokens[n1], 'function');
        else if (t.cls === 'variable' && nt === '=' && !symbols.some((s) => s.name.toLowerCase() === lw)) addSym(t, 'variable');
        else if (t.cls === 'function' && /^import-module$/i.test(w) && n1 >= 0) imports.push({ spec: tx(tokens[n1]).replace(/^["']|["']$/g, ''), kind: 'import', range: R(t), names: [] });
        else if (w === '.' && n1 >= 0 && tokens[n1].cls === 'string' && /\.ps1/.test(tx(tokens[n1]))) imports.push({ spec: tx(tokens[n1]).replace(/^["']|["']$/g, ''), kind: 'source', range: R(t), names: [] });
        break;
      case 'yaml':
        if (t.cls === 'property') {
          const indent = t.start - lines.starts[lines.lineOf(t.start)];
          while (yamlPath.length && yamlPath[yamlPath.length - 1].indent >= indent) yamlPath.pop();
          const fullName = [...yamlPath.map((p) => p.key), w].join('.');
          yamlPath.push({ indent, key: w });
          symbols.push({ name: w, kind: 'setting', range: R(t), fullRange: R(t), container: yamlPath.length > 1 ? yamlPath[yamlPath.length - 2].key : null, scope: 0, exported: false, signature: fullName });
        }
        break;
      case 'ini':
        if (t.cls === 'heading') addSym(t, 'setting', w.replace(/^\[|\]$/g, ''));
        else if (t.cls === 'property') addSym(t, 'setting');
        break;
      case 'makefile':
        if (t.cls === 'function') addSym(t, 'target');
        else if (t.cls === 'property') addSym(t, 'setting');
        else if (t.cls === 'keyword' && w === 'include' && n1 >= 0) imports.push({ spec: tx(tokens[n1]), kind: 'include', range: R(t), names: [] });
        break;
      case 'dockerfile':
        if (lw === 'as' && n1 >= 0 && /^from$/i.test(lines.lineText(text, lines.lineOf(t.start)).trim().split(/\s+/)[0])) addSym(tokens[n1], 'target');
        else if (t.cls === 'keyword' && (lw === 'arg' || lw === 'env') && n1 >= 0) addSym(tokens[n1], 'setting', tx(tokens[n1]).split('=')[0]);
        else if (t.cls === 'keyword' && lw === 'from') hints.push(`docker-base:${n1 >= 0 ? tx(tokens[n1]) : ''}`);
        break;
      case 'scss':
        if (t.cls === 'variable' && w.startsWith('$') && nt === ':') addSym(t, 'variable');
        else if (t.cls === 'keyword' && (w === '@mixin' || w === '@function') && n1 >= 0) addSym(tokens[n1], 'function');
        else if (t.cls === 'keyword' && (w === '@import' || w === '@use' || w === '@forward') && n1 >= 0) imports.push({ spec: tx(tokens[n1]).replace(/^["']|["']$/g, ''), kind: 'import', range: R(t), names: [] });
        break;
      case 'xml':
        if (t.cls === 'tag' && !symbols.some((s) => s.name === w)) addSym(t, 'element');
        break;
      case 'markdown':
        if (t.cls === 'heading') addSym(t, 'setting', w.replace(/^#+\s*/, ''));
        else if (t.cls === 'attribute') {
          const m = /\]\(([^)]+)\)/.exec(w);
          if (m && !/^(https?:|mailto:|#)/.test(m[1])) imports.push({ spec: m[1].split('#')[0], kind: 'link', range: R(t), names: [] });
        }
        break;
      case 'batch':
        if (w.startsWith(':') || (t.cls === 'punctuation' && w === ':' && n1 >= 0 && lines.lineOf(tokens[n1].start) === lines.lineOf(t.start) && t.start === lines.starts[lines.lineOf(t.start)])) {
          if (n1 >= 0) addSym(tokens[n1], 'target');
        } else if (t.cls === 'keyword' && lw === 'set' && n1 >= 0) addSym(tokens[n1], 'variable', tx(tokens[n1]).split('=')[0]);
        break;
    }
    // Name-based references.
    if (t.cls === 'variable' || t.cls === 'function' || t.cls === 'property') {
      const role = nt === '=' ? 'assignment' : nt === '(' ? 'call' : 'read';
      refs.push({ name: w, role, range: R(t), scope: 0, container: null });
    }
  });

  const outline = symbols.map((s) => ({ name: s.signature && languageId === 'yaml' ? s.signature : s.name, kind: s.kind, line: s.range.line, depth: languageId === 'yaml' ? Math.min(3, (s.signature?.split('.').length ?? 1) - 1) : 0 }));
  return {
    summary: { path, languageId, mode: lang.mode, lineCount: lines.lineCount, charCount: text.length, symbols, refs, imports, issues, outline, hints, scopes: [] },
    highlight,
    tokens,
    partners,
  };
}

function tokenAt(tokens: Token[], offset: number, text: string): number {
  let o = offset;
  if (o > 0 && (o >= text.length || /\s/.test(text[o]))) o--;
  let lo = 0;
  let hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].end <= o) lo = mid + 1;
    else if (tokens[mid].start > o) hi = mid - 1;
    else return mid;
  }
  return -1;
}

export function elementAtTokens(a: TokenAnalysis, text: string, offset: number): ElementInfo {
  const { tokens, summary } = a;
  const lines = new LineIndex(text);
  const languageId = summary.languageId;
  const idx = tokenAt(tokens, offset, text);
  const line = lines.lineOf(Math.min(offset, Math.max(0, text.length - 1)));
  const lineRange = lines.range(lines.starts[line] ?? 0, (lines.starts[line + 1] ?? text.length + 1) - 1);
  const facts: Fact[] = [];
  const base: ElementInfo = {
    kind: 'unknown',
    text: '',
    range: lineRange,
    languageId,
    mode: summary.mode,
    concept: 'unknown',
    nodeType: 'token',
    context: [],
    statement: short(lines.lineText(text, line), 160),
    statementRange: lineRange,
    enclosingFunction: null,
    enclosingClass: null,
    facts,
    issues: summary.issues.filter((i) => Math.abs(i.range.line - line) <= 1),
  };
  if (summary.mode === 'syntax-tree') return base;
  if (idx < 0) {
    facts.push({ text: 'Empty space. Click on a word, number or symbol.', confidence: 'verified' });
    return base;
  }
  const t = tokens[idx];
  const w = text.slice(t.start, t.end);
  base.text = w;
  base.range = lines.range(t.start, t.end);
  base.nodeType = `token:${t.cls}`;
  const plain = summary.mode === 'plain';
  if (plain) {
    const count = tokens.filter((x) => text.slice(x.start, x.end) === w).length;
    Object.assign(base, { kind: (t.cls === 'number' ? 'number' : t.cls === 'bracket' ? 'bracket' : 'text') as ElementKind, concept: languageId === 'unknown' ? 'unknown-format' : 'plain-text' });
    facts.push({ text: languageId === 'unknown' ? 'This file type is not recognised, so its meaning cannot be analysed. Only words, numbers and brackets can be shown.' : 'This is plain text, not program code.', confidence: 'verified' });
    facts.push({ text: `"${short(w, 40)}" appears ${count} time${count === 1 ? '' : 's'} in this file.`, confidence: 'verified' });
    if (t.cls === 'number') base.literal = { value: w, type: 'a number (meaning unknown)' };
    return base;
  }
  facts.push({ text: `${getLanguage(languageId).name} is analysed at token level here: words and symbols are recognised, but the full structure of the code is not parsed. Links between names are guessed from spelling.`, confidence: 'verified' });
  const setKind = (kind: ElementKind, concept: string) => Object.assign(base, { kind, concept });
  switch (t.cls) {
    case 'comment':
      setKind('comment', 'comment');
      break;
    case 'string':
      setKind('string', 'string');
      base.literal = { value: short(w.replace(/^["'`]|["'`]$/g, ''), 120), type: 'text (a string)' };
      break;
    case 'number':
      setKind('number', 'number');
      base.literal = { value: w, type: /\./.test(w) ? 'a decimal number' : 'a whole number' };
      break;
    case 'constant':
      if (/^(true|false|yes|no|on|off|\$true|\$false)$/i.test(w)) setKind('boolean', 'boolean');
      else if (/^(null|nil|~|\$null)$/i.test(w)) setKind('null', 'null');
      else setKind('variable', 'constant');
      break;
    case 'keyword':
      setKind('keyword', keywordConcept(languageId, w));
      base.keywordMeaning = keywordMeaning(languageId, w);
      if (languageId === 'dockerfile') base.concept = `dockerfile-${w.toLowerCase()}`;
      break;
    case 'heading':
      setKind(languageId === 'markdown' ? 'heading' : 'section', languageId === 'markdown' ? 'markdown-heading' : 'config-section');
      base.symbolName = w.replace(/^\[|\]$|^#+\s*/g, '');
      break;
    case 'tag':
      setKind('tag', 'xml-element');
      base.symbolName = w;
      break;
    case 'attribute':
      setKind('attribute', languageId === 'markdown' ? 'markdown-link' : 'xml-attribute');
      base.symbolName = w;
      break;
    case 'bracket': {
      const p = a.partners.get(idx);
      const partner = p !== undefined && p >= 0 ? tokens[p] : null;
      const ch = w;
      const isOpen = OPEN[ch] !== undefined;
      const prev = tokens[isOpen ? idx - 1 : (p ?? idx) - 1];
      const prevWord = prev ? text.slice(prev.start, prev.end) : '';
      let construct = ch === '{' || ch === '}' ? (languageId === 'lua' ? 'object' : 'block') : ch === '[' || ch === ']' ? 'list' : prev && (prev.cls === 'variable' || prev.cls === 'function') ? 'call-arguments' : 'grouping';
      if (languageId === 'xml' || languageId === 'markdown') construct = 'grouping';
      const encloses = construct === 'call-arguments' ? `the information given to "${prevWord}"` : construct === 'object' ? 'a table (a group of values)' : construct === 'list' ? 'a list or an index' : construct === 'block' ? 'a group of lines that belong together' : 'a part that belongs together';
      setKind('bracket', `bracket-${construct}`);
      const open = isOpen ? t : partner;
      const close = isOpen ? partner : t;
      base.bracket = { char: ch, partner: partner ? lines.range(partner.start, partner.end) : null, encloses, construct, openRange: lines.range((open ?? t).start, (open ?? t).end), closeRange: close ? lines.range(close.start, close.end) : null };
      facts.push(partner ? { text: `Its partner is on line ${lines.lineOf(partner.start) + 1}.`, confidence: 'verified' } : { text: 'No matching partner bracket was found here.', confidence: 'verified' });
      break;
    }
    case 'operator':
    case 'punctuation': {
      if (t.cls === 'punctuation') {
        setKind('punctuation', w === ',' ? 'punct-comma' : w === ';' ? 'punct-semicolon' : w === ':' ? (languageId === 'yaml' ? 'yaml-colon' : 'punct-colon') : 'punct-dot');
      } else {
        const cat = operatorCategory(languageId === 'powershell' && w.startsWith('-') ? psOp(w) : w, '');
        setKind('operator', `operator-${cat}`);
        const prev = tokens[idx - 1];
        const nx = tokens[idx + 1];
        base.operator = { symbol: w, category: cat, left: prev ? text.slice(prev.start, prev.end) : undefined, right: nx ? text.slice(nx.start, nx.end) : undefined };
      }
      break;
    }
    case 'property':
      setKind(languageId === 'yaml' || languageId === 'ini' || languageId === 'makefile' ? 'setting-key' : 'property', languageId === 'yaml' || languageId === 'ini' || languageId === 'makefile' ? 'config-key' : 'property');
      base.symbolName = w;
      break;
    default: {
      // Names (variables, functions, cmdlets, targets).
      base.symbolName = w;
      const defs = summary.symbols.filter((s) => s.name === w || (languageId === 'powershell' && s.name.toLowerCase() === w.toLowerCase()));
      const def = defs[0];
      const isDef = !!def && def.range.start === t.start;
      const next = tokens[idx + 1];
      const nt = next ? text.slice(next.start, next.end) : '';
      if (def?.kind === 'function' || def?.kind === 'target') setKind(isDef ? 'function-definition' : 'function-call', isDef ? 'function' : 'function-call');
      else if (t.cls === 'function' || nt === '(') setKind('function-call', languageId === 'powershell' && /-/.test(w) ? 'cmdlet' : 'function-call');
      else if (def?.kind === 'table') setKind('variable', 'sql-table');
      else setKind('variable', 'variable');
      base.definitions = defs;
      base.references = summary.refs.filter((r) => r.name === w);
      if (defs.length) facts.push({ text: `A definition with this name is on line ${def.range.line + 1}.`, confidence: 'likely' });
      else facts.push({ text: `No definition named "${w}" was found in this file. It may come from elsewhere (another file, a library or the language itself).`, confidence: 'likely' });
      facts.push({ text: `The name appears ${base.references.length} time${base.references.length === 1 ? '' : 's'} in this file.`, confidence: 'verified' });
    }
  }
  return base;
}

function psOp(w: string): string {
  const m = w.toLowerCase();
  if (/^-(eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin)$/.test(m)) return '==';
  if (/^-(and|or|not|xor)$/.test(m)) return '&&';
  return w;
}

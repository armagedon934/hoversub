// Hand-written, deterministic lexers for languages analysed at token level (no syntax tree).
// They recognise comments, strings, numbers, keywords, operators, brackets and a few structural
// patterns (keys, sections, tags). Results are honest token-level facts, not a full parse.

export type TokenClass =
  | 'keyword'
  | 'variable'
  | 'function'
  | 'type'
  | 'property'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'bracket'
  | 'punctuation'
  | 'tag'
  | 'attribute'
  | 'constant'
  | 'heading'
  | 'plain';

export interface Token {
  start: number;
  end: number;
  cls: TokenClass;
}

interface LexConfig {
  lineComments: string[];
  blockComments: [string, string][];
  quotes: string[];
  /** Multi-line string delimiters (open, close). */
  longStrings?: [string, string][];
  keywords: Set<string>;
  constants?: Set<string>;
  caseInsensitive?: boolean;
  /** Characters that start a variable name (e.g. $ in PowerShell, Makefile). */
  varPrefixes?: string[];
  /** Words starting with "-" that are operators (PowerShell -eq, -and ...). */
  dashOperators?: boolean;
  /** Comments only recognised at the start of a line (INI). */
  commentAtLineStart?: boolean;
  /** "key:" at the start of a line is a property (YAML). */
  keyBeforeColon?: boolean;
  /** "key =" at the start of a line is a property (INI, Makefile variables). */
  keyBeforeEquals?: boolean;
  /** "[section]" at the start of a line is a heading (INI, TOML-like). */
  sections?: boolean;
  /** First word of a line is a keyword if it is in `keywords` (Dockerfile instructions). */
  lineStartKeywordsOnly?: boolean;
  /** "name:" at line start is a function (Makefile targets, Batch labels use ":name"). */
  targets?: boolean;
  /** Allow identifiers to contain "-" (CSS-like, PowerShell cmdlets). */
  dashInIdentifiers?: boolean;
}

const OPERATOR_CHARS = '+-*/%=<>!&|^~?:.,;@#\\';
const BRACKETS = '()[]{}';
const MULTI_OPS = ['===', '!==', '**=', '...', '<<=', '>>=', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '->', '=>', '::', '<>', '..', '<<', '>>', '//', '|>', '??'];

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

export const KEYWORDS: Record<string, Set<string>> = {
  lua: set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
  swift: set(
    'actor associatedtype async await break case catch class continue default defer deinit do else enum extension fallthrough fileprivate final for func guard if import in init inout internal is lazy let mutating nil open operator override private protocol public repeat rethrows return self Self some static struct subscript super switch throw throws try typealias var weak where while any',
  ),
  sql: set(
    'select from where and or not insert into values update set delete create table view index drop alter add column primary key foreign references join inner left right full outer on as group by order having limit offset distinct union all exists in is null like between case when then else end begin commit rollback transaction database schema function procedure trigger returns return declare if unique default check constraint asc desc count sum avg min max cast with recursive grant revoke truncate replace use show describe explain integer int varchar char text boolean bool date timestamp float double decimal numeric serial auto_increment',
  ),
  powershell: set(
    'begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in param process return static switch throw trap try until using var while workflow',
  ),
  dockerfile: set('from run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell as'),
  makefile: set('include ifeq ifneq ifdef ifndef else endif define endef export unexport override vpath'),
  batch: set('if else for in do goto call set echo exit rem not exist defined errorlevel setlocal endlocal pause cd mkdir del copy move start shift'),
  yaml: set(''),
  ini: set(''),
  scss: set('@import @mixin @include @extend @function @return @if @else @each @for @while @media @use @forward !important !default'),
  gitignore: set(''),
  plaintext: set(''),
};

const CONFIGS: Record<string, LexConfig> = {
  lua: { lineComments: ['--'], blockComments: [['--[[', ']]']], quotes: ['"', "'"], longStrings: [['[[', ']]']], keywords: KEYWORDS.lua, constants: set('true false nil') },
  swift: { lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['"'], longStrings: [['"""', '"""']], keywords: KEYWORDS.swift, constants: set('true false nil') },
  sql: { lineComments: ['--', '#'], blockComments: [['/*', '*/']], quotes: ["'", '"', '`'], keywords: KEYWORDS.sql, constants: set('true false null'), caseInsensitive: true },
  powershell: {
    lineComments: ['#'],
    blockComments: [['<#', '#>']],
    quotes: ['"', "'"],
    longStrings: [
      ['@"', '"@'],
      ["@'", "'@"],
    ],
    keywords: KEYWORDS.powershell,
    constants: set('$true $false $null'),
    caseInsensitive: true,
    varPrefixes: ['$'],
    dashOperators: true,
    dashInIdentifiers: true,
  },
  yaml: { lineComments: ['#'], blockComments: [], quotes: ['"', "'"], keywords: KEYWORDS.yaml, constants: set('true false null yes no on off ~'), keyBeforeColon: true, dashInIdentifiers: true },
  ini: { lineComments: ['#', ';'], blockComments: [], quotes: ['"', "'"], keywords: KEYWORDS.ini, constants: set('true false yes no on off'), commentAtLineStart: true, keyBeforeEquals: true, sections: true, dashInIdentifiers: true },
  dockerfile: { lineComments: ['#'], blockComments: [], quotes: ['"', "'"], keywords: KEYWORDS.dockerfile, caseInsensitive: true, lineStartKeywordsOnly: true, varPrefixes: ['$'], dashInIdentifiers: true },
  makefile: { lineComments: ['#'], blockComments: [], quotes: ['"', "'"], keywords: KEYWORDS.makefile, varPrefixes: ['$'], keyBeforeEquals: true, targets: true, dashInIdentifiers: true },
  batch: { lineComments: ['::', 'rem ', 'REM '], blockComments: [], quotes: ['"'], keywords: KEYWORDS.batch, caseInsensitive: true, varPrefixes: ['%'] },
  scss: { lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['"', "'"], keywords: KEYWORDS.scss, varPrefixes: ['$', '@'], dashInIdentifiers: true },
  gitignore: { lineComments: ['#'], blockComments: [], quotes: [], keywords: KEYWORDS.gitignore, commentAtLineStart: true, dashInIdentifiers: true },
  plaintext: { lineComments: [], blockComments: [], quotes: [], keywords: KEYWORDS.plaintext },
};

const isIdStart = (c: string) => /[A-Za-z_À-￿]/.test(c);
const isId = (c: string, dash: boolean) => /[A-Za-z0-9_À-￿]/.test(c) || (dash && c === '-');
const isDigit = (c: string) => c >= '0' && c <= '9';

function lineStartAt(text: string, i: number): number {
  const j = text.lastIndexOf('\n', i - 1);
  return j + 1;
}

function onlySpaceBefore(text: string, i: number): boolean {
  for (let k = lineStartAt(text, i); k < i; k++) if (text[k] !== ' ' && text[k] !== '\t') return false;
  return true;
}

function generic(text: string, c: LexConfig): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  const kw = (w: string) => c.keywords.has(c.caseInsensitive ? w.toLowerCase() : w);
  const constant = (w: string) => !!c.constants?.has(c.caseInsensitive ? w.toLowerCase() : w);
  while (i < n) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    const atLineStart = onlySpaceBefore(text, i);
    // Block comments.
    let matched = false;
    for (const [o, cl] of c.blockComments) {
      if (text.startsWith(o, i)) {
        const e = text.indexOf(cl, i + o.length);
        const end = e < 0 ? n : e + cl.length;
        out.push({ start: i, end, cls: 'comment' });
        i = end;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Line comments.
    for (const lc of c.lineComments) {
      const ok = c.caseInsensitive ? text.slice(i, i + lc.length).toLowerCase() === lc.toLowerCase() : text.startsWith(lc, i);
      const wordComment = /^[a-z]/i.test(lc); // e.g. Batch "rem " only counts at the start of a line
      if (ok && ((!c.commentAtLineStart && !wordComment) || atLineStart)) {
        const e = text.indexOf('\n', i);
        const end = e < 0 ? n : e;
        out.push({ start: i, end, cls: 'comment' });
        i = end;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Long strings.
    for (const [o, cl] of c.longStrings ?? []) {
      if (text.startsWith(o, i)) {
        const e = text.indexOf(cl, i + o.length);
        const end = e < 0 ? n : e + cl.length;
        out.push({ start: i, end, cls: 'string' });
        i = end;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Sections: [name] at line start.
    if (c.sections && ch === '[' && atLineStart) {
      const e = text.indexOf(']', i);
      const nl = text.indexOf('\n', i);
      if (e > 0 && (nl < 0 || e < nl)) {
        out.push({ start: i, end: e + 1, cls: 'heading' });
        i = e + 1;
        continue;
      }
    }
    // Quoted strings.
    if (c.quotes.includes(ch)) {
      let j = i + 1;
      while (j < n && text[j] !== ch) {
        if (text[j] === '\\' && ch !== "'") j++;
        else if (text[j] === '\n' && ch !== '`') break;
        j++;
      }
      const end = Math.min(n, j + 1);
      out.push({ start: i, end, cls: 'string' });
      i = end;
      continue;
    }
    // Variables with prefix ($x, %x%, $(X), ${X}).
    if (c.varPrefixes?.includes(ch) && i + 1 < n) {
      const nx = text[i + 1];
      if (nx === '(' || nx === '{') {
        const close = nx === '(' ? ')' : '}';
        const e = text.indexOf(close, i + 2);
        const nl = text.indexOf('\n', i);
        if (e > 0 && (nl < 0 || e < nl)) {
          out.push({ start: i, end: e + 1, cls: 'variable' });
          i = e + 1;
          continue;
        }
      }
      if (ch === '%') {
        const e = text.indexOf('%', i + 1);
        const nl = text.indexOf('\n', i);
        if (e > i + 1 && (nl < 0 || e < nl) && /^[A-Za-z0-9_~:]+$/.test(text.slice(i + 1, e))) {
          out.push({ start: i, end: e + 1, cls: 'variable' });
          i = e + 1;
          continue;
        }
      }
      if (isIdStart(nx) || (ch === '$' && /[0-9?_]/.test(nx))) {
        let j = i + 1;
        while (j < n && isId(text[j], false)) j++;
        const word = text.slice(i, j);
        out.push({ start: i, end: j, cls: constant(word) ? 'constant' : ch === '@' ? 'keyword' : 'variable' });
        i = j;
        continue;
      }
    }
    // Dash operators (PowerShell -eq, -and, parameters -Path).
    if (c.dashOperators && ch === '-' && i + 1 < n && isIdStart(text[i + 1])) {
      let j = i + 1;
      while (j < n && isId(text[j], false)) j++;
      out.push({ start: i, end: j, cls: 'operator' });
      i = j;
      continue;
    }
    // Numbers.
    if (isDigit(ch) || (ch === '.' && isDigit(text[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxX._]/.test(text[j])) j++;
      // Units (12px, 1.5em) belong to the number.
      while (j < n && /[a-z%]/i.test(text[j])) j++;
      out.push({ start: i, end: j, cls: 'number' });
      i = j;
      continue;
    }
    // Words.
    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < n && isId(text[j], !!c.dashInIdentifiers)) j++;
      const word = text.slice(i, j);
      let cls: TokenClass = 'variable';
      let k = j;
      while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
      if (c.lineStartKeywordsOnly) {
        cls = atLineStart && kw(word) ? 'keyword' : 'plain';
      } else if (kw(word)) cls = 'keyword';
      else if (constant(word)) cls = 'constant';
      if (cls !== 'keyword') {
        if (c.keyBeforeColon && text[k] === ':' && (text[k + 1] === ' ' || text[k + 1] === '\n' || k + 1 >= n)) cls = 'property';
        else if (c.keyBeforeEquals && atLineStart && (text[k] === '=' || (text[k] === ':' && text[k + 1] === '=') || (text[k] === '?' && text[k + 1] === '=') || (text[k] === '+' && text[k + 1] === '='))) cls = 'property';
        else if (c.targets && atLineStart && text[k] === ':' && text[k + 1] !== '=') cls = 'function';
        else if (text[k] === '(') cls = 'function';
        else if (c.dashInIdentifiers && /^[A-Z][a-z]+-[A-Z]/.test(word)) cls = 'function'; // PowerShell Verb-Noun cmdlets
      }
      out.push({ start: i, end: j, cls });
      i = j;
      continue;
    }
    if (BRACKETS.includes(ch)) {
      out.push({ start: i, end: i + 1, cls: 'bracket' });
      i++;
      continue;
    }
    if (OPERATOR_CHARS.includes(ch)) {
      const op = MULTI_OPS.find((o) => text.startsWith(o, i));
      const len = op ? op.length : 1;
      const cls: TokenClass = ch === ',' || ch === ';' || (ch === ':' && !op) || (ch === '.' && !op) ? 'punctuation' : 'operator';
      out.push({ start: i, end: i + len, cls });
      i += len;
      continue;
    }
    // Anything else: one character of plain text.
    out.push({ start: i, end: i + 1, cls: 'plain' });
    i++;
  }
  return out;
}

/** XML / SVG lexer: tags, attributes, values, comments, text. */
function xml(text: string): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4);
      const end = e < 0 ? n : e + 3;
      out.push({ start: i, end, cls: 'comment' });
      i = end;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const e = text.indexOf(']]>', i);
      const end = e < 0 ? n : e + 3;
      out.push({ start: i, end, cls: 'string' });
      i = end;
      continue;
    }
    if (text[i] === '<') {
      // Tag: <name attr="v"> or </name> or <?xml ... ?> or <!DOCTYPE>
      let j = i + 1;
      const open = text[j] === '/' || text[j] === '?' || text[j] === '!' ? 2 : 1;
      out.push({ start: i, end: i + open, cls: 'bracket' });
      j = i + open;
      const ns = j;
      while (j < n && /[A-Za-z0-9_:.-]/.test(text[j])) j++;
      if (j > ns) out.push({ start: ns, end: j, cls: 'tag' });
      // Attributes until ">".
      while (j < n && text[j] !== '>') {
        const c = text[j];
        if (/\s/.test(c)) {
          j++;
          continue;
        }
        if (c === '"' || c === "'") {
          const e = text.indexOf(c, j + 1);
          const end = e < 0 ? n : e + 1;
          out.push({ start: j, end, cls: 'string' });
          j = end;
          continue;
        }
        if (/[A-Za-z_:]/.test(c)) {
          const s = j;
          while (j < n && /[A-Za-z0-9_:.-]/.test(text[j])) j++;
          out.push({ start: s, end: j, cls: 'attribute' });
          continue;
        }
        if (c === '/' || c === '?') {
          if (text[j + 1] === '>') {
            out.push({ start: j, end: j + 2, cls: 'bracket' });
            j += 2;
            break;
          }
          j++;
          continue;
        }
        if (c === '=') {
          out.push({ start: j, end: j + 1, cls: 'operator' });
          j++;
          continue;
        }
        if (c === '<') break; // malformed: new tag starts
        j++;
      }
      if (j < n && text[j] === '>') {
        out.push({ start: j, end: j + 1, cls: 'bracket' });
        j++;
      }
      i = j;
      continue;
    }
    // Text content up to the next "<" — split into words for selection.
    let j = i;
    while (j < n && text[j] !== '<') {
      if (/\s/.test(text[j])) {
        j++;
        continue;
      }
      const s = j;
      if (text[j] === '&') {
        const e = text.indexOf(';', j);
        if (e > j && e - j < 10) {
          out.push({ start: j, end: e + 1, cls: 'constant' });
          j = e + 1;
          continue;
        }
      }
      while (j < n && !/\s/.test(text[j]) && text[j] !== '<') j++;
      out.push({ start: s, end: j, cls: 'plain' });
    }
    i = j;
  }
  return out;
}

/** Markdown lexer: headings, code fences, inline code, links, emphasis, lists. */
function markdown(text: string): Token[] {
  const out: Token[] = [];
  let pos = 0;
  let inFence = false;
  for (const line of text.split('\n')) {
    const start = pos;
    pos += line.length + 1;
    if (/^\s*```/.test(line)) {
      out.push({ start, end: start + line.length, cls: 'keyword' });
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (line.length) out.push({ start, end: start + line.length, cls: 'string' });
      continue;
    }
    const h = /^(#{1,6})\s/.exec(line);
    if (h) {
      out.push({ start, end: start + line.length, cls: 'heading' });
      continue;
    }
    const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(^\s*(?:[-*+]|\d+\.)\s)|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const s = start + m.index;
      const e = s + m[0].length;
      const cls: TokenClass = m[1] ? 'string' : m[2] ? 'attribute' : m[3] || m[4] ? 'constant' : m[5] ? 'punctuation' : 'plain';
      if (m[5]) {
        const t = m[0].trimStart();
        out.push({ start: e - t.length, end: e, cls });
      } else out.push({ start: s, end: e, cls });
    }
  }
  return out;
}

/** Tokenise text for a token-level language (or plain text). */
export function lex(languageId: string, text: string): Token[] {
  if (languageId === 'xml') return xml(text);
  if (languageId === 'markdown') return markdown(text);
  const c = CONFIGS[languageId] ?? CONFIGS.plaintext;
  return generic(text, c);
}

export function hasLexer(languageId: string): boolean {
  return languageId === 'xml' || languageId === 'markdown' || languageId in CONFIGS;
}

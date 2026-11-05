// Serializable analysis results shared by the worker, the UI and the tests.

import type { AnalysisMode } from '../languages/registry';
import type { TokenClass } from '../languages/lexer';

/** How sure the analysis is about a statement. */
export type Confidence = 'verified' | 'likely' | 'assumption' | 'unknown';

export interface Fact {
  text: string;
  confidence: Confidence;
}

export interface Range {
  start: number;
  end: number;
  /** 0-based line and column of start. */
  line: number;
  col: number;
  endLine: number;
}

export type SymbolKind = 'function' | 'method' | 'class' | 'variable' | 'constant' | 'parameter' | 'property' | 'type' | 'module' | 'setting' | 'target' | 'element' | 'selector' | 'table';

export interface SymbolDef {
  name: string;
  kind: SymbolKind;
  range: Range;
  /** Range of the whole definition (e.g. the function including its body). */
  fullRange: Range;
  /** Name of the enclosing function/class, if any. */
  container: string | null;
  /** Scope id: 0 = file level, otherwise the start offset of the enclosing function. */
  scope: number;
  exported: boolean;
  /** Parameter names (functions). */
  params?: string[];
  /** Short one-line signature shown in lists. */
  signature?: string;
  /** Author's comment / docstring directly attached to the definition. */
  doc?: string;
}

export type RefRole = 'definition' | 'parameter' | 'assignment' | 'call' | 'read' | 'property' | 'type' | 'import';

export interface SymbolRef {
  name: string;
  role: RefRole;
  range: Range;
  scope: number;
  /** Enclosing function/class name. */
  container: string | null;
}

export interface ImportInfo {
  /** Text as written (module path / file name / package). */
  spec: string;
  range: Range;
  /** Names brought in (when visible). */
  names: string[];
  kind: 'import' | 'include' | 'require' | 'link' | 'script' | 'stylesheet' | 'source' | 'use' | 'mod';
  /** Resolved project path, filled in by project analysis. */
  resolved?: string | null;
  external?: boolean;
}

export interface SyntaxIssue {
  range: Range;
  message: string;
}

export interface OutlineItem {
  name: string;
  kind: SymbolKind;
  line: number;
  depth: number;
}

/** Everything known about one file (without the highlighting tokens). */
export interface FileSummary {
  path: string;
  languageId: string;
  mode: AnalysisMode;
  lineCount: number;
  charCount: number;
  symbols: SymbolDef[];
  refs: SymbolRef[];
  imports: ImportInfo[];
  issues: SyntaxIssue[];
  outline: OutlineItem[];
  /** Plain facts used by the project explainer (entry point hints, etc.). */
  hints: string[];
  /** Every function-like scope as [start, end] offsets (scope id = start). */
  scopes: [number, number][];
  /** Analysis was limited (e.g. file too large). */
  limited?: string;
}

/** Highlighting tokens: [start, end, classIndex] triples. */
export interface Highlight {
  data: Int32Array;
}

export const TOKEN_CLASSES: TokenClass[] = ['keyword', 'variable', 'function', 'type', 'property', 'string', 'number', 'comment', 'operator', 'bracket', 'punctuation', 'tag', 'attribute', 'constant', 'heading', 'plain'];

/** The kind of thing the user clicked, used to choose an explanation. */
export type ElementKind =
  | 'function-definition'
  | 'function-call'
  | 'class-definition'
  | 'variable'
  | 'parameter'
  | 'property'
  | 'type'
  | 'keyword'
  | 'operator'
  | 'bracket'
  | 'punctuation'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'comment'
  | 'import'
  | 'tag'
  | 'attribute'
  | 'css-selector'
  | 'css-property'
  | 'css-value'
  | 'json-key'
  | 'setting-key'
  | 'section'
  | 'heading'
  | 'text'
  | 'unknown';

export interface BracketInfo {
  char: string;
  partner: Range | null;
  /** What the bracket pair encloses, in plain words (e.g. "the body of function add"). */
  encloses: string;
  /** Concept id for the enclosed construct (function-body, call-arguments, list, object, block...). */
  construct: string;
  openRange: Range;
  closeRange: Range | null;
}

export interface OperatorInfo {
  symbol: string;
  /** arithmetic, comparison, logical, assignment, compound-assignment, member, ternary, ... */
  category: string;
  left?: string;
  right?: string;
}

export interface FunctionInfo {
  name: string;
  params: { name: string; type?: string; defaultValue?: string }[];
  returnType?: string;
  /** Expressions after "return" inside the function (not nested functions). */
  returns: string[];
  /** Names of functions called inside it. */
  calls: string[];
  range: Range;
  doc?: string;
  lineCount: number;
  isMethod: boolean;
  container: string | null;
}

export interface FlowStep {
  kind: 'action' | 'assign' | 'call' | 'if' | 'loop' | 'return' | 'try' | 'switch' | 'other';
  text: string;
  line: number;
  /** Branches for if/switch, single body for loops. */
  branches?: { label: string; steps: FlowStep[] }[];
}

export interface ElementInfo {
  kind: ElementKind;
  text: string;
  range: Range;
  languageId: string;
  mode: AnalysisMode;
  /** Concept id in the knowledge base (e.g. "variable", "if", "operator-arithmetic"). */
  concept: string;
  /** Keyword meaning in this language, when the element is a keyword. */
  keywordMeaning?: string;
  /** Raw syntax node type (Tree-sitter) or token class. */
  nodeType: string;
  /** Plain description of the enclosing statement/construct. */
  context: string[];
  /** Full text of the enclosing statement (trimmed). */
  statement?: string;
  statementRange?: Range;
  enclosingFunction?: string | null;
  enclosingClass?: string | null;
  /** The symbol name this element refers to (identifiers). */
  symbolName?: string;
  symbolKind?: SymbolKind;
  definitions?: SymbolDef[];
  references?: SymbolRef[];
  bracket?: BracketInfo;
  operator?: OperatorInfo;
  func?: FunctionInfo;
  flow?: FlowStep[];
  literal?: { value: string; type: string };
  facts: Fact[];
  /** Syntax problems around this element. */
  issues: SyntaxIssue[];
  /** What a well-known library/engine function with this name does (name-based, "likely"). */
  libraryMeaning?: string;
}

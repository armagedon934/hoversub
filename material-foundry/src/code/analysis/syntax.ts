// Syntax-tree analysis (Tree-sitter) shared by all grammar-backed languages.
//
// Grammars name their nodes differently (function_definition, function_item, method_declaration
// ...), so the tables below map many node types onto a small set of concepts. Everything reported
// here is read directly from the syntax tree ("verified"), except name-based linking of uses to
// definitions, which follows scopes and is reported as "likely" where shadowing is possible.

import type { SyntaxNode, Tree } from '../languages/treesitter';
import type { TokenClass } from '../languages/lexer';
import { LineIndex, short } from './lines';
import {
  TOKEN_CLASSES,
  type BracketInfo,
  type ElementInfo,
  type ElementKind,
  type Fact,
  type FileSummary,
  type FlowStep,
  type FunctionInfo,
  type ImportInfo,
  type OperatorInfo,
  type Range,
  type RefRole,
  type SymbolDef,
  type SymbolKind,
  type SymbolRef,
  type SyntaxIssue,
} from './types';
import { keywordConcept, keywordMeaning, operatorCategory } from '../knowledge/keywords';

const S = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

export const FUNC_DEFS = S(
  'function_definition function_declaration method_definition method_declaration function_item method singleton_method generator_function_declaration constructor_declaration local_function_statement function_signature method_signature init_declaration secondary_constructor deinit_declaration destructor_declaration operator_declaration',
);
/** Anonymous functions (named after the variable they are assigned to, if any). */
export const ANON_FUNCS = S('arrow_function function_expression function generator_function lambda lambda_expression closure_expression func_literal anonymous_function_creation_expression anonymous_function lambda_literal do_block');
export const CLASS_DEFS = S(
  'class_definition class_declaration class class_specifier struct_specifier struct_item enum_item trait_item impl_item interface_declaration type_alias_declaration enum_declaration struct_declaration type_spec object_declaration protocol_declaration module namespace_definition record_declaration union_specifier enum_specifier interface_type abstract_class_declaration',
);
export const CALLS = S('call_expression call method_invocation invocation_expression function_call_expression member_call_expression scoped_call_expression nullsafe_member_call_expression macro_invocation command new_expression object_creation_expression');
const IDENTS = S(
  'identifier property_identifier field_identifier type_identifier shorthand_property_identifier shorthand_property_identifier_pattern simple_identifier variable_name constant instance_variable class_variable global_variable namespace_identifier statement_identifier private_property_identifier package_identifier label tag_name attribute_name property_name class_name id_name bare_key word command_name name',
);
const STRINGS = S('string string_literal template_string interpreted_string_literal raw_string_literal char_literal character_literal string_value encapsed_string heredoc string_fragment line_string_literal multi_line_string_literal verbatim_string_literal raw_string interpolated_string_expression quoted_attribute_value attribute_value concatenated_string system_lib_string');
const COMMENTS = S('comment line_comment block_comment documentation_comment multiline_comment');
const PARAM_LISTS = S('parameters formal_parameters parameter_list function_value_parameters method_parameters lambda_parameters closure_parameters type_parameters');
const IMPORT_NODES = S('import_statement import_from_statement import_declaration import_spec import_header using_directive use_declaration preproc_include namespace_use_declaration');
const ASSIGNS = S('assignment assignment_expression augmented_assignment augmented_assignment_expression compound_assignment_expr variable_assignment operator_assignment');
const DECLARATORS = S('variable_declarator init_declarator let_declaration short_var_declaration var_spec const_spec property_declaration field_declaration variable_declaration public_field_definition field_definition');
const TYPES = S('type_identifier predefined_type primitive_type integral_type floating_point_type boolean_type void_type sized_type_specifier user_type generic_type type_annotation implicit_type');
const BLOCKS = S('block statement_block compound_statement body_statement class_body declaration_list field_declaration_list enum_body interface_body function_body statements do_block');
const BRACKET_OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
const BRACKET_CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

export function isIdentNode(n: SyntaxNode): boolean {
  return IDENTS.has(n.type) && n.isNamed;
}

/** Finds the name node of a definition (function, class, variable declarator). */
export function defNameNode(n: SyntaxNode): SyntaxNode | null {
  const byField = n.childForFieldName('name');
  if (byField) {
    if (byField.type === 'variable_name' || isIdentNode(byField)) return byField;
    if (byField.type === 'pattern') return byField.childForFieldName('bound_identifier') ?? firstIdent(byField);
    if (n.type !== 'function_declaration' || byField.type !== 'user_type') return firstIdent(byField) ?? byField;
  }
  const decl = n.childForFieldName('declarator');
  if (decl) {
    let d: SyntaxNode | null = decl;
    for (let k = 0; d && k < 6; k++) {
      if (isIdentNode(d)) return d;
      d = d.childForFieldName('declarator') ?? d.namedChild(0);
    }
  }
  const pat = n.childForFieldName('pattern') ?? n.childForFieldName('left');
  if (pat) return isIdentNode(pat) || pat.type === 'variable_name' ? pat : null;
  // Grammars without field names (Kotlin, C# variable_declarator).
  for (const c of n.namedChildren) {
    if (!c) continue;
    if (isIdentNode(c) || c.type === 'variable_name') return c;
    if (c.type === 'variable_declaration' || c.type === 'type_identifier') return firstIdent(c) ?? c;
  }
  return null;
}

function firstIdent(n: SyntaxNode): SyntaxNode | null {
  if (isIdentNode(n) || n.type === 'variable_name') return n;
  for (const c of n.namedChildren) {
    if (!c) continue;
    const f = firstIdent(c);
    if (f) return f;
  }
  return null;
}

/** For PHP, "$x" is variable_name(name): treat the variable_name as the identifier. */
function normIdent(n: SyntaxNode): SyntaxNode {
  if (n.type === 'name' && n.parent?.type === 'variable_name') return n.parent;
  if (n.type === 'word' && n.parent?.type === 'command_name') return n.parent;
  return n;
}

function isInside(n: SyntaxNode, types: Set<string>, stopAt?: Set<string>): SyntaxNode | null {
  let p: SyntaxNode | null = n.parent;
  while (p) {
    if (types.has(p.type)) return p;
    if (stopAt?.has(p.type)) return null;
    p = p.parent;
  }
  return null;
}

function enclosingFunction(n: SyntaxNode): SyntaxNode | null {
  let p: SyntaxNode | null = n.parent;
  while (p) {
    if (FUNC_DEFS.has(p.type) || ANON_FUNCS.has(p.type)) return p;
    p = p.parent;
  }
  return null;
}

function enclosingClass(n: SyntaxNode): SyntaxNode | null {
  let p: SyntaxNode | null = n.parent;
  while (p) {
    // The root node of a Python file is also called "module"; only nested modules count.
    if (CLASS_DEFS.has(p.type) && p.parent) return p;
    p = p.parent;
  }
  return null;
}

/** Name of a function node, including anonymous functions assigned to a variable or property. */
export function functionName(n: SyntaxNode): string {
  const nm = FUNC_DEFS.has(n.type) ? defNameNode(n) : null;
  if (nm) return nm.text;
  const p = n.parent;
  if (p) {
    if (p.type === 'variable_declarator' || p.type === 'pair' || p.type === 'assignment_expression' || p.type === 'public_field_definition' || p.type === 'field_definition') {
      const k = p.childForFieldName('name') ?? p.childForFieldName('key') ?? p.childForFieldName('left') ?? p.childForFieldName('property');
      if (k) return k.text;
    }
    if (p.type === 'arguments' || p.type === 'argument_list') {
      const call = p.parent;
      const f = call?.childForFieldName('function');
      if (f) return `(callback given to ${short(f.text, 30)})`;
    }
  }
  return '(anonymous function)';
}

function className(n: SyntaxNode): string {
  if (n.type === 'impl_item') return `impl ${n.childForFieldName('type')?.text ?? ''}`.trim();
  const nm = defNameNode(n);
  return nm ? nm.text : '(unnamed)';
}

function paramsOf(fn: SyntaxNode): { name: string; type?: string; defaultValue?: string }[] {
  let list = fn.childForFieldName('parameters') ?? fn.childForFieldName('parameter');
  if (!list) for (const c of fn.namedChildren) if (c && PARAM_LISTS.has(c.type)) list = c;
  const out: { name: string; type?: string; defaultValue?: string }[] = [];
  const collect = (p: SyntaxNode) => {
    if (COMMENTS.has(p.type)) return;
    if (isIdentNode(p) || p.type === 'variable_name') {
      out.push({ name: p.text });
      return;
    }
    if (p.type === 'self_parameter' || p.text === 'self') {
      out.push({ name: p.text });
      return;
    }
    const nameNode = p.childForFieldName('name') ?? p.childForFieldName('pattern') ?? p.childForFieldName('declarator');
    let nm = nameNode && (isIdentNode(nameNode) || nameNode.type === 'variable_name') ? nameNode : null;
    if (!nm) nm = firstIdent(p);
    if (!nm) return;
    const type = p.childForFieldName('type');
    const def = p.childForFieldName('value') ?? p.childForFieldName('default_value');
    out.push({ name: nm.text, type: type ? type.text.replace(/^:\s*/, '') : undefined, defaultValue: def?.text });
  };
  if (list) {
    for (const c of list.namedChildren) if (c) collect(c);
  } else {
    // Swift/Kotlin parameters are direct children.
    for (const c of fn.namedChildren) if (c && (c.type === 'parameter' || c.type === 'lambda_parameter')) collect(c);
  }
  // Python lambda / JS single-param arrow: parameter field
  if (!out.length) {
    const single = fn.childForFieldName('parameter');
    if (single && isIdentNode(single)) out.push({ name: single.text });
  }
  return out;
}

function returnTypeOf(fn: SyntaxNode): string | undefined {
  const r = fn.childForFieldName('return_type') ?? fn.childForFieldName('result');
  if (r) return r.text.replace(/^[:\->\s]+/, '');
  if (fn.type === 'method_declaration' || fn.type === 'function_definition') {
    const t = fn.childForFieldName('type');
    if (t) return t.text;
  }
  return undefined;
}

function bodyOf(n: SyntaxNode): SyntaxNode | null {
  const b = n.childForFieldName('body');
  if (b) return b;
  for (const c of n.namedChildren) if (c && BLOCKS.has(c.type)) return c;
  return null;
}

/** Comment or docstring written by the author directly above / inside a definition. */
function docOf(n: SyntaxNode, lines: LineIndex): string | undefined {
  // Python docstring.
  const body = bodyOf(n);
  const first = body?.namedChild(0);
  if (first && first.type === 'expression_statement' && first.namedChild(0)?.type === 'string') {
    return first.text.replace(/^[rRbBuU]?("""|'''|"|')|("""|'''|"|')$/g, '').trim();
  }
  // Comments immediately above (possibly above an export/decorator wrapper).
  let target: SyntaxNode = n;
  if (n.parent && (n.parent.type === 'export_statement' || n.parent.type === 'decorated_definition')) target = n.parent;
  const parts: string[] = [];
  let prev = target.previousNamedSibling;
  let expectLine = lines.lineOf(target.startIndex) - 1;
  while (prev && COMMENTS.has(prev.type) && lines.lineOf(prev.endIndex - 1) === expectLine) {
    parts.unshift(prev.text);
    expectLine = lines.lineOf(prev.startIndex) - 1;
    prev = prev.previousNamedSibling;
  }
  if (!parts.length) return undefined;
  return parts
    .join('\n')
    .replace(/^\s*(\/\*\*?|\*\/|\*|\/\/\/?|#|--)\s?/gm, '')
    .replace(/\*\/\s*$/, '')
    .trim();
}

function classifyLeaf(n: SyntaxNode): TokenClass {
  const t = n.type;
  if (COMMENTS.has(t)) return 'comment';
  if (STRINGS.has(t) || t === 'string_content' || t === 'escape_sequence' || t === 'regex' || t === 'regex_pattern') return 'string';
  if (/(^|_)(number|integer|float|decimal|hex|octal|binary|real|int)(_|$)|_literal$/.test(t) && /\d/.test(n.text) && !STRINGS.has(t)) return 'number';
  if (t === 'true' || t === 'false' || t === 'null' || t === 'none' || t === 'nil' || t === 'undefined' || t === 'boolean' || t === 'null_literal' || t === 'boolean_literal') return 'constant';
  if (!n.isNamed) {
    const tx = n.text;
    if (BRACKET_OPEN[tx] !== undefined || BRACKET_CLOSE[tx] !== undefined) {
      if ((tx === '<' || tx === '>') && !/(type_arguments|type_parameters|start_tag|end_tag|jsx_|self_closing|tag)/.test(n.parent?.type ?? '')) return 'operator';
      return 'bracket';
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tx)) return 'keyword';
    if (tx === ',' || tx === ';' || tx === ':' || tx === '.') return tx === '.' && /member|field|selector|attribute|scoped|navigation/.test(n.parent?.type ?? '') ? 'operator' : 'punctuation';
    return 'operator';
  }
  if (t === 'tag_name') return 'tag';
  if (t === 'attribute_name') return 'attribute';
  if (t === 'property_name' || t === 'bare_key') return 'property';
  if (t === 'class_name' || t === 'id_name') return 'type';
  if (TYPES.has(t)) return 'type';
  if (IDENTS.has(t)) {
    const p = n.parent;
    if (p) {
      if ((FUNC_DEFS.has(p.type) && defNameNode(p)?.id === n.id) || p.type === 'function_declarator') return 'function';
      if (CLASS_DEFS.has(p.type) && defNameNode(p)?.id === n.id) return 'type';
      if (CALLS.has(p.type) && (p.childForFieldName('function')?.id === n.id || p.childForFieldName('name')?.id === n.id || p.childForFieldName('macro')?.id === n.id)) return 'function';
      const gp = p.parent;
      if (gp && CALLS.has(gp.type) && gp.childForFieldName('function')?.id === p.id && (p.childForFieldName('property')?.id === n.id || p.childForFieldName('field')?.id === n.id || p.childForFieldName('attribute')?.id === n.id || p.childForFieldName('name')?.id === n.id)) return 'function';
      if (p.type === 'command_name') return 'function';
      if (p.type === 'call_expression' && !p.childForFieldName('function') && p.namedChild(0)?.id === n.id) return 'function';
      if (p.type === 'call' && p.childForFieldName('method')?.id === n.id) return 'function';
    }
    if (t === 'property_identifier' || t === 'field_identifier' || t === 'shorthand_property_identifier') return 'property';
    if (t === 'constant' || /^[A-Z][A-Z0-9_]+$/.test(n.text)) return 'constant';
    return 'variable';
  }
  if (t === 'text' || t === 'raw_text') return 'plain';
  if (t === 'color_value' || t === 'plain_value' || t === 'integer_value' || t === 'float_value') return /^\d|^#/.test(n.text) ? 'number' : 'plain';
  return 'plain';
}

export interface SyntaxAnalysis {
  summary: FileSummary;
  highlight: Int32Array;
}

/** Walks the whole tree once: highlighting, definitions, references, imports, issues, outline. */
export function analyzeTree(tree: Tree, text: string, path: string, languageId: string): SyntaxAnalysis {
  const lines = new LineIndex(text);
  const R = (n: SyntaxNode): Range => lines.range(n.startIndex, n.endIndex);
  const hl: number[] = [];
  const symbols: SymbolDef[] = [];
  const refs: SymbolRef[] = [];
  const imports: ImportInfo[] = [];
  const issues: SyntaxIssue[] = [];
  const hints: string[] = [];
  const scopes: [number, number][] = [];
  const atomic = new Set([...STRINGS, ...COMMENTS, 'regex']);

  const scopeOf = (n: SyntaxNode) => enclosingFunction(n)?.startIndex ?? 0;
  const containerOf = (n: SyntaxNode): string | null => {
    const f = enclosingFunction(n);
    if (f) return functionName(f);
    const c = enclosingClass(n);
    return c ? className(c) : null;
  };
  const exportedOf = (n: SyntaxNode): boolean => {
    const p = n.parent;
    if (p?.type === 'export_statement') return true;
    if (p?.parent?.type === 'export_statement') return true;
    for (const c of n.children) if (c && (c.type === 'visibility_modifier' && /pub|public/.test(c.text))) return true;
    if (/^(go)$/.test(languageId)) return /^[A-Z]/.test(defNameNode(n)?.text ?? '');
    return false;
  };

  const addDef = (nameNode: SyntaxNode, kind: SymbolKind, full: SyntaxNode, extra: Partial<SymbolDef> = {}) => {
    const n = normIdent(nameNode);
    symbols.push({
      name: n.text,
      kind,
      range: R(n),
      fullRange: R(full),
      container: containerOf(full),
      scope: scopeOf(full),
      exported: exportedOf(full),
      ...extra,
    });
  };

  const cursor = tree.walk();
  const visit = (n: SyntaxNode) => {
    const t = n.type;
    // Highlight tokens: leaves, plus atomic nodes (strings/comments) as a whole.
    if (n.childCount === 0 || (atomic.has(t) && !n.namedChildren.some((c) => c && (c.type === 'template_substitution' || c.type === 'interpolation' || c.type === 'simple_expansion' || c.type === 'expansion')))) {
      if (n.endIndex > n.startIndex) hl.push(n.startIndex, n.endIndex, TOKEN_CLASSES.indexOf(classifyLeaf(n)));
    }
    if (n.isError || n.isMissing) {
      issues.push({ range: R(n), message: n.isMissing ? `Something is missing here: "${n.type}" was expected.` : 'The code here does not follow the rules of the language (syntax error).' });
    }
    if (FUNC_DEFS.has(t) || ANON_FUNCS.has(t)) scopes.push([n.startIndex, n.endIndex]);
    // Definitions.
    if (FUNC_DEFS.has(t)) {
      const nm = defNameNode(n);
      if (nm) {
        const isMethod = !!enclosingClass(n) && !enclosingFunction(n);
        const params = paramsOf(n).map((p) => p.name);
        addDef(nm, isMethod ? 'method' : 'function', n, { params, signature: short(n.text.split(/[{:]\s*\n|=>|\)\s*\{/)[0] + ')', 90).replace(/\)\)$/, ')'), doc: docOf(n, lines) });
        for (const p of paramsOf(n)) {
          const pn = findParamNode(n, p.name);
          if (pn) symbols.push({ name: pn.text, kind: 'parameter', range: R(pn), fullRange: R(pn), container: functionName(n), scope: n.startIndex, exported: false });
        }
      }
    } else if (ANON_FUNCS.has(t)) {
      const nm = functionName(n);
      if (n.parent?.type === 'variable_declarator') {
        const k = n.parent.childForFieldName('name');
        if (k) addDef(k, 'function', n.parent.parent ?? n.parent, { params: paramsOf(n).map((p) => p.name), signature: short(n.parent.text, 90), doc: docOf(n.parent.parent ?? n.parent, lines) });
      }
      for (const p of paramsOf(n)) {
        const pn = findParamNode(n, p.name);
        if (pn) symbols.push({ name: pn.text, kind: 'parameter', range: R(pn), fullRange: R(pn), container: nm, scope: n.startIndex, exported: false });
      }
    } else if (CLASS_DEFS.has(t) && t !== 'module' || (t === 'module' && languageId === 'ruby')) {
      const nm = t === 'impl_item' ? null : defNameNode(n);
      if (nm) addDef(nm, t === 'type_alias_declaration' || t === 'type_spec' || t === 'interface_declaration' || t === 'protocol_declaration' ? 'type' : 'class', n, { doc: docOf(n, lines) });
    } else if (DECLARATORS.has(t) || (ASSIGNS.has(t) && t !== 'augmented_assignment' && t !== 'augmented_assignment_expression' && t !== 'compound_assignment_expr' && t !== 'operator_assignment')) {
      if (!(t === 'variable_declarator' && n.childForFieldName('value') && ANON_FUNCS.has(n.childForFieldName('value')!.type))) {
        const targets: SyntaxNode[] = [];
        if (t === 'short_var_declaration') {
          const l = n.childForFieldName('left');
          if (l) for (const c of l.namedChildren) if (c && isIdentNode(c)) targets.push(c);
        } else if (ASSIGNS.has(t)) {
          const l = n.childForFieldName('left') ?? n.childForFieldName('name');
          if (l && (isIdentNode(l) || l.type === 'variable_name')) targets.push(l);
          else if (l && (l.type === 'pattern_list' || l.type === 'tuple_pattern' || l.type === 'left_assignment_list')) for (const c of l.namedChildren) if (c && isIdentNode(c)) targets.push(c);
        } else {
          const pat = n.childForFieldName('name') ?? n.childForFieldName('pattern');
          if (pat && /^(array_pattern|object_pattern|tuple_pattern|list_pattern)$/.test(pat.type)) {
            const st: SyntaxNode[] = [pat];
            while (st.length) {
              const q = st.pop()!;
              if (isIdentNode(q) && q.type !== 'property_identifier') targets.push(q);
              for (const c of q.namedChildren) if (c && c.type !== 'pair_pattern') st.push(c);
                else if (c && c.type === 'pair_pattern') { const v = c.childForFieldName('value'); if (v) st.push(v); }
            }
          }
          const nm = targets.length ? null : defNameNode(n);
          if (nm && n.type !== 'variable_declaration') targets.push(nm);
          else if (n.type === 'variable_declaration') for (const c of n.namedChildren) if (c && c.type === 'variable_declarator') { const k = defNameNode(c); if (k) targets.push(k); }
        }
        for (const tn of targets) {
          // Only the first assignment in a scope counts as the definition ("creation").
          const name = normIdent(tn).text;
          const sc = scopeOf(n);
          const already = symbols.some((s) => s.name === name && s.scope === sc && (s.kind === 'variable' || s.kind === 'constant' || s.kind === 'parameter'));
          if (already) continue;
          const isConst = /^\s*(const|final|val)\b/.test(text.slice(n.parent?.startIndex ?? n.startIndex, (n.parent?.startIndex ?? n.startIndex) + 12)) || /^[A-Z][A-Z0-9_]+$/.test(name);
          const kind: SymbolKind = t === 'field_declaration' || t === 'public_field_definition' || t === 'field_definition' ? 'property' : isConst ? 'constant' : 'variable';
          addDef(tn, kind, n.parent && (n.parent.type === 'lexical_declaration' || n.parent.type === 'variable_declaration' || n.parent.type === 'local_variable_declaration' || n.parent.type === 'declaration' || n.parent.type === 'expression_statement') ? n.parent : n, { signature: short(n.text, 90) });
        }
      }
    } else if (t === 'pair' && languageId === 'json' && !n.parent?.parent?.parent) {
      const k = n.childForFieldName('key');
      if (k) symbols.push({ name: k.text.replace(/^"|"$/g, ''), kind: 'setting', range: R(k), fullRange: R(n), container: null, scope: 0, exported: false });
    } else if ((t === 'table' || t === 'table_array_element') && languageId === 'toml') {
      const k = n.namedChild(0);
      if (k) symbols.push({ name: k.text, kind: 'setting', range: R(k), fullRange: R(n), container: null, scope: 0, exported: false });
    } else if (t === 'rule_set' && languageId === 'css') {
      const sel = n.childForFieldName('selectors') ?? n.namedChild(0);
      if (sel) symbols.push({ name: sel.text, kind: 'selector', range: R(sel), fullRange: R(n), container: null, scope: 0, exported: false });
    } else if (t === 'element' && languageId === 'html') {
      const st = n.namedChild(0);
      const idAttr = st?.namedChildren.find((a) => a?.type === 'attribute' && a.namedChild(0)?.text === 'id');
      const v = idAttr?.namedChild(1);
      if (v) symbols.push({ name: v.text.replace(/^["']|["']$/g, ''), kind: 'element', range: R(v), fullRange: R(n), container: null, scope: 0, exported: false });
    }
    // Imports.
    collectImport(n, languageId, R, imports);
    // References.
    if ((IDENTS.has(t) || t === 'variable_name') && n.isNamed && !(t === 'name' && n.parent?.type === 'variable_name') && !(t === 'word' && n.parent?.type === 'command_name')) {
      if (languageId !== 'html' && languageId !== 'css' && languageId !== 'json' && languageId !== 'toml') refs.push({ name: n.text, role: refRole(n), range: R(n), scope: scopeOf(n), container: containerOf(n) });
    }
    // Entry point hints.
    if (t === 'if_statement' && languageId === 'python' && /__name__\s*==\s*['"]__main__['"]/.test(n.childForFieldName('condition')?.text ?? '')) hints.push(`entry:python-main@${lines.lineOf(n.startIndex) + 1}`);
  };
  // Iterative depth-first traversal with a TreeCursor.
  let descend = true;
  for (;;) {
    if (descend) {
      const n = cursor.currentNode;
      visit(n);
      const atomicNode = atomic.has(n.type) && !n.namedChildren.some((c) => c && (c.type === 'template_substitution' || c.type === 'interpolation' || c.type === 'simple_expansion' || c.type === 'expansion'));
      if (!atomicNode && cursor.gotoFirstChild()) continue;
    }
    if (cursor.gotoNextSibling()) {
      descend = true;
      continue;
    }
    if (!cursor.gotoParent()) break;
    descend = false;
  }
  cursor.delete();

  for (const s of symbols) {
    if (s.kind === 'function' && /^(main|Main)$/.test(s.name)) hints.push(`entry:main-function@${s.range.line + 1}`);
  }
  const outline = symbols
    .filter((s) => s.kind !== 'parameter' && (s.scope === 0 || s.kind === 'method'))
    .map((s) => ({ name: s.name, kind: s.kind, line: s.range.line, depth: s.kind === 'method' || (s.container && s.kind === 'property') ? 1 : 0 }))
    .sort((a, b) => a.line - b.line);

  return {
    summary: { path, languageId, mode: 'syntax-tree', lineCount: lines.lineCount, charCount: text.length, symbols, refs, imports, issues: issues.slice(0, 200), outline, hints, scopes },
    highlight: Int32Array.from(hl),
  };
}

function findParamNode(fn: SyntaxNode, name: string): SyntaxNode | null {
  const list = fn.childForFieldName('parameters') ?? fn.childForFieldName('parameter') ?? fn.namedChildren.find((c) => c && PARAM_LISTS.has(c.type)) ?? fn;
  const stack: SyntaxNode[] = [list];
  while (stack.length) {
    const n = stack.pop()!;
    if ((isIdentNode(n) || n.type === 'variable_name') && n.text === name) return n;
    if (n !== fn && (BLOCKS.has(n.type) || n.type === 'body_statement')) continue;
    if (n === fn) {
      for (const c of n.namedChildren) if (c && (c.type === 'parameter' || PARAM_LISTS.has(c.type))) stack.push(c);
      continue;
    }
    for (const c of n.namedChildren) if (c && !TYPES.has(c.type)) stack.push(c);
  }
  return null;
}

function refRole(n0: SyntaxNode): RefRole {
  const n = normIdent(n0);
  const p = n.parent;
  if (!p) return 'read';
  if ((FUNC_DEFS.has(p.type) || CLASS_DEFS.has(p.type)) && defNameNode(p)?.id === n.id) return 'definition';
  if (p.type === 'function_declarator' && p.parent && FUNC_DEFS.has(p.parent.type)) return 'definition';
  if (isInside(n, PARAM_LISTS, S('block statement_block compound_statement body'))) return 'parameter';
  if (p.type === 'parameter' || p.type === 'required_parameter' || p.type === 'optional_parameter' || p.type === 'formal_parameter' || p.type === 'simple_parameter' || p.type === 'typed_parameter' || p.type === 'default_parameter' || p.type === 'parameter_declaration') return 'parameter';
  if (isInside(n, IMPORT_NODES)) return 'import';
  if (CALLS.has(p.type) && (p.childForFieldName('function')?.id === n.id || p.childForFieldName('name')?.id === n.id || p.childForFieldName('macro')?.id === n.id || p.childForFieldName('method')?.id === n.id)) return 'call';
  // Kotlin/Swift: call_expression(simple_identifier, call_suffix) has no field names.
  if (p.type === 'call_expression' && !p.childForFieldName('function') && p.namedChild(0)?.id === n.id) return 'call';
  if (p.type === 'navigation_expression' && gpIsCall(p) && p.namedChild(p.namedChildCount - 1)?.text.endsWith(n.text)) return 'call';
  const gp = p.parent;
  if (gp && CALLS.has(gp.type) && gp.childForFieldName('function')?.id === p.id && p.namedChildren[p.namedChildCount - 1]?.id === n.id && p.namedChildCount > 1) return 'call';
  if (p.type === 'command_name') return 'call';
  if (DECLARATORS.has(p.type) && defNameNode(p)?.id === n.id) return 'assignment';
  if (ASSIGNS.has(p.type) && (p.childForFieldName('left')?.id === n.id || p.childForFieldName('name')?.id === n.id)) return 'assignment';
  if ((p.type === 'pattern_list' || p.type === 'expression_list' || p.type === 'tuple_pattern') && gp && (ASSIGNS.has(gp.type) || gp.type === 'short_var_declaration') && gp.childForFieldName('left')?.id === p.id) return 'assignment';
  if (TYPES.has(n.type) || n.type === 'type_identifier') return 'type';
  if (n.type === 'property_identifier' || n.type === 'field_identifier') return 'property';
  if ((p.type === 'attribute' || p.type === 'member_expression' || p.type === 'member_access_expression' || p.type === 'field_access' || p.type === 'navigation_suffix' || p.type === 'selector_expression' || p.type === 'scoped_identifier') && p.namedChild(0)?.id !== n.id) return 'property';
  return 'read';
}

function gpIsCall(p: SyntaxNode): boolean {
  const g = p.parent;
  return !!g && g.type === 'call_expression' && g.namedChild(0)?.id === p.id;
}

function stringValue(n: SyntaxNode | null): string {
  if (!n) return '';
  return n.text.replace(/^[a-zA-Z]*["'`<]|["'`>]$/g, '');
}

function collectImport(n: SyntaxNode, lang: string, R: (n: SyntaxNode) => Range, out: ImportInfo[]): void {
  const t = n.type;
  const push = (spec: string, kind: ImportInfo['kind'], node: SyntaxNode, names: string[] = []) => {
    if (spec) out.push({ spec, kind, range: R(node), names });
  };
  if (lang === 'javascript' || lang === 'typescript' || lang === 'tsx') {
    if (t === 'import_statement' || (t === 'export_statement' && n.childForFieldName('source'))) {
      const src = n.childForFieldName('source');
      const names = (n.namedChildren.find((c) => c?.type === 'import_clause')?.text ?? '').replace(/[{}*\s]/g, ' ').split(/\s+|,/).filter((w) => w && w !== 'as');
      push(stringValue(src), 'import', n, names);
    } else if (t === 'call_expression') {
      const f = n.childForFieldName('function');
      const arg = n.childForFieldName('arguments')?.namedChild(0);
      if (f && (f.text === 'require' || f.type === 'import') && arg && arg.type === 'string') push(stringValue(arg), 'require', n);
    }
  } else if (lang === 'python') {
    if (t === 'import_statement') for (const c of n.namedChildren) c && push((c.type === 'aliased_import' ? c.childForFieldName('name') : c)?.text ?? '', 'import', n);
    else if (t === 'import_from_statement') {
      const m = n.childForFieldName('module_name');
      const names = n.namedChildren.filter((c) => c && c.id !== m?.id).map((c) => c!.text);
      push(m?.text ?? '', 'import', n, names);
    }
  } else if (lang === 'c' || lang === 'cpp') {
    if (t === 'preproc_include') {
      const p = n.childForFieldName('path');
      if (p) push(stringValue(p), 'include', n), out.length && (out[out.length - 1].external = p.type === 'system_lib_string');
    }
  } else if (lang === 'go') {
    if (t === 'import_spec') push(stringValue(n.childForFieldName('path')), 'import', n);
  } else if (lang === 'rust') {
    if (t === 'mod_item' && !n.childForFieldName('body')) push(n.childForFieldName('name')?.text ?? '', 'mod', n);
    else if (t === 'use_declaration') push(n.childForFieldName('argument')?.text ?? '', 'use', n);
  } else if (lang === 'java' || lang === 'kotlin' || lang === 'swift') {
    if (t === 'import_declaration' || t === 'import_header') push(n.text.replace(/^import\s+(static\s+)?/, '').replace(/;$/, '').trim(), 'import', n);
  } else if (lang === 'csharp') {
    if (t === 'using_directive') push(n.text.replace(/^using\s+(static\s+)?/, '').replace(/;$/, '').trim(), 'use', n);
  } else if (lang === 'php') {
    if (/^(require|include)(_once)?_expression$/.test(t)) push(stringValue(n.namedChild(0)), 'require', n);
    else if (t === 'namespace_use_declaration') push(n.text.replace(/^use\s+/, '').replace(/;$/, ''), 'use', n);
  } else if (lang === 'ruby') {
    if (t === 'call') {
      const m = n.childForFieldName('method');
      const arg = n.childForFieldName('arguments')?.namedChild(0);
      if (m && (m.text === 'require' || m.text === 'require_relative' || m.text === 'load') && arg) push((m.text === 'require_relative' ? './' : '') + stringValue(arg), 'require', n);
    }
  } else if (lang === 'html') {
    if (t === 'start_tag' || t === 'self_closing_tag') {
      const tag = n.namedChild(0)?.text.toLowerCase();
      for (const a of n.namedChildren) {
        if (!a || a.type !== 'attribute') continue;
        const an = a.namedChild(0)?.text.toLowerCase();
        const av = a.namedChild(1);
        if (!av) continue;
        const v = av.text.replace(/^["']|["']$/g, '');
        if (tag === 'script' && an === 'src') push(v, 'script', a);
        else if (tag === 'link' && an === 'href') push(v, 'stylesheet', a);
        else if ((tag === 'img' || tag === 'source' || tag === 'iframe') && an === 'src') push(v, 'link', a);
        else if (tag === 'a' && an === 'href' && !/^(https?:|mailto:|#|javascript:)/i.test(v)) push(v, 'link', a);
      }
    }
  } else if (lang === 'css') {
    if (t === 'import_statement') push(stringValue(n.namedChild(0)).replace(/^url\(["']?|["']?\)$/g, ''), 'import', n);
  } else if (lang === 'bash') {
    if (t === 'command') {
      const name = n.childForFieldName('name')?.text;
      const arg = n.childForFieldName('argument');
      if ((name === 'source' || name === '.') && arg) push(stringValue(arg), 'source', n);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Element at a position

function smallestAt(tree: Tree, offset: number, text: string): SyntaxNode {
  let o = offset;
  // Clicking just after a token or on whitespace: prefer the token to the left.
  if (o > 0 && (o >= text.length || /\s/.test(text[o]))) o--;
  return tree.rootNode.descendantForIndex(o, o) ?? tree.rootNode;
}

const STATEMENT_STOP = new Set(['start_tag', 'self_closing_tag', 'end_tag', 'declaration']);

function statementOf(n: SyntaxNode): SyntaxNode {
  let root: SyntaxNode = n;
  while (root.parent) root = root.parent;
  // In data files (JSON, TOML) one key/value pair is the "line" people think about.
  const stopAtPair = root.type === 'document';
  let p: SyntaxNode = n;
  while (!STATEMENT_STOP.has(p.type) && !(stopAtPair && p.type === 'pair') && p.parent && !BLOCKS.has(p.parent.type) && p.parent.type !== 'program' && p.parent.type !== 'module' && p.parent.type !== 'source_file' && p.parent.type !== 'translation_unit' && p.parent.type !== 'compilation_unit' && p.parent.type !== 'chunk' && p.parent.type !== 'document' && p.parent.type !== 'stylesheet') {
    p = p.parent;
  }
  return p;
}

const CONSTRUCT_OF_PARENT: Record<string, string> = {
  arguments: 'call-arguments',
  argument_list: 'call-arguments',
  value_arguments: 'call-arguments',
  parameters: 'parameters',
  formal_parameters: 'parameters',
  parameter_list: 'parameters',
  function_value_parameters: 'parameters',
  array: 'list',
  list: 'list',
  array_expression: 'list',
  array_creation_expression: 'list',
  tuple: 'tuple',
  object: 'object',
  dictionary: 'object',
  set: 'list',
  subscript_expression: 'index',
  subscript: 'index',
  element_access_expression: 'index',
  index_expression: 'index',
  parenthesized_expression: 'grouping',
  template_substitution: 'template',
  type_arguments: 'type-arguments',
  type_parameters: 'type-arguments',
  block: 'block',
  statement_block: 'block',
  compound_statement: 'block',
  class_body: 'class-body',
  declaration_list: 'class-body',
  field_declaration_list: 'class-body',
  object_type: 'object',
  block_css: 'css-block',
};

function describeBracket(n: SyntaxNode, lines: LineIndex): BracketInfo {
  const ch = n.text;
  const R = (x: SyntaxNode) => lines.range(x.startIndex, x.endIndex);
  const parent = n.parent!;
  const kids = parent.children.filter(Boolean) as SyntaxNode[];
  const idx = kids.findIndex((k) => k.id === n.id);
  let partner: SyntaxNode | null = null;
  const isOpen = BRACKET_OPEN[ch] !== undefined;
  const want = isOpen ? BRACKET_OPEN[ch] : BRACKET_CLOSE[ch];
  let depth = 0;
  if (isOpen) {
    for (let i = idx + 1; i < kids.length; i++) {
      if (kids[i].text === ch && !kids[i].isNamed) depth++;
      else if (kids[i].text === want && !kids[i].isNamed) {
        if (depth === 0) {
          partner = kids[i];
          break;
        }
        depth--;
      }
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (kids[i].text === ch && !kids[i].isNamed) depth++;
      else if (kids[i].text === want && !kids[i].isNamed) {
        if (depth === 0) {
          partner = kids[i];
          break;
        }
        depth--;
      }
    }
  }
  if (partner?.isMissing) partner = null;
  let construct = CONSTRUCT_OF_PARENT[parent.type] ?? (ch === '{' || ch === '}' ? 'block' : ch === '(' || ch === ')' ? 'grouping' : ch === '[' || ch === ']' ? 'list' : 'type-arguments');
  const owner = parent.parent;
  let encloses = '';
  if (construct === 'call-arguments') {
    const f = owner?.childForFieldName('function') ?? owner?.childForFieldName('name') ?? owner?.childForFieldName('method');
    encloses = `the information given to "${short(f?.text ?? 'the function', 40)}" when it is called`;
  } else if (construct === 'parameters') {
    encloses = `the inputs that the function "${owner ? functionName(owner) : ''}" expects`;
  } else if (construct === 'block' || construct === 'class-body') {
    if (owner && (FUNC_DEFS.has(owner.type) || ANON_FUNCS.has(owner.type))) {
      construct = 'function-body';
      encloses = `the body of the function "${functionName(owner)}" — the steps it performs`;
    } else if (owner && CLASS_DEFS.has(owner.type)) {
      construct = 'class-body';
      encloses = `the contents of "${className(owner)}"`;
    } else if (owner && /if|else/.test(owner.type)) {
      construct = 'if-body';
      encloses = 'the steps that run only when the condition is true';
    } else if (owner && /for|while|loop|do/.test(owner.type)) {
      construct = 'loop-body';
      encloses = 'the steps that repeat in the loop';
    } else if (owner && /try|catch|except|finally/.test(owner.type)) {
      construct = 'try-body';
      encloses = 'steps protected against errors (or that handle an error)';
    } else if (owner && /switch|case|match|when/.test(owner.type)) {
      construct = 'switch-body';
      encloses = 'the different cases to choose from';
    } else if (owner?.type === 'rule_set') {
      construct = 'css-block';
      encloses = `the style rules for "${short(owner.namedChild(0)?.text ?? '', 30)}"`;
    } else encloses = 'a group of lines that belong together';
  } else if (construct === 'list') encloses = 'a list of values';
  else if (construct === 'object') encloses = 'a group of named values (an object)';
  else if (construct === 'index') encloses = 'which item to pick from a list or table';
  else if (construct === 'grouping') encloses = parent.type.includes('condition') || owner?.type.includes('if') ? 'the condition that is checked' : 'a part of a calculation that should be worked out first';
  else if (construct === 'template') encloses = 'a value inserted into text';
  else if (construct === 'type-arguments') encloses = 'type information (what kind of data is used)';
  else if (construct === 'tuple') encloses = 'a small fixed group of values';
  const open = isOpen ? n : partner;
  const close = isOpen ? partner : n;
  return { char: ch, partner: partner ? R(partner) : null, encloses, construct, openRange: open ? R(open) : R(n), closeRange: close ? R(close) : null };
}

function describeOperator(n: SyntaxNode): OperatorInfo {
  const p = n.parent;
  const sym = n.text;
  const info: OperatorInfo = { symbol: sym, category: operatorCategory(sym, p?.type ?? '') };
  const l = p?.childForFieldName('left') ?? p?.childForFieldName('object') ?? p?.childForFieldName('lhs') ?? p?.namedChild(0);
  const r = p?.childForFieldName('right') ?? p?.childForFieldName('property') ?? p?.childForFieldName('rhs') ?? p?.namedChild(p.namedChildCount - 1);
  if (l && l.endIndex <= n.startIndex) info.left = short(l.text, 50);
  if (r && r.startIndex >= n.endIndex) info.right = short(r.text, 50);
  return info;
}

export function functionInfo(fn: SyntaxNode, lines: LineIndex): FunctionInfo {
  const returns: string[] = [];
  const calls: string[] = [];
  const body = bodyOf(fn) ?? fn;
  const stack: SyntaxNode[] = [body];
  while (stack.length) {
    const n = stack.pop()!;
    if (n !== body && (FUNC_DEFS.has(n.type) || ANON_FUNCS.has(n.type))) continue;
    if (n.type === 'return_statement' || n.type === 'return' || n.type === 'return_expression' || (n.type === 'jump_expression' && n.text.startsWith('return')) || (n.type === 'control_transfer_statement' && n.text.startsWith('return'))) {
      const v = n.text.replace(/^return\b\s*/, '').replace(/;$/, '').trim();
      returns.push(v || '(nothing)');
    }
    if (CALLS.has(n.type)) {
      const f = n.childForFieldName('function') ?? n.childForFieldName('name') ?? n.childForFieldName('method') ?? n.childForFieldName('macro') ?? n.childForFieldName('constructor') ?? n.namedChild(0);
      if (f) {
        let nm = f.text;
        const last = f.childForFieldName('property') ?? f.childForFieldName('field') ?? f.childForFieldName('attribute') ?? f.childForFieldName('name');
        if (last && f.namedChildCount > 1) nm = last.text;
        nm = nm.replace(/^.*[.:>]/, '');
        if (nm && !calls.includes(nm) && nm.length < 60) calls.push(nm);
      }
    }
    for (const c of n.namedChildren) if (c) stack.push(c);
  }
  // Implicit return of the last expression (Rust, Ruby, arrow functions with expression body).
  if (!returns.length) {
    if (fn.type === 'arrow_function' && body.type !== 'statement_block') returns.push(short(body.text, 60));
    else if ((fn.type === 'function_item' || fn.type === 'closure_expression') && body.type === 'block') {
      const last = body.namedChild(body.namedChildCount - 1);
      if (last && !last.type.endsWith('statement') && !last.type.endsWith('declaration') && last.type !== 'let_declaration') returns.push(short(last.text, 60));
    } else if ((fn.type === 'method' || fn.type === 'singleton_method') && body) {
      const last = body.namedChild(body.namedChildCount - 1);
      if (last) returns.push(short(last.text, 60));
    }
  }
  const container = enclosingClass(fn);
  return {
    name: functionName(fn),
    params: paramsOf(fn),
    returnType: returnTypeOf(fn),
    returns: returns.slice(0, 8),
    calls: calls.slice(0, 30),
    range: lines.range(fn.startIndex, fn.endIndex),
    doc: docOf(fn, lines),
    lineCount: lines.lineOf(fn.endIndex) - lines.lineOf(fn.startIndex) + 1,
    isMethod: !!container && !enclosingFunction(fn),
    container: container ? className(container) : null,
  };
}

/** Step-by-step outline of a block of statements (used for flowcharts). */
export function buildFlow(block: SyntaxNode, lines: LineIndex, depth = 0): FlowStep[] {
  const steps: FlowStep[] = [];
  const children = (BLOCKS.has(block.type) || block.type === 'program' || block.type === 'module' ? block.namedChildren : [block]).filter(Boolean) as SyntaxNode[];
  for (const c of children) {
    if (COMMENTS.has(c.type)) continue;
    if (steps.length >= 40) break;
    const line = lines.lineOf(c.startIndex) + 1;
    const t = c.type;
    const textLine = short(c.text, 70);
    if (/^(if_statement|if_expression|if|unless|elif_clause|if_let_expression)$/.test(t)) {
      const cond = c.childForFieldName('condition');
      const cons = c.childForFieldName('consequence') ?? bodyOf(c);
      const alt = c.childForFieldName('alternative');
      const branches: { label: string; steps: FlowStep[] }[] = [];
      if (cons && depth < 3) branches.push({ label: 'if yes', steps: buildFlow(cons, lines, depth + 1) });
      if (alt && depth < 3) {
        const altBody = alt.type === 'else_clause' || alt.type === 'else' ? bodyOf(alt) ?? alt.namedChild(0) ?? alt : alt;
        branches.push({ label: 'otherwise', steps: altBody ? buildFlow(altBody, lines, depth + 1) : [] });
      }
      steps.push({ kind: 'if', text: `Check: ${short(cond?.text ?? textLine, 60)}`, line, branches });
    } else if (/(for|while|loop|foreach|do)_?(statement|expression|in_statement|loop)?$/.test(t) && /for|while|loop|do/.test(t)) {
      const b = bodyOf(c);
      steps.push({ kind: 'loop', text: `Repeat: ${textLine.replace(/[{:]\s*$/, '')}`, line, branches: b && depth < 3 ? [{ label: 'each time', steps: buildFlow(b, lines, depth + 1) }] : undefined });
    } else if (/return/.test(t) || (t === 'jump_expression' && c.text.startsWith('return')) || (t === 'control_transfer_statement' && c.text.startsWith('return'))) {
      steps.push({ kind: 'return', text: `Give back: ${short(c.text.replace(/^return\b\s*/, ''), 60) || '(nothing)'}`, line });
    } else if (/try/.test(t)) {
      steps.push({ kind: 'try', text: 'Try the following, and handle errors if they happen', line, branches: bodyOf(c) && depth < 3 ? [{ label: 'try', steps: buildFlow(bodyOf(c)!, lines, depth + 1) }] : undefined });
    } else if (/switch|match|when|case_statement/.test(t)) {
      steps.push({ kind: 'switch', text: `Choose between cases: ${textLine}`, line });
    } else if (DECLARATORS.has(t) || ASSIGNS.has(t) || /declaration$|assignment/.test(t) || (t === 'expression_statement' && c.namedChild(0) && ASSIGNS.has(c.namedChild(0)!.type))) {
      steps.push({ kind: 'assign', text: `Store: ${textLine}`, line });
    } else if (t === 'expression_statement' && c.namedChild(0) && CALLS.has(c.namedChild(0)!.type)) {
      steps.push({ kind: 'call', text: `Run: ${textLine}`, line });
    } else if (FUNC_DEFS.has(t)) {
      steps.push({ kind: 'other', text: `Define function ${functionName(c)}`, line });
    } else if (CLASS_DEFS.has(t)) {
      steps.push({ kind: 'other', text: `Define ${className(c)}`, line });
    } else if (IMPORT_NODES.has(t)) {
      steps.push({ kind: 'other', text: `Bring in: ${textLine}`, line });
    } else if (CALLS.has(t)) {
      steps.push({ kind: 'call', text: `Run: ${textLine}`, line });
    } else {
      steps.push({ kind: 'action', text: textLine, line });
    }
  }
  return steps;
}

const LITERAL_TYPES: [RegExp, string][] = [
  [/string|template|char|heredoc|encapsed|attribute_value/, 'text (a string)'],
  [/float|real|decimal/, 'a decimal number'],
  [/int|number|integer|hex|octal|binary/, 'a whole number'],
];

export function elementAt(tree: Tree, text: string, offset: number, languageId: string, summary: FileSummary): ElementInfo {
  const lines = new LineIndex(text);
  const R = (x: SyntaxNode) => lines.range(x.startIndex, x.endIndex);
  let n = smallestAt(tree, offset, text);
  const facts: Fact[] = [];
  const context: string[] = [];
  // Strings and comments are selected as a whole.
  let p: SyntaxNode | null = n;
  for (let k = 0; p && k < 4; k++, p = p.parent) {
    if (COMMENTS.has(p.type)) {
      n = p;
      break;
    }
    if ((STRINGS.has(p.type) && p.type !== 'string_fragment' && p.type !== 'attribute_value') || p.type === 'quoted_attribute_value') {
      if (!isInside(n, S('template_substitution interpolation simple_expansion expansion'), STRINGS)) n = p;
      break;
    }
  }
  if ((n.type === 'name' || n.text === '$') && n.parent?.type === 'variable_name') n = n.parent;
  if (n.type === 'word' && n.parent?.type === 'command_name') n = n.parent;
  const stmt = statementOf(n);
  const fnNode = enclosingFunction(n);
  const clsNode = enclosingClass(n);
  const info: ElementInfo = {
    kind: 'unknown',
    text: n.text,
    range: R(n),
    languageId,
    mode: 'syntax-tree',
    concept: 'unknown',
    nodeType: n.type,
    context,
    statement: short(stmt.text, 160),
    statementRange: R(stmt),
    enclosingFunction: fnNode ? functionName(fnNode) : null,
    enclosingClass: clsNode ? className(clsNode) : null,
    facts,
    issues: summary.issues.filter((i) => i.range.line >= R(stmt).line - 1 && i.range.line <= R(stmt).endLine + 1).slice(0, 5),
  };
  if (fnNode) context.push(`inside the function "${functionName(fnNode)}"`);
  if (clsNode) context.push(`inside "${className(clsNode)}"`);
  // Where we are in markup, style sheets and settings files.
  for (let a: SyntaxNode | null = n.parent, k = 0; a && k < 12 && context.length < 4; a = a.parent, k++) {
    if (a.type === 'element' || a.type === 'script_element' || a.type === 'style_element') {
      const tag = a.namedChild(0)?.namedChildren.find((c) => c?.type === 'tag_name')?.text;
      if (tag) context.push(`inside the <${tag}> element`);
    } else if (a.type === 'rule_set') {
      const sel = a.namedChildren.find((c) => c?.type === 'selectors')?.text;
      if (sel) context.push(`inside the style rule for "${short(sel, 60)}"`);
    } else if (a.type === 'table' || a.type === 'table_array_element') {
      const head = a.namedChildren.find((c) => c && /key/.test(c.type))?.text;
      if (head) context.push(`in the settings section [${head}]`);
    } else if (a.type === 'pair' && a.parent?.type === 'object' && a !== n.parent) {
      const key = a.childForFieldName('key')?.text;
      if (key) context.push(`inside the setting ${key}`);
    }
  }
  const t = n.type;

  if (COMMENTS.has(t)) {
    Object.assign(info, { kind: 'comment' as ElementKind, concept: 'comment' });
    facts.push({ text: 'This is a comment: the computer ignores it. It is a note written for people.', confidence: 'verified' });
    return info;
  }
  if (STRINGS.has(t) || t === 'quoted_attribute_value') {
    if (languageId === 'json' && n.parent?.type === 'pair' && n.parent.childForFieldName('key')?.id === n.id) {
      Object.assign(info, { kind: 'json-key' as ElementKind, concept: 'json-key', symbolName: stringValue(n) });
      facts.push({ text: `"${stringValue(n)}" is the name of a setting/value in this data file.`, confidence: 'verified' });
      return info;
    }
    const isDoc = n.parent?.type === 'expression_statement' && n.parent.parent && BLOCKS.has(n.parent.parent.type) && n.parent.parent.namedChild(0)?.id === n.parent.id;
    Object.assign(info, { kind: 'string' as ElementKind, concept: isDoc ? 'docstring' : t === 'template_string' ? 'template-string' : 'string', literal: { value: short(stringValue(n), 120), type: 'text (a string)' } });
    facts.push({ text: `This is a piece of text: ${short(n.text, 60)}.`, confidence: 'verified' });
    return info;
  }
  const leafClass = classifyLeaf(n);
  if (leafClass === 'number' && n.childCount === 0) {
    const ty = LITERAL_TYPES.find(([re]) => re.test(t))?.[1] ?? (/\./.test(n.text) ? 'a decimal number' : 'a whole number');
    Object.assign(info, { kind: 'number' as ElementKind, concept: 'number', literal: { value: n.text, type: ty } });
    facts.push({ text: `This is a fixed number written directly in the code: ${n.text}.`, confidence: 'verified' });
    return info;
  }
  if (leafClass === 'constant' && (/^(true|false|True|False|TRUE|FALSE|YES|NO)$/.test(n.text) || t === 'true' || t === 'false')) {
    Object.assign(info, { kind: 'boolean' as ElementKind, concept: 'boolean', literal: { value: n.text, type: 'yes/no value (boolean)' } });
    return info;
  }
  if (/^(null|nil|None|undefined|NULL|nullptr)$/.test(n.text) && (n.childCount === 0)) {
    Object.assign(info, { kind: 'null' as ElementKind, concept: 'null', literal: { value: n.text, type: 'nothing / empty' } });
    return info;
  }
  if (!n.isNamed) {
    const tx = n.text;
    if ((BRACKET_OPEN[tx] !== undefined || BRACKET_CLOSE[tx] !== undefined) && leafClass === 'bracket') {
      const b = describeBracket(n, lines);
      Object.assign(info, { kind: 'bracket' as ElementKind, concept: `bracket-${b.construct}`, bracket: b });
      facts.push(
        b.partner
          ? { text: `Its partner is on line ${b.partner.line + 1}. Together they mark ${b.encloses}.`, confidence: 'verified' }
          : { text: 'No matching partner bracket was found. The code is probably incomplete or broken here.', confidence: 'verified' },
      );
      return info;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tx)) {
      const concept = keywordConcept(languageId, tx, n.parent?.type ?? '');
      Object.assign(info, { kind: 'keyword' as ElementKind, concept, keywordMeaning: keywordMeaning(languageId, tx) });
      const owner = n.parent;
      if (owner && (FUNC_DEFS.has(owner.type) || ANON_FUNCS.has(owner.type))) {
        info.func = functionInfo(owner, lines);
        info.flow = bodyOf(owner) ? buildFlow(bodyOf(owner)!, lines) : undefined;
        context.unshift(`starts the function "${functionName(owner)}"`);
      } else if (owner && CLASS_DEFS.has(owner.type)) context.unshift(`starts "${className(owner)}"`);
      else if (owner && /if|while|for|loop/.test(owner.type)) {
        const b = bodyOf(owner) ?? owner.childForFieldName('consequence');
        if (b) info.flow = buildFlow(owner, lines);
      }
      return info;
    }
    if (tx === ',' || tx === ';' || tx === ':' || (tx === '.' && leafClass === 'punctuation')) {
      Object.assign(info, { kind: 'punctuation' as ElementKind, concept: tx === ',' ? 'punct-comma' : tx === ';' ? 'punct-semicolon' : tx === ':' ? 'punct-colon' : 'punct-dot' });
      return info;
    }
    const op = describeOperator(n);
    Object.assign(info, { kind: 'operator' as ElementKind, concept: `operator-${op.category}`, operator: op });
    if (op.left || op.right) facts.push({ text: `Left side: ${op.left ?? '—'}; right side: ${op.right ?? '—'}.`, confidence: 'verified' });
    return info;
  }
  // Markup / style / data specific.
  if (t === 'tag_name') {
    Object.assign(info, { kind: 'tag' as ElementKind, concept: 'html-tag', symbolName: n.text.toLowerCase() });
    return info;
  }
  if (t === 'attribute_name') {
    Object.assign(info, { kind: 'attribute' as ElementKind, concept: 'html-attribute', symbolName: n.text.toLowerCase() });
    return info;
  }
  if (t === 'text' || t === 'raw_text') {
    Object.assign(info, { kind: 'text' as ElementKind, concept: n.parent?.type === 'script_element' ? 'embedded-script' : n.parent?.type === 'style_element' ? 'embedded-style' : 'html-text' });
    return info;
  }
  if (languageId === 'css') {
    if (t === 'property_name') Object.assign(info, { kind: 'css-property' as ElementKind, concept: 'css-property', symbolName: n.text });
    else if (isInside(n, S('selectors')) || t === 'class_name' || t === 'id_name' || t === 'tag_name') Object.assign(info, { kind: 'css-selector' as ElementKind, concept: 'css-selector', symbolName: n.text });
    else Object.assign(info, { kind: 'css-value' as ElementKind, concept: 'css-value', literal: { value: n.text, type: 'style value' } });
    return info;
  }
  if (languageId === 'toml' && t === 'bare_key') {
    const isSection = n.parent?.type === 'table' || n.parent?.type === 'table_array_element';
    Object.assign(info, { kind: (isSection ? 'section' : 'setting-key') as ElementKind, concept: isSection ? 'config-section' : 'config-key', symbolName: n.text });
    return info;
  }
  // Identifiers.
  if (IDENTS.has(t) || t === 'variable_name' || TYPES.has(t) || t === 'self' || t === 'this') {
    const name = n.text;
    info.symbolName = name;
    const role = refRole(n);
    const p2 = n.parent!;
    let kind: ElementKind = 'variable';
    if (t === 'self' || t === 'this' || name === 'self' || name === 'this') {
      kind = 'keyword';
      info.concept = 'self-reference';
      info.keywordMeaning = keywordMeaning(languageId, name);
    } else if (role === 'definition' && (FUNC_DEFS.has(p2.type) || p2.type === 'function_declarator')) {
      kind = 'function-definition';
      const fnn = FUNC_DEFS.has(p2.type) ? p2 : p2.parent!;
      info.func = functionInfo(fnn, lines);
      const b = bodyOf(fnn);
      if (b) info.flow = buildFlow(b, lines);
    } else if (role === 'definition' && CLASS_DEFS.has(p2.type)) {
      kind = 'class-definition';
    } else if (role === 'call') {
      kind = 'function-call';
    } else if (role === 'parameter') kind = 'parameter';
    else if (role === 'import') kind = 'import';
    else if (role === 'type' || TYPES.has(t)) kind = 'type';
    else if (role === 'property') kind = 'property';
    // A variable holding an arrow function is a function definition too.
    if (kind === 'variable' && role === 'assignment' && p2.type === 'variable_declarator') {
      const v = p2.childForFieldName('value');
      if (v && ANON_FUNCS.has(v.type)) {
        kind = 'function-definition';
        info.func = functionInfo(v, lines);
        const b = bodyOf(v);
        if (b) info.flow = buildFlow(b, lines);
      }
    }
    info.kind = kind;
    info.concept =
      kind === 'function-definition'
        ? info.func?.isMethod
          ? 'method'
          : 'function'
        : kind === 'function-call'
          ? 'function-call'
          : kind === 'class-definition'
            ? 'class'
            : kind === 'parameter'
              ? 'parameter'
              : kind === 'import'
                ? 'import'
                : kind === 'type'
                  ? 'type'
                  : kind === 'property'
                    ? 'property'
                    : kind === 'keyword'
                      ? info.concept
                      : /^[A-Z][A-Z0-9_]+$/.test(name)
                        ? 'constant'
                        : 'variable';
    // Link to definitions and uses within the file (scope-aware).
    const scopeChain = scopesContaining(summary, n.startIndex);
    const defsSameName = summary.symbols.filter((s) => s.name === name);
    let defs = defsSameName.filter((s) => scopeChain.includes(s.scope));
    defs.sort((a, b) => scopeChain.indexOf(a.scope) - scopeChain.indexOf(b.scope));
    if (defs.length) {
      const nearest = defs[0].scope;
      defs = defs.filter((d) => d.scope === nearest);
    }
    if (kind === 'property' || kind === 'function-call') {
      // Methods/properties are found by name anywhere in the file (likely, not certain).
      const more = defsSameName.filter((d) => !defs.includes(d) && (d.kind === 'method' || d.kind === 'function' || d.kind === 'property'));
      defs = [...defs, ...more];
    }
    info.definitions = defs;
    const defScope = defs[0]?.scope;
    info.references = summary.refs.filter((r) => {
      if (r.name !== name) return false;
      if (defScope === undefined || kind === 'property' || kind === 'function-call') return true;
      const chain = scopesContaining(summary, r.range.start);
      // The use belongs to this definition if no closer scope defines the same name.
      const closest = chain.find((sc) => defsSameName.some((d) => d.scope === sc));
      return closest === defScope;
    });
    if (info.definitions[0]) info.symbolKind = info.definitions[0].kind;
    const linked = defScope !== undefined && defScope !== 0 ? 'verified' : 'likely';
    if (defs.length) facts.push({ text: `Created on line ${defs[0].range.line + 1}${defs.length > 1 ? ` (and ${defs.length - 1} other place${defs.length > 2 ? 's' : ''})` : ''}.`, confidence: linked });
    else if (kind !== 'keyword' && kind !== 'type') facts.push({ text: `"${name}" is not created in this file. It may come from another file, a library, or the language itself.`, confidence: 'likely' });
    const uses = info.references.filter((r) => r.role !== 'definition' && r.role !== 'parameter' && r.range.start !== n.startIndex);
    facts.push({ text: `Used ${uses.length} other time${uses.length === 1 ? '' : 's'} in this file.`, confidence: linked });
    if (role === 'assignment') facts.push({ text: 'Here it receives (stores) a value.', confidence: 'verified' });
    if (role === 'read') facts.push({ text: 'Here its current value is read.', confidence: 'verified' });
    if (kind === 'function-call') {
      const callNode = CALLS.has(p2.type) ? p2 : p2.parent;
      const args = callNode?.childForFieldName('arguments');
      if (args) facts.push({ text: `It is given: ${short(args.text, 80)}`, confidence: 'verified' });
    }
    return info;
  }
  info.kind = 'unknown';
  info.concept = 'unknown';
  facts.push({ text: `The syntax tree calls this a "${t.replace(/_/g, ' ')}". There is no specific explanation for it yet.`, confidence: 'verified' });
  return info;
}

/** Scope chain (innermost first, ending with file scope 0) for an offset. */
export function scopesContaining(summary: FileSummary, offset: number): number[] {
  return summary.scopes
    .filter(([s, e]) => s <= offset && offset < e)
    .map(([s]) => s)
    .sort((a, b) => b - a)
    .concat(0);
}

export { BLOCKS, COMMENTS, STRINGS };

// A safe, step-by-step interpreter for a beginner-friendly subset of C# — the language of Unity.
//
// It never touches the computer: it only walks the syntax tree that Tree-sitter builds and keeps
// its own variables. Infinite loops are stopped by a step budget, deep recursion by a depth limit.
// Every executed statement can be recorded (line, call stack, variables, screen output) so the
// learner can watch THEIR OWN program run, exactly like the lesson animations.
//
// Supported: top-level statements, local functions, classes/structs (fields, auto-properties,
// constructors, methods, static members, inheritance of fields/methods), int/float/double/bool/
// string/char, arrays, List<T>, Dictionary<K,V>, Vector2/Vector3, if/else, switch, for, foreach,
// while, do-while, break/continue/return, ++/--, compound assignment, ?:, ??, string
// interpolation, lambdas with List/LINQ helpers, Console/Debug/Math/Mathf/Random, int.Parse,
// Console.ReadLine (input is requested from the user). Unity objects are provided by a host.

import type { Node as SyntaxNode, Tree } from 'web-tree-sitter';
import { tr } from '../i18n';

// ---------------------------------------------------------------------------------------------
// Values

export interface ArrV {
  k: 'arr';
  items: V[];
  elem: string;
}
export interface ListV {
  k: 'list';
  items: V[];
  elem: string;
}
export interface DictV {
  k: 'dict';
  map: Map<unknown, { key: V; value: V }>;
}
export interface ObjV {
  k: 'obj';
  cls: ClassInfo;
  fields: Map<string, Cell>;
  id: number;
  /** Data owned by a host (for example the Unity game object this script is attached to). */
  host?: unknown;
}
export interface VecV {
  k: 'vec';
  x: number;
  y: number;
  z: number;
  dim: 2 | 3;
}
export interface EnumV {
  k: 'enum';
  type: string;
  name: string;
}
export interface FnV {
  k: 'fn';
  name: string;
  params: string[];
  body: SyntaxNode;
  scope: Scope;
  self?: ObjV;
}
export interface HostV {
  k: 'host';
  kind: string;
  ref: unknown;
}
export interface TypeRefV {
  k: 'type';
  name: string;
}
export type V = number | string | boolean | null | undefined | ArrV | ListV | DictV | ObjV | VecV | EnumV | FnV | HostV | TypeRefV;

export interface Cell {
  v: V;
  type: string;
}

export class Scope {
  vars = new Map<string, Cell>();
  constructor(
    public parent: Scope | null,
    /** True for the outermost scope of a function call (the variables shown in "where are we"). */
    public boundary = false,
  ) {}
  lookup(name: string): Cell | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const c = s.vars.get(name);
      if (c) return c;
    }
    return undefined;
  }
}

export interface ClassInfo {
  name: string;
  node: SyntaxNode;
  base: string | null;
  fields: { name: string; type: string; init: SyntaxNode | null; isStatic: boolean; getter?: SyntaxNode }[];
  methods: Map<string, SyntaxNode[]>;
  ctors: SyntaxNode[];
  statics: Map<string, Cell>;
  isStruct: boolean;
}

// ---------------------------------------------------------------------------------------------
// Errors

export class CsError extends Error {
  constructor(
    message: string,
    public line: number,
    public kind: 'compile' | 'runtime' | 'limit' | 'unsupported' = 'runtime',
    public exception?: string,
  ) {
    super(message);
  }
}

class BreakSig {}
class ContinueSig {}
class ReturnSig {
  constructor(public value: V) {}
}
class ThrowSig {
  constructor(public exception: string, public message: string) {}
}

// ---------------------------------------------------------------------------------------------
// Trace

export interface Shown {
  text: string;
  /** Items of a list/array or fields of an object. */
  parts?: { label: string; text: string }[];
}

export interface TraceFrame {
  fn: string;
  vars: { name: string; value: Shown }[];
}

export interface TraceStep {
  line: number;
  kind: 'line' | 'call' | 'return' | 'check' | 'loop' | 'output' | 'input' | 'error';
  say: string;
  frames: TraceFrame[];
  output: number;
}

export type Ev = { t: 'step'; node: SyntaxNode; kind: TraceStep['kind']; say: string } | { t: 'input'; prompt: string };

type Gen<T> = Generator<Ev, T, string | undefined>;

// ---------------------------------------------------------------------------------------------
// Host interface (Unity-like environments)

export interface Host {
  /** A name not found in the program (e.g. transform, Time, Input). */
  global?(name: string, self: ObjV | null): V | typeof NOT_FOUND;
  /** A free function call not found in the program (e.g. Destroy, Instantiate). */
  call?(name: string, args: V[], self: ObjV | null, line: number): V | typeof NOT_FOUND;
  /** Member access on a host value. */
  get?(target: HostV, name: string, line: number): V | typeof NOT_FOUND;
  set?(target: HostV, name: string, value: V, line: number): boolean;
  method?(target: HostV, name: string, args: V[], line: number): V | typeof NOT_FOUND;
  log?(text: string): void;
}

export const NOT_FOUND = Symbol('not-found');

// ---------------------------------------------------------------------------------------------
// Small helpers

const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'uint', 'ulong', 'ushort', 'sbyte']);
const FLOAT_TYPES = new Set(['float', 'double', 'decimal']);
let objCounter = 1;

function findFirst(n: SyntaxNode, type: string): SyntaxNode | null {
  if (n.type === type) return n;
  for (const c of named(n)) {
    const f = findFirst(c, type);
    if (f) return f;
  }
  return null;
}

function named(n: SyntaxNode): SyntaxNode[] {
  return n.namedChildren.filter((c): c is SyntaxNode => !!c);
}

function lineOf(n: SyntaxNode): number {
  return n.startPosition.row;
}

function opOf(n: SyntaxNode): string {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (c && !c.isNamed && !/^[()[\]{};,]$/.test(c.type)) return c.type;
  }
  return '';
}

function typeName(n: SyntaxNode | null): string {
  if (!n) return 'var';
  if (n.type === 'implicit_type') return 'var';
  if (n.type === 'nullable_type') return typeName(named(n)[0] ?? null);
  if (n.type === 'array_type') return `${typeName(n.childForFieldName('type'))}[]`;
  if (n.type === 'generic_name') return n.text.replace(/\s+/g, '');
  return n.text;
}

function unescape(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\' } as Record<string, string>)[e] ?? e;
  });
}

function stringValue(n: SyntaxNode): string {
  const t = n.text;
  if (t.startsWith('@"')) return t.slice(2, -1).replace(/""/g, '"');
  if (t.startsWith('"""')) return t.replace(/^"""\n?|\n?"""$/g, '');
  return unescape(t.slice(1, -1));
}

/** How C# prints a float (single precision): the shortest text that reads back as the same float. */
function floatText(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '-∞' : 'NaN';
  if (Number.isInteger(x)) return String(x);
  for (let p = 1; p <= 9; p++) {
    const s = x.toPrecision(p);
    if (Math.fround(parseFloat(s)) === x) return String(parseFloat(s));
  }
  return String(x);
}

function isNum(v: V): v is number {
  return typeof v === 'number';
}

function vec(x: number, y: number, z = 0, dim: 2 | 3 = 3): VecV {
  return { k: 'vec', x, y, z, dim };
}

/** Set by the running program so objects with their own ToString() print as C# would. */
let objectText: ((o: ObjV) => string | null) | null = null;

/** C#-style text of a value (what Console.WriteLine prints). */
export function csText(v: V, type = ''): string {
  if (v && typeof v === 'object' && v.k === 'obj' && objectText) {
    const t = objectText(v);
    if (t !== null) return t;
  }
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return type === 'float' ? floatText(v) : Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return v;
  switch (v.k) {
    case 'vec':
      return v.dim === 2 ? `(${fmtF(v.x)}, ${fmtF(v.y)})` : `(${fmtF(v.x)}, ${fmtF(v.y)}, ${fmtF(v.z)})`;
    case 'enum':
      return v.name;
    case 'arr':
      return `System.${v.elem.replace(/^int$/, 'Int32').replace(/^string$/, 'String')}[]`;
    case 'list':
      return `System.Collections.Generic.List\`1[${v.elem}]`;
    case 'dict':
      return 'System.Collections.Generic.Dictionary`2';
    case 'obj':
      return v.cls.name;
    case 'fn':
      return 'System.Func';
    case 'type':
      return v.name;
    default:
      return ({ rigidbody: 'Rigidbody2D', prefab: 'Bullet (Prefab)', transform: 'Transform', Time: 'Time', Input: 'Input', quaternion: 'Quaternion' } as Record<string, string>)[v.kind] ?? (v.kind === 'gameObject' || v.kind === 'collider' ? String((v.ref as { name?: string })?.name ?? v.kind) : v.kind);
  }
}

function fmtF(x: number): string {
  return x.toFixed(2);
}

/** Text for the "boxes" in the step-by-step view. */
export function shown(v: V, type = '', depth = 0): Shown {
  if (v === null || v === undefined) return { text: 'null' };
  if (typeof v === 'string') return { text: type === 'char' ? `'${v}'` : `"${v.length > 40 ? `${v.slice(0, 39)}…` : v}"` };
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false' };
  if (typeof v === 'number') return { text: type === 'float' ? floatText(v) : String(Number.isInteger(v) ? v : +v.toPrecision(10)) };
  switch (v.k) {
    case 'arr':
    case 'list':
      return {
        text: `${v.k === 'list' ? 'List' : v.elem + '[]'} (${v.items.length})`,
        parts: depth > 0 ? undefined : v.items.slice(0, 12).map((x, i) => ({ label: `[${i}]`, text: shown(x, v.elem, 1).text })),
      };
    case 'dict':
      return { text: `Dictionary (${v.map.size})`, parts: depth > 0 ? undefined : [...v.map.values()].slice(0, 10).map((e) => ({ label: csText(e.key), text: shown(e.value, '', 1).text })) };
    case 'obj':
      return {
        text: v.cls.name,
        parts: depth > 0 ? undefined : [...v.fields.entries()].slice(0, 10).map(([k, c]) => ({ label: k, text: shown(c.v, c.type, 1).text })),
      };
    case 'vec':
      return { text: csText(v) };
    case 'enum':
      return { text: `${v.type}.${v.name}` };
    case 'fn':
      return { text: tr('function', 'функция') };
    case 'type':
      return { text: v.name };
    default:
      return { text: v.kind };
  }
}

// ---------------------------------------------------------------------------------------------
// The interpreter

export interface RunLimits {
  maxSteps: number;
  maxDepth: number;
  maxTrace: number;
  maxOutput: number;
}

const DEFAULT_LIMITS: RunLimits = { maxSteps: 200_000, maxDepth: 120, maxTrace: 3000, maxOutput: 2000 };

interface CallFrame {
  fn: string;
  scope: Scope;
  self: ObjV | null;
  cls: ClassInfo | null;
}

export class CsProgram {
  classes = new Map<string, ClassInfo>();
  globalScope = new Scope(null, true);
  topLevel: SyntaxNode[] = [];
  mainMethod: { cls: ClassInfo; node: SyntaxNode } | null = null;
  output: string[] = [];
  stack: CallFrame[] = [];
  rngState = 12345;
  host: Host = {};

  constructor(
    public tree: Tree,
    public source: string,
    public limits: RunLimits = DEFAULT_LIMITS,
  ) {
    this.collect();
  }

  /** Makes csText() use this program's ToString() overrides. Called before running. */
  activate(): void {
    objectText = (o) => {
      const m = this.findMethod(o.cls, 'ToString');
      if (!m) return null;
      const g = this.invokeMethod(m[0], o.cls, o, [], lineOf(m[0]));
      for (;;) {
        const r = g.next();
        if (r.done) return csText(r.value);
      }
    };
  }

  // -------------------------------------------------------------------------- declarations

  private collect(): void {
    const root = this.tree.rootNode;
    const visitClass = (n: SyntaxNode) => {
      const name = n.childForFieldName('name')?.text ?? '?';
      const body = n.childForFieldName('body');
      const baseList = named(n).find((c) => c.type === 'base_list');
      const info: ClassInfo = { name, node: n, base: baseList ? (named(baseList)[0]?.text ?? null) : null, fields: [], methods: new Map(), ctors: [], statics: new Map(), isStruct: n.type === 'struct_declaration' };
      for (const m of body ? named(body) : []) {
        const mods = named(m)
          .filter((c) => c.type === 'modifier')
          .map((c) => c.text);
        const isStatic = mods.includes('static') || mods.includes('const');
        if (m.type === 'field_declaration') {
          const decl = named(m).find((c) => c.type === 'variable_declaration');
          if (!decl) continue;
          const type = typeName(decl.childForFieldName('type'));
          for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) {
            const nm = named(d)[0]?.text ?? '?';
            const init = named(d).find((c) => c.type === 'equals_value_clause');
            info.fields.push({ name: nm, type, init: init ? (named(init)[0] ?? null) : null, isStatic });
          }
        } else if (m.type === 'property_declaration') {
          const nm = m.childForFieldName('name')?.text ?? '?';
          const type = typeName(m.childForFieldName('type'));
          const arrow = named(m).find((c) => c.type === 'arrow_expression_clause');
          const init = m.childForFieldName('value') ?? named(m).find((c) => c.type === 'equals_value_clause');
          info.fields.push({ name: nm, type, init: init ? (init.type === 'equals_value_clause' ? (named(init)[0] ?? null) : init) : null, isStatic, getter: arrow ? named(arrow)[0] : undefined });
        } else if (m.type === 'method_declaration') {
          const nm = m.childForFieldName('name')?.text ?? '?';
          info.methods.set(nm, [...(info.methods.get(nm) ?? []), m]);
          if (nm === 'Main' && isStatic) this.mainMethod = { cls: info, node: m };
        } else if (m.type === 'constructor_declaration') info.ctors.push(m);
        else if (m.type === 'class_declaration' || m.type === 'struct_declaration') visitClass(m);
        else if (m.type === 'enum_declaration') this.collectEnum(m);
      }
      this.classes.set(name, info);
    };
    const walk = (n: SyntaxNode) => {
      for (const c of named(n)) {
        if (c.type === 'class_declaration' || c.type === 'struct_declaration' || c.type === 'record_declaration') visitClass(c);
        else if (c.type === 'enum_declaration') this.collectEnum(c);
        else if (c.type === 'namespace_declaration' || c.type === 'file_scoped_namespace_declaration' || c.type === 'declaration_list') walk(c);
        else if (c.type === 'global_statement') this.topLevel.push(named(c)[0]!);
      }
    };
    walk(root);
  }

  enums = new Map<string, string[]>();

  private collectEnum(n: SyntaxNode): void {
    const name = n.childForFieldName('name')?.text ?? '?';
    const body = n.childForFieldName('body');
    this.enums.set(
      name,
      (body ? named(body) : []).filter((c) => c.type === 'enum_member_declaration').map((c) => c.childForFieldName('name')?.text ?? named(c)[0]?.text ?? '?'),
    );
  }

  /** Static field values are prepared once, before running. */
  *initStatics(): Gen<void> {
    for (const cls of this.classes.values())
      for (const f of cls.fields)
        if (f.isStatic) cls.statics.set(f.name, { v: f.init ? yield* this.eval(f.init, new Scope(null), null, cls) : defaultOf(f.type), type: f.type });
  }

  // -------------------------------------------------------------------------- running

  /** Runs the whole program (top-level statements or static Main). */
  *main(): Gen<void> {
    yield* this.initStatics();
    // Local functions of the top level can be called before they appear.
    for (const s of this.topLevel) if (s.type === 'local_function_statement') this.declareLocalFunction(s, this.globalScope, null);
    if (this.topLevel.some((s) => s.type !== 'local_function_statement')) {
      this.stack.push({ fn: '', scope: this.globalScope, self: null, cls: null });
      try {
        for (const s of this.topLevel) if (s.type !== 'local_function_statement') yield* this.exec(s, this.globalScope);
      } catch (e) {
        if (!(e instanceof ReturnSig)) throw e;
      }
      this.stack.pop();
      return;
    }
    if (this.mainMethod) {
      yield* this.invokeMethod(this.mainMethod.node, this.mainMethod.cls, null, [], lineOf(this.mainMethod.node));
      return;
    }
    throw new CsError(
      tr(
        'There is nothing to run: no top-level statements and no static Main method. (A Unity script with Start/Update runs in the Mini-Unity playground.)',
        'Нечего запускать: нет команд верхнего уровня и нет метода static Main. (Скрипт Unity со Start/Update запускается в «Мини-Unity».)',
      ),
      0,
      'compile',
    );
  }

  private declareLocalFunction(n: SyntaxNode, scope: Scope, self: ObjV | null): void {
    const name = n.childForFieldName('name')?.text ?? '?';
    const params = this.paramNames(n);
    const body = n.childForFieldName('body') ?? named(n).find((c) => c.type === 'block' || c.type === 'arrow_expression_clause')!;
    scope.vars.set(name, { v: { k: 'fn', name, params, body, scope, self: self ?? undefined }, type: 'function' });
  }

  private paramNames(n: SyntaxNode): string[] {
    const pl = n.childForFieldName('parameters') ?? named(n).find((c) => c.type === 'parameter_list' || c.type === 'bracketed_parameter_list');
    if (!pl) return [];
    return named(pl)
      .filter((p) => p.type === 'parameter')
      .map((p) => p.childForFieldName('name')?.text ?? named(p).at(-1)?.text ?? '?');
  }

  private paramInfo(n: SyntaxNode): { name: string; type: string; def: SyntaxNode | null }[] {
    const pl = n.childForFieldName('parameters');
    if (!pl) return [];
    return named(pl)
      .filter((p) => p.type === 'parameter')
      .map((p) => {
        const eq = named(p).find((c) => c.type === 'equals_value_clause');
        return { name: p.childForFieldName('name')?.text ?? '?', type: typeName(p.childForFieldName('type')), def: eq ? (named(eq)[0] ?? null) : null };
      });
  }

  private step(node: SyntaxNode, kind: TraceStep['kind'], say: string): Ev {
    return { t: 'step', node, kind, say };
  }

  // -------------------------------------------------------------------------- statements

  *exec(n: SyntaxNode, scope: Scope): Gen<void> {
    const frame = this.stack[this.stack.length - 1];
    const self = frame?.self ?? null;
    const cls = frame?.cls ?? null;
    switch (n.type) {
      case 'block': {
        const inner = new Scope(scope);
        for (const c of named(n)) if (c.type === 'local_function_statement') this.declareLocalFunction(c, inner, self);
        for (const c of named(n)) if (c.type !== 'local_function_statement') yield* this.exec(c, inner);
        return;
      }
      case 'local_declaration_statement': {
        const decl = named(n).find((c) => c.type === 'variable_declaration')!;
        const isConst = named(n).some((c) => c.type === 'modifier' && c.text === 'const');
        yield* this.declare(decl, scope, self, cls);
        const names = named(decl)
          .filter((c) => c.type === 'variable_declarator')
          .map((d) => named(d)[0]?.text ?? '?');
        const vals = names.map((nm) => `${nm} = ${shown(scope.lookup(nm)?.v, scope.lookup(nm)?.type).text}`).join(', ');
        yield this.step(n, 'line', isConst ? tr(`A constant is created: ${vals}.`, `Создаётся константа: ${vals}.`) : tr(`A new box is created: ${vals}.`, `Создаётся новая коробка: ${vals}.`));
        return;
      }
      case 'expression_statement': {
        const e = named(n)[0];
        if (!e) return;
        const before = this.output.length;
        yield* this.eval(e, scope, self, cls);
        yield this.step(n, this.output.length > before ? 'output' : 'line', this.describeExpression(e, scope, before));
        return;
      }
      case 'if_statement': {
        const cond = n.childForFieldName('condition')!;
        const ok = truthy(yield* this.eval(cond, scope, self, cls), lineOf(cond));
        yield this.step(cond, 'check', tr(`Check: ${short(cond.text)} → ${ok ? 'YES, go inside' : 'NO'}${!ok && n.childForFieldName('alternative') ? ', go to else' : ''}.`, `Проверка: ${short(cond.text)} → ${ok ? 'ДА, заходим внутрь' : 'НЕТ'}${!ok && n.childForFieldName('alternative') ? ', идём в else' : ''}.`));
        const branch = ok ? n.childForFieldName('consequence') : n.childForFieldName('alternative');
        if (branch) yield* this.exec(branch, new Scope(scope));
        return;
      }
      case 'while_statement': {
        const [cond, body] = named(n);
        let rounds = 0;
        for (;;) {
          const ok = truthy(yield* this.eval(cond, scope, self, cls), lineOf(cond));
          yield this.step(cond, 'loop', tr(`Loop check: ${short(cond.text)} → ${ok ? 'YES, repeat' : 'NO, the loop ends'}.`, `Проверка цикла: ${short(cond.text)} → ${ok ? 'ДА, повторяем' : 'НЕТ, цикл заканчивается'}.`));
          if (!ok) break;
          if (++rounds > this.limits.maxSteps) throw this.limitError(n);
          try {
            yield* this.exec(body, new Scope(scope));
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
        }
        return;
      }
      case 'do_statement': {
        const body = n.childForFieldName('body') ?? named(n)[0];
        const cond = n.childForFieldName('condition') ?? named(n)[1];
        for (;;) {
          try {
            yield* this.exec(body, new Scope(scope));
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
          const ok = truthy(yield* this.eval(cond, scope, self, cls), lineOf(cond));
          yield this.step(cond, 'loop', tr(`Loop check: ${short(cond.text)} → ${ok ? 'YES, repeat' : 'NO, the loop ends'}.`, `Проверка цикла: ${short(cond.text)} → ${ok ? 'ДА, повторяем' : 'НЕТ, цикл заканчивается'}.`));
          if (!ok) break;
        }
        return;
      }
      case 'for_statement': {
        const loop = new Scope(scope);
        const init = n.childForFieldName('initializer');
        if (init) {
          if (init.type === 'variable_declaration') yield* this.declare(init, loop, self, cls);
          else yield* this.eval(init, loop, self, cls);
        }
        // Several initializers/updates appear as repeated fields; collect them by position.
        const updates: SyntaxNode[] = [];
        for (let i = 0; i < n.childCount; i++) if (n.fieldNameForChild(i) === 'update' && n.child(i)) updates.push(n.child(i)!);
        const cond = n.childForFieldName('condition');
        const body = n.childForFieldName('body')!;
        for (;;) {
          const ok = cond ? truthy(yield* this.eval(cond, loop, self, cls), lineOf(cond)) : true;
          yield this.step(cond ?? n, 'loop', cond ? tr(`Loop check: ${short(cond.text)} → ${ok ? 'YES, one more round' : 'NO, the loop ends'}.`, `Проверка цикла: ${short(cond.text)} → ${ok ? 'ДА, ещё один круг' : 'НЕТ, цикл заканчивается'}.`) : tr('Next round of the loop.', 'Следующий круг цикла.'));
          if (!ok) break;
          try {
            yield* this.exec(body, new Scope(loop));
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
          for (const u of updates) yield* this.eval(u, loop, self, cls);
        }
        return;
      }
      case 'for_each_statement': {
        const varName = n.childForFieldName('left')?.text ?? '?';
        const type = typeName(n.childForFieldName('type'));
        const coll = yield* this.eval(n.childForFieldName('right')!, scope, self, cls);
        const items = this.iterable(coll, lineOf(n));
        const body = n.childForFieldName('body')!;
        for (const item of [...items]) {
          const it = new Scope(scope);
          it.vars.set(varName, { v: item, type: type === 'var' ? kindOf(item) : type });
          yield this.step(n, 'loop', tr(`Next item: ${varName} = ${shown(item).text}.`, `Следующий элемент: ${varName} = ${shown(item).text}.`));
          try {
            yield* this.exec(body, it);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
        }
        yield this.step(n, 'loop', tr('No items left — the loop ends.', 'Элементов больше нет — цикл заканчивается.'));
        return;
      }
      case 'switch_statement': {
        const value = yield* this.eval(n.childForFieldName('value') ?? named(n)[0], scope, self, cls);
        const body = n.childForFieldName('body') ?? named(n).find((c) => c.type === 'switch_body')!;
        const sections = named(body).filter((c) => c.type === 'switch_section');
        let chosen: SyntaxNode | null = null;
        for (const sec of sections) {
          for (const lab of named(sec)) {
            if (lab.type === 'default_switch_label' || lab.text.startsWith('default')) {
              if (!chosen) chosen = null;
              continue;
            }
            if (/switch_label|case/.test(lab.type) || lab.type === 'constant_pattern') {
              const exprNode = named(lab)[0] ?? lab;
              const cmp = yield* this.eval(exprNode.type === 'constant_pattern' ? (named(exprNode)[0] ?? exprNode) : exprNode, scope, self, cls);
              if (equalsV(cmp, value)) {
                chosen = sec;
                break;
              }
            }
          }
          if (chosen) break;
        }
        if (!chosen) chosen = sections.find((s) => named(s).some((l) => l.type === 'default_switch_label' || l.text.startsWith('default'))) ?? null;
        yield this.step(n, 'check', tr(`Choose a case for ${shown(value).text}.`, `Выбираем вариант для ${shown(value).text}.`));
        if (chosen) {
          try {
            const inner = new Scope(scope);
            for (const st of named(chosen)) if (!/switch_label|case_pattern|constant_pattern/.test(st.type) && !st.text.startsWith('case ') && !st.text.startsWith('default')) yield* this.exec(st, inner);
          } catch (e) {
            if (!(e instanceof BreakSig)) throw e;
          }
        }
        return;
      }
      case 'return_statement': {
        const e = named(n)[0];
        const v = e ? yield* this.eval(e, scope, self, cls) : undefined;
        yield this.step(n, 'return', e ? tr(`Give back ${shown(v).text} and leave the function.`, `Отдаём ${shown(v).text} и выходим из функции.`) : tr('Leave the function.', 'Выходим из функции.'));
        throw new ReturnSig(v);
      }
      case 'break_statement':
        yield this.step(n, 'line', tr('break: stop the loop now.', 'break: сразу выходим из цикла.'));
        throw new BreakSig();
      case 'continue_statement':
        yield this.step(n, 'line', tr('continue: skip to the next round.', 'continue: переходим к следующему кругу.'));
        throw new ContinueSig();
      case 'throw_statement': {
        const e = named(n)[0];
        const v = e ? yield* this.eval(e, scope, self, cls) : null;
        const exName = v && typeof v === 'object' && v.k === 'obj' ? v.cls.name : 'Exception';
        const msg = v && typeof v === 'object' && v.k === 'obj' ? csText(v.fields.get('Message')?.v) : '';
        throw new ThrowSig(exName, msg);
      }
      case 'try_statement': {
        const body = n.childForFieldName('body') ?? named(n).find((c) => c.type === 'block')!;
        const catches = named(n).filter((c) => c.type === 'catch_clause');
        const fin = named(n).find((c) => c.type === 'finally_clause');
        try {
          yield* this.exec(body, new Scope(scope));
        } catch (e) {
          const ex = e instanceof ThrowSig ? e : e instanceof CsError && e.kind === 'runtime' ? new ThrowSig(e.exception ?? 'Exception', e.message) : null;
          if (!ex || !catches.length) throw e;
          const c = catches[0];
          const decl = named(c).find((x) => x.type === 'catch_declaration');
          const inner = new Scope(scope);
          const varName = decl?.childForFieldName('name')?.text;
          if (varName) inner.vars.set(varName, { v: this.makeException(ex.exception, ex.message), type: 'Exception' });
          yield this.step(c, 'check', tr(`An error happened (${ex.exception}) — the catch part handles it.`, `Случилась ошибка (${ex.exception}) — её обрабатывает часть catch.`));
          yield* this.exec(c.childForFieldName('body') ?? named(c).find((x) => x.type === 'block')!, inner);
        } finally {
          if (fin) yield* this.exec(named(fin)[0], new Scope(scope));
        }
        return;
      }
      case 'local_function_statement':
        this.declareLocalFunction(n, scope, self);
        return;
      case 'empty_statement':
      case 'comment':
        return;
      default:
        throw this.unsupported(n);
    }
  }

  private makeException(name: string, message: string): ObjV {
    const cls: ClassInfo = this.classes.get(name) ?? { name, node: this.tree.rootNode, base: 'Exception', fields: [], methods: new Map(), ctors: [], statics: new Map(), isStruct: false };
    return { k: 'obj', cls, fields: new Map([['Message', { v: message, type: 'string' }]]), id: objCounter++ };
  }

  private *declare(decl: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<void> {
    const type = typeName(decl.childForFieldName('type'));
    for (const d of named(decl).filter((c) => c.type === 'variable_declarator')) {
      const name = named(d)[0]?.text ?? '?';
      const init = named(d).find((c) => c.type === 'equals_value_clause');
      const initExpr = init ? named(init)[0] : named(d)[1];
      let v: V = initExpr ? yield* this.eval(initExpr, scope, self, cls, type) : defaultOf(type);
      const t = type === 'var' ? (initExpr ? this.staticKind(initExpr, scope, cls) : 'var') : type;
      v = coerce(v, t);
      if (scope.vars.has(name)) throw new CsError(tr(`A variable named "${name}" already exists here.`, `Переменная «${name}» здесь уже есть. Придумай другое имя.`), lineOf(d), 'compile');
      scope.vars.set(name, { v, type: t });
    }
  }

  private unsupported(n: SyntaxNode): CsError {
    return new CsError(
      tr(`This part of C# is not supported by the step-by-step runner yet: ${n.type.replace(/_/g, ' ')}.`, `Эту часть C# пошаговый запуск пока не поддерживает: ${n.type.replace(/_/g, ' ')}.`),
      lineOf(n),
      'unsupported',
    );
  }

  private limitError(n: SyntaxNode): CsError {
    return new CsError(
      tr('The program ran too long and was stopped (probably an endless loop: the condition never becomes false).', 'Программа работала слишком долго и была остановлена (скорее всего, бесконечный цикл: условие никогда не становится ложным).'),
      lineOf(n),
      'limit',
    );
  }

  private iterable(v: V, line: number): V[] {
    if (v && typeof v === 'object') {
      if (v.k === 'arr' || v.k === 'list') return v.items;
      if (v.k === 'dict') return [...v.map.values()].map((e) => this.kvPair(e.key, e.value));
    }
    if (typeof v === 'string') return [...v];
    throw new CsError(tr('foreach needs a list, an array or text.', 'foreach нужен список, массив или текст.'), line);
  }

  private kvPair(key: V, value: V): ObjV {
    const cls: ClassInfo = { name: 'KeyValuePair', node: this.tree.rootNode, base: null, fields: [], methods: new Map(), ctors: [], statics: new Map(), isStruct: true };
    return { k: 'obj', cls, fields: new Map([['Key', { v: key, type: '' }], ['Value', { v: value, type: '' }]]), id: objCounter++ };
  }

  private describeExpression(e: SyntaxNode, scope: Scope, outputBefore: number): string {
    if (this.output.length > outputBefore) return tr(`Shown on the screen: ${this.output.slice(outputBefore).join(' / ')}`, `На экран выводится: ${this.output.slice(outputBefore).join(' / ')}`);
    if (e.type === 'assignment_expression' || e.type === 'postfix_unary_expression' || e.type === 'prefix_unary_expression') {
      const target = e.type === 'assignment_expression' ? e.childForFieldName('left') : named(e)[0];
      if (target && target.type === 'identifier') {
        const c = scope.lookup(target.text) ?? this.currentSelfField(target.text);
        if (c) return tr(`${target.text} now holds ${shown(c.v, c.type).text}.`, `Теперь в ${target.text} лежит ${shown(c.v, c.type).text}.`);
      }
      return tr(`Changed: ${short(e.text)}.`, `Изменено: ${short(e.text)}.`);
    }
    if (e.type === 'invocation_expression') return tr(`Done: ${short(e.text)}.`, `Выполнено: ${short(e.text)}.`);
    return short(e.text);
  }

  private currentSelfField(name: string): Cell | undefined {
    return this.stack[this.stack.length - 1]?.self?.fields.get(name);
  }

  // -------------------------------------------------------------------------- expressions

  /** Best-effort static kind of a numeric expression: decides integer vs. decimal division. */
  staticKind(n: SyntaxNode, scope: Scope, cls: ClassInfo | null): string {
    switch (n.type) {
      case 'integer_literal':
        return 'int';
      case 'real_literal':
        return /[fF]$/.test(n.text) ? 'float' : /[mM]$/.test(n.text) ? 'decimal' : 'double';
      case 'string_literal':
      case 'interpolated_string_expression':
      case 'verbatim_string_literal':
        return 'string';
      case 'character_literal':
        return 'char';
      case 'boolean_literal':
        return 'bool';
      case 'parenthesized_expression':
        return this.staticKind(named(n)[0], scope, cls);
      case 'cast_expression':
        return typeName(n.childForFieldName('type'));
      case 'identifier': {
        const c = scope.lookup(n.text) ?? this.currentSelfField(n.text) ?? cls?.statics.get(n.text);
        return c?.type ?? 'var';
      }
      case 'prefix_unary_expression':
      case 'postfix_unary_expression':
        return opOf(n) === '!' ? 'bool' : this.staticKind(named(n)[0], scope, cls);
      case 'binary_expression': {
        const op = opOf(n);
        if (/^(==|!=|<|>|<=|>=|&&|\|\|)$/.test(op)) return 'bool';
        const a = this.staticKind(n.childForFieldName('left')!, scope, cls);
        const b = this.staticKind(n.childForFieldName('right')!, scope, cls);
        if (a === 'string' || b === 'string') return 'string';
        if (INT_TYPES.has(a) && INT_TYPES.has(b)) return 'int';
        if (a === 'double' || b === 'double') return 'double';
        if (a === 'float' || b === 'float') return 'float';
        return a === 'var' || b === 'var' ? 'var' : 'double';
      }
      case 'member_access_expression': {
        const name = n.childForFieldName('name')?.text ?? '';
        if (name === 'Length' || name === 'Count') return 'int';
        if (name === 'deltaTime' || name === 'x' || name === 'y' || name === 'z' || name === 'magnitude') return 'float';
        return 'var';
      }
      case 'invocation_expression': {
        const f = n.childForFieldName('function');
        const t = f?.text ?? '';
        if (/^(int|Int32)\.Parse$|^Convert\.ToInt32$|^Mathf\.(RoundToInt|FloorToInt|CeilToInt)$/.test(t)) return 'int';
        if (/^Mathf\./.test(t)) return 'float';
        if (/^Math\./.test(t)) return 'double';
        if (/^(float)\.Parse$/.test(t)) return 'float';
        if (f?.type === 'identifier') {
          const local = scope.lookup(f.text);
          if (local && typeof local.v === 'object' && local.v?.k === 'fn') {
            const fnNode = local.v.body.parent;
            const rt = fnNode?.childForFieldName('type');
            if (rt) return typeName(rt);
          }
          const m = cls?.methods.get(f.text)?.[0];
          if (m) return typeName(m.childForFieldName('type'));
        }
        return 'var';
      }
      case 'element_access_expression': {
        const t = this.staticKind(n.childForFieldName('expression')!, scope, cls);
        return t.endsWith('[]') ? t.slice(0, -2) : /^List<(.+)>$/.exec(t)?.[1] ?? 'var';
      }
      default:
        return 'var';
    }
  }

  *eval(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null, expected = ''): Gen<V> {
    switch (n.type) {
      case 'integer_literal':
        return parseInt(n.text.replace(/[_uUlL]/g, ''), n.text.startsWith('0x') ? 16 : 10);
      case 'real_literal': {
        const x = parseFloat(n.text.replace(/[_fFdDmM]$/g, '').replace(/_/g, ''));
        return /[fF]$/.test(n.text) ? Math.fround(x) : x;
      }
      case 'boolean_literal':
        return n.text === 'true';
      case 'null_literal':
        return null;
      case 'character_literal':
        return unescape(n.text.slice(1, -1));
      case 'string_literal':
      case 'verbatim_string_literal':
      case 'raw_string_literal':
        return stringValue(n);
      case 'interpolated_string_expression': {
        let out = '';
        for (const c of named(n)) {
          if (c.type === 'interpolated_string_text' || c.type === 'string_content' || c.type === 'escape_sequence') out += c.type === 'escape_sequence' ? unescape(c.text) : c.text.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
          else if (c.type === 'interpolation') {
            const parts = named(c);
            const expr = parts[0];
            const fmt = parts.find((p) => p.type === 'interpolation_format_clause')?.text.replace(/^:/, '');
            const v = yield* this.eval(expr, scope, self, cls);
            out += formatWith(v, fmt, this.staticKind(expr, scope, cls));
          }
        }
        return out;
      }
      case 'parenthesized_expression':
        return yield* this.eval(named(n)[0], scope, self, cls, expected);
      case 'identifier':
        return this.readName(n.text, scope, self, cls, lineOf(n));
      case 'this_expression':
      case 'this':
        return self;
      case 'base_expression':
        return self;
      case 'predefined_type':
        return { k: 'type', name: n.text };
      case 'binary_expression':
        return yield* this.binary(n, scope, self, cls);
      case 'prefix_unary_expression': {
        const op = opOf(n);
        const target = named(n)[0];
        if (op === '++' || op === '--') {
          const old = yield* this.eval(target, scope, self, cls);
          const nv = num(old, lineOf(n)) + (op === '++' ? 1 : -1);
          yield* this.assign(target, nv, scope, self, cls);
          return nv;
        }
        const v = yield* this.eval(target, scope, self, cls);
        if (op === '!') return !truthy(v, lineOf(n));
        if (op === '-') return typeof v === 'object' && v?.k === 'vec' ? vec(-v.x, -v.y, -v.z, v.dim) : -num(v, lineOf(n));
        if (op === '+') return num(v, lineOf(n));
        if (op === '~') return ~num(v, lineOf(n));
        throw this.unsupported(n);
      }
      case 'postfix_unary_expression': {
        const op = opOf(n);
        const target = named(n)[0];
        if (op === '!') return yield* this.eval(target, scope, self, cls);
        const old = yield* this.eval(target, scope, self, cls);
        yield* this.assign(target, num(old, lineOf(n)) + (op === '++' ? 1 : -1), scope, self, cls);
        return old;
      }
      case 'assignment_expression': {
        const left = n.childForFieldName('left')!;
        const op = named(n).find((c) => c.type === 'assignment_operator')?.text ?? opOf(n);
        const right = n.childForFieldName('right')!;
        let v = yield* this.eval(right, scope, self, cls);
        if (op !== '=') {
          const cur = yield* this.eval(left, scope, self, cls);
          if (op === '??=') v = cur ?? v;
          else v = this.arith(op.slice(0, -1), cur, v, lineOf(n), INT_TYPES.has(this.staticKind(left, scope, cls)) && INT_TYPES.has(this.staticKind(right, scope, cls)));
        }
        yield* this.assign(left, v, scope, self, cls);
        return v;
      }
      case 'conditional_expression': {
        const ok = truthy(yield* this.eval(n.childForFieldName('condition')!, scope, self, cls), lineOf(n));
        return yield* this.eval(n.childForFieldName(ok ? 'consequence' : 'alternative')!, scope, self, cls);
      }
      case 'cast_expression': {
        const t = typeName(n.childForFieldName('type'));
        const v = yield* this.eval(n.childForFieldName('value') ?? named(n).at(-1)!, scope, self, cls);
        return castTo(v, t, lineOf(n));
      }
      case 'member_access_expression':
      case 'conditional_access_expression':
        return yield* this.member(n, scope, self, cls);
      case 'element_access_expression': {
        const target = yield* this.eval(n.childForFieldName('expression')!, scope, self, cls);
        const args = named(n.childForFieldName('subscript') ?? named(n)[1]);
        const key = yield* this.eval(named(args[0])[0] ?? args[0], scope, self, cls);
        return this.index(target, key, lineOf(n));
      }
      case 'invocation_expression':
        return yield* this.invocation(n, scope, self, cls);
      case 'object_creation_expression':
        return yield* this.create(n, scope, self, cls);
      case 'implicit_object_creation_expression':
        return yield* this.create(n, scope, self, cls, expected);
      case 'array_creation_expression':
      case 'implicit_array_creation_expression':
      case 'collection_expression':
      case 'initializer_expression': {
        const at = named(n).find((c) => c.type === 'array_type');
        const elem = at ? typeName(at.childForFieldName('type')) : 'var';
        const init = n.type === 'initializer_expression' || n.type === 'collection_expression' ? n : named(n).find((c) => c.type === 'initializer_expression');
        if (init) {
          const items: V[] = [];
          for (const c of named(init)) items.push(coerce(yield* this.eval(c, scope, self, cls), elem));
          return { k: 'arr', items, elem: elem === 'var' ? (items.length ? kindOf(items[0]) : 'var') : elem };
        }
        const rank = at ? named(at).find((c) => c.type === 'array_rank_specifier') : null;
        const sizeNode = rank ? named(rank)[0] : null;
        const size = sizeNode ? num(yield* this.eval(sizeNode, scope, self, cls), lineOf(n)) : 0;
        if (size > 1_000_000) throw new CsError(tr('This array is too big for the learning runner.', 'Этот массив слишком большой для учебного запуска.'), lineOf(n), 'limit');
        return { k: 'arr', items: Array.from({ length: size }, () => defaultOf(elem)), elem };
      }
      case 'lambda_expression': {
        const params = named(n)
          .filter((c) => c.type === 'parameter_list' || c.type === 'implicit_parameter' || c.type === 'identifier')
          .flatMap((c) => (c.type === 'parameter_list' ? named(c).map((p) => p.childForFieldName('name')?.text ?? p.text) : [c.text]));
        const body = n.childForFieldName('body') ?? named(n).at(-1)!;
        return { k: 'fn', name: 'lambda', params, body, scope, self: self ?? undefined };
      }
      case 'typeof_expression':
        return { k: 'type', name: named(n)[0]?.text ?? '?' };
      case 'is_pattern_expression':
      case 'is_expression': {
        const v = yield* this.eval(named(n)[0], scope, self, cls);
        const t = named(n)[1]?.text ?? '';
        if (t === 'null') return v === null;
        if (t === 'not null') return v !== null;
        return typeof v === 'object' && v !== null && v.k === 'obj' ? v.cls.name === t || v.cls.base === t : kindOf(v) === t;
      }
      case 'default_expression':
        return defaultOf(expected || named(n)[0]?.text || 'object');
      default:
        throw this.unsupported(n);
    }
  }

  private readName(name: string, scope: Scope, self: ObjV | null, cls: ClassInfo | null, line: number): V {
    const c = scope.lookup(name);
    if (c) return c.v;
    if (self) {
      const f = self.fields.get(name);
      if (f) return this.fieldValue(self, name, f, line);
      if (self.cls.methods.has(name)) return { k: 'fn', name, params: [], body: self.cls.methods.get(name)![0], scope: new Scope(null), self };
    }
    for (let k: ClassInfo | null = cls; k; k = k.base ? (this.classes.get(k.base) ?? null) : null) {
      const s = k.statics.get(name);
      if (s) return s.v;
    }
    const g = this.globalScope.lookup(name);
    if (g && typeof g.v === 'object' && g.v?.k === 'fn') return g.v;
    if (this.classes.has(name) || this.enums.has(name) || BUILTIN_TYPES.has(name)) return { k: 'type', name };
    const h = this.host.global?.(name, self);
    if (h !== undefined && h !== NOT_FOUND) return h as V;
    throw new CsError(
      tr(`The name "${name}" does not exist here. Create it first (for example: int ${name} = 0;) or check the spelling — C# cares about capital letters.`, `Имени «${name}» здесь нет. Сначала создай его (например: int ${name} = 0;) или проверь написание — в C# важны большие и маленькие буквы.`),
      line,
      'runtime',
      'CS0103',
    );
  }

  private fieldValue(_self: ObjV, _name: string, cell: Cell, _line: number): V {
    void _self;
    void _name;
    void _line;
    return cell.v;
  }

  private *assign(target: SyntaxNode, v: V, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<void> {
    const line = lineOf(target);
    if (target.type === 'identifier') {
      const c = scope.lookup(target.text);
      if (c) {
        c.v = coerce(v, c.type);
        return;
      }
      const f = self?.fields.get(target.text);
      if (f) {
        f.v = coerce(v, f.type);
        return;
      }
      for (let k: ClassInfo | null = cls; k; k = k.base ? (this.classes.get(k.base) ?? null) : null) {
        const s = k.statics.get(target.text);
        if (s) {
          s.v = coerce(v, s.type);
          return;
        }
      }
      if (this.host.global && self) {
        const h = this.host.global(target.text, self);
        if (h !== NOT_FOUND) throw new CsError(tr(`"${target.text}" cannot be replaced like this.`, `«${target.text}» нельзя заменить таким способом.`), line);
      }
      throw new CsError(tr(`The name "${target.text}" does not exist. Create it first, for example: var ${target.text} = …;`, `Имени «${target.text}» нет. Сначала создай его, например: var ${target.text} = …;`), line, 'runtime', 'CS0103');
    }
    if (target.type === 'member_access_expression') {
      const obj = yield* this.eval(target.childForFieldName('expression')!, scope, self, cls);
      const name = target.childForFieldName('name')!.text;
      this.setMember(obj, name, v, line, target, scope, self, cls);
      return;
    }
    if (target.type === 'element_access_expression') {
      const obj = yield* this.eval(target.childForFieldName('expression')!, scope, self, cls);
      const args = named(target.childForFieldName('subscript') ?? named(target)[1]);
      const key = yield* this.eval(named(args[0])[0] ?? args[0], scope, self, cls);
      this.setIndex(obj, key, v, line);
      return;
    }
    if (target.type === 'parenthesized_expression') return yield* this.assign(named(target)[0], v, scope, self, cls);
    throw new CsError(tr('Only variables, fields and list items can receive a value.', 'Значение можно положить только в переменную, поле или элемент списка.'), line, 'compile');
  }

  private setMember(obj: V, name: string, v: V, line: number, target: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): void {
    void scope;
    void self;
    if (obj && typeof obj === 'object') {
      if (obj.k === 'obj') {
        const f = obj.fields.get(name);
        if (f) {
          f.v = coerce(v, f.type);
          return;
        }
        obj.fields.set(name, { v, type: kindOf(v) });
        return;
      }
      if (obj.k === 'type') {
        const k = this.classes.get(obj.name);
        const s = k?.statics.get(name);
        if (s) {
          s.v = coerce(v, s.type);
          return;
        }
      }
      if (obj.k === 'vec' && (name === 'x' || name === 'y' || name === 'z')) {
        // Vectors are values (structs): changing x of a copy does not change the original —
        // but writing transform.position.x is a classic Unity error, so explain it.
        const inner = target.childForFieldName('expression');
        if (inner?.type === 'member_access_expression' && /^(position|velocity|localScale|eulerAngles)$/.test(inner.childForFieldName('name')?.text ?? ''))
          throw new CsError(
            tr(`In Unity you cannot change ${inner.text}.${name} directly (CS1612). Copy it into a variable, change the copy, then put it back: var p = ${inner.text}; p.${name} = …; ${inner.text} = p;`, `В Unity нельзя менять ${inner.text}.${name} напрямую (ошибка CS1612). Скопируй в переменную, измени копию и положи обратно: var p = ${inner.text}; p.${name} = …; ${inner.text} = p;`),
            line,
            'compile',
            'CS1612',
          );
        obj[name] = num(v, line);
        return;
      }
      if (obj.k === 'host' && this.host.set?.(obj, name, v, line)) return;
    }
    if (obj === null || obj === undefined) throw nullError(name, line);
    void cls;
    throw new CsError(tr(`"${name}" cannot be changed here.`, `«${name}» здесь нельзя изменить.`), line);
  }

  private index(target: V, key: V, line: number): V {
    if (target === null || target === undefined) throw nullError('[]', line);
    if (typeof target === 'string') {
      const i = num(key, line);
      if (i < 0 || i >= target.length) throw indexError(i, target.length, line);
      return target[i];
    }
    if (typeof target !== 'object') throw new CsError(tr('Square brackets [ ] do not work with numbers or true/false.', 'Квадратные скобки [ ] не работают с числами и true/false.'), line);
    if (target.k === 'arr' || target.k === 'list') {
      const i = num(key, line);
      if (!Number.isInteger(i) || i < 0 || i >= target.items.length) throw indexError(i, target.items.length, line);
      return target.items[i];
    }
    if (target.k === 'dict') {
      const e = target.map.get(dictKey(key));
      if (!e) throw new CsError(tr(`The key ${shown(key).text} is not in the dictionary (KeyNotFoundException). Check with ContainsKey first.`, `Ключа ${shown(key).text} нет в словаре (KeyNotFoundException). Сначала проверь через ContainsKey.`), line, 'runtime', 'KeyNotFoundException');
      return e.value;
    }
    throw new CsError(tr('Square brackets [ ] only work with arrays, lists, dictionaries and text.', 'Квадратные скобки [ ] работают только с массивами, списками, словарями и текстом.'), line);
  }

  private setIndex(target: V, key: V, v: V, line: number): void {
    if (target === null || target === undefined) throw nullError('[]', line);
    if (typeof target === 'object' && (target.k === 'arr' || target.k === 'list')) {
      const i = num(key, line);
      if (!Number.isInteger(i) || i < 0 || i >= target.items.length) throw indexError(i, target.items.length, line);
      target.items[i] = coerce(v, target.elem);
      return;
    }
    if (typeof target === 'object' && target.k === 'dict') {
      target.map.set(dictKey(key), { key, value: v });
      return;
    }
    throw new CsError(tr('Only arrays, lists and dictionaries can be changed with [ ].', 'Через [ ] можно менять только массивы, списки и словари.'), line);
  }

  private arith(op: string, a: V, b: V, line: number, intDiv: boolean): V {
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return csText(a) + csText(b);
    if (typeof a === 'object' && a?.k === 'vec' && typeof b === 'object' && b?.k === 'vec') {
      if (op === '+') return vec(a.x + b.x, a.y + b.y, a.z + b.z, Math.max(a.dim, b.dim) as 2 | 3);
      if (op === '-') return vec(a.x - b.x, a.y - b.y, a.z - b.z, Math.max(a.dim, b.dim) as 2 | 3);
    }
    if (typeof a === 'object' && a?.k === 'vec' && isNum(b)) {
      if (op === '*') return vec(a.x * b, a.y * b, a.z * b, a.dim);
      if (op === '/') return vec(a.x / b, a.y / b, a.z / b, a.dim);
    }
    if (isNum(a) && typeof b === 'object' && b?.k === 'vec' && op === '*') return vec(b.x * a, b.y * a, b.z * a, b.dim);
    const x = num(a, line);
    const y = num(b, line);
    switch (op) {
      case '+':
        return x + y;
      case '-':
        return x - y;
      case '*':
        return x * y;
      case '/':
        if (intDiv) {
          if (y === 0) throw new CsError(tr('Division by zero (DivideByZeroException): you cannot divide a whole number by 0.', 'Деление на ноль (DivideByZeroException): целое число нельзя делить на 0.'), line, 'runtime', 'DivideByZeroException');
          return Math.trunc(x / y);
        }
        return x / y;
      case '%':
        if (intDiv && y === 0) throw new CsError(tr('Division by zero in % (DivideByZeroException).', 'Деление на ноль в % (DivideByZeroException).'), line, 'runtime', 'DivideByZeroException');
        return x % y;
      case '&':
        return typeof a === 'boolean' ? a && (b as boolean) : x & y;
      case '|':
        return typeof a === 'boolean' ? a || (b as boolean) : x | y;
      case '^':
        return typeof a === 'boolean' ? a !== b : x ^ y;
      case '<<':
        return x << y;
      case '>>':
        return x >> y;
      default:
        throw new CsError(tr(`Unknown operator ${op}.`, `Неизвестный оператор ${op}.`), line);
    }
  }

  private *binary(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<V> {
    const op = opOf(n);
    const leftN = n.childForFieldName('left')!;
    const rightN = n.childForFieldName('right')!;
    const line = lineOf(n);
    if (op === '&&') return truthy(yield* this.eval(leftN, scope, self, cls), line) ? truthy(yield* this.eval(rightN, scope, self, cls), line) : false;
    if (op === '||') return truthy(yield* this.eval(leftN, scope, self, cls), line) ? true : truthy(yield* this.eval(rightN, scope, self, cls), line);
    if (op === '??') {
      const l = yield* this.eval(leftN, scope, self, cls);
      return l ?? (yield* this.eval(rightN, scope, self, cls));
    }
    const a = yield* this.eval(leftN, scope, self, cls);
    const b = yield* this.eval(rightN, scope, self, cls);
    switch (op) {
      case '==':
        return equalsV(a, b);
      case '!=':
        return !equalsV(a, b);
      case '<':
        return compare(a, b, line) < 0;
      case '>':
        return compare(a, b, line) > 0;
      case '<=':
        return compare(a, b, line) <= 0;
      case '>=':
        return compare(a, b, line) >= 0;
    }
    const intDiv = (op === '/' || op === '%') && INT_TYPES.has(this.staticKind(leftN, scope, cls)) && INT_TYPES.has(this.staticKind(rightN, scope, cls));
    return this.arith(op, a, b, line, intDiv);
  }

  // -------------------------------------------------------------------------- members & calls

  private *member(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<V> {
    const line = lineOf(n);
    const exprNode = n.childForFieldName('expression') ?? named(n)[0];
    const name = n.childForFieldName('name')?.text ?? named(n).at(-1)?.text ?? '';
    const conditional = n.type === 'conditional_access_expression' || n.text.includes('?.');
    const obj = yield* this.eval(exprNode, scope, self, cls);
    if ((obj === null || obj === undefined) && conditional) return null;
    return this.getMember(obj, name, line);
  }

  getMember(obj: V, name: string, line: number): V {
    if (obj === null || obj === undefined) throw nullError(name, line);
    if (typeof obj === 'string') {
      if (name === 'Length') return obj.length;
      throw new CsError(tr(`Text has no "${name}".`, `У текста нет «${name}».`), line, 'runtime', 'CS1061');
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') throw new CsError(tr(`A number has no "${name}".`, `У числа нет «${name}».`), line, 'runtime', 'CS1061');
    switch (obj.k) {
      case 'arr':
        if (name === 'Length') return obj.items.length;
        break;
      case 'list':
        if (name === 'Count') return obj.items.length;
        break;
      case 'dict':
        if (name === 'Count') return obj.map.size;
        if (name === 'Keys') return { k: 'list', items: [...obj.map.values()].map((e) => e.key), elem: 'var' };
        if (name === 'Values') return { k: 'list', items: [...obj.map.values()].map((e) => e.value), elem: 'var' };
        break;
      case 'vec':
        if (name === 'x' || name === 'y' || name === 'z') return obj[name];
        if (name === 'magnitude') return Math.fround(Math.hypot(obj.x, obj.y, obj.z));
        if (name === 'sqrMagnitude') return obj.x * obj.x + obj.y * obj.y + obj.z * obj.z;
        if (name === 'normalized') {
          const m = Math.hypot(obj.x, obj.y, obj.z) || 1;
          return vec(obj.x / m, obj.y / m, obj.z / m, obj.dim);
        }
        break;
      case 'obj': {
        const f = obj.fields.get(name);
        if (f) {
          const getter = this.findField(obj.cls, name)?.getter;
          if (getter) return this.evalSync(getter, new Scope(null), obj, obj.cls);
          return f.v;
        }
        if (this.findMethod(obj.cls, name)) return { k: 'fn', name, params: [], body: this.findMethod(obj.cls, name)![0], scope: new Scope(null), self: obj };
        break;
      }
      case 'type':
        return this.staticMember(obj.name, name, line);
      case 'enum':
        break;
      case 'host': {
        const r = this.host.get?.(obj, name, line);
        if (r !== undefined && r !== NOT_FOUND) return r as V;
        break;
      }
    }
    throw new CsError(
      tr(`"${csText(obj) || 'this value'}" has no member "${name}" (CS1061). Check the spelling and capital letters.`, `У «${csText(obj) || 'этого значения'}» нет члена «${name}» (CS1061). Проверь написание и большие буквы.`),
      line,
      'runtime',
      'CS1061',
    );
  }

  private findField(cls: ClassInfo, name: string): ClassInfo['fields'][number] | undefined {
    for (let k: ClassInfo | undefined = cls; k; k = k.base ? this.classes.get(k.base) : undefined) {
      const f = k.fields.find((x) => x.name === name);
      if (f) return f;
    }
    return undefined;
  }

  private findMethod(cls: ClassInfo, name: string): SyntaxNode[] | undefined {
    for (let k: ClassInfo | undefined = cls; k; k = k.base ? this.classes.get(k.base) : undefined) {
      const m = k.methods.get(name);
      if (m) return m;
    }
    return undefined;
  }

  /** Evaluates an expression that cannot ask for input (property getters). */
  private evalSync(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): V {
    const g = this.eval(n, scope, self, cls);
    for (;;) {
      const r = g.next();
      if (r.done) return r.value;
    }
  }

  private staticMember(type: string, name: string, line: number): V {
    const cls = this.classes.get(type);
    if (cls) {
      const s = cls.statics.get(name);
      if (s) return s.v;
    }
    if (this.enums.has(type)) {
      if (this.enums.get(type)!.includes(name)) return { k: 'enum', type, name };
    }
    switch (type) {
      case 'Math':
      case 'Mathf':
        if (name === 'PI') return type === 'Mathf' ? Math.fround(Math.PI) : Math.PI;
        if (name === 'Infinity') return Infinity;
        if (name === 'Deg2Rad') return Math.fround(Math.PI / 180);
        if (name === 'Rad2Deg') return Math.fround(180 / Math.PI);
        break;
      case 'int':
      case 'Int32':
        if (name === 'MaxValue') return 2147483647;
        if (name === 'MinValue') return -2147483648;
        break;
      case 'float':
        if (name === 'MaxValue') return 3.4028235e38;
        break;
      case 'Vector2':
      case 'Vector3': {
        const d = type === 'Vector2' ? 2 : 3;
        const m: Record<string, VecV> = { zero: vec(0, 0, 0, d), one: vec(1, 1, d === 3 ? 1 : 0, d), up: vec(0, 1, 0, d), down: vec(0, -1, 0, d), left: vec(-1, 0, 0, d), right: vec(1, 0, 0, d), forward: vec(0, 0, 1, 3), back: vec(0, 0, -1, 3) };
        if (m[name]) return m[name];
        break;
      }
      case 'KeyCode':
        return { k: 'enum', type, name };
      case 'Color':
        return { k: 'enum', type, name };
      case 'string':
      case 'String':
        if (name === 'Empty') return '';
        break;
    }
    const h = this.host.global?.(`${type}.${name}`, null);
    if (h !== undefined && h !== NOT_FOUND) return h as V;
    throw new CsError(tr(`"${type}" has no "${name}".`, `У «${type}» нет «${name}».`), line, 'runtime', 'CS0117');
  }

  private *args(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<V[]> {
    const list = n.childForFieldName('arguments') ?? named(n).find((c) => c.type === 'argument_list');
    const out: V[] = [];
    for (const a of list ? named(list) : []) {
      const e = a.type === 'argument' ? named(a).at(-1)! : a;
      if (a.type === 'argument' && /^(ref|out|in)\b/.test(a.text)) throw new CsError(tr('ref/out parameters are not supported by the learning runner yet.', 'Параметры ref/out учебный запуск пока не поддерживает.'), lineOf(a), 'unsupported');
      out.push(yield* this.eval(e, scope, self, cls));
    }
    return out;
  }

  private *invocation(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null): Gen<V> {
    const line = lineOf(n);
    const fnNode = n.childForFieldName('function') ?? named(n)[0];
    const args = yield* this.args(n, scope, self, cls);
    if (fnNode.type === 'identifier' || fnNode.type === 'generic_name') {
      const name = fnNode.type === 'generic_name' ? (named(fnNode)[0]?.text ?? fnNode.text) : fnNode.text;
      const local = scope.lookup(name) ?? this.globalScope.lookup(name);
      if (local && typeof local.v === 'object' && local.v?.k === 'fn') return yield* this.callFn(local.v, args, line);
      if (self || cls) {
        const owner = self?.cls ?? cls!;
        const m = this.findMethod(owner, name);
        if (m) return yield* this.invokeMethod(this.pickOverload(m, args.length), owner, self, args, line);
      }
      const builtin = yield* this.builtinFree(fnNode.type === 'generic_name' ? fnNode.text.replace(/\s+/g, '') : name, args, line, self);
      if (builtin !== NOT_FOUND) return builtin as V;
      throw new CsError(tr(`There is no function "${name}". Check the spelling, or create it first.`, `Функции «${name}» нет. Проверь написание или сначала создай её.`), line, 'runtime', 'CS0103');
    }
    if (fnNode.type === 'member_access_expression') {
      const name = fnNode.childForFieldName('name')?.text ?? '';
      const target = yield* this.eval(fnNode.childForFieldName('expression')!, scope, self, cls);
      if (fnNode.text.includes('?.') && (target === null || target === undefined)) return null;
      const nameNode = fnNode.childForFieldName('name');
      return yield* this.callMethod(target, nameNode?.type === 'generic_name' ? nameNode.text.replace(/\s+/g, '') : name, args, line);
    }
    const f = yield* this.eval(fnNode, scope, self, cls);
    if (typeof f === 'object' && f?.k === 'fn') return yield* this.callFn(f, args, line);
    throw new CsError(tr('This cannot be called like a function.', 'Это нельзя вызвать как функцию.'), line);
  }

  private pickOverload(list: SyntaxNode[], argc: number): SyntaxNode {
    return list.find((m) => this.paramNames(m).length === argc) ?? list.find((m) => this.paramInfo(m).filter((p) => !p.def).length <= argc) ?? list[0];
  }

  *callFn(f: FnV, args: V[], line: number): Gen<V> {
    const isMethod = f.body.type === 'method_declaration';
    if (isMethod && f.self) return yield* this.invokeMethod(f.body, f.self.cls, f.self, args, line);
    if (this.stack.length > this.limits.maxDepth) throw new CsError(tr('Too many calls inside each other (stack overflow) — probably a function that calls itself forever.', 'Слишком много вызовов друг в друге (переполнение стека) — скорее всего, функция бесконечно вызывает саму себя.'), line, 'limit', 'StackOverflowException');
    const scope = new Scope(f.scope, true);
    const fnDecl = f.body.parent;
    const info = fnDecl && fnDecl.type === 'local_function_statement' ? this.paramInfo(fnDecl) : f.params.map((p) => ({ name: p, type: 'var', def: null }));
    for (let i = 0; i < info.length; i++) scope.vars.set(info[i].name, { v: coerce(i < args.length ? args[i] : info[i].def ? this.evalSync(info[i].def!, scope, f.self ?? null, null) : undefined, info[i].type), type: info[i].type === 'var' ? kindOf(args[i]) : info[i].type });
    const frameCls = f.self?.cls ?? null;
    if (f.name !== 'lambda') {
      this.stack.push({ fn: f.name, scope, self: f.self ?? null, cls: frameCls });
      yield this.step(f.body.parent ?? f.body, 'call', tr(`Jump into ${f.name}(${args.map((a) => shown(a).text).join(', ')}).`, `Прыжок в ${f.name}(${args.map((a) => shown(a).text).join(', ')}).`));
    }
    try {
      if (f.body.type === 'block') yield* this.exec(f.body, scope);
      else {
        const expr = f.body.type === 'arrow_expression_clause' ? named(f.body)[0] : f.body;
        return yield* this.eval(expr, scope, f.self ?? null, frameCls);
      }
      return undefined;
    } catch (e) {
      if (e instanceof ReturnSig) return e.value;
      throw e;
    } finally {
      if (f.name !== 'lambda') this.stack.pop();
    }
  }

  *invokeMethod(m: SyntaxNode, cls: ClassInfo, self: ObjV | null, args: V[], line: number): Gen<V> {
    if (this.stack.length > this.limits.maxDepth) throw new CsError(tr('Too many calls inside each other (stack overflow) — probably a method that calls itself forever.', 'Слишком много вызовов друг в друге (переполнение стека) — скорее всего, метод бесконечно вызывает сам себя.'), line, 'limit', 'StackOverflowException');
    const name = m.childForFieldName('name')?.text ?? '?';
    const scope = new Scope(null, true);
    const info = this.paramInfo(m);
    for (let i = 0; i < info.length; i++) scope.vars.set(info[i].name, { v: coerce(i < args.length ? args[i] : info[i].def ? this.evalSync(info[i].def!, scope, self, cls) : undefined, info[i].type), type: info[i].type });
    this.stack.push({ fn: self ? `${cls.name}.${name}` : `${cls.name}.${name}`, scope, self, cls });
    yield this.step(m, 'call', tr(`Jump into ${name}(${args.map((a) => shown(a).text).join(', ')}).`, `Прыжок в ${name}(${args.map((a) => shown(a).text).join(', ')}).`));
    try {
      const body = m.childForFieldName('body') ?? named(m).find((c) => c.type === 'block' || c.type === 'arrow_expression_clause');
      if (!body) return undefined;
      if (body.type === 'block') yield* this.exec(body, scope);
      else return yield* this.eval(named(body)[0], scope, self, cls);
      return undefined;
    } catch (e) {
      if (e instanceof ReturnSig) return e.value;
      throw e;
    } finally {
      this.stack.pop();
    }
  }

  private *callMethod(target: V, fullName: string, args: V[], line: number): Gen<V> {
    const name = fullName.replace(/<.*$/, '');
    if (target === null || target === undefined) throw nullError(name, line);
    // Static calls: Console.WriteLine, Mathf.Clamp, int.Parse, MyClass.Method …
    if (typeof target === 'object' && target.k === 'type') {
      const cls = this.classes.get(target.name);
      if (cls) {
        const m = cls.methods.get(name);
        if (m) return yield* this.invokeMethod(this.pickOverload(m, args.length), cls, null, args, line);
      }
      const r = yield* this.builtinStatic(target.name, name, args, line);
      if (r !== NOT_FOUND) return r as V;
      throw new CsError(tr(`"${target.name}" has no method "${name}".`, `У «${target.name}» нет метода «${name}».`), line, 'runtime', 'CS0117');
    }
    if (typeof target === 'object' && target.k === 'obj') {
      const m = this.findMethod(target.cls, name);
      if (m) return yield* this.invokeMethod(this.pickOverload(m, args.length), target.cls, target, args, line);
      if (name === 'ToString') return target.cls.name;
      if (name === 'GetType') return { k: 'type', name: target.cls.name };
      const hm = this.host.method ? this.host.method({ k: 'host', kind: 'self', ref: target }, fullName, args, line) : NOT_FOUND;
      if (hm !== NOT_FOUND) return hm as V;
    }
    if (typeof target === 'object' && target.k === 'host') {
      const r = this.host.method ? this.host.method(target, fullName, args, line) : NOT_FOUND;
      if (r !== NOT_FOUND) return r as V;
    }
    if (typeof target === 'object' && target.k === 'fn' && name === 'Invoke') return yield* this.callFn(target, args, line);
    const r = yield* this.builtinMethod(target, name, args, line);
    if (r !== NOT_FOUND) return r as V;
    throw new CsError(
      tr(`"${csText(target)}" has no method "${name}" (CS1061). Check the spelling and capital letters.`, `У «${csText(target)}» нет метода «${name}» (CS1061). Проверь написание и большие буквы.`),
      line,
      'runtime',
      'CS1061',
    );
  }

  private *create(n: SyntaxNode, scope: Scope, self: ObjV | null, cls: ClassInfo | null, expected = ''): Gen<V> {
    const line = lineOf(n);
    const typeNode = n.childForFieldName('type');
    const t = typeNode ? typeName(typeNode) : expected;
    const args = yield* this.args(n, scope, self, cls);
    const init = n.childForFieldName('initializer') ?? named(n).find((c) => c.type === 'initializer_expression');
    const base = t.replace(/<.*$/, '');
    const elem = /<(.+)>/.exec(t)?.[1] ?? 'var';
    if (base === 'List' || base === 'HashSet' || base === 'Queue' || base === 'Stack') {
      const list: ListV = { k: 'list', items: [], elem };
      if (args[0] && typeof args[0] === 'object' && (args[0].k === 'list' || args[0].k === 'arr')) list.items.push(...args[0].items);
      if (init) for (const c of named(init)) list.items.push(coerce(yield* this.eval(c, scope, self, cls), elem));
      return list;
    }
    if (base === 'Dictionary') {
      const d: DictV = { k: 'dict', map: new Map() };
      if (init)
        for (const c of named(init)) {
          const pair = named(c);
          if (c.type === 'initializer_expression' && pair.length === 2) {
            const k = yield* this.eval(pair[0], scope, self, cls);
            d.map.set(dictKey(k), { key: k, value: yield* this.eval(pair[1], scope, self, cls) });
          } else if (c.type === 'assignment_expression') {
            const left = c.childForFieldName('left')!;
            const argNode = findFirst(left, 'argument');
            const keyNode = argNode ? named(argNode)[0] : named(left)[0];
            const k = yield* this.eval(keyNode, scope, self, cls);
            d.map.set(dictKey(k), { key: k, value: yield* this.eval(c.childForFieldName('right')!, scope, self, cls) });
          }
        }
      return d;
    }
    if (base === 'Vector2' || base === 'Vector3') return vec(num(args[0] ?? 0, line), num(args[1] ?? 0, line), num(args[2] ?? 0, line), base === 'Vector2' ? 2 : 3);
    if (base === 'Random') return { k: 'host', kind: 'Random', ref: null };
    if (base === 'StringBuilder') return { k: 'list', items: [], elem: 'string' };
    if (/Exception$/.test(base)) return this.makeException(base, csText(args[0] ?? ''));
    const k = this.classes.get(base);
    if (!k) throw new CsError(tr(`There is no class "${base}". Create it with: class ${base} { … }`, `Класса «${base}» нет. Создай его так: class ${base} { … }`), line, 'runtime', 'CS0246');
    const obj = yield* this.instantiate(k, args, line);
    if (init)
      for (const c of named(init)) {
        if (c.type !== 'assignment_expression') continue;
        const fname = c.childForFieldName('left')!.text;
        const v = yield* this.eval(c.childForFieldName('right')!, scope, self, cls);
        const f = obj.fields.get(fname);
        if (f) f.v = coerce(v, f.type);
      }
    return obj;
  }

  *instantiate(k: ClassInfo, args: V[], line: number, host?: unknown): Gen<ObjV> {
    const obj: ObjV = { k: 'obj', cls: k, fields: new Map(), id: objCounter++, host };
    const chain: ClassInfo[] = [];
    for (let c: ClassInfo | undefined = k; c; c = c.base ? this.classes.get(c.base) : undefined) chain.unshift(c);
    for (const c of chain)
      for (const f of c.fields) if (!f.isStatic) obj.fields.set(f.name, { v: f.init ? coerce(yield* this.eval(f.init, new Scope(null), obj, c), f.type) : defaultOf(f.type), type: f.type });
    const ctor = k.ctors.length ? this.pickOverload(k.ctors, args.length) : null;
    if (ctor) yield* this.invokeMethod(ctor, k, obj, args, line);
    else if (args.length) throw new CsError(tr(`The class ${k.name} has no constructor that takes ${args.length} value(s).`, `У класса ${k.name} нет конструктора, который принимает значений: ${args.length}.`), line, 'runtime', 'CS1729');
    return obj;
  }

  // -------------------------------------------------------------------------- built-ins

  private print(text: string): void {
    if (this.output.length >= this.limits.maxOutput) return;
    this.output.push(text);
  }

  private *builtinFree(name: string, args: V[], line: number, self: ObjV | null): Gen<V | typeof NOT_FOUND> {
    const h = this.host.call ? this.host.call(name, args, self, line) : NOT_FOUND;
    if (h !== NOT_FOUND) return h as V;
    switch (name) {
      case 'print':
        this.print(csText(args[0]));
        return undefined;
      case 'nameof':
        return csText(args[0]);
    }
    return NOT_FOUND;
  }

  private rand(): number {
    // Deterministic pseudo-random numbers (so a program behaves the same every run).
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x80000000;
  }

  private *builtinStatic(type: string, name: string, args: V[], line: number): Gen<V | typeof NOT_FOUND> {
    const a = (i: number) => num(args[i], line);
    switch (`${type}.${name}`) {
      case 'Console.WriteLine':
        this.print(args.length ? formatComposite(args) : '');
        return undefined;
      case 'Console.Write':
        if (this.output.length) this.output[this.output.length - 1] += formatComposite(args);
        else this.print(formatComposite(args));
        return undefined;
      case 'Console.ReadLine': {
        const answer = yield { t: 'input', prompt: this.output.at(-1) ?? '' };
        return answer ?? '';
      }
      case 'Console.Clear':
        this.output.length = 0;
        return undefined;
      case 'Debug.Log':
      case 'Debug.LogWarning':
      case 'Debug.LogError':
        this.print(csText(args[0]));
        this.host.log?.(csText(args[0]));
        return undefined;
      case 'Math.Abs':
      case 'Mathf.Abs':
        return Math.abs(a(0));
      case 'Math.Max':
      case 'Mathf.Max':
        return Math.max(...args.map((_, i) => a(i)));
      case 'Math.Min':
      case 'Mathf.Min':
        return Math.min(...args.map((_, i) => a(i)));
      case 'Math.Sqrt':
      case 'Mathf.Sqrt':
        return Math.sqrt(a(0));
      case 'Math.Pow':
      case 'Mathf.Pow':
        return Math.pow(a(0), a(1));
      case 'Math.Round':
      case 'Mathf.Round':
        return roundHalfEven(a(0));
      case 'Mathf.RoundToInt':
        return roundHalfEven(a(0));
      case 'Math.Floor':
      case 'Mathf.Floor':
      case 'Mathf.FloorToInt':
        return Math.floor(a(0));
      case 'Math.Ceiling':
      case 'Mathf.Ceil':
      case 'Mathf.CeilToInt':
        return Math.ceil(a(0));
      case 'Math.Clamp':
      case 'Mathf.Clamp':
        return Math.min(Math.max(a(0), a(1)), a(2));
      case 'Mathf.Clamp01':
        return Math.min(Math.max(a(0), 0), 1);
      case 'Math.Sin':
      case 'Mathf.Sin':
        return Math.sin(a(0));
      case 'Math.Cos':
      case 'Mathf.Cos':
        return Math.cos(a(0));
      case 'Mathf.Lerp': {
        const t = Math.min(Math.max(a(2), 0), 1);
        return a(0) + (a(1) - a(0)) * t;
      }
      case 'Mathf.MoveTowards': {
        const d = a(1) - a(0);
        return Math.abs(d) <= a(2) ? a(1) : a(0) + Math.sign(d) * a(2);
      }
      case 'Mathf.Sign':
        return a(0) >= 0 ? 1 : -1;
      case 'Random.Range': {
        const lo = a(0);
        const hi = a(1);
        const ints = Number.isInteger(lo) && Number.isInteger(hi);
        return ints ? lo + Math.floor(this.rand() * Math.max(0, hi - lo)) : lo + this.rand() * (hi - lo);
      }
      case 'Random.value':
        return this.rand();
      case 'int.Parse':
      case 'Int32.Parse':
      case 'Convert.ToInt32': {
        const s = csText(args[0]).trim();
        if (typeof args[0] === 'number') return Math.round(args[0]);
        if (!/^[-+]?\d+$/.test(s)) throw new CsError(tr(`"${s}" is not a whole number (FormatException). Use int.TryParse to check first.`, `«${s}» — не целое число (FormatException). Чтобы проверить заранее, используй int.TryParse.`), line, 'runtime', 'FormatException');
        return parseInt(s, 10);
      }
      case 'float.Parse':
      case 'double.Parse':
      case 'Convert.ToDouble': {
        const s = csText(args[0]).trim().replace(',', '.');
        if (!/^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(s)) throw new CsError(tr(`"${s}" is not a number (FormatException).`, `«${s}» — не число (FormatException).`), line, 'runtime', 'FormatException');
        return parseFloat(s);
      }
      case 'string.Join':
      case 'String.Join': {
        const sep = csText(args[0]);
        const coll = args[1];
        const items = coll && typeof coll === 'object' && (coll.k === 'list' || coll.k === 'arr') ? coll.items : args.slice(1);
        return items.map((x) => csText(x)).join(sep);
      }
      case 'string.IsNullOrEmpty':
      case 'String.IsNullOrEmpty':
        return args[0] === null || args[0] === '' || args[0] === undefined;
      case 'Vector2.Distance':
      case 'Vector3.Distance': {
        const p = args[0] as VecV;
        const q = args[1] as VecV;
        return Math.fround(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
      }
      case 'Vector2.Lerp':
      case 'Vector3.Lerp': {
        const p = args[0] as VecV;
        const q = args[1] as VecV;
        const t = Math.min(Math.max(a(2), 0), 1);
        return vec(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t, p.dim);
      }
      case 'Vector2.MoveTowards':
      case 'Vector3.MoveTowards': {
        const p = args[0] as VecV;
        const q = args[1] as VecV;
        const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        const s = a(2);
        if (d <= s || d === 0) return q;
        return vec(p.x + ((q.x - p.x) / d) * s, p.y + ((q.y - p.y) / d) * s, p.z + ((q.z - p.z) / d) * s, p.dim);
      }
    }
    return NOT_FOUND;
  }

  private *builtinMethod(target: V, name: string, args: V[], line: number): Gen<V | typeof NOT_FOUND> {
    if (name === 'ToString') {
      if (typeof target === 'number' && args.length) return formatWith(target, csText(args[0]), Number.isInteger(target) ? 'int' : 'double');
      return csText(target);
    }
    if (name === 'Equals') return equalsV(target, args[0]);
    if (typeof target === 'string') {
      const s = target;
      switch (name) {
        case 'ToUpper':
          return s.toUpperCase();
        case 'ToLower':
          return s.toLowerCase();
        case 'Trim':
          return s.trim();
        case 'Contains':
          return s.includes(csText(args[0]));
        case 'StartsWith':
          return s.startsWith(csText(args[0]));
        case 'EndsWith':
          return s.endsWith(csText(args[0]));
        case 'IndexOf':
          return s.indexOf(csText(args[0]));
        case 'Replace':
          return s.split(csText(args[0])).join(csText(args[1]));
        case 'Substring': {
          const st = num(args[0], line);
          const len = args.length > 1 ? num(args[1], line) : s.length - st;
          if (st < 0 || st + len > s.length) throw new CsError(tr('Substring goes past the end of the text (ArgumentOutOfRangeException).', 'Substring выходит за конец текста (ArgumentOutOfRangeException).'), line, 'runtime', 'ArgumentOutOfRangeException');
          return s.substr(st, len);
        }
        case 'Split':
          return { k: 'arr', items: s.split(args.length ? csText(args[0]) : ' '), elem: 'string' };
        case 'PadLeft':
          return s.padStart(num(args[0], line), args[1] ? csText(args[1]) : ' ');
        case 'PadRight':
          return s.padEnd(num(args[0], line), args[1] ? csText(args[1]) : ' ');
      }
    }
    if (typeof target === 'object' && target && (target.k === 'list' || target.k === 'arr')) {
      const items = target.items;
      const fn = args[0] && typeof args[0] === 'object' && args[0].k === 'fn' ? (args[0] as FnV) : null;
      const callP = function* (this: CsProgram, x: V, extra?: V): Gen<V> {
        return yield* this.callFn(fn!, extra === undefined ? [x] : [x, extra], line);
      }.bind(this);
      switch (name) {
        case 'Add':
          if (target.k === 'arr') break;
          items.push(coerce(args[0], target.elem));
          return undefined;
        case 'AddRange':
          if (args[0] && typeof args[0] === 'object' && (args[0].k === 'list' || args[0].k === 'arr')) items.push(...args[0].items);
          return undefined;
        case 'Insert':
          items.splice(num(args[0], line), 0, args[1]);
          return undefined;
        case 'Remove': {
          const i = items.findIndex((x) => equalsV(x, args[0]));
          if (i >= 0) items.splice(i, 1);
          return i >= 0;
        }
        case 'RemoveAt': {
          const i = num(args[0], line);
          if (i < 0 || i >= items.length) throw indexError(i, items.length, line);
          items.splice(i, 1);
          return undefined;
        }
        case 'Clear':
          items.length = 0;
          return undefined;
        case 'Contains':
          return items.some((x) => equalsV(x, args[0]));
        case 'IndexOf':
          return items.findIndex((x) => equalsV(x, args[0]));
        case 'Reverse':
          items.reverse();
          return undefined;
        case 'Sort':
          if (fn) {
            const arr = [...items];
            // Insertion sort so the comparison lambda can be stepped through.
            for (let i = 1; i < arr.length; i++) {
              const x = arr[i];
              let j = i - 1;
              while (j >= 0 && num(yield* callP(arr[j], x), line) > 0) {
                arr[j + 1] = arr[j];
                j--;
              }
              arr[j + 1] = x;
            }
            items.splice(0, items.length, ...arr);
          } else items.sort((p, q) => compare(p, q, line));
          return undefined;
        case 'ForEach':
          for (const x of [...items]) yield* callP(x);
          return undefined;
        case 'Exists':
        case 'Any':
          if (!fn) return items.length > 0;
          for (const x of items) if (truthy(yield* callP(x), line)) return true;
          return false;
        case 'All':
          for (const x of items) if (!truthy(yield* callP(x), line)) return false;
          return true;
        case 'Find':
        case 'FirstOrDefault':
          if (!fn) return items[0] ?? null;
          for (const x of items) if (truthy(yield* callP(x), line)) return x;
          return null;
        case 'First':
          if (!fn) {
            if (!items.length) throw new CsError(tr('The list is empty (InvalidOperationException).', 'Список пуст (InvalidOperationException).'), line, 'runtime', 'InvalidOperationException');
            return items[0];
          }
          for (const x of items) if (truthy(yield* callP(x), line)) return x;
          throw new CsError(tr('No item matches (InvalidOperationException).', 'Ни один элемент не подходит (InvalidOperationException).'), line, 'runtime', 'InvalidOperationException');
        case 'Last':
          return items[items.length - 1] ?? null;
        case 'FindAll':
        case 'Where': {
          const out: V[] = [];
          for (const x of items) if (truthy(yield* callP(x), line)) out.push(x);
          return { k: 'list', items: out, elem: target.elem };
        }
        case 'RemoveAll': {
          const keep: V[] = [];
          let removed = 0;
          for (const x of items) if (truthy(yield* callP(x), line)) removed++;
          else keep.push(x);
          items.splice(0, items.length, ...keep);
          return removed;
        }
        case 'Select': {
          const out: V[] = [];
          for (const x of items) out.push(yield* callP(x));
          return { k: 'list', items: out, elem: 'var' };
        }
        case 'Count':
          if (!fn) return items.length;
          {
            let c = 0;
            for (const x of items) if (truthy(yield* callP(x), line)) c++;
            return c;
          }
        case 'Sum': {
          let s = 0;
          for (const x of items) s += num(fn ? yield* callP(x) : x, line);
          return s;
        }
        case 'Max':
        case 'Min': {
          if (!items.length) throw new CsError(tr('The list is empty (InvalidOperationException).', 'Список пуст (InvalidOperationException).'), line, 'runtime', 'InvalidOperationException');
          const vals: number[] = [];
          for (const x of items) vals.push(num(fn ? yield* callP(x) : x, line));
          return name === 'Max' ? Math.max(...vals) : Math.min(...vals);
        }
        case 'Average': {
          let s = 0;
          for (const x of items) s += num(fn ? yield* callP(x) : x, line);
          return items.length ? s / items.length : 0;
        }
        case 'OrderBy':
        case 'OrderByDescending': {
          const keyed: { x: V; key: V }[] = [];
          for (const x of items) keyed.push({ x, key: fn ? yield* callP(x) : x });
          keyed.sort((p, q) => compare(p.key, q.key, line) * (name === 'OrderBy' ? 1 : -1));
          return { k: 'list', items: keyed.map((e) => e.x), elem: target.elem };
        }
        case 'ToList':
        case 'ToArray':
          return name === 'ToList' ? { k: 'list', items: [...items], elem: target.elem } : { k: 'arr', items: [...items], elem: target.elem };
        case 'Distinct': {
          const out: V[] = [];
          for (const x of items) if (!out.some((y) => equalsV(x, y))) out.push(x);
          return { k: 'list', items: out, elem: target.elem };
        }
      }
    }
    if (typeof target === 'object' && target?.k === 'dict') {
      switch (name) {
        case 'Add':
          if (target.map.has(dictKey(args[0]))) throw new CsError(tr(`The key ${shown(args[0]).text} is already in the dictionary (ArgumentException).`, `Ключ ${shown(args[0]).text} уже есть в словаре (ArgumentException).`), line, 'runtime', 'ArgumentException');
          target.map.set(dictKey(args[0]), { key: args[0], value: args[1] });
          return undefined;
        case 'ContainsKey':
          return target.map.has(dictKey(args[0]));
        case 'Remove':
          return target.map.delete(dictKey(args[0]));
        case 'Clear':
          target.map.clear();
          return undefined;
        case 'ContainsValue':
          return [...target.map.values()].some((e) => equalsV(e.value, args[0]));
      }
    }
    if (typeof target === 'object' && target?.k === 'host' && target.kind === 'Random' && name === 'Next') {
      const lo = args.length > 1 ? num(args[0], line) : 0;
      const hi = num(args[args.length - 1] ?? 2147483647, line);
      return lo + Math.floor(this.rand() * Math.max(0, hi - lo));
    }
    return NOT_FOUND;
  }

  // -------------------------------------------------------------------------- snapshot

  snapshot(): TraceFrame[] {
    return this.stack.map((f) => {
      const vars: { name: string; value: Shown }[] = [];
      const seen = new Set<string>();
      const chain: Scope[] = [];
      for (let s: Scope | null = f.scope; s; s = s.parent) {
        chain.push(s);
        if (s.boundary) break;
      }
      for (const s of chain.reverse())
        for (const [k, c] of s.vars) {
          if (typeof c.v === 'object' && c.v?.k === 'fn') continue;
          if (seen.has(k)) vars.splice(vars.findIndex((x) => x.name === k), 1);
          seen.add(k);
          vars.push({ name: k, value: shown(c.v, c.type) });
        }
      if (f.self) for (const [k, c] of f.self.fields) if (!seen.has(k)) vars.push({ name: `this.${k}`, value: shown(c.v, c.type) });
      return { fn: f.fn, vars };
    });
  }
}

const BUILTIN_TYPES = new Set(['Console', 'Math', 'Mathf', 'Random', 'Debug', 'Vector2', 'Vector3', 'KeyCode', 'int', 'float', 'double', 'string', 'String', 'Int32', 'Convert', 'Color', 'bool', 'char']);

// ---------------------------------------------------------------------------------------------
// Value helpers

function defaultOf(type: string): V {
  if (INT_TYPES.has(type) || FLOAT_TYPES.has(type)) return 0;
  if (type === 'bool') return false;
  if (type === 'char') return '\0';
  if (type === 'Vector2') return vec(0, 0, 0, 2);
  if (type === 'Vector3') return vec(0, 0, 0, 3);
  return null;
}

function kindOf(v: V): string {
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'bool';
  if (v && typeof v === 'object') {
    if (v.k === 'vec') return v.dim === 2 ? 'Vector2' : 'Vector3';
    if (v.k === 'obj') return v.cls.name;
    if (v.k === 'list') return `List<${v.elem}>`;
    if (v.k === 'arr') return `${v.elem}[]`;
  }
  return 'var';
}

function coerce(v: V, type: string): V {
  if (typeof v !== 'number') return v;
  if (INT_TYPES.has(type)) return Math.trunc(v);
  if (type === 'float') return Math.fround(v);
  return v;
}

function castTo(v: V, t: string, line: number): V {
  if (INT_TYPES.has(t)) {
    if (typeof v === 'string' && v.length === 1) return v.charCodeAt(0);
    return Math.trunc(num(v, line));
  }
  if (t === 'float') return Math.fround(num(v, line));
  if (t === 'double' || t === 'decimal') return num(v, line);
  if (t === 'char') return String.fromCharCode(num(v, line));
  return v;
}

function num(v: V, line: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.length === 1) return v.charCodeAt(0);
  if (v === null || v === undefined) throw nullError('', line);
  throw new CsError(tr(`A number was expected here, but it is ${shown(v).text}.`, `Здесь нужно число, а получилось ${shown(v).text}.`), line, 'runtime', 'CS0019');
}

function truthy(v: V, line: number): boolean {
  if (typeof v === 'boolean') return v;
  throw new CsError(tr(`A condition must be true or false, but it is ${shown(v).text}. Did you mean == instead of = ?`, `Условие должно быть true или false, а получилось ${shown(v).text}. Может, нужно == вместо = ?`), line, 'runtime', 'CS0029');
}

function equalsV(a: V, b: V): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    if (a.k === 'enum' && b.k === 'enum') return a.type === b.type && a.name === b.name;
    if (a.k === 'vec' && b.k === 'vec') return Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5 && Math.abs(a.z - b.z) < 1e-5;
  }
  return false;
}

function compare(a: V, b: V, line: number): number {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return num(a, line) - num(b, line);
}

function dictKey(v: V): unknown {
  if (typeof v === 'object' && v) return v.k === 'enum' ? `${v.type}.${v.name}` : v.k === 'obj' ? `obj#${v.id}` : JSON.stringify(v);
  return v;
}

function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function nullError(name: string, line: number): CsError {
  return new CsError(
    tr(`Something is empty (null) here, so ${name ? `"${name}"` : 'it'} cannot be used (NullReferenceException). Make sure the object was created (new …) or assigned before using it.`, `Здесь что-то пустое (null), поэтому ${name ? `«${name}»` : 'это'} нельзя использовать (NullReferenceException). Убедись, что объект создан (new …) или присвоен до использования.`),
    line,
    'runtime',
    'NullReferenceException',
  );
}

function indexError(i: number, len: number, line: number): CsError {
  return new CsError(
    tr(`Item number ${i} does not exist: there are ${len} items, numbered 0 to ${len - 1} (IndexOutOfRangeException).`, `Элемента с номером ${i} нет: элементов ${len}, их номера от 0 до ${len - 1} (IndexOutOfRangeException).`),
    line,
    'runtime',
    'IndexOutOfRangeException',
  );
}

function formatWith(v: V, fmt: string | undefined, kind: string): string {
  if (fmt && typeof v === 'number') {
    const m = /^[FfNn](\d*)$/.exec(fmt);
    if (m) return v.toFixed(m[1] === '' ? 2 : parseInt(m[1], 10));
    const z = /^0(\.0+)?$/.exec(fmt);
    if (z) return v.toFixed(z[1] ? z[1].length - 1 : 0);
    if (/^[Dd](\d+)$/.test(fmt)) return String(Math.trunc(v)).padStart(parseInt(fmt.slice(1), 10), '0');
    if (/^[Pp]\d*$/.test(fmt)) return `${(v * 100).toFixed(fmt.length > 1 ? parseInt(fmt.slice(1), 10) : 2)} %`;
  }
  return csText(v, kind);
}

/** Console.WriteLine("{0} + {1}", a, b) style formatting. */
function formatComposite(args: V[]): string {
  if (args.length > 1 && typeof args[0] === 'string' && /\{\d+/.test(args[0]))
    return args[0].replace(/\{(\d+)(?::([^}]+))?\}/g, (_, i: string, f: string | undefined) => formatWith(args[1 + parseInt(i, 10)], f, ''));
  return csText(args[0]);
}

function short(s: string, max = 60): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

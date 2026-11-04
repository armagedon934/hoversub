// Builds the explanation shown when the user clicks something: a short answer first, then small
// optional blocks. The level (1-5) decides wording and depth. Every statement about this specific
// code comes from analysis facts and carries their confidence; general knowledge comes from the
// offline knowledge base.

import type { Confidence, ElementInfo, Fact, FlowStep } from '../analysis/types';
import { BRACKET_CONSTRUCTS, getConcept, type Concept } from '../knowledge/concepts';
import { OPERATORS } from '../knowledge/keywords';
import { getLanguage } from '../languages/registry';

export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVELS: { level: Level; short: string; name: string }[] = [
  { level: 1, short: 'Like I\'m 5', name: 'Explain like I\'m five' },
  { level: 2, short: 'Beginner', name: 'Complete beginner' },
  { level: 3, short: 'Technical', name: 'Technical explanation' },
  { level: 4, short: 'Deep', name: 'Deep technical analysis' },
  { level: 5, short: 'Teach me', name: 'Teach me to do it myself' },
];

export interface Block {
  id: string;
  heading: string;
  lines: string[];
  facts?: Fact[];
  /** Hidden until the user opens it. */
  collapsed?: boolean;
  /** For exercises: a question with an answer revealed on demand. */
  quiz?: { question: string; answer: string };
}

export interface Explanation {
  title: string;
  conceptTitle: string;
  conceptId: string;
  /** Always-visible short answer (one to three sentences). */
  summary: string;
  blocks: Block[];
  confidence: Confidence;
  example?: Concept['example'];
}

export interface CrossFileInfo {
  definitionsElsewhere: { path: string; line: number; kind: string }[];
  usesElsewhere: { path: string; line: number; role: string }[];
}

const RANK: Record<Confidence, number> = { verified: 3, likely: 2, assumption: 1, unknown: 0 };

export function lowest(facts: Fact[]): Confidence {
  if (!facts.length) return 'verified';
  return facts.reduce<Confidence>((acc, f) => (RANK[f.confidence] < RANK[acc] ? f.confidence : acc), 'verified');
}

export const CONFIDENCE_LABEL: Record<Confidence, { label: string; meaning: string }> = {
  verified: { label: 'Verified', meaning: 'Read directly from the code structure.' },
  likely: { label: 'Likely', meaning: 'Based on names and patterns; very probably right, but not proven.' },
  assumption: { label: 'Assumption', meaning: 'A guess from naming conventions; it may be wrong.' },
  unknown: { label: 'Unknown', meaning: 'Cannot be known without running the program or more context.' },
};

const q = (s: string) => `"${s.length > 40 ? `${s.slice(0, 39)}…` : s}"`;
const lineRef = (n: number) => `line ${n + 1}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function uses(el: ElementInfo) {
  const defStarts = new Set((el.definitions ?? []).map((d) => d.range.start));
  const refs = (el.references ?? []).filter((r) => !defStarts.has(r.range.start));
  const self = el.range.start;
  return {
    reads: refs.filter((r) => r.role === 'read' && r.range.start !== self),
    writes: refs.filter((r) => r.role === 'assignment' && r.range.start !== self),
    calls: refs.filter((r) => r.role === 'call' && r.range.start !== self),
    all: refs.filter((r) => r.role !== 'definition' && r.role !== 'parameter' && r.range.start !== self),
  };
}

function lineList(nums: number[], max = 8): string {
  const u = [...new Set(nums.map((n) => n + 1))].sort((a, b) => a - b);
  return u.length > max ? `${u.slice(0, max).join(', ')} and ${u.length - max} more` : u.join(', ');
}

function linesLabel(nums: number[]): string {
  const l = lineList(nums);
  if (!l) return '';
  return new Set(nums).size === 1 ? `line ${l}` : `lines ${l}`;
}

function flowText(steps: FlowStep[], depth = 0, out: string[] = [], max = 16, counter = { n: 0 }): string[] {
  for (const s of steps) {
    if (out.length >= max) break;
    counter.n++;
    out.push(`${'  '.repeat(depth)}${counter.n}. ${s.text} (line ${s.line})`);
    for (const b of s.branches ?? []) {
      if (out.length >= max) break;
      out.push(`${'  '.repeat(depth + 1)}→ ${b.label}:`);
      flowText(b.steps, depth + 2, out, max, counter);
    }
  }
  return out;
}

/** Sentences about this exact element, phrased for the level. */
function hereLines(el: ElementInfo, level: Level, cross?: CrossFileInfo): { lines: string[]; facts: Fact[] } {
  const facts: Fact[] = [];
  const lines: string[] = [];
  const name = el.symbolName ?? el.text;
  const simple = level <= 2;
  const u = uses(el);
  const def = el.definitions?.[0];
  const where = el.enclosingFunction ? ` inside the function ${q(el.enclosingFunction)}` : '';
  const add = (text: string, confidence: Confidence) => {
    lines.push(text);
    facts.push({ text, confidence });
  };
  const linkConf: Confidence = el.mode === 'syntax-tree' && def && def.scope !== 0 ? 'verified' : 'likely';
  switch (el.kind) {
    case 'variable':
    case 'parameter': {
      const isParam = el.kind === 'parameter' || def?.kind === 'parameter';
      if (isParam) add(simple ? `${q(name)} is an input of the function ${q(def?.container ?? el.enclosingFunction ?? '')}: its value is given by whoever uses the function.` : `${q(name)} is a parameter of ${q(def?.container ?? el.enclosingFunction ?? '?')}; its value comes from each call.`, linkConf);
      else if (def) add(simple ? `The box ${q(name)} is first filled on ${lineRef(def.range.line)}${def.container ? ` (inside ${q(def.container)})` : ''}.` : `${q(name)} is ${def.kind === 'constant' ? 'a constant' : 'a variable'} created on ${lineRef(def.range.line)}${def.container ? ` in ${q(def.container)}` : ' at the top level of the file'}.`, linkConf);
      else add(simple ? `${q(name)} is not created in this file. It probably comes from another file or a library.` : `No definition of ${q(name)} in this file; it is likely imported, global, or built into the language.`, 'likely');
      if (u.writes.length) add(simple ? `Its value is changed on ${plural(u.writes.length, 'line')} (${lineList(u.writes.map((r) => r.range.line))}).` : `Reassigned at ${linesLabel(u.writes.map((r) => r.range.line))}.`, linkConf);
      if (u.reads.length) add(simple ? `Its value is looked at ${plural(u.reads.length, 'time')} (${linesLabel(u.reads.map((r) => r.range.line))}).` : `Read at ${linesLabel(u.reads.map((r) => r.range.line))}.`, linkConf);
      if (!u.reads.length && !u.writes.length && def) add('It is not used anywhere else in this file.', linkConf);
      break;
    }
    case 'function-definition': {
      const f = el.func;
      if (f) {
        add(simple ? `This creates the function ${q(f.name)}${f.container ? `, which belongs to ${q(f.container)}` : ''}. It has ${plural(f.lineCount, 'line')}.` : `Defines ${f.isMethod ? 'method' : 'function'} ${q(f.name)}${f.container ? ` of ${q(f.container)}` : ''} (${plural(f.lineCount, 'line')}).`, 'verified');
        if (f.params.length) add(simple ? `It needs ${plural(f.params.length, 'input')}: ${f.params.map((p) => q(p.name)).join(', ')}.` : `Parameters: ${f.params.map((p) => `${p.name}${p.type ? `: ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`).join(', ')}.`, 'verified');
        else add(simple ? 'It needs no inputs.' : 'No parameters.', 'verified');
        if (f.returns.length) add(simple ? `It gives back: ${f.returns.slice(0, 3).map((r) => q(r)).join(' or ')}.` : `Returns: ${f.returns.map((r) => r).join(' | ')}${f.returnType ? ` (declared type ${f.returnType})` : ''}.`, 'verified');
        else add(simple ? 'It does not give anything back; it just does its steps.' : `No explicit return value${f.returnType ? ` (declared type ${f.returnType})` : ''}.`, 'verified');
        if (f.calls.length) add(simple ? `Inside, it uses these other functions: ${f.calls.slice(0, 6).join(', ')}.` : `Calls: ${f.calls.join(', ')}.`, 'verified');
        if (f.doc) add(`The author's description: "${f.doc.split('\n')[0].slice(0, 160)}"`, 'verified');
      }
      const callers = (el.references ?? []).filter((r) => r.role === 'call');
      if (callers.length) add(simple ? `It is used ${plural(callers.length, 'time')} in this file (${linesLabel(callers.map((r) => r.range.line))}).` : `Called in this file at ${linesLabel(callers.map((r) => r.range.line))}.`, el.mode === 'syntax-tree' ? 'likely' : 'likely');
      else add(simple ? 'It is not used in this file. Another file may use it.' : 'Not called within this file.', 'likely');
      break;
    }
    case 'function-call': {
      if (def) add(simple ? `This uses the function ${q(name)}, which is written on ${lineRef(def.range.line)} of this file.` : `Calls ${q(name)} defined at ${lineRef(def.range.line)}${def.params?.length ? ` (parameters: ${def.params.join(', ')})` : ''}.`, 'likely');
      else if (cross?.definitionsElsewhere.length) add(simple ? `This uses the function ${q(name)}, which is written in ${cross.definitionsElsewhere[0].path}.` : `Calls ${q(name)}, defined in ${cross.definitionsElsewhere.map((d) => `${d.path}:${d.line + 1}`).slice(0, 3).join(', ')}.`, 'likely');
      else add(simple ? `This uses ${q(name)}. It is not written in this project — it probably comes from the language itself or a library.` : `${q(name)} is not defined in this project; it is likely built-in or from a library.`, 'likely');
      if (el.statement) add(simple ? `The whole line is: ${q(el.statement)}` : `Statement: ${el.statement}`, 'verified');
      break;
    }
    case 'class-definition': {
      add(simple ? `This creates the blueprint ${q(name)}.` : `Defines ${q(name)} (${el.nodeType.replace(/_/g, ' ')}).`, 'verified');
      const methods = (el.definitions ?? []).length;
      if (u.all.length) add(simple ? `The name ${q(name)} is used ${plural(u.all.length, 'time')} in this file.` : `Referenced ${plural(u.all.length, 'time')} in this file.`, 'likely');
      void methods;
      break;
    }
    case 'property':
      add(simple ? `${q(name)} is a piece of information (or ability) that belongs to ${q(el.statement?.split('.')[0]?.trim().slice(-30) ?? 'an object')}.` : `Member access of ${q(name)}.`, 'verified');
      if (el.definitions?.length) add(`Something named ${q(name)} is defined on ${lineRef(el.definitions[0].range.line)}.`, 'likely');
      break;
    case 'keyword':
      if (el.keywordMeaning) add(el.keywordMeaning, 'verified');
      else add(simple ? `${q(el.text)} is a special word of ${getLanguage(el.languageId).name}.` : `Reserved word ${q(el.text)} in ${getLanguage(el.languageId).name}.`, 'verified');
      if (el.func) add(simple ? `Here it starts the function ${q(el.func.name)}.` : `It begins the definition of ${q(el.func.name)}.`, 'verified');
      else if (el.context[0]) add(`Here it ${el.context[0]}.`, 'verified');
      break;
    case 'operator': {
      const op = el.operator!;
      const entry = OPERATORS[op.symbol];
      add(entry ? `${q(op.symbol)} (${entry.name}) ${entry.meaning}.` : `${q(op.symbol)} is an operator.`, entry ? 'verified' : 'likely');
      if (op.left || op.right) add(simple ? `Here it works with ${op.left ? q(op.left) : 'nothing'} on the left and ${op.right ? q(op.right) : 'nothing'} on the right.` : `Operands: ${op.left ?? '—'} ${op.symbol} ${op.right ?? '—'}.`, 'verified');
      break;
    }
    case 'bracket': {
      const b = el.bracket!;
      add(BRACKET_CONSTRUCTS[b.construct] ?? 'These brackets group things that belong together.', el.mode === 'syntax-tree' ? 'verified' : 'likely');
      if (b.partner) add(simple ? `Its partner bracket is on ${lineRef(b.partner.line)}. Everything between them is ${b.encloses}.` : `Matching pair: line ${b.openRange.line + 1} to ${b.closeRange ? b.closeRange.line + 1 : '?'}; encloses ${b.encloses}.`, 'verified');
      else add('This bracket has no partner. The code is probably incomplete or broken here.', 'verified');
      break;
    }
    case 'string':
      add(simple ? `This text is used exactly as written: ${q(el.literal?.value ?? el.text)}.` : `String literal ${q(el.literal?.value ?? el.text)}${where}.`, 'verified');
      if (el.statement && el.statement !== el.text) add(simple ? `It is part of: ${q(el.statement)}` : `In statement: ${el.statement}`, 'verified');
      break;
    case 'number':
      add(simple ? `This is the fixed number ${el.text}${where}.` : `Numeric literal ${el.text} (${el.literal?.type})${where}.`, 'verified');
      if (el.statement) add(simple ? `It is part of: ${q(el.statement)}` : `In statement: ${el.statement}`, 'verified');
      break;
    case 'boolean':
    case 'null':
      add(`${q(el.text)} — ${el.literal?.type ?? ''}${where}.`, 'verified');
      if (el.statement) add(`It is part of: ${q(el.statement)}`, 'verified');
      break;
    case 'comment':
      add(simple ? 'The computer skips this. It is a note from the author.' : 'Comment; ignored by the compiler/interpreter.', 'verified');
      break;
    case 'import':
      add(simple ? `${q(name)} is brought in from another file or library here.` : `${q(name)} is imported in this statement: ${el.statement ?? ''}`, 'verified');
      if (u.all.length) add(`It is used ${plural(u.all.length, 'time')} in this file (${linesLabel(u.all.map((r) => r.range.line))}).`, 'likely');
      break;
    case 'json-key':
    case 'setting-key':
    case 'section':
      add(simple ? `${q(name)} is the name of a setting${el.kind === 'section' ? ' group' : ''}.` : `Key ${q(name)}.`, 'verified');
      if (el.statement) add(`The line is: ${q(el.statement)}`, 'verified');
      if (cross?.usesElsewhere.length) add(`The same name appears in ${cross.usesElsewhere.map((x) => x.path).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')}.`, 'likely');
      break;
    case 'tag':
    case 'attribute':
    case 'css-selector':
    case 'css-property':
    case 'css-value':
    case 'heading':
    case 'text':
      if (el.statement) add(simple ? `The line is: ${q(el.statement)}` : `Context: ${el.statement}`, 'verified');
      break;
    default:
      if (el.statement) add(`The line is: ${q(el.statement)}`, 'verified');
  }
  if (el.mode !== 'syntax-tree' && el.facts[0]) lines.push(el.facts[0].text);
  if (cross && (el.kind === 'function-definition' || el.kind === 'class-definition' || el.kind === 'variable') && cross.usesElsewhere.length) {
    const files = [...new Set(cross.usesElsewhere.map((x) => x.path))];
    add(simple ? `The same name also appears in ${files.slice(0, 4).join(', ')}${files.length > 4 ? ` and ${files.length - 4} more` : ''}. It may be the same thing, or a different thing that happens to have the same name.` : `Same name referenced in ${plural(files.length, 'other file')}: ${files.slice(0, 6).join(', ')}.`, 'likely');
  }
  return { lines, facts };
}

function changeLines(el: ElementInfo, concept: Concept, level: Level): string[] {
  const out: string[] = [];
  const name = el.symbolName ?? el.text;
  const u = uses(el);
  if (concept.change) out.push(concept.change);
  switch (el.kind) {
    case 'variable':
    case 'parameter':
      if (u.all.length) out.push(`Specifically: ${plural(u.all.length, 'place')} in this file use ${q(name)} (${linesLabel(u.all.map((r) => r.range.line))}).`);
      break;
    case 'function-definition': {
      const calls = (el.references ?? []).filter((r) => r.role === 'call');
      out.push(calls.length ? `Renaming it means updating ${plural(calls.length, 'call')} in this file (and any in other files).` : 'It is not called in this file; check other files before changing it.');
      break;
    }
    case 'operator': {
      const entry = OPERATORS[el.operator!.symbol];
      if (entry?.alternatives.length) {
        for (const alt of entry.alternatives.slice(0, 2)) {
          const a = OPERATORS[alt];
          out.push(`If ${q(el.operator!.symbol)} became ${q(alt)}${a ? ` (${a.name})` : ''}: ${a ? a.meaning : 'the meaning changes'}${el.operator!.left && el.operator!.right ? ` — so the result would be ${el.operator!.left} ${alt} ${el.operator!.right}` : ''}.`);
        }
      }
      break;
    }
    case 'bracket':
      out.push('Removing just one bracket breaks the code. Brackets must always be added or removed in pairs.');
      break;
    case 'keyword':
      out.push(level <= 2 ? 'Keywords are part of the language\'s grammar. Changing or misspelling one usually makes the code stop working.' : 'Keywords cannot be renamed; replacing one with another changes the structure (and must still be valid syntax).');
      break;
    case 'number':
      if (el.statement) out.push(`For example, it would change the result of: ${q(el.statement)}.`);
      break;
  }
  if (level >= 2 && el.kind !== 'comment') out.push('To try a change safely, use "What if I change this?": it shows a preview, lists what may be affected, and keeps a restore point.');
  return out;
}

function unknownLines(el: ElementInfo): string[] {
  const out: string[] = [];
  if (el.kind === 'variable' || el.kind === 'parameter' || el.kind === 'property') out.push('The actual value while the program runs cannot be known without running it.');
  if (el.kind === 'function-call' || el.kind === 'property') out.push('If several things share this name, or code is created dynamically, the exact target is only known when the program runs.');
  if (el.mode !== 'syntax-tree') out.push('This language is analysed at token level here, so structure (scopes, nesting) is inferred, not parsed.');
  if (!out.length) out.push('Nothing specific — this explanation is based on the visible code.');
  return out;
}

function exercise(el: ElementInfo, concept: Concept): Block[] {
  const name = el.symbolName ?? el.text;
  const u = uses(el);
  const def = el.definitions?.[0];
  const steps: string[] = [concept.levels[4]];
  let quiz: Block['quiz'];
  switch (el.kind) {
    case 'variable':
    case 'parameter':
      steps.push(`1. Press "Go to where it is created"${def ? ` (it jumps to ${lineRef(def.range.line)})` : ''}.`);
      steps.push(`2. Press "Show every use" and look at each highlighted ${q(name)}.`);
      steps.push('3. For each use, say aloud whether the value is read or changed there.');
      steps.push('4. Open "What if I change this?", try a different value in the preview, and read what would be affected. Nothing is changed until you confirm, and Undo always works.');
      quiz = { question: `How many other times is ${q(name)} used in this file?`, answer: `${u.all.length} (${linesLabel(u.all.map((r) => r.range.line)) || '—'}).` };
      break;
    case 'function-definition':
      if (el.func) {
        steps.push(`1. Read the inputs: ${el.func.params.map((p) => p.name).join(', ') || 'none'}.`);
        steps.push('2. Open "Steps" in the diagram panel and follow what happens, top to bottom.');
        steps.push(`3. Find one place where ${q(el.func.name)} is used and imagine the inputs given there.`);
        steps.push('4. Predict the result. You can check your prediction by reading the "return" lines.');
        quiz = { question: `What does ${q(el.func.name)} give back?`, answer: el.func.returns.length ? el.func.returns.join(' or ') : 'Nothing (it has no return value).' };
      }
      break;
    case 'function-call':
      steps.push('1. Press "Go to where it is created" to read the function.');
      steps.push('2. Match each value inside the brackets of this call with the function\'s inputs.');
      steps.push('3. Predict what this call gives back.');
      quiz = { question: 'Where is this function written?', answer: def ? lineRef(def.range.line) : 'Not in this file — it is built-in, from a library, or in another file.' };
      break;
    case 'operator':
      steps.push(`1. Say the line aloud, replacing ${q(el.operator!.symbol)} with its name.`);
      steps.push('2. Choose example values for both sides and work out the result.');
      steps.push('3. Use "What if I change this?" to swap the symbol in a preview, and compare.');
      quiz = { question: `What does ${q(el.operator!.symbol)} mean?`, answer: OPERATORS[el.operator!.symbol]?.meaning ?? 'See the explanation above.' };
      break;
    case 'bracket':
      steps.push('1. Look at the highlighted partner bracket.');
      steps.push('2. Describe in one sentence what is inside the pair.');
      quiz = el.bracket?.partner ? { question: 'On which line is the partner bracket?', answer: lineRef(el.bracket.partner.line) } : undefined;
      break;
    case 'number':
    case 'string':
      steps.push('1. Imagine a different value here.');
      steps.push('2. Use "What if I change this?" to preview the change and see what else might depend on it.');
      steps.push('3. Apply it if you like — then press Undo to restore the original.');
      break;
    default:
      steps.push('Click on nearby words and symbols to see how this part connects to them.');
  }
  return [{ id: 'exercise', heading: 'Your turn', lines: steps, quiz }];
}

export interface ExplainOptions {
  level: Level;
  /** How many times "I don't understand" was pressed (0 = normal). */
  simplerStep?: number;
  showExample?: boolean;
  cross?: CrossFileInfo;
}

export function explain(el: ElementInfo, opts: ExplainOptions): Explanation {
  const concept = getConcept(el.concept);
  const level = opts.level;
  const name = el.symbolName ?? el.text;
  const here = hereLines(el, level, opts.cross);
  const facts = [...el.facts, ...here.facts];
  const title = el.kind === 'comment' || el.kind === 'string' ? concept.title : name.length > 60 ? `${name.slice(0, 59)}…` : name;
  let summary = concept.levels[Math.min(level, 4) - 1];
  if (level === 5) summary = 'Let\'s work it out together, step by step.';
  if (el.kind === 'keyword' && el.keywordMeaning && level <= 3) summary = `${el.keywordMeaning} ${level === 1 ? concept.levels[0] : ''}`.trim();
  const blocks: Block[] = [];
  if (opts.simplerStep && opts.simplerStep > 0) {
    const alt = [...concept.simpler, concept.levels[0]];
    blocks.push({ id: 'simpler', heading: 'Another way to see it', lines: [alt[(opts.simplerStep - 1) % alt.length]] });
  }
  if (opts.showExample) {
    blocks.push({ id: 'example', heading: 'Example', lines: concept.example ? [concept.example.explain] : ['There is no ready-made example for this yet. Look at the line in your own code instead — it is a real example.'] });
  }
  if (level === 5) {
    blocks.push({ id: 'what', heading: `What is ${concept.title.toLowerCase().startsWith('a ') ? '' : 'a '}${concept.title.toLowerCase()}?`, lines: [concept.levels[1]] });
    blocks.push({ id: 'here', heading: 'In this code', lines: here.lines.slice(0, 3), facts: here.facts.slice(0, 3) });
    blocks.push(...exercise(el, concept));
  } else {
    blocks.push({ id: 'here', heading: level <= 2 ? 'Here, in this code' : 'In this code', lines: level === 1 ? here.lines.slice(0, 2) : here.lines, facts: here.facts });
    if (level >= 2 && concept.why) blocks.push({ id: 'why', heading: 'Why is it written like this?', lines: [concept.why], collapsed: level === 2 });
    const ch = changeLines(el, concept, level);
    if (ch.length) blocks.push({ id: 'change', heading: 'What happens if I change it?', lines: level === 1 ? ch.slice(0, 1) : ch, collapsed: level === 1 });
    if (level >= 3 && el.func) {
      const f = el.func;
      blocks.push({
        id: 'function',
        heading: 'Inputs and outputs',
        lines: [
          `Inputs: ${f.params.length ? f.params.map((p) => `${p.name}${p.type ? ` (${p.type})` : ''}${p.defaultValue ? `, default ${p.defaultValue}` : ''}`).join('; ') : 'none'}`,
          `Gives back: ${f.returns.length ? f.returns.join(' | ') : 'nothing'}${f.returnType ? ` — declared type ${f.returnType}` : ''}`,
          `Uses: ${f.calls.length ? f.calls.join(', ') : 'no other functions'}`,
        ],
      });
    }
    if (level >= 3 && el.flow?.length) blocks.push({ id: 'steps', heading: 'Step by step', lines: flowText(el.flow), collapsed: level === 3 });
    if (level >= 3 && (el.references?.length ?? 0) > 0) {
      const refs = el.references!.slice(0, 40);
      blocks.push({ id: 'uses', heading: `Every place it appears (${el.references!.length})`, lines: refs.map((r) => `Line ${r.range.line + 1}: ${r.role === 'call' ? 'used (called)' : r.role === 'assignment' ? 'value stored' : r.role === 'parameter' ? 'input' : r.role === 'definition' ? 'created' : r.role === 'property' ? 'member access' : 'value read'}${r.container ? ` — in ${r.container}` : ''}`), collapsed: true });
    }
    if (level >= 3 && opts.cross && (opts.cross.definitionsElsewhere.length || opts.cross.usesElsewhere.length)) {
      blocks.push({
        id: 'project',
        heading: 'Elsewhere in the project',
        lines: [...opts.cross.definitionsElsewhere.slice(0, 10).map((d) => `Defined in ${d.path}, line ${d.line + 1} (${d.kind})`), ...opts.cross.usesElsewhere.slice(0, 15).map((x) => `Used in ${x.path}, line ${x.line + 1}`)],
        facts: [{ text: 'Linked by name across files.', confidence: 'likely' }],
        collapsed: true,
      });
    }
    if (level >= 4) {
      const lines = [
        `Syntax: ${el.nodeType.replace(/_/g, ' ')} in ${getLanguage(el.languageId).name} (${el.mode === 'syntax-tree' ? 'full syntax tree' : el.mode === 'tokens' ? 'token-level analysis' : 'plain text'}).`,
        concept.levels[3],
      ];
      if (el.literal) lines.push(`Kind of data: ${el.literal.type}.`);
      if (el.enclosingClass) lines.push(`Inside: ${el.enclosingClass}.`);
      if (el.statement) lines.push(`Full statement: ${el.statement}`);
      if (el.symbolKind) lines.push(`Defined as: ${el.symbolKind}${el.definitions?.[0]?.scope ? ' (local to a function)' : el.definitions?.length ? ' (file level)' : ''}${el.definitions?.[0]?.exported ? ', exported to other files' : ''}.`);
      blocks.push({ id: 'deep', heading: 'Technical details', lines });
      if (el.issues.length) blocks.push({ id: 'issues', heading: 'Problems nearby', lines: el.issues.map((i) => `Line ${i.range.line + 1}: ${i.message}`) });
    }
    if (level >= 3) blocks.push({ id: 'unknowns', heading: 'What cannot be known from the code alone', lines: unknownLines(el), collapsed: true });
  }
  return {
    title,
    conceptTitle: concept.title,
    conceptId: concept.id,
    summary,
    blocks,
    confidence: lowest(facts),
    example: opts.showExample ? concept.example : undefined,
  };
}

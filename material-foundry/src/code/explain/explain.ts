// Builds the explanation shown when the user clicks something: a short answer first, then small
// optional blocks. The level (1-5) decides wording and depth. Every statement about this specific
// code comes from analysis facts and carries their confidence; general knowledge comes from the
// offline knowledge base. All sentences exist in English and Russian (tr(en, ru)).

import type { Confidence, ElementInfo, Fact, FlowStep } from '../analysis/types';
import { bracketConstruct, getConcept, type Concept } from '../knowledge/concepts';
import { OPERATORS, operatorText } from '../knowledge/keywords';
import { getLanguage } from '../languages/registry';
import { count, tr } from '../i18n';

export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVELS: { level: Level; short: string; name: string }[] = [
  { level: 1, short: "Like I'm 5", name: "Explain like I'm five" },
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

const q = (s: string) => (tr('"', '«') + (s.length > 40 ? `${s.slice(0, 39)}…` : s) + tr('"', '»'));
const lineRef = (n: number) => tr(`line ${n + 1}`, `строке ${n + 1}`);

const W = {
  line: [['line', 'lines'], ['строка', 'строки', 'строк']],
  time: [['time', 'times'], ['раз', 'раза', 'раз']],
  input: [['input', 'inputs'], ['вход', 'входа', 'входов']],
  place: [['place', 'places'], ['место', 'места', 'мест']],
  call: [['call', 'calls'], ['вызов', 'вызова', 'вызовов']],
  file: [['other file', 'other files'], ['другой файл', 'других файла', 'других файлов']],
} as const;
const n = (k: keyof typeof W, v: number) => count(v, W[k][0] as unknown as [string, string], W[k][1] as unknown as [string, string, string]);

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
  const u = [...new Set(nums.map((x) => x + 1))].sort((a, b) => a - b);
  return u.length > max ? `${u.slice(0, max).join(', ')} ${tr('and', 'и ещё')} ${u.length - max}${tr(' more', '')}` : u.join(', ');
}

function linesLabel(nums: number[]): string {
  const l = lineList(nums);
  if (!l) return '';
  return new Set(nums).size === 1 ? tr(`line ${l}`, `строка ${l}`) : tr(`lines ${l}`, `строки ${l}`);
}

function flowText(steps: FlowStep[], depth = 0, out: string[] = [], max = 16, counter = { n: 0 }): string[] {
  for (const s of steps) {
    if (out.length >= max) break;
    counter.n++;
    out.push(`${'  '.repeat(depth)}${counter.n}. ${s.text} (${tr('line', 'строка')} ${s.line + 1})`);
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
  const where = el.enclosingFunction ? tr(` inside the function ${q(el.enclosingFunction)}`, ` внутри функции ${q(el.enclosingFunction)}`) : '';
  const add = (text: string, confidence: Confidence) => {
    lines.push(text);
    facts.push({ text, confidence });
  };
  const linkConf: Confidence = el.mode === 'syntax-tree' && def && def.scope !== 0 ? 'verified' : 'likely';
  switch (el.kind) {
    case 'variable':
    case 'parameter': {
      const isParam = el.kind === 'parameter' || def?.kind === 'parameter';
      const owner = def?.container ?? el.enclosingFunction ?? '?';
      if (isParam)
        add(
          simple
            ? tr(`${q(name)} is an input of the function ${q(owner)}: its value is given by whoever uses the function.`, `${q(name)} — это вход функции ${q(owner)}: значение даёт тот, кто вызывает функцию.`)
            : tr(`${q(name)} is a parameter of ${q(owner)}; its value comes from each call.`, `${q(name)} — параметр ${q(owner)}; значение приходит из каждого вызова.`),
          linkConf,
        );
      else if (def)
        add(
          simple
            ? tr(`The box ${q(name)} is first filled on ${lineRef(def.range.line)}${def.container ? ` (inside ${q(def.container)})` : ''}.`, `Коробка ${q(name)} впервые заполняется на ${lineRef(def.range.line)}${def.container ? ` (внутри ${q(def.container)})` : ''}.`)
            : tr(
                `${q(name)} is ${def.kind === 'constant' ? 'a constant' : 'a variable'} created on ${lineRef(def.range.line)}${def.container ? ` in ${q(def.container)}` : ' at the top level of the file'}.`,
                `${q(name)} — ${def.kind === 'constant' ? 'константа' : 'переменная'}, созданная на ${lineRef(def.range.line)}${def.container ? ` в ${q(def.container)}` : ' на верхнем уровне файла'}.`,
              ),
          linkConf,
        );
      else
        add(
          simple
            ? tr(`${q(name)} is not created in this file. It probably comes from another file or a library.`, `${q(name)} не создаётся в этом файле. Скорее всего, оно из другого файла или библиотеки.`)
            : tr(`No definition of ${q(name)} in this file; it is likely imported, global, or built into the language.`, `В этом файле нет определения ${q(name)}; вероятно, оно подключено, глобальное или встроено в язык.`),
          'likely',
        );
      if (u.writes.length)
        add(
          simple
            ? tr(`Its value is changed on ${n('line', u.writes.length)} (${lineList(u.writes.map((r) => r.range.line))}).`, `Его значение меняется: ${n('line', u.writes.length)} (${lineList(u.writes.map((r) => r.range.line))}).`)
            : tr(`Reassigned at ${linesLabel(u.writes.map((r) => r.range.line))}.`, `Переприсваивается: ${linesLabel(u.writes.map((r) => r.range.line))}.`),
          linkConf,
        );
      if (u.reads.length)
        add(
          simple
            ? tr(`Its value is looked at ${n('time', u.reads.length)} (${linesLabel(u.reads.map((r) => r.range.line))}).`, `Его значение читается ${n('time', u.reads.length)} (${linesLabel(u.reads.map((r) => r.range.line))}).`)
            : tr(`Read at ${linesLabel(u.reads.map((r) => r.range.line))}.`, `Читается: ${linesLabel(u.reads.map((r) => r.range.line))}.`),
          linkConf,
        );
      if (!u.reads.length && !u.writes.length && def) add(tr('It is not used anywhere else in this file.', 'Больше нигде в этом файле не используется.'), linkConf);
      break;
    }
    case 'function-definition': {
      const f = el.func;
      if (f) {
        add(
          simple
            ? tr(`This creates the function ${q(f.name)}${f.container ? `, which belongs to ${q(f.container)}` : ''}. It has ${n('line', f.lineCount)}.`, `Здесь создаётся функция ${q(f.name)}${f.container ? `, она принадлежит ${q(f.container)}` : ''}. В ней ${n('line', f.lineCount)}.`)
            : tr(`Defines ${f.isMethod ? 'method' : 'function'} ${q(f.name)}${f.container ? ` of ${q(f.container)}` : ''} (${n('line', f.lineCount)}).`, `Определяет ${f.isMethod ? 'метод' : 'функцию'} ${q(f.name)}${f.container ? ` класса ${q(f.container)}` : ''} (${n('line', f.lineCount)}).`),
          'verified',
        );
        if (f.params.length)
          add(
            simple
              ? tr(`It needs ${n('input', f.params.length)}: ${f.params.map((p) => q(p.name)).join(', ')}.`, `Ей нужно ${n('input', f.params.length)}: ${f.params.map((p) => q(p.name)).join(', ')}.`)
              : `${tr('Parameters', 'Параметры')}: ${f.params.map((p) => `${p.name}${p.type ? `: ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`).join(', ')}.`,
            'verified',
          );
        else add(simple ? tr('It needs no inputs.', 'Ей не нужны входные данные.') : tr('No parameters.', 'Параметров нет.'), 'verified');
        if (f.returns.length)
          add(
            simple
              ? `${tr('It gives back', 'Она возвращает')}: ${f.returns
                  .slice(0, 3)
                  .map((r) => q(r))
                  .join(tr(' or ', ' или '))}.`
              : `${tr('Returns', 'Возвращает')}: ${f.returns.join(' | ')}${f.returnType ? ` (${tr('declared type', 'объявленный тип')} ${f.returnType})` : ''}.`,
            'verified',
          );
        else
          add(
            simple
              ? tr('It does not give anything back; it just does its steps.', 'Она ничего не возвращает — просто выполняет свои шаги.')
              : `${tr('No explicit return value', 'Явного возвращаемого значения нет')}${f.returnType ? ` (${tr('declared type', 'объявленный тип')} ${f.returnType})` : ''}.`,
            'verified',
          );
        if (f.calls.length) add(simple ? `${tr('Inside, it uses these other functions', 'Внутри она использует другие функции')}: ${f.calls.slice(0, 6).join(', ')}.` : `${tr('Calls', 'Вызывает')}: ${f.calls.join(', ')}.`, 'verified');
        if (f.doc) add(`${tr("The author's description", 'Описание автора')}: "${f.doc.split('\n')[0].slice(0, 160)}"`, 'verified');
      }
      const callers = (el.references ?? []).filter((r) => r.role === 'call');
      if (callers.length)
        add(
          simple
            ? tr(`It is used ${n('time', callers.length)} in this file (${linesLabel(callers.map((r) => r.range.line))}).`, `В этом файле она используется ${n('time', callers.length)} (${linesLabel(callers.map((r) => r.range.line))}).`)
            : tr(`Called in this file at ${linesLabel(callers.map((r) => r.range.line))}.`, `Вызывается в этом файле: ${linesLabel(callers.map((r) => r.range.line))}.`),
          'likely',
        );
      else add(simple ? tr('It is not used in this file. Another file may use it.', 'В этом файле она не используется. Возможно, её использует другой файл.') : tr('Not called within this file.', 'В этом файле не вызывается.'), 'likely');
      break;
    }
    case 'function-call': {
      if (def)
        add(
          simple
            ? tr(`This uses the function ${q(name)}, which is written on ${lineRef(def.range.line)} of this file.`, `Здесь используется функция ${q(name)}, она написана на ${lineRef(def.range.line)} этого файла.`)
            : tr(`Calls ${q(name)} defined at ${lineRef(def.range.line)}${def.params?.length ? ` (parameters: ${def.params.join(', ')})` : ''}.`, `Вызов ${q(name)}, определённой на ${lineRef(def.range.line)}${def.params?.length ? ` (параметры: ${def.params.join(', ')})` : ''}.`),
          'likely',
        );
      else if (cross?.definitionsElsewhere.length)
        add(
          simple
            ? tr(`This uses the function ${q(name)}, which is written in ${cross.definitionsElsewhere[0].path}.`, `Здесь используется функция ${q(name)}, она написана в файле ${cross.definitionsElsewhere[0].path}.`)
            : `${tr('Calls', 'Вызов')} ${q(name)}, ${tr('defined in', 'определена в')} ${cross.definitionsElsewhere
                .map((d) => `${d.path}:${d.line + 1}`)
                .slice(0, 3)
                .join(', ')}.`,
          'likely',
        );
      else if (!el.libraryMeaning)
        add(
          simple
            ? tr(`This uses ${q(name)}. It is not written in this project — it probably comes from the language itself or a library.`, `Здесь используется ${q(name)}. Оно не написано в этом проекте — скорее всего, это часть языка или библиотеки.`)
            : tr(`${q(name)} is not defined in this project; it is likely built-in or from a library.`, `${q(name)} не определено в проекте; вероятно, встроено в язык или взято из библиотеки.`),
          'likely',
        );
      if (el.statement) add(simple ? `${tr('The whole line is', 'Вся строка')}: ${q(el.statement)}` : `${tr('Statement', 'Инструкция')}: ${el.statement}`, 'verified');
      break;
    }
    case 'class-definition': {
      add(simple ? tr(`This creates the blueprint ${q(name)}.`, `Здесь создаётся чертёж ${q(name)}.`) : tr(`Defines ${q(name)} (${el.nodeType.replace(/_/g, ' ')}).`, `Определяет ${q(name)} (${el.nodeType.replace(/_/g, ' ')}).`), 'verified');
      if (u.all.length) add(tr(`The name ${q(name)} is used ${n('time', u.all.length)} in this file.`, `Имя ${q(name)} используется в этом файле ${n('time', u.all.length)}.`), 'likely');
      break;
    }
    case 'property': {
      const owner = el.statement?.split(/\.|->/)[0]?.trim().slice(-30) ?? tr('an object', 'объекту');
      add(simple ? tr(`${q(name)} is a piece of information (or ability) that belongs to ${q(owner)}.`, `${q(name)} — это данные (или умение), которые принадлежат ${q(owner)}.`) : tr(`Member access of ${q(name)}.`, `Обращение к члену ${q(name)}.`), 'verified');
      if (el.definitions?.length) add(tr(`Something named ${q(name)} is defined on ${lineRef(el.definitions[0].range.line)}.`, `Что-то с именем ${q(name)} определено на ${lineRef(el.definitions[0].range.line)}.`), 'likely');
      break;
    }
    case 'keyword':
      if (el.keywordMeaning) add(el.keywordMeaning, 'verified');
      else add(simple ? tr(`${q(el.text)} is a special word of ${getLanguage(el.languageId).name}.`, `${q(el.text)} — особое слово языка ${getLanguage(el.languageId).name}.`) : tr(`Reserved word ${q(el.text)} in ${getLanguage(el.languageId).name}.`, `Зарезервированное слово ${q(el.text)} в ${getLanguage(el.languageId).name}.`), 'verified');
      if (el.func) add(simple ? tr(`Here it starts the function ${q(el.func.name)}.`, `Здесь оно начинает функцию ${q(el.func.name)}.`) : tr(`It begins the definition of ${q(el.func.name)}.`, `Начинает определение ${q(el.func.name)}.`), 'verified');
      else if (el.context[0]) add(`${tr('Here it', 'Здесь оно')} ${el.context[0]}.`, 'verified');
      break;
    case 'operator': {
      const op = el.operator!;
      const entry = operatorText(op.symbol);
      add(entry ? `${q(op.symbol)} (${entry.name}) ${entry.meaning}.` : tr(`${q(op.symbol)} is an operator.`, `${q(op.symbol)} — оператор.`), entry ? 'verified' : 'likely');
      if (op.left || op.right)
        add(
          simple
            ? tr(`Here it works with ${op.left ? q(op.left) : 'nothing'} on the left and ${op.right ? q(op.right) : 'nothing'} on the right.`, `Здесь слева от него ${op.left ? q(op.left) : 'ничего'}, а справа ${op.right ? q(op.right) : 'ничего'}.`)
            : `${tr('Operands', 'Операнды')}: ${op.left ?? '—'} ${op.symbol} ${op.right ?? '—'}.`,
          'verified',
        );
      break;
    }
    case 'bracket': {
      const b = el.bracket;
      if (!b) {
        add(tr('This is a bracket. Brackets come in pairs and group the things between them.', 'Это скобка. Скобки бывают парами и объединяют то, что между ними.'), 'likely');
        break;
      }
      add(bracketConstruct(b.construct) ?? tr('These brackets group things that belong together.', 'Эти скобки объединяют то, что относится друг к другу.'), el.mode === 'syntax-tree' ? 'verified' : 'likely');
      if (b.partner)
        add(
          simple
            ? tr(`Its partner bracket is on ${lineRef(b.partner.line)}. Everything between them is ${b.encloses}.`, `Парная скобка — на ${lineRef(b.partner.line)}. Всё между ними — ${b.encloses}.`)
            : tr(`Matching pair: line ${b.openRange.line + 1} to ${b.closeRange ? b.closeRange.line + 1 : '?'}; encloses ${b.encloses}.`, `Пара: со строки ${b.openRange.line + 1} по ${b.closeRange ? b.closeRange.line + 1 : '?'}; внутри — ${b.encloses}.`),
          'verified',
        );
      else add(tr('This bracket has no partner. The code is probably incomplete or broken here.', 'У этой скобки нет пары. Скорее всего, код здесь не дописан или сломан.'), 'verified');
      break;
    }
    case 'string':
      add(simple ? tr(`This text is used exactly as written: ${q(el.literal?.value ?? el.text)}.`, `Этот текст используется ровно как написан: ${q(el.literal?.value ?? el.text)}.`) : `${tr('String literal', 'Строковый литерал')} ${q(el.literal?.value ?? el.text)}${where}.`, 'verified');
      if (el.statement && el.statement !== el.text) add(simple ? `${tr('It is part of', 'Это часть')}: ${q(el.statement)}` : `${tr('In statement', 'В инструкции')}: ${el.statement}`, 'verified');
      break;
    case 'number':
      add(simple ? tr(`This is the fixed number ${el.text}${where}.`, `Это постоянное число ${el.text}${where}.`) : `${tr('Numeric literal', 'Числовой литерал')} ${el.text} (${el.literal?.type})${where}.`, 'verified');
      if (el.statement) add(simple ? `${tr('It is part of', 'Это часть')}: ${q(el.statement)}` : `${tr('In statement', 'В инструкции')}: ${el.statement}`, 'verified');
      break;
    case 'boolean':
    case 'null':
      add(`${q(el.text)} — ${el.literal?.type ?? ''}${where}.`, 'verified');
      if (el.statement) add(`${tr('It is part of', 'Это часть')}: ${q(el.statement)}`, 'verified');
      break;
    case 'comment':
      add(simple ? tr('The computer skips this. It is a note from the author.', 'Компьютер это пропускает. Это заметка автора.') : tr('Comment; ignored by the compiler/interpreter.', 'Комментарий; компилятор/интерпретатор его игнорирует.'), 'verified');
      break;
    case 'import':
      add(simple ? tr(`${q(name)} is brought in from another file or library here.`, `${q(name)} подключается здесь из другого файла или библиотеки.`) : `${q(name)} ${tr('is imported in this statement', 'подключается в инструкции')}: ${el.statement ?? ''}`, 'verified');
      if (u.all.length) add(tr(`It is used ${n('time', u.all.length)} in this file (${linesLabel(u.all.map((r) => r.range.line))}).`, `В этом файле используется ${n('time', u.all.length)} (${linesLabel(u.all.map((r) => r.range.line))}).`), 'likely');
      break;
    case 'json-key':
    case 'setting-key':
    case 'section':
      add(simple ? (el.kind === 'section' ? tr(`${q(name)} is the name of a group of settings.`, `${q(name)} — название группы настроек.`) : tr(`${q(name)} is the name of a setting.`, `${q(name)} — название настройки.`)) : `${tr('Key', 'Ключ')} ${q(name)}.`, 'verified');
      if (el.statement) add(`${tr('The line is', 'Строка')}: ${q(el.statement)}`, 'verified');
      if (cross?.usesElsewhere.length)
        add(
          `${tr('The same name appears in', 'То же имя встречается в')} ${cross.usesElsewhere
            .map((x) => x.path)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 3)
            .join(', ')}.`,
          'likely',
        );
      break;
    case 'tag':
    case 'attribute':
    case 'css-selector':
    case 'css-property':
    case 'css-value':
    case 'heading':
    case 'text':
      if (el.statement) add(simple ? `${tr('The line is', 'Строка')}: ${q(el.statement)}` : `${tr('Context', 'Контекст')}: ${el.statement}`, 'verified');
      break;
    default:
      if (el.statement) add(`${tr('The line is', 'Строка')}: ${q(el.statement)}`, 'verified');
  }
  if (el.libraryMeaning) add(el.libraryMeaning, 'likely');
  if (el.mode !== 'syntax-tree' && el.facts[0]) lines.push(el.facts[0].text);
  if (cross && (el.kind === 'function-definition' || el.kind === 'class-definition' || el.kind === 'variable') && cross.usesElsewhere.length) {
    const files = [...new Set(cross.usesElsewhere.map((x) => x.path))];
    const list = `${files.slice(0, 4).join(', ')}${files.length > 4 ? tr(` and ${files.length - 4} more`, ` и ещё ${files.length - 4}`) : ''}`;
    add(
      simple
        ? tr(`The same name also appears in ${list}. It may be the same thing, or a different thing that happens to have the same name.`, `То же имя встречается в ${list}. Это может быть та же вещь, а может быть другая с таким же именем.`)
        : tr(`Same name referenced in ${n('file', files.length)}: ${files.slice(0, 6).join(', ')}.`, `То же имя упоминается в ${n('file', files.length)}: ${files.slice(0, 6).join(', ')}.`),
      'likely',
    );
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
      if (u.all.length) out.push(tr(`Specifically: ${n('place', u.all.length)} in this file use ${q(name)} (${linesLabel(u.all.map((r) => r.range.line))}).`, `Конкретно: ${q(name)} используется в этом файле в ${n('place', u.all.length)} (${linesLabel(u.all.map((r) => r.range.line))}).`));
      break;
    case 'function-definition': {
      const calls = (el.references ?? []).filter((r) => r.role === 'call');
      out.push(
        calls.length
          ? tr(`Renaming it means updating ${n('call', calls.length)} in this file (and any in other files).`, `Переименование потребует обновить ${n('call', calls.length)} в этом файле (и в других файлах, если есть).`)
          : tr('It is not called in this file; check other files before changing it.', 'В этом файле она не вызывается; перед изменением проверь другие файлы.'),
      );
      break;
    }
    case 'operator': {
      const entry = OPERATORS[el.operator!.symbol];
      if (entry?.alternatives.length) {
        for (const alt of entry.alternatives.slice(0, 2)) {
          const a = operatorText(alt);
          const result = el.operator!.left && el.operator!.right ? tr(` — so the result would be ${el.operator!.left} ${alt} ${el.operator!.right}`, ` — то есть получилось бы ${el.operator!.left} ${alt} ${el.operator!.right}`) : '';
          out.push(tr(`If ${q(el.operator!.symbol)} became ${q(alt)}${a ? ` (${a.name})` : ''}: ${a ? a.meaning : 'the meaning changes'}${result}.`, `Если ${q(el.operator!.symbol)} заменить на ${q(alt)}${a ? ` (${a.name})` : ''}: ${a ? a.meaning : 'смысл изменится'}${result}.`));
        }
      }
      break;
    }
    case 'bracket':
      out.push(tr('Removing just one bracket breaks the code. Brackets must always be added or removed in pairs.', 'Если убрать только одну скобку, код сломается. Скобки всегда добавляют и удаляют парами.'));
      break;
    case 'keyword':
      out.push(
        level <= 2
          ? tr("Keywords are part of the language's grammar. Changing or misspelling one usually makes the code stop working.", 'Ключевые слова — часть грамматики языка. Если изменить его или ошибиться в написании, код обычно перестаёт работать.')
          : tr('Keywords cannot be renamed; replacing one with another changes the structure (and must still be valid syntax).', 'Ключевые слова нельзя переименовать; замена одного на другое меняет структуру (и должна оставаться правильной записью).'),
      );
      break;
    case 'number':
      if (el.statement) out.push(tr(`For example, it would change the result of: ${q(el.statement)}.`, `Например, изменится результат: ${q(el.statement)}.`));
      break;
  }
  if (level >= 2 && el.kind !== 'comment') out.push(tr('To try a change safely, use "What if I change this?": it shows a preview, lists what may be affected, and keeps a restore point.', 'Чтобы безопасно попробовать изменение, нажми «А что если изменить?»: будет предпросмотр, список того, что может затронуть, и точка восстановления.'));
  return out;
}

function unknownLines(el: ElementInfo): string[] {
  const out: string[] = [];
  if (el.kind === 'variable' || el.kind === 'parameter' || el.kind === 'property') out.push(tr('The actual value while the program runs cannot be known without running it.', 'Настоящее значение во время работы программы нельзя узнать, не запустив её.'));
  if (el.kind === 'function-call' || el.kind === 'property') out.push(tr('If several things share this name, or code is created dynamically, the exact target is only known when the program runs.', 'Если у нескольких вещей одно имя или код создаётся на лету, точная цель известна только во время работы программы.'));
  if (el.mode !== 'syntax-tree') out.push(tr('This language is analysed at word level here, so structure (scopes, nesting) is inferred, not parsed.', 'Этот язык здесь разбирается по словам, поэтому структура (области видимости, вложенность) угадывается, а не читается точно.'));
  if (!out.length) out.push(tr('Nothing specific — this explanation is based on the visible code.', 'Ничего особенного — объяснение основано на видимом коде.'));
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
      steps.push(tr(`1. Press "Where is it made?"${def ? ` (it jumps to ${lineRef(def.range.line)})` : ''}.`, `1. Нажми «Где это создаётся?»${def ? ` (перейдёт к ${lineRef(def.range.line)})` : ''}.`));
      steps.push(tr(`2. Press "Show every use" and look at each highlighted ${q(name)}.`, `2. Нажми «Где используется?» и посмотри на каждое подсвеченное ${q(name)}.`));
      steps.push(tr('3. For each use, say aloud whether the value is read or changed there.', '3. Для каждого места скажи вслух: значение там читается или меняется?'));
      steps.push(tr('4. Open "What if I change this?", try a different value in the preview, and read what would be affected. Nothing is changed until you confirm, and Undo always works.', '4. Открой «А что если изменить?», попробуй другое значение в предпросмотре и прочитай, что затронет. Ничего не меняется без твоего подтверждения, и отмена работает всегда.'));
      quiz = { question: tr(`How many other times is ${q(name)} used in this file?`, `Сколько ещё раз ${q(name)} используется в этом файле?`), answer: `${u.all.length} (${linesLabel(u.all.map((r) => r.range.line)) || '—'}).` };
      break;
    case 'function-definition':
      if (el.func) {
        steps.push(`${tr('1. Read the inputs', '1. Прочитай входы')}: ${el.func.params.map((p) => p.name).join(', ') || tr('none', 'их нет')}.`);
        steps.push(tr('2. Open "Steps" in the picture panel and press "Show me step by step".', '2. Открой «Шаги» в панели с картинкой и нажми «Покажи по шагам».'));
        steps.push(tr(`3. Find one place where ${q(el.func.name)} is used and imagine the inputs given there.`, `3. Найди место, где используется ${q(el.func.name)}, и представь, какие входы ей там дают.`));
        steps.push(tr('4. Predict the result. You can check your prediction by reading the "return" lines.', '4. Угадай результат. Проверить можно по строкам с «return».'));
        quiz = { question: tr(`What does ${q(el.func.name)} give back?`, `Что возвращает ${q(el.func.name)}?`), answer: el.func.returns.length ? el.func.returns.join(tr(' or ', ' или ')) : tr('Nothing (it has no return value).', 'Ничего (возвращаемого значения нет).') };
      }
      break;
    case 'function-call':
      steps.push(tr('1. Press "Where is it made?" to read the function.', '1. Нажми «Где это создаётся?», чтобы прочитать функцию.'));
      steps.push(tr("2. Match each value inside the brackets of this call with the function's inputs.", '2. Сопоставь каждое значение в скобках этого вызова со входами функции.'));
      steps.push(tr('3. Predict what this call gives back.', '3. Угадай, что вернёт этот вызов.'));
      quiz = { question: tr('Where is this function written?', 'Где написана эта функция?'), answer: def ? lineRef(def.range.line) : tr('Not in this file — it is built-in, from a library, or in another file.', 'Не в этом файле — она встроена в язык, взята из библиотеки или лежит в другом файле.') };
      break;
    case 'operator':
      steps.push(tr(`1. Say the line aloud, replacing ${q(el.operator!.symbol)} with its name.`, `1. Прочитай строку вслух, заменив ${q(el.operator!.symbol)} его названием.`));
      steps.push(tr('2. Choose example values for both sides and work out the result.', '2. Придумай значения для обеих сторон и посчитай результат.'));
      steps.push(tr('3. Use "What if I change this?" to swap the symbol in a preview, and compare.', '3. С помощью «А что если изменить?» замени знак в предпросмотре и сравни.'));
      quiz = { question: tr(`What does ${q(el.operator!.symbol)} mean?`, `Что значит ${q(el.operator!.symbol)}?`), answer: operatorText(el.operator!.symbol)?.meaning ?? tr('See the explanation above.', 'См. объяснение выше.') };
      break;
    case 'bracket':
      steps.push(tr('1. Look at the highlighted partner bracket.', '1. Посмотри на подсвеченную парную скобку.'));
      steps.push(tr('2. Describe in one sentence what is inside the pair.', '2. Опиши одним предложением, что внутри пары.'));
      quiz = el.bracket?.partner ? { question: tr('On which line is the partner bracket?', 'На какой строке парная скобка?'), answer: lineRef(el.bracket.partner.line) } : undefined;
      break;
    case 'number':
    case 'string':
      steps.push(tr('1. Imagine a different value here.', '1. Представь здесь другое значение.'));
      steps.push(tr('2. Use "What if I change this?" to preview the change and see what else might depend on it.', '2. Нажми «А что если изменить?», посмотри предпросмотр и что ещё от этого зависит.'));
      steps.push(tr('3. Apply it if you like — then press Undo to restore the original.', '3. Если хочешь, примени — потом нажми «Отменить», чтобы вернуть как было.'));
      break;
    default:
      steps.push(tr('Click on nearby words and symbols to see how this part connects to them.', 'Нажимай на соседние слова и значки, чтобы увидеть, как эта часть с ними связана.'));
  }
  return [{ id: 'exercise', heading: tr('Your turn', 'Твоя очередь'), lines: steps, quiz }];
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
  if (level === 5) summary = tr("Let's work it out together, step by step.", 'Давай разберёмся вместе, шаг за шагом.');
  if (el.kind === 'keyword' && el.keywordMeaning && level <= 3) summary = `${el.keywordMeaning} ${level === 1 ? concept.levels[0] : ''}`.trim();
  const blocks: Block[] = [];
  if (opts.simplerStep && opts.simplerStep > 0) {
    const alt = [...concept.simpler, concept.levels[0]];
    blocks.push({ id: 'simpler', heading: tr('Another way to see it', 'Можно представить так'), lines: [alt[(opts.simplerStep - 1) % alt.length]] });
  }
  if (opts.showExample) {
    blocks.push({ id: 'example', heading: tr('Example', 'Пример'), lines: concept.example ? [concept.example.explain] : [tr('There is no ready-made example for this yet. Look at the line in your own code instead — it is a real example.', 'Готового примера для этого пока нет. Посмотри на строку в своём коде — это и есть настоящий пример.')] });
  }
  if (level === 5) {
    blocks.push({ id: 'what', heading: tr(`What is ${concept.title.toLowerCase().startsWith('a ') ? '' : 'a '}${concept.title.toLowerCase()}?`, `Что такое «${concept.title.toLowerCase()}»?`), lines: [concept.levels[1]] });
    blocks.push({ id: 'here', heading: tr('In this code', 'В этом коде'), lines: here.lines.slice(0, 3), facts: here.facts.slice(0, 3) });
    blocks.push(...exercise(el, concept));
  } else {
    blocks.push({ id: 'here', heading: level <= 2 ? tr('Here, in this code', 'Здесь, в этом коде') : tr('In this code', 'В этом коде'), lines: level === 1 ? here.lines.slice(0, 2) : here.lines, facts: here.facts });
    if (level >= 2 && concept.why) blocks.push({ id: 'why', heading: tr('Why is it written like this?', 'Зачем это так написано?'), lines: [concept.why], collapsed: level === 2 });
    const ch = changeLines(el, concept, level);
    if (ch.length) blocks.push({ id: 'change', heading: tr('What happens if I change it?', 'Что будет, если это изменить?'), lines: level === 1 ? ch.slice(0, 1) : ch, collapsed: level === 1 });
    if (level >= 3 && el.func) {
      const f = el.func;
      blocks.push({
        id: 'function',
        heading: tr('Inputs and outputs', 'Входы и выходы'),
        lines: [
          `${tr('Inputs', 'Входы')}: ${f.params.length ? f.params.map((p) => `${p.name}${p.type ? ` (${p.type})` : ''}${p.defaultValue ? `, ${tr('default', 'по умолчанию')} ${p.defaultValue}` : ''}`).join('; ') : tr('none', 'нет')}`,
          `${tr('Gives back', 'Возвращает')}: ${f.returns.length ? f.returns.join(' | ') : tr('nothing', 'ничего')}${f.returnType ? ` — ${tr('declared type', 'объявленный тип')} ${f.returnType}` : ''}`,
          `${tr('Uses', 'Использует')}: ${f.calls.length ? f.calls.join(', ') : tr('no other functions', 'другие функции не вызывает')}`,
        ],
      });
    }
    if (level >= 3 && el.flow?.length) blocks.push({ id: 'steps', heading: tr('Step by step', 'Шаг за шагом'), lines: flowText(el.flow), collapsed: level === 3 });
    if (level >= 3 && (el.references?.length ?? 0) > 0) {
      const refs = el.references!.slice(0, 40);
      const role = (r: string) =>
        r === 'call'
          ? tr('used (called)', 'используется (вызов)')
          : r === 'assignment'
            ? tr('value stored', 'сохраняется значение')
            : r === 'parameter'
              ? tr('input', 'вход')
              : r === 'definition'
                ? tr('created', 'создаётся')
                : r === 'property'
                  ? tr('member access', 'обращение к члену')
                  : tr('value read', 'читается значение');
      blocks.push({
        id: 'uses',
        heading: `${tr('Every place it appears', 'Все места, где встречается')} (${el.references!.length})`,
        lines: refs.map((r) => `${tr('Line', 'Строка')} ${r.range.line + 1}: ${role(r.role)}${r.container ? ` — ${tr('in', 'в')} ${r.container}` : ''}`),
        collapsed: true,
      });
    }
    if (level >= 3 && opts.cross && (opts.cross.definitionsElsewhere.length || opts.cross.usesElsewhere.length)) {
      blocks.push({
        id: 'project',
        heading: tr('Elsewhere in the project', 'В других местах проекта'),
        lines: [
          ...opts.cross.definitionsElsewhere.slice(0, 10).map((d) => tr(`Defined in ${d.path}, line ${d.line + 1} (${d.kind})`, `Определено в ${d.path}, строка ${d.line + 1} (${d.kind})`)),
          ...opts.cross.usesElsewhere.slice(0, 15).map((x) => tr(`Used in ${x.path}, line ${x.line + 1}`, `Используется в ${x.path}, строка ${x.line + 1}`)),
        ],
        facts: [{ text: tr('Linked by name across files.', 'Связано между файлами по имени.'), confidence: 'likely' }],
        collapsed: true,
      });
    }
    if (level >= 4) {
      const mode = el.mode === 'syntax-tree' ? tr('full syntax tree', 'полное синтаксическое дерево') : el.mode === 'tokens' ? tr('word-level analysis', 'разбор по словам') : tr('plain text', 'простой текст');
      const lines = [`${tr('Syntax', 'Синтаксис')}: ${el.nodeType.replace(/_/g, ' ')} — ${getLanguage(el.languageId).name} (${mode}).`, concept.levels[3]];
      if (el.literal) lines.push(`${tr('Kind of data', 'Вид данных')}: ${el.literal.type}.`);
      if (el.enclosingClass) lines.push(`${tr('Inside', 'Внутри')}: ${el.enclosingClass}.`);
      if (el.statement) lines.push(`${tr('Full statement', 'Вся инструкция')}: ${el.statement}`);
      if (el.symbolKind)
        lines.push(
          `${tr('Defined as', 'Определено как')}: ${el.symbolKind}${el.definitions?.[0]?.scope ? tr(' (local to a function)', ' (локально в функции)') : el.definitions?.length ? tr(' (file level)', ' (уровень файла)') : ''}${el.definitions?.[0]?.exported ? tr(', exported to other files', ', экспортируется в другие файлы') : ''}.`,
        );
      blocks.push({ id: 'deep', heading: tr('Technical details', 'Технические подробности'), lines });
      if (el.issues.length) blocks.push({ id: 'issues', heading: tr('Problems nearby', 'Проблемы рядом'), lines: el.issues.map((i) => `${tr('Line', 'Строка')} ${i.range.line + 1}: ${i.message}`) });
    }
    if (level >= 3) blocks.push({ id: 'unknowns', heading: tr('What cannot be known from the code alone', 'Что нельзя узнать только из кода'), lines: unknownLines(el), collapsed: true });
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

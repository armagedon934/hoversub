// Runs a C# program with the safe interpreter: first a grammar check (with plain-language
// messages), then step by step with a budget. Input (Console.ReadLine) pauses the run until the
// person types an answer. The recorded steps drive the "watch your code run" view.

import type { Tree } from 'web-tree-sitter';
import { getParser } from '../languages/treesitter';
import { tr } from '../i18n';
import { CsError, CsProgram, type Ev, type Host, type TraceStep } from './csharp';

export interface Problem {
  line: number;
  col: number;
  message: string;
  /** C# error code or exception name, for the error translator. */
  code?: string;
}

export interface RunState {
  status: 'running' | 'input' | 'done' | 'error';
  steps: TraceStep[];
  output: string[];
  error?: Problem & { kind: CsError['kind'] };
  prompt?: string;
  /** Statements executed (all of them, also those not recorded). */
  executed: number;
  traceTruncated: boolean;
}

/** Plain-language grammar problems (missing ; } ) and so on). */
export function syntaxProblems(tree: Tree, source: string): Problem[] {
  const out: Problem[] = [];
  const visit = (n: import('web-tree-sitter').Node) => {
    if (out.length >= 10) return;
    if (n.isMissing) {
      const what = n.type;
      out.push({
        line: n.startPosition.row,
        col: n.startPosition.column,
        message:
          what === ';'
            ? tr('A semicolon ; is missing at the end of this command (CS1002).', 'В конце этой команды не хватает точки с запятой ; (CS1002).')
            : what === '}'
              ? tr('A closing brace } is missing (CS1513). Every { needs its }.', 'Не хватает закрывающей фигурной скобки } (CS1513). У каждой { должна быть своя }.')
              : what === ')'
                ? tr('A closing bracket ) is missing (CS1026).', 'Не хватает закрывающей скобки ) (CS1026).')
                : tr(`"${what}" is missing here.`, `Здесь не хватает «${what}».`),
        code: what === ';' ? 'CS1002' : what === '}' ? 'CS1513' : what === ')' ? 'CS1026' : undefined,
      });
      return;
    }
    if (n.type === 'ERROR') {
      const text = n.text.trim();
      const lineText = source.split('\n')[n.startPosition.row] ?? '';
      let message = tr('The computer cannot understand this part: it does not follow the rules of C# (syntax error).', 'Компьютер не может понять эту часть: она не по правилам C# (синтаксическая ошибка).');
      const lines = source.split('\n');
      let prev = n.startPosition.row - 1;
      while (prev >= 0 && !lines[prev].trim()) prev--;
      const prevText = prev >= 0 ? lines[prev].replace(/\/\/.*$/, '').trim() : '';
      if (prevText && !/[;{}(,[]$|^(\/\/|#|using\b.*;$)/.test(prevText) && /[\w)\]"']$/.test(prevText) && !/^(if|else|for|while|foreach|switch|class|struct|public|private|void|static|namespace)\b.*[^;]$/.test(prevText)) {
        out.push({ line: prev, col: lines[prev].length, message: tr(`A semicolon ; is probably missing at the end of line ${prev + 1} (CS1002).`, `Скорее всего, в конце строки ${prev + 1} не хватает точки с запятой ; (CS1002).`), code: 'CS1002' });
        return;
      }
      if (/^(If|For|While|Else|Return|Int|String|Void|Public|Class|Using)\b/.test(text)) message = tr('C# words are written in small letters: if, for, while, int, void, class…', 'Слова C# пишутся маленькими буквами: if, for, while, int, void, class…');
      else if (/\bif\s*[^(]/.test(lineText) && !/\bif\s*\(/.test(lineText)) message = tr('After "if" the condition must be in round brackets: if (x > 0)', 'После «if» условие пишется в круглых скобках: if (x > 0)');
      else if (/[^=!<>]=[^=]/.test(lineText) && /\bif\s*\(/.test(lineText)) message = tr('In a condition, compare with == (two equal signs), not =.', 'В условии сравнивают через == (два знака равно), а не =.');
      else if (/"[^"]*$/.test(lineText)) message = tr('A text in quotes is not closed: add the closing ".', 'Текст в кавычках не закрыт: добавь закрывающую «"».');
      out.push({ line: n.startPosition.row, col: n.startPosition.column, message });
      return;
    }
    if (!n.hasError) return;
    for (const c of n.children) if (c) visit(c);
  };
  visit(tree.rootNode);
  return out;
}

export async function parseCSharp(source: string): Promise<Tree> {
  const parser = await getParser('c_sharp');
  const tree = parser.parse(source);
  if (!tree) throw new Error('parse failed');
  return tree;
}

export interface StartOptions {
  trace?: boolean;
  maxSteps?: number;
  maxTrace?: number;
  host?: Host;
}

/** A started program that can be resumed after input. */
export class CsRun {
  private gen: Generator<Ev, void, string | undefined>;
  state: RunState = { status: 'running', steps: [], output: [], executed: 0, traceTruncated: false };

  constructor(
    public program: CsProgram,
    private opts: StartOptions,
  ) {
    if (opts.host) program.host = opts.host;
    this.gen = program.main();
  }

  /** Runs until the program ends, needs input, fails or hits the limit. */
  resume(input?: string): RunState {
    const st = this.state;
    const maxSteps = this.opts.maxSteps ?? 200_000;
    const maxTrace = this.opts.maxTrace ?? 3000;
    let send: string | undefined = input;
    if (st.status === 'input' && input !== undefined) {
      this.program.output.push(`> ${input}`);
      if (this.opts.trace && st.steps.length < maxTrace)
        st.steps.push({ line: st.steps.at(-1)?.line ?? 0, kind: 'input', say: tr(`You typed: ${input}`, `Ты ввёл: ${input}`), frames: this.program.snapshot(), output: this.program.output.length });
    }
    st.status = 'running';
    this.program.activate();
    try {
      for (;;) {
        const r = this.gen.next(send);
        send = undefined;
        if (r.done) {
          st.status = 'done';
          break;
        }
        const ev = r.value;
        if (ev.t === 'input') {
          st.status = 'input';
          st.prompt = ev.prompt;
          break;
        }
        st.executed++;
        if (st.executed > maxSteps)
          throw new CsError(
            tr('The program ran too long and was stopped (probably an endless loop).', 'Программа работала слишком долго и была остановлена (скорее всего, бесконечный цикл).'),
            ev.node.startPosition.row,
            'limit',
          );
        if (this.opts.trace) {
          if (st.steps.length < maxTrace) st.steps.push({ line: ev.node.startPosition.row, kind: ev.kind, say: ev.say, frames: this.program.snapshot(), output: this.program.output.length });
          else st.traceTruncated = true;
        }
      }
    } catch (e) {
      st.status = 'error';
      if (e instanceof CsError) st.error = { line: e.line, col: 0, message: e.message, kind: e.kind, code: e.exception };
      else if (e && typeof e === 'object' && 'exception' in e) {
        const ex = e as { exception: string; message: string };
        st.error = { line: st.steps.at(-1)?.line ?? 0, col: 0, message: tr(`An error was thrown and not caught: ${ex.exception} ${ex.message}`, `Возникла и не была поймана ошибка: ${ex.exception} ${ex.message}`), kind: 'runtime', code: ex.exception };
      } else st.error = { line: 0, col: 0, message: String(e instanceof Error ? e.message : e), kind: 'runtime' };
      if (this.opts.trace && st.error) st.steps.push({ line: st.error.line, kind: 'error', say: st.error.message, frames: this.program.snapshot(), output: this.program.output.length });
    }
    st.output = this.program.output;
    return st;
  }
}

/** Parse, check and start a C# program. Grammar problems are returned instead of running. */
export async function startCSharp(source: string, opts: StartOptions = {}): Promise<{ run: CsRun | null; problems: Problem[] }> {
  const tree = await parseCSharp(source);
  const problems = syntaxProblems(tree, source);
  if (problems.length) return { run: null, problems };
  const program = new CsProgram(tree, source);
  return { run: new CsRun(program, opts), problems: [] };
}

/** Convenience for tests and simple programs: run to the end with the given input lines. */
export async function runCSharp(source: string, input: string[] = [], opts: StartOptions = {}): Promise<RunState & { problems: Problem[] }> {
  const { run, problems } = await startCSharp(source, opts);
  if (!run) return { status: 'error', steps: [], output: [], executed: 0, traceTruncated: false, problems, error: problems[0] ? { ...problems[0], kind: 'compile' } : undefined };
  let st = run.resume();
  let i = 0;
  while (st.status === 'input') st = run.resume(input[i++] ?? '');
  return { ...st, problems: [] };
}

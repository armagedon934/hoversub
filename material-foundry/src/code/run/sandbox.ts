// One door for running a learner's program safely, whatever the language:
//  • C#      — our own step-by-step interpreter (no real .NET, nothing outside the program is reachable);
//  • Python  — real CPython (Pyodide, WebAssembly) in a worker without network functions;
//  • JS      — a separate worker without network or storage functions, stopped after a few seconds.
// Code only runs when the person presses "Run". Results come back in one shape, with a plain-language
// explanation of any error.
import { tr } from '../i18n';
import type { Shown, TraceFrame, TraceStep } from './csharp';
import { explainError, type ErrorInfo } from './errors';
import { ensureMainThreadTreeSitter } from './mainThread';
import { startCSharp, type CsRun, type RunState } from './runner';

export type RunLang = 'cs' | 'py' | 'js';

export interface RunError {
  /** Zero-based line, or -1 when unknown. */
  line: number;
  message: string;
  type: string;
  info: ErrorInfo | null;
}

export interface SandboxResult {
  status: 'done' | 'error' | 'input';
  output: string[];
  steps: TraceStep[];
  error?: RunError;
  /** The question the program asks when status is "input". */
  prompt?: string;
  truncated: boolean;
  /** True when the language gives only output (no step-by-step recording). */
  outputOnly?: boolean;
}

export const RUNNABLE: Record<string, RunLang> = { csharp: 'cs', cs: 'cs', python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'js' };

function withInfo(type: string, message: string, line: number): RunError {
  return { type, message, line, info: explainError(`${type} ${message}`) ?? explainError(type) };
}

// ------------------------------------------------------------------------------------------- C#
/** A C# run that can stop and wait for Console.ReadLine() answers. */
export class CSharpSession {
  private constructor(private run: CsRun | null, private first: SandboxResult | null) {}

  static async start(source: string, trace = true): Promise<CSharpSession> {
    if (typeof document !== 'undefined') ensureMainThreadTreeSitter();
    const { run, problems } = await startCSharp(source, { trace, maxTrace: 3000 });
    if (!run) {
      const p = problems[0];
      return new CSharpSession(null, {
        status: 'error',
        output: [],
        steps: [],
        truncated: false,
        error: { line: p?.line ?? -1, message: problems.map((x) => x.message).join('\n'), type: 'compile', info: explainError(p?.message ?? '') },
      });
    }
    return new CSharpSession(run, null);
  }

  /** Runs until the end, an error, or the next question. */
  resume(input?: string): SandboxResult {
    if (this.first) return this.first;
    const s = this.run!.resume(input);
    return csResult(s);
  }
}

function csResult(s: RunState): SandboxResult {
  const err = s.error;
  return {
    status: s.status === 'running' ? 'done' : s.status,
    output: s.output,
    steps: s.steps,
    prompt: s.prompt,
    truncated: s.traceTruncated,
    error: err ? { line: err.line, message: err.message, type: err.kind, info: explainError(err.message) } : undefined,
  };
}

// --------------------------------------------------------------------------------------- Python
interface PyStep {
  line: number;
  kind: 'line' | 'call' | 'return';
  fn: string;
  ret: string | null;
  frames: TraceFrame[];
  output: number;
}
interface PyResult {
  output: string[];
  steps: PyStep[];
  error: { type: string; line: number; message: string } | null;
  truncated: boolean;
}

let pyWorker: Worker | null = null;
let pyReady = false;
let pyId = 0;

export function pythonLoaded(): boolean {
  return pyReady;
}

function pyBase(): string {
  return new URL('pyodide/', document.baseURI).href;
}

function newPyWorker(): Worker {
  return new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
}

/** Turns Python's raw line records into the same narrated steps the C# runner gives. */
export function narratePython(steps: PyStep[], source: string): TraceStep[] {
  const lines = source.split('\n');
  const out: TraceStep[] = [];
  for (const s of steps) {
    if (s.fn === '<module>' && s.kind !== 'line') continue;
    const code = (lines[s.line] ?? '').trim();
    let say: string;
    if (s.kind === 'call') say = tr(`Jump into the function ${s.fn}().`, `Прыжок в функцию ${s.fn}().`);
    else if (s.kind === 'return') say = tr(`${s.fn}() is finished and gives back ${s.ret}.`, `${s.fn}() закончила и возвращает ${s.ret}.`);
    else say = pyLineSay(code, s.line);
    out.push({ line: s.line, kind: s.kind === 'line' ? lineKind(code) : s.kind, say, frames: s.frames, output: s.output });
  }
  return out;
}

function lineKind(code: string): TraceStep['kind'] {
  if (/^(if|elif|else)\b/.test(code)) return 'check';
  if (/^(for|while)\b/.test(code)) return 'loop';
  if (/^print\(/.test(code)) return 'output';
  if (/\binput\(/.test(code)) return 'input';
  return 'line';
}

function pyLineSay(code: string, line: number): string {
  const n = line + 1;
  let m: RegExpExecArray | null;
  if ((m = /^(if|elif)\s+(.+):$/.exec(code))) return tr(`Line ${n}: check whether ${m[2]} is true.`, `Строка ${n}: проверяем, верно ли ${m[2]}.`);
  if (/^else\s*:/.test(code)) return tr(`Line ${n}: nothing above was true, so the "else" part runs.`, `Строка ${n}: ничего выше не подошло — выполняется часть «else».`);
  if ((m = /^for\s+(.+?)\s+in\s+(.+):$/.exec(code))) return tr(`Line ${n}: the loop takes the next ${m[1]} from ${m[2]}.`, `Строка ${n}: цикл берёт следующее ${m[1]} из ${m[2]}.`);
  if ((m = /^while\s+(.+):$/.exec(code))) return tr(`Line ${n}: repeat while ${m[1]} is true.`, `Строка ${n}: повторяем, пока ${m[1]} верно.`);
  if ((m = /^print\((.*)\)$/.exec(code))) return tr(`Line ${n}: print ${m[1]} on the screen.`, `Строка ${n}: выводим на экран ${m[1]}.`);
  if ((m = /^def\s+(\w+)/.exec(code))) return tr(`Line ${n}: remember the function ${m[1]}() for later.`, `Строка ${n}: запоминаем функцию ${m[1]}() на потом.`);
  if ((m = /^class\s+(\w+)/.exec(code))) return tr(`Line ${n}: describe the class ${m[1]}.`, `Строка ${n}: описываем класс ${m[1]}.`);
  if ((m = /^return\s*(.*)$/.exec(code))) return tr(`Line ${n}: give back ${m[1] || 'nothing'}.`, `Строка ${n}: возвращаем ${m[1] || 'ничего'}.`);
  if ((m = /^(import|from)\s/.exec(code))) return tr(`Line ${n}: connect a library.`, `Строка ${n}: подключаем библиотеку.`);
  if ((m = /^([\w.[\]]+)\s*([+\-*/]?=)\s*(.+)$/.exec(code)) && m[2] !== '==') {
    if (/\binput\(/.test(m[3])) return tr(`Line ${n}: ask the person and put the answer into ${m[1]}.`, `Строка ${n}: спрашиваем человека и кладём ответ в ${m[1]}.`);
    return m[2] === '='
      ? tr(`Line ${n}: put ${m[3]} into ${m[1]}.`, `Строка ${n}: кладём ${m[3]} в ${m[1]}.`)
      : tr(`Line ${n}: change ${m[1]} (${m[2]} ${m[3]}).`, `Строка ${n}: меняем ${m[1]} (${m[2]} ${m[3]}).`);
  }
  if (code === 'break') return tr(`Line ${n}: leave the loop.`, `Строка ${n}: выходим из цикла.`);
  if (code === 'continue') return tr(`Line ${n}: skip to the next round of the loop.`, `Строка ${n}: переходим к следующему кругу цикла.`);
  return tr(`Line ${n}: ${code}`, `Строка ${n}: ${code}`);
}

const PY_LOAD_MS = 120_000;
const PY_RUN_MS = 15_000;

/** Runs Python. The first run loads Python itself (~12 MB from this app's own files) once. */
export function runPython(source: string, inputs: string[], trace = true, onLoading?: () => void): Promise<SandboxResult> {
  const first = !pyReady;
  if (first) onLoading?.();
  pyWorker ??= newPyWorker();
  const w = pyWorker;
  const id = ++pyId;
  return new Promise((resolve) => {
    const stop = (error: RunError) => {
      w.terminate();
      if (pyWorker === w) {
        pyWorker = null;
        pyReady = false;
      }
      resolve({ status: 'error', output: [], steps: [], truncated: false, error });
    };
    const timer = setTimeout(
      () =>
        stop(
          first
            ? { type: 'Load', line: -1, message: tr('Python did not start in time. Try again.', 'Python не успел запуститься. Попробуй ещё раз.'), info: null }
            : withInfo('EndlessLoop', tr('The program ran too long (over 15 seconds) and was stopped. Probably an endless loop.', 'Программа работала слишком долго (больше 15 секунд) и была остановлена. Скорее всего, бесконечный цикл.'), -1),
        ),
      first ? PY_LOAD_MS + PY_RUN_MS : PY_RUN_MS,
    );
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: PyResult; error?: string }>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      if (!e.data.ok || !e.data.result) {
        stop({ type: 'Load', line: -1, message: tr('Python could not start: ', 'Python не смог запуститься: ') + (e.data.error ?? ''), info: null });
        return;
      }
      pyReady = true;
      resolve(pyResult(e.data.result, source));
    };
    w.onerror = () => {
      clearTimeout(timer);
      stop({ type: 'Load', line: -1, message: tr('Python could not start.', 'Python не смог запуститься.'), info: null });
    };
    w.postMessage({ id, base: pyBase(), code: source, inputs, trace });
  });
}

export function pyResult(r: PyResult, source: string): SandboxResult {
  const steps = narratePython(r.steps, source);
  const base = { output: r.output, steps, truncated: r.truncated };
  if (!r.error) return { ...base, status: 'done' };
  if (r.error.type === 'NeedInput') return { ...base, output: r.output, status: 'input', prompt: r.error.message };
  if (r.error.type === 'Limit')
    return {
      ...base,
      status: 'error',
      error: withInfo('EndlessLoop', tr('Over 200 000 lines were executed — probably an endless loop. The program was stopped.', 'Выполнено больше 200 000 строк — скорее всего, бесконечный цикл. Программа остановлена.'), -1),
    };
  return { ...base, status: 'error', error: withInfo(r.error.type, r.error.message, r.error.line) };
}

// ----------------------------------------------------------------------------------- JavaScript
const JS_RUN_MS = 4000;

export function runJs(source: string, inputs: string[]): Promise<SandboxResult> {
  const w = new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve) => {
    const done = (r: SandboxResult) => {
      clearTimeout(timer);
      w.terminate();
      resolve(r);
    };
    const timer = setTimeout(
      () => done({ status: 'error', output: [], steps: [], truncated: false, outputOnly: true, error: withInfo('EndlessLoop', tr('The program ran too long (over 4 seconds) and was stopped. Probably an endless loop.', 'Программа работала слишком долго (больше 4 секунд) и была остановлена. Скорее всего, бесконечный цикл.'), -1) }),
      JS_RUN_MS,
    );
    w.onmessage = (e: MessageEvent<{ output: string[]; error: { type: string; message: string; line: number } | null; needInput?: string }>) => {
      const d = e.data;
      if (d.needInput !== undefined) return done({ status: 'input', prompt: d.needInput, output: d.output, steps: [], truncated: false, outputOnly: true });
      done({ status: d.error ? 'error' : 'done', output: d.output, steps: [], truncated: false, outputOnly: true, error: d.error ? withInfo(d.error.type, d.error.message, d.error.line) : undefined });
    };
    w.onerror = (e) => {
      e.preventDefault();
      done({ status: 'error', output: [], steps: [], truncated: false, outputOnly: true, error: withInfo('SyntaxError', e.message, -1) });
    };
    w.postMessage({ code: source, inputs });
  });
}

/** Short text for a value box (used by the step viewer). */
export function shownText(v: Shown): string {
  return v.text;
}

// "Workshop" — write your own code with three layers of help:
//  1. suggestions while typing (with an explanation of every word),
//  2. "what comes next" — grey ghost text from the usual shape of programs (Tab accepts),
//  3. a live explanation of the word under the cursor, and friendly checks with one-click fixes.
// Plus "I want…" ready-made recipes, and a safe Run with a step-by-step replay of real values.
// Code runs ONLY when the person presses Run, and only inside the sandbox.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Download, FilePlus2, FolderOpen, Gamepad2, Info, Lightbulb, ListChecks, Play, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { pick, tr } from '../i18n';
import { explain, type Explanation } from '../explain/explain';
import { aiExplain, aiFix, aiNextCode, useAi } from '../ai/localAi';
import { errorText } from '../run/errors';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { parseCSharp, syntaxProblems } from '../run/runner';
import { CSharpSession, pythonLoaded, runJs, runPython, type SandboxResult } from '../run/sandbox';
import { getCodeClient } from '../worker/client';
import { useCode } from '../ui/store';
import { EditorView } from '@codemirror/view';
import { createEditor, insertPrediction, showAiGhost, type LiveProblem, type WorkshopEditor } from './editor';
import type { Prediction } from './predict';
import { RECIPES, recipeFileName, recipeLineNotes, recipeWithComments, searchRecipes, type Recipe } from './recipes';
import { EXT, langOfName, template, useWorkshop, type WsFile } from './store';
import { TraceView } from './TraceView';
import { useNotebook } from '../memory/notebook';
import { ReaderModal } from '../learn/CodeReader';

const LANG_LABEL: Record<WsFile['lang'], string> = { cs: 'C#', py: 'Python', js: 'JavaScript', cpp: 'C++', c: 'C' };
const LANGUAGE_ID: Record<WsFile['lang'], string> = { cs: 'csharp', py: 'python', js: 'javascript', cpp: 'cpp', c: 'c' };

type Side = 'help' | 'recipes' | 'result';

function isUnity(text: string): boolean {
  return /:\s*MonoBehaviour\b/.test(text);
}

async function syntaxCheck(file: WsFile, text: string) {
  if (file.lang === 'cs') {
    ensureMainThreadTreeSitter();
    const tree = await parseCSharp(text);
    return syntaxProblems(tree, text).map((p) => ({ line: p.line, col: p.col, message: p.message }));
  }
  const r = await getCodeClient().check(`workshop/${file.name}`, text);
  return r.issues.map((i) => ({ line: i.range.line, col: i.range.col, endCol: i.range.endLine === i.range.line ? i.range.col + (i.range.end - i.range.start) : undefined, message: i.message }));
}

// ------------------------------------------------------------------------------------- pieces

function NewFileMenu({ onPick, onClose }: { onPick: (k: Parameters<typeof template>[0]) => void; onClose: () => void }) {
  const items: [Parameters<typeof template>[0], string, string][] = [
    ['unity', '🎮', tr('Unity script (C#)', 'Скрипт Unity (C#)')],
    ['cs', '💻', tr('C# console program', 'Консольная программа C#')],
    ['py', '🐍', 'Python'],
    ['js', '🟨', 'JavaScript'],
    ['cpp', '⚙️', 'C++'],
    ['c', '🔧', 'C'],
  ];
  return (
    <div className="popover ws-menu" role="menu" data-testid="ws-new-menu">
      {items.map(([k, icon, label]) => (
        <button
          key={k}
          role="menuitem"
          className="ws-menu-item"
          onClick={() => {
            onPick(k);
            onClose();
          }}
          data-testid={`ws-new-${k}`}
        >
          <span aria-hidden>{icon}</span> {label}
        </button>
      ))}
    </div>
  );
}

function ProblemsList({ problems, onGo, onFix }: { problems: LiveProblem[]; onGo: (line: number, col: number) => void; onFix: (p: LiveProblem) => void }) {
  if (!problems.length)
    return (
      <p className="ws-ok" data-testid="ws-no-problems">
        <Check size={16} aria-hidden /> {tr('No problems found.', 'Проблем не найдено.')}
      </p>
    );
  return (
    <ul className="ws-problems" data-testid="ws-problems">
      {problems.slice(0, 12).map((p, i) => (
        <li key={i} className={`sev-${p.severity}`}>
          <button className="link ws-prob-line" onClick={() => onGo(p.line, p.col)}>
            {tr('line', 'строка')} {p.line + 1}
          </button>
          <span>{p.message}</span>
          {p.fix ? (
            <button className="btn small primary" onClick={() => onFix(p)} data-testid="ws-fix">
              <Wand2 size={13} /> {p.fix.label}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RecipeCard({ r, onInsert, onNewFile }: { r: Recipe; onInsert: (code: string) => void; onNewFile: (r: Recipe, code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [comments, setComments] = useState(true);
  const notes = useMemo(() => recipeLineNotes(r), [r]);
  const code = comments ? recipeWithComments(r) : r.code;
  return (
    <div className={`ws-recipe${open ? ' open' : ''}`} data-testid="ws-recipe">
      <button className="ws-recipe-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pill">{r.kind === 'unity' ? 'Unity' : r.kind === 'unreal' ? 'Unreal' : LANG_LABEL[r.lang]}</span>
        <b>{pick(r.title)}</b>
      </button>
      {open ? (
        <div className="ws-recipe-body">
          <p>{pick(r.about)}</p>
          {r.setup?.length ? (
            <div className="ws-setup">
              <b>{tr('In the editor:', 'В редакторе движка:')}</b>
              <ol>
                {r.setup.map((s, i) => (
                  <li key={i}>{pick(s)}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="ws-recipe-code">
            {r.code.split('\n').map((l, i) => (
              <div key={i} className={notes[i] ? 'has-note' : ''}>
                <code>{l || ' '}</code>
                {notes[i] ? <span className="ws-note">{notes[i]}</span> : null}
              </div>
            ))}
          </div>
          <button className="btn small" onClick={() => setReading(true)} data-testid="ws-recipe-read">
            📖 {tr('Read it simply, 5 lines at a time', 'Читать по-простому, по 5 строк')}
          </button>
          {reading ? <ReaderModal code={r.code} title={pick(r.title)} onClose={() => setReading(false)} /> : null}
          <label className="ws-check">
            <input type="checkbox" checked={comments} onChange={(e) => setComments(e.target.checked)} /> {tr('Insert with explanations as comments', 'Вставить с пояснениями в комментариях')}
          </label>
          <div className="ws-row">
            {r.kind === 'unity' || r.kind === 'unreal' || r.kind === 'console' || r.kind === 'program' ? (
              <button className="btn primary" onClick={() => onNewFile(r, code)} data-testid="ws-recipe-newfile">
                <FilePlus2 size={15} /> {tr(`New file ${recipeFileName(r)}`, `Новый файл ${recipeFileName(r)}`)}
              </button>
            ) : null}
            <button className="btn" onClick={() => onInsert(code)} data-testid="ws-recipe-insert">
              {tr('Insert at the cursor', 'Вставить в место курсора')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultPanel({ file, result, running, loadingPy, onAnswer, onGo, onUnity, onAiFix, aiFixText }: { file: WsFile; result: SandboxResult | null; running: boolean; loadingPy: boolean; onAnswer: (s: string) => void; onGo: (line: number, focus?: boolean) => void; onUnity: () => void; onAiFix: () => void; aiFixText: string | null }) {
  const [answer, setAnswer] = useState('');
  const [trace, setTrace] = useState(false);
  const aiOn = useAi((s) => s.enabled);
  useEffect(() => setTrace(false), [result]);
  if (file.lang === 'c' || file.lang === 'cpp')
    return (
      <div className="ws-result" data-testid="ws-result">
        <p className="ws-honest">
          <Info size={16} aria-hidden /> {tr('C and C++ cannot run here: they need a real compiler (Visual Studio, g++, clang). Live checks and explanations still work.', 'C и C++ здесь не запускаются: им нужен настоящий компилятор (Visual Studio, g++, clang). Проверки и объяснения при этом работают.')}
        </p>
        <p className="muted small">{tr('To run: install Visual Studio Community (Windows) or g++, then: g++ main.cpp -o main && ./main', 'Чтобы запустить: установи Visual Studio Community (Windows) или g++, затем: g++ main.cpp -o main && ./main')}</p>
      </div>
    );
  if (running)
    return (
      <div className="ws-result" data-testid="ws-result">
        <p className="ws-running">
          <span className="spinner" aria-hidden /> {loadingPy ? tr('Starting Python for the first time (about 10 seconds, only once)…', 'Запускаю Python в первый раз (около 10 секунд, только один раз)…') : tr('Running…', 'Выполняется…')}
        </p>
      </div>
    );
  if (!result)
    return (
      <div className="ws-result" data-testid="ws-result">
        <p className="muted">{tr('Press "Run" (or Ctrl+Enter). The program runs safely inside this app: it cannot touch your files or the internet.', 'Нажми «Запустить» (или Ctrl+Enter). Программа выполняется безопасно внутри этой программы: она не может трогать твои файлы и интернет.')}</p>
        {isUnity(file.text) ? (
          <button className="btn primary" onClick={onUnity}>
            <Gamepad2 size={15} /> {tr('This is a Unity script — play it in Mini-Unity', 'Это скрипт Unity — запустить в Мини-Unity')}
          </button>
        ) : null}
      </div>
    );
  const err = result.error;
  const info = err?.info ? errorText(err.info) : null;
  return (
    <div className="ws-result" data-testid="ws-result">
      <div className={`ws-status st-${result.status}`} data-testid="ws-status">
        {result.status === 'done' ? tr('✅ Finished', '✅ Готово') : result.status === 'input' ? tr('⌨ The program asks you something', '⌨ Программа тебя спрашивает') : tr('⚠ Stopped with an error', '⚠ Остановилась из-за ошибки')}
      </div>
      <h4>{tr('Screen (what the program printed)', 'Экран (что программа вывела)')}</h4>
      <pre className="ws-screen big" data-testid="ws-output">
        {result.output.length ? result.output.join('\n') : <span className="muted">{tr('(nothing printed)', '(ничего не выведено)')}</span>}
      </pre>
      {result.status === 'input' ? (
        <form
          className="ws-answer"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(answer);
            setAnswer('');
          }}
        >
          <label>
            {result.prompt ? <b>{result.prompt}</b> : tr('Type the answer:', 'Напиши ответ:')}
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} data-testid="ws-answer" placeholder={tr('your answer + Enter', 'твой ответ + Enter')} />
          </label>
          <button className="btn primary" type="submit">
            {tr('Send', 'Отправить')}
          </button>
        </form>
      ) : null}
      {err ? (
        <div className="ws-errcard" data-testid="ws-error">
          <div className="ws-err-title">
            <AlertTriangle size={16} aria-hidden /> {info?.title ?? tr('Error', 'Ошибка')}
            {err.line >= 0 ? (
              <button className="link" onClick={() => onGo(err.line)}>
                {tr('line', 'строка')} {err.line + 1}
              </button>
            ) : null}
          </div>
          <p className="ws-err-msg">{err.message}</p>
          {info ? (
            <>
              <p>
                <b>{tr('What it means:', 'Что это значит:')}</b> {info.meaning}
              </p>
              <p>
                <b>{tr('How to fix:', 'Как исправить:')}</b> {info.fix}
              </p>
            </>
          ) : null}
          {aiOn ? (
            <button className="btn small" onClick={onAiFix} data-testid="ws-ai-fix">
              <Bot size={13} /> {tr('Ask the local AI for a fix', 'Спросить у локального ИИ, как исправить')}
            </button>
          ) : null}
          {aiFixText ? (
            <div className="ws-ai-answer">
              <span className="pill">{tr('AI guess — may be wrong', 'Догадка ИИ — может ошибаться')}</span>
              <pre>{aiFixText}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      {result.steps.length ? (
        <div className="ws-row">
          <button className="btn primary" onClick={() => setTrace((t) => !t)} data-testid="ws-show-steps">
            <ListChecks size={15} /> {trace ? tr('Hide the steps', 'Скрыть шаги') : tr(`Watch it step by step (${result.steps.length} steps)`, `Посмотреть по шагам (${result.steps.length} шагов)`)}
          </button>
        </div>
      ) : result.outputOnly && result.status !== 'input' ? (
        <p className="muted small">{tr('For JavaScript only the output is shown (no step-by-step replay).', 'Для JavaScript показывается только вывод (без пошагового просмотра).')}</p>
      ) : null}
      {trace ? <TraceView code={file.text} steps={result.steps} output={result.output} truncated={result.truncated} onLine={(l) => onGo(l, false)} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------- main

export function Workshop() {
  const ws = useWorkshop();
  const file = ws.files.find((f) => f.id === ws.currentId) ?? null;
  const level = useCode((s) => s.prefs.level);
  const setView = useCode((s) => s.setView);
  const toast = useCode((s) => s.toast);
  const ai = useAi();
  const addNote = useNotebook((s) => s.add);
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<WorkshopEditor | null>(null);
  const fileRef = useRef<WsFile | null>(file);
  fileRef.current = file;
  const [side, setSide] = useState<Side>('help');
  const [menu, setMenu] = useState(false);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [problems, setProblems] = useState<LiveProblem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [live, setLive] = useState<{ x: Explanation; line: string } | null>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingPy, setLoadingPy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiFixText, setAiFixText] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(!!ws.input);
  const [reading, setReading] = useState(false);
  const session = useRef<CSharpSession | null>(null);
  const answers = useRef<string[]>([]);

  // First visit: start with a Unity script (the person uses Unity most).
  useEffect(() => {
    if (!useWorkshop.getState().files.length) useWorkshop.getState().newFile('unity');
    else if (!useWorkshop.getState().current()) useWorkshop.getState().open(useWorkshop.getState().files[0].id);
  }, []);

  const run = useCallback(async () => {
    const f = fileRef.current;
    if (!f) return;
    setSide('result');
    setAiFixText(null);
    if (f.lang === 'c' || f.lang === 'cpp') {
      setResult(null);
      return;
    }
    if (f.lang === 'cs' && isUnity(f.text)) {
      useWorkshop.getState().sendToUnity(f.text, f.name);
      setView('unity');
      return;
    }
    const inputs = useWorkshop
      .getState()
      .input.split('\n')
      .filter((l, i, a) => l !== '' || i < a.length - 1);
    answers.current = [...inputs];
    setRunning(true);
    try {
      if (f.lang === 'cs') {
        const s = await CSharpSession.start(f.text);
        session.current = s;
        let r = s.resume();
        while (r.status === 'input' && answers.current.length) r = s.resume(answers.current.shift());
        setResult(r);
      } else if (f.lang === 'py') {
        setLoadingPy(!pythonLoaded());
        setResult(await runPython(f.text, answers.current));
      } else setResult(await runJs(f.text, answers.current));
    } catch (e) {
      setResult({ status: 'error', output: [], steps: [], truncated: false, error: { line: -1, type: 'Internal', message: String(e instanceof Error ? e.message : e), info: null } });
    } finally {
      setRunning(false);
      setLoadingPy(false);
    }
  }, [setView]);

  const answer = useCallback(async (a: string) => {
    const f = fileRef.current;
    if (!f) return;
    if (f.lang === 'cs' && session.current) {
      setResult(session.current.resume(a));
      return;
    }
    // Python / JavaScript: run again from the start with all answers so far.
    answers.current = [...answers.current, a];
    setRunning(true);
    try {
      setResult(f.lang === 'py' ? await runPython(f.text, answers.current) : await runJs(f.text, answers.current));
    } finally {
      setRunning(false);
    }
  }, []);

  const askAiNext = useCallback(async () => {
    const ed = edRef.current;
    const f = fileRef.current;
    if (!ed || !f) return;
    if (!useAi.getState().enabled) {
      toast('info', tr('The local AI is off. Turn it on in Settings → Local AI.', 'Локальный ИИ выключен. Включи его в Настройки → Локальный ИИ.'));
      return;
    }
    setAiBusy(true);
    try {
      const pos = ed.view.state.selection.main.head;
      const doc = ed.view.state.doc.toString();
      const code = await aiNextCode(f.lang, doc.slice(0, pos), doc.slice(pos));
      if (code.trim()) showAiGhost(ed.view, code, tr('AI guess', 'Догадка ИИ'));
      else toast('info', tr('The AI had no idea here.', 'У ИИ нет идей для этого места.'));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }, [toast]);

  // Create the editor once per file.
  useEffect(() => {
    if (!hostRef.current || !file) return;
    const ed = createEditor(hostRef.current, {
      doc: file.text,
      lang: file.lang,
      fileName: () => fileRef.current?.name ?? '',
      syntax: (text) => (fileRef.current ? syntaxCheck(fileRef.current, text) : Promise.resolve([])),
      onChange: (t) => useWorkshop.getState().update(t),
      onCursor: setCursor,
      onPredictions: setPreds,
      onProblems: setProblems,
      onRun: () => void run(),
      onAskAi: () => void askAiNext(),
      ghost: useWorkshop.getState().ghost,
    });
    edRef.current = ed;
    setResult(null);
    setLive(null);
    setProblems([]);
    setPreds([]);
    session.current = null;
    return () => {
      ed.destroy();
      edRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  useEffect(() => {
    if (edRef.current && file) edRef.current.setLang(file.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.lang]);

  useEffect(() => edRef.current?.setGhostEnabled(ws.ghost), [ws.ghost]);

  // Layer 3: explain the word under the cursor (after a short pause).
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(async () => {
      try {
        const path = `workshop/${file.name}`;
        await getCodeClient().open(path, file.text, true, LANGUAGE_ID[file.lang]);
        const el = await getCodeClient().element(path, Math.max(0, cursor - 1));
        if (!el || !el.text.trim() || el.kind === ('whitespace' as typeof el.kind)) return;
        const lineText = file.text.split('\n')[el.range.line] ?? '';
        setLive({ x: explain(el, { level }), line: lineText.trim() });
      } catch {
        /* the explanation is optional */
      }
    }, 650);
    return () => clearTimeout(t);
  }, [cursor, file, level]);

  const go = useCallback((line: number, col = 0, focus = true) => {
    const v = edRef.current?.view;
    if (!v || line < 0) return;
    const l = v.state.doc.line(Math.min(Math.max(1, line + 1), v.state.doc.lines));
    if (focus) {
      v.dispatch({ selection: { anchor: Math.min(l.from + col, l.to) }, scrollIntoView: true });
      v.focus();
    } else v.dispatch({ effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
  }, []);

  const fix = useCallback((p: LiveProblem) => {
    const v = edRef.current?.view;
    if (!v || !p.fix) return;
    v.dispatch({ changes: { from: p.fix.from, to: p.fix.to, insert: p.fix.text } });
    v.focus();
  }, []);

  const insertText = useCallback((code: string) => {
    const v = edRef.current?.view;
    if (!v) return;
    const pos = v.state.selection.main.head;
    v.dispatch({ changes: { from: pos, insert: code }, selection: { anchor: pos + code.length }, scrollIntoView: true });
    v.focus();
  }, []);

  const recipes = useMemo(() => {
    const list = searchRecipes(query, file?.lang);
    return query.trim() ? list.slice(0, 12) : list.filter((r) => r.lang === file?.lang).concat(RECIPES.filter((r) => r.lang !== file?.lang)).slice(0, 40);
  }, [query, file?.lang]);

  const download = () => {
    if (!file) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([file.text], { type: 'text/plain;charset=utf-8' }));
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const openLocal = async (fl: FileList | null) => {
    const f0 = fl?.[0];
    if (!f0) return;
    if (f0.size > 1_000_000) {
      toast('error', tr('The file is too big for the Workshop (over 1 MB).', 'Файл слишком большой для Мастерской (больше 1 МБ).'));
      return;
    }
    const lang = langOfName(f0.name);
    if (!lang) {
      toast('error', tr('The Workshop opens .cs, .py, .js, .cpp, .c and .h files.', 'Мастерская открывает файлы .cs, .py, .js, .cpp, .c и .h.'));
      return;
    }
    const text = await f0.text();
    // A copy is made: the original file on the computer is never changed.
    ws.newFile(lang === 'cs' ? 'cs' : lang, text, f0.name);
    toast('info', tr('A copy was opened. Your original file is not changed.', 'Открыта копия. Твой исходный файл не меняется.'));
  };

  const explainWithAi = async () => {
    if (!file || !live) return;
    setAiBusy(true);
    setAiText(null);
    try {
      setAiText(await aiExplain(file.lang, file.text, live.line));
    } catch (e) {
      setAiText(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const fixWithAi = async () => {
    if (!file || !result?.error) return;
    setAiFixText('…');
    try {
      setAiFixText(await aiFix(file.lang, file.text, `${result.error.message} (${tr('line', 'строка')} ${result.error.line + 1})`));
    } catch (e) {
      setAiFixText(e instanceof Error ? e.message : String(e));
    }
  };

  if (!file) return <div className="ws" />;
  const errors = problems.filter((p) => p.severity === 'error').length;

  return (
    <div className="ws" data-testid="workshop">
      <div className="ws-toolbar">
        <div className="ws-files">
          <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} data-testid="ws-new">
            <FilePlus2 size={15} /> {tr('New', 'Новый')}
          </button>
          {menu ? <NewFileMenu onPick={(k) => ws.newFile(k)} onClose={() => setMenu(false)} /> : null}
          <select value={file.id} onChange={(e) => ws.open(e.target.value)} aria-label={tr('My files', 'Мои файлы')}
            title={tr('My files: switch between them', 'Мои файлы: переключение между ними')} data-testid="ws-file-select">
            {ws.files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <input
            className="ws-name"
            value={file.name}
            onChange={(e) => ws.rename(e.target.value.replace(/[\\/:*?"<>|]/g, ''))}
            aria-label={tr('File name', 'Имя файла')}
            title={tr('File name (you can rename it here)', 'Имя файла (здесь можно переименовать)')}
            data-testid="ws-name"
            spellCheck={false}
          />
          <span className="pill">{LANG_LABEL[file.lang]}</span>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm(tr(`Delete "${file.name}" from the Workshop?`, `Удалить «${file.name}» из Мастерской?`))) ws.remove(file.id);
            }}
            aria-label={tr('Delete this file', 'Удалить этот файл')}
            title={tr('Delete this file', 'Удалить этот файл')}
          >
            <Trash2 size={15} />
          </button>
        </div>
        <span className="spacer" />
        <button className="btn primary big" onClick={() => void run()} disabled={running} data-testid="ws-run" title="Ctrl+Enter">
          {file.lang === 'cs' && isUnity(file.text) ? <Gamepad2 size={17} /> : <Play size={17} />} {file.lang === 'cs' && isUnity(file.text) ? tr('Play in Mini-Unity', 'Играть в Мини-Unity') : tr('Run', 'Запустить')}
        </button>
        <button className="btn" onClick={() => setReading(true)} data-testid="ws-read" title={tr('The script as a short map and 5 lines at a time, with plain words', 'Скрипт как короткая карта и по 5 строк, простыми словами')}>
          📖 {tr('Read simply', 'Читать просто')}
        </button>
        <button className={`btn${side === 'recipes' ? ' on' : ''}`} onClick={() => setSide('recipes')} data-testid="ws-want">
          <Search size={15} /> {tr('I want…', 'Хочу…')}
        </button>
        <label className="btn" title={tr('Open a copy of a file from the computer', 'Открыть копию файла с компьютера')}>
          <FolderOpen size={15} /> {tr('Open', 'Открыть')}
          <input type="file" accept=".cs,.py,.js,.mjs,.cpp,.cc,.cxx,.hpp,.h,.c" hidden onChange={(e) => void openLocal(e.target.files)} data-testid="ws-open-file" />
        </label>
        <button className="btn" onClick={download} data-testid="ws-download" title={tr('Save a copy to the computer', 'Сохранить копию на компьютер')}>
          <Download size={15} /> {tr('Download', 'Скачать')}
        </button>

      </div>

      <div className={`ws-main${side === 'result' && result?.steps.length ? ' wide-side' : ''}`}>
        <div className="ws-editor-col">
          <div className="ws-editor" ref={hostRef} data-testid="ws-editor" />
          <div className="ws-under">
            <label className="ws-check">
              <input type="checkbox" checked={ws.ghost} onChange={(e) => ws.setGhost(e.target.checked)} data-testid="ws-ghost-toggle" /> {tr('Grey "what comes next" hints (Tab accepts)', 'Серые подсказки «что дальше» (Tab — принять)')}
            </label>
            {ai.enabled ? (
              <button className="btn small" onClick={() => void askAiNext()} disabled={aiBusy} data-testid="ws-ai-next" title="Alt+A">
                <Bot size={13} /> {aiBusy ? tr('AI is thinking…', 'ИИ думает…') : tr('AI: guess the next code', 'ИИ: угадай, что дальше')}
              </button>
            ) : null}
            <button className="btn small ghost" onClick={() => setShowInput((s) => !s)} aria-expanded={showInput} data-testid="ws-input-toggle">
              ⌨ {tr('Input for the program', 'Ввод для программы')} {ws.input.trim() ? `(${ws.input.split('\n').filter(Boolean).length})` : ''}
            </button>
          </div>
          {showInput ? (
            <textarea
              className="ws-input"
              value={ws.input}
              onChange={(e) => ws.setInput(e.target.value)}
              placeholder={tr('Answers for ReadLine / input() / prompt(), one per line. You can also answer while it runs.', 'Ответы для ReadLine / input() / prompt(), по одному на строку. Можно отвечать и во время работы.')}
              rows={3}
              data-testid="ws-input"
            />
          ) : null}
        </div>

        <aside className="ws-side">
          <div className="ws-side-tabs" role="tablist">
            <button role="tab" aria-selected={side === 'help'} className={side === 'help' ? 'on' : ''} onClick={() => setSide('help')} data-testid="ws-tab-help">
              <Lightbulb size={14} /> {tr('Hints', 'Подсказки')}
              {errors ? <span className="badge bad">{errors}</span> : null}
            </button>
            <button role="tab" aria-selected={side === 'recipes'} className={side === 'recipes' ? 'on' : ''} onClick={() => setSide('recipes')} data-testid="ws-tab-recipes">
              <Sparkles size={14} /> {tr('I want…', 'Хочу…')}
            </button>
            <button role="tab" aria-selected={side === 'result'} className={side === 'result' ? 'on' : ''} onClick={() => setSide('result')} data-testid="ws-tab-result">
              <Play size={14} /> {tr('Result', 'Результат')}
            </button>
          </div>

          {side === 'help' ? (
            <div className="ws-side-body" data-testid="ws-help">
              <section>
                <h4>{tr('What usually comes next', 'Что обычно пишут дальше')}</h4>
                {preds.length ? (
                  <ul className="ws-preds" data-testid="ws-preds">
                    {preds.slice(0, 4).map((p, i) => (
                      <li key={i}>
                        <button className="ws-pred" onClick={() => edRef.current && insertPrediction(edRef.current.view, p)} data-testid="ws-pred">
                          <code>{p.text.split('\n')[0]}{p.text.includes('\n') ? ' …' : ''}</code>
                          <span>{pick(p.why)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">{tr('Put the cursor at the end of a line or on an empty line — ideas will appear here.', 'Поставь курсор в конец строки или на пустую строку — здесь появятся идеи.')}</p>
                )}
              </section>
              <section>
                <h4>{tr('Problems', 'Проблемы')}</h4>
                <ProblemsList problems={problems} onGo={go} onFix={fix} />
              </section>
              <section>
                <h4>{tr('What is under the cursor', 'Что под курсором')}</h4>
                {live ? (
                  <div className="ws-live" data-testid="ws-live">
                    <b>{live.x.title}</b> <span className="muted">— {live.x.conceptTitle}</span>
                    <p>{live.x.summary}</p>
                    {live.x.blocks
                      .filter((b) => !b.collapsed && b.id === 'here')
                      .flatMap((b) => b.lines.slice(0, 2))
                      .filter((l) => l.trim() !== live.x.summary.trim())
                      .map((l, i) => (
                        <p key={i} className="small">
                          {l}
                        </p>
                      ))}
                    <div className="ws-row">
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          addNote({ title: live.x.title, text: `${live.x.summary}\n\n${live.line}`, source: file.name });
                          toast('info', tr('Saved to the notebook ⭐', 'Сохранено в блокнот ⭐'));
                        }}
                        data-testid="ws-save-note"
                      >
                        ⭐ {tr('Save to notebook', 'В блокнот')}
                      </button>
                      {ai.enabled ? (
                        <button className="btn small" onClick={() => void explainWithAi()} disabled={aiBusy} data-testid="ws-ai-explain">
                          <Bot size={13} /> {tr('Explain differently (AI)', 'Объясни иначе (ИИ)')}
                        </button>
                      ) : null}
                    </div>
                    {aiText ? (
                      <div className="ws-ai-answer">
                        <span className="pill">{tr('AI guess — may be wrong', 'Догадка ИИ — может ошибаться')}</span>
                        <p>{aiText}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted small">{tr('Click on any word in your code.', 'Нажми на любое слово в своём коде.')}</p>
                )}
              </section>
              <section className="ws-keys muted small">
                <b>{tr('Keys:', 'Клавиши:')}</b> Tab — {tr('accept the grey hint', 'принять серую подсказку')} · Esc — {tr('hide it', 'скрыть её')} · Ctrl+Space — {tr('list of words', 'список слов')} · Ctrl+Enter — {tr('run', 'запустить')}
                {ai.enabled ? ` · Alt+A — ${tr('AI guess', 'догадка ИИ')}` : ''}
              </section>
            </div>
          ) : side === 'recipes' ? (
            <div className="ws-side-body" data-testid="ws-recipes">
              <input
                className="ws-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('What do you want to make? e.g. "jump", "collect coins", "enemy follows"', 'Что хочешь сделать? например «прыжок», «собирать монеты», «враг преследует»')}
                data-testid="ws-recipe-search"
              />
              {query && !recipes.length ? <p className="muted">{tr('Nothing found. Try other words: move, jump, coins, enemy, camera, timer, save…', 'Ничего не найдено. Попробуй другие слова: движение, прыжок, монеты, враг, камера, таймер, сохранение…')}</p> : null}
              {recipes.map((r) => (
                <RecipeCard
                  key={r.id}
                  r={r}
                  onInsert={insertText}
                  onNewFile={(rc, code) => {
                    ws.newFile(rc.lang === 'cs' ? (rc.kind === 'unity' ? 'unity' : 'cs') : rc.lang, code, recipeFileName(rc));
                    toast('info', tr(`Created ${recipeFileName(rc)}`, `Создан ${recipeFileName(rc)}`));
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="ws-side-body">
              <ResultPanel file={file} result={result} running={running} loadingPy={loadingPy} onAnswer={(a) => void answer(a)} onGo={(l, focus) => go(l, 0, focus)} onUnity={() => void run()} onAiFix={() => void fixWithAi()} aiFixText={aiFixText} />
            </div>
          )}
        </aside>
      </div>
      {reading ? <ReaderModal code={file.text} title={file.name} problems={problems.map((p) => ({ line: p.line, severity: p.severity, message: p.message }))} onClose={() => setReading(false)} /> : null}
      <p className="ws-footer muted small">
        {tr(`Files are kept in this browser (${ws.files.length}). "Download" saves a .${EXT[file.lang]} copy. Nothing is sent anywhere.`, `Файлы хранятся в этом браузере (${ws.files.length}). «Скачать» сохраняет копию .${EXT[file.lang]}. Ничего никуда не отправляется.`)}
      </p>
    </div>
  );
}

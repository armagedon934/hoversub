// Pictures that explain code: a step-by-step flowchart, which functions use which, where a value
// comes from and goes to, and which files depend on which. Everything is drawn from the analysis;
// nothing is guessed. When a picture cannot be made, the panel says why.

import { useEffect, useMemo, useState } from 'react';
import { tr } from '../i18n';
import { LineIndex } from '../analysis/lines';
import { ArrowDown, ArrowLeft, ArrowRight, FileCode2, Package, Pause, Play } from 'lucide-react';
import type { FlowStep } from '../analysis/types';
import { getCodeClient } from '../worker/client';
import { useCode, type DiagramKind } from './store';

function kindLabel(k: FlowStep['kind']): string {
  const m: Record<FlowStep['kind'], [string, string]> = {
    action: ['Do', 'Действие'],
    assign: ['Store', 'Запомнить'],
    call: ['Use', 'Вызвать'],
    if: ['Decide', 'Решить'],
    loop: ['Repeat', 'Повторить'],
    return: ['Give back', 'Вернуть'],
    try: ['Try', 'Попробовать'],
    switch: ['Choose', 'Выбрать'],
    other: ['Step', 'Шаг'],
  };
  return tr(m[k][0], m[k][1]);
}

function kindSentence(s: FlowStep): string {
  switch (s.kind) {
    case 'if':
      return tr('Here the program asks a yes/no question and picks a way.', 'Здесь программа задаёт вопрос «да или нет» и выбирает путь.');
    case 'loop':
      return tr('Here a group of lines starts repeating.', 'Здесь начинает повторяться группа строк.');
    case 'return':
      return tr('Here the function finishes and gives its result back.', 'Здесь функция заканчивается и отдаёт результат.');
    case 'call':
      return tr('Here another function is used (called).', 'Здесь используется (вызывается) другая функция.');
    case 'assign':
      return tr('Here a value is put into a box (variable).', 'Здесь значение кладётся в коробку (переменную).');
    case 'try':
      return tr('Here the program tries something that might fail, with a plan B.', 'Здесь программа пробует то, что может не получиться, и держит запасной план.');
    case 'switch':
      return tr('Here one of several options is chosen.', 'Здесь выбирается один из нескольких вариантов.');
    default:
      return tr('Here one instruction is carried out.', 'Здесь выполняется одна инструкция.');
  }
}

interface FlatStep {
  step: FlowStep;
  branch: string | null;
  depth: number;
}

function flatten(steps: FlowStep[], depth = 0, branch: string | null = null, out: FlatStep[] = []): FlatStep[] {
  for (const s of steps) {
    out.push({ step: s, branch, depth });
    for (const b of s.branches ?? []) flatten(b.steps, depth + 1, b.label, out);
  }
  return out;
}

/** Walks through the steps one by one and highlights each line in the code. Nothing is run. */
function StepPlayer({ steps }: { steps: FlowStep[] }) {
  const flat = useMemo(() => flatten(steps), [steps]);
  const [i, setI] = useState(-1);
  const [auto, setAuto] = useState(false);
  const text = useCode((s) => s.openText);
  const lines = useMemo(() => new LineIndex(text), [text]);
  const cur = i >= 0 ? flat[i] : null;

  useEffect(() => {
    if (!cur) return;
    const ln = cur.step.line;
    const start = lines.starts[ln] ?? 0;
    const end = ln + 1 < lines.starts.length ? lines.starts[ln + 1] - 1 : text.length;
    useCode.setState({ highlights: [{ start, end, kind: 'selected' }], scrollTo: { line: ln, nonce: Date.now() } });
  }, [cur, lines, text]);

  useEffect(() => {
    if (!auto) return;
    if (i >= flat.length - 1) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => setI((x) => x + 1), 2000);
    return () => clearTimeout(t);
  }, [auto, i, flat.length]);

  if (!flat.length) return null;
  return (
    <div className="dg-player" data-testid="flow-player">
      {cur ? (
        <div className="dg-player-say" aria-live="polite">
          <b>
            {tr('Step', 'Шаг')} {i + 1} / {flat.length} · {tr('line', 'строка')} {cur.step.line + 1}
          </b>
          {cur.branch ? (
            <span className="pill">
              {tr('only if', 'только если')}: {cur.branch}
            </span>
          ) : null}
          <p>{kindSentence(cur.step)}</p>
          <code>{cur.step.text}</code>
        </div>
      ) : (
        <p className="muted small">{tr('Press "Show me step by step": the lines light up one after another in the order the computer reads them. Nothing is run.', 'Нажми «Покажи по шагам»: строки будут подсвечиваться одна за другой в том порядке, в каком их читает компьютер. Ничего не запускается.')}</p>
      )}
      <div className="dg-player-btns">
        <button className="btn small" onClick={() => setI(Math.max(0, i - 1))} disabled={i <= 0}>
          <ArrowLeft size={14} /> {tr('Back', 'Назад')}
        </button>
        <button className="btn small primary" onClick={() => setI(Math.min(flat.length - 1, i + 1))} disabled={i >= flat.length - 1} data-testid="flow-next">
          {i < 0 ? tr('Show me step by step', 'Покажи по шагам') : tr('Next', 'Дальше')} <ArrowRight size={14} />
        </button>
        <button className="btn small" onClick={() => setAuto(!auto)} aria-pressed={auto}>
          {auto ? <Pause size={14} /> : <Play size={14} />} {auto ? tr('Pause', 'Пауза') : tr('By itself', 'Само')}
        </button>
      </div>
    </div>
  );
}

function Flow({ steps, depth = 0, onLine }: { steps: FlowStep[]; depth?: number; onLine: (l: number) => void }) {
  if (!steps.length) return <div className="fl-empty">{tr('(nothing happens here)', '(здесь ничего не происходит)')}</div>;
  return (
    <div className="fl-col">
      {steps.map((s, i) => (
        <div key={`${s.line}-${i}`} className="fl-item">
          {i > 0 ? <ArrowDown size={14} className="fl-arrow" aria-hidden /> : null}
          <button className={`fl-box fl-${s.kind}`} onClick={() => onLine(s.line)} title={tr(`Go to line ${s.line + 1}`, `Перейти к строке ${s.line + 1}`)}>
            <span className="fl-kind">{kindLabel(s.kind)}</span>
            <span className="fl-text">{s.text}</span>
            <span className="fl-line">{tr('line', 'стр.')} {s.line + 1}</span>
          </button>
          {s.branches?.length && depth < 4 ? (
            <div className="fl-branches">
              {s.branches.map((b, k) => (
                <div key={k} className="fl-branch">
                  <div className="fl-branch-label">{b.label}</div>
                  <Flow steps={b.steps} depth={depth + 1} onLine={onLine} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Node({ label, sub, onClick, kind = 'fn' }: { label: string; sub?: string; onClick?: () => void; kind?: 'fn' | 'file' | 'ext' | 'main' | 'data' }) {
  const content = (
    <>
      {kind === 'file' || kind === 'main' ? <FileCode2 size={13} aria-hidden /> : kind === 'ext' ? <Package size={13} aria-hidden /> : null}
      <span className="dg-label">{label}</span>
      {sub ? <span className="dg-sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button className={`dg-node dg-${kind}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`dg-node dg-${kind}`}>{content}</div>
  );
}

function ThreeColumns({ left, leftTitle, center, right, rightTitle }: { left: React.ReactNode[]; leftTitle: string; center: React.ReactNode; right: React.ReactNode[]; rightTitle: string }) {
  return (
    <div className="dg-3">
      <div className="dg-colwrap">
        <div className="dg-coltitle">{leftTitle}</div>
        <div className="dg-col">{left.length ? left : <span className="dg-none">{tr('none found', 'не найдено')}</span>}</div>
      </div>
      <ArrowRight size={18} className="dg-arrow" aria-hidden />
      <div className="dg-col dg-center">{center}</div>
      <ArrowRight size={18} className="dg-arrow" aria-hidden />
      <div className="dg-colwrap">
        <div className="dg-coltitle">{rightTitle}</div>
        <div className="dg-col">{right.length ? right : <span className="dg-none">{tr('none found', 'не найдено')}</span>}</div>
      </div>
    </div>
  );
}

export function Diagrams() {
  const sel = useCode((s) => s.selection);
  const open = useCode((s) => s.open);
  const path = useCode((s) => s.openPath);
  const diagram = useCode((s) => s.diagram);
  const setDiagram = useCode((s) => s.setDiagram);
  const fileFlow = useCode((s) => s.fileFlow);
  const index = useCode((s) => s.index);
  const openFile = useCode((s) => s.openFile);
  const select = useCode((s) => s.select);
  const summary = open?.summary;
  const el = sel?.element;

  const goLine = (line: number) => useCode.setState({ scrollTo: { line, nonce: Date.now() } });

  // Pick the most useful picture for what is selected.
  const auto: Exclude<DiagramKind, 'auto'> = useMemo(() => {
    if (!el) return 'files';
    if (el.kind === 'function-definition' || el.kind === 'function-call') return 'connections';
    if (el.kind === 'variable' || el.kind === 'parameter' || el.kind === 'property') return 'data';
    if (el.flow?.length || el.enclosingFunction) return 'flow';
    return 'files';
  }, [el]);
  const kind = diagram === 'auto' ? auto : diagram;

  useEffect(() => {
    if (kind === 'flow' && !el?.flow?.length && !fileFlow && path) void getCodeClient().flow(path).then((f) => useCode.setState({ fileFlow: f }));
  }, [kind, el, fileFlow, path]);

  if (!summary || !path) return null;

  let body: React.ReactNode;
  if (kind === 'flow') {
    const steps = el?.flow?.length ? el.flow : fileFlow;
    const title = el?.flow?.length ? tr(`Steps inside ${el.func?.name ?? el.enclosingFunction ?? 'this function'}`, `Шаги внутри ${el.func?.name ?? el.enclosingFunction ?? 'этой функции'}`) : tr('Steps of this file, from top to bottom', 'Шаги этого файла сверху вниз');
    body = steps ? (
      steps.length ? (
        <>
          <div className="dg-caption">
            {title}. {tr('Click a box to jump to that line.', 'Нажми на блок, чтобы перейти к строке.')}
          </div>
          <StepPlayer steps={steps} />
          <Flow steps={steps} onLine={goLine} />
        </>
      ) : (
        <div className="dg-caption">{tr('No steps could be found here. Step pictures are made for files with a full structure (for example Python, JavaScript, C, C++, C#).', 'Здесь не найдено шагов. Схемы шагов строятся для файлов с полной структурой (например Python, JavaScript, C, C++, C#).')}</div>
      )
    ) : (
      <div className="dg-caption">{tr('Drawing…', 'Рисую…')}</div>
    );
  } else if (kind === 'connections') {
    const fnName = el?.func?.name ?? (el?.kind === 'function-call' || el?.kind === 'function-definition' ? el.symbolName : el?.enclosingFunction) ?? null;
    if (!fnName) body = <div className="dg-caption">{tr('Click a function name to see which functions use it and which ones it uses.', 'Нажми на имя функции — увидишь, кто её использует и что использует она.')}</div>;
    else {
      const callers = new Map<string, { path: string; line: number }>();
      if (index) {
        for (const f of index.files) {
          for (const r of f.summary?.refs ?? []) if (r.name === fnName && r.role === 'call') callers.set(`${f.path}:${r.container ?? tr('(main part)', '(основная часть)')}`, { path: f.path, line: r.range.line });
        }
      } else for (const r of summary.refs) if (r.name === fnName && r.role === 'call') callers.set(`${path}:${r.container ?? tr('(main part)', '(основная часть)')}`, { path, line: r.range.line });
      const def = summary.symbols.find((s) => s.name === fnName && (s.kind === 'function' || s.kind === 'method'));
      const callees = el?.func?.calls ?? (def ? [...new Set(summary.refs.filter((r) => r.role === 'call' && r.range.start > def.fullRange.start && r.range.end <= def.fullRange.end).map((r) => r.name))] : []);
      body = (
        <>
          <div className="dg-caption">
            {tr('Who uses', 'Кто использует')} <b>{fnName}</b> ({tr('left', 'слева')}) {tr('and what', 'и что использует')} <b>{fnName}</b> {tr('uses (right). Links are found by name; a name can occasionally point to something else with the same name.', '(справа). Связи найдены по имени; изредка одно имя может означать разные вещи.')}
          </div>
          <ThreeColumns
            leftTitle={tr('Used by', 'Кто использует')}
            left={[...callers.entries()].slice(0, 14).map(([k, v]) => (
              <Node key={k} label={k.split(':').slice(1).join(':')} sub={v.path === path ? `${tr('line', 'строка')} ${v.line + 1}` : `${v.path.split('/').pop()} · ${tr('line', 'строка')} ${v.line + 1}`} onClick={() => void openFile(v.path, { line: v.line })} />
            ))}
            center={<Node kind="main" label={fnName} sub={def ? `${tr('line', 'строка')} ${def.range.line + 1}` : tr('defined elsewhere', 'создана в другом месте')} onClick={def ? () => void select(def.range.start) : undefined} />}
            rightTitle={tr('Uses', 'Использует')}
            right={callees.slice(0, 14).map((c) => {
              const d = summary.symbols.find((s) => s.name === c && (s.kind === 'function' || s.kind === 'method' || s.kind === 'class'));
              return <Node key={c} label={c} sub={d ? `${tr('line', 'строка')} ${d.range.line + 1}` : tr('from outside this file', 'из другого места')} kind={d ? 'fn' : 'ext'} onClick={d ? () => void select(d.range.start) : undefined} />;
            })}
          />
        </>
      );
    }
  } else if (kind === 'data') {
    const name = el?.symbolName;
    if (!el || !name) body = <div className="dg-caption">{tr('Click a variable to see where its value is created, changed and used.', 'Нажми на переменную — увидишь, где её значение создаётся, меняется и используется.')}</div>;
    else {
      const refs = el.references ?? [];
      const defs = el.definitions ?? [];
      const created = [...defs.map((d) => ({ line: d.range.line, where: d.container })), ...refs.filter((r) => r.role === 'parameter').map((r) => ({ line: r.range.line, where: r.container }))];
      const changed = refs.filter((r) => r.role === 'assignment' && !defs.some((d) => d.range.start === r.range.start));
      const used = refs.filter((r) => r.role === 'read' || r.role === 'call' || r.role === 'property');
      const col = (items: { line: number; where: string | null }[], cls: string) =>
        items.slice(0, 12).map((x, i) => <Node key={`${cls}${i}`} kind="data" label={`${tr('line', 'строка')} ${x.line + 1}`} sub={x.where ? `${tr('in', 'в')} ${x.where}` : tr('main part', 'основная часть')} onClick={() => goLine(x.line)} />);
      body = (
        <>
          <div className="dg-caption">
            {tr('The journey of the value in', 'Путь значения в')} <b>{name}</b> {tr('inside this file: where it is made, where it changes, where it is read.', 'внутри этого файла: где создаётся, где меняется, где читается.')}
          </div>
          <div className="dg-data">
            <div className="dg-colwrap">
              <div className="dg-coltitle">1. {tr('Created', 'Создаётся')}</div>
              <div className="dg-col">{created.length ? col(created, 'c') : <span className="dg-none">{tr('not in this file', 'не в этом файле')}</span>}</div>
            </div>
            <ArrowRight size={18} className="dg-arrow" aria-hidden />
            <div className="dg-colwrap">
              <div className="dg-coltitle">2. {tr('Changed', 'Меняется')}</div>
              <div className="dg-col">{changed.length ? col(changed.map((r) => ({ line: r.range.line, where: r.container })), 'w') : <span className="dg-none">{tr('never changed', 'не меняется')}</span>}</div>
            </div>
            <ArrowRight size={18} className="dg-arrow" aria-hidden />
            <div className="dg-colwrap">
              <div className="dg-coltitle">3. {tr('Used', 'Используется')}</div>
              <div className="dg-col">{used.length ? col(used.map((r) => ({ line: r.range.line, where: r.container })), 'r') : <span className="dg-none">{tr('not read here', 'здесь не читается')}</span>}</div>
            </div>
          </div>
          {sel?.cross?.usesElsewhere.length ? <div className="dg-caption">{tr('Also mentioned (by name) in other files:', 'Также упоминается (по имени) в других файлах:')} {new Set(sel.cross.usesElsewhere.map((u) => u.path)).size}</div> : null}
        </>
      );
    }
  } else {
    const deps = index?.imports.get(path) ?? [];
    const by = index?.importedBy.get(path) ?? [];
    const external = summary.imports.filter((i) => i.external || (!i.resolved && !deps.length));
    body = (
      <>
        <div className="dg-caption">
          {tr('How', 'Как')} <b>{path.split('/').pop()}</b> {tr('connects to other files: which files use it (left) and what it needs (right).', 'связан с другими файлами: кто его использует (слева) и что нужно ему (справа).')}
        </div>
        <ThreeColumns
          leftTitle={tr('Used by', 'Кто использует')}
          left={by.slice(0, 14).map((p) => <Node key={p} kind="file" label={p.split('/').pop()!} sub={p} onClick={() => void openFile(p)} />)}
          center={<Node kind="main" label={path.split('/').pop()!} sub={open?.languageName} />}
          rightTitle={tr('Needs', 'Нужно ему')}
          right={[
            ...deps.slice(0, 14).map((p) => <Node key={p} kind="file" label={p.split('/').pop()!} sub={p} onClick={() => void openFile(p)} />),
            ...external.slice(0, 8).map((i) => <Node key={`x${i.spec}`} kind="ext" label={i.spec} sub={tr('library / outside the project', 'библиотека / вне проекта')} />),
          ]}
        />
      </>
    );
  }

  const tabs: { k: DiagramKind; label: string }[] = [
    { k: 'auto', label: tr('Best fit', 'Лучшее') },
    { k: 'flow', label: tr('Steps', 'Шаги') },
    { k: 'connections', label: tr('Functions', 'Функции') },
    { k: 'data', label: tr('Data', 'Данные') },
    { k: 'files', label: tr('Files', 'Файлы') },
  ];
  return (
    <section className="dg" aria-label={tr('Picture', 'Картинка')} data-testid="diagram">
      <div className="dg-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={diagram === t.k} className={diagram === t.k ? 'on' : ''} onClick={() => setDiagram(t.k)} data-testid={`diagram-${t.k}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="dg-body" data-kind={kind}>
        {body}
      </div>
    </section>
  );
}

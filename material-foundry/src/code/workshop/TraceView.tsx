// Step-by-step replay of a real run: which line runs now, what each box (variable) holds, which
// function we are inside, and what is on the screen. Values come from actually running the
// program in the sandbox — they are real, not guessed.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { tr } from '../i18n';
import type { Shown, TraceStep } from '../run/csharp';

function ValueBox({ name, value, changed }: { name: string; value: Shown; changed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ws-var${changed ? ' changed' : ''}`} data-testid="trace-var">
      <span className="ws-var-name">{name}</span>
      <span className="ws-var-val">
        {value.parts ? (
          <button className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {value.text} {open ? '▾' : '▸'}
          </button>
        ) : (
          value.text
        )}
      </span>
      {open && value.parts ? (
        <div className="ws-var-parts">
          {value.parts.map((p, i) => (
            <span key={i}>
              <i>{p.label}</i> {p.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const KIND_ICON: Record<TraceStep['kind'], string> = { line: '▶', call: '↘', return: '↩', check: '❓', loop: '🔁', output: '🖥', input: '⌨', error: '⚠' };

export function TraceView({ code, steps, output, truncated, onLine }: { code: string; steps: TraceStep[]; output: string[]; truncated?: boolean; onLine?: (line: number) => void }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(700);
  const lines = useMemo(() => code.split('\n'), [code]);
  const step = steps[Math.min(i, steps.length - 1)];
  const prev = i > 0 ? steps[i - 1] : undefined;
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  useEffect(() => setI(0), [steps]);
  useEffect(() => {
    if (!auto) return;
    if (i >= steps.length - 1) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(steps.length - 1, x + 1)), speed);
    return () => clearTimeout(t);
  }, [auto, i, speed, steps.length]);

  // Only when the step changes (never on other re-renders, so typing is not disturbed).
  useEffect(() => {
    const el = document.querySelector('.ws-trace-code .cur');
    el?.scrollIntoView({ block: 'nearest' });
    if (step) onLineRef.current?.(step.line);
  }, [i, step]);

  if (!steps.length) return <p className="muted">{tr('No steps were recorded.', 'Шаги не записаны.')}</p>;

  const prevVals = new Map<string, string>();
  for (const f of prev?.frames ?? []) for (const v of f.vars) prevVals.set(`${f.fn}|${v.name}`, v.value.text);
  const shownOut = output.slice(0, step.output);
  const from = Math.max(0, step.line - 6);
  const to = Math.min(lines.length, Math.max(step.line + 7, from + 13));

  return (
    <div className="ws-trace" data-testid="trace-view">
      <div className="ws-trace-bar">
        <button className="btn small" onClick={() => setI(0)} aria-label={tr('First step', 'Первый шаг')} disabled={i === 0}>
          <ChevronFirst size={16} />
        </button>
        <button className="btn small" onClick={() => setI((x) => Math.max(0, x - 1))} aria-label={tr('Step back', 'Шаг назад')} disabled={i === 0} data-testid="trace-prev">
          <ChevronLeft size={16} />
        </button>
        <button className="btn primary" onClick={() => setAuto((a) => !a)} data-testid="trace-auto">
          {auto ? <Pause size={16} /> : <Play size={16} />} {auto ? tr('Pause', 'Пауза') : tr('Play', 'Смотреть')}
        </button>
        <button className="btn small" onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))} aria-label={tr('Next step', 'Следующий шаг')} disabled={i >= steps.length - 1} data-testid="trace-next">
          <ChevronRight size={16} />
        </button>
        <button className="btn small" onClick={() => setI(steps.length - 1)} aria-label={tr('Last step', 'Последний шаг')} disabled={i >= steps.length - 1}>
          <ChevronLast size={16} />
        </button>
        <span className="ws-trace-count" data-testid="trace-count">
          {tr('Step', 'Шаг')} {i + 1} / {steps.length}
          {truncated ? ` (${tr('first steps only', 'только первые шаги')})` : ''}
        </span>
        <label className="ws-speed">
          {tr('Speed', 'Скорость')}
          <input type="range" min={150} max={1500} step={50} value={1650 - speed} onChange={(e) => setSpeed(1650 - Number(e.target.value))} aria-label={tr('Playback speed', 'Скорость показа')} />
        </label>
      </div>
      <input className="ws-trace-scrub" type="range" min={0} max={steps.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label={tr('Choose a step', 'Выбрать шаг')} />
      <div className={`ws-say kind-${step.kind}`} data-testid="trace-say" aria-live="polite">
        <span aria-hidden>{KIND_ICON[step.kind]}</span> {step.say}
      </div>
      <div className="ws-trace-grid">
        <div className="ws-trace-code" role="list" aria-label={tr('Code', 'Код')}>
          {lines.slice(from, to).map((l, k) => {
            const n = from + k;
            return (
              <div
                key={n}
                role="listitem"
                className={`ws-tl${n === step.line ? ' cur' : ''}`}
                onClick={() => {
                  const j = steps.findIndex((s, idx) => idx > i && s.line === n);
                  const back = steps.findIndex((s) => s.line === n);
                  if (j >= 0) setI(j);
                  else if (back >= 0) setI(back);
                }}
                title={tr('Jump to the next time this line runs', 'Перейти к следующему выполнению этой строки')}
              >
                <span className="ws-tl-n">{n + 1}</span>
                <span className="ws-tl-arrow" aria-hidden>
                  {n === step.line ? '▶' : ''}
                </span>
                <code>{l || ' '}</code>
              </div>
            );
          })}
        </div>
        <div className="ws-trace-side">
          <h4>{tr('Memory: boxes with values', 'Память: коробки со значениями')}</h4>
          {step.frames.map((f, k) => (
            <div key={k} className={`ws-frame${k === step.frames.length - 1 ? ' top' : ''}`} data-testid="trace-frame">
              <div className="ws-frame-head">{f.fn ? tr(`inside ${f.fn}()`, `внутри ${f.fn}()`) : tr('main program', 'основная программа')}</div>
              {f.vars.length ? (
                f.vars.map((v) => <ValueBox key={v.name} name={v.name} value={v.value} changed={prevVals.has(`${f.fn}|${v.name}`) ? prevVals.get(`${f.fn}|${v.name}`) !== v.value.text : !!prev} />)
              ) : (
                <span className="muted small">{tr('no boxes yet', 'пока нет коробок')}</span>
              )}
            </div>
          ))}
          <h4>{tr('Screen', 'Экран')}</h4>
          <pre className="ws-screen" data-testid="trace-screen">
            {shownOut.length ? shownOut.join('\n') : <span className="muted">{tr('(empty)', '(пусто)')}</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

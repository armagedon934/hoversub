// "The ABC of code" screen: two windows. Left — the symbol, a very short story, the task and real
// C# you type. Right — robot Bit doing exactly what the code says (and the funny moment when a
// symbol is missing). Finishing a level shows the one sentence to remember.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Play, RotateCcw } from 'lucide-react';
import { pick, tr } from '../i18n';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { parseCSharp, syntaxProblems } from '../run/runner';
import { createEditor, type WorkshopEditor } from '../workshop/editor';
import { useReview } from '../memory/review';
import { useResume } from '../memory/resume';
import { fx } from '../ui/fx';
import { useCode } from '../ui/store';
import { ABC_LEVELS, momentOf, runAbc, type AbcAction, type AbcLevel, type AbcMoment, type AbcRun, type AbcScene } from './abc';
import { useAbc } from './abcProgress';
import { useLearn } from './progress';

const CELLS = 8;
const STEP_MS = 650;

interface Pose {
  x: number;
  robot: AbcAction['act'] | 'idle';
  cat: 'idle' | 'jump' | 'meow';
  bubble: { who: 'robot' | 'cat'; text: string } | null;
  held: string | null;
}
const IDLE: Pose = { x: 0, robot: 'idle', cat: 'idle', bubble: null, held: null };

/** The stage: a row of cells, Bit, sometimes the cat, the backpack, the pit and the flag. */
function Stage({ scene, pose, vars }: { scene: AbcScene; pose: Pose; vars: AbcRun['vars'] }) {
  const pct = (x: number) => `${((Math.min(CELLS - 1, x) + 0.5) / CELLS) * 100}%`;
  return (
    <div className={`abc-stage${scene.rain ? ' rain' : ' sun'}`} data-testid="abc-stage">
      <div className="abc-sky" aria-hidden>
        {scene.rain ? '🌧' : '☀️'}
      </div>
      {scene.rain ? <div className="abc-rain" aria-hidden /> : null}
      {scene.boxes && vars.length ? (
        <div className="abc-boxes" data-testid="abc-boxes">
          {vars.map((v) => (
            <span key={v.name} className="abc-box">
              <b>{v.value}</b>
              <small>{v.name}</small>
            </span>
          ))}
        </div>
      ) : null}
      {scene.bag ? (
        <div className="abc-bag" aria-label={tr('Backpack', 'Рюкзак')}>
          🎒
          {scene.bag.map((it, i) => (
            <span key={i} className="abc-pocket">
              {it}
              <small>[{i}]</small>
            </span>
          ))}
        </div>
      ) : null}
      <div className="abc-ground">
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className={`abc-cell${scene.pit === i ? ' pit' : ''}`}>
            {scene.flag === i ? '🏁' : ''}
          </span>
        ))}
      </div>
      {scene.cat ? (
        <>
          <span className="abc-crate" aria-hidden>
            📦
          </span>
          <span className={`abc-cat ${pose.cat}`} aria-label={tr('Cat', 'Кот')}>
            🐱
          </span>
        </>
      ) : null}
      <span className={`abc-robot ${pose.robot}`} style={{ left: pct(pose.x) }} data-testid="abc-robot" aria-label={tr('Robot Bit', 'Робот Бит')}>
        <span className="abc-robot-body">🤖</span>
        {pose.robot === 'umbrella' ? <span className="abc-prop up">☂️</span> : null}
        {pose.robot === 'wave' ? <span className="abc-prop side">👋</span> : null}
        {pose.robot === 'search' ? <span className="abc-prop side">🔍</span> : null}
        {pose.robot === 'faint' || pose.robot === 'trip' ? <span className="abc-prop up">💫</span> : null}
        {pose.held ? <span className="abc-prop side">{pose.held}</span> : null}
      </span>
      {pose.bubble ? (
        <span className={`abc-bubble ${pose.bubble.who}`} style={pose.bubble.who === 'robot' ? { left: `clamp(130px, ${pct(pose.x)}, calc(100% - 130px))` } : undefined} data-testid="abc-bubble">
          {pose.bubble.text}
        </span>
      ) : null}
    </div>
  );
}

const ITEM_ICON: Record<string, string> = { ключ: '🗝', key: '🗝', яблоко: '🍎', apple: '🍎', меч: '🗡', sword: '🗡' };

export function AbcView() {
  const prog = useAbc();
  const lockAhead = useCode((s) => s.prefs.lockAhead);
  const addXp = useLearn((s) => s.addXp);
  const level: AbcLevel = ABC_LEVELS.find((l) => l.id === prog.current) ?? ABC_LEVELS[0];
  const idx = ABC_LEVELS.indexOf(level);
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<WorkshopEditor | null>(null);
  const codeRef = useRef('');
  const stageRef = useRef<HTMLDivElement>(null);
  const goalRefs = useRef<(HTMLLIElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const [pose, setPose] = useState<Pose>(IDLE);
  const [run, setRun] = useState<AbcRun | null>(null);
  const [moment, setMoment] = useState<AbcMoment | null>(null);
  const [firstMoment, setFirstMoment] = useState<AbcMoment | null>(null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const reached = useMemo(() => new Set(prog.goals[level.id] ?? []), [prog.goals, level.id]);
  const scene = level.scene(run?.source ?? prog.code[level.id] ?? pick(level.starter));
  const open = (i: number) => !lockAhead || i === 0 || prog.done.includes(ABC_LEVELS[i].id) || prog.done.includes(ABC_LEVELS[i - 1].id);

  ensureMainThreadTreeSitter();

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  /** Plays the robot's actions one by one; calls done at the end. */
  const playActions = useCallback((acts: AbcAction[], done: () => void) => {
    clearTimers();
    setPose(IDLE);
    let t = 250;
    let held: string | null = null;
    for (const a of acts) {
      const at = t;
      timers.current.push(
        window.setTimeout(() => {
          if (a.act === 'take') held = ITEM_ICON[(a.text ?? '').toLowerCase()] ?? '📦';
          setPose((p) => ({
            x: a.who === 'robot' && a.x !== undefined ? a.x : p.x,
            robot: a.who === 'robot' ? a.act : 'idle',
            cat: a.who === 'cat' ? (a.act === 'meow' ? 'meow' : 'jump') : p.cat === 'jump' ? 'jump' : 'idle',
            bubble: a.text && a.act !== 'take' ? { who: a.who, text: a.text } : a.act === 'take' ? { who: 'robot', text: `${held} ${a.text}` } : null,
            held,
          }));
        }, at),
      );
      t += a.act === 'say' || a.text ? STEP_MS * 1.6 : STEP_MS;
    }
    timers.current.push(window.setTimeout(done, t + 150));
  }, []);

  const check = useCallback(async () => {
    const src = codeRef.current;
    setBusy(true);
    setMoment(null);
    const r = await runAbc(src, level.scene(src));
    setBusy(false);
    setRun(r);
    const m = momentOf(level, r);
    const acts = m && !m.keep ? m.show() : r.actions;
    playActions(acts.length ? acts : r.error ? [{ who: 'robot', act: 'confused', text: '?' }] : [], () => {
      if (m) {
        setMoment(m);
        if (!firstMoment) setFirstMoment(m);
        fx.wrong(stageRef.current);
        return;
      }
      if (r.error) {
        fx.wrong(stageRef.current);
        return;
      }
      const st = useAbc.getState();
      const before = new Set(st.goals[level.id] ?? []);
      const now = new Set(before);
      level.goals.forEach((g, i) => g.check(r) && now.add(i));
      const fresh = [...now].filter((i) => !before.has(i));
      if (fresh.length) {
        st.set({ goals: { ...st.goals, [level.id]: [...now] } });
        for (const i of fresh) {
          fx.spark(goalRefs.current[i]);
          fx.float('+5 XP', goalRefs.current[i]);
          fx.streak(true);
          addXp(5);
        }
      }
      if (now.size === level.goals.length && !useAbc.getState().done.includes(level.id)) {
        const s2 = useAbc.getState();
        s2.set({ done: [...s2.done, level.id] });
        addXp(30);
        const recap = (firstMoment ?? m)?.say;
        useReview.getState().addCards([
          {
            id: `abc:${level.id}`,
            front: tr(`What does ${level.symbol} mean in C#?`, `Что значит ${level.symbol} в C#?`),
            back: `${pick(level.anchor)}${recap ? `\n\n${pick(recap)}` : ''}`,
            from: tr('The ABC of code', 'Азбука кода'),
            code: pick(level.answer),
          },
        ]);
        const next = ABC_LEVELS[idx + 1];
        fx.lesson({
          icon: level.symbol,
          title: pick(level.title),
          anchor: pick(level.anchor),
          moment: recap ? pick(recap).split(/(?<=[.!?])\s/)[0] : undefined,
          xp: 30 + level.goals.length * 5,
          next: next ? { label: tr(`Next: ${next.symbol}`, `Дальше: ${next.symbol}`), go: () => useAbc.getState().set({ current: next.id }) } : undefined,
        });
      }
    });
  }, [level, idx, playActions, addXp, firstMoment]);

  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    if (!hostRef.current) return;
    const initial = prog.code[level.id] ?? pick(level.starter);
    codeRef.current = initial;
    const ed = createEditor(hostRef.current, {
      doc: initial,
      lang: 'cs',
      fileName: () => 'Bit.cs',
      syntax: async (text) => syntaxProblems(await parseCSharp(text), text).map((p) => ({ line: p.line, col: p.col, message: p.message })),
      onChange: (t) => {
        codeRef.current = t;
        const s = useAbc.getState();
        s.set({ code: { ...s.code, [level.id]: t } });
      },
      onCursor: () => {},
      onPredictions: () => {},
      onProblems: () => {},
      onRun: () => void checkRef.current(),
      ghost: false,
    });
    edRef.current = ed;
    setRun(null);
    setMoment(null);
    setFirstMoment(null);
    setHint(false);
    setPose(IDLE);
    useResume.getState().mark({ kind: 'lesson', id: level.id, title: `${tr('ABC', 'Азбука')}: ${pick(level.title)}`, extra: 'abc' });
    return () => {
      clearTimers();
      ed.destroy();
      edRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  const restart = () => {
    if (!confirm(tr('Start this level again with the original code?', 'Начать уровень заново с исходным кодом?'))) return;
    edRef.current?.setText(pick(level.starter));
  };

  return (
    <div className="abc" data-testid="abc">
      <nav className="abc-levels" aria-label={tr('Levels', 'Уровни')}>
        {ABC_LEVELS.map((l, i) => {
          const ok = prog.done.includes(l.id);
          const can = open(i);
          return (
            <button
              key={l.id}
              className={`abc-level${l.id === level.id ? ' on' : ''}${ok ? ' done' : ''}${can ? '' : ' locked'}`}
              onClick={() => (can ? prog.set({ current: l.id }) : useCode.getState().toast('info', tr('Finish the previous symbol first — it opens this one.', 'Сначала пройди предыдущий символ — он откроет этот.')))}
              title={pick(l.title)}
              aria-disabled={!can}
              data-testid={`abc-level-${l.id}`}
            >
              {can ? l.symbol : '🔒'}
              {ok ? <i aria-hidden>✓</i> : null}
            </button>
          );
        })}
      </nav>
      <div className="abc-two">
        <section className="abc-left">
          <header className="abc-head">
            <span className="abc-symbol" aria-hidden>
              {level.symbol}
            </span>
            <div>
              <span className="muted small">
                {tr('The ABC of code', 'Азбука кода')} · {idx + 1}/{ABC_LEVELS.length}
              </span>
              <h2>{pick(level.title)}</h2>
            </div>
          </header>
          <div className="abc-story">
            {level.story.map((p, i) => (
              <p key={i}>{pick(p)}</p>
            ))}
          </div>
          <div className="abc-task" data-testid="abc-task">
            <b>🎯 {tr('Task', 'Задание')}:</b> {pick(level.task)}
          </div>
          <ul className="abc-goals">
            {level.goals.map((g, i) => (
              <li key={i} ref={(el) => void (goalRefs.current[i] = el)} className={reached.has(i) ? 'ok' : ''} data-testid="abc-goal">
                {reached.has(i) ? '✅' : '⬜'} {pick(g.text)}
              </li>
            ))}
          </ul>
          <div className="abc-editor" ref={hostRef} data-testid="abc-editor" />
          <div className="abc-actions">
            <button className="btn big primary" onClick={() => void check()} disabled={busy} data-testid="abc-run">
              <Play size={18} /> {tr('Run', 'Запустить')} <span className="muted small">Ctrl+Enter</span>
            </button>
            <button className="btn" onClick={() => setHint(true)} data-testid="abc-hint">
              <Lightbulb size={16} /> {tr('Hint', 'Подсказка')}
            </button>
            <button className="btn ghost" onClick={restart} title={tr('Start again', 'Сначала')}>
              <RotateCcw size={16} />
            </button>
            <button className="btn ghost small" onClick={() => confirm(tr('Show the answer?', 'Показать ответ?')) && edRef.current?.setText(pick(level.answer))} data-testid="abc-answer">
              {tr('Answer', 'Ответ')}
            </button>
          </div>
          {hint ? <p className="abc-hint">💡 {pick(level.hint)}</p> : null}
        </section>
        <section className="abc-right">
          <div ref={stageRef}>
            <Stage scene={scene} pose={pose} vars={run?.vars ?? []} />
          </div>
          {moment ? (
            <div className="abc-moment" role="status" data-testid="abc-moment">
              <b>😮 {tr('What just happened', 'Что сейчас произошло')}</b>
              <p>{pick(moment.say)}</p>
            </div>
          ) : run?.error ? (
            <div className="abc-moment err" role="status">
              <b>🤔 {tr('Bit did not understand', 'Бит не понял')}</b>
              <p>{run.error.message}</p>
            </div>
          ) : run && !run.actions.length ? (
            <p className="muted">{tr('Bit did nothing — that is what the code says.', 'Бит ничего не сделал — так написано в коде.')}</p>
          ) : null}
          <div className="abc-anchor">
            <span className="muted small">🧠 {tr('One sentence to remember', 'Одна фраза, чтобы запомнить')}</span>
            <b>{pick(level.anchor)}</b>
          </div>
          <details className="abc-unity" open={prog.done.includes(level.id)}>
            <summary>🎮 {tr('The same in a real Unity script', 'То же в настоящем скрипте Unity')}</summary>
            <pre>{level.unity.code}</pre>
            <p>{pick(level.unity.say)}</p>
          </details>
        </section>
      </div>
    </div>
  );
}

export default AbcView;

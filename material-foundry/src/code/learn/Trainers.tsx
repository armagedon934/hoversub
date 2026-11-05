// Trainers: short, repeatable practice for Unity C# — find the bug, predict the output (endless,
// answers computed by really running the code), Unity event order, "where does this code go?",
// a cheat sheet, achievements and a daily goal. One question at a time, instant feedback.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Lightbulb, ListChecks, Printer, RotateCcw } from 'lucide-react';
import { pick, tr, type Text2 } from '../i18n';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { runCSharp } from '../run/runner';
import type { TraceStep } from '../run/csharp';
import { useReview } from '../memory/review';
import { useNotebook } from '../memory/notebook';
import { Speak } from '../memory/MemoryViews';
import { TraceView } from '../workshop/TraceView';
import { useUnityProgress } from '../workshop/MiniUnity';
import { LEVELS } from '../run/levels';
import { PROJECT } from '../run/project';
import { ACHIEVEMENTS, DAILY_GOAL_XP, useTrainers, xpToday, type Facts } from './achievements';
import { BUGS, fixedCode, prepareBug, type BugCase } from './bugs';
import { PREDICT, makeQuestion, type PredictQuestion } from './predict';
import { useLearn } from './progress';
import { CHEAT_SHEET, LIFECYCLE, WHICH } from './unityFacts';

type Screen = 'home' | 'bugs' | 'predict' | 'lifecycle' | 'which' | 'cheat' | 'badges';

const shuffle = <X,>(a: X[]): X[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// ----------------------------------------------------------------------------------- daily goal

export function DailyGoal({ compact }: { compact?: boolean }) {
  const days = useTrainers((s) => s.days);
  const xp = xpToday(days);
  const pct = Math.min(1, xp / DAILY_GOAL_XP);
  return (
    <div className={`goal${compact ? ' compact' : ''}${pct >= 1 ? ' done' : ''}`} data-testid="daily-goal" title={tr('Daily goal', 'Цель дня')}>
      <span className="goal-ring" style={{ ['--p' as string]: `${pct * 360}deg` }}>
        <span>{pct >= 1 ? '✓' : `${Math.round(pct * 100)}%`}</span>
      </span>
      <span>
        <b>{tr('Daily goal', 'Цель дня')}</b>
        <span className="muted small">
          {' '}
          {xp} / {DAILY_GOAL_XP} XP {pct >= 1 ? tr('— done! 🎉', '— выполнено! 🎉') : ''}
        </span>
      </span>
    </div>
  );
}

function useFacts(): Facts {
  const done = useLearn((s) => s.done);
  const xp = useLearn((s) => s.xp);
  const streak = useLearn((s) => s.streak);
  const unity = useUnityProgress((s) => s.done);
  const cards = useReview((s) => s.cards.length);
  const notes = useNotebook((s) => s.notes.length);
  const t = useTrainers();
  const keys = Object.keys(done);
  return {
    lessonsDone: keys.filter((k) => !k.startsWith('course:')).length,
    courseDone: keys.filter((k) => k.startsWith('course:cs-unity:')).length,
    advancedDone: keys.filter((k) => k.startsWith('course:cs-advanced:')).length,
    projectDone: unity.filter((id) => PROJECT.some((l) => l.id === id)).length,
    projectTotal: PROJECT.length,
    unityLevels: unity.filter((id) => LEVELS.some((l) => l.id === id)).length,
    unityTotal: LEVELS.length,
    streak,
    xp,
    reviewCards: cards,
    notes,
    bugs: t.bugsSolved.length,
    bugsTotal: BUGS.length,
    predictRight: t.predictRight,
    predictBestStreak: t.predictBestStreak,
    lifecycleBest: t.lifecycleBest,
    cheatOpened: t.cheatOpened,
    goalDays: Object.values(t.days).filter((v) => v >= DAILY_GOAL_XP).length,
  };
}

// ------------------------------------------------------------------------------------ bug hunt

function BugHunt({ onExit }: { onExit: () => void }) {
  const solved = useTrainers((s) => s.bugsSolved);
  const solve = useTrainers((s) => s.solveBug);
  const addXp = useLearn((s) => s.addXp);
  const order = useMemo(() => [...BUGS].sort((a, b) => Number(solved.includes(a.id)) - Number(solved.includes(b.id)) || a.level - b.level), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const bug: BugCase = order[i % order.length];
  const { lines, answer } = useMemo(() => prepareBug(bug), [bug]);
  const right = picked === answer;
  const pickLine = (n: number) => {
    if (right) return;
    setPicked(n);
    setTries((t) => t + 1);
    if (n === answer) {
      solve(bug.id);
      addXp(tries === 0 ? 8 : 4);
      if (tries > 0)
        useReview.getState().addCards([{ id: `bug:${bug.id}`, front: tr(`Unity bug: ${pick(bug.symptom)}`, `Баг Unity: ${pick(bug.symptom)}`), back: `${bug.fix.trim()}\n\n${pick(bug.why)}`, from: tr('Find the bug', 'Найди баг'), code: lines.join('\n') }]);
    }
  };
  const next = () => {
    setI((x) => x + 1);
    setPicked(null);
    setTries(0);
    setHint(false);
  };
  return (
    <div className="tr-game" data-testid="bug-hunt">
      <TrainerHead title={tr('🐞 Find the bug', '🐞 Найди баг')} onExit={onExit} extra={`${solved.length}/${BUGS.length}`} />
      <div className="tr-symptom">
        <span className="pill">{'★'.repeat(bug.level)}</span> <b>{tr('In Unity:', 'В Unity:')}</b> {pick(bug.symptom)}
      </div>
      <p className="muted">{tr('Tap the line with the mistake.', 'Нажми на строку с ошибкой.')}</p>
      <div className="tr-file">{bug.file}</div>
      <div className="tr-code" role="list" data-testid="bug-code">
        {lines.map((l, n) => (
          <button key={n} role="listitem" className={`tr-line${picked === n ? (n === answer ? ' good' : ' bad') : ''}${right && n === answer ? ' good' : ''}`} onClick={() => pickLine(n)} data-testid="bug-line" disabled={!l.trim()}>
            <span className="tr-n">{n + 1}</span>
            <code>{l || ' '}</code>
          </button>
        ))}
      </div>
      {picked !== null && !right ? (
        <p className="bad-text" data-testid="bug-feedback">
          ❌ {tr('Not this line. Look again', 'Не эта строка. Посмотри ещё раз')}
          {!hint ? (
            <button className="btn small ghost" onClick={() => setHint(true)}>
              <Lightbulb size={13} /> {tr('Hint', 'Подсказка')}
            </button>
          ) : null}
        </p>
      ) : null}
      {hint && !right ? <p className="mu-hint">💡 {pick(bug.hint)}</p> : null}
      {right ? (
        <div className="tr-answer" data-testid="bug-answer">
          <p className="ok-text">✅ {tries === 1 ? tr('Found it on the first try!', 'Нашёл с первого раза!') : tr('Found it!', 'Нашёл!')}</p>
          <p>{pick(bug.why)}</p>
          <div className="tr-fix">
            <div>
              <span className="bad-text">✗</span> <code>{lines[answer].trim()}</code>
            </div>
            <div>
              <span className="ok-text">✓</span> <code>{bug.fix.trim()}</code>
            </div>
          </div>
          <div className="ws-row">
            <Speak text={pick(bug.why)} />
            <button className="btn big primary" onClick={next} data-testid="bug-next">
              {tr('Next bug', 'Следующий баг')} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
      <details className="tr-more">
        <summary>{tr('Show the whole fixed script', 'Показать весь исправленный скрипт')}</summary>
        <pre>{right ? fixedCode(bug) : tr('(find the bug first)', '(сначала найди баг)')}</pre>
      </details>
    </div>
  );
}

// --------------------------------------------------------------------------- predict the output

function PredictGame({ onExit }: { onExit: () => void }) {
  const record = useTrainers((s) => s.predicted);
  const best = useTrainers((s) => s.predictBestStreak);
  const addXp = useLearn((s) => s.addXp);
  const [q, setQ] = useState<PredictQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [trace, setTrace] = useState<{ steps: TraceStep[]; output: string[] } | null>(null);
  const [topic, setTopic] = useState<string>('all');
  ensureMainThreadTreeSitter();
  const load = async () => {
    setPicked(null);
    setTrace(null);
    const pool = topic === 'all' ? PREDICT : PREDICT.filter((t) => t.id === topic);
    for (let k = 0; k < 5; k++) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      const made = await makeQuestion(t, Math.floor(Math.random() * 1e9), async (code) => {
        const r = await runCSharp(code);
        return r.status === 'done' ? r.output : null;
      });
      if (made && made.options.length >= 3) {
        setQ(made);
        return;
      }
    }
  };
  useEffect(() => {
    void load();
  }, [topic]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (n: number) => {
    if (!q || picked !== null) return;
    setPicked(n);
    const ok = n === q.answer;
    const s = ok ? streak + 1 : 0;
    setStreak(s);
    record(ok, s);
    if (ok) addXp(3 + Math.min(5, s));
    else useReview.getState().addCards([{ id: `predict:${q.id}`, front: tr(`What does it print? (${pick(q.topic)})`, `Что выведет? (${pick(q.topic)})`), back: `${q.options[q.answer].text}\n\n${pick(q.explain)}`, from: tr('Predict the output', 'Что выведет?'), code: q.code }]);
  };
  const steps = async () => {
    if (!q) return;
    const r = await runCSharp(`using System;\nusing System.Collections.Generic;\n${q.code}`, [], { trace: true });
    setTrace({ steps: r.steps, output: r.output });
  };
  return (
    <div className="tr-game" data-testid="predict">
      <TrainerHead title={tr('🔮 What will it print?', '🔮 Что выведет код?')} onExit={onExit} extra={`🔥 ${streak} · ${tr('best', 'рекорд')} ${best}`} />
      <div className="ws-row">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={tr('Topic', 'Тема')} data-testid="predict-topic">
          <option value="all">{tr('All topics (mixed)', 'Все темы (вперемешку)')}</option>
          {PREDICT.map((t) => (
            <option key={t.id} value={t.id}>
              {pick(t.topic)}
            </option>
          ))}
        </select>
        <span className="muted small">{tr('New numbers every time — endless practice. The right answer comes from really running the code.', 'Каждый раз новые числа — бесконечная тренировка. Правильный ответ получен настоящим запуском кода.')}</span>
      </div>
      {!q ? (
        <span className="spinner" aria-hidden />
      ) : (
        <>
          <p className="tr-topic">{pick(q.topic)}</p>
          <pre className="tr-snippet" data-testid="predict-code">
            {q.code}
          </pre>
          <div className="cv-options">
            {q.options.map((o, n) => (
              <button key={n} className={`cv-opt${picked !== null && n === q.answer ? ' good' : ''}${picked === n && n !== q.answer ? ' bad' : ''}`} onClick={() => choose(n)} data-testid="predict-option">
                <pre>{o.text}</pre>
              </button>
            ))}
          </div>
          {picked !== null ? (
            <div className="tr-answer" data-testid="predict-feedback">
              <p className={picked === q.answer ? 'ok-text' : 'bad-text'}>{picked === q.answer ? tr('✅ Right!', '✅ Верно!') : tr('❌ Not quite.', '❌ Не совсем.')}</p>
              {picked !== q.answer && q.options[picked].why ? <p>🤔 {pick(q.options[picked].why as Text2)}</p> : null}
              <p>{pick(q.explain)}</p>
              <div className="ws-row">
                <button className="btn" onClick={() => void steps()} data-testid="predict-steps">
                  <ListChecks size={15} /> {tr('Watch it step by step', 'Посмотреть по шагам')}
                </button>
                <button className="btn big primary" onClick={() => void load()} data-testid="predict-next">
                  {tr('Next', 'Дальше')} <ArrowRight size={16} />
                </button>
              </div>
              {trace ? <TraceView code={`using System;\nusing System.Collections.Generic;\n${q.code}`} steps={trace.steps} output={trace.output} /> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------- lifecycle

function LifecycleGame({ onExit }: { onExit: () => void }) {
  const record = useTrainers((s) => s.lifecycle);
  const addXp = useLearn((s) => s.addXp);
  const [cards, setCards] = useState(() => shuffle(LIFECYCLE));
  const [placed, setPlaced] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<string | null>(null);
  const done = placed.length === LIFECYCLE.length;
  const tap = (name: string) => {
    if (done || placed.includes(name)) return;
    if (LIFECYCLE[placed.length].name === name) {
      const next = [...placed, name];
      setPlaced(next);
      setWrong(null);
      if (next.length === LIFECYCLE.length) {
        const score = LIFECYCLE.length - mistakes;
        record(score);
        addXp(mistakes === 0 ? 15 : 8);
      }
    } else {
      setMistakes((m) => m + 1);
      setWrong(name);
    }
  };
  const restart = () => {
    setCards(shuffle(LIFECYCLE));
    setPlaced([]);
    setMistakes(0);
    setWrong(null);
  };
  return (
    <div className="tr-game" data-testid="lifecycle">
      <TrainerHead title={tr('🔄 Unity event order', '🔄 Порядок событий Unity')} onExit={onExit} extra={tr(`mistakes: ${mistakes}`, `ошибок: ${mistakes}`)} />
      <p>{tr('Tap the methods in the order Unity calls them for one object.', 'Нажимай методы в том порядке, в котором Unity вызывает их для одного объекта.')}</p>
      <ol className="tr-placed" data-testid="lifecycle-placed">
        {LIFECYCLE.map((s, k) => (
          <li key={s.name} className={k < placed.length ? 'on' : ''}>
            {k < placed.length ? (
              <>
                <b>{s.name}</b> <span className="muted small">— {pick(s.when)}. {pick(s.use)}</span>
              </>
            ) : (
              '…'
            )}
          </li>
        ))}
      </ol>
      <div className="tr-cards">
        {cards
          .filter((c) => !placed.includes(c.name))
          .map((c) => (
            <button key={c.name} className={`tr-card${wrong === c.name ? ' bad' : ''}`} onClick={() => tap(c.name)} data-testid="lifecycle-card">
              {c.name}
            </button>
          ))}
      </div>
      {wrong ? <p className="bad-text">{tr(`Not yet: ${wrong} comes later.`, `Пока нет: ${wrong} будет позже.`)}</p> : null}
      {done ? (
        <div className="tr-answer" data-testid="lifecycle-done">
          <p className="ok-text">{mistakes === 0 ? tr('🏆 Perfect order!', '🏆 Идеальный порядок!') : tr(`✅ Done with ${mistakes} mistakes.`, `✅ Готово, ошибок: ${mistakes}.`)}</p>
          <button className="btn" onClick={restart}>
            <RotateCcw size={15} /> {tr('Again', 'Ещё раз')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WhichGame({ onExit }: { onExit: () => void }) {
  const addXp = useLearn((s) => s.addXp);
  const [order] = useState(() => shuffle(WHICH));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const q = order[i % order.length];
  const options = useMemo(() => shuffle(['Awake', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnEnable', 'OnDestroy']), [i]);
  return (
    <div className="tr-game" data-testid="which">
      <TrainerHead title={tr('📍 Where does this code go?', '📍 Куда писать этот код?')} onExit={onExit} extra={`${(i % order.length) + 1}/${order.length}`} />
      <p className="rv-front">{pick(q.q)}</p>
      <div className="tr-cards">
        {options.map((o) => (
          <button
            key={o}
            className={`tr-card${picked && o === q.answer ? ' good' : ''}${picked === o && o !== q.answer ? ' bad' : ''}`}
            onClick={() => {
              if (picked === q.answer) return;
              setPicked(o);
              if (o === q.answer) addXp(3);
            }}
            data-testid="which-option"
          >
            {o}
          </button>
        ))}
      </div>
      {picked ? (
        <div className="tr-answer">
          <p className={picked === q.answer ? 'ok-text' : 'bad-text'}>{picked === q.answer ? `✅ ${q.answer}` : tr('❌ Try another one.', '❌ Попробуй другой.')}</p>
          {picked === q.answer ? (
            <>
              <p>{pick(q.why)}</p>
              <button
                className="btn big primary"
                onClick={() => {
                  setI(i + 1);
                  setPicked(null);
                }}
                data-testid="which-next"
              >
                {tr('Next', 'Дальше')} <ArrowRight size={16} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------- cheat sheet

export function cheatSheetMarkdown(): string {
  const out = [`# ${tr('Unity C# cheat sheet', 'Шпаргалка Unity C#')}`, ''];
  out.push(`## ${tr('Event order', 'Порядок событий')}`, '', LIFECYCLE.map((s) => `${s.name} — ${pick(s.when)}`).join('\n\n'), '');
  for (const sec of CHEAT_SHEET) {
    out.push(`## ${pick(sec.title)}`, '');
    for (const [code, what] of sec.rows) out.push(`- \`${code}\` — ${pick(what)}`);
    out.push('');
  }
  return out.join('\n');
}

function CheatSheet({ onExit }: { onExit: () => void }) {
  const open = useTrainers((s) => s.openCheat);
  useEffect(() => open(), [open]);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([cheatSheetMarkdown()], { type: 'text/markdown;charset=utf-8' }));
    a.download = 'unity-cheat-sheet.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="tr-game tr-cheat" data-testid="cheat-sheet">
      <TrainerHead title={tr('📋 Unity C# cheat sheet', '📋 Шпаргалка Unity C#')} onExit={onExit} />
      <div className="ws-row">
        <button className="btn" onClick={download} data-testid="cheat-download">
          <Download size={15} /> {tr('Save as a file (.md)', 'Сохранить файлом (.md)')}
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} /> {tr('Print', 'Печать')}
        </button>
      </div>
      <section className="tr-sheet">
        <h3>{tr('Event order', 'Порядок событий')}</h3>
        <div className="tr-flow">
          {LIFECYCLE.map((s, k) => (
            <span key={s.name} className="tr-flow-step" title={pick(s.use)}>
              <b>{s.name}</b>
              <span className="muted small">{pick(s.when)}</span>
              {k < LIFECYCLE.length - 1 ? <span className="tr-arrow">→</span> : null}
            </span>
          ))}
        </div>
      </section>
      {CHEAT_SHEET.map((sec) => (
        <section key={pick(sec.title)} className="tr-sheet">
          <h3>{pick(sec.title)}</h3>
          <table>
            <tbody>
              {sec.rows.map(([code, what]) => (
                <tr key={code}>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td>{pick(what)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------- achievements

function Badges({ onExit }: { onExit: () => void }) {
  const f = useFacts();
  const got = ACHIEVEMENTS.filter((a) => a.done(f)).length;
  return (
    <div className="tr-game" data-testid="badges">
      <TrainerHead title={tr('🏅 Achievements', '🏅 Достижения')} onExit={onExit} extra={`${got}/${ACHIEVEMENTS.length}`} />
      <DailyGoal />
      <div className="tr-badges">
        {ACHIEVEMENTS.map((a) => {
          const ok = a.done(f);
          return (
            <div key={a.id} className={`tr-badge${ok ? ' on' : ''}`} data-testid="badge">
              <span className="tr-badge-icon" aria-hidden>
                {ok ? a.icon : '🔒'}
              </span>
              <b>{pick(a.title)}</b>
              <span className="muted small">{pick(a.how)}</span>
              {!ok ? (
                <span className="ln-bar" role="progressbar" aria-valuenow={Math.round(a.progress(f) * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${a.progress(f) * 100}%` }} />
                </span>
              ) : (
                <Check size={16} className="ok-text" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------- home

function TrainerHead({ title, onExit, extra }: { title: string; onExit: () => void; extra?: string }) {
  return (
    <header className="tr-head">
      <button className="btn" onClick={onExit} data-testid="trainer-exit">
        <ArrowLeft size={16} /> {tr('All trainers', 'Все тренажёры')}
      </button>
      <h2>{title}</h2>
      {extra ? <span className="pill">{extra}</span> : null}
    </header>
  );
}

export function Trainers() {
  const [screen, setScreen] = useState<Screen>('home');
  const t = useTrainers();
  const f = useFacts();
  const back = () => setScreen('home');
  if (screen === 'bugs') return <BugHunt onExit={back} />;
  if (screen === 'predict') return <PredictGame onExit={back} />;
  if (screen === 'lifecycle') return <LifecycleGame onExit={back} />;
  if (screen === 'which') return <WhichGame onExit={back} />;
  if (screen === 'cheat') return <CheatSheet onExit={back} />;
  if (screen === 'badges') return <Badges onExit={back} />;
  const cards: { id: Screen; icon: string; title: string; about: string; stat: string }[] = [
    { id: 'bugs', icon: '🐞', title: tr('Find the bug', 'Найди баг'), about: tr('Real Unity mistakes: from the symptom to the wrong line.', 'Настоящие ошибки Unity: от симптома к неправильной строке.'), stat: `${t.bugsSolved.length}/${BUGS.length}` },
    { id: 'predict', icon: '🔮', title: tr('What will it print?', 'Что выведет код?'), about: tr('Endless questions; wrong answers explain the typical misunderstanding.', 'Бесконечные вопросы; неверные ответы объясняют типичное заблуждение.'), stat: tr(`best streak ${t.predictBestStreak}`, `рекорд ${t.predictBestStreak} подряд`) },
    { id: 'lifecycle', icon: '🔄', title: tr('Unity event order', 'Порядок событий Unity'), about: tr('Awake → Start → Update… tap them in order.', 'Awake → Start → Update… расставь по порядку.'), stat: `${t.lifecycleBest}/${LIFECYCLE.length}` },
    { id: 'which', icon: '📍', title: tr('Where does this code go?', 'Куда писать этот код?'), about: tr('Update, Start, LateUpdate or FixedUpdate?', 'Update, Start, LateUpdate или FixedUpdate?'), stat: `${WHICH.length}` },
    { id: 'cheat', icon: '📋', title: tr('Cheat sheet', 'Шпаргалка'), about: tr('The most used Unity lines on one page. Download or print.', 'Самые нужные строки Unity на одной странице. Скачать или распечатать.'), stat: '' },
    { id: 'badges', icon: '🏅', title: tr('Achievements', 'Достижения'), about: tr('Small wins: lessons, levels, bugs, streaks.', 'Маленькие победы: уроки, уровни, баги, серии.'), stat: `${ACHIEVEMENTS.filter((a) => a.done(f)).length}/${ACHIEVEMENTS.length}` },
  ];
  return (
    <div className="ln" data-testid="trainers">
      <div className="ln-home">
        <h1>{tr('Trainers — 5 minutes a day', 'Тренажёры — по 5 минут в день')}</h1>
        <DailyGoal />
        <div className="tr-home">
          {cards.map((c) => (
            <button key={c.id} className="start-card" onClick={() => setScreen(c.id)} data-testid={`trainer-${c.id}`}>
              <span className="start-emoji" aria-hidden>
                {c.icon}
              </span>
              <b>{c.title}</b>
              <span>{c.about}</span>
              {c.stat ? <span className="pill">{c.stat}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

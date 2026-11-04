// "Learn" — short lessons for complete beginners: read a tiny game program, watch it run step by
// step (boxes with values, where the program is, what appears on the screen), then play 3–4 quick
// games about it. One thing at a time, big buttons, always a clear "next" step.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Flame, Pause, Play, RotateCcw, Star, Trophy, X } from 'lucide-react';
import { pick, tr, type Text2 } from '../i18n';
import { useCode } from '../ui/store';
import {
  LESSONS,
  TRACKS,
  buggyLines,
  codeLines,
  displayName,
  formatVal,
  framesOf,
  lessonsFor,
  lineOf,
  stepsFor,
  type CodeLine,
  type Game,
  type Lesson,
  type TrackId,
  type Val,
} from './lessons';
import { XP_PER_LEVEL, key, useLearn } from './progress';
import { useReview } from '../memory/review';
import { useResume } from '../memory/resume';
import { Speak } from '../memory/MemoryViews';

/** Questions of a finished lesson become review cards, so they come back in a few days. */
function addLessonCards(lesson: Lesson, track: TrackId) {
  const code = codeLines(lesson, track)
    .map((l) => l.text)
    .join('\n');
  const t = TRACKS.find((x) => x.id === track)!;
  const cards = lesson.games.flatMap((g, i) => {
    if (g.kind !== 'choice') return [];
    const right = g.options[g.answer];
    return [{ id: `lesson:${track}:${lesson.id}:${i}`, front: pick(g.q), back: `${typeof right === 'string' ? right : pick(right)}\n\n${pick(g.why)}`, from: `${t.name} · ${pick(lesson.title)}`, code }];
  });
  useReview.getState().addCards(cards);
}

// ---------------------------------------------------------------------------------------------
// Small pieces

function XpBar() {
  const xp = useLearn((s) => s.xp);
  const streak = useLearn((s) => s.streak);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const inLevel = xp % XP_PER_LEVEL;
  return (
    <div className="ln-xp" data-testid="learn-xp">
      <span className="ln-level" title={tr('Your level', 'Твой уровень')}>
        <Trophy size={16} aria-hidden /> {tr('Level', 'Уровень')} {level}
      </span>
      <span className="ln-bar" role="progressbar" aria-valuemin={0} aria-valuemax={XP_PER_LEVEL} aria-valuenow={inLevel} aria-label={tr('Experience to the next level', 'Опыт до следующего уровня')}>
        <span style={{ width: `${inLevel}%` }} />
      </span>
      <span className="ln-xp-n">
        {xp} XP
      </span>
      {streak > 0 ? (
        <span className="ln-streak" title={tr('Days in a row', 'Дней подряд')}>
          <Flame size={16} aria-hidden /> {streak}
        </span>
      ) : null}
    </div>
  );
}

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="ln-stars" aria-label={tr(`${n} of 3 stars`, `${n} из 3 звёзд`)}>
      {[1, 2, 3].map((i) => (
        <Star key={i} size={size} className={i <= n ? 'on' : ''} aria-hidden />
      ))}
    </span>
  );
}

function CodeBlock({ lines, current, onToken, mark, langClass }: { lines: CodeLine[]; current?: number; onToken?: (line: number, col: number) => void; mark?: { line: number; good: boolean } | null; langClass?: string }) {
  return (
    <div className={`ln-code ${langClass ?? ''}`} role="list">
      {lines.map((l, i) => (
        <div key={i} role="listitem" className={`ln-line${i === current ? ' cur' : ''}${mark && mark.line === i ? (mark.good ? ' good' : ' bad') : ''}`} data-line={i}>
          <span className="ln-arrow" aria-hidden>
            {i === current ? '▶' : ''}
          </span>
          <span className="ln-num" aria-hidden>
            {i + 1}
          </span>
          <span className="ln-text">
            {onToken
              ? tokens(l.text).map((t, k) => (
                  <span key={k} className={t.word ? 'ln-tok' : ''} onClick={t.word ? () => onToken(i, t.col) : undefined} data-col={t.col}>
                    {t.text}
                  </span>
                ))
              : l.text || ' '}
          </span>
        </div>
      ))}
    </div>
  );
}

function tokens(text: string): { text: string; col: number; word: boolean }[] {
  const out: { text: string; col: number; word: boolean }[] = [];
  const re = /(\s+)|([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(<=|>=|==|!=|->|\+\+|--|&&|\|\||<<|>>|::|[-+*/%=<>!&|^~?:;,.()[\]{}#])/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), col: last, word: true });
    out.push({ text: m[0], col: m.index, word: !m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), col: last, word: true });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Step-by-step animation

function ValueView({ v, track, lesson }: { v: Val; track: TrackId; lesson: Lesson }) {
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'obj' in v)
    return (
      <span className="ln-obj">
        {Object.entries(v.obj).map(([k, x]) => (
          <span key={k} className="ln-field">
            <span className="ln-fname">{displayName(lesson, track, k)}</span> {formatVal(x, track)}
          </span>
        ))}
      </span>
    );
  if (Array.isArray(v))
    return (
      <span className="ln-arr">
        {v.map((x, i) => (
          <span key={i} className="ln-cell">
            <span className="ln-idx">[{i}]</span>
            {formatVal(x, track)}
          </span>
        ))}
      </span>
    );
  if (typeof v === 'object' && v !== null && 'ref' in v)
    return (
      <span className="ln-ref">
        {tr('address of', 'адрес')} {v.ref} →
      </span>
    );
  return <span>{formatVal(v, track)}</span>;
}

/** Use the language's own spelling of names in the narration (e.g. Damage in C#). */
function renameText(lesson: Lesson, track: TrackId, text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(lesson.rename?.[track] ?? {})) out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  return out;
}

export function Animator({ lesson, track, onDone }: { lesson: Lesson; track: TrackId; onDone: () => void }) {
  const lines = useMemo(() => codeLines(lesson, track), [lesson, track]);
  const steps = useMemo(() => stepsFor(lesson, track), [lesson, track]);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const step = steps[i];
  const frames = framesOf(step, track);
  const prev = i > 0 ? framesOf(steps[i - 1], track) : [];
  const output = steps
    .slice(0, i + 1)
    .filter((s) => s.print !== undefined)
    .map((s) => s.print);
  const last = i === steps.length - 1;

  useEffect(() => {
    if (!auto) return;
    if (last) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(steps.length - 1, x + 1)), 2200);
    return () => clearTimeout(t);
  }, [auto, i, last, steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement;
      if (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length]);

  const changedNow = (fnIndex: number, name: string) => {
    if (!step.changed?.includes(name)) return false;
    const before = prev[fnIndex]?.vars[name];
    const after = frames[fnIndex]?.vars[name];
    return JSON.stringify(before) !== JSON.stringify(after);
  };

  return (
    <div className="ln-anim" data-testid="animator">
      <div className="ln-anim-left">
        <div className="ln-panel-title">{tr('The program', 'Программа')}</div>
        <CodeBlock lines={lines} current={lineOf(lines, step.at)} />
      </div>
      <div className="ln-anim-right">
        <div className="ln-say" aria-live="polite" data-testid="anim-say">
          <span className="ln-say-n">
            {tr('Step', 'Шаг')} {i + 1} / {steps.length}
          </span>
          <p>{renameText(lesson, track, pick(step.say))}</p>
          <Speak text={renameText(lesson, track, pick(step.say))} />
        </div>
        <div className="ln-panel-title">{tr('Where are we now', 'Где мы сейчас')}</div>
        <div className="ln-frames" data-testid="anim-frames">
          {[...frames].reverse().map((f, ri) => {
            const fi = frames.length - 1 - ri;
            const entries = Object.entries(f.vars);
            return (
              <div key={`${f.fn}-${fi}`} className={`ln-frame${fi === frames.length - 1 ? ' active' : ''}`}>
                <div className="ln-frame-head">
                  {fi === frames.length - 1 ? '▶ ' : ''}
                  {f.fn ? (
                    <>
                      {tr('inside', 'внутри')} <code>{displayName(lesson, track, f.fn)}</code>
                    </>
                  ) : (
                    tr('main program', 'главная программа')
                  )}
                  {fi < frames.length - 1 ? <span className="muted small"> — {tr('waiting for the answer', 'ждёт ответа')}</span> : null}
                </div>
                <div className="ln-vars">
                  {entries.length ? (
                    entries.map(([name, v]) => (
                      <div key={name} className={`ln-var${changedNow(fi, name) ? ' chg' : ''}`} data-testid="anim-var">
                        <span className="ln-vname">{displayName(lesson, track, name)}</span>
                        <span className="ln-vval">
                          <ValueView v={v} track={track} lesson={lesson} />
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="muted small">{tr('no boxes yet', 'пока нет коробок')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ln-panel-title">{tr('Screen', 'Экран')}</div>
        <pre className="ln-screen" data-testid="anim-output">
          {output.length ? output.join('\n') : <span className="muted">{tr('(nothing yet)', '(пока пусто)')}</span>}
        </pre>
      </div>
      <div className="ln-controls">
        <button className="btn big" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} data-testid="anim-back">
          <ArrowLeft size={18} /> {tr('Back', 'Назад')}
        </button>
        <button className="btn big" onClick={() => setAuto(!auto)} disabled={last} aria-pressed={auto} data-testid="anim-auto">
          {auto ? <Pause size={18} /> : <Play size={18} />} {auto ? tr('Pause', 'Пауза') : tr('Play by itself', 'Само по шагам')}
        </button>
        {last ? (
          <button className="btn big primary" onClick={onDone} data-testid="anim-done">
            {tr('Now let\'s play', 'Теперь поиграем')} 🎮 <ArrowRight size={18} />
          </button>
        ) : (
          <button className="btn big primary" onClick={() => setI(i + 1)} data-testid="anim-next">
            {tr('Next step', 'Следующий шаг')} <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Games

interface GameProps {
  lesson: Lesson;
  track: TrackId;
  onSolved: (firstTry: boolean) => void;
}

function Feedback({ ok, why, tries }: { ok: boolean | null; why: Text2; tries: number }) {
  if (ok === null) return null;
  return (
    <div className={`ln-fb ${ok ? 'ok' : 'no'}`} role="status" data-testid="game-feedback">
      {ok ? (
        <>
          <Check size={18} aria-hidden /> <b>{tr('Correct!', 'Верно!')}</b> {pick(why)}
        </>
      ) : (
        <>
          <X size={18} aria-hidden /> <b>{tr('Not quite.', 'Не совсем.')}</b> {tries >= 2 ? pick(why) : tr('Try again — you can do it.', 'Попробуй ещё раз — у тебя получится.')}
        </>
      )}
    </div>
  );
}

function ChoiceGame({ game, lesson, track, onSolved }: GameProps & { game: Extract<Game, { kind: 'choice' }> }) {
  const [tries, setTries] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const solved = chosen === game.answer;
  const lines = useMemo(() => codeLines(lesson, track), [lesson, track]);
  const choose = (k: number) => {
    if (solved) return;
    setChosen(k);
    setTries(tries + 1);
    if (k === game.answer) onSolved(tries === 0);
  };
  return (
    <div className="ln-game" data-testid="game-choice">
      <h3 className="ln-q">{pick(game.q)}</h3>
      <CodeBlock lines={lines} />
      <div className="ln-options">
        {game.options.map((o, k) => (
          <button key={k} className={`ln-opt${chosen === k ? (k === game.answer ? ' good' : ' bad') : ''}${solved && k === game.answer ? ' good' : ''}`} onClick={() => choose(k)} disabled={solved} data-testid="game-option">
            <pre>{pick(o)}</pre>
          </button>
        ))}
      </div>
      <Feedback ok={chosen === null ? null : solved} why={game.why} tries={tries} />
    </div>
  );
}

function BugGame({ game, lesson, track, onSolved }: GameProps & { game: Extract<Game, { kind: 'bug' }> }) {
  const bug = useMemo(() => buggyLines(lesson, track, game), [lesson, track, game]);
  const [tries, setTries] = useState(0);
  const [mark, setMark] = useState<{ line: number; good: boolean } | null>(null);
  if (!bug) return null;
  const solved = !!mark?.good;
  const click = (line: number, col: number) => {
    if (solved) return;
    const t = bug.lines[line].text;
    const tokenEnd = (() => {
      const tk = tokens(t).find((x) => x.col === col);
      return col + (tk?.text.length ?? 1);
    })();
    const good = line === bug.bugLine && col <= bug.bugCol && bug.bugCol < tokenEnd;
    setMark({ line, good });
    setTries(tries + 1);
    if (good) onSolved(tries === 0);
  };
  return (
    <div className="ln-game" data-testid="game-bug">
      <h3 className="ln-q">{pick(game.q)}</h3>
      <p className="muted">{tr('Tap the wrong symbol or word.', 'Нажми на неправильный значок или слово.')}</p>
      <CodeBlock lines={bug.lines} onToken={click} mark={mark} />
      {mark && !mark.good && tries >= 1 ? (
        <p className="ln-hint">
          {tr('Hint: look at line', 'Подсказка: посмотри на строку')} {bug.bugLine + 1}.
        </p>
      ) : null}
      <Feedback ok={mark === null ? null : mark.good} why={game.why} tries={tries + 1} />
    </div>
  );
}

function OrderGame({ game, lesson, track, onSolved }: GameProps & { game: Extract<Game, { kind: 'order' }> }) {
  const all = useMemo(() => codeLines(lesson, track), [lesson, track]);
  const correct = useMemo(() => game.markers.map((m) => all[lineOf(all, m)].text.trim()), [all, game.markers]);
  // A fixed shuffle that is never the correct order.
  const shuffled = useMemo(() => {
    const idx = correct.map((_, i) => i);
    const s = [...idx.slice(1), idx[0]].reverse();
    return s.every((x, i) => x === i) ? [...idx].reverse() : s;
  }, [correct]);
  const [picked, setPicked] = useState<number[]>([]);
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const done = picked.length === correct.length;

  useEffect(() => {
    if (!done || result !== null) return;
    const ok = picked.every((p, i) => p === i);
    setResult(ok);
    setTries((t) => t + 1);
    if (ok) onSolved(tries === 0);
  }, [done, picked, result, tries, onSolved]);

  return (
    <div className="ln-game" data-testid="game-order">
      <h3 className="ln-q">{pick(game.q)}</h3>
      <p className="muted">{tr('Tap the lines one after another, from the first to the last.', 'Нажимай на строки по очереди — с первой до последней.')}</p>
      <div className="ln-order">
        <div>
          <div className="ln-panel-title">{tr('Lines', 'Строки')}</div>
          {shuffled.map((ci) =>
            picked.includes(ci) ? null : (
              <button key={ci} className="ln-oline" onClick={() => setPicked([...picked, ci])} disabled={result === true} data-testid="order-pool">
                <code>{correct[ci]}</code>
              </button>
            ),
          )}
        </div>
        <div>
          <div className="ln-panel-title">{tr('Your program', 'Твоя программа')}</div>
          {picked.map((ci, pos) => (
            <button
              key={ci}
              className={`ln-oline placed${result === false && ci !== pos ? ' bad' : ''}${result === true ? ' good' : ''}`}
              onClick={() => {
                if (result === true) return;
                setPicked(picked.filter((x) => x !== ci));
                setResult(null);
              }}
              title={tr('Tap to take it back', 'Нажми, чтобы убрать')}
              data-testid="order-placed"
            >
              <span className="ln-num">{pos + 1}</span> <code>{correct[ci]}</code>
            </button>
          ))}
          {!picked.length ? <p className="muted small">{tr('Empty — tap a line on the left.', 'Пусто — нажми на строку слева.')}</p> : null}
        </div>
      </div>
      {result === false ? (
        <button
          className="btn"
          onClick={() => {
            setPicked([]);
            setResult(null);
          }}
        >
          <RotateCcw size={14} /> {tr('Start again', 'Начать заново')}
        </button>
      ) : null}
      <Feedback ok={result} why={game.why} tries={tries} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One lesson

type Stage = 'intro' | 'watch' | 'play' | 'done';

/** The same lesson in every language, side by side: the ideas are the same, only the spelling differs. */
function CompareLanguages({ lesson, track }: { lesson: Lesson; track: TrackId }) {
  const [open, setOpen] = useState(false);
  const others = TRACKS.filter((t) => t.id !== track && lesson.code[t.id]);
  if (!others.length) return null;
  return (
    <div className="ln-compare">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="compare-languages">
        🔤 {open ? tr('Hide other languages', 'Скрыть другие языки') : tr('Compare with other languages', 'Сравнить с другими языками')}
      </button>
      {open ? (
        <div className="ln-compare-grid" data-testid="compare-grid">
          {others.map((t) => (
            <div key={t.id} className="ln-compare-col">
              <b style={{ color: t.color }}>{t.name}</b>
              <pre>{codeLines(lesson, t.id).map((l) => l.text).join('\n')}</pre>
            </div>
          ))}
          <p className="muted small">{tr('Same idea, different spelling. Learn the idea once — reading the others becomes easy.', 'Одна и та же идея, разное написание. Пойми идею один раз — читать остальные станет легко.')}</p>
        </div>
      ) : null}
    </div>
  );
}

function LessonPlayer({ lesson, track, onExit, onNext }: { lesson: Lesson; track: TrackId; onExit: () => void; onNext: (() => void) | null }) {
  const [stage, setStage] = useState<Stage>('intro');
  const [gi, setGi] = useState(0);
  const [solved, setSolved] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [earned, setEarned] = useState(0);
  const addXp = useLearn((s) => s.addXp);
  const finishLesson = useLearn((s) => s.finishLesson);
  const setView = useCode((s) => s.setView);
  const t = TRACKS.find((x) => x.id === track)!;
  const game = lesson.games[gi];
  const stars = mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
  const stages: { s: Stage; label: string }[] = [
    { s: 'intro', label: tr('1. Learn', '1. Узнай') },
    { s: 'watch', label: tr('2. Watch it run', '2. Смотри, как работает') },
    { s: 'play', label: tr('3. Play', '3. Играй') },
    { s: 'done', label: tr('4. Done', '4. Готово') },
  ];

  const onSolved = (firstTry: boolean) => {
    setSolved(true);
    if (!firstTry) setMistakes((m) => m + 1);
    const xp = firstTry ? 10 : 5;
    setEarned((e) => e + xp);
    addXp(xp);
  };

  const nextGame = () => {
    setSolved(false);
    if (gi + 1 < lesson.games.length) setGi(gi + 1);
    else {
      addXp(20);
      setEarned((e) => e + 20);
      finishLesson(track, lesson.id, stars);
      addLessonCards(lesson, track);
      setStage('done');
    }
  };

  return (
    <div className="ln-lesson" data-testid="lesson">
      <header className="ln-lesson-head">
        <button className="btn" onClick={onExit} data-testid="lesson-exit">
          <ArrowLeft size={16} /> {tr('All lessons', 'Все уроки')}
        </button>
        <h2>
          <span aria-hidden>{lesson.icon}</span> {pick(lesson.title)} <span className="pill" style={{ borderColor: t.color }}>{t.name}</span>
        </h2>
        <ol className="ln-stages">
          {stages.map((s) => (
            <li key={s.s} className={s.s === stage ? 'on' : stages.findIndex((x) => x.s === stage) > stages.findIndex((x) => x.s === s.s) ? 'past' : ''}>
              {s.label}
            </li>
          ))}
        </ol>
      </header>

      {stage === 'intro' ? (
        <div className="ln-intro" data-testid="lesson-intro">
          <div className="ln-goal">
            🎯 {pick(lesson.goal)}
          </div>
          <p className="ln-intro-text">{pick(lesson.intro)}</p>
          <CodeBlock lines={codeLines(lesson, track)} />
          <CompareLanguages lesson={lesson} track={track} />
          {lesson.gameNote?.[track] ? (
            <p className="ln-note">
              🎮 <b>{tr('In real games:', 'В настоящих играх:')}</b> {pick(lesson.gameNote[track])}
            </p>
          ) : null}
          <div className="ln-row">
            <button className="btn big primary" onClick={() => setStage('watch')} data-testid="lesson-watch">
              <Play size={18} /> {tr('Show me how it runs, step by step', 'Покажи, как это работает, по шагам')}
            </button>
            <button
              className="btn big"
              onClick={() => {
                useCode.setState({ glossaryConcept: lesson.concept });
                setView('glossary');
              }}
            >
              <BookOpen size={18} /> {tr('Read more about this idea', 'Подробнее об этой идее')}
            </button>
          </div>
        </div>
      ) : null}

      {stage === 'watch' ? <Animator lesson={lesson} track={track} onDone={() => setStage('play')} /> : null}

      {stage === 'play' && game ? (
        <div className="ln-play">
          <div className="ln-game-n">
            {tr('Game', 'Игра')} {gi + 1} / {lesson.games.length}
          </div>
          {game.kind === 'choice' ? (
            <ChoiceGame key={gi} game={game} lesson={lesson} track={track} onSolved={onSolved} />
          ) : game.kind === 'bug' ? (
            <BugGame key={gi} game={game} lesson={lesson} track={track} onSolved={onSolved} />
          ) : (
            <OrderGame key={gi} game={game} lesson={lesson} track={track} onSolved={onSolved} />
          )}
          {solved ? (
            <button className="btn big primary" onClick={nextGame} data-testid="game-next">
              {gi + 1 < lesson.games.length ? tr('Next game', 'Следующая игра') : tr('Finish the lesson', 'Закончить урок')} <ArrowRight size={18} />
            </button>
          ) : null}
        </div>
      ) : null}

      {stage === 'done' ? (
        <div className="ln-done" data-testid="lesson-done">
          <div className="ln-trophy" aria-hidden>
            🏆
          </div>
          <h2>{tr('Lesson complete!', 'Урок пройден!')}</h2>
          <Stars n={stars} size={34} />
          <p>
            +{earned} XP. {mistakes === 0 ? tr('Everything right on the first try!', 'Всё правильно с первого раза!') : tr('Mistakes are how everyone learns.', 'Ошибки — это то, как учатся все.')}
          </p>
          <div className="ln-row">
            {onNext ? (
              <button className="btn big primary" onClick={onNext} data-testid="lesson-next">
                {tr('Next lesson', 'Следующий урок')} <ArrowRight size={18} />
              </button>
            ) : null}
            <button className="btn big" onClick={onExit}>
              {tr('Back to all lessons', 'Ко всем урокам')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The Learn screen

export function Learn() {
  const track = useLearn((s) => s.track);
  const setTrack = useLearn((s) => s.setTrack);
  const lessonId = useLearn((s) => s.lessonId);
  const openLesson = useLearn((s) => s.openLesson);
  const done = useLearn((s) => s.done);

  if (!track) {
    return (
      <div className="ln" data-testid="learn">
        <div className="ln-home">
          <h1>{tr('Learn to read code — by playing', 'Учись понимать код — играя')}</h1>
          <p className="ln-lead">{tr('Short lessons (about 3 minutes). Each one: a tiny piece of a game, an animation of how it runs, and quick games.', 'Короткие уроки (примерно 3 минуты). В каждом: кусочек игры, анимация того, как он работает, и быстрые мини-игры.')}</p>
          <h2 className="ln-step-title">{tr('Step 1: choose a language', 'Шаг 1: выбери язык')}</h2>
          <div className="ln-tracks">
            {TRACKS.map((t) => (
              <button key={t.id} className="ln-track" style={{ borderColor: t.color }} onClick={() => setTrack(t.id)} data-testid={`track-${t.id}`}>
                <span className="ln-track-name" style={{ color: t.color }}>
                  {t.name}
                </span>
                <span>{pick(t.about)}</span>
                <span className="muted small">
                  {lessonsFor(t.id).length} {tr('lessons', 'уроков')}
                </span>
              </button>
            ))}
          </div>
          <p className="ln-tip">
            💡 {tr('Not sure? Python is the easiest start. For Unity games choose C#, for Unreal Engine choose C++. The ideas are the same everywhere, and you can switch any time.', 'Не знаешь, что выбрать? Python — самый лёгкий старт. Для игр на Unity — C#, для Unreal Engine — C++. Идеи везде одинаковые, язык можно сменить в любой момент.')}
          </p>
        </div>
      </div>
    );
  }

  const list = lessonsFor(track);
  const t = TRACKS.find((x) => x.id === track)!;
  const lesson = list.find((l) => l.id === lessonId);
  if (lesson) {
    if (useResume.getState().last?.id !== lesson.id) setTimeout(() => useResume.getState().mark({ kind: 'lesson', id: lesson.id, title: `${t.name}: ${pick(lesson.title)}`, extra: track }), 0);
    const idx = list.indexOf(lesson);
    const next = list[idx + 1];
    return (
      <div className="ln" data-testid="learn">
        <LessonPlayer key={`${track}-${lesson.id}`} lesson={lesson} track={track} onExit={() => openLesson(null)} onNext={next ? () => openLesson(next.id) : null} />
      </div>
    );
  }

  const nextUp = list.find((l) => !done[key(track, l.id)]) ?? null;
  return (
    <div className="ln" data-testid="learn">
      <div className="ln-home">
        <div className="ln-top">
          <h1>
            {tr('Lessons', 'Уроки')}: <span style={{ color: t.color }}>{t.name}</span>
          </h1>
          <button className="btn" onClick={() => setTrack(null)} data-testid="change-track">
            {tr('Change language', 'Сменить язык')}
          </button>
        </div>
        <XpBar />
        {nextUp ? (
          <div className="ln-next">
            <span>{tr('Your next step:', 'Твой следующий шаг:')}</span>
            <button className="btn big primary" onClick={() => openLesson(nextUp.id)} data-testid="start-next-lesson">
              <Play size={18} /> {nextUp.icon} {pick(nextUp.title)}
            </button>
          </div>
        ) : (
          <div className="ln-next">🎉 {tr('You finished every lesson of this language! Try another language, or open a real project and click on the code.', 'Ты прошёл все уроки этого языка! Попробуй другой язык или открой настоящий проект и нажимай на код.')}</div>
        )}
        <ol className="ln-path" data-testid="lesson-path">
          {list.map((l, i) => {
            const r = done[key(track, l.id)];
            return (
              <li key={l.id}>
                <button className={`ln-path-item${r ? ' done' : ''}${l === nextUp ? ' next' : ''}`} onClick={() => openLesson(l.id)} data-testid="lesson-card">
                  <span className="ln-path-n">{i + 1}</span>
                  <span className="ln-path-icon" aria-hidden>
                    {l.icon}
                  </span>
                  <span className="ln-path-text">
                    <b>{pick(l.title)}</b>
                    <span className="muted small">{pick(l.goal)}</span>
                  </span>
                  {r ? <Stars n={r.stars} /> : l === nextUp ? <span className="pill">{tr('next', 'дальше')}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export const LESSON_COUNT = LESSONS.length;

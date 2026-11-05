// Memory and focus helpers: the review session (spaced repetition), the notebook, the "continue
// where I stopped" card, the focus timer with gentle breaks, and the read-aloud button.

import { useEffect, useMemo, useState } from 'react';
import { Brain, Download, Pause, Play, RotateCcw, Timer, Trash2, Volume2, X } from 'lucide-react';
import { tr } from '../i18n';
import { courseRequest } from '../learn/CourseView';
import { useLearn } from '../learn/progress';
import { useCode } from '../ui/store';
import { useWorkshop } from '../workshop/store';
import { notebookMarkdown, useNotebook } from './notebook';
import { BOX_DAYS, dueCards, useReview } from './review';
import { useResume } from './resume';
import { speak, speechAvailable, stopSpeaking } from './speech';

// ----------------------------------------------------------------------------------- read aloud

export function Speak({ text, label }: { text: string; label?: string }) {
  if (!speechAvailable()) return null;
  return (
    <button className="btn small ghost speak" onClick={() => speak(text)} onDoubleClick={stopSpeaking} aria-label={label ?? tr('Read aloud', 'Прочитать вслух')} title={tr('Read aloud (double-click to stop)', 'Прочитать вслух (двойной щелчок — стоп)')} data-testid="speak">
      <Volume2 size={14} />
    </button>
  );
}

// ------------------------------------------------------------------------------------- review

export function ReviewView() {
  const cards = useReview((s) => s.cards);
  const answer = useReview((s) => s.answer);
  const notes = useNotebook((s) => s.notes);
  const addCards = useReview((s) => s.addCards);
  const addXp = useLearn((s) => s.addXp);
  const [now] = useState(() => Date.now());
  const [practice, setPractice] = useState(false);
  const due = useMemo(() => (practice ? [...cards].sort((a, b) => a.box - b.box) : dueCards(cards, now)), [cards, now, practice]);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const card = due[i];

  // Notebook notes become cards too.
  useEffect(() => {
    addCards(notes.map((n) => ({ id: `note:${n.id}`, front: n.title, back: n.text, from: n.source ?? tr('Notebook', 'Блокнот') })));
  }, [notes, addCards]);

  const reply = (ok: boolean) => {
    if (!card) return;
    answer(card.id, ok);
    if (ok) addXp(2);
    setDoneCount((d) => d + 1);
    setShown(false);
    setI((x) => x + (practice ? 1 : 0));
  };

  return (
    <div className="rv" data-testid="review">
      <h2>
        <Brain size={20} aria-hidden /> {tr('Review — so you do not forget', 'Повторение — чтобы не забыть')}
      </h2>
      <p className="muted">
        {tr(
          'Questions from finished lessons and your notebook come back after 1, 2, 4, 8 and 16 days. "I remember" moves a card further, "I forgot" brings it back sooner. 5 minutes a day is enough.',
          'Вопросы из пройденных уроков и твоего блокнота возвращаются через 1, 2, 4, 8 и 16 дней. «Помню» отодвигает карточку дальше, «Забыл» — возвращает раньше. Достаточно 5 минут в день.',
        )}
      </p>
      <div className="rv-stats" data-testid="review-stats">
        {[1, 2, 3, 4, 5].map((b) => (
          <span key={b} className="rv-box" title={tr(`Box ${b}: every ${BOX_DAYS[b]} d.`, `Коробка ${b}: раз в ${BOX_DAYS[b]} дн.`)}>
            <b>{cards.filter((c) => c.box === b).length}</b>
            <span>{tr(`box ${b}`, `коробка ${b}`)}</span>
          </span>
        ))}
      </div>
      {!cards.length ? (
        <p className="rv-empty" data-testid="review-empty">
          {tr('No cards yet. Finish a lesson or save something to the notebook (⭐) — cards appear automatically.', 'Карточек пока нет. Пройди урок или сохрани что-нибудь в блокнот (⭐) — карточки появятся сами.')}
        </p>
      ) : !card ? (
        <div className="rv-empty" data-testid="review-done">
          <p>{doneCount ? tr(`🎉 Done for today: ${doneCount} cards.`, `🎉 На сегодня всё: ${doneCount} карточек.`) : tr('🎉 Nothing to review right now. Come back tomorrow!', '🎉 Сейчас нечего повторять. Возвращайся завтра!')}</p>
          {!practice ? (
            <button
              className="btn"
              onClick={() => {
                setPractice(true);
                setI(0);
              }}
            >
              {tr('Practise anyway', 'Всё равно потренироваться')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rv-card" data-testid="review-card">
          <div className="rv-meta muted small">
            {tr('Card', 'Карточка')} {Math.min(i + 1, due.length)} / {due.length} · {card.from} · {tr('box', 'коробка')} {card.box}
          </div>
          <div className="rv-front">{card.front}</div>
          {card.code ? (
            <details className="rv-code">
              <summary>{tr('Show the code', 'Показать код')}</summary>
              <pre>{card.code}</pre>
            </details>
          ) : null}
          {shown ? (
            <>
              <div className="rv-back" data-testid="review-back">
                {card.back}
              </div>
              <div className="ws-row">
                <button className="btn big" onClick={() => reply(false)} data-testid="review-forgot">
                  😕 {tr('I forgot', 'Забыл')}
                </button>
                <button className="btn big primary" onClick={() => reply(true)} data-testid="review-remember">
                  😊 {tr('I remember', 'Помню')}
                </button>
              </div>
            </>
          ) : (
            <div className="ws-row">
              <button className="btn big primary" onClick={() => setShown(true)} data-testid="review-show">
                {tr('Show the answer', 'Показать ответ')}
              </button>
              <Speak text={card.front} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------- notebook

export function NotebookView() {
  const notes = useNotebook((s) => s.notes);
  const add = useNotebook((s) => s.add);
  const remove = useNotebook((s) => s.remove);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const shown = notes.filter((n) => !q || `${n.title} ${n.text}`.toLowerCase().includes(q.toLowerCase()));
  const exportMd = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([notebookMarkdown(notes)], { type: 'text/markdown;charset=utf-8' }));
    a.download = 'my-notebook.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="nb" data-testid="notebook">
      <div className="ln-top">
        <h2>⭐ {tr('My notebook', 'Мой блокнот')}</h2>
        <button className="btn" onClick={exportMd} disabled={!notes.length} data-testid="notebook-export">
          <Download size={15} /> {tr('Save as a file (.md)', 'Сохранить файлом (.md)')}
        </button>
      </div>
      <p className="muted">{tr('Explanations you saved with ⭐ and your own notes. They also come back in Review.', 'Объяснения, которые ты сохранил через ⭐, и твои заметки. Они же возвращаются в Повторении.')}</p>
      <form
        className="nb-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          add({ title: title.trim(), text: text.trim(), source: tr('My note', 'Моя заметка') });
          setTitle('');
          setText('');
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Short title (what to remember)', 'Коротко: что запомнить')} data-testid="note-title" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={tr('Explanation in your own words', 'Объяснение своими словами')} data-testid="note-text" />
        <button className="btn primary" type="submit" data-testid="note-add">
          {tr('Add note', 'Добавить')}
        </button>
      </form>
      {notes.length > 5 ? <input className="ws-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search in notes…', 'Поиск по заметкам…')} /> : null}
      {!notes.length ? <p className="rv-empty">{tr('Empty for now. Press ⭐ next to an explanation to save it here.', 'Пока пусто. Нажми ⭐ рядом с объяснением, чтобы сохранить его сюда.')}</p> : null}
      <div className="nb-list">
        {shown.map((n) => (
          <article key={n.id} className="nb-note" data-testid="note">
            <header>
              <b>{n.title}</b>
              <span className="muted small">
                {n.source ? `${n.source} · ` : ''}
                {new Date(n.at).toLocaleDateString()}
              </span>
              <Speak text={`${n.title}. ${n.text}`} />
              <button className="btn small ghost" onClick={() => remove(n.id)} aria-label={tr('Delete note', 'Удалить заметку')}>
                <Trash2 size={13} />
              </button>
            </header>
            {n.text ? <p>{n.text}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------- resume card

export function ResumeCard() {
  const last = useResume((s) => s.last);
  const setView = useCode((s) => s.setView);
  const due = dueCards(useReview((s) => s.cards)).length;
  if (!last && !due) return null;
  const go = () => {
    if (!last) return;
    if (last.kind === 'lesson' && last.extra === 'sound') setView('sound');
    else if (last.kind === 'lesson' && last.extra?.startsWith('course:')) {
      courseRequest.value = { course: last.extra.slice(7), lesson: last.id };
      useLearnHub.set('courses');
      setView('learn');
    } else if (last.kind === 'lesson') {
      useLearnHub.set('lessons');
      if (last.extra) useLearn.getState().setTrack(last.extra as never);
      useLearn.getState().openLesson(last.id);
      setView('learn');
    } else if (last.kind === 'level') setView('unity');
    else if (last.kind === 'mission') setView('shooter');
    else {
      useWorkshop.getState().open(last.id);
      setView('workshop');
    }
  };
  const ago = last ? Math.round((Date.now() - last.at) / 60000) : 0;
  return (
    <div className="resume" data-testid="resume-card">
      {last ? (
        <button className="resume-main" onClick={go} data-testid="resume-go">
          <span className="resume-icon" aria-hidden>
            {last.kind === 'lesson' ? '📘' : last.kind === 'level' ? '🎮' : last.kind === 'mission' ? '🎯' : '🛠'}
          </span>
          <span>
            <b>{tr('Continue where you stopped', 'Продолжить с того места, где остановился')}</b>
            <span className="muted small">
              {last.title} · {ago < 60 ? tr(`${ago} min ago`, `${ago} мин назад`) : ago < 1440 ? tr(`${Math.round(ago / 60)} h ago`, `${Math.round(ago / 60)} ч назад`) : tr(`${Math.round(ago / 1440)} d ago`, `${Math.round(ago / 1440)} дн назад`)}
            </span>
          </span>
          <Play size={18} />
        </button>
      ) : null}
      {due ? (
        <button
          className="resume-review"
          onClick={() => {
            useLearnHub.set('review');
            setView('learn');
          }}
          data-testid="resume-review"
        >
          <Brain size={16} /> {tr(`Review: ${due} cards are waiting (5 min)`, `Повторение: ждут ${due} карточек (5 мин)`)}
        </button>
      ) : null}
    </div>
  );
}

/** Which part of the Learn hub is open (lessons / review / notebook). */
export const useLearnHub = (() => {
  let value: 'lessons' | 'courses' | 'trainers' | 'review' | 'notebook' = 'lessons';
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v: typeof value) {
      value = v;
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
})();

// ---------------------------------------------------------------------------------- focus timer

const FOCUS_KEY = 'mf.focus.v1';

export function FocusTimer({ onClose }: { onClose: () => void }) {
  const [minutes, setMinutes] = useState(() => {
    try {
      const m = Number(localStorage.getItem(FOCUS_KEY));
      return [10, 15, 25, 45].includes(m) ? m : 15;
    } catch {
      return 15;
    }
  });
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (left > 0 || !running) return;
    setRunning(false);
    if (!onBreak) {
      setOnBreak(true);
      setLeft(5 * 60);
      speak(tr('Great work! Time for a 5 minute break: stand up, drink some water, look out of the window.', 'Отличная работа! Время отдохнуть 5 минут: встань, попей воды, посмотри в окно.'));
    } else {
      setOnBreak(false);
      setLeft(minutes * 60);
    }
  }, [left, running, onBreak, minutes]);
  const pick = (m: number) => {
    setMinutes(m);
    setLeft(m * 60);
    setOnBreak(false);
    try {
      localStorage.setItem(FOCUS_KEY, String(m));
    } catch {
      /* ignore */
    }
  };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const total = (onBreak ? 5 : minutes) * 60;
  return (
    <div className={`focus${onBreak ? ' break' : ''}`} role="timer" data-testid="focus-timer">
      <Timer size={16} aria-hidden />
      <span className="focus-time" style={{ ['--p' as string]: `${(1 - left / total) * 100}%` }}>
        {mm}:{ss}
      </span>
      <span className="focus-label">{onBreak ? tr('Break 🌿', 'Перерыв 🌿') : tr('Focus', 'Фокус')}</span>
      <button className="btn small" onClick={() => setRunning((r) => !r)} aria-label={running ? tr('Pause', 'Пауза') : tr('Start', 'Старт')} data-testid="focus-start">
        {running ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button className="btn small ghost" onClick={() => pick(minutes)} aria-label={tr('Reset', 'Сбросить')}>
        <RotateCcw size={13} />
      </button>
      {!running ? (
        <select value={minutes} onChange={(e) => pick(Number(e.target.value))} aria-label={tr('Minutes', 'Минуты')}>
          {[10, 15, 25, 45].map((m) => (
            <option key={m} value={m}>
              {m} {tr('min', 'мин')}
            </option>
          ))}
        </select>
      ) : null}
      <button className="btn small ghost" onClick={onClose} aria-label={tr('Close the timer', 'Закрыть таймер')}>
        <X size={13} />
      </button>
      {onBreak && left > 0 ? <div className="focus-break-msg">{tr('Stand up, stretch, drink water. The code will wait 🙂', 'Встань, потянись, попей воды. Код подождёт 🙂')}</div> : null}
    </div>
  );
}

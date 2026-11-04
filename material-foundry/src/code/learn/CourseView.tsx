// Course lessons: 1) read (short text + code with explanations), 2) watch (real step-by-step run
// for C#, a guided walk through the lines for Unreal C++), 3) quiz, 4) do it yourself (C#: the
// learner's code is run and its output compared). One stage at a time, always one clear button.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, Play } from 'lucide-react';
import { pick, tr, type Text2 } from '../i18n';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { parseCSharp, runCSharp, syntaxProblems } from '../run/runner';
import { explainError, errorText } from '../run/errors';
import type { TraceStep } from '../run/csharp';
import { useReview } from '../memory/review';
import { useResume } from '../memory/resume';
import { Speak } from '../memory/MemoryViews';
import { createEditor, type WorkshopEditor } from '../workshop/editor';
import { TraceView } from '../workshop/TraceView';
import { useWorkshop } from '../workshop/store';
import { COURSES, type Course, type CourseLesson, type Quiz } from './courses';
import { useLearn } from './progress';

type Stage = 'read' | 'watch' | 'quiz' | 'task' | 'done';

const optText = (o: string | Text2) => (typeof o === 'string' ? o : pick(o));

function NotedCode({ code, notes, current }: { code: string; notes: [string, Text2][]; current?: number }) {
  const lines = code.split('\n');
  const used = new Set<number>();
  const per = lines.map((l) =>
    notes.flatMap(([m, t], k) => {
      if (used.has(k) || !l.includes(m)) return [];
      used.add(k);
      return [pick(t)];
    }),
  );
  return (
    <div className="cv-code" role="list">
      {lines.map((l, i) => (
        <div key={i} role="listitem" className={`cv-line${per[i].length ? ' noted' : ''}${current === i ? ' cur' : ''}`} data-line={i}>
          <span className="cv-n">{i + 1}</span>
          <code>{l || ' '}</code>
          {per[i].length ? <span className="cv-note">{per[i].join(' ')}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Unreal C++ cannot run: walk through the explained lines one by one instead. */
function LineWalk({ lesson, onDone }: { lesson: CourseLesson; onDone: () => void }) {
  const lines = lesson.code.split('\n');
  const stops = useMemo(() => {
    const used = new Set<number>();
    const out: { line: number; text: string }[] = [];
    lines.forEach((l, i) => {
      const k = lesson.notes.findIndex(([m], j) => !used.has(j) && l.includes(m));
      if (k >= 0) {
        used.add(k);
        out.push({ line: i, text: pick(lesson.notes[k][1]) });
      }
    });
    return out;
  }, [lesson, lines]);
  const [i, setI] = useState(0);
  const stop = stops[i];
  return (
    <div className="cv-walk" data-testid="course-walk">
      <p className="ws-honest muted">{tr('C++ cannot run inside this app (it needs a compiler and Unreal). Walk through the important lines:', 'C++ нельзя запустить в этой программе (нужен компилятор и Unreal). Пройдём по важным строкам:')}</p>
      <div className="ws-say" aria-live="polite">
        {tr('Line', 'Строка')} {stop.line + 1}: {stop.text} <Speak text={stop.text} />
      </div>
      <NotedCode code={lesson.code} notes={[]} current={stop.line} />
      <div className="ws-row">
        <button className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
          <ArrowLeft size={15} /> {tr('Back', 'Назад')}
        </button>
        <span>
          {i + 1} / {stops.length}
        </span>
        {i < stops.length - 1 ? (
          <button className="btn primary" onClick={() => setI(i + 1)} data-testid="walk-next">
            {tr('Next line', 'Следующая строка')} <ArrowRight size={15} />
          </button>
        ) : (
          <button className="btn primary big" onClick={onDone} data-testid="walk-done">
            {tr('To the questions', 'К вопросам')} <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function QuizCard({ quiz, onDone }: { quiz: Quiz; onDone: (firstTry: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const right = picked === quiz.answer;
  return (
    <div className="cv-quiz" data-testid="course-quiz">
      <p className="rv-front">{pick(quiz.q)}</p>
      <div className="cv-options">
        {quiz.options.map((o, i) => (
          <button
            key={i}
            className={`cv-opt${picked === i ? (i === quiz.answer ? ' good' : ' bad') : ''}`}
            onClick={() => {
              if (right) return;
              setPicked(i);
              setTries((t) => t + 1);
            }}
            data-testid="quiz-option"
          >
            {optText(o)}
          </button>
        ))}
      </div>
      {picked !== null ? (
        <p className={right ? 'ok-text' : 'bad-text'} data-testid="quiz-feedback">
          {right ? '✅ ' : '❌ '}
          {right ? pick(quiz.why) : tr('Not quite — try another answer.', 'Не совсем — попробуй другой ответ.')}
        </p>
      ) : null}
      {right ? (
        <button className="btn primary big" onClick={() => onDone(tries === 1)} data-testid="quiz-next">
          {tr('Next', 'Дальше')} <ArrowRight size={16} />
        </button>
      ) : null}
    </div>
  );
}

function TaskStage({ lesson, onDone }: { lesson: CourseLesson; onDone: (firstTry: boolean) => void }) {
  const task = lesson.task!;
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<WorkshopEditor | null>(null);
  const code = useRef(task.starter);
  const [res, setRes] = useState<{ ok: boolean; got: string[]; error?: string; line?: number } | null>(null);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  ensureMainThreadTreeSitter();
  useEffect(() => {
    if (!host.current) return;
    const e = createEditor(host.current, {
      doc: task.starter,
      lang: 'cs',
      fileName: () => 'Program.cs',
      syntax: async (t) => syntaxProblems(await parseCSharp(t), t).map((p) => ({ line: p.line, col: p.col, message: p.message })),
      onChange: (t) => (code.current = t),
      onCursor: () => {},
      onPredictions: () => {},
      onProblems: () => {},
      onRun: () => void check(),
      ghost: useWorkshop.getState().ghost,
    });
    ed.current = e;
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const check = async () => {
    const r = await runCSharp(code.current, task.input ?? []);
    const got = r.output.filter((l) => !l.startsWith('> '));
    const ok = r.status === 'done' && got.length === task.expect.length && got.every((l, i) => l.trim() === task.expect[i]);
    setTries((t) => t + 1);
    setRes({ ok, got, error: r.error?.message, line: r.error?.line });
  };
  const info = res?.error ? explainError(res.error) : null;
  return (
    <div className="cv-task" data-testid="course-task">
      <p className="mu-goal">🛠 {pick(task.text)}</p>
      <div className="cv-task-editor" ref={host} data-testid="course-task-editor" />
      <div className="ws-row">
        <button className="btn primary big" onClick={() => void check()} data-testid="task-check">
          <Play size={16} /> {tr('Run and check', 'Запустить и проверить')}
        </button>
        {!hint ? (
          <button className="btn ghost" onClick={() => setHint(true)} data-testid="task-hint">
            <Lightbulb size={15} /> {tr('Hint', 'Подсказка')}
          </button>
        ) : null}
        {tries >= 2 && !res?.ok ? (
          <button className="btn ghost" onClick={() => ed.current?.setText(task.solution)} data-testid="task-solution">
            <Eye size={15} /> {tr('Show the solution', 'Показать решение')}
          </button>
        ) : null}
      </div>
      {hint ? <p className="mu-hint">💡 {pick(task.hint)}</p> : null}
      {res ? (
        <div className={`cv-result ${res.ok ? 'good' : 'bad'}`} data-testid="task-result">
          <b>{res.ok ? tr('✅ Correct! The program printed exactly what was needed.', '✅ Верно! Программа вывела ровно то, что нужно.') : res.error ? tr('⚠ The program stopped with an error', '⚠ Программа остановилась с ошибкой') : tr('❌ Not yet — compare what is printed:', '❌ Пока нет — сравни, что выводится:')}</b>
          {res.error ? (
            <p>
              {res.error}
              {info ? ` — ${errorText(info).fix}` : ''}
            </p>
          ) : !res.ok ? (
            <div className="cv-compare">
              <div>
                <span className="muted small">{tr('Needed', 'Нужно')}</span>
                <pre>{task.expect.join('\n')}</pre>
              </div>
              <div>
                <span className="muted small">{tr('Your program', 'Твоя программа')}</span>
                <pre>{res.got.join('\n') || tr('(nothing)', '(ничего)')}</pre>
              </div>
            </div>
          ) : null}
          {res.ok ? (
            <button className="btn primary big" onClick={() => onDone(tries === 1)} data-testid="task-next">
              {tr('Finish the lesson', 'Закончить урок')} <ArrowRight size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CourseLessonPlayer({ course, lesson, onExit, onNext }: { course: Course; lesson: CourseLesson; onExit: () => void; onNext: (() => void) | null }) {
  const [stage, setStage] = useState<Stage>('read');
  const [qi, setQi] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [trace, setTrace] = useState<{ steps: TraceStep[]; output: string[] } | null>(null);
  const addXp = useLearn((s) => s.addXp);
  const finish = useLearn((s) => s.finishCourseLesson);
  useEffect(() => {
    useResume.getState().mark({ kind: 'lesson', id: lesson.id, title: `${pick(course.title)}: ${pick(lesson.title)}`, extra: `course:${course.id}` });
  }, [course, lesson]);
  useEffect(() => {
    if (stage !== 'watch' || lesson.lang !== 'cs') return;
    ensureMainThreadTreeSitter();
    void runCSharp(lesson.code, lesson.input ?? [], { trace: true }).then((r) => setTrace({ steps: r.steps, output: r.output }));
  }, [stage, lesson]);
  const complete = (extraMistake: boolean) => {
    const m = mistakes + (extraMistake ? 1 : 0);
    const stars = m === 0 ? 3 : m === 1 ? 2 : 1;
    addXp(25);
    finish(course.id, lesson.id, stars);
    useReview.getState().addCards(lesson.quiz.map((q, i) => ({ id: `course:${course.id}:${lesson.id}:${i}`, front: pick(q.q), back: `${optText(q.options[q.answer])}\n\n${pick(q.why)}`, from: `${pick(course.title)} · ${pick(lesson.title)}`, code: lesson.code })));
    setStage('done');
  };
  const stages: [Stage, string][] = [
    ['read', tr('1. Read', '1. Читай')],
    ['watch', tr('2. Watch', '2. Смотри')],
    ['quiz', tr('3. Check yourself', '3. Проверь себя')],
    ...(lesson.task ? ([['task', tr('4. Do it yourself', '4. Сделай сам')]] as [Stage, string][]) : []),
  ];
  return (
    <div className="ln-lesson cv" data-testid="course-lesson">
      <header className="ln-lesson-head">
        <button className="btn" onClick={onExit} data-testid="course-exit">
          <ArrowLeft size={16} /> {tr('All lessons', 'Все уроки')}
        </button>
        <h2>
          <span aria-hidden>{lesson.icon}</span> {pick(lesson.title)}
        </h2>
        <ol className="ln-stages">
          {stages.map(([s, label]) => (
            <li key={s} className={s === stage ? 'on' : ''}>
              {label}
            </li>
          ))}
        </ol>
      </header>
      {stage === 'read' ? (
        <div className="ln-intro" data-testid="course-read">
          <div className="ln-goal">🎯 {pick(lesson.goal)}</div>
          {lesson.intro.map((p, i) => (
            <p key={i} className="ln-intro-text">
              {pick(p)}
            </p>
          ))}
          <Speak text={lesson.intro.map(pick).join(' ')} />
          <NotedCode code={lesson.code} notes={lesson.notes} />
          <p className="ln-note">
            🎮 <b>{tr('In real games:', 'В настоящих играх:')}</b> {pick(lesson.inGame)}
          </p>
          <button className="btn big primary" onClick={() => setStage('watch')} data-testid="course-watch">
            <Play size={18} /> {lesson.lang === 'cs' ? tr('Watch it run, step by step', 'Посмотреть, как это выполняется, по шагам') : tr('Walk through the lines', 'Пройти по строкам')}
          </button>
        </div>
      ) : null}
      {stage === 'watch' ? (
        lesson.lang === 'cs' ? (
          <div data-testid="course-watch-cs">
            {trace ? <TraceView code={lesson.code} steps={trace.steps} output={trace.output} /> : <span className="spinner" aria-hidden />}
            <button className="btn big primary" onClick={() => setStage('quiz')} data-testid="course-to-quiz">
              {tr('To the questions', 'К вопросам')} <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <LineWalk lesson={lesson} onDone={() => setStage('quiz')} />
        )
      ) : null}
      {stage === 'quiz' ? (
        <div>
          <div className="ln-game-n">
            {tr('Question', 'Вопрос')} {qi + 1} / {lesson.quiz.length}
          </div>
          <QuizCard
            key={qi}
            quiz={lesson.quiz[qi]}
            onDone={(first) => {
              if (!first) setMistakes((m) => m + 1);
              addXp(first ? 5 : 2);
              if (qi + 1 < lesson.quiz.length) setQi(qi + 1);
              else if (lesson.task) setStage('task');
              else complete(!first);
            }}
          />
        </div>
      ) : null}
      {stage === 'task' ? <TaskStage lesson={lesson} onDone={(first) => complete(!first)} /> : null}
      {stage === 'done' ? (
        <div className="ln-done" data-testid="course-done">
          <div className="ln-trophy" aria-hidden>
            🏆
          </div>
          <h2>{tr('Lesson complete!', 'Урок пройден!')}</h2>
          <p>{tr('The questions will come back in Review in a few days — so you do not forget.', 'Вопросы вернутся в «Повторении» через несколько дней — чтобы не забыть.')}</p>
          <div className="ln-row">
            {onNext ? (
              <button className="btn big primary" onClick={onNext} data-testid="course-next">
                {tr('Next lesson', 'Следующий урок')} <ArrowRight size={18} />
              </button>
            ) : null}
            <button className="btn big" onClick={onExit}>
              {tr('All lessons', 'Все уроки')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Set by "continue where you stopped" to open a course lesson directly. */
export const courseRequest: { value: { course: string; lesson: string } | null } = { value: null };

export function CoursesView() {
  const [open] = useState(() => {
    const v = courseRequest.value;
    courseRequest.value = null;
    return v;
  });
  const done = useLearn((s) => s.done);
  const [courseId, setCourseId] = useState<Course['id']>((open?.course as Course['id']) ?? 'cs-unity');
  const [lessonId, setLessonId] = useState<string | null>(open?.lesson ?? null);
  const course = COURSES.find((c) => c.id === courseId)!;
  const lesson = course.lessons.find((l) => l.id === lessonId);
  if (lesson) {
    const i = course.lessons.indexOf(lesson);
    const next = course.lessons[i + 1];
    return (
      <div className="ln">
        <CourseLessonPlayer key={lesson.id} course={course} lesson={lesson} onExit={() => setLessonId(null)} onNext={next ? () => setLessonId(next.id) : null} />
      </div>
    );
  }
  const nextUp = course.lessons.find((l) => !done[`course:${course.id}:${l.id}`]);
  return (
    <div className="ln" data-testid="courses">
      <div className="ln-home">
        <div className="cv-courses">
          {COURSES.map((c) => {
            const n = c.lessons.filter((l) => done[`course:${c.id}:${l.id}`]).length;
            return (
              <button key={c.id} className={`ln-track${c.id === courseId ? ' on' : ''}`} onClick={() => setCourseId(c.id)} data-testid={`course-${c.id}`}>
                <span className="ln-track-name">
                  {c.icon} {pick(c.title)}
                </span>
                <span>{pick(c.about)}</span>
                <span className="muted small">
                  {n}/{c.lessons.length} {tr('done', 'пройдено')}
                </span>
              </button>
            );
          })}
        </div>
        {nextUp ? (
          <div className="ln-next">
            <span>{tr('Your next step:', 'Твой следующий шаг:')}</span>
            <button className="btn big primary" onClick={() => setLessonId(nextUp.id)} data-testid="course-start-next">
              <Play size={18} /> {nextUp.icon} {pick(nextUp.title)}
            </button>
          </div>
        ) : (
          <div className="ln-next">🎉 {tr('Course complete! Try Mini-Unity or write your own script in the Workshop.', 'Курс пройден! Попробуй Мини-Unity или напиши свой скрипт в Мастерской.')}</div>
        )}
        <ol className="ln-path">
          {course.lessons.map((l, i) => {
            const r = done[`course:${course.id}:${l.id}`];
            return (
              <li key={l.id}>
                <button className={`ln-path-item${r ? ' done' : ''}${l === nextUp ? ' next' : ''}`} onClick={() => setLessonId(l.id)} data-testid="course-lesson-card">
                  <span className="ln-path-n">{i + 1}</span>
                  <span className="ln-path-icon" aria-hidden>
                    {l.icon}
                  </span>
                  <span className="ln-path-text">
                    <b>{pick(l.title)}</b>
                    <span className="muted small">{pick(l.goal)}</span>
                  </span>
                  {r ? <Check size={18} className="ok-text" /> : l.task ? <span className="pill">{tr('+ task', '+ задание')}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

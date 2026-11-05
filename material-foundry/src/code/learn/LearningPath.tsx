// "My path" — the home screen. One map through everything in the program, district by district, like
// a city in a game: the next district opens when the previous one is done. One big button always
// opens exactly the next lesson, so it is never unclear where to click. (Locks can be switched off
// in Settings; districts you already started stay open.)

import { useEffect, useRef, useState } from 'react';
import { pick, tr, type Text2 } from '../i18n';
import { LEVELS } from '../run/levels';
import { PROJECT } from '../run/project';
import { MISSIONS } from '../run/shooter';
import { RACE_MISSIONS } from '../run/racing';
import { MODEL_MISSIONS } from '../run/models';
import { SOUND_LESSONS } from '../sound/soundLessons';
import { useSoundLab } from '../sound/labProgress';
import { useUnityProgress } from '../workshop/MiniUnity';
import { useModels, useRacing, useShooter } from '../workshop/shooterProgress';
import { useLearnHub } from '../memory/MemoryViews';
import { dueCards, useReview } from '../memory/review';
import { fx } from '../ui/fx';
import { useCode, type CodeView } from '../ui/store';
import { ABC_LEVELS } from './abc';
import { useAbc } from './abcProgress';
import { COURSES } from './courses';
import { courseRequest } from './CourseView';
import { lessonsFor } from './lessons';
import { useLearn } from './progress';
import { DailyGoal } from './Trainers';

const T = (en: string, ru: string): Text2 => ({ en, ru });

export interface Stage {
  id: string;
  icon: string;
  /** The district name on the map. */
  district: Text2;
  title: Text2;
  /** One short line: what you learn here. */
  why: Text2;
  /** Lesson ids in order and which are done. */
  items: { id: string; title: Text2 }[];
  done: Set<string>;
  open: (nextId: string | undefined) => void;
  optional?: boolean;
  /** Locked: the district before it is not finished yet. */
  locked: boolean;
  /** The district that has to be finished first. */
  after?: Stage;
}

/** Which district a game screen belongs to (for the lock on the Games tabs). */
export const VIEW_STAGE: Partial<Record<CodeView, string>> = { abc: 'abc', unity: '2d', shooter: 'shooter-body', racing: 'racing', sound: 'sound', models: 'models' };

const complete = (s: Stage) => s.items.every((i) => s.done.has(i.id));

export function usePathStages(): Stage[] {
  const abc = useAbc((s) => s.done);
  const unity = useUnityProgress((s) => s.done);
  const shooter = useShooter((s) => s.done);
  const racing = useRacing((s) => s.done);
  const models = useModels((s) => s.done);
  const sound = useSoundLab((s) => s.done);
  const learnDone = useLearn((s) => s.done);
  const lockAhead = useCode((s) => s.prefs.lockAhead);
  const setView = useCode((s) => s.setView);
  const course = (id: string) => COURSES.find((c) => c.id === id)!;
  const courseDone = (id: string) => new Set(Object.keys(learnDone).filter((k) => k.startsWith(`course:${id}:`)).map((k) => k.split(':')[2]));
  const mission = (ids: (m: { id: string }) => boolean) => MISSIONS.filter(ids).map((m) => ({ id: m.id, title: m.title }));
  const openShooter = (id?: string) => {
    if (id) useShooter.getState().set({ current: id });
    setView('shooter');
  };
  const openCourse = (cid: string) => (id?: string) => {
    if (id) courseRequest.value = { course: cid, lesson: id };
    useLearnHub.set('courses');
    setView('learn');
  };
  const bricks = lessonsFor('cs');
  const stages: Omit<Stage, 'locked' | 'after'>[] = [
    {
      id: 'abc',
      icon: '🔤',
      district: T('ABC Harbour', 'Порт Азбуки'),
      title: T('The ABC of code', 'Азбука кода'),
      why: T('( ) ; " " = { } == // . [ ] — what every symbol does, with robot Bit.', '( ) ; " " = { } == // . [ ] — что делает каждый символ, вместе с роботом Битом.'),
      items: ABC_LEVELS.map((l) => ({ id: l.id, title: T(`${l.symbol}  ${l.title.en}`, `${l.symbol}  ${l.title.ru}`) })),
      done: new Set(abc),
      open: (id) => {
        if (id) useAbc.getState().set({ current: id });
        setView('abc');
      },
    },
    {
      id: 'bricks',
      icon: '🧱',
      district: T('Brick Quarter', 'Кирпичный квартал'),
      title: T('First bricks of C#', 'Первые кирпичики C#'),
      why: T('Variables, if, loops, functions, lists, classes — watch each line run, then play.', 'Переменные, if, циклы, функции, списки, классы — смотри, как работает каждая строка, и играй.'),
      items: bricks.map((l) => ({ id: l.id, title: l.title })),
      done: new Set(bricks.filter((l) => learnDone[`cs:${l.id}`]).map((l) => l.id)),
      open: (id) => {
        useLearn.getState().setTrack('cs');
        useLearn.getState().openLesson(id ?? null);
        useLearnHub.set('lessons');
        setView('learn');
      },
    },
    {
      id: '2d',
      icon: '🕹',
      district: T('Pixel Village', 'Пиксельный посёлок'),
      title: T('First Unity scripts in 2D', 'Первые скрипты Unity в 2D'),
      why: T('Start, Update, keys, Time.deltaTime, triggers, physics — in a flat world where everything is easy to see.', 'Start, Update, клавиши, Time.deltaTime, триггеры, физика — в плоском мире, где всё легко увидеть.'),
      items: LEVELS.map((l) => ({ id: l.id, title: l.title })),
      done: new Set(unity),
      open: (id) => {
        if (id) useUnityProgress.getState().set({ levelId: id });
        setView('unity');
      },
    },
    {
      id: 'theory',
      icon: '📘',
      district: T('The Library', 'Библиотека'),
      title: T('C# for Unity — deeper', 'C# для Unity — глубже'),
      why: T('Types, List, methods, classes, vectors… code on the left, the result on the right, and a button to the same idea in a game.', 'Типы, List, методы, классы, векторы… код слева, результат справа и кнопка к той же идее в игре.'),
      items: course('cs-unity').lessons.map((l) => ({ id: l.id, title: l.title })),
      done: courseDone('cs-unity'),
      open: openCourse('cs-unity'),
    },
    {
      id: 'platformer',
      icon: '🏗',
      district: T('Construction Site', 'Стройка'),
      title: T('Your own 2D platformer', 'Свой 2D-платформер'),
      why: T('Five steps to a small game of your own — everything from 2D together.', 'Пять шагов до своей маленькой игры — всё из 2D вместе.'),
      items: PROJECT.map((l) => ({ id: l.id, title: l.title })),
      done: new Set(unity),
      open: (id) => {
        if (id) useUnityProgress.getState().set({ levelId: id });
        setView('unity');
      },
    },
    {
      id: 'shooter-body',
      icon: '🎯',
      district: T('Training Ground', 'Полигон'),
      title: T('3D: body, eyes and weapons', '3D: тело, глаза и оружие'),
      why: T('First person: mouse look, CharacterController, jumping, rays, damage, coroutines.', 'От первого лица: обзор мышью, CharacterController, прыжки, лучи, урон, корутины.'),
      items: mission((m) => /^s(0\d|1[0-5])$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'bots',
      icon: '🧠',
      district: T('Bot Barracks', 'Казармы ботов'),
      title: T('Enemies and living bots', 'Враги и живые боты'),
      why: T('Patrol, eyes, a brain — then bots that turn, aim and look around like people.', 'Патруль, глаза, мозг — потом боты, которые поворачиваются, целятся и оглядываются как люди.'),
      items: mission((m) => /^(s1[6-8]|b\d)$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'atmosphere',
      icon: '🌬',
      district: T('Dusty Yard', 'Пыльный двор'),
      title: T('Atmosphere and the match', 'Атмосфера и матч'),
      why: T('A body that is not wooden, a living weapon — and a real match on a map.', 'Тело не деревянное, живое оружие — и настоящий матч на карте.'),
      items: mission((m) => /^s(19|2\d)$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'racing',
      icon: '🏎',
      district: T('Speedway', 'Автодром'),
      title: T('Racing: physics, ghost, damage, AI', 'Гонки: физика, призрак, повреждения, ИИ'),
      why: T('A car from scratch, laps, a ghost, dents, an autopilot and a car that learns by itself.', 'Машина с нуля, круги, призрак, вмятины, автопилот и машина, которая учится сама.'),
      items: RACE_MISSIONS.map((m) => ({ id: m.id, title: m.title })),
      done: new Set(racing),
      open: (id) => {
        if (id) useRacing.getState().set({ current: id });
        setView('racing');
      },
    },
    {
      id: 'sound',
      icon: '🔊',
      district: T('Sound Studio', 'Студия звука'),
      title: T('Sound for games', 'Звук для игр'),
      why: T('Make sounds with code and the synthesizer — then use them in your games.', 'Делай звуки кодом и синтезатором — потом ставь их в свои игры.'),
      items: SOUND_LESSONS.map((l) => ({ id: l.id, title: l.title })),
      done: new Set(sound),
      open: (id) => {
        if (id) useSoundLab.getState().set({ lesson: id, tab: 'lessons' });
        setView('sound');
      },
    },
    {
      id: 'models',
      icon: '🎨',
      district: T("Artist's Workshop", 'Мастерская художника'),
      title: T('Models and materials', 'Модели и материалы'),
      why: T('Models from parts, materials from your texture studio, detail by distance.', 'Модели из деталей, материалы из твоей студии текстур, детали по расстоянию.'),
      items: MODEL_MISSIONS.map((m) => ({ id: m.id, title: m.title })),
      done: new Set(models),
      open: (id) => {
        if (id) useModels.getState().set({ current: id });
        setView('models');
      },
    },
    {
      id: 'advanced',
      icon: '🚀',
      district: T('Skyscrapers', 'Небоскрёбы'),
      title: T('C# further (when you feel sure)', 'C# дальше (когда уже уверенно)'),
      why: T('static, struct vs class, interfaces, events, generics — what big projects are made of.', 'static, struct и class, интерфейсы, события, обобщения — из этого строятся большие проекты.'),
      items: course('cs-advanced').lessons.map((l) => ({ id: l.id, title: l.title })),
      done: courseDone('cs-advanced'),
      open: openCourse('cs-advanced'),
      optional: true,
    },
  ];
  const out: Stage[] = [];
  let prevMain: Stage | undefined;
  for (const s of stages) {
    const gate = s.optional ? out.find((x) => x.id === 'theory') : prevMain;
    const started = s.items.some((i) => s.done.has(i.id));
    const st: Stage = { ...s, locked: lockAhead && !!gate && !complete(gate) && !started, after: gate };
    out.push(st);
    if (!s.optional) prevMain = st;
  }
  return out;
}

/** The next unfinished stage and lesson. */
export function nextStep(stages: Stage[]): { stage: Stage; item?: { id: string; title: Text2 } } {
  for (const s of stages) {
    if (s.optional || s.locked) continue;
    const item = s.items.find((i) => !s.done.has(i.id));
    if (item) return { stage: s, item };
  }
  return { stage: stages[stages.length - 1] };
}

/** Lessons inside a district open one after another (a done lesson always stays open). */
export function itemLocked(stage: Stage, id: string, lockAhead: boolean): boolean {
  if (!lockAhead) return false;
  if (stage.locked) return true;
  const i = stage.items.findIndex((x) => x.id === id);
  if (i <= 0 || stage.done.has(id)) return false;
  return !stage.done.has(stage.items[i - 1].id);
}

/** A click on something locked: a soft shake and one line why. */
export function lockedClick(el?: Element | null) {
  fx.wrong(el);
  useCode.getState().toast('info', tr('Locked for now: finish the step before it first (or switch locks off in Settings).', 'Пока закрыто: сначала пройди шаг перед ним (или выключи замки в Настройках).'));
}

/** For lists inside games: is this mission/level still locked? (ids not on the path are open) */
export function usePathLock() {
  const stages = usePathStages();
  const lockAhead = useCode((s) => s.prefs.lockAhead);
  return {
    lockAhead,
    stages,
    lockedIn(stageId: string, id: string): boolean {
      const st = stages.find((s) => s.id === stageId);
      return st ? itemLocked(st, id, lockAhead) : false;
    },
    locked(id: string): boolean {
      const st = stages.find((s) => s.items.some((i) => i.id === id));
      return st ? itemLocked(st, id, lockAhead) : false;
    },
    viewLocked(view: CodeView): Stage | null {
      const st = stages.find((s) => s.id === VIEW_STAGE[view]);
      return st && st.locked ? st : null;
    },
  };
}

/** Says once: "A new district is open!" when a district gets finished (wherever you are). */
export function PathWatcher() {
  const stages = usePathStages();
  const setView = useCode((s) => s.setView);
  const doneIds = stages.filter((s) => complete(s)).map((s) => s.id);
  const key = doneIds.join(',');
  useEffect(() => {
    let seen: string[] | null = null;
    try {
      const raw = localStorage.getItem('mf.path.seen');
      seen = raw ? JSON.parse(raw) : null;
    } catch {
      seen = null;
    }
    const save = (v: string[]) => {
      try {
        localStorage.setItem('mf.path.seen', JSON.stringify(v));
      } catch {
        /* ignore */
      }
    };
    if (!seen) return save(doneIds);
    const fresh = doneIds.filter((id) => !seen!.includes(id));
    if (!fresh.length) return;
    save([...new Set([...seen, ...doneIds])]);
    const last = fresh[fresh.length - 1];
    const i = stages.findIndex((s) => s.id === last);
    const opened = stages.slice(i + 1).find((s) => !s.optional) ?? stages.find((s) => s.optional && s.after?.id === last);
    if (!opened) return;
    fx.unlock({
      icon: opened.icon,
      name: pick(opened.district),
      why: `${pick(opened.title)} — ${pick(opened.why)}`,
      go: () => opened.open(opened.items.find((x) => !opened.done.has(x.id))?.id),
    });
    void setView;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Shown instead of a game whose district is still closed. */
export function LockedScreen({ stage }: { stage: Stage }) {
  const stages = usePathStages();
  const next = nextStep(stages);
  const setView = useCode((s) => s.setView);
  const left = stage.after ? stage.after.items.filter((i) => !stage.after!.done.has(i.id)).length : 0;
  return (
    <div className="lp-locked" data-testid="locked-screen">
      <div className="lp-locked-icon" aria-hidden>
        🔒
      </div>
      <h2>
        {stage.icon} {pick(stage.district)} — {tr('still closed', 'пока закрыт')}
      </h2>
      <p>
        {stage.after
          ? tr(`It opens after "${pick(stage.after.title)}" — ${left} steps left.`, `Откроется после «${pick(stage.after.title)}» — осталось шагов: ${left}.`)
          : null}
      </p>
      <p className="muted">{tr('Like a new city in a game: first the districts before it. This way nothing will be unclear.', 'Как новый город в игре: сначала районы перед ним. Так ничего не будет непонятным.')}</p>
      <div className="lp-locked-actions">
        <button className="btn big primary" onClick={() => next.stage.open(next.item?.id)} data-testid="locked-go">
          ▶ {tr('To my next step', 'К моему шагу')}: {next.stage.icon} {next.item ? pick(next.item.title) : pick(next.stage.title)}
        </button>
        <button className="btn" onClick={() => setView('path')}>
          🗺 {tr('The map', 'Карта')}
        </button>
      </div>
      <p className="muted small">{tr('Want everything open? Settings → "Lock what I have not reached".', 'Хочешь открыть всё? Настройки → «Закрывать то, до чего ещё не дошёл».')}</p>
    </div>
  );
}

const INTRO_KEY = 'mf.home.intro';

function Intro({ onClose }: { onClose: () => void }) {
  return (
    <div className="lp-intro" data-testid="home-intro">
      <h2>👋 {tr('Where you are', 'Куда ты попал')}</h2>
      <ol>
        <li>
          <b>{tr('This program teaches you to make games in Unity — from zero, in C#.', 'Эта программа учит делать игры на Unity — с нуля, на языке C#.')}</b>
        </li>
        <li>{tr('Below is the map. Districts open one by one — like in a game. 🔒 = not yet.', 'Ниже — карта. Районы открываются по очереди, как в игре. 🔒 — ещё рано.')}</li>
        <li>{tr('Press only the big button. It always opens the next step.', 'Жми только большую кнопку. Она всегда открывает следующий шаг.')}</li>
        <li>{tr('In every lesson: code on the left, what it does on the right.', 'В каждом уроке: код слева, что он делает — справа.')}</li>
      </ol>
      <button className="btn" onClick={onClose} data-testid="home-intro-ok">
        👍 {tr('Got it', 'Понятно')}
      </button>
    </div>
  );
}

function Finish() {
  return (
    <details className="lp-finish" data-testid="path-finish">
      <summary>
        🏆 <b>{tr('The finish: what you will be able to do', 'Финиш: что ты будешь уметь')}</b>
      </summary>
      <ul>
        <li>{tr('Read and write Unity C# scripts: variables, conditions, loops, lists, methods, classes, components, coroutines, events.', 'Читать и писать скрипты Unity на C#: переменные, условия, циклы, списки, методы, классы, компоненты, корутины, события.')}</li>
        <li>{tr('Make a 2D platformer, a first-person 3D shooter with bots, an arcade racing game with a ghost and damage.', 'Сделать 2D-платформер, 3D-шутер от первого лица с ботами, аркадные гонки с призраком и повреждениями.')}</li>
        <li>{tr('Make bots that see, hear, remember and aim like people — and tune their character.', 'Сделать ботов, которые видят, слышат, помнят и целятся как люди, — и настроить им характер.')}</li>
        <li>{tr('Make sounds with code, models from parts with your own materials.', 'Делать звуки кодом, модели из деталей со своими материалами.')}</li>
        <li>{tr('Understand error messages and fix them yourself.', 'Понимать сообщения об ошибках и исправлять их самому.')}</li>
      </ul>
      <p>
        <b>{tr('Honest level:', 'Честный уровень:')}</b>{' '}
        {tr(
          'a confident beginner who can build small complete games alone and is ready for a junior path. What comes next is practice in the real Unity editor: scenes, prefabs, animation, UI, building the game — the code part you will already know.',
          'уверенный начинающий: можешь сам собрать небольшую законченную игру и готов идти к уровню junior. Дальше — практика в настоящем редакторе Unity: сцены, префабы, анимации, интерфейс, сборка игры. Часть с кодом ты уже будешь знать.',
        )}
      </p>
    </details>
  );
}

export function LearningPath() {
  const stages = usePathStages();
  const next = nextStep(stages);
  const lockAhead = useCode((s) => s.prefs.lockAhead);
  const setView = useCode((s) => s.setView);
  const due = dueCards(useReview((s) => s.cards)).length;
  const [intro, setIntro] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  const total = stages.filter((s) => !s.optional).reduce((n, s) => n + s.items.length, 0);
  const doneAll = stages.filter((s) => !s.optional).reduce((n, s) => n + s.items.filter((x) => s.done.has(x.id)).length, 0);
  const fresh = doneAll === 0;
  const closeIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="lp" data-testid="learning-path">
      {intro ? <Intro onClose={closeIntro} /> : null}
      <div className="lp-here">
        <span className="muted small">
          📍 {tr('You are here', 'Ты здесь')}: <b>{pick(next.stage.district)}</b> · {doneAll}/{total} {tr('steps of the whole path', 'шагов всего пути')}
        </span>
        <span className="lp-bar big">
          <span style={{ width: `${(doneAll / Math.max(1, total)) * 100}%` }} />
        </span>
      </div>
      <button className="lp-next" onClick={() => next.stage.open(next.item?.id)} data-testid="path-continue">
        <span className="lp-next-icon">{next.stage.icon}</span>
        <span>
          <b>
            {fresh ? tr('Start', 'Начать') : tr('Continue', 'Продолжить')}: {pick(next.stage.title)}
          </b>
          {next.item ? <span>→ {pick(next.item.title)}</span> : null}
        </span>
        <span className="lp-go">▶</span>
      </button>
      <div className="lp-side">
        <DailyGoal compact />
        {due ? (
          <button
            className="btn"
            onClick={() => {
              useLearnHub.set('review');
              setView('learn');
            }}
            data-testid="home-review"
          >
            🧠 {tr(`Review: ${due} cards`, `Повторить: ${due}`)}
          </button>
        ) : null}
        <button
          className="btn ghost"
          onClick={() => {
            useLearnHub.set('trainers');
            setView('learn');
          }}
          data-testid="start-trainers"
        >
          🐞 {tr('Trainers — 5 min', 'Тренажёры — 5 мин')}
        </button>
      </div>

      <h2 className="lp-map-title">🗺 {tr('The map', 'Карта')}</h2>
      <ol className="lp-map">
        {stages.map((s, i) => {
          const done = s.items.filter((x) => s.done.has(x.id)).length;
          const all = s.items.length;
          const current = s === next.stage;
          const finished = done === all;
          const cls = `lp-district${current ? ' on' : ''}${finished ? ' done' : ''}${s.locked ? ' locked' : ''}${s.optional ? ' optional' : ''} ${i % 2 ? 'right' : 'left'}`;
          const tryOpen = () => {
            if (s.locked) {
              fx.wrong(refs.current[s.id]);
              useCode.getState().toast('info', tr(`Closed for now: first finish "${pick(s.after!.title)}".`, `Пока закрыто: сначала пройди «${pick(s.after!.title)}».`));
              return;
            }
            s.open(s.items.find((x) => !s.done.has(x.id))?.id);
          };
          return (
            <li key={s.id} ref={(el) => void (refs.current[s.id] = el)} className={cls} data-testid="path-stage" data-locked={s.locked ? '1' : undefined}>
              <span className="lp-pin" aria-hidden>
                {s.locked ? '🔒' : finished ? '✓' : current ? '📍' : i + 1}
              </span>
              <button className="lp-district-card" onClick={tryOpen} data-testid={`path-open-${s.id}`} aria-disabled={s.locked}>
                <span className="lp-district-icon" aria-hidden>
                  {s.icon}
                </span>
                <span className="lp-district-text">
                  <span className="lp-district-name">
                    {pick(s.district)} {s.optional ? <span className="muted small">({tr('optional', 'по желанию')})</span> : null}
                  </span>
                  <b>{pick(s.title)}</b>
                  {current || !s.locked ? <span className="muted small">{pick(s.why)}</span> : <span className="muted small">🔒 {tr(`Opens after "${pick(s.after!.title)}"`, `Откроется после «${pick(s.after!.title)}»`)}</span>}
                  <span className="lp-bar">
                    <span style={{ width: `${(done / Math.max(1, all)) * 100}%` }} />
                  </span>
                </span>
                <span className="lp-district-count">
                  {done}/{all}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <Finish />
      <div className="lp-more">
        <button className="btn ghost" onClick={() => setView('welcome')} data-testid="open-tools">
          🧰 {tr('Free mode: your own files, an example, the error translator', 'Свободный режим: свои файлы, пример, переводчик ошибок')}
        </button>
        <span className="muted small">
          {tr('Other languages (C++, Python, JavaScript) and Unreal are optional: Learn → Lessons / Courses.', 'Другие языки (C++, Python, JavaScript) и Unreal — по желанию: Учиться → Уроки / Курсы.')}
          {lockAhead ? ` ${tr('Locks can be switched off in Settings.', 'Замки можно выключить в Настройках.')}` : ''}
        </span>
      </div>
    </div>
  );
}

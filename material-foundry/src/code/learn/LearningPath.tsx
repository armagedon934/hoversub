// "My path": one clear order through everything in the program — so nothing is learned twice by
// accident and every next step is obvious. Each stage shows its progress and one big button that
// opens exactly the next lesson. Skipping is allowed: the path is advice, not a lock.

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
import { useCode, type CodeView } from '../ui/store';
import { COURSES } from './courses';
import { courseRequest } from './CourseView';
import { useLearn } from './progress';

const T = (en: string, ru: string): Text2 => ({ en, ru });

interface Stage {
  id: string;
  icon: string;
  title: Text2;
  why: Text2;
  /** Lesson ids in order and which are done. */
  items: { id: string; title: Text2 }[];
  done: Set<string>;
  open: (nextId: string | undefined) => void;
  optional?: boolean;
}

export function usePathStages(): Stage[] {
  const unity = useUnityProgress((s) => s.done);
  const shooter = useShooter((s) => s.done);
  const racing = useRacing((s) => s.done);
  const models = useModels((s) => s.done);
  const sound = useSoundLab((s) => s.done);
  const learnDone = useLearn((s) => s.done);
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
  return [
    {
      id: '2d',
      icon: '🕹',
      title: T('First Unity scripts in 2D', 'Первые скрипты Unity в 2D'),
      why: T('Start, Update, keys, Time.deltaTime, triggers, physics, spawning — in a simple flat world where everything is easy to see.', 'Start, Update, клавиши, Time.deltaTime, триггеры, физика, создание объектов — в простом плоском мире, где всё легко увидеть.'),
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
      title: T('C# for Unity — the theory next to it', 'C# для Unity — теория рядом'),
      why: T('Types, if, loops, arrays, List, methods, classes… Each lesson: text and code on the left, the result on the right, and a button to the same idea in a game. Do them alongside the games, one at a time.', 'Типы, if, циклы, массивы, List, методы, классы… В каждом уроке: текст и код слева, результат справа и кнопка к той же идее в игре. Проходи параллельно с играми, по одному.'),
      items: course('cs-unity').lessons.map((l) => ({ id: l.id, title: l.title })),
      done: courseDone('cs-unity'),
      open: openCourse('cs-unity'),
    },
    {
      id: 'platformer',
      icon: '🏗',
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
      title: T('3D: body, eyes and weapons', '3D: тело, глаза и оружие'),
      why: T('The same basics, now in 3D first person: mouse look, CharacterController, jumping, rays, damage, coroutines, classes. If 2D is done, this goes fast — repetition is good for memory.', 'Те же основы, теперь в 3D от первого лица: обзор мышью, CharacterController, прыжки, лучи, урон, корутины, классы. Если 2D пройдено — пойдёт быстро; повторение полезно для памяти.'),
      items: mission((m) => /^s(0\d|1[0-5])$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'bots',
      icon: '🧠',
      title: T('Enemies and living bots', 'Враги и живые боты'),
      why: T('Patrol, eyes, a brain — then make bots human: smooth turning, reaction time, a calming aim, glances, memory, character. Watch them in spectator mode.', 'Патруль, глаза, мозг — потом бот становится человеком: плавный поворот, реакция, успокаивающийся прицел, оглядывание, память, характер. Наблюдай за ними в режиме зрителя.'),
      items: mission((m) => /^(s1[6-8]|b\d)$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'atmosphere',
      icon: '🌬',
      title: T('Atmosphere and the match', 'Атмосфера и матч'),
      why: T('A body that is not wooden: inertia, head bob, speed, leaning, a living weapon, procedural walking — and a real match on a map.', 'Тело не деревянное: инерция, покачивание, скорость, наклоны, живое оружие, процедурная ходьба — и настоящий матч на карте.'),
      items: mission((m) => /^s(19|2\d)$/.test(m.id)),
      done: new Set(shooter),
      open: openShooter,
    },
    {
      id: 'racing',
      icon: '🏎',
      title: T('Racing: physics, ghost, damage, AI', 'Гонки: физика, призрак, повреждения, ИИ'),
      why: T('A car from scratch, laps, a Trackmania ghost, paint, BeamNG-style dents, an autopilot and a car that learns by itself.', 'Машина с нуля, круги, призрак как в Trackmania, покраска, вмятины как в BeamNG, автопилот и машина, которая учится сама.'),
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
      title: T('Sound for games', 'Звук для игр'),
      why: T('Make sounds with code (OnAudioFilterRead) and with the synthesizer — then use them as your gunshot or engine.', 'Делай звуки кодом (OnAudioFilterRead) и синтезатором — потом ставь их как свой выстрел или мотор.'),
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
      title: T('Models and materials', 'Модели и материалы'),
      why: T('Models from parts, materials from your own texture studio, textures that sit right, relief, detail by distance.', 'Модели из деталей, материалы из твоей студии текстур, ровно сидящие текстуры, рельеф, детали по расстоянию.'),
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
      title: T('C# further (when you feel sure)', 'C# дальше (когда уже уверенно)'),
      why: T('static, struct vs class, interfaces, events, generics, null-safety — what big projects are made of.', 'static, struct и class, интерфейсы, события, обобщения, защита от null — из этого строятся большие проекты.'),
      items: course('cs-advanced').lessons.map((l) => ({ id: l.id, title: l.title })),
      done: courseDone('cs-advanced'),
      open: openCourse('cs-advanced'),
      optional: true,
    },
  ];
}

/** The next unfinished stage and lesson. */
export function nextStep(stages: Stage[]): { stage: Stage; item?: { id: string; title: Text2 } } {
  for (const s of stages) {
    const item = s.items.find((i) => !s.done.has(i.id));
    if (item && !s.optional) return { stage: s, item };
  }
  return { stage: stages[stages.length - 1] };
}

export function LearningPath() {
  const stages = usePathStages();
  const next = nextStep(stages);
  return (
    <div className="lp" data-testid="learning-path">
      <h2>🗺 {tr('My path', 'Мой путь')}</h2>
      <p className="muted">{tr('One order through everything — so you never learn the same thing twice by accident. You can jump anywhere; the path only suggests.', 'Один порядок через всё — чтобы случайно не учить одно и то же дважды. Можно прыгать куда угодно; путь только подсказывает.')}</p>
      <button className="lp-next" onClick={() => next.stage.open(next.item?.id)} data-testid="path-continue">
        <span className="lp-next-icon">{next.stage.icon}</span>
        <span>
          <b>{tr('Continue', 'Продолжить')}: {pick(next.stage.title)}</b>
          {next.item ? <span>→ {pick(next.item.title)}</span> : null}
        </span>
        <span className="lp-go">▶</span>
      </button>
      <ol className="lp-stages">
        {stages.map((s, i) => {
          const done = s.items.filter((x) => s.done.has(x.id)).length;
          const all = s.items.length;
          const current = s === next.stage;
          return (
            <li key={s.id} className={`lp-stage${current ? ' on' : ''}${done === all ? ' done' : ''}`} data-testid="path-stage">
              <span className="lp-n">{done === all ? '✓' : i + 1}</span>
              <div className="lp-body">
                <b>
                  {s.icon} {pick(s.title)} {s.optional ? <span className="muted small">({tr('optional', 'по желанию')})</span> : null}
                </b>
                <span className="muted small">{pick(s.why)}</span>
                <span className="lp-bar">
                  <span style={{ width: `${(done / all) * 100}%` }} />
                </span>
              </div>
              <span className="muted small">
                {done}/{all}
              </span>
              <button className="btn small" onClick={() => s.open(s.items.find((x) => !s.done.has(x.id))?.id)} data-testid={`path-open-${s.id}`}>
                {done === all ? tr('Again', 'Ещё раз') : done ? tr('Continue', 'Дальше') : tr('Start', 'Начать')}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="muted small">🐞 {tr('Every day: 5 minutes of trainers (find the bug, predict the output) — in "Learn → Trainers".', 'Каждый день: 5 минут тренажёров (найди баг, что выведет) — в «Учиться → Тренажёры».')}</p>
    </div>
  );
}

export type { CodeView };

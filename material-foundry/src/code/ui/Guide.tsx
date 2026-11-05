// "What to do now?" — one short sentence and (when useful) one button, always at the top. It looks
// at what the person has already done and suggests exactly one next step, and highlights the place
// to click. It can be switched off in Settings.

import { ArrowRight, Lightbulb, X } from 'lucide-react';
import { count, tr } from '../i18n';
import { useCode, workspace } from './store';

export interface GuideState {
  text: string;
  /** Which element to highlight (matches a CSS rule on [data-guide-now]). */
  target: string | null;
  action?: { label: string; run: () => void; testId: string };
  step?: number;
}

export function useGuide(): GuideState | null {
  const files = useCode((s) => s.files.length);
  const view = useCode((s) => s.view);
  const openPath = useCode((s) => s.openPath);
  const selection = useCode((s) => !!s.selection);
  const clicks = useCode((s) => s.clicks);
  const overview = useCode((s) => s.overview);
  const wsVersion = useCode((s) => s.wsVersion);
  void wsVersion;
  const changed = workspace.changedFiles().length;
  const s = useCode.getState();

  if (view === 'learn') return null;
  if (view === 'workshop')
    return { text: tr('Write code. Grey text = a guess of what comes next (Tab accepts). Red underline = a problem with a fix on the right. "Run" runs it safely.', 'Пиши код. Серый текст — догадка, что дальше (Tab — принять). Красное подчёркивание — проблема, справа есть исправление. «Запустить» — безопасный запуск.'), target: null };
  if (view === 'unity')
    return { text: tr('1) Read the task. 2) Change the code on the left. 3) Press "Play" and use the arrow keys. Stuck? Press "Hint".', '1) Прочитай задание. 2) Измени код слева. 3) Нажми «Играть» и жми стрелки. Застрял? Нажми «Подсказка».'), target: null };
  if (view === 'shooter' || view === 'racing' || view === 'models')
    return { text: tr('1) Read the radio message. 2) Fill the highlighted ___ in the code. 3) "Upload the script", click the game and play. Stuck? "Hint" or "Show me how to play".', '1) Прочитай сообщение по рации. 2) Заполни подсвеченные ___ в коде. 3) «Загрузить прошивку», нажми на игру и играй. Застрял? «Подсказка» или «Покажи, как играть».'), target: null };
  if (view === 'path')
    return { text: tr('This is your path: one order through everything. The big button opens the next lesson. You can open any stage, even out of order.', 'Это твой путь: один порядок через всё. Большая кнопка открывает следующий урок. Можно открыть любой этап, даже не по порядку.'), target: null };
  if (view === 'sound')
    return { text: tr('Lessons: fill the ___ and press "Build and listen" — the wave is on the right, the sliders change the sound live. Synthesizer: presets and sliders, every change plays at once.', 'Уроки: заполни ___ и нажми «Собрать и послушать» — справа волна, ползунки меняют звук вживую. Синтезатор: заготовки и ползунки, каждое изменение сразу звучит.'), target: null };
  if (view === 'errors') return { text: tr('Paste the red error text — each error gets a plain explanation and a fix.', 'Вставь красный текст ошибки — для каждой ошибки будет простое объяснение и исправление.'), target: null };
  if (view === 'glossary')
    return { text: tr('This is the dictionary of ideas. Pick any idea on the left; the level buttons change how detailed it is.', 'Это словарь идей. Выбери любую идею слева; кнопки уровней меняют, насколько подробно объяснение.'), target: null };
  if (!files)
    return {
      step: 1,
      text: tr('Start here: "Shooter from zero" — learn Unity C# while playing a 3D game; "Learn from zero" — lessons and courses; "Write my own code" — the Workshop.', 'Начни отсюда: «Шутер с нуля» — учи C# для Unity, играя в 3D-игру; «Учиться с нуля» — уроки и курсы; «Писать свой код» — Мастерская.'),
      target: 'start',
    };
  if (view === 'map') return { text: tr('This is the project map. Arrows show which file uses which. Click a file to open it.', 'Это карта проекта. Стрелки показывают, какой файл каким пользуется. Нажми на файл, чтобы открыть его.'), target: null };
  if (view === 'changes')
    return { text: tr('Here you see everything you changed. "Undo" goes back one step. Your real files are not touched.', 'Здесь видно всё, что ты изменил. «Отменить» возвращает на шаг назад. Твои настоящие файлы не тронуты.'), target: null };
  if (changed && view !== 'code')
    return {
      text: tr(`You changed ${count(changed, ['file', 'files'], ['файл', 'файла', 'файлов'])}. To see or undo it, open "Changes".`, `Ты изменил ${count(changed, ['file', 'files'], ['файл', 'файла', 'файлов'])}. Посмотреть или отменить — вкладка «Изменения».`),
      target: 'changes-tab',
      action: { label: tr('Open Changes', 'Открыть «Изменения»'), run: () => s.setView('changes'), testId: 'guide-action' },
    };
  if (!openPath || view === 'overview') {
    const entry = overview?.entryPoints[0]?.path ?? s.files.find((f) => !f.skipped)?.path;
    return {
      step: 2,
      text: tr('Step 2. This page tells you what the project is. Now open a file with code — the best start is the main file.', 'Шаг 2. На этой странице рассказано, что это за проект. Теперь открой файл с кодом — лучше всего начать с главного файла.'),
      target: 'tree',
      action: entry ? { label: tr(`Open ${entry.split('/').pop()}`, `Открыть ${entry.split('/').pop()}`), run: () => void s.openFile(entry), testId: 'guide-action' } : undefined,
    };
  }
  if (!selection)
    return { step: 3, text: tr('Step 3. Click any word in the code. The explanation appears on the right.', 'Шаг 3. Нажми на любое слово в коде. Справа появится объяснение.'), target: 'code' };
  if (clicks < 4)
    return {
      step: 4,
      text: tr('Step 4. Read the explanation on the right. Too difficult? Press "I don\'t understand" (bottom right) or choose level 1.', 'Шаг 4. Читай объяснение справа. Слишком сложно? Нажми «Не понимаю» (внизу справа) или выбери уровень 1.'),
      target: 'help',
    };
  if (!changed)
    return {
      step: 5,
      text: tr('Step 5. Curious? Press "What if I change this?" — you will see a preview first, and everything can be undone.', 'Шаг 5. Интересно? Нажми «А что если изменить?» — сначала покажут предпросмотр, и всё можно отменить.'),
      target: 'what-if',
    };
  return {
    text: tr('Great work! Keep clicking on things you do not know, or practise in "Learn".', 'Отлично! Нажимай на всё, что непонятно, или потренируйся во вкладке «Учиться».'),
    target: null,
    action: { label: tr('Go to Learn', 'Перейти к урокам'), run: () => s.setView('learn'), testId: 'guide-action' },
  };
}

export function GuideBar({ guide }: { guide: GuideState }) {
  const setPrefs = useCode((s) => s.setPrefs);
  return (
    <div className="guide" role="note" aria-live="polite" data-testid="guide">
      <span className="guide-icon" aria-hidden>
        <Lightbulb size={18} />
      </span>
      <span className="guide-text">{guide.text}</span>
      {guide.action ? (
        <button className="btn primary" onClick={guide.action.run} data-testid={guide.action.testId}>
          {guide.action.label} <ArrowRight size={15} />
        </button>
      ) : null}
      <button className="icon-btn" onClick={() => setPrefs({ hints: false })} title={tr('Hide these hints (you can turn them back on in Settings)', 'Скрыть подсказки (включить снова можно в Настройках)')} aria-label={tr('Hide hints', 'Скрыть подсказки')} data-testid="guide-hide">
        <X size={15} />
      </button>
    </div>
  );
}

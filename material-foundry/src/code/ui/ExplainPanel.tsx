// The explanation panel: a short answer first, optional details below, five levels that switch
// instantly, and the always-visible "I don't understand" and "Show me with an example" buttons.

import { useMemo, useState } from 'react';
import { BookOpen, Crosshair, HelpCircle, Lightbulb, ListTree, MapPin, Wand2 } from 'lucide-react';
import { LEVELS, explain, type Block, type Level } from '../explain/explain';
import { count, tr } from '../i18n';
import type { Confidence, Fact } from '../analysis/types';
import { getLanguage } from '../languages/registry';
import { Diagrams } from './Diagrams';
import { rangeLabel, useCode } from './store';

export function confidenceLabel(c: Confidence): { label: string; meaning: string } {
  switch (c) {
    case 'verified':
      return { label: tr('Verified', 'Проверено'), meaning: tr('Read directly from the code structure.', 'Взято прямо из структуры кода.') };
    case 'likely':
      return { label: tr('Likely', 'Вероятно'), meaning: tr('Based on names and patterns; very probably right, but not proven.', 'По именам и шаблонам; скорее всего верно, но не доказано.') };
    case 'assumption':
      return { label: tr('Assumption', 'Догадка'), meaning: tr('A guess from naming conventions; it may be wrong.', 'Предположение по привычным названиям; может быть неверным.') };
    default:
      return { label: tr('Unknown', 'Неизвестно'), meaning: tr('Cannot be known without running the program or more context.', 'Нельзя узнать без запуска программы или дополнительных сведений.') };
  }
}

export function levelLabel(l: Level): { short: string; name: string } {
  const names: Record<Level, [string, string, string, string]> = {
    1: ["Like I'm 5", 'Как ребёнку', "Explain like I'm five", 'Объясни как пятилетнему'],
    2: ['Beginner', 'Новичок', 'Complete beginner', 'Для полного новичка'],
    3: ['Technical', 'Техничнее', 'Technical explanation', 'Техническое объяснение'],
    4: ['Deep', 'Глубоко', 'Deep technical analysis', 'Глубокий технический разбор'],
    5: ['Teach me', 'Научи', 'Teach me to do it myself', 'Научи меня делать самому'],
  };
  const n = names[l];
  return { short: tr(n[0], n[1]), name: tr(n[2], n[3]) };
}

export function ConfidenceBadge({ c, compact }: { c: Confidence; compact?: boolean }) {
  const l = confidenceLabel(c);
  return (
    <span className={`conf conf-${c}`} title={`${l.label}: ${l.meaning}`} data-testid="confidence">
      <span className="conf-dot" aria-hidden />
      {compact ? l.label : `${l.label} — ${l.meaning}`}
    </span>
  );
}

function Facts({ facts }: { facts?: Fact[] }) {
  if (!facts?.length) return null;
  return (
    <ul className="facts">
      {facts.map((f, i) => (
        <li key={i}>
          <ConfidenceBadge c={f.confidence} compact /> {f.text}
        </li>
      ))}
    </ul>
  );
}

function Quiz({ q }: { q: NonNullable<Block['quiz']> }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="quiz">
      <div className="quiz-q">
        <HelpCircle size={14} aria-hidden /> {q.question}
      </div>
      {shown ? (
        <div className="quiz-a" data-testid="quiz-answer">
          {q.answer}
        </div>
      ) : (
        <button className="btn small" onClick={() => setShown(true)} data-testid="quiz-reveal">
          {tr('Show the answer', 'Показать ответ')}
        </button>
      )}
    </div>
  );
}

function BlockView({ b }: { b: Block }) {
  const content = (
    <>
      {b.lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      <Facts facts={b.facts} />
      {b.quiz ? <Quiz q={b.quiz} /> : null}
    </>
  );
  if (b.collapsed)
    return (
      <details className="xb" data-block={b.id}>
        <summary>{b.heading}</summary>
        <div className="xb-body">{content}</div>
      </details>
    );
  return (
    <section className="xb open" data-block={b.id}>
      <h4>{b.heading}</h4>
      <div className="xb-body">{content}</div>
    </section>
  );
}

/** Short description of a language, in the interface language. */
export function langAbout(id: string, en: string): string {
  return tr(en, LANG_ABOUT_RU[id] ?? en);
}

const LANG_ABOUT_RU: Record<string, string> = {
  python: 'Популярный язык общего назначения с читаемым кодом. Скрипты, сайты, данные, ИИ, простые игры.',
  javascript: 'Язык веб-страниц и браузерных игр; также серверы (Node.js).',
  typescript: 'JavaScript с указанием типов данных — помогает находить ошибки заранее.',
  tsx: 'TypeScript с разметкой интерфейса (React).',
  html: 'Разметка веб-страницы: что на ней находится (текст, кнопки, картинки).',
  css: 'Оформление веб-страницы: цвета, размеры, расположение.',
  c: 'Быстрый язык «близко к железу»: системы, устройства, движки; основа многих языков.',
  cpp: 'C с классами и шаблонами: игровые движки (Unreal Engine), большие и быстрые программы.',
  csharp: 'Язык Microsoft: игры на Unity, программы для Windows, серверы.',
  java: 'Язык для серверов, Android-приложений и больших программ.',
  rust: 'Быстрый и надёжный системный язык, защищающий от ошибок с памятью.',
  go: 'Простой быстрый язык от Google для серверов и утилит.',
  php: 'Язык для сайтов, который работает на сервере.',
  ruby: 'Приятный для чтения язык; известен веб-фреймворком Rails.',
  swift: 'Язык Apple для приложений iPhone, iPad и Mac.',
  kotlin: 'Современный язык для Android и серверов (работает на Java-платформе).',
  json: 'Формат данных: пары «имя — значение» в фигурных скобках. Инструкций не содержит.',
  bash: 'Команды для терминала Linux/macOS, собранные в скрипт.',
  toml: 'Формат файлов настроек: разделы [вот так] и строки «ключ = значение».',
  lua: 'Лёгкий встраиваемый язык; часто используется для скриптов в играх.',
  yaml: 'Формат файлов настроек, где важны отступы.',
  sql: 'Язык запросов к базам данных: выбрать, добавить, изменить данные.',
  xml: 'Формат данных с тегами в угловых скобках.',
  powershell: 'Язык команд и скриптов Windows.',
  ini: 'Простой формат настроек: [разделы] и «ключ = значение».',
  dockerfile: 'Рецепт для упаковки программы в контейнер Docker.',
  makefile: 'Правила сборки программы для утилиты make.',
  markdown: 'Текст с простой разметкой (заголовки, списки) — для людей, не для компьютера.',
  batch: 'Командные файлы Windows (.bat).',
  scss: 'CSS с дополнительными возможностями (переменные, вложенность).',
  gitignore: 'Список файлов, которые Git не должен сохранять.',
  plaintext: 'Обычный текст.',
  unknown: 'Формат не распознан — файл показан как обычный текст.',
};

export function LevelSwitch() {
  const level = useCode((s) => s.prefs.level);
  const setLevel = useCode((s) => s.setLevel);
  return (
    <div className="levels" role="radiogroup" aria-label={tr('How detailed should explanations be?', 'Насколько подробно объяснять?')}>
      {LEVELS.map((l) => (
        <button
          key={l.level}
          role="radio"
          aria-checked={level === l.level}
          className={level === l.level ? 'on' : ''}
          onClick={() => setLevel(l.level)}
          title={`${levelLabel(l.level).name} (${tr('key', 'клавиша')} ${l.level})`}
          data-testid={`level-${l.level}`}
        >
          <span className="lv-n">{l.level}</span>
          {levelLabel(l.level).short}
        </button>
      ))}
    </div>
  );
}

function FileHelp() {
  const open = useCode((s) => s.open);
  const path = useCode((s) => s.openPath);
  const select = useCode((s) => s.select);
  const simplerStep = useCode((s) => s.simplerStep);
  const showExample = useCode((s) => s.showExample);
  const summaries = useCode((s) => s.summaries);
  if (!open || !path) return null;
  // The project index fills in where each import leads (resolved file or outside library).
  const imports = summaries[path]?.imports ?? open.summary.imports;
  const s = open.summary;
  const lang = getLanguage(s.languageId);
  const fns = s.symbols.filter((x) => x.kind === 'function' || x.kind === 'method' || x.kind === 'class').slice(0, 30);
  const how =
    open.detectedBy === 'extension'
      ? tr('from the file name ending', 'по окончанию имени файла')
      : open.detectedBy === 'filename'
        ? tr('from the file name', 'по имени файла')
        : open.detectedBy === 'shebang'
          ? tr('from the first line (#!)', 'по первой строке (#!)')
          : open.detectedBy === 'content'
            ? tr('by looking at the content', 'по содержимому')
            : tr('it could not be recognised', 'не удалось определить');
  return (
    <div className="xp-file" data-testid="file-help">
      <h3>{path.split('/').pop()}</h3>
      <p className="xp-summary">
        {tr('This file is written in', 'Этот файл написан на языке')} <b>{lang.name}</b>. {langAbout(lang.id, lang.about)}
      </p>
      {simplerStep > 0 ? <p className="xp-simpler">{tr('Think of a file like a page in a recipe book: it holds instructions. Click any word and I will explain just that word.', 'Представь, что файл — это страница из книги рецептов: в ней записаны инструкции. Нажми на любое слово — и я объясню именно его.')}</p> : null}
      <ul className="xp-meta">
        <li>
          {tr('Language found', 'Язык определён')} {how}
          {open.detectionConfidence !== 'verified' ? <ConfidenceBadge c={open.detectionConfidence} compact /> : null}
        </li>
        <li>
          {count(s.lineCount, ['line', 'lines'], ['строка', 'строки', 'строк'])} ·{' '}
          {s.mode === 'syntax-tree' ? tr('full understanding of the structure', 'полное понимание структуры') : s.mode === 'tokens' ? tr('word-level understanding (no full structure)', 'понимание по словам (без полной структуры)') : tr('shown as plain text only', 'показан как простой текст')}
        </li>
        {open.fallback ? <li className="warn-text">{open.fallback}</li> : null}
        {s.limited ? <li className="warn-text">{s.limited}</li> : null}
        {s.issues.length ? (
          <li className="warn-text">
            {tr(`${s.issues.length} possible mistake${s.issues.length === 1 ? '' : 's'} in the writing (marked with a warning sign next to the line number).`, `Возможных ошибок в записи: ${s.issues.length} (отмечены значком ⚠ рядом с номером строки).`)}
          </li>
        ) : null}
      </ul>
      {showExample ? <p className="xp-simpler">{tr('Examples belong to a single word or symbol. Click something in the code first, and the example for it will appear.', 'Пример показывается для конкретного слова или значка. Сначала нажми на что-нибудь в коде — и появится пример.')}</p> : null}
      <div className="xp-tip">
        <Crosshair size={14} aria-hidden /> {tr('Click any word, symbol or bracket in the code to get an explanation. Use the arrow keys to move from word to word.', 'Нажми на любое слово, значок или скобку в коде — появится объяснение. Стрелками на клавиатуре можно переходить от слова к слову.')}
      </div>
      {fns.length ? (
        <>
          <h4>
            <ListTree size={14} aria-hidden /> {tr('Main parts of this file', 'Главные части этого файла')}
          </h4>
          <ul className="xp-outline">
            {fns.map((f) => (
              <li key={`${f.name}${f.range.start}`}>
                <button className="linklike" onClick={() => void select(f.range.start)}>
                  {f.kind === 'class' ? tr('Group (class)', 'Группа (класс)') : f.kind === 'method' ? tr('Action of a group', 'Действие группы') : tr('Function', 'Функция')}: <b>{f.name}</b>
                </button>{' '}
                <span className="muted">{rangeLabel(f.fullRange)}</span>
                {f.doc ? <div className="muted small">“{f.doc.split('\n')[0].slice(0, 120)}”</div> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {imports.length ? (
        <>
          <h4>{tr('It uses', 'Он использует')}</h4>
          <ul className="xp-outline">
            {imports.slice(0, 20).map((i, k) => (
              <li key={k}>
                <code>{i.spec}</code>{' '}
                <span className="muted">
                  {i.resolved ? `→ ${i.resolved}` : i.external ? tr('(from outside the project, for example a library)', '(извне проекта, например библиотека)') : tr('(not found among the opened files)', '(не найден среди открытых файлов)')}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function ExplainPanel() {
  const sel = useCode((s) => s.selection);
  const level = useCode((s) => s.prefs.level);
  const simplerStep = useCode((s) => s.simplerStep);
  const showExample = useCode((s) => s.showExample);
  const simpler = useCode((s) => s.simpler);
  const toggleExample = useCode((s) => s.toggleExample);
  const goToDefinition = useCode((s) => s.goToDefinition);
  const showUses = useCode((s) => s.showUses);
  const setWhatIf = useCode((s) => s.setWhatIf);
  const open = useCode((s) => s.open);
  const openPath = useCode((s) => s.openPath);

  const x = useMemo(() => (sel ? explain(sel.element, { level, simplerStep, showExample, cross: sel.cross }) : null), [sel, level, simplerStep, showExample]);
  const el = sel?.element;
  const canGo = !!el && ((el.definitions?.length ?? 0) > 0 || (sel?.cross?.definitionsElsewhere.length ?? 0) > 0);
  const canUses = !!el && (el.references?.length ?? 0) > 0;

  return (
    <aside className="xp" aria-label={tr('Explanation', 'Объяснение')} data-testid="explain-panel">
      <LevelSwitch />
      <div className="xp-scroll">
        {!openPath ? (
          <div className="xp-file">
            <h3>{tr('Explanations appear here', 'Здесь появятся объяснения')}</h3>
            <p>{tr('Open a file on the left, then click any word in it.', 'Открой файл слева, потом нажми на любое слово в нём.')}</p>
          </div>
        ) : !open ? (
          <div className="xp-file">
            <p>{tr('This file cannot be shown as text, so there is nothing to explain inside it.', 'Этот файл нельзя показать как текст, поэтому объяснять в нём нечего.')}</p>
          </div>
        ) : !x || !el ? (
          <FileHelp />
        ) : (
          <div className="xp-main" data-testid="explanation">
            <div className="xp-where">
              <MapPin size={12} aria-hidden /> {rangeLabel(el.range)}
              {el.enclosingFunction ? ` · ${tr('inside', 'внутри')} ${el.enclosingFunction}` : ''}
              {el.enclosingClass && el.enclosingClass !== el.enclosingFunction ? ` · ${tr('in', 'в')} ${el.enclosingClass}` : ''}
            </div>
            <h3 className="xp-title" data-testid="explain-title">
              <code>{x.title}</code>
              <span className="xp-concept">{x.conceptTitle}</span>
            </h3>
            <p className="xp-summary" data-testid="explain-summary">
              {x.summary}
            </p>
            <ConfidenceBadge c={x.confidence} />
            {x.example?.code ? (
              <div className="xp-example" data-testid="example">
                <div className="muted small">{tr('Example', 'Пример')} ({getLanguage(x.example.lang).name}) — {tr('not from your project', 'не из твоего проекта')}:</div>
                <pre>{x.example.code}</pre>
              </div>
            ) : null}
            {x.blocks.map((b) => (
              <BlockView key={`${b.id}-${level}-${simplerStep}`} b={b} />
            ))}
            {el.context.length ? (
              <details className="xb">
                <summary>{tr('Where exactly am I?', 'Где именно я нахожусь?')}</summary>
                <div className="xb-body">
                  <ol className="ctx">
                    {el.context.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                </div>
              </details>
            ) : null}
            <div className="xp-actions">
              <button className="btn small" onClick={() => void goToDefinition()} disabled={!canGo} title={tr('Jump to where this is created (key g)', 'Перейти туда, где это создаётся (клавиша g)')} data-testid="go-definition">
                <Crosshair size={14} /> {tr('Where is it made?', 'Где это создаётся?')}
              </button>
              <button className="btn small" onClick={showUses} disabled={!canUses} title={tr('Highlight every place it is used in this file (key u)', 'Подсветить все места в файле, где это используется (клавиша u)')} data-testid="show-uses">
                <ListTree size={14} /> {tr('Show every use', 'Где используется?')}
              </button>
              <button className="btn small accent" onClick={() => setWhatIf(true)} title={tr('See what would happen if you changed this (key w)', 'Посмотреть, что будет, если это изменить (клавиша w)')} data-testid="what-if" data-guide="what-if">
                <Wand2 size={14} /> {tr('What if I change this?', 'А что если изменить?')}
              </button>
            </div>
            <Diagrams />
          </div>
        )}
        {!sel && open ? <Diagrams /> : null}
      </div>
      <div className="xp-help" role="group" aria-label={tr('Help', 'Помощь')} data-guide="help">
        <button className="btn help-btn" onClick={simpler} title={tr('Explain it in a different, simpler way (key ?)', 'Объяснить по-другому, проще (клавиша ?)')} data-testid="dont-understand">
          <Lightbulb size={16} /> {tr('I don’t understand', 'Не понимаю')}
        </button>
        <button className={`btn help-btn${showExample ? ' on' : ''}`} onClick={toggleExample} aria-pressed={showExample} title={tr('Show a small example (key e)', 'Показать маленький пример (клавиша e)')} data-testid="show-example">
          <BookOpen size={16} /> {tr('Show me with an example', 'Покажи на примере')}
        </button>
      </div>
    </aside>
  );
}

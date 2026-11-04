// UNDERSTAND CODE — the module's main screen. Only what is needed right now is shown:
//  • nothing open → three big choices (learn / example / my own code)
//  • a project → files on the left, the code or project pages in the middle, the explanation on
//    the right (only while reading code)
//  • learning and the dictionary use the whole width
// A one-line helper on top always says what to do next. Opening files only reads them.

import { useEffect, useState } from 'react';
import { BookOpenText, Code2, FileDiff, FolderOpen, Gamepad2, Home, Map as MapIcon, Minus, Moon, Network, Plus, Rows3, Search, Settings, ShieldCheck, Sparkles, Sun, X } from 'lucide-react';
import { getLanguage } from '../languages/registry';
import { tr, type Locale } from '../i18n';
import { Learn } from '../learn/Learn';
import { getCodeClient } from '../worker/client';
import { ChangesView } from './ChangesView';
import { CodeView } from './CodeView';
import { ExplainPanel } from './ExplainPanel';
import { Explorer, OpenButtons } from './Explorer';
import { Glossary } from './Glossary';
import { GuideBar, useGuide } from './Guide';
import { Overview, ProjectMap } from './Overview';
import { WhatIfDialog } from './WhatIf';
import { readDataTransfer } from './fileLoading';
import { useCode, workspace, type CodeView as View } from './store';
import './code.css';

function shortcuts(): [string, string][] {
  return [
    ['← → ↑ ↓', tr('Move from word to word in the code (click into the code first)', 'Переход от слова к слову в коде (сначала нажми на код)')],
    ['1 – 5', tr('How detailed explanations are', 'Насколько подробно объяснять')],
    ['?', tr('I don\'t understand — explain it another way', 'Не понимаю — объясни по-другому')],
    ['e', tr('Show me with an example', 'Покажи на примере')],
    ['g', tr('Go to where the selected thing is made', 'Перейти туда, где это создаётся')],
    ['u', tr('Show every use', 'Показать все места использования')],
    ['w', tr('What if I change this?', 'А что если изменить?')],
    ['Esc', tr('Clear the selection / close a window', 'Снять выделение / закрыть окно')],
    ['Ctrl+Z / Ctrl+Shift+Z', tr('Undo / redo a change', 'Отменить / вернуть изменение')],
  ];
}

function Welcome() {
  const setView = useCode((s) => s.setView);
  const openExample = useCode((s) => s.openExample);
  const busy = useCode((s) => s.busy);
  return (
    <div className="welcome" data-testid="code-welcome">
      <h1>{tr('Understand code — without fear', 'Понимать код — без страха')}</h1>
      <p className="welcome-lead">{tr('Choose one of three ways to start. You can always come back here.', 'Выбери один из трёх способов начать. Сюда всегда можно вернуться.')}</p>
      <div className="start-cards" data-guide="start">
        <button className="start-card" onClick={() => setView('learn')} data-testid="start-learn">
          <span className="start-emoji" aria-hidden>
            🎮
          </span>
          <b>{tr('Learn from zero', 'Учиться с нуля')}</b>
          <span>{tr('Short lessons with animations and mini-games. C#, C++, C, Python, JavaScript.', 'Короткие уроки с анимацией и мини-играми. C#, C++, C, Python, JavaScript.')}</span>
        </button>
        <button className="start-card" onClick={() => void openExample()} disabled={!!busy} data-testid="open-example">
          <span className="start-emoji" aria-hidden>
            🔍
          </span>
          <b>{tr('Look at an example', 'Посмотреть пример')}</b>
          <span>{tr('A tiny shop program. Click on anything and read what it means.', 'Маленькая программа-магазин. Нажимай на что угодно и читай, что это значит.')}</span>
        </button>
        <div className="start-card as-div">
          <span className="start-emoji" aria-hidden>
            📂
          </span>
          <b>{tr('Open my own code', 'Открыть свой код')}</b>
          <span>{tr('A folder or files from your computer. Any language.', 'Папку или файлы с компьютера. Любой язык.')}</span>
          <OpenButtons example={false} />
        </div>
      </div>
      <ul className="welcome-points">
        <li>
          <ShieldCheck size={16} aria-hidden /> {tr('Safe: files are only read. Nothing you open is ever run, and your files never change without your clear "yes".', 'Безопасно: файлы только читаются. Ничего из открытого не запускается, а твои файлы не меняются без твоего ясного «да».')}
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden /> {tr('Private: everything stays on this computer. No internet, no AI service, no account.', 'Приватно: всё остаётся на этом компьютере. Без интернета, без ИИ-сервисов, без регистрации.')}
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden /> {tr('Honest: every explanation says how sure it is.', 'Честно: каждое объяснение говорит, насколько оно уверено.')}
        </li>
      </ul>
      <p className="muted small">{tr('You can also drag files or a folder onto this window.', 'Файлы или папку можно просто перетащить в это окно.')}</p>
    </div>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = useCode((s) => s.prefs);
  const setPrefs = useCode((s) => s.setPrefs);
  const [keys, setKeys] = useState(false);
  const lang = (l: Locale) => setPrefs({ locale: l });
  return (
    <div className="popover" role="dialog" aria-label={tr('Settings', 'Настройки')} data-testid="settings-panel">
      <div className="pop-row">
        <span>{tr('Language', 'Язык')}</span>
        <button className={`btn small${prefs.locale === 'ru' ? ' on' : ''}`} onClick={() => lang('ru')} data-testid="lang-ru">
          Русский
        </button>
        <button className={`btn small${prefs.locale === 'en' ? ' on' : ''}`} onClick={() => lang('en')} data-testid="lang-en">
          English
        </button>
      </div>
      <div className="pop-row">
        <span>{tr('Colours', 'Цвета')}</span>
        <button className={`btn small${prefs.theme === 'dark' ? ' on' : ''}`} onClick={() => setPrefs({ theme: 'dark' })} data-testid="theme-dark">
          <Moon size={13} /> {tr('Dark', 'Тёмные')}
        </button>
        <button className={`btn small${prefs.theme === 'light' ? ' on' : ''}`} onClick={() => setPrefs({ theme: 'light' })} data-testid="theme-light">
          <Sun size={13} /> {tr('Light', 'Светлые')}
        </button>
      </div>
      <div className="pop-row">
        <span>{tr('Text size', 'Размер текста')}</span>
        <button className="btn small" onClick={() => setPrefs({ fontSize: Math.max(12, prefs.fontSize - 1) })} aria-label={tr('Smaller text', 'Мельче')} data-testid="font-smaller">
          <Minus size={13} />
        </button>
        <b>{prefs.fontSize}</b>
        <button className="btn small" onClick={() => setPrefs({ fontSize: Math.min(24, prefs.fontSize + 1) })} aria-label={tr('Bigger text', 'Крупнее')} data-testid="font-bigger">
          <Plus size={13} />
        </button>
      </div>
      <div className="pop-row">
        <span>{tr('Line spacing', 'Между строками')}</span>
        <button className={`btn small${prefs.spacing ? ' on' : ''}`} onClick={() => setPrefs({ spacing: !prefs.spacing })} aria-pressed={prefs.spacing}>
          <Rows3 size={13} /> {prefs.spacing ? tr('Roomy', 'Просторно') : tr('Normal', 'Обычно')}
        </button>
      </div>
      <div className="pop-row">
        <span>{tr('Hints', 'Подсказки')}</span>
        <button className={`btn small${prefs.hints ? ' on' : ''}`} onClick={() => setPrefs({ hints: !prefs.hints })} aria-pressed={prefs.hints} data-testid="toggle-hints">
          {prefs.hints ? tr('On', 'Включены') : tr('Off', 'Выключены')}
        </button>
      </div>
      <button className="linklike small" onClick={() => setKeys(!keys)} aria-expanded={keys}>
        {tr('Keyboard shortcuts', 'Клавиши')} {keys ? '▲' : '▼'}
      </button>
      {keys ? (
        <table className="keys">
          <tbody>
            {shortcuts().map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button className="btn small" onClick={onClose}>
        {tr('Done', 'Готово')}
      </button>
    </div>
  );
}

function Toasts() {
  const toasts = useCode((s) => s.toasts);
  return (
    <div className="cm-toasts" aria-live="polite" data-testid="code-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.text}
          <button onClick={() => useCode.setState({ toasts: useCode.getState().toasts.filter((x) => x.id !== t.id) })} aria-label={tr('Close', 'Закрыть')}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function CodeModule() {
  const init = useCode((s) => s.init);
  const prefs = useCode((s) => s.prefs);
  const view = useCode((s) => s.view);
  const setView = useCode((s) => s.setView);
  const busy = useCode((s) => s.busy);
  const error = useCode((s) => s.error);
  const files = useCode((s) => s.files);
  const open = useCode((s) => s.open);
  const openPath = useCode((s) => s.openPath);
  const loadProject = useCode((s) => s.loadProject);
  const wsVersion = useCode((s) => s.wsVersion);
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const guide = useGuide();

  useEffect(() => {
    void init();
    // Local automation hook used by the browser tests (no telemetry, nothing leaves the page).
    const w = window as unknown as { __mf?: Record<string, unknown> };
    w.__mf = { ...(w.__mf ?? {}), code: useCode, workspace, codeClient: getCodeClient() };
  }, [init]);

  // When the language changes, re-read the open file so explanations made by the analysis follow.
  useEffect(() => {
    const p = useCode.getState().openPath;
    if (p) void useCode.getState().refreshAfterChange([p]);
  }, [prefs.locale]);

  useEffect(() => {
    if (!showSettings) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.popover') || t.closest('[data-testid=open-settings]')) return;
      setShowSettings(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSettings]);

  // Keyboard shortcuts (ignored while typing in a field, in a dialog, or while learning).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const s = useCode.getState();
      if (s.whatIfOpen) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        const undo = k === 'z' && !e.shiftKey;
        const redo = (k === 'z' && e.shiftKey) || k === 'y';
        if (!undo && !redo) return;
        e.preventDefault();
        const cs = undo ? await workspace.undo() : await workspace.redo();
        if (cs) {
          s.toast('info', `${undo ? tr('Undone', 'Отменено') : tr('Done again', 'Возвращено')}: ${cs.label}`);
          await s.refreshAfterChange(cs.edits.map((x) => x.path));
        } else s.toast('info', undo ? tr('Nothing to undo.', 'Нечего отменять.') : tr('Nothing to redo.', 'Нечего возвращать.'));
        return;
      }
      if (e.altKey || s.view === 'learn') return;
      if (/^[1-5]$/.test(e.key)) s.setLevel(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      else if (e.key === '?') s.simpler();
      else if (e.key === 'e') s.toggleExample();
      else if (e.key === 'g') void s.goToDefinition();
      else if (e.key === 'u') s.showUses();
      else if (e.key === 'w' && s.selection) s.setWhatIf(true);
      else if (e.key === 'Escape') {
        setShowSettings(false);
        s.clearSelection();
      } else return;
      e.preventDefault();
    };
    const h = (e: KeyboardEvent) => void onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  void wsVersion;
  const changedCount = workspace.changedFiles().length;
  const hasProject = files.length > 0;
  const shownView: View = !hasProject && (view === 'code' || view === 'overview' || view === 'map' || view === 'changes') ? 'welcome' : view;
  const tabs: { v: View; label: string; icon: React.ReactNode; guide?: string }[] = hasProject
    ? [
        { v: 'learn', label: tr('Learn', 'Учиться'), icon: <Gamepad2 size={16} /> },
        { v: 'overview', label: tr('About the project', 'О проекте'), icon: <BookOpenText size={16} /> },
        { v: 'code', label: tr('Code', 'Код'), icon: <Code2 size={16} /> },
        { v: 'map', label: tr('Map', 'Карта'), icon: <Network size={16} /> },
        { v: 'changes', label: changedCount ? `${tr('Changes', 'Изменения')} (${changedCount})` : tr('Changes', 'Изменения'), icon: <FileDiff size={16} />, guide: 'changes-tab' },
        { v: 'glossary', label: tr('Dictionary', 'Словарь'), icon: <MapIcon size={16} /> },
      ]
    : [
        { v: 'welcome', label: tr('Start', 'Начало'), icon: <Home size={16} /> },
        { v: 'learn', label: tr('Learn', 'Учиться'), icon: <Gamepad2 size={16} /> },
        { v: 'glossary', label: tr('Dictionary', 'Словарь'), icon: <MapIcon size={16} /> },
      ];

  // Only the panels that help right now.
  const layout = shownView === 'code' ? 'three' : hasProject && (shownView === 'overview' || shownView === 'map' || shownView === 'changes') ? 'two' : 'one';
  const lang = open ? getLanguage(open.summary.languageId) : null;
  const skipped = openPath ? files.find((f) => f.path === openPath)?.skipped : undefined;

  return (
    <div
      key={prefs.locale}
      className={`cm theme-${prefs.theme}${prefs.spacing ? ' roomy' : ''} layout-${layout}`}
      style={{ ['--cm-font' as string]: `${prefs.fontSize}px` }}
      data-testid="code-module"
      data-guide-now={prefs.hints && guide?.target ? guide.target : undefined}
      lang={prefs.locale}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        if (!e.dataTransfer.items.length) return;
        await loadProject(await readDataTransfer(e.dataTransfer));
      }}
    >
      {layout !== 'one' ? <Explorer /> : null}
      <main className="cm-center">
        <div className="cm-tabs" role="tablist" aria-label={tr('Sections', 'Разделы')}>
          {tabs.map((t) => (
            <button key={t.v} role="tab" aria-selected={shownView === t.v} className={shownView === t.v ? 'on' : ''} onClick={() => setView(t.v)} data-testid={`view-${t.v}`} data-guide={t.guide}>
              {t.icon} {t.label}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} data-testid="open-settings" title={tr('Language, colours, text size, hints', 'Язык, цвета, размер текста, подсказки')}>
            <Settings size={16} /> {tr('Settings', 'Настройки')}
          </button>
          {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : null}
        </div>
        {prefs.hints && guide ? <GuideBar guide={guide} /> : null}
        {error ? (
          <div className="cm-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="cm-view">
          {shownView === 'welcome' ? (
            <Welcome />
          ) : shownView === 'learn' ? (
            <Learn />
          ) : shownView === 'glossary' ? (
            <Glossary />
          ) : shownView === 'code' ? (
            openPath ? (
              <div className="cm-code">
                <div className="cm-file-bar" data-testid="file-bar">
                  <b>{openPath}</b>
                  {lang ? <span className="pill">{lang.name}</span> : null}
                  {open ? (
                    <span className={`pill mode-${open.summary.mode}`} title={tr('How deeply this file can be understood', 'Насколько глубоко программа понимает этот файл')}>
                      {open.summary.mode === 'syntax-tree' ? tr('Full structure', 'Полная структура') : open.summary.mode === 'tokens' ? tr('Word level', 'По словам') : tr('Plain text', 'Простой текст')}
                    </span>
                  ) : null}
                  {workspace.isChanged(openPath) ? <span className="pill changed">{tr('Changed (not saved to disk)', 'Изменён (на диске — без изменений)')}</span> : null}
                  <span className="spacer" />
                  <span className="muted small">
                    <Search size={12} aria-hidden /> {tr('Click any word to explain it', 'Нажми на любое слово — будет объяснение')}
                  </span>
                </div>
                {skipped ? (
                  <div className="cm-skipped">
                    <p>{skipped}</p>
                    <p className="muted">{tr('It is listed so you know it exists, but its contents cannot be explained here.', 'Он показан, чтобы ты знал, что он есть, но объяснить его содержимое здесь нельзя.')}</p>
                  </div>
                ) : open ? (
                  <div className="cm-code-wrap" data-guide="code">
                    <CodeView />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="cm-skipped">
                <FolderOpen size={18} aria-hidden /> {tr('Pick a file on the left.', 'Выбери файл слева.')}
              </div>
            )
          ) : shownView === 'overview' ? (
            <Overview />
          ) : shownView === 'map' ? (
            <div className="cm-mapview">
              <ProjectMap />
            </div>
          ) : (
            <ChangesView />
          )}
        </div>
      </main>
      {layout === 'three' ? <ExplainPanel /> : null}
      <WhatIfDialog />
      {busy ? (
        <div className="cm-busy" role="status" data-testid="code-busy">
          <span className="spinner" aria-hidden /> {busy}
        </div>
      ) : null}
      {dragging ? (
        <div className="cm-drop">
          <Sparkles size={20} aria-hidden /> {tr('Drop files or a folder to open them (they are only read, never run)', 'Отпусти файлы или папку, чтобы открыть их (они только читаются и никогда не запускаются)')}
        </div>
      ) : null}
      <Toasts />
    </div>
  );
}

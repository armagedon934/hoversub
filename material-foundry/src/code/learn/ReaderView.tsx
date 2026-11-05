// "Read it simply" — a calm way to read a script: first a MAP (a few coloured blocks, one
// sentence each), then the code 5 lines at a time with a plain translation under every line and
// a traffic light for problems. Made for people who get overwhelmed by a wall of code.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Map as MapIcon, X } from 'lucide-react';
import { pick, tr } from '../i18n';
import { speak } from '../memory/speech';
import { explainLine, isTrivial, scriptMap, type CodeBlock } from './codeReader';

export interface ReaderProblem {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

const PAGE = 5;

export function CodeReader({ code, title, problems = [], onClose, startLine }: { code: string; title: string; problems?: ReaderProblem[]; onClose?: () => void; startLine?: number }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const blocks = useMemo(() => scriptMap(code), [code]);
  // Pages skip empty lines and lone braces: only lines that mean something.
  const meaningful = useMemo(() => lines.map((l, i) => ({ l, i })).filter((x) => !isTrivial(x.l)), [lines]);
  const [view, setView] = useState<'map' | 'read'>(lines.length > 12 ? 'map' : 'read');
  const [page, setPage] = useState(() => (startLine !== undefined ? Math.max(0, Math.floor(meaningful.findIndex((x) => x.i >= startLine) / PAGE)) : 0));
  const pages = Math.max(1, Math.ceil(meaningful.length / PAGE));
  const shown = meaningful.slice(page * PAGE, page * PAGE + PAGE);
  const probAt = (i: number) => problems.filter((p) => p.line === i);
  const firstProblem = problems.length ? meaningful.findIndex((x) => problems.some((p) => p.line === x.i)) : -1;
  const blockOf = (i: number): CodeBlock | undefined => blocks.find((b) => i >= b.from && i <= b.to);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== 'read') return;
      if (e.key === 'ArrowRight') setPage((p) => Math.min(pages - 1, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, pages, onClose]);

  const goToLine = (i: number) => {
    const k = meaningful.findIndex((x) => x.i >= i);
    setPage(Math.max(0, Math.floor(k / PAGE)));
    setView('read');
  };
  const readAloud = () => speak(shown.map((x) => pick(explainLine(x.l) ?? { en: x.l, ru: x.l })).join('. '));
  const block = shown.length ? blockOf(shown[0].i) : undefined;
  const errs = problems.filter((p) => p.severity === 'error').length;
  const warns = problems.filter((p) => p.severity === 'warning').length;

  return (
    <div className="rd" data-testid="code-reader">
      <header className="rd-head">
        <BookOpen size={18} aria-hidden />
        <b>{tr('Read it simply', 'Читаю по-простому')}</b>
        <span className="muted">— {title}</span>
        <span className="spacer" />
        <span className={`rd-light ${errs ? 'red' : warns ? 'yellow' : 'green'}`} title={tr('Problems in this code', 'Проблемы в этом коде')} data-testid="reader-light">
          {errs ? `🔴 ${errs}` : warns ? `🟡 ${warns}` : tr('🟢 no problems found', '🟢 проблем не найдено')}
        </span>
        <div className="rd-switch" role="tablist">
          <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} data-testid="reader-map">
            <MapIcon size={14} /> {tr('Map', 'Карта')}
          </button>
          <button role="tab" aria-selected={view === 'read'} className={view === 'read' ? 'on' : ''} onClick={() => setView('read')} data-testid="reader-read">
            📖 {tr('5 lines at a time', 'По 5 строк')}
          </button>
        </div>
        {onClose ? (
          <button className="btn small ghost" onClick={onClose} aria-label={tr('Close', 'Закрыть')} data-testid="reader-close">
            <X size={15} />
          </button>
        ) : null}
      </header>

      {view === 'map' ? (
        <div className="rd-map" data-testid="reader-blocks">
          <p className="muted">{tr(`The whole script is only ${blocks.length} parts. Pick one to read it slowly.`, `Весь скрипт — это всего ${blocks.length} частей. Выбери одну и прочитай спокойно.`)}</p>
          {blocks.map((b, k) => {
            const bp = problems.filter((p) => p.line >= b.from && p.line <= b.to);
            return (
              <button key={k} className={`rd-block role-${b.role}`} onClick={() => goToLine(b.from)} data-testid="reader-block">
                <span className="rd-block-icon" aria-hidden>
                  {b.icon}
                </span>
                <span className="rd-block-text">
                  <b>{b.name}</b>
                  <span>{b.about}</span>
                </span>
                <span className="muted small">
                  {tr('lines', 'строки')} {b.from + 1}–{b.to + 1}
                </span>
                {bp.length ? <span className="rd-dot red" title={bp[0].message} /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rd-read">
          {block ? (
            <div className={`rd-where role-${block.role}`}>
              {block.icon} <b>{block.name}</b> — {block.about}
            </div>
          ) : null}
          <ol className="rd-lines" data-testid="reader-lines">
            {shown.map(({ l, i }) => {
              const ex = explainLine(l);
              const ps = probAt(i);
              return (
                <li key={i} className={ps.some((p) => p.severity === 'error') ? 'bad' : ps.length ? 'warn' : ''} data-testid="reader-line">
                  <span className="rd-n">{i + 1}</span>
                  <div className="rd-pair">
                    <code>{l.trim()}</code>
                    <span className="rd-say">{ex ? pick(ex) : tr('(no plain translation for this line yet — click it in the editor for an explanation)', '(для этой строки пока нет простого перевода — нажми на неё в редакторе, будет объяснение)')}</span>
                    {ps.map((p, k) => (
                      <span key={k} className={`rd-problem sev-${p.severity}`}>
                        {p.severity === 'error' ? '🔴' : '🟡'} {p.message}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="rd-nav">
            <button className="btn big" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} data-testid="reader-prev">
              <ArrowLeft size={16} /> {tr('Back', 'Назад')}
            </button>
            <span className="rd-progress" aria-label={tr('Progress', 'Прогресс')}>
              {Array.from({ length: pages }, (_, k) => (
                <span key={k} className={k === page ? 'on' : k < page ? 'done' : ''} />
              ))}
            </span>
            <button className="btn big primary" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} data-testid="reader-next">
              {tr('Next 5', 'Следующие 5')} <ArrowRight size={16} />
            </button>
          </div>
          <div className="ws-row">
            <button className="btn small ghost" onClick={readAloud}>
              🔊 {tr('Read these lines aloud', 'Прочитать эти строки вслух')}
            </button>
            {firstProblem >= 0 ? (
              <button className="btn small" onClick={() => setPage(Math.floor(firstProblem / PAGE))} data-testid="reader-to-problem">
                🔴 {tr('Go to the problem', 'Перейти к проблеме')}
              </button>
            ) : null}
            <span className="muted small">{tr('← → keys turn the pages', 'Клавиши ← → листают')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The reader in a calm full-screen window. */
export function ReaderModal(props: { code: string; title: string; problems?: ReaderProblem[]; onClose: () => void; startLine?: number }) {
  return (
    <div className="rd-modal" role="dialog" aria-modal="true" aria-label={tr('Read it simply', 'Читаю по-простому')} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <CodeReader {...props} />
    </div>
  );
}

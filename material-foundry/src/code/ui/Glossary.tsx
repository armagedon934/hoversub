// Every idea the app can explain, searchable, at the chosen level — useful for learning on its own.

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CONCEPTS, getConcept } from '../knowledge/concepts';
import { getLanguage } from '../languages/registry';
import { tr } from '../i18n';
import { LevelSwitch, levelLabel } from './ExplainPanel';
import { useCode } from './store';

export function Glossary() {
  const level = useCode((s) => s.prefs.level);
  const wanted = useCode((s) => s.glossaryConcept);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(wanted);
  useEffect(() => {
    if (wanted) {
      setActive(wanted);
      useCode.setState({ glossaryConcept: null });
    }
  }, [wanted]);
  const all = useMemo(() => CONCEPTS.map((c) => getConcept(c.id)), []);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((c) => c.id !== 'unknown' && (!needle || c.title.toLowerCase().includes(needle) || c.id.includes(needle) || c.levels[1].toLowerCase().includes(needle)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [q, all]);
  const c = active ? getConcept(active) : null;
  return (
    <div className="gl" data-testid="glossary">
      <div className="gl-list">
        <label className="search">
          <Search size={14} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Find an idea (e.g. loop)', 'Найти идею (например, цикл)')} aria-label={tr('Find an idea', 'Найти идею')} />
        </label>
        <ul>
          {list.map((x) => (
            <li key={x.id}>
              <button className={x.id === active ? 'on' : ''} onClick={() => setActive(x.id)}>
                {x.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="gl-body">
        <LevelSwitch />
        {c ? (
          <article data-testid="glossary-article">
            <h2>{c.title}</h2>
            <p className="xp-summary">{c.levels[Math.min(level, 4) - 1]}</p>
            {level === 5 ? <p>{c.levels[4]}</p> : null}
            {c.example ? (
              <div className="xp-example">
                <div className="muted small">
                  {tr('Example', 'Пример')} ({getLanguage(c.example.lang).name}):
                </div>
                <pre>{c.example.code}</pre>
                <p>{c.example.explain}</p>
              </div>
            ) : null}
            {c.why ? (
              <>
                <h4>{tr('Why is it used?', 'Зачем это нужно?')}</h4>
                <p>{c.why}</p>
              </>
            ) : null}
            {c.change ? (
              <>
                <h4>{tr('What happens if it is changed?', 'Что будет, если это изменить?')}</h4>
                <p>{c.change}</p>
              </>
            ) : null}
            {c.simpler.length ? (
              <details className="xb">
                <summary>{tr('Other ways to say it', 'Другими словами')}</summary>
                <div className="xb-body">
                  {c.simpler.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </details>
            ) : null}
            <details className="xb">
              <summary>{tr('All five levels', 'Все пять уровней')}</summary>
              <div className="xb-body">
                {([1, 2, 3, 4, 5] as const).map((l, i) => (
                  <p key={l}>
                    <b>{levelLabel(l).name}:</b> {c.levels[i]}
                  </p>
                ))}
              </div>
            </details>
            {c.related?.length ? (
              <p className="gl-related">
                {tr('Related:', 'Связано:')}{' '}
                {c.related.map((r) => (
                  <button key={r} className="chip" onClick={() => setActive(r)}>
                    {getConcept(r).title}
                  </button>
                ))}
              </p>
            ) : null}
          </article>
        ) : (
          <p className="muted">
            {tr(
              `Pick an idea on the left. There are ${list.length} ideas, each explained at five levels. They are part of the app and work without internet.`,
              `Выбери идею слева. Всего идей: ${list.length}, каждая объяснена на пяти уровнях. Они встроены в программу и работают без интернета.`,
            )}
          </p>
        )}
      </div>
    </div>
  );
}

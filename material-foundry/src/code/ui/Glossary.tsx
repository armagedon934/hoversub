// Every idea the app can explain, searchable, at the chosen level — useful for learning on its own.

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CONCEPTS } from '../knowledge/concepts';
import { LEVELS } from '../explain/explain';
import { getLanguage } from '../languages/registry';
import { LevelSwitch } from './ExplainPanel';
import { useCode } from './store';

export function Glossary() {
  const level = useCode((s) => s.prefs.level);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CONCEPTS.filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.id.includes(needle) || c.levels[1].toLowerCase().includes(needle)).sort((a, b) => a.title.localeCompare(b.title));
  }, [q]);
  const c = CONCEPTS.find((x) => x.id === active) ?? null;
  return (
    <div className="gl" data-testid="glossary">
      <div className="gl-list">
        <label className="search">
          <Search size={14} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an idea (e.g. loop)" aria-label="Find an idea" />
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
          <article>
            <h2>{c.title}</h2>
            <p className="xp-summary">{c.levels[Math.min(level, 4) - 1]}</p>
            {level === 5 ? <p>{c.levels[4]}</p> : null}
            {c.example ? (
              <div className="xp-example">
                <div className="muted small">Example ({getLanguage(c.example.lang).name}):</div>
                <pre>{c.example.code}</pre>
                <p>{c.example.explain}</p>
              </div>
            ) : null}
            {c.why ? (
              <>
                <h4>Why is it used?</h4>
                <p>{c.why}</p>
              </>
            ) : null}
            {c.change ? (
              <>
                <h4>What happens if it is changed?</h4>
                <p>{c.change}</p>
              </>
            ) : null}
            {c.simpler.length ? (
              <details className="xb">
                <summary>Other ways to say it</summary>
                <div className="xb-body">
                  {c.simpler.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </details>
            ) : null}
            <details className="xb">
              <summary>All five levels</summary>
              <div className="xb-body">
                {LEVELS.map((l, i) => (
                  <p key={l.level}>
                    <b>{l.name}:</b> {c.levels[i]}
                  </p>
                ))}
              </div>
            </details>
            {c.related?.length ? (
              <p className="gl-related">
                Related:{' '}
                {c.related.map((r) => (
                  <button key={r} className="chip" onClick={() => setActive(r)}>
                    {CONCEPTS.find((x) => x.id === r)?.title ?? r}
                  </button>
                ))}
              </p>
            ) : null}
          </article>
        ) : (
          <p className="muted">
            Pick an idea on the left. There are {CONCEPTS.length} ideas, each explained at five levels. They are part of the app and work without internet.
          </p>
        )}
      </div>
    </div>
  );
}

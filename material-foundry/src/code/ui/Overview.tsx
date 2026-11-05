// Project explainer: what the project is, how it is organised, where it starts, which files
// matter, how the parts talk to each other, its settings and libraries — plus an interactive map.
// Every sentence carries a confidence level. Scripts found in manifests are listed, never run.

import { useMemo, useState } from 'react';
import { Boxes, FileCode2, Flag, HelpCircle, Library, Play, Settings2, Star } from 'lucide-react';
import { fileRole, type ProjectIndex } from '../analysis/project';
import { getLanguage } from '../languages/registry';
import { ConfidenceBadge } from './ExplainPanel';
import { useCode } from './store';
import { count, tr } from '../i18n';

const PALETTE = ['#e0a24a', '#6aa7e8', '#6cc28a', '#c58ae0', '#e8806a', '#58c3c0', '#d6c35a', '#9aa0aa', '#e57aa8', '#8fb45a'];

function componentOf(path: string): string {
  const parts = path.split('/');
  if (parts.length === 1) return tr('(project root)', '(корень проекта)');
  if ((parts[0] === 'src' || parts[0] === 'app' || parts[0] === 'lib') && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

interface MapNode {
  path: string;
  x: number;
  y: number;
  layer: number;
  comp: string;
}

/** Layered layout: files that use others on the left, the files they use to the right. */
function layout(index: ProjectIndex, limit: number, focus: Set<string> | null): { nodes: MapNode[]; edges: { from: string; to: string }[]; hidden: number; lonely: string[] } {
  const connected = new Set<string>();
  for (const e of index.edges) {
    if (focus && !focus.has(e.from) && !focus.has(e.to)) continue;
    connected.add(e.from);
    connected.add(e.to);
  }
  let paths = [...connected];
  const hidden = Math.max(0, paths.length - limit);
  if (hidden) {
    const degree = (p: string) => (index.imports.get(p)?.length ?? 0) + (index.importedBy.get(p)?.length ?? 0);
    paths = paths.sort((a, b) => degree(b) - degree(a)).slice(0, limit);
  }
  const keep = new Set(paths);
  const edges = index.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && e.from !== e.to).map((e) => ({ from: e.from, to: e.to }));
  const uniq = new Map(edges.map((e) => [`${e.from}>${e.to}`, e]));
  // Longest-path layering with cycle protection.
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (p: string): number => {
    if (layer.has(p)) return layer.get(p)!;
    if (visiting.has(p)) return 0;
    visiting.add(p);
    const parents = [...uniq.values()].filter((e) => e.to === p).map((e) => e.from);
    const d = parents.length ? Math.max(...parents.map((x) => depth(x) + 1)) : 0;
    visiting.delete(p);
    layer.set(p, Math.min(d, 8));
    return layer.get(p)!;
  };
  for (const p of paths) depth(p);
  const byLayer = new Map<number, string[]>();
  for (const p of paths) {
    const l = layer.get(p) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), p]);
  }
  const nodes: MapNode[] = [];
  for (const [l, list] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => componentOf(a).localeCompare(componentOf(b)) || a.localeCompare(b));
    list.forEach((p, i) => nodes.push({ path: p, layer: l, x: 20 + l * 230, y: 20 + i * 46, comp: componentOf(p) }));
  }
  const lonely = focus ? [] : index.files.filter((f) => !connected.has(f.path) && !f.skipped).map((f) => f.path);
  return { nodes, edges: [...uniq.values()], hidden, lonely };
}

export function ProjectMap({ compact = false }: { compact?: boolean }) {
  const index = useCode((s) => s.index);
  const overview = useCode((s) => s.overview);
  const openFile = useCode((s) => s.openFile);
  const openPath = useCode((s) => s.openPath);
  const [focusOpen, setFocusOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const focus = useMemo(() => (focusOpen && openPath ? new Set([openPath]) : null), [focusOpen, openPath]);
  const data = useMemo(() => (index ? layout(index, compact ? 40 : 160, focus) : null), [index, compact, focus]);
  if (!index || !data) return null;
  const comps = [...new Set(data.nodes.map((n) => n.comp))];
  const color = (c: string) => PALETTE[comps.indexOf(c) % PALETTE.length];
  const entries = new Set(overview?.entryPoints.map((e) => e.path));
  const pos = new Map(data.nodes.map((n) => [n.path, n]));
  const W = Math.max(400, ...data.nodes.map((n) => n.x + 210));
  const H = Math.max(80, ...data.nodes.map((n) => n.y + 40));
  const related = (p: string) => !hover || p === hover || data.edges.some((e) => (e.from === hover && e.to === p) || (e.to === hover && e.from === p));

  return (
    <div className="pmap" data-testid="project-map">
      <div className="pmap-bar">
        <span className="muted small">{tr('Arrows point from a file to the files it uses. Click a file to open it. Hover to see its connections.', 'Стрелки идут от файла к файлам, которыми он пользуется. Нажми на файл, чтобы открыть его. Наведи мышь, чтобы увидеть его связи.')}</span>
        {!compact && openPath ? (
          <label className="small">
            <input type="checkbox" checked={focusOpen} onChange={(e) => setFocusOpen(e.target.checked)} /> {tr('Only connections of', 'Только связи файла')} {openPath.split('/').pop()}
          </label>
        ) : null}
      </div>
      {data.nodes.length ? (
        <div className="pmap-scroll" style={compact ? { maxHeight: 360 } : undefined}>
          <svg width={W} height={H} role="img" aria-label={tr('Map of files and how they depend on each other', 'Карта файлов и их связей')}>
            <defs>
              <marker id="pm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--cm-muted)" />
              </marker>
            </defs>
            {data.edges.map((e) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              const x1 = a.x + 190;
              const y1 = a.y + 16;
              const x2 = b.x;
              const y2 = b.y + 16;
              const back = x2 <= x1;
              const d = back ? `M${a.x + 95},${a.y + 32} C${a.x + 95},${a.y + 70} ${b.x + 95},${b.y + 70} ${b.x + 95},${b.y + 32}` : `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`;
              const on = !hover || e.from === hover || e.to === hover;
              return <path key={`${e.from}>${e.to}`} d={d} fill="none" stroke={on ? 'var(--cm-edge)' : 'var(--cm-line)'} strokeWidth={on && hover ? 2 : 1.2} markerEnd="url(#pm-arrow)" opacity={on ? 1 : 0.35} />;
            })}
            {data.nodes.map((n) => (
              <g
                key={n.path}
                transform={`translate(${n.x},${n.y})`}
                className="pm-node"
                onClick={() => void openFile(n.path)}
                onMouseEnter={() => setHover(n.path)}
                onMouseLeave={() => setHover(null)}
                opacity={related(n.path) ? 1 : 0.35}
                role="button"
                tabIndex={0}
                aria-label={`${n.path}${entries.has(n.path) ? ', starting point' : ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void openFile(n.path);
                }}
              >
                <rect width={190} height={32} rx={6} fill="var(--cm-panel-2)" stroke={n.path === openPath ? 'var(--cm-accent)' : color(n.comp)} strokeWidth={n.path === openPath ? 2.5 : 1.5} />
                <rect width={5} height={32} rx={2} fill={color(n.comp)} />
                <text x={12} y={14} fontSize={12} fill="var(--cm-text)" fontWeight={600}>
                  {entries.has(n.path) ? '▶ ' : ''}
                  {(n.path.split('/').pop() ?? '').slice(0, 24)}
                </text>
                <text x={12} y={27} fontSize={10} fill="var(--cm-muted)">
                  {n.comp.slice(0, 30)}
                </text>
                <title>{n.path}</title>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <p className="muted">{tr('No connections between files were found. Files may still work together in ways the analysis cannot see (for example, loaded by name while running).', 'Связей между файлами не найдено. Файлы всё равно могут работать вместе так, что анализ этого не видит (например, загружаются по имени во время работы).')}</p>
      )}
      <div className="pmap-legend">
        {comps.map((c) => (
          <span key={c}>
            <span className="sw" style={{ background: color(c) }} /> {c}
          </span>
        ))}
        {data.hidden ? <span className="muted">({tr('less-connected files hidden', 'скрыто менее связанных файлов')}: {data.hidden})</span> : null}
      </div>
      {!compact && data.lonely.length ? (
        <details className="xb">
          <summary>{tr('Files without detected connections', 'Файлы без найденных связей')} ({data.lonely.length})</summary>
          <div className="xb-body pmap-lonely">
            {data.lonely.slice(0, 300).map((p) => (
              <button key={p} className="linklike" onClick={() => void openFile(p)}>
                {p}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function Overview() {
  const ov = useCode((s) => s.overview);
  const index = useCode((s) => s.index);
  const summaries = useCode((s) => s.summaries);
  const openFile = useCode((s) => s.openFile);
  const notes = useCode((s) => s.notes);
  if (!ov || !index) return <div className="ov muted">{tr('Reading the project…', 'Читаю проект…')}</div>;
  const entries = new Set(ov.entryPoints.map((e) => e.path));
  return (
    <div className="ov" data-testid="overview">
      <header className="ov-head">
        <h2>{ov.name}</h2>
        <p className="ov-kind">
          {ov.kind.text} <ConfidenceBadge c={ov.kind.confidence} compact />
        </p>
      </header>
      {notes.length ? (
        <ul className="ov-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
      <section className="ov-card ov-summary" data-testid="overview-summary">
        <h3>
          <HelpCircle size={16} aria-hidden /> {tr('In everyday words', 'Простыми словами')}
        </h3>
        {ov.summary.map((f, i) => (
          <p key={i}>
            {f.text} <ConfidenceBadge c={f.confidence} compact />
          </p>
        ))}
        {ov.readmeIntro ? (
          <blockquote>
            <div className="muted small">{tr('The authors describe it like this (from the read-me):', 'Авторы описывают его так (из файла README):')}</div>
            {ov.readmeIntro}
          </blockquote>
        ) : null}
      </section>
      <div className="ov-grid">
        <section className="ov-card">
          <h3>
            <Flag size={16} aria-hidden /> {tr('Where it starts', 'С чего начинается')}
          </h3>
          {ov.entryPoints.length ? (
            <ul>
              {ov.entryPoints.map((e) => (
                <li key={e.path}>
                  <button className="linklike" onClick={() => void openFile(e.path)}>
                    {e.path}
                  </button>{' '}
                  — {e.reason} <ConfidenceBadge c={e.confidence} compact />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr('No clear starting point was found. The program may be started by a tool, a web server or a setting outside these files.', 'Явной точки старта не найдено. Программу может запускать инструмент, веб-сервер или настройка вне этих файлов.')}</p>
          )}
        </section>
        <section className="ov-card">
          <h3>
            <Star size={16} aria-hidden /> {tr('The most important files', 'Самые важные файлы')}
          </h3>
          <ul>
            {ov.importantFiles.slice(0, 10).map((f) => (
              <li key={f.path}>
                <button className="linklike" onClick={() => void openFile(f.path)}>
                  {f.path}
                </button>{' '}
                — {f.reason}
              </li>
            ))}
          </ul>
        </section>
        <section className="ov-card wide">
          <h3>
            <Boxes size={16} aria-hidden /> {tr('The main parts and what they do', 'Главные части и что они делают')}
          </h3>
          <div className="ov-comps">
            {ov.components.map((c) => (
              <div key={c.folder} className="ov-comp">
                <div className="ov-comp-head">
                  <b>{c.folder}</b> <span className="muted small">{c.role}</span> <ConfidenceBadge c={c.confidence} compact />
                </div>
                <p>{c.explanation}</p>
                <div className="ov-comp-files">
                  {c.files.slice(0, 8).map((p) => {
                    const r = fileRole(p, summaries[p], index, entries);
                    return (
                      <button key={p} className="chip" onClick={() => void openFile(p)} title={`${r.role}: ${r.explanation}`}>
                        <FileCode2 size={11} aria-hidden /> {p.split('/').pop()}
                      </button>
                    );
                  })}
                  {c.files.length > 8 ? <span className="muted small">+{c.files.length - 8} {tr('more', 'ещё')}</span> : null}
                </div>
              </div>
            ))}
          </div>
          {ov.componentLinks.length ? (
            <>
              <h4>{tr('How the parts talk to each other', 'Как части связаны друг с другом')}</h4>
              <ul>
                {ov.componentLinks.slice(0, 15).map((l) => (
                  <li key={`${l.from}>${l.to}`}>
                    <b>{l.from}</b> {tr('uses', 'использует')} <b>{l.to}</b> ({count(l.count, ['connection', 'connections'], ['связь', 'связи', 'связей'])}) <ConfidenceBadge c="verified" compact />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className="ov-card">
          <h3>
            <Settings2 size={16} aria-hidden /> Settings
          </h3>
          {ov.settingsFiles.length ? (
            <ul>
              {ov.settingsFiles.slice(0, 15).map((p) => (
                <li key={p}>
                  <button className="linklike" onClick={() => void openFile(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr('No settings files found.', 'Файлов настроек не найдено.')}</p>
          )}
        </section>
        <section className="ov-card">
          <h3>
            <Library size={16} aria-hidden /> {tr('Outside libraries it needs', 'Внешние библиотеки, которые ему нужны')}
          </h3>
          {ov.externalLibraries.length ? (
            <ul className="ov-libs">
              {ov.externalLibraries.slice(0, 20).map((l) => (
                <li key={l.name}>
                  <code>{l.name}</code> <span className="muted small">{tr('used by', 'используют')} {count(l.usedBy, ['file', 'files'], ['файл', 'файла', 'файлов'])}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr('None found — it seems to use only what the language provides.', 'Не найдено — похоже, используется только то, что есть в самом языке.')}</p>
          )}
        </section>
        {ov.scripts.length ? (
          <section className="ov-card">
            <h3>
              <Play size={16} aria-hidden /> {tr('Commands the authors defined', 'Команды, которые задали авторы')}
            </h3>
            <p className="muted small">{tr('Listed for information only. This app never runs them.', 'Показаны только для сведения. Эта программа их никогда не запускает.')}</p>
            <ul>
              {ov.scripts.slice(0, 12).map((s) => (
                <li key={s.name}>
                  <b>{s.name}</b>: <code>{s.command}</code>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="ov-card">
          <h3>{tr('Languages', 'Языки')}</h3>
          <ul>
            {ov.languages.map((l) => (
              <li key={l.id}>
                {l.name}: {count(l.files, ['file', 'files'], ['файл', 'файла', 'файлов'])}, {count(l.lines, ['line', 'lines'], ['строка', 'строки', 'строк'])}{' '}
                <span className="muted small">({getLanguage(l.id).mode === 'syntax-tree' ? tr('full structure', 'полная структура') : getLanguage(l.id).mode === 'tokens' ? tr('word level', 'по словам') : tr('plain text', 'простой текст')})</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {tr(`${ov.stats.files} files, ${ov.stats.analysed} analysed, ${ov.stats.skipped} could not be read as text.`, `Файлов: ${ov.stats.files}, разобрано: ${ov.stats.analysed}, не читаются как текст: ${ov.stats.skipped}.`)}
          </p>
        </section>
        <section className="ov-card wide">
          <h3>{tr('What cannot be known from the files alone', 'Что нельзя узнать только по файлам')}</h3>
          <ul>
            {ov.unknowns.map((u, i) => (
              <li key={i}>
                <ConfidenceBadge c="unknown" compact /> {u}
              </li>
            ))}
          </ul>
        </section>
        <section className="ov-card wide">
          <h3>{tr('Project map', 'Карта проекта')}</h3>
          <ProjectMap compact />
        </section>
      </div>
    </div>
  );
}

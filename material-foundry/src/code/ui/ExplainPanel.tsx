// The explanation panel: a short answer first, optional details below, five levels that switch
// instantly, and the always-visible "I don't understand" and "Show me with an example" buttons.

import { useMemo, useState } from 'react';
import { BookOpen, Crosshair, HelpCircle, Lightbulb, ListTree, MapPin, Wand2 } from 'lucide-react';
import { CONFIDENCE_LABEL, LEVELS, explain, type Block } from '../explain/explain';
import type { Confidence, Fact } from '../analysis/types';
import { getLanguage } from '../languages/registry';
import { Diagrams } from './Diagrams';
import { rangeLabel, useCode } from './store';

export function ConfidenceBadge({ c, compact }: { c: Confidence; compact?: boolean }) {
  const l = CONFIDENCE_LABEL[c];
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
          Show the answer
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

export function LevelSwitch() {
  const level = useCode((s) => s.prefs.level);
  const setLevel = useCode((s) => s.setLevel);
  return (
    <div className="levels" role="radiogroup" aria-label="How detailed should explanations be?">
      {LEVELS.map((l) => (
        <button
          key={l.level}
          role="radio"
          aria-checked={level === l.level}
          className={level === l.level ? 'on' : ''}
          onClick={() => setLevel(l.level)}
          title={`${l.name} (key ${l.level})`}
          data-testid={`level-${l.level}`}
        >
          <span className="lv-n">{l.level}</span>
          {l.short}
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
      ? 'from the file name ending'
      : open.detectedBy === 'filename'
        ? 'from the file name'
        : open.detectedBy === 'shebang'
          ? 'from the first line (#!)'
          : open.detectedBy === 'content'
            ? 'by looking at the content'
            : 'it could not be recognised';
  return (
    <div className="xp-file" data-testid="file-help">
      <h3>{path.split('/').pop()}</h3>
      <p className="xp-summary">
        This file is written in <b>{lang.name}</b>. {lang.about}
      </p>
      {simplerStep > 0 ? <p className="xp-simpler">Think of a file like a page in a recipe book: it holds instructions. Click any word and I will explain just that word.</p> : null}
      <ul className="xp-meta">
        <li>
          Language found {how}
          {open.detectionConfidence !== 'verified' ? <ConfidenceBadge c={open.detectionConfidence} compact /> : null}
        </li>
        <li>
          {s.lineCount} lines ·{' '}
          {s.mode === 'syntax-tree' ? 'full understanding of the structure' : s.mode === 'tokens' ? 'word-level understanding (no full structure)' : 'shown as plain text only'}
        </li>
        {open.fallback ? <li className="warn-text">{open.fallback}</li> : null}
        {s.limited ? <li className="warn-text">{s.limited}</li> : null}
        {s.issues.length ? (
          <li className="warn-text">
            {s.issues.length} possible mistake{s.issues.length === 1 ? '' : 's'} in the writing (marked with a warning sign next to the line number).
          </li>
        ) : null}
      </ul>
      {showExample ? <p className="xp-simpler">Examples belong to a single word or symbol. Click something in the code first, and the example for it will appear.</p> : null}
      <div className="xp-tip">
        <Crosshair size={14} aria-hidden /> Click any word, symbol or bracket in the code to get an explanation. Use the arrow keys to move from word to word.
      </div>
      {fns.length ? (
        <>
          <h4>
            <ListTree size={14} aria-hidden /> Main parts of this file
          </h4>
          <ul className="xp-outline">
            {fns.map((f) => (
              <li key={`${f.name}${f.range.start}`}>
                <button className="linklike" onClick={() => void select(f.range.start)}>
                  {f.kind === 'class' ? 'Group (class)' : f.kind === 'method' ? 'Action of a group' : 'Function'}: <b>{f.name}</b>
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
          <h4>It uses</h4>
          <ul className="xp-outline">
            {imports.slice(0, 20).map((i, k) => (
              <li key={k}>
                <code>{i.spec}</code>{' '}
                <span className="muted">
                  {i.resolved ? `→ ${i.resolved}` : i.external ? '(from outside the project, for example a library)' : '(not found among the opened files)'}
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
    <aside className="xp" aria-label="Explanation" data-testid="explain-panel">
      <LevelSwitch />
      <div className="xp-scroll">
        {!openPath ? (
          <div className="xp-file">
            <h3>Explanations appear here</h3>
            <p>Open a file on the left, then click any word in it.</p>
          </div>
        ) : !open ? (
          <div className="xp-file">
            <p>This file cannot be shown as text, so there is nothing to explain inside it.</p>
          </div>
        ) : !x || !el ? (
          <FileHelp />
        ) : (
          <div className="xp-main" data-testid="explanation">
            <div className="xp-where">
              <MapPin size={12} aria-hidden /> {rangeLabel(el.range)}
              {el.enclosingFunction ? ` · inside ${el.enclosingFunction}` : ''}
              {el.enclosingClass && el.enclosingClass !== el.enclosingFunction ? ` · in ${el.enclosingClass}` : ''}
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
                <div className="muted small">Example ({getLanguage(x.example.lang).name}) — not from your project:</div>
                <pre>{x.example.code}</pre>
              </div>
            ) : null}
            {x.blocks.map((b) => (
              <BlockView key={`${b.id}-${level}-${simplerStep}`} b={b} />
            ))}
            {el.context.length ? (
              <details className="xb">
                <summary>Where exactly am I?</summary>
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
              <button className="btn small" onClick={() => void goToDefinition()} disabled={!canGo} title="Jump to where this is created (key g)" data-testid="go-definition">
                <Crosshair size={14} /> Where is it made?
              </button>
              <button className="btn small" onClick={showUses} disabled={!canUses} title="Highlight every place it is used in this file (key u)" data-testid="show-uses">
                <ListTree size={14} /> Show every use
              </button>
              <button className="btn small accent" onClick={() => setWhatIf(true)} title="See what would happen if you changed this (key w)" data-testid="what-if">
                <Wand2 size={14} /> What if I change this?
              </button>
            </div>
            <Diagrams />
          </div>
        )}
        {!sel && open ? <Diagrams /> : null}
      </div>
      <div className="xp-help" role="group" aria-label="Help">
        <button className="btn help-btn" onClick={simpler} title="Explain it in a different, simpler way (key ?)" data-testid="dont-understand">
          <Lightbulb size={16} /> I don’t understand
        </button>
        <button className={`btn help-btn${showExample ? ' on' : ''}`} onClick={toggleExample} aria-pressed={showExample} title="Show a small example (key e)" data-testid="show-example">
          <BookOpen size={16} /> Show me with an example
        </button>
      </div>
    </aside>
  );
}

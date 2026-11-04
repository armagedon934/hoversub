// "What if I change this?" — a guided, four-step flow:
//  1. what it does now   2. what you want (in simple words)   3. preview: the smallest change,
//  explained, with affected places, risks and a syntax check   4. apply only after "Yes, apply".
// Applying changes the in-app copy only (with a restore point first). Files on disk are untouched.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ShieldCheck, Wand2, X } from 'lucide-react';
import { OPERATORS } from '../knowledge/keywords';
import { compactRows, sideBySide } from '../workspace/diff';
import { describeCurrent, goalsFor, propose, type Goal, type Proposal } from '../workspace/proposals';
import type { SyntaxIssue } from '../analysis/types';
import { getCodeClient } from '../worker/client';
import { ConfidenceBadge } from './ExplainPanel';
import { useCode, workspace } from './store';

interface Check {
  path: string;
  checked: boolean;
  before: number;
  newIssues: SyntaxIssue[];
}

export function DiffView({ before, after, context = 2, testId }: { before: string; after: string; context?: number; testId?: string }) {
  const rows = useMemo(() => compactRows(sideBySide(before, after), context), [before, after, context]);
  return (
    <div className="diff" role="table" aria-label="Before and after" data-testid={testId}>
      <div className="diff-head" role="row">
        <span role="columnheader">Before</span>
        <span role="columnheader">After</span>
      </div>
      {rows.map((r, i) =>
        r.type === 'gap' ? (
          <div key={i} className="diff-gap" role="row">
            … {r.hidden} unchanged line{r.hidden === 1 ? '' : 's'} …
          </div>
        ) : (
          <div key={i} className={`diff-row ${r.type}`} role="row">
            <span className="diff-cell left" role="cell">
              <span className="diff-ln">{r.left ? r.left.line + 1 : ''}</span>
              <span className="diff-tx">{r.left?.text ?? ''}</span>
            </span>
            <span className="diff-cell right" role="cell">
              <span className="diff-ln">{r.right ? r.right.line + 1 : ''}</span>
              <span className="diff-tx">{r.right?.text ?? ''}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

export function WhatIfDialog() {
  const openFlag = useCode((s) => s.whatIfOpen);
  const sel = useCode((s) => s.selection);
  const path = useCode((s) => s.openPath);
  const index = useCode((s) => s.index);
  const setWhatIf = useCode((s) => s.setWhatIf);
  const refreshAfterChange = useCode((s) => s.refreshAfterChange);
  const toast = useCode((s) => s.toast);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [value, setValue] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [understood, setUnderstood] = useState(false);

  const el = sel?.element;
  const goals = useMemo(() => (el ? goalsFor(el) : []), [el]);

  useEffect(() => {
    setGoal(null);
    setProposal(null);
    setChecks(null);
    setValue('');
    setUnderstood(false);
  }, [openFlag, el]);

  useEffect(() => {
    if (!openFlag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWhatIf(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFlag, setWhatIf]);

  if (!openFlag) return null;

  const close = () => setWhatIf(false);

  if (!el || !path) {
    return (
      <div className="modal-back" onClick={close}>
        <div className="modal wi" role="dialog" aria-modal="true" aria-label="What if I change this?" onClick={(e) => e.stopPropagation()}>
          <p>Click something in the code first, then press “What if I change this?”.</p>
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const chooseGoal = (g: Goal) => {
    setGoal(g);
    setProposal(null);
    setChecks(null);
    setUnderstood(false);
    if (g === 'change-value') setValue(el.kind === 'string' ? el.text.replace(/^[a-zA-Z]*("""|'''|["'`])([\s\S]*)\1$/, '$2') : el.text);
    else if (g === 'rename') setValue(el.symbolName ?? el.text);
    else if (g === 'change-operator') setValue(OPERATORS[el.operator?.symbol ?? '']?.alternatives[0] ?? '');
    else if (g === 'edit-line') {
      const t = workspace.text(path) ?? '';
      const r = el.statementRange ?? el.range;
      setValue(t.split('\n')[r.line] ?? '');
    } else setValue('');
  };

  const makeProposal = async () => {
    if (!goal) return;
    const files = new Map<string, string>();
    for (const f of workspace.files.values()) if (!f.skipped) files.set(f.path, f.current);
    const p = propose({ goal, element: el, path, files, index, newValue: value, newName: value, newOperator: value, newLine: value });
    setProposal(p);
    setChecks(null);
    setUnderstood(false);
    if (!p.ok) return;
    const client = getCodeClient();
    const res: Check[] = [];
    for (const e of p.edits) {
      try {
        const [b, a] = await Promise.all([client.check(e.path, e.before), client.check(e.path, e.after)]);
        const known = new Set(b.issues.map((i) => i.message));
        res.push({ path: e.path, checked: a.checked, before: b.issues.length, newIssues: a.issues.length > b.issues.length ? a.issues.filter((i) => !known.has(i.message)).slice(0, 5) : [] });
        if (a.issues.length > b.issues.length && !res[res.length - 1].newIssues.length) res[res.length - 1].newIssues = a.issues.slice(0, 3);
      } catch {
        res.push({ path: e.path, checked: false, before: 0, newIssues: [] });
      }
    }
    setChecks(res);
  };

  const apply = async () => {
    if (!proposal?.ok) return;
    setApplying(true);
    try {
      await workspace.apply(proposal.label, proposal.edits.map((e) => ({ path: e.path, after: e.after })));
      await refreshAfterChange(proposal.edits.map((e) => e.path));
      toast('success', 'Change applied to the workspace copy. A restore point was saved first — press Undo (Ctrl+Z) or open “Changes” to go back. Your original files are not touched.');
      setWhatIf(false);
    } catch (e) {
      toast('error', `The change was not applied: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  const newProblems = checks?.some((c) => c.newIssues.length) ?? false;
  const unchecked = checks?.some((c) => !c.checked) ?? false;
  const needsInput = goal === 'change-value' || goal === 'rename' || goal === 'change-operator' || goal === 'edit-line';
  const opAlternatives = OPERATORS[el.operator?.symbol ?? '']?.alternatives ?? [];

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal wi" role="dialog" aria-modal="true" aria-labelledby="wi-title" onClick={(e) => e.stopPropagation()} data-testid="whatif-dialog">
        <header className="wi-head">
          <h2 id="wi-title">
            <Wand2 size={18} aria-hidden /> What if I change this?
          </h2>
          <button className="icon-btn" onClick={close} aria-label="Close without changing anything">
            <X size={18} />
          </button>
        </header>
        <div className="wi-body">
          <section className="wi-step">
            <h3>
              <span className="step-n">1</span> What it does now
            </h3>
            <p data-testid="whatif-current">{describeCurrent(el)}</p>
            <p className="muted small">
              Selected: <code>{el.text.length > 60 ? `${el.text.slice(0, 59)}…` : el.text}</code> on line {el.range.line + 1} of {path}
            </p>
          </section>

          <section className="wi-step">
            <h3>
              <span className="step-n">2</span> What would you like to do?
            </h3>
            <div className="wi-goals" role="radiogroup">
              {goals.map((g) => (
                <button key={g.goal} role="radio" aria-checked={goal === g.goal} className={`wi-goal${goal === g.goal ? ' on' : ''}`} onClick={() => chooseGoal(g.goal)} data-testid={`goal-${g.goal}`}>
                  <b>{g.label}</b>
                  <span>{g.description}</span>
                </button>
              ))}
            </div>
            {goal && needsInput ? (
              <div className="wi-input">
                {goal === 'change-operator' ? (
                  <label>
                    New symbol:{' '}
                    <select value={value} onChange={(e) => setValue(e.target.value)} data-testid="whatif-input">
                      {opAlternatives.map((a) => (
                        <option key={a} value={a}>
                          {a} — {OPERATORS[a]?.name ?? ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    {goal === 'rename' ? 'New name:' : goal === 'edit-line' ? 'New version of the line:' : el.kind === 'string' ? 'New text:' : 'New value:'}
                    <input
                      autoFocus
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void makeProposal();
                      }}
                      spellCheck={false}
                      className={goal === 'edit-line' ? 'mono wide' : 'mono'}
                      data-testid="whatif-input"
                    />
                  </label>
                )}
              </div>
            ) : null}
            {goal ? (
              <button className="btn primary" onClick={() => void makeProposal()} data-testid="whatif-preview">
                Show me the change (nothing is changed yet)
              </button>
            ) : null}
          </section>

          {proposal ? (
            <section className="wi-step" data-testid="whatif-proposal">
              <h3>
                <span className="step-n">3</span> Preview
              </h3>
              {!proposal.ok ? (
                <p className="warn-text" data-testid="whatif-problem">
                  <AlertTriangle size={14} aria-hidden /> {proposal.problem}
                </p>
              ) : (
                <>
                  <ul className="wi-expl">
                    {proposal.explanations.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  {proposal.edits.map((e) => (
                    <div key={e.path} className="wi-file">
                      <div className="wi-file-name">{e.path}</div>
                      <DiffView before={e.before} after={e.after} testId="whatif-diff" />
                    </div>
                  ))}
                  <h4>Grammar check of the result</h4>
                  {!checks ? (
                    <p className="muted">Checking…</p>
                  ) : (
                    <ul className="wi-checks" data-testid="whatif-checks">
                      {checks.map((c) => (
                        <li key={c.path} className={c.newIssues.length ? 'bad' : c.checked ? 'ok' : 'unknown'}>
                          {c.newIssues.length ? (
                            <>
                              <AlertTriangle size={14} aria-hidden /> {c.path}: this change creates {c.newIssues.length === 1 ? 'a new problem' : 'new problems'} —{' '}
                              {c.newIssues.map((i) => `line ${i.range.line + 1}: ${i.message}`).join('; ')}
                            </>
                          ) : c.checked ? (
                            <>
                              <Check size={14} aria-hidden /> {c.path}: no new grammar problems were found. This does not prove the program still behaves correctly.
                            </>
                          ) : (
                            <>{c.path}: the grammar of this file type cannot be checked here.</>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {proposal.affected.length ? (
                    <>
                      <h4>What it touches</h4>
                      <ul className="wi-affected">
                        {proposal.affected.slice(0, 30).map((a, i) => (
                          <li key={i}>
                            <ConfidenceBadge c={a.confidence} compact /> {a.path}, line {a.line + 1}: {a.what}
                          </li>
                        ))}
                        {proposal.affected.length > 30 ? <li className="muted">…and {proposal.affected.length - 30} more</li> : null}
                      </ul>
                    </>
                  ) : null}
                  <h4>Risks — what could go wrong</h4>
                  <ul className="wi-risks" data-testid="whatif-risks">
                    {proposal.risks.map((r, i) => (
                      <li key={i}>
                        <ConfidenceBadge c={r.confidence} compact /> {r.text}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}

          {proposal?.ok && checks ? (
            <section className="wi-step wi-confirm">
              <h3>
                <span className="step-n">4</span> Decide
              </h3>
              <p>
                <ShieldCheck size={15} aria-hidden /> Applying changes only the copy inside this app. A restore point is saved first, and you can undo at any time. Your files on disk stay exactly as they are until you
                choose “Save” or “Download” in Changes.
              </p>
              {newProblems ? (
                <p className="warn-text">
                  <AlertTriangle size={14} aria-hidden /> Warning: the preview found new problems. Applying it will probably break this file.
                </p>
              ) : null}
              {unchecked ? <p className="muted">Part of this change could not be checked automatically.</p> : null}
              <label className="wi-ack">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="whatif-ack" /> I have looked at the preview and the risks.
              </label>
              <div className="wi-buttons">
                <button className="btn" onClick={() => setProposal(null)}>
                  <ArrowLeft size={14} /> No, go back
                </button>
                <button className={`btn ${newProblems ? 'danger' : 'primary'}`} onClick={() => void apply()} disabled={!understood || applying} data-testid="whatif-apply">
                  <Check size={14} /> {newProblems ? 'Apply anyway' : 'Yes, apply this change'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

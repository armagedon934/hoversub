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
import { tr } from '../i18n';

interface Check {
  path: string;
  checked: boolean;
  before: number;
  newIssues: SyntaxIssue[];
}

export function DiffView({ before, after, context = 2, testId }: { before: string; after: string; context?: number; testId?: string }) {
  const rows = useMemo(() => compactRows(sideBySide(before, after), context), [before, after, context]);
  return (
    <div className="diff" role="table" aria-label={tr('Before and after', 'До и после')} data-testid={testId}>
      <div className="diff-head" role="row">
        <span role="columnheader">{tr('Before', 'Было')}</span>
        <span role="columnheader">{tr('After', 'Станет')}</span>
      </div>
      {rows.map((r, i) =>
        r.type === 'gap' ? (
          <div key={i} className="diff-gap" role="row">
            … {tr(`${r.hidden} unchanged line${r.hidden === 1 ? '' : 's'}`, `без изменений строк: ${r.hidden}`)} …
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
        <div className="modal wi" role="dialog" aria-modal="true" aria-label={tr('What if I change this?', 'А что если изменить?')} onClick={(e) => e.stopPropagation()}>
          <p>{tr('Click something in the code first, then press “What if I change this?”.', 'Сначала нажми на что-нибудь в коде, потом на «А что если изменить?».')}</p>
          <button className="btn" onClick={close}>
            {tr('Close', 'Закрыть')}
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
      toast('success', tr('Change applied to the workspace copy. A restore point was saved first — press Undo (Ctrl+Z) or open “Changes” to go back. Your original files are not touched.', 'Изменение внесено в рабочую копию. Перед этим сохранена точка восстановления — нажми Ctrl+Z или открой «Изменения», чтобы вернуть как было. Твои настоящие файлы не тронуты.'));
      setWhatIf(false);
    } catch (e) {
      toast('error', tr('The change was not applied: ', 'Изменение не внесено: ') + (e instanceof Error ? e.message : String(e)));
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
            <Wand2 size={18} aria-hidden /> {tr('What if I change this?', 'А что если изменить?')}
          </h2>
          <button className="icon-btn" onClick={close} aria-label={tr('Close without changing anything', 'Закрыть, ничего не меняя')}>
            <X size={18} />
          </button>
        </header>
        <div className="wi-body">
          <section className="wi-step">
            <h3>
              <span className="step-n">1</span> {tr('What it does now', 'Что это делает сейчас')}
            </h3>
            <p data-testid="whatif-current">{describeCurrent(el)}</p>
            <p className="muted small">
              {tr('Selected', 'Выбрано')}: <code>{el.text.length > 60 ? `${el.text.slice(0, 59)}…` : el.text}</code> — {tr('line', 'строка')} {el.range.line + 1}, {path}
            </p>
          </section>

          <section className="wi-step">
            <h3>
              <span className="step-n">2</span> {tr('What would you like to do?', 'Что ты хочешь сделать?')}
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
                    {tr('New symbol:', 'Новый значок:')}{' '}
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
                    {goal === 'rename' ? tr('New name:', 'Новое имя:') : goal === 'edit-line' ? tr('New version of the line:', 'Новая версия строки:') : el.kind === 'string' ? tr('New text:', 'Новый текст:') : tr('New value:', 'Новое значение:')}
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
                {tr('Show me the change (nothing is changed yet)', 'Покажи изменение (пока ничего не меняется)')}
              </button>
            ) : null}
          </section>

          {proposal ? (
            <section className="wi-step" data-testid="whatif-proposal">
              <h3>
                <span className="step-n">3</span> {tr('Preview', 'Предпросмотр')}
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
                  <h4>{tr('Grammar check of the result', 'Проверка записи результата')}</h4>
                  {!checks ? (
                    <p className="muted">{tr('Checking…', 'Проверяю…')}</p>
                  ) : (
                    <ul className="wi-checks" data-testid="whatif-checks">
                      {checks.map((c) => (
                        <li key={c.path} className={c.newIssues.length ? 'bad' : c.checked ? 'ok' : 'unknown'}>
                          {c.newIssues.length ? (
                            <>
                              <AlertTriangle size={14} aria-hidden /> {c.path}: {c.newIssues.length === 1 ? tr('this change creates a new problem', 'это изменение создаёт новую проблему') : tr('this change creates new problems', 'это изменение создаёт новые проблемы')} —{' '}
                              {c.newIssues.map((i) => `${tr('line', 'строка')} ${i.range.line + 1}: ${i.message}`).join('; ')}
                            </>
                          ) : c.checked ? (
                            <>
                              <Check size={14} aria-hidden /> {c.path}: {tr('no new grammar problems were found. This does not prove the program still behaves correctly.', 'новых ошибок записи не найдено. Это не доказывает, что программа по-прежнему работает правильно.')}
                            </>
                          ) : (
                            <>{c.path}: {tr('the grammar of this file type cannot be checked here.', 'запись этого типа файлов здесь проверить нельзя.')}</>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {proposal.affected.length ? (
                    <>
                      <h4>{tr('What it touches', 'Что это затронет')}</h4>
                      <ul className="wi-affected">
                        {proposal.affected.slice(0, 30).map((a, i) => (
                          <li key={i}>
                            <ConfidenceBadge c={a.confidence} compact /> {a.path}, {tr('line', 'строка')} {a.line + 1}: {a.what}
                          </li>
                        ))}
                        {proposal.affected.length > 30 ? <li className="muted">…{tr('and', 'и ещё')} {proposal.affected.length - 30}</li> : null}
                      </ul>
                    </>
                  ) : null}
                  <h4>{tr('Risks — what could go wrong', 'Риски — что может пойти не так')}</h4>
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
                <span className="step-n">4</span> {tr('Decide', 'Реши')}
              </h3>
              <p>
                <ShieldCheck size={15} aria-hidden />{' '}
                {tr('Applying changes only the copy inside this app. A restore point is saved first, and you can undo at any time. Your files on disk stay exactly as they are until you choose “Save” or “Download” in Changes.', 'Изменение вносится только в копию внутри программы. Сначала сохраняется точка восстановления, отменить можно в любой момент. Файлы на диске остаются как есть, пока ты сам не выберешь «Сохранить» или «Скачать» во вкладке «Изменения».')}
              </p>
              {newProblems ? (
                <p className="warn-text">
                  <AlertTriangle size={14} aria-hidden /> {tr('Warning: the preview found new problems. Applying it will probably break this file.', 'Внимание: предпросмотр нашёл новые проблемы. Скорее всего, это изменение сломает файл.')}
                </p>
              ) : null}
              {unchecked ? <p className="muted">{tr('Part of this change could not be checked automatically.', 'Часть изменения нельзя проверить автоматически.')}</p> : null}
              <label className="wi-ack">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="whatif-ack" /> {tr('I have looked at the preview and the risks.', 'Я посмотрел предпросмотр и риски.')}
              </label>
              <div className="wi-buttons">
                <button className="btn" onClick={() => setProposal(null)}>
                  <ArrowLeft size={14} /> {tr('No, go back', 'Нет, назад')}
                </button>
                <button className={`btn ${newProblems ? 'danger' : 'primary'}`} onClick={() => void apply()} disabled={!understood || applying} data-testid="whatif-apply">
                  <Check size={14} /> {newProblems ? tr('Apply anyway', 'Всё равно применить') : tr('Yes, apply this change', 'Да, применить')}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

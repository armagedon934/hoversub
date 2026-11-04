// Pictures that explain code: a step-by-step flowchart, which functions use which, where a value
// comes from and goes to, and which files depend on which. Everything is drawn from the analysis;
// nothing is guessed. When a picture cannot be made, the panel says why.

import { useEffect, useMemo } from 'react';
import { ArrowDown, ArrowRight, FileCode2, Package } from 'lucide-react';
import type { FlowStep } from '../analysis/types';
import { getCodeClient } from '../worker/client';
import { useCode, type DiagramKind } from './store';

const KIND_LABEL: Record<FlowStep['kind'], string> = {
  action: 'Do',
  assign: 'Store',
  call: 'Use',
  if: 'Decide',
  loop: 'Repeat',
  return: 'Give back',
  try: 'Try',
  switch: 'Choose',
  other: 'Step',
};

function Flow({ steps, depth = 0, onLine }: { steps: FlowStep[]; depth?: number; onLine: (l: number) => void }) {
  if (!steps.length) return <div className="fl-empty">(nothing happens here)</div>;
  return (
    <div className="fl-col">
      {steps.map((s, i) => (
        <div key={`${s.line}-${i}`} className="fl-item">
          {i > 0 ? <ArrowDown size={14} className="fl-arrow" aria-hidden /> : null}
          <button className={`fl-box fl-${s.kind}`} onClick={() => onLine(s.line)} title={`Go to line ${s.line + 1}`}>
            <span className="fl-kind">{KIND_LABEL[s.kind]}</span>
            <span className="fl-text">{s.text}</span>
            <span className="fl-line">line {s.line + 1}</span>
          </button>
          {s.branches?.length && depth < 4 ? (
            <div className="fl-branches">
              {s.branches.map((b, k) => (
                <div key={k} className="fl-branch">
                  <div className="fl-branch-label">{b.label}</div>
                  <Flow steps={b.steps} depth={depth + 1} onLine={onLine} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Node({ label, sub, onClick, kind = 'fn' }: { label: string; sub?: string; onClick?: () => void; kind?: 'fn' | 'file' | 'ext' | 'main' | 'data' }) {
  const content = (
    <>
      {kind === 'file' || kind === 'main' ? <FileCode2 size={13} aria-hidden /> : kind === 'ext' ? <Package size={13} aria-hidden /> : null}
      <span className="dg-label">{label}</span>
      {sub ? <span className="dg-sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button className={`dg-node dg-${kind}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`dg-node dg-${kind}`}>{content}</div>
  );
}

function ThreeColumns({ left, leftTitle, center, right, rightTitle }: { left: React.ReactNode[]; leftTitle: string; center: React.ReactNode; right: React.ReactNode[]; rightTitle: string }) {
  return (
    <div className="dg-3">
      <div className="dg-colwrap">
        <div className="dg-coltitle">{leftTitle}</div>
        <div className="dg-col">{left.length ? left : <span className="dg-none">none found</span>}</div>
      </div>
      <ArrowRight size={18} className="dg-arrow" aria-hidden />
      <div className="dg-col dg-center">{center}</div>
      <ArrowRight size={18} className="dg-arrow" aria-hidden />
      <div className="dg-colwrap">
        <div className="dg-coltitle">{rightTitle}</div>
        <div className="dg-col">{right.length ? right : <span className="dg-none">none found</span>}</div>
      </div>
    </div>
  );
}

export function Diagrams() {
  const sel = useCode((s) => s.selection);
  const open = useCode((s) => s.open);
  const path = useCode((s) => s.openPath);
  const diagram = useCode((s) => s.diagram);
  const setDiagram = useCode((s) => s.setDiagram);
  const fileFlow = useCode((s) => s.fileFlow);
  const index = useCode((s) => s.index);
  const openFile = useCode((s) => s.openFile);
  const select = useCode((s) => s.select);
  const summary = open?.summary;
  const el = sel?.element;

  const goLine = (line: number) => useCode.setState({ scrollTo: { line, nonce: Date.now() } });

  // Pick the most useful picture for what is selected.
  const auto: Exclude<DiagramKind, 'auto'> = useMemo(() => {
    if (!el) return 'files';
    if (el.kind === 'function-definition' || el.kind === 'function-call') return 'connections';
    if (el.kind === 'variable' || el.kind === 'parameter' || el.kind === 'property') return 'data';
    if (el.flow?.length || el.enclosingFunction) return 'flow';
    return 'files';
  }, [el]);
  const kind = diagram === 'auto' ? auto : diagram;

  useEffect(() => {
    if (kind === 'flow' && !el?.flow?.length && !fileFlow && path) void getCodeClient().flow(path).then((f) => useCode.setState({ fileFlow: f }));
  }, [kind, el, fileFlow, path]);

  if (!summary || !path) return null;

  let body: React.ReactNode;
  if (kind === 'flow') {
    const steps = el?.flow?.length ? el.flow : fileFlow;
    const title = el?.flow?.length ? `Steps inside ${el.func?.name ?? el.enclosingFunction ?? 'this function'}` : 'Steps of this file, from top to bottom';
    body = steps ? (
      steps.length ? (
        <>
          <div className="dg-caption">{title}. Click a box to jump to that line.</div>
          <Flow steps={steps} onLine={goLine} />
        </>
      ) : (
        <div className="dg-caption">No steps could be found here. Flowcharts are made for files with a full syntax tree (for example Python, JavaScript, C).</div>
      )
    ) : (
      <div className="dg-caption">Drawing…</div>
    );
  } else if (kind === 'connections') {
    const fnName = el?.func?.name ?? (el?.kind === 'function-call' || el?.kind === 'function-definition' ? el.symbolName : el?.enclosingFunction) ?? null;
    if (!fnName) body = <div className="dg-caption">Click a function name to see which functions use it and which ones it uses.</div>;
    else {
      const callers = new Map<string, { path: string; line: number }>();
      if (index) {
        for (const f of index.files) {
          for (const r of f.summary?.refs ?? []) if (r.name === fnName && r.role === 'call') callers.set(`${f.path}:${r.container ?? '(top level)'}`, { path: f.path, line: r.range.line });
        }
      } else for (const r of summary.refs) if (r.name === fnName && r.role === 'call') callers.set(`${path}:${r.container ?? '(top level)'}`, { path, line: r.range.line });
      const def = summary.symbols.find((s) => s.name === fnName && (s.kind === 'function' || s.kind === 'method'));
      const callees = el?.func?.calls ?? (def ? [...new Set(summary.refs.filter((r) => r.role === 'call' && r.range.start > def.fullRange.start && r.range.end <= def.fullRange.end).map((r) => r.name))] : []);
      body = (
        <>
          <div className="dg-caption">
            Which parts use <b>{fnName}</b> (left) and what <b>{fnName}</b> uses (right). Links are found by name; a name can occasionally point to something else with the same name.
          </div>
          <ThreeColumns
            leftTitle="Used by"
            left={[...callers.entries()].slice(0, 14).map(([k, v]) => (
              <Node key={k} label={k.split(':').slice(1).join(':')} sub={v.path === path ? `line ${v.line + 1}` : `${v.path.split('/').pop()} · line ${v.line + 1}`} onClick={() => void openFile(v.path, { line: v.line })} />
            ))}
            center={<Node kind="main" label={fnName} sub={def ? `line ${def.range.line + 1}` : 'defined elsewhere'} onClick={def ? () => void select(def.range.start) : undefined} />}
            rightTitle="Uses"
            right={callees.slice(0, 14).map((c) => {
              const d = summary.symbols.find((s) => s.name === c && (s.kind === 'function' || s.kind === 'method' || s.kind === 'class'));
              return <Node key={c} label={c} sub={d ? `line ${d.range.line + 1}` : 'from outside this file'} kind={d ? 'fn' : 'ext'} onClick={d ? () => void select(d.range.start) : undefined} />;
            })}
          />
        </>
      );
    }
  } else if (kind === 'data') {
    const name = el?.symbolName;
    if (!el || !name) body = <div className="dg-caption">Click a variable to see where its value is created, changed and used.</div>;
    else {
      const refs = el.references ?? [];
      const defs = el.definitions ?? [];
      const created = [...defs.map((d) => ({ line: d.range.line, where: d.container })), ...refs.filter((r) => r.role === 'parameter').map((r) => ({ line: r.range.line, where: r.container }))];
      const changed = refs.filter((r) => r.role === 'assignment' && !defs.some((d) => d.range.start === r.range.start));
      const used = refs.filter((r) => r.role === 'read' || r.role === 'call' || r.role === 'property');
      const col = (items: { line: number; where: string | null }[], cls: string) =>
        items.slice(0, 12).map((x, i) => <Node key={`${cls}${i}`} kind="data" label={`line ${x.line + 1}`} sub={x.where ? `in ${x.where}` : 'top level'} onClick={() => goLine(x.line)} />);
      body = (
        <>
          <div className="dg-caption">
            The journey of the value in <b>{name}</b> inside this file: where it is made, where it changes, where it is read.
          </div>
          <div className="dg-data">
            <div className="dg-colwrap">
              <div className="dg-coltitle">1. Created</div>
              <div className="dg-col">{created.length ? col(created, 'c') : <span className="dg-none">not in this file</span>}</div>
            </div>
            <ArrowRight size={18} className="dg-arrow" aria-hidden />
            <div className="dg-colwrap">
              <div className="dg-coltitle">2. Changed</div>
              <div className="dg-col">{changed.length ? col(changed.map((r) => ({ line: r.range.line, where: r.container })), 'w') : <span className="dg-none">never changed</span>}</div>
            </div>
            <ArrowRight size={18} className="dg-arrow" aria-hidden />
            <div className="dg-colwrap">
              <div className="dg-coltitle">3. Used</div>
              <div className="dg-col">{used.length ? col(used.map((r) => ({ line: r.range.line, where: r.container })), 'r') : <span className="dg-none">not read here</span>}</div>
            </div>
          </div>
          {sel?.cross?.usesElsewhere.length ? <div className="dg-caption">Also mentioned in {new Set(sel.cross.usesElsewhere.map((u) => u.path)).size} other file(s) (by name).</div> : null}
        </>
      );
    }
  } else {
    const deps = index?.imports.get(path) ?? [];
    const by = index?.importedBy.get(path) ?? [];
    const external = summary.imports.filter((i) => i.external || (!i.resolved && !deps.length));
    body = (
      <>
        <div className="dg-caption">
          How <b>{path.split('/').pop()}</b> connects to other files: which files use it (left) and what it needs (right).
        </div>
        <ThreeColumns
          leftTitle="Used by"
          left={by.slice(0, 14).map((p) => <Node key={p} kind="file" label={p.split('/').pop()!} sub={p} onClick={() => void openFile(p)} />)}
          center={<Node kind="main" label={path.split('/').pop()!} sub={open?.languageName} />}
          rightTitle="Needs"
          right={[
            ...deps.slice(0, 14).map((p) => <Node key={p} kind="file" label={p.split('/').pop()!} sub={p} onClick={() => void openFile(p)} />),
            ...external.slice(0, 8).map((i) => <Node key={`x${i.spec}`} kind="ext" label={i.spec} sub="library / outside the project" />),
          ]}
        />
      </>
    );
  }

  const tabs: { k: DiagramKind; label: string }[] = [
    { k: 'auto', label: 'Best fit' },
    { k: 'flow', label: 'Steps' },
    { k: 'connections', label: 'Functions' },
    { k: 'data', label: 'Data' },
    { k: 'files', label: 'Files' },
  ];
  return (
    <section className="dg" aria-label="Picture" data-testid="diagram">
      <div className="dg-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={diagram === t.k} className={diagram === t.k ? 'on' : ''} onClick={() => setDiagram(t.k)} data-testid={`diagram-${t.k}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="dg-body" data-kind={kind}>
        {body}
      </div>
    </section>
  );
}

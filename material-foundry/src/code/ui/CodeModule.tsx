// UNDERSTAND CODE — the module's main screen. Left: files. Centre: code / project / map / changes /
// ideas. Right: the explanation. Opening files only reads them; nothing is ever executed.

import { useEffect, useState } from 'react';
import { BookOpenText, Code2, FileDiff, Keyboard, Map as MapIcon, Minus, Moon, Network, Plus, Rows3, ShieldCheck, Sun, X } from 'lucide-react';
import { getLanguage } from '../languages/registry';
import { ChangesView } from './ChangesView';
import { CodeView } from './CodeView';
import { ExplainPanel } from './ExplainPanel';
import { Explorer, OpenButtons } from './Explorer';
import { Glossary } from './Glossary';
import { Overview, ProjectMap } from './Overview';
import { WhatIfDialog } from './WhatIf';
import { readDataTransfer } from './fileLoading';
import { getCodeClient } from '../worker/client';
import { useCode, workspace, type CodeView as View } from './store';
import './code.css';

const SHORTCUTS: [string, string][] = [
  ['← → ↑ ↓', 'Move from word to word in the code (click into the code first)'],
  ['1 – 5', 'Choose how detailed explanations are'],
  ['?', 'I don’t understand — explain it another way'],
  ['e', 'Show me with an example'],
  ['g', 'Go to where the selected thing is made'],
  ['u', 'Show every use'],
  ['w', 'What if I change this?'],
  ['Esc', 'Clear the selection / close a dialog'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo a change'],
];

function Welcome() {
  return (
    <div className="welcome" data-testid="code-welcome">
      <h1>Understand code — without fear</h1>
      <p className="welcome-lead">Open any project or file. Click on anything you do not understand, and get a calm explanation in plain words.</p>
      <OpenButtons big />
      <ul className="welcome-points">
        <li>
          <ShieldCheck size={16} aria-hidden /> <b>Safe:</b> files are only read. Nothing you open is ever run, and your original files are never changed without your clear “yes”.
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden /> <b>Private:</b> everything happens on this computer. No internet, no AI service, no account.
        </li>
        <li>
          <ShieldCheck size={16} aria-hidden /> <b>Honest:</b> every explanation says how sure it is — verified, likely, a guess, or unknown.
        </li>
      </ul>
      <p className="muted small">
        You can also drag files or a folder onto this window. Works with Python, JavaScript, TypeScript, HTML, CSS, C, C++, C#, Java, Rust, Go, PHP, Ruby, Swift, Kotlin, SQL, Lua, JSON, YAML, XML, TOML, Bash, PowerShell,
        Dockerfile, Makefile, Markdown and more. Unknown files open as plain text.
      </p>
    </div>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const prefs = useCode((s) => s.prefs);
  const setPrefs = useCode((s) => s.setPrefs);
  return (
    <div className="popover" role="dialog" aria-label="Reading comfort">
      <div className="pop-row">
        <span>Colours</span>
        <button className={`btn small${prefs.theme === 'dark' ? ' on' : ''}`} onClick={() => setPrefs({ theme: 'dark' })} data-testid="theme-dark">
          <Moon size={13} /> Dark
        </button>
        <button className={`btn small${prefs.theme === 'light' ? ' on' : ''}`} onClick={() => setPrefs({ theme: 'light' })} data-testid="theme-light">
          <Sun size={13} /> Light
        </button>
      </div>
      <div className="pop-row">
        <span>Text size</span>
        <button className="btn small" onClick={() => setPrefs({ fontSize: Math.max(12, prefs.fontSize - 1) })} aria-label="Smaller text" data-testid="font-smaller">
          <Minus size={13} />
        </button>
        <b>{prefs.fontSize}</b>
        <button className="btn small" onClick={() => setPrefs({ fontSize: Math.min(24, prefs.fontSize + 1) })} aria-label="Bigger text" data-testid="font-bigger">
          <Plus size={13} />
        </button>
      </div>
      <div className="pop-row">
        <span>Line spacing</span>
        <button className={`btn small${prefs.spacing ? ' on' : ''}`} onClick={() => setPrefs({ spacing: !prefs.spacing })} aria-pressed={prefs.spacing}>
          <Rows3 size={13} /> {prefs.spacing ? 'Roomy' : 'Normal'}
        </button>
      </div>
      <button className="btn small" onClick={onClose}>
        Done
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
          <button onClick={() => useCode.setState({ toasts: useCode.getState().toasts.filter((x) => x.id !== t.id) })} aria-label="Dismiss notification">
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
  const [showKeys, setShowKeys] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void init();
    // Local automation hook used by the browser tests (no telemetry, nothing leaves the page).
    const w = window as unknown as { __mf?: Record<string, unknown> };
    w.__mf = { ...(w.__mf ?? {}), code: useCode, workspace, codeClient: getCodeClient() };
  }, [init]);

  // Keyboard shortcuts (ignored while typing in a field or when a dialog is open).
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
          s.toast('info', `${undo ? 'Undone' : 'Done again'}: ${cs.label}`);
          await s.refreshAfterChange(cs.edits.map((x) => x.path));
        } else s.toast('info', undo ? 'Nothing to undo.' : 'Nothing to redo.');
        return;
      }
      if (e.altKey) return;
      if (/^[1-5]$/.test(e.key)) s.setLevel(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      else if (e.key === '?') s.simpler();
      else if (e.key === 'e') s.toggleExample();
      else if (e.key === 'g') void s.goToDefinition();
      else if (e.key === 'u') s.showUses();
      else if (e.key === 'w' && s.selection) s.setWhatIf(true);
      else if (e.key === 'Escape') {
        setShowKeys(false);
        setShowSettings(false);
        s.clearSelection();
      } else return;
      e.preventDefault();
    };
    const h = (e: KeyboardEvent) => void onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const tabs: { v: View; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { v: 'code', label: 'Code', icon: <Code2 size={15} />, disabled: !openPath },
    { v: 'overview', label: 'Project explained', icon: <BookOpenText size={15} />, disabled: !files.length },
    { v: 'map', label: 'Project map', icon: <Network size={15} />, disabled: !files.length },
    { v: 'changes', label: `Changes${workspace.changedFiles().length ? ` (${workspace.changedFiles().length})` : ''}`, icon: <FileDiff size={15} />, disabled: !files.length },
    { v: 'glossary', label: 'Ideas A–Z', icon: <MapIcon size={15} /> },
  ];
  void wsVersion;

  const lang = open ? getLanguage(open.summary.languageId) : null;
  const skipped = openPath ? files.find((f) => f.path === openPath)?.skipped : undefined;

  return (
    <div
      className={`cm theme-${prefs.theme}${prefs.spacing ? ' roomy' : ''}`}
      style={{ ['--cm-font' as string]: `${prefs.fontSize}px` }}
      data-testid="code-module"
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
      <Explorer />
      <main className="cm-center">
        <div className="cm-tabs" role="tablist" aria-label="Views">
          {tabs.map((t) => (
            <button key={t.v} role="tab" aria-selected={view === t.v} className={view === t.v ? 'on' : ''} disabled={t.disabled} onClick={() => setView(t.v)} data-testid={`view-${t.v}`}>
              {t.icon} {t.label}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn small ghost" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys} data-testid="show-shortcuts">
            <Keyboard size={14} /> Keys
          </button>
          <button className="btn small ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} data-testid="reading-settings">
            Aa Reading comfort
          </button>
          {showSettings ? <Settings onClose={() => setShowSettings(false)} /> : null}
          {showKeys ? (
            <div className="popover keys" role="dialog" aria-label="Keyboard shortcuts">
              <table>
                <tbody>
                  {SHORTCUTS.map(([k, d]) => (
                    <tr key={k}>
                      <td>
                        <kbd>{k}</kbd>
                      </td>
                      <td>{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn small" onClick={() => setShowKeys(false)}>
                Close
              </button>
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="cm-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="cm-view">
          {view === 'welcome' || (!files.length && view !== 'glossary') ? (
            <Welcome />
          ) : view === 'code' ? (
            openPath ? (
              <div className="cm-code">
                <div className="cm-file-bar" data-testid="file-bar">
                  <b>{openPath}</b>
                  {lang ? <span className="pill">{lang.name}</span> : null}
                  {open ? (
                    <span className={`pill mode-${open.summary.mode}`} title="How deeply this file can be understood">
                      {open.summary.mode === 'syntax-tree' ? 'Full structure' : open.summary.mode === 'tokens' ? 'Word level' : 'Plain text'}
                    </span>
                  ) : null}
                  {workspace.isChanged(openPath) ? <span className="pill changed">Changed (not saved to disk)</span> : null}
                  <span className="spacer" />
                  <span className="muted small">Read only · click a word to explain it</span>
                </div>
                {skipped ? (
                  <div className="cm-skipped">
                    <p>{skipped}</p>
                    <p className="muted">It is listed so you know it exists, but its contents cannot be explained here.</p>
                  </div>
                ) : open ? (
                  <CodeView />
                ) : null}
              </div>
            ) : (
              <div className="cm-skipped">Pick a file on the left.</div>
            )
          ) : view === 'overview' ? (
            <Overview />
          ) : view === 'map' ? (
            <div className="cm-mapview">
              <ProjectMap />
            </div>
          ) : view === 'changes' ? (
            <ChangesView />
          ) : (
            <Glossary />
          )}
        </div>
      </main>
      <ExplainPanel />
      <WhatIfDialog />
      {busy ? (
        <div className="cm-busy" role="status" data-testid="code-busy">
          <span className="spinner" aria-hidden /> {busy}
        </div>
      ) : null}
      {dragging ? <div className="cm-drop">Drop files or a folder to open them (they are only read, never run)</div> : null}
      <Toasts />
    </div>
  );
}

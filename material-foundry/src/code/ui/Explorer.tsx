// The left column: open a folder or files, try the example, search, and browse the file tree.
// Opening only reads text. Nothing that is opened is ever run.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileQuestion, FileText, FolderOpen, Files, Search, Sparkles, X } from 'lucide-react';
import { getLanguage } from '../languages/registry';
import { readDirectoryHandle, readFileList, supportsDirectoryPicker } from './fileLoading';
import { useCode, workspace, type FileEntry } from './store';

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: FileEntry;
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    parts.forEach((p, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let next = node.children.get(p);
      if (!next) {
        next = { name: p, path, children: new Map() };
        node.children.set(p, next);
      }
      if (i === parts.length - 1) next.file = f;
      node = next;
    });
  }
  return root;
}

const KIND_COLOR: Record<string, string> = { code: 'var(--cm-accent)', script: '#6cc28a', markup: '#e8806a', style: '#6aa7e8', data: '#c58ae0', config: '#d6c35a', docs: '#9aa0aa', text: '#9aa0aa' };

function TreeView({ node, depth, expanded, toggle }: { node: TreeNode; depth: number; expanded: Set<string>; toggle: (p: string) => void }) {
  const openPath = useCode((s) => s.openPath);
  const openFile = useCode((s) => s.openFile);
  useCode((s) => s.wsVersion);
  const kids = [...node.children.values()].sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name));
  return (
    <ul className="tree" role={depth === 0 ? 'tree' : 'group'}>
      {kids.map((k) => {
        if (k.file) {
          const lang = getLanguage(k.file.languageId);
          const changed = workspace.isChanged(k.path);
          return (
            <li key={k.path} role="treeitem" aria-selected={openPath === k.path}>
              <button
                className={`tree-file${openPath === k.path ? ' on' : ''}${k.file.skipped ? ' skipped' : ''}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => void openFile(k.path)}
                title={k.file.skipped ? k.file.skipped : `${lang.name}${changed ? ' — changed in the workspace' : ''}`}
                data-testid="tree-file"
                data-path={k.path}
              >
                {k.file.skipped ? <FileQuestion size={13} aria-hidden /> : <FileText size={13} aria-hidden style={{ color: KIND_COLOR[lang.kind] ?? 'inherit' }} />}
                <span className="tree-name">{k.name}</span>
                {changed ? <span className="dot-changed" aria-label="changed" /> : null}
                <span className="tree-lang">{k.file.skipped ? '' : lang.id === 'plaintext' || lang.id === 'unknown' ? 'text' : lang.name}</span>
              </button>
            </li>
          );
        }
        const open = expanded.has(k.path);
        return (
          <li key={k.path} role="treeitem" aria-expanded={open}>
            <button className="tree-dir" style={{ paddingLeft: 4 + depth * 14 }} onClick={() => toggle(k.path)}>
              {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
              <span className="tree-name">{k.name}</span>
            </button>
            {open ? <TreeView node={k} depth={depth + 1} expanded={expanded} toggle={toggle} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

interface Hit {
  path: string;
  line: number;
  offset: number;
  text: string;
}

export function OpenButtons({ big = false }: { big?: boolean }) {
  const loadProject = useCode((s) => s.loadProject);
  const openExample = useCode((s) => s.openExample);
  const toast = useCode((s) => s.toast);
  const busy = useCode((s) => s.busy);
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFolder = async () => {
    if (supportsDirectoryPicker()) {
      try {
        const dir = await (window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read' });
        useCode.setState({ busy: 'Reading the folder…' });
        const r = await readDirectoryHandle(dir, (n) => useCode.setState({ busy: `Reading the folder: ${n} files…` }));
        await loadProject(r);
      } catch (e) {
        if ((e as DOMException)?.name !== 'AbortError') toast('error', `The folder could not be opened: ${e instanceof Error ? e.message : String(e)}`);
        useCode.setState({ busy: null });
      }
    } else dirInput.current?.click();
  };

  const cls = big ? 'btn big' : 'btn small';
  return (
    <div className={big ? 'open-big' : 'open-row'}>
      <button className={`${cls} primary`} onClick={() => void openFolder()} disabled={!!busy} data-testid="open-folder">
        <FolderOpen size={big ? 20 : 14} /> Open a folder
      </button>
      <button className={cls} onClick={() => fileInput.current?.click()} disabled={!!busy} data-testid="open-files">
        <Files size={big ? 20 : 14} /> Open files
      </button>
      <button className={cls} onClick={() => void openExample()} disabled={!!busy} data-testid="open-example">
        <Sparkles size={big ? 20 : 14} /> Try an example
      </button>
      <input
        ref={dirInput}
        type="file"
        className="sr-only"
        // @ts-expect-error - non-standard but widely supported folder picker attribute
        webkitdirectory=""
        multiple
        onChange={async (e) => {
          const list = e.target.files;
          if (list?.length) await loadProject(await readFileList(list));
          e.target.value = '';
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        className="sr-only"
        data-testid="file-input"
        onChange={async (e) => {
          const list = e.target.files;
          if (list?.length) await loadProject(await readFileList(list));
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function Explorer() {
  const files = useCode((s) => s.files);
  const projectName = useCode((s) => s.projectName);
  const openFile = useCode((s) => s.openFile);
  const closeProject = useCode((s) => s.closeProject);
  const view = useCode((s) => s.view);
  const [query, setQuery] = useState('');
  const [inCode, setInCode] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  useCode((s) => s.wsVersion);

  const tree = useMemo(() => buildTree(files), [files]);
  // Open the first two folder levels by default.
  useEffect(() => {
    const s = new Set<string>();
    for (const f of files) {
      const parts = f.path.split('/');
      if (parts.length > 1) s.add(parts[0]);
      if (parts.length > 2 && files.length < 200) s.add(parts.slice(0, 2).join('/'));
    }
    setExpanded(s);
  }, [files]);

  const toggle = (p: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const needle = query.trim();
  const nameHits = useMemo(() => (needle && !inCode ? files.filter((f) => f.path.toLowerCase().includes(needle.toLowerCase())).slice(0, 300) : []), [files, needle, inCode]);
  const codeHits = useMemo(() => {
    if (!needle || !inCode || needle.length < 2) return [];
    const hits: Hit[] = [];
    const lower = needle.toLowerCase();
    for (const f of workspace.files.values()) {
      if (f.skipped) continue;
      const t = f.current;
      const tl = t.toLowerCase();
      let i = tl.indexOf(lower);
      let n = 0;
      while (i >= 0 && n < 20 && hits.length < 400) {
        const ls = t.lastIndexOf('\n', i - 1) + 1;
        const le = t.indexOf('\n', i);
        const line = t.slice(0, i).split('\n').length - 1;
        hits.push({ path: f.path, line, offset: i, text: t.slice(ls, le < 0 ? undefined : le).trim().slice(0, 120) });
        i = tl.indexOf(lower, i + lower.length);
        n++;
      }
    }
    return hits;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, inCode, files]);

  return (
    <nav className="ex" aria-label="Files" data-testid="explorer">
      <div className="ex-head">
        <div className="ex-title" title={projectName}>
          {projectName || 'No project open'}
        </div>
        {projectName ? (
          confirmClose ? (
            <span className="ex-confirm">
              Close and forget changes?{' '}
              <button className="btn small danger" onClick={() => void closeProject().then(() => setConfirmClose(false))} data-testid="close-project-confirm">
                Yes
              </button>
              <button className="btn small" onClick={() => setConfirmClose(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="icon-btn" onClick={() => setConfirmClose(true)} title="Close this project" aria-label="Close this project" data-testid="close-project">
              <X size={15} />
            </button>
          )
        ) : null}
      </div>
      {files.length || view === 'glossary' ? <OpenButtons /> : <p className="muted small ex-hint">Open a folder, some files, or the example to begin.</p>}
      {files.length ? (
        <>
          <div className="ex-search">
            <label className="search">
              <Search size={14} aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={inCode ? 'Search inside the code' : 'Find a file by name'} aria-label="Search" data-testid="search" />
            </label>
            <label className="small ex-incode">
              <input type="checkbox" checked={inCode} onChange={(e) => setInCode(e.target.checked)} data-testid="search-in-code" /> Search inside the code
            </label>
          </div>
          <div className="ex-list">
            {needle ? (
              inCode ? (
                <ul className="hits" data-testid="search-results">
                  {needle.length < 2 ? <li className="muted">Type at least 2 letters.</li> : null}
                  {needle.length >= 2 && !codeHits.length ? <li className="muted">Not found.</li> : null}
                  {codeHits.map((h, i) => (
                    <li key={i}>
                      <button onClick={() => void openFile(h.path, { offset: h.offset })}>
                        <span className="hit-path">
                          {h.path}:{h.line + 1}
                        </span>
                        <span className="hit-text">{h.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="hits" data-testid="search-results">
                  {!nameHits.length ? <li className="muted">No file name matches.</li> : null}
                  {nameHits.map((f) => (
                    <li key={f.path}>
                      <button onClick={() => void openFile(f.path)}>
                        <span className="hit-path">{f.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <TreeView node={tree} depth={0} expanded={expanded} toggle={toggle} />
            )}
          </div>
          <div className="ex-foot muted small">
            {files.length} file{files.length === 1 ? '' : 's'} · read only, nothing is run
          </div>
        </>
      ) : null}
    </nav>
  );
}

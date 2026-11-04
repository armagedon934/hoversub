// The in-app workspace: a protected copy of the opened files. Changes are applied as named
// change sets; every apply creates a restore point first. Undo, redo and restoring a restore
// point never lose information (restoring is itself a change that can be undone). Original files
// on disk are never touched here — writing to disk is a separate, explicitly confirmed action.

import { tr } from '../i18n';

export interface WsFile {
  path: string;
  /** Text exactly as opened (or as last saved to disk). */
  original: string;
  /** Current text in the workspace. */
  current: string;
  size: number;
  /** Not analysable as text (binary, too large); kept only as a listing entry. */
  skipped?: string;
}

export interface FileEdit {
  path: string;
  before: string;
  after: string;
}

export interface ChangeSet {
  id: string;
  time: number;
  /** Plain-language description, e.g. 'Changed 0.2 to 0.25 on line 4 of cart.py'. */
  label: string;
  edits: FileEdit[];
}

export interface RestorePoint {
  id: string;
  time: number;
  label: string;
  files: { path: string; text: string }[];
}

export interface WorkspaceSnapshot {
  version: 1;
  name: string;
  files: WsFile[];
  history: ChangeSet[];
  redo: ChangeSet[];
  restorePoints: RestorePoint[];
}

export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryStore implements KVStore {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async del(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const MAX_HISTORY = 100;
const MAX_RESTORE_POINTS = 50;
const KEY = 'workspace.v1';
let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export class Workspace {
  name = '';
  files = new Map<string, WsFile>();
  history: ChangeSet[] = [];
  redoStack: ChangeSet[] = [];
  restorePoints: RestorePoint[] = [];
  private store: KVStore | null;
  private listeners = new Set<() => void>();

  constructor(store: KVStore | null = null) {
    this.store = store;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Replace the workspace with a newly opened project or set of files. */
  async load(name: string, files: { path: string; text: string; skipped?: string; size?: number }[]): Promise<void> {
    this.name = name;
    this.files = new Map(files.map((f) => [f.path, { path: f.path, original: f.text, current: f.text, size: f.size ?? f.text.length, skipped: f.skipped }]));
    this.history = [];
    this.redoStack = [];
    this.restorePoints = [];
    await this.persist();
    this.emit();
  }

  /** Add files to the current workspace (e.g. opening single files). */
  async addFiles(files: { path: string; text: string; skipped?: string; size?: number }[]): Promise<void> {
    for (const f of files) this.files.set(f.path, { path: f.path, original: f.text, current: f.text, size: f.size ?? f.text.length, skipped: f.skipped });
    await this.persist();
    this.emit();
  }

  text(path: string): string | undefined {
    return this.files.get(path)?.current;
  }

  isChanged(path: string): boolean {
    const f = this.files.get(path);
    return !!f && f.current !== f.original;
  }

  changedFiles(): WsFile[] {
    return [...this.files.values()].filter((f) => f.current !== f.original);
  }

  /** Apply a change set after confirmation. A restore point with the previous texts is created first. */
  async apply(label: string, edits: { path: string; after: string }[]): Promise<ChangeSet> {
    const real: FileEdit[] = [];
    for (const e of edits) {
      const f = this.files.get(e.path);
      if (!f) throw new Error(`File not in workspace: ${e.path}`);
      if (f.current !== e.after) real.push({ path: e.path, before: f.current, after: e.after });
    }
    if (!real.length) throw new Error('This change does not modify anything.');
    this.addRestorePoint(`${tr('Before', 'До')}: ${label}`, real.map((e) => ({ path: e.path, text: e.before })));
    for (const e of real) this.files.get(e.path)!.current = e.after;
    const cs: ChangeSet = { id: uid('chg'), time: Date.now(), label, edits: real };
    this.history.push(cs);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.redoStack = [];
    await this.persist();
    this.emit();
    return cs;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  async undo(): Promise<ChangeSet | null> {
    const cs = this.history.pop();
    if (!cs) return null;
    for (const e of [...cs.edits].reverse()) {
      const f = this.files.get(e.path);
      if (f) f.current = e.before;
    }
    this.redoStack.push(cs);
    await this.persist();
    this.emit();
    return cs;
  }

  async redo(): Promise<ChangeSet | null> {
    const cs = this.redoStack.pop();
    if (!cs) return null;
    for (const e of cs.edits) {
      const f = this.files.get(e.path);
      if (f) f.current = e.after;
    }
    this.history.push(cs);
    await this.persist();
    this.emit();
    return cs;
  }

  addRestorePoint(label: string, files: { path: string; text: string }[]): RestorePoint {
    const rp: RestorePoint = { id: uid('rp'), time: Date.now(), label, files };
    this.restorePoints.push(rp);
    if (this.restorePoints.length > MAX_RESTORE_POINTS) this.restorePoints.shift();
    return rp;
  }

  /** Bring files back to a restore point. This is recorded as a normal change, so it can be undone. */
  async restore(id: string): Promise<ChangeSet> {
    const rp = this.restorePoints.find((r) => r.id === id);
    if (!rp) throw new Error('Restore point not found.');
    const edits = rp.files.filter((f) => this.files.has(f.path)).map((f) => ({ path: f.path, after: f.text }));
    return this.apply(tr(`Restored "${rp.label.replace(/^(Before|До): /, '')}" to its earlier state`, `Возврат к состоянию до «${rp.label.replace(/^(Before|До): /, '')}»`), edits);
  }

  /** Revert one file to the text it had when it was opened. */
  async revertFile(path: string): Promise<ChangeSet> {
    const f = this.files.get(path);
    if (!f) throw new Error('File not found.');
    return this.apply(tr(`Reverted ${path} to the original`, `${path}: возвращён оригинал`), [{ path, after: f.original }]);
  }

  /** After a confirmed save to disk, the saved text becomes the new original. */
  async markSaved(paths: string[]): Promise<void> {
    for (const p of paths) {
      const f = this.files.get(p);
      if (f) {
        this.addRestorePoint(tr(`Original of ${p} before saving to disk`, `Оригинал ${p} до сохранения на диск`), [{ path: p, text: f.original }]);
        f.original = f.current;
      }
    }
    await this.persist();
    this.emit();
  }

  snapshot(): WorkspaceSnapshot {
    return { version: 1, name: this.name, files: [...this.files.values()], history: this.history, redo: this.redoStack, restorePoints: this.restorePoints };
  }

  async persist(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.set(KEY, this.snapshot());
    } catch {
      // Storage full or unavailable: the workspace keeps working in memory.
    }
  }

  /** Restore the previous session's workspace. Returns false when nothing (valid) was stored. */
  async restoreSession(): Promise<boolean> {
    if (!this.store) return false;
    const s = await this.store.get<WorkspaceSnapshot>(KEY).catch(() => undefined);
    if (!s || s.version !== 1 || !Array.isArray(s.files)) return false;
    this.name = typeof s.name === 'string' ? s.name : 'Project';
    this.files = new Map(
      s.files.filter((f) => f && typeof f.path === 'string' && typeof f.current === 'string' && typeof f.original === 'string').map((f) => [f.path, f]),
    );
    this.history = Array.isArray(s.history) ? s.history : [];
    this.redoStack = Array.isArray(s.redo) ? s.redo : [];
    this.restorePoints = Array.isArray(s.restorePoints) ? s.restorePoints : [];
    this.emit();
    return this.files.size > 0;
  }

  async clear(): Promise<void> {
    this.files.clear();
    this.history = [];
    this.redoStack = [];
    this.restorePoints = [];
    this.name = '';
    if (this.store) await this.store.del(KEY);
    this.emit();
  }
}

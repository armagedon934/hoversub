// Main-thread client for the code analysis workers. Requests to one worker are answered in order.
//
// Grammars are spread over a small pool of workers: Chromium's compiler can run out of memory
// ("V8 process OOM (Zone)") when more than about 15 large Tree-sitter grammars live in one worker,
// so each worker holds at most MAX_GRAMMARS_PER_WORKER of them. A file's syntax tree stays in the
// worker that parsed it, and later questions about that file go to the same worker.

import type { OpenResult } from '../analysis/engine';
import type { ElementInfo, FlowStep, SyntaxIssue } from '../analysis/types';
import { detectLanguage, getLanguage } from '../languages/registry';
import type { CodeRequest } from './code.worker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export const MAX_GRAMMARS_PER_WORKER = 7;

class Slot {
  readonly worker: Worker;
  readonly grammars = new Set<string>();
  private pending = new Map<number, Pending>();
  private next = 1;
  readonly init: Promise<unknown>;

  constructor() {
    this.worker = new Worker(new URL('./code.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    this.worker.onerror = (e) => {
      e.preventDefault();
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Code analysis worker crashed'));
      this.pending.clear();
    };
    const grammarBase = new URL('grammars/', document.baseURI).href;
    this.init = this.call({ op: 'init', grammarBase });
  }

  call<T>(req: CodeRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.next++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, req });
    });
  }

  async ask<T>(req: CodeRequest): Promise<T> {
    await this.init;
    return this.call<T>(req);
  }
}

function grammarOf(path: string, text: string, language?: string): string | null {
  const lang = language ? getLanguage(language) : detectLanguage(path, text.slice(0, 4000)).language;
  return lang.mode === 'syntax-tree' && lang.grammar ? lang.grammar : null;
}

export class CodeClient {
  private slots: Slot[] = [];
  /** Which worker holds the analysed copy of each kept file. */
  private docs = new Map<string, Slot>();

  constructor() {
    this.slots.push(new Slot());
  }

  /** Number of workers currently running (for tests and diagnostics). */
  get workerCount(): number {
    return this.slots.length;
  }

  private slotFor(grammar: string | null): Slot {
    if (!grammar) return this.slots[0];
    const holder = this.slots.find((s) => s.grammars.has(grammar));
    if (holder) return holder;
    let slot = this.slots.find((s) => s.grammars.size < MAX_GRAMMARS_PER_WORKER);
    if (!slot) {
      slot = new Slot();
      this.slots.push(slot);
    }
    slot.grammars.add(grammar);
    return slot;
  }

  async open(path: string, text: string, keep = true, language?: string): Promise<OpenResult> {
    const slot = this.slotFor(grammarOf(path, text, language));
    if (keep) {
      const prev = this.docs.get(path);
      if (prev && prev !== slot) void prev.ask({ op: 'close', path }).catch(() => {});
      this.docs.set(path, slot);
    }
    return slot.ask<OpenResult>({ op: 'open', path, text, keep, language });
  }

  async element(path: string, offset: number): Promise<ElementInfo> {
    return (this.docs.get(path) ?? this.slots[0]).ask<ElementInfo>({ op: 'element', path, offset });
  }

  async flow(path: string): Promise<FlowStep[]> {
    return (this.docs.get(path) ?? this.slots[0]).ask<FlowStep[]>({ op: 'flow', path });
  }

  async check(path: string, text: string): Promise<{ checked: boolean; issues: SyntaxIssue[] }> {
    return (this.docs.get(path) ?? this.slotFor(grammarOf(path, text))).ask({ op: 'check', path, text });
  }

  async close(path: string): Promise<void> {
    const slot = this.docs.get(path);
    this.docs.delete(path);
    if (slot) await slot.ask({ op: 'close', path });
  }

  dispose(): void {
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
    this.docs.clear();
  }
}

let client: CodeClient | null = null;
export function getCodeClient(): CodeClient {
  client ??= new CodeClient();
  return client;
}

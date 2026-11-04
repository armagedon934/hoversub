// Main-thread client for the code analysis worker. Requests are answered in order.

import type { OpenResult } from '../analysis/engine';
import type { ElementInfo, FlowStep, SyntaxIssue } from '../analysis/types';
import type { CodeRequest } from './code.worker';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class CodeClient {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private next = 1;
  private init: Promise<unknown>;

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

  private call<T>(req: CodeRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.next++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, req });
    });
  }

  async open(path: string, text: string, keep = true, language?: string): Promise<OpenResult> {
    await this.init;
    return this.call<OpenResult>({ op: 'open', path, text, keep, language });
  }

  async element(path: string, offset: number): Promise<ElementInfo> {
    await this.init;
    return this.call<ElementInfo>({ op: 'element', path, offset });
  }

  async flow(path: string): Promise<FlowStep[]> {
    await this.init;
    return this.call<FlowStep[]>({ op: 'flow', path });
  }

  async check(path: string, text: string): Promise<{ checked: boolean; issues: SyntaxIssue[] }> {
    await this.init;
    return this.call({ op: 'check', path, text });
  }

  async close(path: string): Promise<void> {
    await this.init;
    await this.call({ op: 'close', path });
  }

  dispose(): void {
    this.worker.terminate();
  }
}

let client: CodeClient | null = null;
export function getCodeClient(): CodeClient {
  client ??= new CodeClient();
  return client;
}

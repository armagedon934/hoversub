// Main-thread worker pool with priorities and cancellation.
//
// Work is submitted as small tasks (row bands, encodes...). Each task belongs to a JobToken.
// Cancelling a token drops its queued tasks immediately; results of in-flight tasks are
// discarded. For export jobs (`hardCancel`) the workers running them are terminated and
// replaced so cancellation is immediate even in the middle of a long task.

import { CancelledError } from '../engine/fields';
import type { TaskRequest, TaskResult, WorkerRequestMessage, WorkerResponseMessage } from './protocol';

export enum Priority {
  Interactive = 0,
  Normal = 1,
  Background = 2,
}

export class JobToken {
  cancelled = false;
  readonly hardCancel: boolean;
  private listeners: (() => void)[] = [];
  constructor(hardCancel = false) {
    this.hardCancel = hardCancel;
  }
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const l of this.listeners) l();
    this.listeners = [];
  }
  onCancel(fn: () => void): void {
    if (this.cancelled) fn();
    else this.listeners.push(fn);
  }
}

interface Task {
  id: number;
  request: TaskRequest;
  transfer: Transferable[];
  priority: Priority;
  seq: number;
  token: JobToken;
  onProgress?: (stage: string, fraction: number) => void;
  resolve: (r: TaskResult) => void;
  reject: (e: unknown) => void;
}

interface Slot {
  worker: Worker;
  task: Task | null;
}

export type WorkerFactory = () => Worker;

export class WorkerPool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  private nextId = 1;
  private seq = 0;
  private factory: WorkerFactory;
  readonly size: number;

  constructor(factory: WorkerFactory, size: number) {
    this.factory = factory;
    this.size = size;
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.factory(), task: null };
    slot.worker.onmessage = (e: MessageEvent<WorkerResponseMessage>) => this.onMessage(slot, e.data);
    slot.worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      const t = slot.task;
      slot.task = null;
      if (t) t.reject(new Error(e.message || 'Worker crashed'));
      this.replace(slot);
    };
    return slot;
  }

  private replace(slot: Slot): void {
    try {
      slot.worker.terminate();
    } catch {
      /* ignore */
    }
    const idx = this.slots.indexOf(slot);
    if (idx >= 0) this.slots[idx] = this.spawn();
    this.pump();
  }

  private onMessage(slot: Slot, msg: WorkerResponseMessage): void {
    const t = slot.task;
    if (!t || t.id !== msg.taskId) return;
    if (msg.type === 'progress') {
      if (!t.token.cancelled) t.onProgress?.(msg.stage, msg.fraction);
      return;
    }
    slot.task = null;
    if (t.token.cancelled) t.reject(new CancelledError());
    else if (msg.type === 'result') t.resolve(msg.result);
    else t.reject(new Error(msg.message));
    this.pump();
  }

  run(
    request: TaskRequest,
    opts: { priority: Priority; token: JobToken; transfer?: Transferable[]; onProgress?: (stage: string, fraction: number) => void },
  ): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve, reject) => {
      if (opts.token.cancelled) {
        reject(new CancelledError());
        return;
      }
      const task: Task = {
        id: this.nextId++,
        request,
        transfer: opts.transfer ?? [],
        priority: opts.priority,
        seq: this.seq++,
        token: opts.token,
        onProgress: opts.onProgress,
        resolve,
        reject,
      };
      opts.token.onCancel(() => this.cancelTask(task));
      this.queue.push(task);
      this.pump();
    });
  }

  private cancelTask(task: Task): void {
    const qi = this.queue.indexOf(task);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      task.reject(new CancelledError());
      return;
    }
    const slot = this.slots.find((s) => s.task === task);
    if (slot && task.token.hardCancel) {
      slot.task = null;
      task.reject(new CancelledError());
      this.replace(slot);
    }
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.task) continue;
      if (this.queue.length === 0) return;
      // Highest priority (lowest number) first, FIFO within a priority.
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i];
        const b = this.queue[best];
        if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
      }
      const task = this.queue.splice(best, 1)[0];
      slot.task = task;
      const msg: WorkerRequestMessage = { taskId: task.id, request: task.request };
      slot.worker.postMessage(msg, task.transfer);
    }
  }

  /** Number of queued + running tasks (for diagnostics/tests). */
  get pending(): number {
    return this.queue.length + this.slots.filter((s) => s.task).length;
  }

  dispose(): void {
    for (const t of this.queue) t.reject(new CancelledError());
    this.queue = [];
    for (const s of this.slots) s.worker.terminate();
    this.slots = [];
  }
}

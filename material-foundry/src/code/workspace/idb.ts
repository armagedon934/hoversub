// IndexedDB key-value store for the workspace (file copies, history, restore points).
// Falls back to an in-memory store when IndexedDB is unavailable (private mode, old browsers).

import { MemoryStore, type KVStore } from './workspace';

const DB = 'material-foundry-code';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbStore implements KVStore {
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = open();
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async get<T>(key: string): Promise<T | undefined> {
    return (await this.tx('readonly', (s) => s.get(key))) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async del(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}

export async function createStore(): Promise<KVStore> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryStore();
    const s = new IdbStore();
    await s.get('probe');
    return s;
  } catch {
    return new MemoryStore();
  }
}

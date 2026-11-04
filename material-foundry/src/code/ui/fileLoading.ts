// Reading files and folders chosen by the user. Files are only read as text — nothing is run.
// Dependency/build folders are skipped, binary files are listed but not opened as text.

import { IGNORED_DIRS, looksBinary } from '../languages/registry';

export const MAX_FILE_BYTES = 5_000_000;
export const MAX_FILES = 4000;

export interface LoadedFile {
  path: string;
  text: string;
  size: number;
  skipped?: string;
}

export interface LoadResult {
  name: string;
  files: LoadedFile[];
  /** File handles for writing back to disk (File System Access API only). */
  handles: Map<string, FileSystemFileHandle>;
  root?: FileSystemDirectoryHandle;
  notes: string[];
}

const decoder = new TextDecoder('utf-8');

async function readOne(path: string, file: Blob, size: number): Promise<LoadedFile> {
  if (size > MAX_FILE_BYTES) return { path, text: '', size, skipped: `Too large to analyse (${(size / 1e6).toFixed(1)} MB).` };
  const buf = new Uint8Array(await file.arrayBuffer());
  if (looksBinary(buf)) return { path, text: '', size, skipped: 'Binary file (for example an image or a compiled program); it cannot be shown as text.' };
  return { path, text: decoder.decode(buf).replace(/^﻿/, ''), size };
}

function ignoredPath(parts: string[]): boolean {
  return parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p) || (p.startsWith('.') && p !== '.github' && p !== '.config'));
}

/** Files from <input type="file" multiple> or <input webkitdirectory>. */
export async function readFileList(list: FileList | File[], onProgress?: (done: number, total: number) => void): Promise<LoadResult> {
  const all = Array.from(list);
  const notes: string[] = [];
  const rel = all.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const firstParts = rel.map((r) => r.split('/')[0]);
  const commonRoot = rel.every((r) => r.includes('/')) && firstParts.every((p) => p === firstParts[0]) ? firstParts[0] : '';
  const name = commonRoot || (all.length === 1 ? all[0].name : 'Opened files');
  const files: LoadedFile[] = [];
  let skippedDirs = 0;
  for (let i = 0; i < all.length; i++) {
    const path = commonRoot ? rel[i].slice(commonRoot.length + 1) : rel[i];
    if (ignoredPath(path.split('/'))) {
      skippedDirs++;
      continue;
    }
    if (files.length >= MAX_FILES) {
      notes.push(`Only the first ${MAX_FILES} files were opened.`);
      break;
    }
    files.push(await readOne(path, all[i], all[i].size));
    if (i % 20 === 0) onProgress?.(i, all.length);
  }
  if (skippedDirs) notes.push(`${skippedDirs} files in dependency, build or hidden folders (such as node_modules or .git) were skipped.`);
  return { name, files, handles: new Map(), notes };
}

/** Folder chosen with the File System Access API (supports saving back later). */
export async function readDirectoryHandle(root: FileSystemDirectoryHandle, onProgress?: (done: number) => void): Promise<LoadResult> {
  const files: LoadedFile[] = [];
  const handles = new Map<string, FileSystemFileHandle>();
  const notes: string[] = [];
  let skippedDirs = 0;
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    // @ts-expect-error - entries() is part of the File System Access API
    for await (const [entryName, handle] of dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (files.length >= MAX_FILES) return;
      const path = prefix ? `${prefix}/${entryName}` : entryName;
      if (handle.kind === 'directory') {
        if (IGNORED_DIRS.has(entryName) || (entryName.startsWith('.') && entryName !== '.github')) {
          skippedDirs++;
          continue;
        }
        await walk(handle as FileSystemDirectoryHandle, path);
      } else {
        const fh = handle as FileSystemFileHandle;
        const file = await fh.getFile();
        files.push(await readOne(path, file, file.size));
        handles.set(path, fh);
        if (files.length % 20 === 0) onProgress?.(files.length);
      }
    }
  };
  await walk(root, '');
  if (files.length >= MAX_FILES) notes.push(`Only the first ${MAX_FILES} files were opened.`);
  if (skippedDirs) notes.push(`${skippedDirs} dependency, build or hidden folders (such as node_modules or .git) were skipped.`);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name: root.name, files, handles, root, notes };
}

/** Files and folders dropped onto the window. */
export async function readDataTransfer(dt: DataTransfer): Promise<LoadResult> {
  const entries = Array.from(dt.items)
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  const out: File[] = [];
  const paths: string[] = [];
  const readEntry = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (out.length >= MAX_FILES) return;
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push(f);
      paths.push(prefix + entry.name);
    } else if (entry.isDirectory) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) return;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await readEntry(e, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await readEntry(e, '');
  const files: LoadedFile[] = [];
  const single = entries.length === 1 && entries[0].isDirectory ? `${entries[0].name}/` : '';
  for (let i = 0; i < out.length; i++) files.push(await readOne(single ? paths[i].slice(single.length) : paths[i], out[i], out[i].size));
  return { name: single ? single.slice(0, -1) : 'Dropped files', files, handles: new Map(), notes: [] };
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

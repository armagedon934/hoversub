// Changes: what is different from the files as opened, the history (undo/redo), restore points,
// and the two ways to get changes out: download a ZIP, or (when the folder was opened with
// permission to save) write back to disk — only after confirmation, with backup copies first.

import { useState } from 'react';
import { Download, FileDiff, History, HardDriveDownload, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react';
import { entryFromBytes, zipParts } from '../../export/zipwriter';
import { countChanges } from '../workspace/diff';
import { DiffView } from './WhatIf';
import { useCode, workspace } from './store';
import { count, tr } from '../i18n';

const enc = new TextEncoder();

function download(name: string, parts: Uint8Array[], type: string) {
  const blob = new Blob(parts as BlobPart[], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

type PermHandle = FileSystemHandle & { requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState> };

async function ensureWrite(h: PermHandle): Promise<boolean> {
  if (!h.requestPermission) return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

async function writeFile(dir: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await (fh as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
  await w.write(text);
  await w.close();
}

export function ChangesView() {
  useCode((s) => s.wsVersion);
  const canWrite = useCode((s) => s.canWriteToDisk);
  const rootDir = useCode((s) => s.rootDir);
  const projectName = useCode((s) => s.projectName);
  const refreshAfterChange = useCode((s) => s.refreshAfterChange);
  const toast = useCode((s) => s.toast);
  const openFile = useCode((s) => s.openFile);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changed = workspace.changedFiles();
  const history = [...workspace.history].reverse();
  const points = [...workspace.restorePoints].reverse();

  const run = async (fn: () => Promise<unknown>, paths: () => string[]) => {
    setBusy(true);
    try {
      const before = paths();
      await fn();
      await refreshAfterChange([...new Set([...before, ...paths()])]);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = () =>
    run(
      async () => {
        const cs = await workspace.undo();
        if (cs) toast('info', `${tr('Undone', 'Отменено')}: ${cs.label}`);
      },
      () => workspace.history.at(-1)?.edits.map((e) => e.path) ?? workspace.redoStack.at(-1)?.edits.map((e) => e.path) ?? [],
    );
  const redo = () =>
    run(
      async () => {
        const cs = await workspace.redo();
        if (cs) toast('info', `${tr('Done again', 'Возвращено')}: ${cs.label}`);
      },
      () => workspace.redoStack.at(-1)?.edits.map((e) => e.path) ?? workspace.history.at(-1)?.edits.map((e) => e.path) ?? [],
    );

  const zipName = (suffix: string) => `${(projectName || 'project').replace(/[^\w.-]+/g, '_')}-${suffix}.zip`;

  const downloadChanged = () => {
    const entries = changed.map((f) => entryFromBytes(f.path, enc.encode(f.current)));
    const { parts } = zipParts(entries);
    download(zipName('changed-files'), parts, 'application/zip');
    toast('success', `${tr('Downloaded', 'Скачано')}: ${count(changed.length, ['changed file', 'changed files'], ['изменённый файл', 'изменённых файла', 'изменённых файлов'])}.`);
  };
  const downloadAll = () => {
    const entries = [...workspace.files.values()].filter((f) => !f.skipped).map((f) => entryFromBytes(f.path, enc.encode(f.current)));
    const { parts } = zipParts(entries);
    download(zipName('workspace'), parts, 'application/zip');
    toast('success', tr('Downloaded the whole workspace (your current version of every text file).', 'Скачана вся рабочая копия (твоя текущая версия каждого текстового файла).'));
  };
  const downloadOriginals = () => {
    const entries = changed.map((f) => entryFromBytes(f.path, enc.encode(f.original)));
    const { parts } = zipParts(entries);
    download(zipName('originals-backup'), parts, 'application/zip');
  };

  const saveToDisk = async () => {
    const root = useCode.getState().handles;
    setBusy(true);
    const written: string[] = [];
    const problems: string[] = [];
    try {
      if (!rootDir) throw new Error(tr('The folder is not available for saving. Use Download instead.', 'Папка недоступна для сохранения. Используй «Скачать».'));
      if (!(await ensureWrite(rootDir as PermHandle))) throw new Error(tr('Permission to save was not given. Nothing was written.', 'Разрешение на сохранение не дано. Ничего не записано.'));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = `.understand-code-backups/${stamp}`;
      for (const f of changed) {
        const h = root.get(f.path);
        if (!h) {
          problems.push(`${f.path}: ${tr('not opened from this folder', 'открыт не из этой папки')}`);
          continue;
        }
        const disk = await (await h.getFile()).text();
        if (disk.replace(/^﻿/, '') !== f.original) {
          problems.push(`${f.path}: ${tr('it was changed outside this app after opening, so it was NOT overwritten', 'его изменили вне программы после открытия, поэтому он НЕ перезаписан')}`);
          continue;
        }
        await writeFile(rootDir, `${backupDir}/${f.path}`, disk);
        const w = await (h as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
        await w.write(f.current);
        await w.close();
        written.push(f.path);
      }
      await workspace.markSaved(written);
      if (written.length) toast('success', `${tr('Saved', 'Сохранено')}: ${count(written.length, ['file', 'files'], ['файл', 'файла', 'файлов'])}. ${tr('Copies of the old versions are in the folder', 'Копии старых версий лежат в папке')} ${backupDir}.`);
      if (problems.length) toast('warning', `${tr('Not saved', 'Не сохранено')}:\n• ${problems.join('\n• ')}`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmSave(false);
    }
  };
  return (
    <div className="chg" data-testid="changes-view">
      <div className="chg-bar">
        <button className="btn" onClick={() => void undo()} disabled={busy || !workspace.canUndo()} data-testid="ws-undo">
          <Undo2 size={15} /> {tr('Undo', 'Отменить')}
        </button>
        <button className="btn" onClick={() => void redo()} disabled={busy || !workspace.canRedo()} data-testid="ws-redo">
          <Redo2 size={15} /> {tr('Redo', 'Вернуть')}
        </button>
        <button
          className="btn"
          onClick={() => {
            workspace.addRestorePoint(tr('Saved by you', 'Сохранено тобой'), [...workspace.files.values()].filter((f) => !f.skipped).map((f) => ({ path: f.path, text: f.current })));
            void workspace.persist();
            useCode.setState({ wsVersion: useCode.getState().wsVersion + 1 });
            toast('success', tr('Restore point saved.', 'Точка восстановления сохранена.'));
          }}
          disabled={busy || !workspace.files.size}
          data-testid="add-restore-point"
        >
          <History size={15} /> {tr('Save a restore point now', 'Сохранить точку восстановления')}
        </button>
        <span className="spacer" />
        <button className="btn" onClick={downloadAll} disabled={!workspace.files.size} data-testid="download-all">
          <Download size={15} /> {tr('Download all files (ZIP)', 'Скачать все файлы (ZIP)')}
        </button>
        <button className="btn" onClick={downloadChanged} disabled={!changed.length} data-testid="download-changed">
          <HardDriveDownload size={15} /> {tr('Download changed files (ZIP)', 'Скачать изменённые файлы (ZIP)')}
        </button>
        {canWrite ? (
          <button className="btn primary" onClick={() => setConfirmSave(true)} disabled={!changed.length || busy} data-testid="save-disk">
            <Save size={15} /> {tr('Save to my folder…', 'Сохранить в мою папку…')}
          </button>
        ) : null}
      </div>
      <p className="chg-note">
        {tr('Your original files have NOT been changed. All edits live in a protected copy inside this app (saved in this browser).', 'Твои исходные файлы НЕ изменены. Все правки хранятся в защищённой копии внутри программы (в этом браузере).')}{' '}
        {canWrite ? tr('You can write them back to your folder with “Save to my folder”, which keeps backup copies first.', 'Записать их в папку можно кнопкой «Сохранить в мою папку» — перед этим сохраняются резервные копии.') : tr('To use them, download the files.', 'Чтобы использовать их, скачай файлы.')}
      </p>

      {confirmSave ? (
        <div className="chg-confirm" role="alertdialog" aria-label={tr('Confirm saving to disk', 'Подтверждение сохранения на диск')}>
          <h3>{tr('Write to your folder', 'Записать в твою папку')}: {count(changed.length, ['file', 'files'], ['файл', 'файла', 'файлов'])}?</h3>
          <ul>
            {changed.map((f) => (
              <li key={f.path}>{f.path}</li>
            ))}
          </ul>
          <p>
            {tr('Before writing, a copy of each current file is saved into a folder called', 'Перед записью копия каждого файла сохраняется в папку')} <code>.understand-code-backups</code>{' '}
            {tr('inside your project. A file that was changed by another program in the meantime is skipped.', 'внутри проекта. Файл, который тем временем изменила другая программа, пропускается.')}
          </p>
          <div className="wi-buttons">
            <button className="btn" onClick={() => setConfirmSave(false)}>
              {tr('Cancel', 'Отмена')}
            </button>
            <button className="btn" onClick={downloadOriginals}>
              <Download size={14} /> {tr('Also download the originals first', 'Сначала скачать оригиналы')}
            </button>
            <button className="btn primary" onClick={() => void saveToDisk()} disabled={busy} data-testid="save-disk-confirm">
              <Save size={14} /> {tr('Yes, write the files', 'Да, записать файлы')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="chg-cols">
        <section>
          <h3>
            <FileDiff size={16} aria-hidden /> {tr('Changed files', 'Изменённые файлы')} ({changed.length})
          </h3>
          {!changed.length ? <p className="muted">{tr('Nothing is changed. Use “What if I change this?” in the explanation panel to try a change safely.', 'Ничего не изменено. Чтобы безопасно попробовать изменение, нажми «А что если изменить?» в панели объяснений.')}</p> : null}
          {changed.map((f) => {
            const c = countChanges(f.original, f.current);
            return (
              <div key={f.path} className="chg-file" data-testid="changed-file">
                <div className="chg-file-head">
                  <button className="linklike" onClick={() => void openFile(f.path)}>
                    {f.path}
                  </button>
                  <span className="chg-count">
                    <span className="plus">+{c.added}</span> <span className="minus">−{c.removed}</span>
                  </span>
                  <button className="btn small" onClick={() => setOpenDiff(openDiff === f.path ? null : f.path)}>
                    {openDiff === f.path ? tr('Hide', 'Скрыть') : tr('Compare', 'Сравнить')}
                  </button>
                  <button className="btn small" onClick={() => void run(() => workspace.revertFile(f.path), () => [f.path])} disabled={busy} data-testid="revert-file">
                    <RotateCcw size={13} /> {tr('Back to original', 'Вернуть оригинал')}
                  </button>
                </div>
                {openDiff === f.path ? <DiffView before={f.original} after={f.current} testId="changes-diff" /> : null}
              </div>
            );
          })}
        </section>
        <section>
          <h3>
            <History size={16} aria-hidden /> {tr('History', 'История')}
          </h3>
          {!history.length && !workspace.redoStack.length ? <p className="muted">{tr('No changes yet.', 'Пока изменений нет.')}</p> : null}
          <ol className="chg-history" data-testid="history">
            {[...workspace.redoStack].map((cs) => (
              <li key={cs.id} className="undone">
                <span className="muted">{time(cs.time)}</span> {cs.label} <span className="tag">{tr('undone — Redo brings it back', 'отменено — «Вернуть» восстановит')}</span>
              </li>
            ))}
            {history.map((cs, i) => (
              <li key={cs.id}>
                <span className="muted">{time(cs.time)}</span> {cs.label} {i === 0 ? <span className="tag">{tr('latest', 'последнее')}</span> : null}
              </li>
            ))}
          </ol>
          <h3>
            <RotateCcw size={16} aria-hidden /> {tr('Restore points', 'Точки восстановления')} ({points.length})
          </h3>
          <p className="muted small">{tr('A restore point is saved automatically before every change. Going back to one is itself a change, so it can be undone too.', 'Точка восстановления сохраняется сама перед каждым изменением. Возврат к ней — тоже изменение, его тоже можно отменить.')}</p>
          <ul className="chg-points" data-testid="restore-points">
            {points.map((rp) => (
              <li key={rp.id}>
                <span className="muted">{time(rp.time)}</span> {rp.label}{' '}
                <span className="muted small">
                  ({count(rp.files.length, ['file', 'files'], ['файл', 'файла', 'файлов'])})
                </span>{' '}
                {confirmRestore === rp.id ? (
                  <>
                    <button
                      className="btn small primary"
                      onClick={() =>
                        void run(async () => {
                          await workspace.restore(rp.id);
                          toast('success', tr('Files restored. You can undo this.', 'Файлы восстановлены. Это тоже можно отменить.'));
                          setConfirmRestore(null);
                        }, () => rp.files.map((f) => f.path))
                      }
                      data-testid="restore-confirm"
                    >
                      {tr('Yes, go back', 'Да, вернуться')}
                    </button>
                    <button className="btn small" onClick={() => setConfirmRestore(null)}>
                      {tr('Cancel', 'Отмена')}
                    </button>
                  </>
                ) : (
                  <button className="btn small" onClick={() => setConfirmRestore(rp.id)} disabled={busy} data-testid="restore-point">
                    {tr('Go back to this point', 'Вернуться к этой точке')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

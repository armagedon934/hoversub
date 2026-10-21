import { useRef } from 'react';
import { CircleHelp, Download, Heart, Redo2, Undo2, Upload } from 'lucide-react';
import { parseSettingsJson } from '../engine/schema';
import { useStore } from '../state/store';

export function TopBar() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const addFavorite = useStore((s) => s.addFavorite);
  const setExportOpen = useStore((s) => s.setExportOpen);
  const setPrefs = useStore((s) => s.setPrefs);
  const applySettings = useStore((s) => s.applySettings);
  const toast = useStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) {
      toast('error', 'That file is too large to be a Material Foundry settings file.');
      return;
    }
    const text = await f.text();
    const r = parseSettingsJson(text);
    if (!r.ok) {
      toast('error', `Could not import “${f.name}”: ${r.error}`);
      return;
    }
    applySettings(r.settings);
    if (r.warnings.length) toast('warning', `Imported “${r.settings.name}” with adjustments:\n• ${r.warnings.slice(0, 5).join('\n• ')}${r.warnings.length > 5 ? `\n• …and ${r.warnings.length - 5} more` : ''}`);
    else toast('success', `Imported “${r.settings.name}”.`);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        Material Foundry
      </div>
      <button className="btn ghost small" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" data-testid="undo">
        <Undo2 size={15} /> Undo
      </button>
      <button className="btn ghost small" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z / Ctrl+Y)" data-testid="redo">
        <Redo2 size={15} /> Redo
      </button>
      <span className="sep" />
      <button className="btn ghost small" onClick={addFavorite} title="Save the current material to Favorites (stored in this browser)" data-testid="save-favorite">
        <Heart size={15} /> Save favorite
      </button>
      <button className="btn ghost small" onClick={() => fileRef.current?.click()} title="Import a Material Foundry settings JSON file" data-testid="import-json">
        <Upload size={15} /> Import settings
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        data-testid="import-input"
        onChange={(e) => {
          void onImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="spacer" />
      <button className="btn ghost small" onClick={() => setPrefs({ showIntro: true })} title="Show the quick workflow guide" data-testid="show-help">
        <CircleHelp size={15} /> Guide
      </button>
      <button className="btn primary" onClick={() => setExportOpen(true)} data-testid="open-export">
        <Download size={15} /> Export
      </button>
    </header>
  );
}

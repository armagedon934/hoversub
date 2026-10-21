import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useGenerationController } from '../state/useGeneration';
import { useStore } from '../state/store';
import { Controls } from './Controls';
import { ExportDialog } from './ExportDialog';
import { Library } from './Library';
import { TopBar } from './TopBar';
import { Viewport } from './Viewport';

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.text}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function App() {
  useGenerationController();
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Small debugging / automation hook (no telemetry; local only).
  useEffect(() => {
    window.__mf = { ...(window.__mf ?? {}), store: useStore };
  }, []);

  return (
    <div className="app">
      <TopBar />
      <Library />
      <Viewport />
      <Controls />
      <ExportDialog />
      <Toasts />
    </div>
  );
}

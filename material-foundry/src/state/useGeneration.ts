// Drives preview generation: whenever settings or working resolution change, superseded jobs are
// cancelled, a quick low-resolution draft is produced, and the full working-resolution material
// follows after a short debounce. Results are only accepted for the current settings version.

import { useEffect } from 'react';
import { CancelledError } from '../engine/fields';
import { generateParallel, JobToken, Priority } from '../worker/client';
import { useStore } from './store';

const DRAFT_SIZE = 256;
const DRAFT_DELAY = 25;
const FULL_DELAY = 220;

export function useGenerationController(): void {
  const version = useStore((s) => s.version);
  const workingRes = useStore((s) => s.prefs.workingRes);

  useEffect(() => {
    const st = useStore.getState();
    const settings = st.settings;
    const v = st.version;
    const tokens: JobToken[] = [];
    const timers: number[] = [];
    const start = (size: number, draft: boolean) => {
      const token = new JobToken();
      tokens.push(token);
      const t0 = performance.now();
      if (!draft) useStore.getState().setGen({ busy: true, stage: 'Generating material fields', fraction: 0, error: null });
      generateParallel(settings, size, {
        priority: Priority.Interactive,
        token,
        onProgress: draft ? undefined : (stage, fraction) => useStore.getState().setGen({ busy: true, stage, fraction }),
      })
        .then((m) => {
          m.timings.wall = performance.now() - t0;
          const accepted = useStore.getState().setMaterial(m, v, draft);
          if (!draft) useStore.getState().setGen({ busy: false, stage: accepted ? 'Ready' : '', fraction: 1, error: null });
        })
        .catch((e: unknown) => {
          if (e instanceof CancelledError || token.cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          useStore.getState().setGen({ busy: false, error: msg });
        });
    };
    const firstRun = !st.material;
    if (workingRes > DRAFT_SIZE) timers.push(window.setTimeout(() => start(DRAFT_SIZE, true), firstRun ? 0 : DRAFT_DELAY));
    timers.push(window.setTimeout(() => start(workingRes, false), firstRun ? 0 : FULL_DELAY));
    return () => {
      timers.forEach((t) => clearTimeout(t));
      tokens.forEach((t) => t.cancel());
    };
  }, [version, workingRes]);
}

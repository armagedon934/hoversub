// Which part of the app is showing: the material studio or the "Understand Code" module.
// Kept in the URL hash (#code) so a reload or bookmark returns to the same place.

import { create } from 'zustand';

export type AppMode = 'materials' | 'code';

const fromHash = (): AppMode => (typeof location !== 'undefined' && location.hash === '#code' ? 'code' : 'materials');

export const useAppMode = create<{ mode: AppMode; setMode: (m: AppMode) => void }>((set) => ({
  mode: fromHash(),
  setMode(mode) {
    set({ mode });
    try {
      history.replaceState(null, '', mode === 'code' ? '#code' : location.pathname + location.search);
    } catch {
      /* ignore */
    }
  },
}));

if (typeof window !== 'undefined') window.addEventListener('hashchange', () => useAppMode.setState({ mode: fromHash() }));

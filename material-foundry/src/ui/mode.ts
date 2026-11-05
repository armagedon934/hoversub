// Which part of the app is showing: the material studio or the "Understand Code" module.
// Kept in the URL hash (#code / #materials) so a reload or bookmark returns to the same place.
// Without a hash the last used part opens; the very first time it is "Understand Code".

import { create } from 'zustand';

export type AppMode = 'materials' | 'code';

const KEY = 'mf.mode';

function initial(): AppMode {
  if (typeof location === 'undefined') return 'materials';
  if (location.hash === '#code') return 'code';
  if (location.hash === '#materials') return 'materials';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'code' || saved === 'materials') return saved;
  } catch {
    /* default */
  }
  return 'code';
}

export const useAppMode = create<{ mode: AppMode; setMode: (m: AppMode) => void }>((set) => ({
  mode: initial(),
  setMode(mode) {
    set({ mode });
    try {
      localStorage.setItem(KEY, mode);
      history.replaceState(null, '', mode === 'code' ? '#code' : '#materials');
    } catch {
      /* ignore */
    }
  },
}));

if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    if (location.hash === '#code' || location.hash === '#materials') useAppMode.setState({ mode: location.hash === '#code' ? 'code' : 'materials' });
  });

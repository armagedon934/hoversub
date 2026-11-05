import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import { applyTheme, isThemeId } from './code/ui/themes';

// The chosen look of the program (Settings → Theme), before the first paint.
try {
  const p = JSON.parse(localStorage.getItem('mf.code.prefs.v1') ?? '{}');
  applyTheme(isThemeId(p.palette) ? p.palette : p.theme === 'light' ? 'paper' : 'graphite');
} catch {
  applyTheme('graphite');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

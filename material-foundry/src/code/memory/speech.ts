// Reading text aloud with the voices built into the system (no internet). Helpful when reading
// long explanations is tiring.

import { getLocale } from '../i18n';

let rate = 1;
try {
  const r = Number(localStorage.getItem('mf.speech.rate'));
  if (r >= 0.5 && r <= 2) rate = r;
} catch {
  /* default */
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getRate(): number {
  return rate;
}

export function setRate(r: number): void {
  rate = Math.min(2, Math.max(0.5, r));
  try {
    localStorage.setItem('mf.speech.rate', String(rate));
  } catch {
    /* ignore */
  }
}

export function speak(text: string): void {
  if (!speechAvailable()) return;
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[`*_#]/g, ''));
  const lang = getLocale() === 'ru' ? 'ru' : 'en';
  const voice = s.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) u.voice = voice;
  u.lang = lang === 'ru' ? 'ru-RU' : 'en-US';
  u.rate = rate;
  s.speak(u);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}

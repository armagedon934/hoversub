// Draws the effects of fx.ts above everything: sparks, floating XP, the streak chip, confetti and the
// two big cards (lesson done, new district). See fx.ts for what each effect means.

import { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n';
import { fx, useFx, type LessonFx, type UnlockFx } from './fx';
import { playUi } from './uiSound';
import { useCode } from './store';
import './fx.css';

const SPARKS = 14;

function Bursts() {
  const bursts = useFx((s) => s.bursts);
  return (
    <>
      {bursts.map((b) => (
        <span key={b.id} className={`fx-burst ${b.kind}`} style={{ left: b.x, top: b.y }} aria-hidden>
          {Array.from({ length: b.kind === 'big' ? SPARKS * 2 : SPARKS }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${(360 / (b.kind === 'big' ? SPARKS * 2 : SPARKS)) * i + (i % 2) * 9}deg`, ['--d' as string]: `${(b.kind === 'big' ? 70 : 38) + (i % 3) * 12}px` }} />
          ))}
          <b>✓</b>
        </span>
      ))}
    </>
  );
}

function Floaters() {
  const floaters = useFx((s) => s.floaters);
  return (
    <>
      {floaters.map((f) => (
        <span key={f.id} className="fx-float" style={{ left: f.x, top: f.y }} aria-hidden>
          {f.text}
        </span>
      ))}
    </>
  );
}

function Combo() {
  const n = useFx((s) => s.comboShown);
  if (!n) return null;
  return (
    <div className="fx-combo" role="status" data-testid="fx-combo">
      🔥 {tr(`Streak ×${n} — you are in the flow!`, `Серия ×${n} — ты в потоке!`)}
    </div>
  );
}

/** Confetti on a canvas: falls from the top, spins, fades. */
function Confetti() {
  const n = useFx((s) => s.confetti);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!n) return;
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const w = (c.width = window.innerWidth);
    const h = (c.height = window.innerHeight);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#7aa2ff';
    const colors = [accent, '#ffd166', '#06d6a0', '#ef476f', '#8ecae6', '#ffffff'];
    const parts = Array.from({ length: 170 }, (_, i) => ({
      x: (i / 170) * w + Math.random() * 40 - 20,
      y: -20 - Math.random() * h * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 5 + Math.random() * 6,
      c: colors[i % colors.length],
    }));
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const age = (t - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, Math.min(1, 3.2 - age));
      for (const p of parts) {
        p.vy += 0.05;
        p.vx *= 0.99;
        p.x += p.vx + Math.sin(age * 3 + p.r) * 0.6;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (age < 3.3) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <canvas ref={ref} className="fx-confetti" aria-hidden />;
}

/** Counts up to the number (the XP of a lesson). */
function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (useCode.getState().prefs.fx !== 'full') {
      setV(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setV(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v}</>;
}

function LessonCard({ d, close }: { d: LessonFx; close: () => void }) {
  const go = () => {
    close();
    d.next?.go();
  };
  return (
    <div className="fx-card lesson" role="dialog" aria-modal="true" aria-label={tr('Lesson complete', 'Урок пройден')} data-testid="fx-lesson">
      <div className="fx-stamp" aria-hidden>
        <span className="fx-stamp-icon">{d.icon}</span>
        <span className="fx-stamp-text">{tr('DONE', 'ПРОЙДЕНО')}</span>
      </div>
      <h2>{d.title}</h2>
      {d.stars ? (
        <div className="fx-stars" aria-label={tr(`${d.stars} stars`, `${d.stars} звезды`)}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= d.stars! ? 'on' : ''} style={{ animationDelay: `${0.25 + i * 0.18}s` }}>
              ★
            </span>
          ))}
        </div>
      ) : null}
      {d.xp ? (
        <div className="fx-xp">
          +<CountUp to={d.xp} /> XP
        </div>
      ) : null}
      {d.anchor ? (
        <div className="fx-anchor" data-testid="fx-anchor">
          <span className="fx-anchor-label">🧠 {tr('Remember in one sentence', 'Запомни одной фразой')}</span>
          <b>{d.anchor}</b>
          {d.moment ? (
            <span className="fx-moment">
              😄 {tr('You will remember it by: ', 'Как запомнишь: ')}
              {d.moment}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="fx-actions">
        {d.next ? (
          <button className="btn big primary" onClick={go} autoFocus data-testid="fx-next">
            {d.next.label} ▶
          </button>
        ) : null}
        <button className={`btn big${d.next ? '' : ' primary'}`} onClick={close} autoFocus={!d.next} data-testid="fx-close">
          {d.next ? tr('Stay here', 'Остаться здесь') : tr('Great!', 'Отлично!')}
        </button>
      </div>
    </div>
  );
}

function UnlockCard({ d, close }: { d: UnlockFx; close: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => playUi('success'), 650);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fx-card unlock" role="dialog" aria-modal="true" aria-label={tr('New district open', 'Новый район открыт')} data-testid="fx-unlock">
      <div className="fx-lock" aria-hidden>
        <span className="fx-lock-l">🔒</span>
        <span className="fx-lock-icon">{d.icon}</span>
      </div>
      <span className="fx-unlock-kicker">{tr('NEW DISTRICT OPEN', 'НОВЫЙ РАЙОН ОТКРЫТ')}</span>
      <h2 className="fx-unlock-name">{d.name}</h2>
      {d.why ? <p className="fx-unlock-why">{d.why}</p> : null}
      <div className="fx-actions">
        {d.go ? (
          <button
            className="btn big primary"
            autoFocus
            onClick={() => {
              close();
              d.go!();
            }}
            data-testid="fx-unlock-go"
          >
            {tr("Let's go", 'Поехали')} ▶
          </button>
        ) : null}
        <button className="btn big" onClick={close} data-testid="fx-unlock-close">
          {tr('Later', 'Позже')}
        </button>
      </div>
    </div>
  );
}

export function FxLayer() {
  const overlays = useFx((s) => s.overlays);
  const level = useCode((s) => s.prefs.fx);
  const top = overlays[0];
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fx.close(top.id);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top]);
  return (
    <div className={`fx-layer fx-${level}`}>
      <Confetti />
      <Bursts />
      <Floaters />
      <Combo />
      {top ? (
        <div className="fx-backdrop" onMouseDown={(e) => e.target === e.currentTarget && fx.close(top.id)}>
          {top.kind === 'lesson' ? <LessonCard key={top.id} d={top.data} close={() => fx.close(top.id)} /> : <UnlockCard key={top.id} d={top.data} close={() => fx.close(top.id)} />}
        </div>
      ) : null}
    </div>
  );
}

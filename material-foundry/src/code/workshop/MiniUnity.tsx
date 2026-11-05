// Mini-Unity — write a real Unity-style C# script and watch it drive a tiny 2D game right here.
// Levels teach one Unity idea each (Start, Update, Input, Time.deltaTime, triggers, physics,
// Instantiate…). The script runs in the safe interpreter, frame by frame; the Inspector shows
// the script's public fields and the Console shows Debug.Log — like the real editor.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, Lightbulb, Play, RotateCcw, Square } from 'lucide-react';
import { create } from 'zustand';
import { getLocale, pick, tr } from '../i18n';
import { errorText, explainError } from '../run/errors';
import { LEVELS, asLevel, sandboxLevel } from '../run/levels';
import { PROJECT, PROJECT_IDS } from '../run/project';

const ALL_LEVELS = [...LEVELS, ...PROJECT];
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { UnityWorld, type FrameResult, type GameObj, type Level } from '../run/unity';
import { useLearn } from '../learn/progress';
import { useResume } from '../memory/resume';
import { useCode } from '../ui/store';
import { createEditor, type WorkshopEditor } from './editor';
import { useWorkshop } from './store';
import { ReaderModal } from '../learn/CodeReader';
import { parseCSharp, syntaxProblems } from '../run/runner';

// ------------------------------------------------------------------------------------ progress

const KEY = 'mf.unity.v1';
interface UnityProgress {
  done: string[];
  code: Record<string, string>;
  levelId: string;
}
function loadProgress(): UnityProgress {
  const d: UnityProgress = { done: [], code: {}, levelId: LEVELS[0].id };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (Array.isArray(raw.done)) d.done = raw.done.filter((x: unknown) => typeof x === 'string');
    if (raw.code && typeof raw.code === 'object') d.code = raw.code;
    if (typeof raw.levelId === 'string') d.levelId = raw.levelId;
  } catch {
    /* defaults */
  }
  return d;
}
export const useUnityProgress = create<UnityProgress & { set: (p: Partial<UnityProgress>) => void }>((set, get) => ({
  ...loadProgress(),
  set(p) {
    set(p);
    const { done, code, levelId } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ done, code, levelId }));
    } catch {
      /* ignore */
    }
  },
}));

// ------------------------------------------------------------------------------------ drawing

const COLORS = { sky: '#1b2638', skyLight: '#dfeaf7', grid: 'rgba(255,255,255,0.04)' };

function drawObj(ctx: CanvasRenderingContext2D, o: GameObj, s: number, H: number, t: number) {
  const x = o.x * s;
  const y = H - o.y * s;
  const w = o.w * s;
  const h = o.h * s;
  if (o.hidden || o.sprite === 'point' || o.sprite === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  // Unity rotation is counter-clockwise; the canvas y axis points down.
  if (o.rot) ctx.rotate((-o.rot * Math.PI) / 180);
  const mx = ((o.sx ?? 1) < 0 ? -1 : 1) * (o.flipX ? -1 : 1);
  const my = (o.sy ?? 1) < 0 ? -1 : 1;
  if (mx !== 1 || my !== 1) ctx.scale(mx, my);
  switch (o.sprite) {
    case 'hero': {
      ctx.fillStyle = '#4f9cff';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.25);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-w * 0.15, -h * 0.12, w * 0.12, 0, Math.PI * 2);
      ctx.arc(w * 0.18, -h * 0.12, w * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10213a';
      ctx.beginPath();
      ctx.arc(-w * 0.12, -h * 0.1, w * 0.06, 0, Math.PI * 2);
      ctx.arc(w * 0.21, -h * 0.1, w * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'coin': {
      const sx = Math.abs(Math.cos(t * 3 + o.id));
      ctx.scale(Math.max(0.25, sx), 1);
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c98f00';
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.stroke();
      break;
    }
    case 'wall': {
      ctx.fillStyle = '#7a5a45';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.stroke();
      break;
    }
    case 'platform': {
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(-w / 2, -h / 2, w, Math.min(h, s * 0.18));
      break;
    }
    case 'enemy': {
      ctx.fillStyle = '#e5484d';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.05, w / 2, h / 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-w * 0.15, -h * 0.05, w * 0.1, 0, Math.PI * 2);
      ctx.arc(w * 0.15, -h * 0.05, w * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(-w * 0.2, -h * 0.05, w * 0.1, w * 0.06);
      ctx.fillRect(w * 0.1, -h * 0.05, w * 0.1, w * 0.06);
      break;
    }
    case 'flag': {
      ctx.fillStyle = '#ddd';
      ctx.fillRect(-w * 0.05, -h / 2, w * 0.08, h);
      ctx.fillStyle = '#3ecf8e';
      ctx.beginPath();
      ctx.moveTo(w * 0.03, -h / 2);
      ctx.lineTo(w * 0.5, -h * 0.3);
      ctx.lineTo(w * 0.03, -h * 0.1);
      ctx.fill();
      break;
    }
    case 'bullet': {
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2, w / 2), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.fillStyle = '#ff5c8a';
      ctx.font = `${h}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', 0, 0);
      break;
    }
  }
  ctx.restore();
}

function draw(canvas: HTMLCanvasElement, w: UnityWorld, light: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const L = w.level;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const s = cssW / L.width;
  const cssH = s * L.height;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = light ? COLORS.skyLight : COLORS.sky;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.05)' : COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 1; x < L.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, cssH);
    ctx.stroke();
  }
  for (let y = 1; y < L.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * s);
    ctx.lineTo(cssW, y * s);
    ctx.stroke();
  }
  for (const o of w.objects) if (o.alive && o !== w.player) drawObj(ctx, o, s, cssH, w.time);
  if (w.player.alive) drawObj(ctx, w.player, s, cssH, w.time);
  // Debug.DrawRay / DrawLine (visible like in the Scene view).
  for (const r of w.rays) {
    ctx.strokeStyle = { red: '#ff4d4f', green: '#3ecf8e', blue: '#4f9cff', yellow: '#ffcc33', white: '#ffffff', cyan: '#22d3ee', magenta: '#e879f9' }[r.color] ?? '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x1 * s, cssH - r.y1 * s);
    ctx.lineTo(r.x2 * s, cssH - r.y2 * s);
    ctx.stroke();
  }
  // UI: texts and sliders from the script (scoreText.text = …, slider.value = …).
  let uy = Math.max(30, s * 0.8);
  for (const u of w.ui) {
    if (u.slider) {
      const bw = Math.min(200, cssW * 0.3);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(cssW - bw - 12, uy - 12, bw, 14);
      ctx.fillStyle = '#3ecf8e';
      ctx.fillRect(cssW - bw - 12, uy - 12, (bw * Math.max(0, Math.min(1, u.slider.value / (u.slider.max || 1)))), 14);
    } else if (u.text) {
      ctx.font = `bold ${Math.max(13, s * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = light ? '#1f2124' : '#ffffff';
      ctx.fillText(u.text, cssW - 12, uy);
      ctx.textAlign = 'left';
    }
    uy += Math.max(20, s * 0.55);
  }
  if (w.timeScale === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(16, s * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Time.timeScale = 0', cssW / 2, cssH / 2);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = light ? '#334' : '#cbd5e1';
  ctx.font = `${Math.max(11, s * 0.28)}px ui-monospace, monospace`;
  ctx.fillText(`x ${w.player.x.toFixed(2)}  y ${w.player.y.toFixed(2)}  t ${w.time.toFixed(1)}s`, 8, Math.max(14, s * 0.35));
}

const KEY_NAMES: Record<string, string> = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ' ': ' ', Spacebar: ' ', Enter: 'Enter', Escape: 'Escape', Control: 'Control', Shift: 'Shift', Tab: 'Tab' };
function keyOf(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (KEY_NAMES[e.key]) return KEY_NAMES[e.key];
  if (/^[a-zA-Z0-9]$/.test(e.key)) return e.key.toLowerCase();
  return null;
}

// ------------------------------------------------------------------------------------ main

type Phase = 'edit' | 'playing' | 'won' | 'lost' | 'error';

export function MiniUnity() {
  const prog = useUnityProgress();
  const theme = useCode((s) => s.prefs.theme);
  const addXp = useLearn((s) => s.addXp);
  const mark = useResume((s) => s.mark);
  const locale = getLocale();
  const [sandbox, setSandbox] = useState<Level | null>(null);
  const level: Level = useMemo(() => sandbox ?? asLevel(ALL_LEVELS.find((l) => l.id === prog.levelId) ?? LEVELS[0], locale), [sandbox, prog.levelId, locale]);
  const track = PROJECT_IDS.has(prog.levelId) ? PROJECT : LEVELS;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<WorkshopEditor | null>(null);
  const worldRef = useRef<UnityWorld | null>(null);
  const codeRef = useRef('');
  const [phase, setPhase] = useState<Phase>('edit');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<{ line: number; message: string } | null>(null);
  const [logs, setLogs] = useState<{ time: number; text: string }[]>([]);
  const [insp, setInsp] = useState<{ name: string; value: string }[]>([]);
  const [hint, setHint] = useState(false);
  const [tries, setTries] = useState(0);
  const [reading, setReading] = useState(false);
  const raf = useRef(0);

  ensureMainThreadTreeSitter();

  // A script sent from the Workshop opens in the sandbox.
  useEffect(() => {
    const p = useWorkshop.getState().takeUnity();
    if (p) setSandbox(sandboxLevel(p.code, p.name));
  }, []);

  const initialCode = useMemo(() => (sandbox ? sandbox.starter : (prog.code[level.id] ?? level.starter)), [sandbox, level, prog.code]);

  // Editor for the script.
  useEffect(() => {
    if (!hostRef.current) return;
    codeRef.current = initialCode;
    const ed = createEditor(hostRef.current, {
      doc: initialCode,
      lang: 'cs',
      fileName: () => `${/class\s+(\w+)/.exec(codeRef.current)?.[1] ?? 'Hero'}.cs`,
      syntax: async (text) => syntaxProblems(await parseCSharp(text), text).map((p) => ({ line: p.line, col: p.col, message: p.message })),
      onChange: (t) => {
        codeRef.current = t;
        if (!sandbox) useUnityProgress.getState().set({ code: { ...useUnityProgress.getState().code, [level.id]: t } });
      },
      onCursor: () => {},
      onPredictions: () => {},
      onProblems: () => {},
      onRun: () => void play(),
      ghost: useWorkshop.getState().ghost,
    });
    edRef.current = ed;
    return () => {
      ed.destroy();
      edRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id, sandbox]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const showStill = useCallback(() => {
    const w = new UnityWorld(level);
    worldRef.current = w;
    if (canvasRef.current) draw(canvasRef.current, w, theme === 'light');
  }, [level, theme]);

  useEffect(() => {
    stop();
    setPhase('edit');
    setLogs([]);
    setInsp([]);
    setErr(null);
    setHint(false);
    setTries(0);
    showStill();
    if (level.id !== 'sandbox') mark({ kind: 'level', id: level.id, title: pick(level.title) });
    return stop;
  }, [level, showStill, stop, mark]);

  useEffect(() => {
    const onResize = () => worldRef.current && canvasRef.current && draw(canvasRef.current, worldRef.current, theme === 'light');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [theme]);

  const play = useCallback(async () => {
    stop();
    setErr(null);
    setMessage('');
    setLogs([]);
    const w = new UnityWorld(level);
    worldRef.current = w;
    const problems = await w.load(codeRef.current);
    if (problems) {
      setPhase('error');
      setErr({ line: problems[0].line, message: problems.map((p) => p.message).join('\n') });
      setTries((t) => t + 1);
      return;
    }
    setPhase('playing');
    // Local automation hook for the browser tests (nothing leaves the page).
    const hook = window as unknown as { __mf?: Record<string, unknown> };
    hook.__mf = { ...(hook.__mf ?? {}), unityWorld: w };
    canvasRef.current?.parentElement?.focus();
    let last = performance.now();
    let acc = 0;
    let n = 0;
    const loop = (now: number) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      let r: FrameResult = { status: 'playing' };
      while (acc >= w.dt && r.status === 'playing') {
        r = w.frame();
        acc -= w.dt;
      }
      if (canvasRef.current) draw(canvasRef.current, w, theme === 'light');
      if (++n % 6 === 0 || r.status !== 'playing') {
        setLogs([...w.logs.slice(-60)]);
        setInsp([...w.inspector(), ...Object.entries(w.anim).map(([k, v]) => ({ name: `Animator · ${k}`, value: v }))]);
      }
      if (r.status === 'playing') {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      raf.current = 0;
      setPhase(r.status as Phase);
      setMessage(r.message ?? '');
      if (r.status === 'error') {
        setErr({ line: r.error?.line ?? -1, message: r.message ?? '' });
        setTries((t) => t + 1);
      }
      if (r.status === 'lost') setTries((t) => t + 1);
      if (r.status === 'won' && !sandbox) {
        const p = useUnityProgress.getState();
        if (!p.done.includes(level.id)) {
          p.set({ done: [...p.done, level.id] });
          addXp(25);
        }
      }
    };
    raf.current = requestAnimationFrame(loop);
  }, [level, stop, theme, sandbox, addXp]);

  const restart = () => {
    stop();
    setPhase('edit');
    setMessage('');
    setErr(null);
    showStill();
  };

  const keyDown = (e: React.KeyboardEvent) => {
    const k = keyOf(e);
    const w = worldRef.current;
    if (!k || !w || phase !== 'playing') return;
    e.preventDefault();
    if (!w.keys.has(k)) w.pressed.add(k);
    w.keys.add(k);
  };
  const keyUp = (e: React.KeyboardEvent) => {
    const k = keyOf(e);
    const w = worldRef.current;
    if (!k || !w) return;
    w.keys.delete(k);
    w.released.add(k);
  };
  const touch = (k: string, down: boolean) => {
    const w = worldRef.current;
    if (!w) return;
    if (down) {
      if (!w.keys.has(k)) w.pressed.add(k);
      w.keys.add(k);
    } else {
      w.keys.delete(k);
      w.released.add(k);
    }
  };

  const goLine = (line: number) => {
    const v = edRef.current?.view;
    if (!v || line < 0) return;
    const l = v.state.doc.line(Math.min(line + 1, v.state.doc.lines));
    v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    v.focus();
  };

  const showSolution = () => {
    if (!confirm(tr('Show the solution? Try a bit more first — it is OK to make mistakes.', 'Показать решение? Сначала попробуй ещё немного — ошибаться нормально.'))) return;
    edRef.current?.setText(level.solution);
  };

  const info = err ? explainError(err.message) : null;
  const done = new Set(prog.done);
  const goal = level.goal;
  const goalText =
    goal.type === 'reach'
      ? tr('Goal: reach the flag', 'Цель: дойти до флага')
      : goal.type === 'collect'
        ? tr('Goal: collect all coins', 'Цель: собрать все монеты')
        : goal.type === 'destroyAll'
          ? tr('Goal: destroy all enemies', 'Цель: уничтожить всех врагов')
          : goal.type === 'log'
            ? tr(`Goal: the Console shows "${goal.text}"`, `Цель: в консоли появится «${goal.text}»`)
            : goal.type === 'field'
              ? tr(`Goal: ${goal.field} becomes ${goal.value}`, `Цель: ${goal.field} станет ${goal.value}`)
              : tr('Free play', 'Свободная игра');

  return (
    <div className="mu" data-testid="mini-unity">
      <div className="mu-tracks" role="tablist" aria-label={tr('What to play', 'Что проходить')}>
        <button role="tab" aria-selected={track === LEVELS} className={track === LEVELS && !sandbox ? 'on' : ''} onClick={() => { setSandbox(null); prog.set({ levelId: LEVELS.find((l) => !done.has(l.id))?.id ?? LEVELS[0].id }); }} data-testid="mu-track-levels">
          🕹 {tr('Levels', 'Уровни')} <span className="muted small">{LEVELS.filter((l) => done.has(l.id)).length}/{LEVELS.length}</span>
        </button>
        <button role="tab" aria-selected={track === PROJECT} className={track === PROJECT && !sandbox ? 'on' : ''} onClick={() => { setSandbox(null); prog.set({ levelId: PROJECT.find((l) => !done.has(l.id))?.id ?? PROJECT[0].id }); }} data-testid="mu-track-project">
          🏗 {tr('Project: your own platformer', 'Проект: свой платформер')} <span className="muted small">{PROJECT.filter((l) => done.has(l.id)).length}/{PROJECT.length}</span>
        </button>
      </div>
      <div className="mu-levels" role="list" aria-label={tr('Levels', 'Уровни')}>
        {track.map((l, i) => (
          <button
            key={l.id}
            role="listitem"
            className={`mu-level${!sandbox && l.id === level.id ? ' on' : ''}${done.has(l.id) ? ' done' : ''}`}
            onClick={() => {
              setSandbox(null);
              prog.set({ levelId: l.id });
            }}
            data-testid={`mu-level-${l.id}`}
            title={pick(l.title)}
          >
            <span aria-hidden>{done.has(l.id) ? '✅' : l.icon}</span> {i + 1}
            {!sandbox && l.id === level.id ? `. ${pick(l.title)}` : ''}
          </button>
        ))}
        {sandbox ? (
          <button className="mu-level on" data-testid="mu-level-sandbox">
            🧪 {pick(sandbox.title)}
          </button>
        ) : null}
        <span className="mu-count muted small">
          {track.filter((l) => done.has(l.id)).length}/{track.length} {tr('done', 'пройдено')}
        </span>
      </div>

      <div className="mu-main">
        <section className="mu-left">
          <div className="mu-task" data-testid="mu-task">
            <h3>
              {level.icon} {pick(level.title)}
            </h3>
            <p className="mu-goal">🎯 {pick(level.task)}</p>
            <p className="muted small">{goalText}</p>
            <p className="mu-learn">
              <b>{tr('New idea:', 'Новая идея:')}</b> {pick(level.learn)}
            </p>
            {hint ? (
              <p className="mu-hint" data-testid="mu-hint">
                💡 {pick(level.hint)}
              </p>
            ) : (
              <button className="btn small ghost" onClick={() => setHint(true)} data-testid="mu-show-hint">
                <Lightbulb size={14} /> {tr('Hint', 'Подсказка')}
              </button>
            )}
            {!sandbox && tries >= 2 ? (
              <button className="btn small ghost" onClick={showSolution} data-testid="mu-solution">
                <Eye size={14} /> {tr('Show the solution', 'Показать решение')}
              </button>
            ) : null}
          </div>
          <button className="btn small mu-read" onClick={() => setReading(true)} data-testid="mu-read">
            📖 {tr('Read the code simply', 'Читать код по-простому')}
          </button>
          <div className="mu-editor" ref={hostRef} data-testid="mu-editor" />
          {reading ? <ReaderModal code={codeRef.current} title={pick(level.title)} problems={err && err.line >= 0 ? [{ line: err.line, severity: 'error', message: err.message }] : []} onClose={() => setReading(false)} /> : null}
        </section>

        <section className="mu-right">
          <div className="mu-controls">
            <button className="btn primary big" onClick={() => void play()} data-testid="mu-play">
              <Play size={17} /> {phase === 'playing' ? tr('Restart with my code', 'Перезапустить с моим кодом') : tr('Play', 'Играть')}
            </button>
            <button className="btn" onClick={restart} disabled={phase === 'edit'} data-testid="mu-stop">
              {phase === 'playing' ? <Square size={15} /> : <RotateCcw size={15} />} {phase === 'playing' ? tr('Stop', 'Стоп') : tr('Reset', 'Сначала')}
            </button>
            <span className={`mu-phase ph-${phase}`} data-testid="mu-phase">
              {phase === 'edit' ? tr('Editing', 'Редактирование') : phase === 'playing' ? tr('▶ Playing — use the keys', '▶ Игра идёт — жми клавиши') : phase === 'won' ? tr('🏆 Level complete!', '🏆 Уровень пройден!') : phase === 'lost' ? tr('💥 Try again', '💥 Попробуй ещё') : tr('⚠ Error', '⚠ Ошибка')}
            </span>
          </div>
          <div className="mu-stage" tabIndex={0} onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => worldRef.current?.keys.clear()} aria-label={tr('Game. Click here and use the arrow keys and Space.', 'Игра. Нажми сюда и используй стрелки и пробел.')} data-testid="mu-stage">
            <canvas
              ref={canvasRef}
              className="mu-canvas"
              onPointerMove={(e) => {
                const w = worldRef.current;
                const c = canvasRef.current;
                if (!w || !c) return;
                const r = c.getBoundingClientRect();
                const sc = r.width / w.level.width;
                w.mouse = { x: (e.clientX - r.left) / sc, y: (r.bottom - e.clientY) / sc };
              }}
              onPointerDown={(e) => {
                const w = worldRef.current;
                if (!w || phase !== 'playing') return;
                const b = e.button === 2 ? 1 : e.button === 1 ? 2 : 0;
                w.mouseDown.add(b);
                w.mousePressed.add(b);
              }}
              onPointerUp={(e) => {
                const w = worldRef.current;
                if (!w) return;
                const b = e.button === 2 ? 1 : e.button === 1 ? 2 : 0;
                w.mouseDown.delete(b);
                w.mouseReleased.add(b);
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
            {phase === 'won' ? (
              <div className="mu-overlay won" data-testid="mu-won">
                <b>🏆 {message}</b>
                {!sandbox ? <span>+25 XP</span> : null}
                {!sandbox && track.findIndex((l) => l.id === level.id) < track.length - 1 ? (
                  <button className="btn primary" onClick={() => prog.set({ levelId: track[track.findIndex((l) => l.id === level.id) + 1].id })} data-testid="mu-next">
                    {track === PROJECT ? tr('Next step →', 'Следующий шаг →') : tr('Next level →', 'Следующий уровень →')}
                  </button>
                ) : null}
              </div>
            ) : phase === 'lost' ? (
              <div className="mu-overlay lost">
                <b>{message}</b>
                <button className="btn primary" onClick={() => void play()}>
                  <RotateCcw size={15} /> {tr('Again', 'Ещё раз')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="mu-touch" aria-hidden>
            {[
              ['ArrowLeft', <ArrowLeft key="l" size={18} />],
              ['ArrowUp', <ArrowUp key="u" size={18} />],
              ['ArrowDown', <ArrowDown key="d" size={18} />],
              ['ArrowRight', <ArrowRight key="r" size={18} />],
              [' ', tr('Space', 'Пробел')],
            ].map(([k, label]) => (
              <button key={k as string} className="btn" onPointerDown={() => touch(k as string, true)} onPointerUp={() => touch(k as string, false)} onPointerLeave={() => touch(k as string, false)} tabIndex={-1}>
                {label}
              </button>
            ))}
          </div>
          {err ? (
            <div className="ws-errcard" data-testid="mu-error">
              <div className="ws-err-title">
                ⚠ {info ? errorText(info).title : tr('The script stopped', 'Скрипт остановился')}
                {err.line >= 0 ? (
                  <button className="link" onClick={() => goLine(err.line)}>
                    {tr('line', 'строка')} {err.line + 1}
                  </button>
                ) : null}
              </div>
              <p className="ws-err-msg">{err.message}</p>
              {info ? (
                <p>
                  <b>{tr('How to fix:', 'Как исправить:')}</b> {errorText(info).fix}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mu-panels">
            <div className="mu-panel" data-testid="mu-inspector">
              <h4>Inspector</h4>
              {insp.length ? (
                insp.map((f) => (
                  <div key={f.name} className="mu-field">
                    <span>{f.name}</span>
                    <b>{f.value}</b>
                  </div>
                ))
              ) : (
                <p className="muted small">{tr('Fields of the script appear here while playing.', 'Поля скрипта появятся здесь во время игры.')}</p>
              )}
            </div>
            <div className="mu-panel" data-testid="mu-console">
              <h4>Console</h4>
              {logs.length ? (
                <div className="mu-logs">
                  {logs.map((l, i) => (
                    <div key={i}>
                      <span className="muted">[{l.time.toFixed(1)}s]</span> {l.text}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">{tr('Debug.Log messages appear here.', 'Здесь появятся сообщения Debug.Log.')}</p>
              )}
            </div>
          </div>
          {phase === 'won' && !sandbox ? (
            <p className="mu-unity-tip small">
              <Check size={14} /> {tr('This exact script also works in the real Unity: create a C# script with the same class name and put it on an object.', 'Этот же скрипт работает и в настоящей Unity: создай C#-скрипт с таким же именем класса и повесь на объект.')}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

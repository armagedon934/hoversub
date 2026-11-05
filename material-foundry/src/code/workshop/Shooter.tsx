// "Shooter from zero" — the campaign screen. Left: a short radio briefing and the script with a
// few blanks. Right: the 3D game the script drives. The learner "repairs a soldier's suit": every
// mission brings back one system (comms, legs, eyes, weapon…) and ends with a real match against
// bots. Free play opens the whole finished game with every script editable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUi } from '../ui/uiSound';
import { Crosshair, Eye, Lightbulb, Play, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react';
import { pick, tr, type Text2 } from '../i18n';
import { errorText, explainError } from '../run/errors';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { parseCSharp, syntaxProblems } from '../run/runner';
import { answerOf, blankLines, checkGoals, openBlanks, starterOf, type Mission, type MissionRun } from '../run/shooter';
import { World3D, type DemoStep3 } from '../run/unity3d';
import { useLearn } from '../learn/progress';
import { ReaderModal } from '../learn/ReaderView';
import { speak } from '../memory/speech';
import { useResume } from '../memory/resume';
import { lockedClick, usePathLock } from '../learn/LearningPath';
import { fx } from '../ui/fx';
import { blankHighlighter, createEditor, jumpToBlank, type WorkshopEditor } from './editor';
import { useWorkshop } from './store';
import { Scene3D } from './Scene3D';
import { engineHum, setSfx, sfx, sfxOn } from './sfx';
import { applySavedMaterials, BotBrainPanel, LiveInspector, MaterialPanel, SpectatorBar, VisionLabels } from './GamePanels';
import { materialChoices } from './gameMaterials';
import type { VisionLabel } from './Scene3D';
import { MODELS, RACING, SHOOTER, type Campaign } from './campaigns';

// ------------------------------------------------------------------------------------ input

/** Physical keys (works with any keyboard layout, e.g. Russian): KeyW → "w". */
function keyOf(e: KeyboardEvent): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (c === 'Space') return ' ';
  if (c === 'ShiftLeft' || c === 'ShiftRight') return 'Shift';
  if (c === 'ControlLeft' || c === 'ControlRight') return 'Control';
  if (c.startsWith('Arrow') || c === 'Enter' || c === 'Tab') return c;
  return null;
}

const KEY_LABEL: Record<string, Text2> = {
  W: { en: 'W — forward / gas', ru: 'W — вперёд / газ' },
  'A/D': { en: 'A/D — steer', ru: 'A/D — руль' },
  S: { en: 'S — brake', ru: 'S — тормоз' },
  WASD: { en: 'WASD — walk', ru: 'WASD — ходить' },
  mouse: { en: 'Mouse — look', ru: 'Мышь — смотреть' },
  LMB: { en: 'Left click — shoot', ru: 'ЛКМ — выстрел' },
  'LMB (hold)': { en: 'Hold left click — burst', ru: 'Зажми ЛКМ — очередь' },
  R: { en: 'R — reload', ru: 'R — перезарядка' },
  Space: { en: 'Space — jump', ru: 'Пробел — прыжок' },
  Shift: { en: 'Shift — sprint', ru: 'Shift — бег' },
  C: { en: 'C — crouch', ru: 'C — присесть' },
  Q: { en: 'Q — lean left', ru: 'Q — наклон влево' },
  E: { en: 'E — lean right', ru: 'E — наклон вправо' },
  '1': { en: '1 — rifle', ru: '1 — автомат' },
  '2': { en: '2 — sniper', ru: '2 — снайперка' },
};

type Phase = 'edit' | 'playing' | 'won' | 'lost' | 'error';

interface Hud {
  health: number;
  maxHealth: number;
  ui: { name: string; text: string }[];
  radio: { time: number; text: string }[];
  goals: boolean[];
  callsign: string;
  hitAt: number;
  killAt: number;
  hurtAt: number;
  time: number;
  redLeft: number;
  speed: number;
}

const EMPTY_HUD: Hud = { health: 100, maxHealth: 100, ui: [], radio: [], goals: [], callsign: '', hitAt: -10, killAt: -10, hurtAt: -10, time: 0, redLeft: 0, speed: 0 };

// ------------------------------------------------------------------------------------ screen

/** The screen of a 3D campaign: missions on top, code on the left, the game on the right. */
export function Campaign3D({ c }: { c: Campaign }) {
  const useShooter = c.store;
  const MISSIONS = c.missions;
  const CHAPTERS = c.chapters;
  const prog = useShooter();
  const addXp = useLearn((s) => s.addXp);
  const mark = useResume((s) => s.mark);
  const free = prog.current === 'free';
  const mission: Mission | null = free ? null : (MISSIONS.find((m) => m.id === prog.current) ?? MISSIONS[0]);
  const freeScripts = useMemo(() => c.free.scripts(), [c]);
  const [freeFile, setFreeFile] = useState(freeScripts[0].file);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<WorkshopEditor | null>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const worldRef = useRef<World3D | null>(null);
  const runRef = useRef<MissionRun>({ mem: {}, code: '' });
  const codeRef = useRef('');
  const raf = useRef(0);
  const input = useRef({ keys: new Set<string>(), tapped: new Set<string>(), buttons: new Set<number>(), tappedB: new Set<number>(), dx: 0, dy: 0 });
  const demoRef = useRef(false);
  const powerRef = useRef(1);

  const [phase, setPhase] = useState<Phase>('edit');
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [err, setErr] = useState<{ line: number; message: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [hints, setHints] = useState(0);
  const [tries, setTries] = useState(0);
  const [reading, setReading] = useState(false);
  const [blanksLeft, setBlanksLeft] = useState(0);
  const [blankWarn, setBlankWarn] = useState(false);
  const [demo, setDemo] = useState(false);
  const [sound, setSound] = useState(sfxOn());
  const [wordOpen, setWordOpen] = useState<number | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [vision, setVision] = useState(false);
  const [labels, setLabels] = useState<VisionLabel[]>([]);
  const [tick, setTick] = useState(0);
  const loopRef = useRef<((t: number) => void) | null>(null);
  const visionRef = useRef(false);
  const [panel, setPanel] = useState<'inspector' | 'brain' | 'materials' | null>(null);
  const matChoices = useMemo(() => materialChoices(), []);

  ensureMainThreadTreeSitter();

  const fileKey = free ? `free:${freeFile}` : mission!.id;
  const initialCode = useMemo(() => {
    if (free) return prog.free[freeFile] ?? freeScripts.find((s) => s.file === freeFile)!.source;
    return prog.code[mission!.id] ?? starterOf(mission!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  // ---------------------------------------------------------------- 3D view (one per screen)
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      sceneRef.current = new Scene3D(canvasRef.current);
    } catch {
      setWebgl(false);
    }
    return () => {
      cancelAnimationFrame(raf.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const levelOf = useCallback(() => {
    if (!mission) {
      const st = useShooter.getState().free;
      return c.free.level(freeScripts.slice(1).map((s) => ({ source: st[s.file] ?? s.source, on: s.on })));
    }
    return mission.level();
  }, [mission, freeScripts]);

  /** Shows the world before it is played (the camera at the player's eyes). */
  const showStill = useCallback(() => {
    const w = new World3D(levelOf());
    applySavedMaterials(w, c.id);
    worldRef.current = w;
    const offline = !!c.offlineFirst && mission?.id === c.offlineFirst && !useShooter.getState().done.includes(c.offlineFirst);
    powerRef.current = offline ? 0 : 1;
    sceneRef.current?.setPower(powerRef.current);
    sceneRef.current?.render(w);
    setHud({ ...EMPTY_HUD, goals: mission ? mission.goals.map(() => false) : [false] });
    // Local automation hook for the browser tests (nothing leaves the page).
    const hook = window as unknown as { __mf?: Record<string, unknown> };
    hook.__mf = { ...(hook.__mf ?? {}), shooterPixel: (x: number, y: number) => (sceneRef.current && worldRef.current ? sceneRef.current.samplePixel(worldRef.current, x, y) : []) };
  }, [levelOf, mission]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    engineHum(null);
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  // ---------------------------------------------------------------- editor
  useEffect(() => {
    if (!hostRef.current) return;
    codeRef.current = initialCode;
    setBlanksLeft(openBlanks(initialCode));
    const ed = createEditor(hostRef.current, {
      doc: initialCode,
      lang: 'cs',
      fileName: () => (free ? freeFile : mission!.file),
      syntax: async (text) => syntaxProblems(await parseCSharp(text), text).map((p) => ({ line: p.line, col: p.col, message: p.message })),
      onChange: (t) => {
        codeRef.current = t;
        setBlanksLeft(openBlanks(t));
        setBlankWarn(false);
        const s = useShooter.getState();
        if (free) s.set({ free: { ...s.free, [freeFile]: t } });
        else s.set({ code: { ...s.code, [mission!.id]: t } });
      },
      onCursor: () => {},
      onPredictions: () => {},
      onProblems: () => {},
      onRun: () => void play(),
      ghost: useWorkshop.getState().ghost,
      extra: [blankHighlighter()],
    });
    edRef.current = ed;
    return () => {
      ed.destroy();
      edRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  // a new mission: reset everything
  useEffect(() => {
    stop();
    setPhase('edit');
    setErr(null);
    setHints(0);
    setTries(0);
    setDemo(false);
    demoRef.current = false;
    setWordOpen(null);
    showStill();
    if (mission) mark({ kind: 'mission', id: mission.id, title: pick(mission.title), extra: c.id });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog.current]);

  // ---------------------------------------------------------------- input listeners
  useEffect(() => {
    const active = () => !!worldRef.current && raf.current !== 0 && (document.pointerLockElement === canvasRef.current || document.activeElement === stageRef.current);
    const down = (e: KeyboardEvent) => {
      if (!active()) return;
      const k = keyOf(e);
      if (!k) return;
      e.preventDefault();
      input.current.keys.add(k);
      input.current.tapped.add(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = keyOf(e);
      if (k) input.current.keys.delete(k);
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasRef.current) return;
      input.current.dx += e.movementX;
      input.current.dy += e.movementY;
    };
    const lockChange = () => {
      const on = document.pointerLockElement === canvasRef.current;
      setLocked(on);
      if (!on) {
        input.current.keys.clear();
        input.current.buttons.clear();
      }
    };
    const blur = () => {
      input.current.keys.clear();
      input.current.buttons.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('blur', blur);
    document.addEventListener('pointerlockchange', lockChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('blur', blur);
      document.removeEventListener('pointerlockchange', lockChange);
    };
  }, []);

  // ---------------------------------------------------------------- play
  const play = useCallback(async () => {
    const code = codeRef.current;
    if (!free && openBlanks(code) > 0) {
      setBlankWarn(true);
      const line = blankLines(code)[0];
      const v = edRef.current?.view;
      if (v && line !== undefined) {
        const l = v.state.doc.line(line + 1);
        const at = l.text.indexOf('___');
        v.dispatch({ selection: { anchor: l.from + Math.max(0, at), head: l.from + Math.max(0, at) + 3 }, scrollIntoView: true });
        v.focus();
      }
      return;
    }
    stop();
    setErr(null);
    const w = new World3D(levelOf());
    const source = free ? (useShooter.getState().free[freeScripts[0].file] ?? freeScripts[0].source) : code;
    const problems = await w.load(source, free ? freeScripts[0].on : (mission!.attachTo ?? 'Player'));
    applySavedMaterials(w, c.id);
    worldRef.current = w;
    sceneRef.current?.render(w);
    if (problems) {
      setPhase('error');
      playUi('error');
      setErr({ line: problems[0].line, message: problems.map((p) => p.message).join('\n') });
      setTries((t) => t + 1);
      return;
    }
    runRef.current = { mem: {}, code };
    input.current = { keys: new Set(), tapped: new Set(), buttons: new Set(), tappedB: new Set(), dx: 0, dy: 0 };
    setPhase('playing');
    // Local automation hook for the browser tests (nothing leaves the page).
    const hook = window as unknown as { __mf?: Record<string, unknown> };
    hook.__mf = { ...(hook.__mf ?? {}), world3d: w };
    stageRef.current?.focus();
    let last = performance.now();
    let acc = 0;
    let n = 0;
    let shotsSeen = w.time;
    let marks = { hit: -10, kill: -10, hurt: -10 };
    let won = false;
    const loop = (now: number) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      let status: string = 'playing';
      let message = '';
      let errLine = -1;
      const sens = useShooter.getState().sens;
      const watching = () => !!w.spectate && (status === 'playing' || status === 'lost');
      while (acc >= w.dt && (status === 'playing' || watching())) {
        const i = input.current;
        let step: DemoStep3;
        if (w.spectate) {
          // watching bots: your own controls rest
          step = { until: 1e9 };
          i.tapped.clear();
          i.tappedB.clear();
          i.dx = 0;
          i.dy = 0;
        } else if (demoRef.current && mission) step = mission.demo(w.time, w, runRef.current);
        else {
          step = { until: 1e9, keys: [...new Set([...i.keys, ...i.tapped])], buttons: [...new Set([...i.buttons, ...i.tappedB])], mouse: [i.dx * 0.1 * sens, -i.dy * 0.1 * sens] };
          i.tapped.clear();
          i.tappedB.clear();
          i.dx = 0;
          i.dy = 0;
        }
        const r = w.step(step);
        status = r.status === 'lost' && w.spectate ? 'playing' : r.status;
        message = r.message ?? '';
        errLine = r.error?.line ?? -1;
        acc -= w.dt;
        const goals = mission ? checkGoals(mission, w, runRef.current) : [c.free.check(w)];
        if (!won && goals.every(Boolean)) {
          won = true;
          onWin();
        }
      }
      // sounds
      if (sound) {
        for (const s of w.shots) {
          if (s.at <= shotsSeen) continue;
          if (s.byBot) sfx.enemyShot(Math.hypot(s.from.x - w.player.pos.x, s.from.z - w.player.pos.z));
          else sfx.shot();
        }
        if (w.hitMarkAt > marks.hit) sfx.hit();
        if (w.killMarkAt > marks.kill) sfx.kill();
        if (w.hurtAt > marks.hurt) sfx.hurt();
      }
      shotsSeen = Math.max(shotsSeen, ...w.shots.map((s) => s.at));
      if (c.hud === 'race' && sound) engineHum(Math.hypot(w.player.vel.x, w.player.vel.z));
      marks = { hit: w.hitMarkAt, kill: w.killMarkAt, hurt: w.hurtAt };
      // the suit "powers on" after the first mission
      if (won && powerRef.current < 1) {
        powerRef.current = Math.min(1, powerRef.current + 0.012);
        sceneRef.current?.setPower(powerRef.current);
      }
      if (sceneRef.current) sceneRef.current.vision = visionRef.current;
      const lb = sceneRef.current?.render(w) ?? [];
      if (++n % 5 === 0 || status !== 'playing') {
        setHud(readHud(w, mission ? checkGoals(mission, w, runRef.current) : [c.free.check(w)]));
        setLabels(lb);
        if (n % 30 === 0) setTick((t) => t + 1);
      }
      if (status === 'playing') {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      raf.current = 0;
      if (document.pointerLockElement) document.exitPointerLock();
      if (status === 'error') {
        setPhase('error');
        playUi('error');
        setErr({ line: errLine, message });
        setTries((t) => t + 1);
      } else if (status === 'lost') {
        setPhase('lost');
        setTries((t) => t + 1);
      }
    };
    loopRef.current = (now: number) => {
      last = now;
      loop(now);
    };
    const onWin = () => {
      setPhase('won');
      if (mission) setHud(readHud(w, checkGoals(mission, w, runRef.current)));
      playUi('success');
      if (mission) {
        const p = useShooter.getState();
        const first = !p.done.includes(mission.id);
        if (first) {
          p.set({ done: [...p.done, mission.id] });
          addXp(c.xp);
        }
        const i = c.missions.indexOf(mission);
        const nx = c.missions[i + 1];
        const w0 = mission.words[0];
        fx.lesson({
          icon: mission.icon,
          title: pick(mission.title),
          anchor: w0 ? `${w0.word} — ${pick(w0.say)}` : pick(mission.ability),
          moment: pick(mission.ability),
          xp: first ? c.xp : undefined,
          next: nx ? { label: tr('Next mission', 'Следующая миссия'), go: () => useShooter.getState().set({ current: nx.id }) } : undefined,
        });
      }
    };
    raf.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission, free, freeScripts, levelOf, stop, sound, addXp]);

  /** After being knocked out: keep the round running and watch the bots. */
  const watchBots = () => {
    const w = worldRef.current;
    if (!w) return;
    const bots = w.watchable();
    if (!bots.length) return;
    w.spectate ??= { bot: bots[0], mode: 'follow' };
    setVision(true);
    visionRef.current = true;
    setPhase('playing');
    setTick((t) => t + 1);
    if (!raf.current && loopRef.current) raf.current = requestAnimationFrame((t) => loopRef.current?.(t));
  };

  const restart = () => {
    stop();
    setPhase('edit');
    setErr(null);
    setDemo(false);
    demoRef.current = false;
    showStill();
  };

  const goLine = (line: number) => {
    const v = edRef.current?.view;
    if (!v || line < 0) return;
    const l = v.state.doc.line(Math.min(line + 1, v.state.doc.lines));
    v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
    v.focus();
  };

  const showAnswer = () => {
    if (!mission) return;
    if (!confirm(tr('Show the answer? Mistakes are normal — try one more hint first.', 'Показать ответ? Ошибаться нормально — сначала попробуй ещё подсказку.'))) return;
    edRef.current?.setText(answerOf(mission));
  };
  const resetCode = () => {
    if (!confirm(tr('Start this script again from the beginning?', 'Начать этот скрипт заново?'))) return;
    const t = mission ? starterOf(mission) : (freeScripts.find((s) => s.file === freeFile)?.source ?? '');
    edRef.current?.setText(t);
  };
  const toggleDemo = () => {
    const on = !demo;
    setDemo(on);
    demoRef.current = on;
    if (on && phase !== 'playing') void play();
  };

  const lockMouse = () => {
    if (phase !== 'playing' || demoRef.current) return;
    try {
      canvasRef.current?.requestPointerLock();
    } catch {
      /* not allowed here: keys still work */
    }
  };

  const goto = (id: string) => prog.set({ current: id });
  const lock = usePathLock();
  const idx = mission ? MISSIONS.indexOf(mission) : -1;
  const next = idx >= 0 && idx < MISSIONS.length - 1 ? MISSIONS[idx + 1] : null;
  const done = new Set(prog.done);
  const info = err ? explainError(err.message) : null;
  const chapter = mission ? CHAPTERS.find((c) => c.n === mission.chapter)! : null;
  const usesMouse = !mission || mission.keys.includes('mouse');
  const offline = !!c.offlineFirst && mission?.id === c.offlineFirst && !done.has(c.offlineFirst) && phase !== 'won';

  return (
    <div className="sh" data-testid="shooter">
      {/* ---------------- mission map ---------------- */}
      <nav className="sh-map" aria-label={tr('Missions', 'Миссии')}>
        {CHAPTERS.map((c) => {
          const ms = MISSIONS.filter((m) => m.chapter === c.n);
          return (
            <div key={c.n} className={`sh-chapter${mission?.chapter === c.n ? ' on' : ''}`} title={pick(c.about)}>
              <span className="sh-ch-name">
                {c.icon} {pick(c.title)} <span className="muted small">{ms.filter((m) => done.has(m.id)).length}/{ms.length}</span>
              </span>
              <span className="sh-ch-missions">
                {ms.map((m) => (
                  <button
                    key={m.id}
                    className={`sh-dot${m.id === mission?.id ? ' on' : ''}${done.has(m.id) ? ' done' : ''}${lock.locked(m.id) ? ' locked' : ''}`}
                    onClick={(e) => (lock.locked(m.id) ? lockedClick(e.currentTarget) : goto(m.id))}
                    title={`${MISSIONS.indexOf(m) + 1}. ${pick(m.title)}`}
                    aria-disabled={lock.locked(m.id)}
                    data-testid={`sh-mission-${m.id}`}
                  >
                    {done.has(m.id) ? '✓' : lock.locked(m.id) ? '🔒' : m.icon}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
        <button className={`sh-free${free ? ' on' : ''}`} onClick={() => goto('free')} data-testid="sh-free" title={tr('The finished game: every script can be changed', 'Готовая игра: любой скрипт можно менять')}>
          🎮 {tr('Free play', 'Свободная игра')}
        </button>
      </nav>

      <div className="sh-main">
        {/* ---------------- left: briefing + code ---------------- */}
        <section className="sh-left">
          {mission ? (
            <div className="sh-brief" data-testid="sh-brief">
              <div className="sh-brief-top muted small">
                {chapter?.icon} {pick(chapter!.title)} · {tr('mission', 'миссия')} {idx + 1}/{MISSIONS.length} · <b>{pick(mission.system)}</b>
              </div>
              <h3>
                {mission.icon} {pick(mission.title)}
              </h3>
              <p className="sh-radio">
                <span aria-hidden>📻</span> <i>{pick(mission.radio)}</i>{' '}
                <button className="link" onClick={() => speak(pick(mission.radio))} aria-label={tr('Read aloud', 'Прочитать вслух')} title={tr('Read aloud', 'Прочитать вслух')}>
                  🔊
                </button>
              </p>
              <p className="sh-task">🎯 {pick(mission.task)}</p>
              <div className="sh-words" aria-label={tr('New words', 'Новые слова')}>
                {mission.words.map((w, i) => (
                  <button key={w.word} className={`sh-word${wordOpen === i ? ' on' : ''}`} onClick={() => setWordOpen(wordOpen === i ? null : i)} data-testid="sh-word">
                    <code>{w.word}</code>
                  </button>
                ))}
              </div>
              {wordOpen !== null && mission.words[wordOpen] ? (
                <p className="sh-word-say" data-testid="sh-word-say">
                  <code>{mission.words[wordOpen].word}</code> — {pick(mission.words[wordOpen].say)}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="sh-brief" data-testid="sh-brief">
              <h3>🎮 {pick(c.free.title)}</h3>
              <p className="sh-task">{pick(c.free.about)}</p>
              <div className="sh-files" role="tablist">
                {freeScripts.map((s) => (
                  <button key={s.file} role="tab" aria-selected={s.file === freeFile} className={s.file === freeFile ? 'on' : ''} onClick={() => setFreeFile(s.file)} title={tr(`On: ${s.on}`, `Висит на: ${s.on}`)}>
                    {s.file}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sh-actions">
            <button className="btn primary big" onClick={() => void play()} data-testid="sh-play">
              <Play size={17} /> {free ? tr('Play', 'Играть') : phase === 'playing' ? tr('Upload again', 'Загрузить заново') : tr('Upload the script', 'Загрузить прошивку')}
            </button>
            {!free && blanksLeft > 0 ? (
              <button
                className={`sh-blanks${blankWarn ? ' warn' : ''}`}
                data-testid="sh-blanks"
                title={tr('Selects the next blank — just type', 'Выделяет следующий пропуск — просто печатай')}
                onClick={() => edRef.current && jumpToBlank(edRef.current.view)}
              >
                ✏️ {tr(`Blanks to fill: ${blanksLeft} — click or Tab`, `Пропусков: ${blanksLeft} — нажми или Tab`)}
              </button>
            ) : !free ? (
              <span className="sh-blanks ok">✅ {tr('All blanks filled', 'Все пропуски заполнены')}</span>
            ) : null}
          </div>
          {blankWarn ? (
            <p className="sh-note" data-testid="sh-blank-warn">
              {tr('First fill every ___. The first one is already selected — just type; Tab goes to the next.', 'Сначала заполни все ___. Первый уже выделен — просто печатай; Tab — к следующему.')}
            </p>
          ) : null}
          <div className="sh-tools">
            <button className="btn small" onClick={() => setReading(true)} data-testid="sh-read">
              📖 {tr('Read simply', 'Читать просто')}
            </button>
            {mission ? (
              <button className="btn small" onClick={() => setHints((h) => Math.min(mission.hints.length, h + 1))} disabled={hints >= mission.hints.length} data-testid="sh-hint">
                <Lightbulb size={14} /> {tr('Hint', 'Подсказка')} {hints ? `${hints}/${mission.hints.length}` : ''}
              </button>
            ) : null}
            {mission ? (
              <button className={`btn small${demo ? ' on' : ''}`} onClick={toggleDemo} data-testid="sh-demo" title={tr('The game plays itself with YOUR code — watch how to complete the mission', 'Игра сама играет с ТВОИМ кодом — посмотри, как пройти миссию')}>
                <Eye size={14} /> {demo ? tr('Stop showing', 'Хватит показывать') : tr('Show me how to play', 'Покажи, как играть')}
              </button>
            ) : null}
            <button className="btn small ghost" onClick={resetCode} data-testid="sh-reset">
              <RotateCcw size={14} /> {tr('Start the script over', 'Скрипт заново')}
            </button>
            {mission && (tries >= 2 || hints >= mission.hints.length) ? (
              <button className="btn small ghost" onClick={showAnswer} data-testid="sh-answer">
                {tr('Show the answer', 'Показать ответ')}
              </button>
            ) : null}
          </div>
          {mission && hints > 0 ? (
            <div className="sh-hints" data-testid="sh-hints">
              {mission.hints.slice(0, hints).map((h, i) => (
                <p key={i}>💡 {pick(h)}</p>
              ))}
            </div>
          ) : null}
          <div className="sh-editor" ref={hostRef} data-testid="sh-editor" />
          {err ? (
            <div className="ws-errcard" data-testid="sh-error">
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
          {mission ? (
            <details className="sh-unity">
              <summary>🛠 {tr('The same in the real Unity', 'То же самое в настоящей Unity')}</summary>
              <p>{pick(mission.inUnity)}</p>
            </details>
          ) : null}
          {reading ? <ReaderModal code={codeRef.current} title={free ? freeFile : pick(mission!.title)} problems={err && err.line >= 0 ? [{ line: err.line, severity: 'error', message: err.message }] : []} onClose={() => setReading(false)} /> : null}
        </section>

        {/* ---------------- right: the game ---------------- */}
        <section className="sh-right">
          <div className={`sh-stage${offline ? ' offline' : ''}`} ref={stageRef} tabIndex={0} data-testid="sh-stage" aria-label={tr('The game. Click to control it; Esc releases the mouse.', 'Игра. Нажми, чтобы управлять; Esc отпускает мышь.')}>
            <canvas
              ref={canvasRef}
              className="sh-canvas"
              onClick={lockMouse}
              onMouseDown={(e) => {
                if (phase !== 'playing') return;
                const b = e.button === 2 ? 1 : e.button === 1 ? 2 : 0;
                input.current.buttons.add(b);
                input.current.tappedB.add(b);
                stageRef.current?.focus();
              }}
              onMouseUp={(e) => input.current.buttons.delete(e.button === 2 ? 1 : e.button === 1 ? 2 : 0)}
              onContextMenu={(e) => e.preventDefault()}
            />
            {!webgl ? <div className="sh-overlay">{tr('3D graphics (WebGL) are not available on this computer.', 'На этом компьютере недоступна 3D-графика (WebGL).')}</div> : null}
            <HudView hud={hud} mission={mission} phase={phase} hasGun={!!worldRef.current?.gun && !worldRef.current?.spectate} race={c.hud === 'race'} freeGoal={c.free.goal} />
            {vision ? <VisionLabels labels={labels} /> : null}
            {worldRef.current?.spectate ? <div className="gp-watching">👁 {tr('Watching', 'Наблюдаешь')}: <b>{worldRef.current.spectate.bot.name}</b></div> : null}
            {phase === 'edit' ? (
              <div className="sh-overlay soft" data-testid="sh-idle">
                {offline ? <b>{tr('Suit systems are offline', 'Системы костюма отключены')}</b> : null}
                <span>{tr('Fill the blanks on the left and press "Upload the script"', 'Заполни пропуски слева и нажми «Загрузить прошивку»')}</span>
              </div>
            ) : phase === 'playing' && !locked && !demo && usesMouse && !worldRef.current?.spectate ? (
              <button className="sh-overlay hint" onClick={lockMouse} data-testid="sh-click">
                <Crosshair size={18} /> {tr('Click the game to control it with the mouse (Esc — release)', 'Нажми на игру, чтобы управлять мышью (Esc — отпустить)')}
              </button>
            ) : phase === 'won' ? (
              <div className="sh-overlay won" data-testid="sh-won">
                <b>✅ {mission ? tr(`System restored: ${pick(mission.system)}`, `Система восстановлена: ${pick(mission.system)}`) : tr('Victory!', 'Победа!')}</b>
                {mission ? <span>{pick(mission.ability)}</span> : null}
                {mission ? <span className="sh-xp">+30 XP</span> : null}
                <div className="sh-row">
                  {next ? (
                    <button className="btn primary" onClick={() => goto(next.id)} data-testid="sh-next">
                      {tr('Next mission →', 'Следующая миссия →')}
                    </button>
                  ) : mission ? (
                    <button className="btn primary" onClick={() => goto('free')} data-testid="sh-next">
                      🎮 {tr('Free play', 'Свободная игра')}
                    </button>
                  ) : null}
                  <button className="btn" onClick={() => setPhase('playing')}>
                    {tr('Keep playing', 'Ещё поиграть')}
                  </button>
                </div>
              </div>
            ) : phase === 'lost' ? (
              <div className="sh-overlay lost" data-testid="sh-lost">
                <b>💥 {tr('You are out of the fight', 'Ты выбыл из боя')}</b>
                <span>{tr('Nothing bad: in shooters this happens all the time. Use cover and try again.', 'Ничего страшного: в шутерах это бывает постоянно. Прячься за укрытиями и попробуй ещё.')}</span>
                <div className="sh-row">
                  <button className="btn primary" onClick={() => void play()}>
                    <RotateCcw size={15} /> {tr('Again', 'Ещё раз')}
                  </button>
                  {worldRef.current?.watchable().length ? (
                    <button className="btn" onClick={watchBots} data-testid="sh-watch">
                      👁 {tr('Watch the bots', 'Наблюдать за ботами')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : phase === 'error' ? (
              <div className="sh-overlay lost">
                <b>⚠ {tr('The script has a problem — look on the left', 'В скрипте проблема — смотри слева')}</b>
              </div>
            ) : null}
          </div>
          <div className="sh-under">
            <button className="btn small" onClick={restart} disabled={phase === 'edit'} data-testid="sh-stop">
              {phase === 'playing' ? <Square size={14} /> : <RotateCcw size={14} />} {phase === 'playing' ? tr('Stop', 'Стоп') : tr('Reset', 'Сначала')}
            </button>
            <span className="sh-keys" data-testid="sh-keys">
              {(mission ? mission.keys : c.free.keys).map((k) => (
                <span key={k} className="sh-key">
                  {KEY_LABEL[k] ? pick(KEY_LABEL[k]) : k}
                </span>
              ))}
            </span>
            {c.hud === 'race' && phase === 'playing' ? <RaceTools world={worldRef.current} /> : null}
            <span className="spacer" />
            {usesMouse ? (
              <label className="sh-sens muted small" title={tr('Mouse sensitivity', 'Чувствительность мыши')}>
                🖱{' '}
                <input type="range" min={0.25} max={3} step={0.25} value={prog.sens} onChange={(e) => prog.set({ sens: Number(e.target.value) })} aria-label={tr('Mouse sensitivity', 'Чувствительность мыши')} />
              </label>
            ) : null}
            <button
              className="btn small ghost"
              onClick={() => {
                setSfx(!sound);
                setSound(!sound);
              }}
              aria-label={sound ? tr('Sound off', 'Выключить звук') : tr('Sound on', 'Включить звук')}
              title={sound ? tr('Sound off', 'Выключить звук') : tr('Sound on', 'Включить звук')}
            >
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </div>
          {phase !== 'edit' ? (
            <div className="gp-panels">
              <SpectatorBar
                world={worldRef.current}
                vision={vision}
                setVision={(v) => {
                  setVision(v);
                  visionRef.current = v;
                }}
                onChange={() => {
                  setTick((t) => t + 1);
                  if (worldRef.current?.spectate && phase === 'lost') watchBots();
                }}
              />
              <div className="gp-row">
                <button className={`btn small${panel === 'inspector' ? ' on' : ''}`} onClick={() => setPanel(panel === 'inspector' ? null : 'inspector')} data-testid="open-inspector">
                  🎚 {tr('Inspector (live numbers)', 'Inspector (числа вживую)')}
                </button>
                <button className={`btn small${panel === 'materials' ? ' on' : ''}`} onClick={() => setPanel(panel === 'materials' ? null : 'materials')} data-testid="open-materials">
                  🎨 {tr('Materials', 'Материалы')}
                </button>
                {worldRef.current?.watchable().length && worldRef.current.level.botBrain !== 'script' ? (
                  <button className={`btn small${panel === 'brain' ? ' on' : ''}`} onClick={() => setPanel(panel === 'brain' ? null : 'brain')} data-testid="open-brain">
                    🧠 {tr('Bot brain', 'Мозг ботов')}
                  </button>
                ) : null}
              </div>
              {panel === 'inspector' ? <LiveInspector world={worldRef.current} tick={tick} /> : null}
              {panel === 'brain' ? <BotBrainPanel world={worldRef.current} tick={tick} /> : null}
              {panel === 'materials' ? <MaterialPanel world={worldRef.current} campaign={c.id} choices={matChoices} /> : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function readHud(w: World3D, goals: boolean[]): Hud {
  let callsign = '';
  for (const i of w.insts) {
    const c = i.self?.fields.get('callsign');
    if (c && typeof c.v === 'string') callsign = c.v;
  }
  return {
    health: w.player.health?.value ?? 100,
    maxHealth: w.player.health?.max ?? 100,
    ui: w.ui.filter((u) => u.text),
    radio: w.logs.filter((l) => !l.text.startsWith('Inspector:')).slice(-4),
    goals,
    callsign,
    hitAt: w.hitMarkAt,
    killAt: w.killMarkAt,
    hurtAt: w.hurtAt,
    time: w.time,
    redLeft: w.redLeft(),
    speed: Math.hypot(w.player.vel.x, w.player.vel.z) * 3.6,
  };
}

/** The game's on-screen display: crosshair, health, texts from scripts, radio, goals. */
function HudView({ hud, mission, phase, hasGun, race, freeGoal }: { hud: Hud; mission: Mission | null; phase: Phase; hasGun: boolean; race: boolean; freeGoal: Text2 }) {
  const recentHit = hud.time - hud.hitAt < 0.18;
  const recentKill = hud.time - hud.killAt < 0.5;
  const hurt = Math.max(0, 1 - (hud.time - hud.hurtAt) / 0.6);
  const goals = mission ? mission.goals : [{ text: freeGoal }];
  const goalEls = useRef<(HTMLDivElement | null)[]>([]);
  const prevGoals = useRef<{ id: string; v: boolean[] }>({ id: '', v: [] });
  const goalKey = hud.goals.map((g) => (g ? 1 : 0)).join('');
  useEffect(() => {
    const id = mission?.id ?? 'free';
    const prev = prevGoals.current.id === id ? prevGoals.current.v : hud.goals.map(() => false);
    hud.goals.forEach((g, i) => {
      if (g && !prev[i] && prevGoals.current.id === id) {
        fx.spark(goalEls.current[i]);
        fx.streak(true);
      }
    });
    prevGoals.current = { id, v: [...hud.goals] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalKey, mission?.id]);
  return (
    <div className="sh-hud" aria-live="polite">
      <div className="sh-goals" data-testid="sh-goals">
        {goals.map((g, i) => (
          <div key={i} ref={(el) => void (goalEls.current[i] = el)} className={hud.goals[i] ? 'done' : ''} data-testid="sh-goal">
            {hud.goals[i] ? '✓' : '○'} {pick(g.text)}
          </div>
        ))}
      </div>
      {phase === 'playing' || phase === 'won' ? (
        <>
          {race ? null : <div className={`sh-cross${hasGun ? ' gun' : ''}${recentHit ? ' hit' : ''}${recentKill ? ' kill' : ''}`} aria-hidden />}
          {hurt > 0 ? <div className="sh-hurt" style={{ opacity: hurt * 0.55 }} aria-hidden /> : null}
          <div className="sh-bottom">
            {race ? (
              <div className="sh-speedo" data-testid="sh-speed">
                <b>{Math.round(hud.speed)}</b> {tr('km/h', 'км/ч')}
              </div>
            ) : (
            <div className="sh-hp" title={tr('Health', 'Здоровье')}>
              <span>❤</span>
              <span className="sh-hp-bar">
                <span style={{ width: `${Math.max(0, (hud.health / hud.maxHealth) * 100)}%` }} />
              </span>
              <b>{Math.ceil(hud.health)}</b>
            </div>
            )}
            {hud.callsign ? <div className="sh-callsign">🪪 {hud.callsign}</div> : null}
            <div className="sh-ui" data-testid="sh-ui">
              {hud.ui.map((u) => (
                <div key={u.name}>{u.text}</div>
              ))}
            </div>
          </div>
          {hud.radio.length ? (
            <div className="sh-radio-feed" data-testid="sh-radio">
              {hud.radio.map((l, i) => (
                <div key={`${l.time}-${i}`}>📻 {l.text}</div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function Shooter() {
  return <Campaign3D key="shooter" c={SHOOTER} />;
}

export function Racing() {
  return <Campaign3D key="racing" c={RACING} />;
}

const PAINT = ['#e8483b', '#2f6fd6', '#3bb273', '#e8a33b', '#9b59d0', '#20b2c8', '#f2f2f2', '#2b2f36'];

/** Racing: put the car back on the track, and paint it. */
function RaceTools({ world }: { world: World3D | null }) {
  if (!world) return null;
  const paint = (hex: string) => {
    // with the CarPaint script the colour lives in its "hue" — change that, so the script does not paint over it
    const inst = world.insts.find((i) => i.obj === world.player && typeof i.self?.fields.get('hue')?.v === 'number');
    if (inst) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min || 1;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      inst.self!.fields.get('hue')!.v = (((h / 6) % 1) + 1) % 1;
      if (inst.self!.fields.get('saturation')) inst.self!.fields.get('saturation')!.v = max ? (max - min) / max : 0;
      if (inst.self!.fields.get('brightness')) inst.self!.fields.get('brightness')!.v = max;
    }
    world.player.color = hex;
  };
  return (
    <span className="sh-race-tools">
      <button className="btn small" onClick={() => world.respawnCar()} data-testid="race-respawn" title={tr('Put the car back on the track', 'Поставить машину обратно на трассу')}>
        ↺ {tr('Back on track', 'На трассу')}
      </button>
      {PAINT.map((p) => (
        <button key={p} className="sh-paint" style={{ background: p }} onClick={() => paint(p)} aria-label={tr(`Paint ${p}`, `Покрасить ${p}`)} data-testid="race-paint" />
      ))}
    </span>
  );
}

export function Models() {
  return <Campaign3D key="models" c={MODELS} />;
}

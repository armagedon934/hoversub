// Sound Lab: make game sounds two ways, always with the result on the right (the wave, its pitch
// and loudness, Play / Stop / Slow ×2). 1) Synthesizer: sliders and presets. 2) Lessons: write
// real Unity sound code (OnAudioFilterRead) with a few blanks; the Inspector sliders change it live.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Lightbulb, Play, Shuffle, Square, Turtle } from 'lucide-react';
import { pick, tr } from '../i18n';
import { answerCode, countBlanks, starterCode } from '../run/blanks';
import { errorText, explainError } from '../run/errors';
import { ensureMainThreadTreeSitter } from '../run/mainThread';
import { parseCSharp, syntaxProblems } from '../run/runner';
import { useLearn } from '../learn/progress';
import { ReaderModal } from '../learn/ReaderView';
import { useResume } from '../memory/resume';
import { playUi } from '../ui/uiSound';
import { blankHighlighter, createEditor, type WorkshopEditor } from '../workshop/editor';
import { useWorkshop } from '../workshop/store';
import { SOUND_LESSONS, type SoundLesson } from './soundLessons';
import { useSoundLab } from './labProgress';
import { renderSoundScript, type SoundField } from './soundScript';
import { PRESETS, SAMPLE_RATE, analyze, play, randomParams, render, stop, stretch2x, toWav, type Analysis, type SynthParams, type Wave } from './synth';
import { setCustomSound, type GameSoundSlot } from './customSounds';

// ------------------------------------------------------------------------------------ the wave

function drawWave(c: HTMLCanvasElement, samples: Float32Array, a: Analysis | null, head: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.floor(w * dpr)) c.width = Math.floor(w * dpr);
  if (c.height !== Math.floor(h * dpr)) c.height = Math.floor(h * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(c);
  const accent = css.getPropertyValue('--accent').trim() || '#e0a24a';
  const text = css.getPropertyValue('--text-2').trim() || '#aaa';
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(128,128,128,0.25)';
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  // the wave: min/max per pixel
  g.fillStyle = accent;
  const n = samples.length;
  for (let x = 0; x < w; x++) {
    const a0 = Math.floor((x / w) * n);
    const a1 = Math.max(a0 + 1, Math.floor(((x + 1) / w) * n));
    let lo = 0;
    let hi = 0;
    for (let i = a0; i < a1 && i < n; i++) {
      if (samples[i] < lo) lo = samples[i];
      if (samples[i] > hi) hi = samples[i];
    }
    g.fillRect(x, h / 2 - hi * (h * 0.45), 1, Math.max(1, (hi - lo) * (h * 0.45)));
  }
  if (a) {
    // pitch line (top) and loudness line
    const maxP = Math.max(200, ...a.pitch);
    g.strokeStyle = text;
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.beginPath();
    a.pitch.forEach((p, i) => {
      const x = ((i + 0.5) / a.pitch.length) * w;
      const y = 14 + (1 - p / maxP) * (h * 0.3);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.setLineDash([]);
  }
  if (head >= 0 && head <= 1) {
    g.fillStyle = '#ff5a4a';
    g.fillRect(head * w, 0, 2, h);
  }
}

/** The right window: the wave with pitch line, numbers and the playback buttons. */
function Scope({ samples, analysis, slowSamples, title }: { samples: Float32Array; analysis: Analysis | null; slowSamples: () => Float32Array; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState<'normal' | 'slow' | null>(null);
  const raf = useRef(0);
  const redraw = useCallback((head = -1) => ref.current && drawWave(ref.current, samples, analysis, head), [samples, analysis]);
  useEffect(() => {
    redraw();
    const on = () => redraw();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [redraw]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const start = (slow: boolean) => {
    cancelAnimationFrame(raf.current);
    const buf = slow ? slowSamples() : samples;
    const p = play(buf, 1, SAMPLE_RATE, () => setPlaying(null));
    if (!p) return;
    setPlaying(slow ? 'slow' : 'normal');
    const len = buf.length / SAMPLE_RATE;
    const tick = () => {
      const t = (p.ctx.currentTime - p.start) / len;
      redraw(t);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else redraw();
    };
    raf.current = requestAnimationFrame(tick);
  };
  const halt = () => {
    stop();
    cancelAnimationFrame(raf.current);
    setPlaying(null);
    redraw();
  };
  const save = () => {
    const blob = new Blob([toWav(samples) as BlobPart], { type: 'audio/wav' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w-]+/g, '_') || 'sound'}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const pitch = analysis ? Math.round(analysis.pitch.filter((x) => x > 0).reduce((s, x, _, arr) => s + x / arr.length, 0)) : 0;
  return (
    <div className="snd-scope" data-testid="snd-scope">
      <canvas ref={ref} className="snd-canvas" aria-label={tr('The wave of the sound', 'Волна звука')} />
      <div className="snd-buttons">
        <button className="btn primary big" onClick={() => start(false)} data-testid="snd-play">
          <Play size={16} /> {tr('Play', 'Играть')}
        </button>
        <button className="btn big" onClick={halt} disabled={!playing} data-testid="snd-stop">
          <Square size={15} /> {tr('Stop', 'Стоп')}
        </button>
        <button className={`btn big${playing === 'slow' ? ' on' : ''}`} onClick={() => start(true)} title={tr('Twice as slow, the same pitch — to hear every detail', 'В 2 раза медленнее, та же высота — чтобы расслышать каждую деталь')} data-testid="snd-slow">
          <Turtle size={16} /> {tr('Slow ×2', 'Медленно ×2')}
        </button>
        <button className="btn small ghost" onClick={save} title={tr('Save as a WAV file (works in Unity too)', 'Сохранить как WAV-файл (подходит и для Unity)')} data-testid="snd-wav">
          <Download size={14} /> WAV
        </button>
      </div>
      {analysis ? (
        <div className="snd-facts muted small" data-testid="snd-facts">
          <span>⏱ {analysis.duration.toFixed(2)} {tr('s', 'с')}</span>
          <span>🎵 ~{pitch} {tr('Hz', 'Гц')}</span>
          <span>🔊 {Math.round(analysis.peak * 100)}%</span>
          <span>▦ {tr('square', 'квадрат')} {Math.round(analysis.squareness * 100)}%</span>
          <span>≋ {tr('noise', 'шум')} {Math.round(analysis.noisiness * 100)}%</span>
          <span className="snd-legend">— — {tr('pitch line', 'линия высоты')}</span>
        </div>
      ) : null}
    </div>
  );
}

function UseInGame({ samples }: { samples: Float32Array }) {
  const [done, setDone] = useState('');
  const slots: [GameSoundSlot, string][] = [
    ['shot', tr('my gunshot (Shooter)', 'мой выстрел (Шутер)')],
    ['hit', tr('hit marker (Shooter)', 'попадание (Шутер)')],
    ['engine', tr('engine (Racing)', 'мотор (Гонки)')],
  ];
  return (
    <div className="snd-use">
      <span className="muted small">{tr('Use in a game as:', 'Использовать в игре как:')}</span>
      {slots.map(([k, label]) => (
        <button
          key={k}
          className="btn small"
          onClick={() => {
            setCustomSound(k, samples);
            setDone(label);
            playUi('notice');
          }}
          data-testid={`snd-use-${k}`}
        >
          {label}
        </button>
      ))}
      <button
        className="btn small ghost"
        onClick={() => {
          for (const [k] of slots) setCustomSound(k, null);
          setDone(tr('standard sounds', 'стандартные звуки'));
        }}
      >
        {tr('Standard', 'Стандартные')}
      </button>
      {done ? <span className="small" data-testid="snd-used">✓ {done}</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------ synthesizer

const WAVES: [Wave, string, string][] = [
  ['sine', '∿', tr('smooth', 'плавная')],
  ['square', '⊓', tr('8-bit', '8 бит')],
  ['saw', '⩘', tr('buzzy', 'жужжит')],
  ['triangle', '△', tr('soft', 'мягкая')],
  ['noise', '≋', tr('noise', 'шум')],
];

const SLIDERS: { k: keyof SynthParams; label: () => string; min: number; max: number; step: number; unit: string }[] = [
  { k: 'freq', label: () => tr('Pitch', 'Высота'), min: 40, max: 2000, step: 1, unit: 'Hz' },
  { k: 'slide', label: () => tr('Slide (up + / down −)', 'Скольжение (вверх + / вниз −)'), min: -6000, max: 6000, step: 10, unit: 'Hz/s' },
  { k: 'attack', label: () => tr('Attack (how fast it starts)', 'Атака (как быстро начинается)'), min: 0, max: 0.3, step: 0.001, unit: 's' },
  { k: 'sustain', label: () => tr('Hold', 'Удержание'), min: 0, max: 1, step: 0.005, unit: 's' },
  { k: 'decay', label: () => tr('Fade out', 'Затухание'), min: 0.01, max: 1.5, step: 0.005, unit: 's' },
  { k: 'vibDepth', label: () => tr('Vibrato depth', 'Глубина вибрато'), min: 0, max: 0.5, step: 0.01, unit: '' },
  { k: 'vibSpeed', label: () => tr('Vibrato speed', 'Скорость вибрато'), min: 0.5, max: 30, step: 0.5, unit: 'Hz' },
  { k: 'duty', label: () => tr('Square shape', 'Форма квадрата'), min: 0.05, max: 0.95, step: 0.01, unit: '' },
  { k: 'arpAt', label: () => tr('Second note after (0 = off)', 'Вторая нота через (0 = нет)'), min: 0, max: 0.5, step: 0.005, unit: 's' },
  { k: 'arpMul', label: () => tr('Second note: ×pitch', 'Вторая нота: ×высота'), min: 0.5, max: 2, step: 0.01, unit: '×' },
  { k: 'lowpass', label: () => tr('Brightness (filter)', 'Яркость (фильтр)'), min: 200, max: 16000, step: 50, unit: 'Hz' },
  { k: 'volume', label: () => tr('Volume', 'Громкость'), min: 0, max: 1, step: 0.01, unit: '' },
];

function Synth() {
  const params = useSoundLab((s) => s.params);
  const set = useSoundLab((s) => s.set);
  const [seed, setSeed] = useState(1);
  const samples = useMemo(() => render(params), [params]);
  const analysis = useMemo(() => analyze(samples), [samples]);
  const change = (p: Partial<SynthParams>) => set({ params: { ...params, ...p } });
  // hearing every change right away: play shortly after a slider stops moving
  const timer = useRef(0);
  const autoplay = useRef(false);
  useEffect(() => {
    if (!autoplay.current) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => play(samples), 180);
  }, [samples]);
  return (
    <div className="snd-main">
      <section className="snd-left" data-testid="snd-synth">
        <div className="snd-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="btn small"
              onClick={() => {
                autoplay.current = true;
                set({ params: { ...p.p } });
              }}
              data-testid={`snd-preset-${p.id}`}
            >
              {p.icon} {pick(p.name)}
            </button>
          ))}
          <button
            className="btn small"
            onClick={() => {
              autoplay.current = true;
              setSeed(seed + 1);
              set({ params: randomParams(seed + Date.now() % 1000) });
            }}
            data-testid="snd-random"
          >
            <Shuffle size={13} /> {tr('Surprise me', 'Удиви меня')}
          </button>
        </div>
        <div className="snd-waves" role="radiogroup" aria-label={tr('Wave', 'Волна')}>
          {WAVES.map(([w, icon, label]) => (
            <button key={w} role="radio" aria-checked={params.wave === w} className={`btn small${params.wave === w ? ' on' : ''}`} onClick={() => ((autoplay.current = true), change({ wave: w }))}>
              <b>{icon}</b> {label}
            </button>
          ))}
        </div>
        <div className="snd-sliders">
          {SLIDERS.map((s) => (
            <label key={s.k} className="snd-slider">
              <span>{s.label()}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.k] as number}
                onChange={(e) => {
                  autoplay.current = true;
                  change({ [s.k]: Number(e.target.value) } as Partial<SynthParams>);
                }}
                data-testid={`snd-${s.k}`}
              />
              <b>
                {(params[s.k] as number).toFixed(s.step < 0.01 ? 3 : s.step < 1 ? 2 : 0)} {s.unit}
              </b>
            </label>
          ))}
        </div>
        <p className="muted small">{tr('Every change plays at once. Tip: a short sound with a slide up = a jump; noise that fades = a shot or an explosion.', 'Каждое изменение сразу звучит. Подсказка: короткий звук со скольжением вверх — прыжок; затихающий шум — выстрел или взрыв.')}</p>
      </section>
      <section className="snd-right">
        <Scope samples={samples} analysis={analysis} slowSamples={() => render(params, 2)} title="sound" />
        <UseInGame samples={samples} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------------------------ lessons

function Lessons() {
  const prog = useSoundLab();
  const addXp = useLearn((s) => s.addXp);
  const mark = useResume((s) => s.mark);
  const lesson: SoundLesson = SOUND_LESSONS.find((l) => l.id === prog.lesson) ?? SOUND_LESSONS[0];
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<WorkshopEditor | null>(null);
  const codeRef = useRef('');
  const [samples, setSamples] = useState<Float32Array>(() => new Float32Array(1));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fields, setFields] = useState<SoundField[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<boolean[]>([]);
  const [err, setErr] = useState<{ line: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [blanks, setBlanks] = useState(0);
  const [warn, setWarn] = useState(false);
  const [hints, setHints] = useState(0);
  const [reading, setReading] = useState(false);
  const [won, setWon] = useState(false);

  ensureMainThreadTreeSitter();

  useEffect(() => {
    if (!hostRef.current) return;
    const initial = prog.code[lesson.id] ?? starterCode(lesson.code());
    codeRef.current = initial;
    setBlanks(countBlanks(initial));
    const ed = createEditor(hostRef.current, {
      doc: initial,
      lang: 'cs',
      fileName: () => lesson.file,
      syntax: async (text) => syntaxProblems(await parseCSharp(text), text).map((p) => ({ line: p.line, col: p.col, message: p.message })),
      onChange: (t) => {
        codeRef.current = t;
        setBlanks(countBlanks(t));
        setWarn(false);
        const s = useSoundLab.getState();
        s.set({ code: { ...s.code, [lesson.id]: t } });
      },
      onCursor: () => {},
      onPredictions: () => {},
      onProblems: () => {},
      onRun: () => void build(),
      ghost: useWorkshop.getState().ghost,
      extra: [blankHighlighter()],
    });
    edRef.current = ed;
    setSamples(new Float32Array(1));
    setAnalysis(null);
    setFields([]);
    setOverrides({});
    setGoals(lesson.goals.map(() => false));
    setErr(null);
    setHints(0);
    setWon(false);
    mark({ kind: 'lesson', id: lesson.id, title: pick(lesson.title), extra: 'sound' });
    return () => {
      ed.destroy();
      edRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const build = useCallback(
    async (ov: Record<string, number> = overrides, autoplay = true) => {
      const code = codeRef.current;
      if (countBlanks(code) > 0) {
        setWarn(true);
        return;
      }
      setBusy(true);
      setErr(null);
      // let the "computing…" label appear before the interpreter works
      await new Promise((r) => setTimeout(r, 30));
      const r = await renderSoundScript(code, lesson.seconds, ov);
      setBusy(false);
      if (r.problems || r.error) {
        const p = r.problems?.[0];
        setErr(p ? { line: p.line, message: r.problems!.map((x) => x.message).join('\n') } : r.error!);
        playUi('error');
        return;
      }
      const a = analyze(r.samples);
      setSamples(r.samples);
      setAnalysis(a);
      setFields(r.fields);
      const g = lesson.goals.map((x) => x.check(a));
      setGoals(g);
      if (autoplay) play(r.samples);
      if (g.every(Boolean)) {
        setWon(true);
        const p = useSoundLab.getState();
        if (!p.done.includes(lesson.id)) {
          p.set({ done: [...p.done, lesson.id] });
          addXp(20);
        }
        playUi('success');
      }
    },
    [lesson, overrides, addXp],
  );

  const slide = (name: string, v: number) => {
    const ov = { ...overrides, [name]: v };
    setOverrides(ov);
    setFields((fs) => fs.map((f) => (f.name === name ? { ...f, value: v } : f)));
    clearTimeout(slideTimer.current);
    slideTimer.current = window.setTimeout(() => void build(ov), 250);
  };
  const slideTimer = useRef(0);
  const idx = SOUND_LESSONS.indexOf(lesson);
  const next = SOUND_LESSONS[idx + 1];
  const info = err ? explainError(err.message) : null;
  const range = (f: SoundField) => {
    const v = Math.abs(f.value) || 1;
    return { min: f.value < 0 ? -v * 3 : 0, max: v * 3, step: f.type === 'int' ? 1 : v >= 50 ? 1 : v >= 5 ? 0.1 : 0.01 };
  };

  return (
    <div className="snd-main">
      <section className="snd-left">
        <div className="snd-lessons" role="list">
          {SOUND_LESSONS.map((l, i) => (
            <button key={l.id} role="listitem" className={`sh-dot${l.id === lesson.id ? ' on' : ''}${prog.done.includes(l.id) ? ' done' : ''}`} onClick={() => prog.set({ lesson: l.id })} title={`${i + 1}. ${pick(l.title)}`} data-testid={`snd-lesson-${l.id}`}>
              {prog.done.includes(l.id) ? '✓' : l.icon}
            </button>
          ))}
        </div>
        <div className="sh-brief" data-testid="snd-brief">
          <h3>
            {lesson.icon} {pick(lesson.title)} <span className="muted small">{idx + 1}/{SOUND_LESSONS.length}</span>
          </h3>
          <p className="sh-radio">🎧 <i>{pick(lesson.story)}</i></p>
          <p className="sh-task">🎯 {pick(lesson.task)}</p>
          <div className="sh-words">
            {lesson.words.map((w) => (
              <span key={w.word} className="sh-word" title={pick(w.say)}>
                <code>{w.word}</code> — {pick(w.say)}
              </span>
            ))}
          </div>
        </div>
        <div className="sh-actions">
          <button className="btn primary big" onClick={() => void build()} disabled={busy} data-testid="snd-build">
            <Play size={16} /> {busy ? tr('Computing the sound…', 'Считаю звук…') : tr('Build and listen', 'Собрать и послушать')}
          </button>
          {blanks > 0 ? <span className={`sh-blanks${warn ? ' warn' : ''}`} data-testid="snd-blanks">✏️ {tr(`Blanks to fill: ${blanks}`, `Пропусков: ${blanks}`)}</span> : <span className="sh-blanks ok">✅ {tr('All blanks filled', 'Все пропуски заполнены')}</span>}
        </div>
        <div className="sh-tools">
          <button className="btn small" onClick={() => setReading(true)}>
            📖 {tr('Read simply', 'Читать просто')}
          </button>
          <button className="btn small" onClick={() => setHints((h) => Math.min(lesson.hints.length, h + 1))} disabled={hints >= lesson.hints.length} data-testid="snd-hint">
            <Lightbulb size={14} /> {tr('Hint', 'Подсказка')}
          </button>
          {hints >= lesson.hints.length ? (
            <button className="btn small ghost" onClick={() => confirm(tr('Show the answer?', 'Показать ответ?')) && edRef.current?.setText(answerCode(lesson.code()))} data-testid="snd-answer">
              {tr('Show the answer', 'Показать ответ')}
            </button>
          ) : null}
        </div>
        {hints ? (
          <div className="sh-hints">
            {lesson.hints.slice(0, hints).map((h, i) => (
              <p key={i}>💡 {pick(h)}</p>
            ))}
          </div>
        ) : null}
        <div className="sh-editor snd-editor" ref={hostRef} data-testid="snd-editor" />
        {err ? (
          <div className="ws-errcard" data-testid="snd-error">
            <div className="ws-err-title">⚠ {info ? errorText(info).title : tr('The script stopped', 'Скрипт остановился')} {err.line >= 0 ? `· ${tr('line', 'строка')} ${err.line + 1}` : ''}</div>
            <p className="ws-err-msg">{err.message}</p>
            {info ? <p>{errorText(info).fix}</p> : null}
          </div>
        ) : null}
        <details className="sh-unity">
          <summary>🛠 {tr('The same in the real Unity', 'То же самое в настоящей Unity')}</summary>
          <p>{pick(lesson.inUnity)}</p>
        </details>
        {reading ? <ReaderModal code={codeRef.current} title={pick(lesson.title)} onClose={() => setReading(false)} /> : null}
      </section>
      <section className="snd-right">
        <div className="sh-goals snd-goals" data-testid="snd-goals">
          {lesson.goals.map((g, i) => (
            <div key={i} className={goals[i] ? 'done' : ''} data-testid="snd-goal">
              {goals[i] ? '✓' : '○'} {pick(g.text)}
            </div>
          ))}
        </div>
        <Scope samples={samples} analysis={analysis} slowSamples={() => stretch2x(samples)} title={lesson.file.replace('.cs', '')} />
        {fields.length ? (
          <div className="snd-inspector" data-testid="snd-inspector">
            <h4>Inspector · {tr('move a slider — hear the difference', 'двигай ползунок — слышишь разницу')}</h4>
            {fields.map((f) => {
              const r = range({ ...f, value: overrides[f.name] !== undefined ? f.value : f.value });
              return (
                <label key={f.name} className="snd-slider">
                  <span>{f.name}</span>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={f.value} onChange={(e) => slide(f.name, Number(e.target.value))} data-testid={`snd-field-${f.name}`} />
                  <b>{Number.isInteger(f.value) ? f.value : f.value.toFixed(2)}</b>
                </label>
              );
            })}
          </div>
        ) : null}
        {won ? (
          <div className="snd-won" data-testid="snd-won">
            <b>✅ {tr('Sound made!', 'Звук готов!')}</b> <span className="sh-xp">+20 XP</span>
            {next ? (
              <button className="btn primary small" onClick={() => prog.set({ lesson: next.id })} data-testid="snd-next">
                {tr('Next lesson →', 'Следующий урок →')}
              </button>
            ) : null}
            <UseInGame samples={samples} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function SoundLab() {
  const tab = useSoundLab((s) => s.tab);
  const set = useSoundLab((s) => s.set);
  const done = useSoundLab((s) => s.done.length);
  return (
    <div className="snd" data-testid="sound-lab">
      <div className="snd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'lessons'} className={tab === 'lessons' ? 'on' : ''} onClick={() => set({ tab: 'lessons' })} data-testid="snd-tab-lessons">
          📘 {tr('Sound lessons', 'Уроки звука')} <span className="muted small">{done}/{SOUND_LESSONS.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'synth'} className={tab === 'synth' ? 'on' : ''} onClick={() => set({ tab: 'synth' })} data-testid="snd-tab-synth">
          🎛 {tr('Synthesizer', 'Синтезатор')}
        </button>
      </div>
      {tab === 'lessons' ? <Lessons /> : <Synth />}
    </div>
  );
}

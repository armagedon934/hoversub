// Panels under a 3D game: the live Inspector (change the numbers of your script while it plays),
// the brain of the built-in bots (characters and sliders), and the spectator controls (watch a bot
// through its eyes or from behind, with its field of view drawn).

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { pick, tr, type Text2 } from '../i18n';
import { DEFAULT_PROFILE, type BotProfile, type World3D } from '../run/unity3d';
import type { VisionLabel } from './Scene3D';

const T = (en: string, ru: string): Text2 => ({ en, ru });

/** Public numbers of the learner's script, editable while the game runs. */
export function LiveInspector({ world, tick }: { world: World3D | null; tick: number }) {
  void tick;
  const fields = world?.learnerFields() ?? [];
  if (!fields.length) return null;
  return (
    <div className="gp-panel" data-testid="live-inspector">
      <h4>Inspector · {tr('change while it plays — see the effect at once', 'меняй прямо во время игры — эффект сразу')}</h4>
      {fields.map(({ name, cell }) => {
        const v = cell.v as number;
        const base = Math.max(1, Math.abs(v));
        const isInt = cell.type === 'int';
        return (
          <label key={name} className="snd-slider">
            <span>{name}</span>
            <input
              type="range"
              min={v < 0 ? -base * 3 : 0}
              max={base * 3}
              step={isInt ? 1 : base >= 50 ? 1 : base >= 5 ? 0.1 : 0.01}
              defaultValue={v}
              onChange={(e) => {
                cell.v = isInt ? Math.round(Number(e.target.value)) : Number(e.target.value);
              }}
              data-testid={`li-${name}`}
            />
            <b>{isInt ? v : v.toFixed(2)}</b>
          </label>
        );
      })}
    </div>
  );
}

const PROFILE_FIELDS: { k: keyof BotProfile; label: Text2; min: number; max: number; step: number }[] = [
  { k: 'reaction', label: T('Reaction time, s', 'Время реакции, с'), min: 0, max: 1.5, step: 0.05 },
  { k: 'turnSpeed', label: T('Turn speed, °/s', 'Скорость поворота, °/с'), min: 60, max: 1200, step: 10 },
  { k: 'stiffness', label: T('Hand strength (spring)', 'Сила руки (пружина)'), min: 10, max: 200, step: 5 },
  { k: 'damping', label: T('Overshoot ← → exact stop', 'Перелёт ← → точная остановка'), min: 0.2, max: 1.2, step: 0.02 },
  { k: 'aimError', label: T('Aim error at start, °', 'Ошибка прицела в начале, °'), min: 0, max: 25, step: 0.5 },
  { k: 'settle', label: T('Aim calms down, per s', 'Прицел успокаивается, в с'), min: 0.2, max: 8, step: 0.1 },
  { k: 'viewAngle', label: T('Field of view, ° each side', 'Поле зрения, ° в каждую сторону'), min: 20, max: 180, step: 5 },
  { k: 'sight', label: T('Sees how far, m', 'Видит на сколько, м'), min: 3, max: 50, step: 1 },
  { k: 'hearing', label: T('Hears shots, m', 'Слышит выстрелы, м'), min: 0, max: 60, step: 1 },
  { k: 'glance', label: T('Glances per second', 'Оглядываний в секунду'), min: 0, max: 2, step: 0.05 },
  { k: 'memory', label: T('Remembers you, s', 'Помнит тебя, с'), min: 0, max: 20, step: 0.5 },
];

const CHARACTERS: { id: string; name: Text2; p: Partial<BotProfile> }[] = [
  { id: 'rookie', name: T('Rookie', 'Новичок'), p: { reaction: 0.8, turnSpeed: 220, stiffness: 35, damping: 0.55, aimError: 14, settle: 1, viewAngle: 55, hearing: 12, glance: 0.2, memory: 3 } },
  { id: 'normal', name: T('Normal', 'Обычный'), p: { ...DEFAULT_PROFILE } },
  { id: 'pro', name: T('Pro', 'Профи'), p: { reaction: 0.25, turnSpeed: 700, stiffness: 120, damping: 0.75, aimError: 4, settle: 4, viewAngle: 75, hearing: 40, glance: 0.8, memory: 10 } },
  { id: 'robot', name: T('Robot (unfair)', 'Робот (нечестный)'), p: { reaction: 0, turnSpeed: 5000, stiffness: 2000, damping: 1, aimError: 0, settle: 20, viewAngle: 180, hearing: 60, glance: 0, memory: 20 } },
];

/** The brain of the built-in bots: pick a character or move the sliders — all bots change live. */
export function BotBrainPanel({ world, tick }: { world: World3D | null; tick: number }) {
  void tick;
  const bots = world?.level.botBrain === 'script' ? [] : (world?.watchable() ?? []);
  const [, force] = useState(0);
  if (!world || !bots.length) return null;
  const p = bots[0].bot!.profile;
  const apply = (q: Partial<BotProfile>) => {
    for (const b of world.objects) if (b.bot) b.bot.profile = { ...b.bot.profile, ...q };
    force((n) => n + 1);
  };
  return (
    <div className="gp-panel" data-testid="bot-brain">
      <h4>🧠 {tr('Bot brain — change it and watch them', 'Мозг ботов — меняй и наблюдай')}</h4>
      <div className="gp-row">
        {CHARACTERS.map((c) => (
          <button key={c.id} className="btn small" onClick={() => apply(c.p)} data-testid={`bb-${c.id}`}>
            {pick(c.name)}
          </button>
        ))}
      </div>
      {PROFILE_FIELDS.map((f) => (
        <label key={f.k} className="snd-slider">
          <span>{pick(f.label)}</span>
          <input type="range" min={f.min} max={f.max} step={f.step} value={p[f.k]} onChange={(e) => apply({ [f.k]: Number(e.target.value) })} data-testid={`bb-${f.k}`} />
          <b>{p[f.k] >= 10 ? Math.round(p[f.k]) : p[f.k].toFixed(2)}</b>
        </label>
      ))}
    </div>
  );
}

const STATE_NAME: Record<string, Text2> = {
  patrol: T('patrol', 'патруль'),
  react: T('noticed!', 'заметил!'),
  attack: T('attack', 'атака'),
  search: T('searching', 'ищет'),
  chase: T('chasing', 'догоняет'),
  dead: T('out', 'выбыл'),
};

/** Labels over the bots: their state, reaction countdown and aim error. */
export function VisionLabels({ labels }: { labels: VisionLabel[] }) {
  return (
    <>
      {labels.map((l) => (
        <div key={l.name} className={`gp-label st-${l.state}`} style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}>
          <b>{l.name}</b> {pick(STATE_NAME[l.state] ?? T(l.state, l.state))}
          {l.reactLeft > 0 ? ` ⏱${l.reactLeft.toFixed(2)}` : ''}
          {l.state === 'attack' ? ` 🎯±${l.aimErr.toFixed(1)}°` : ''}
        </div>
      ))}
    </>
  );
}

/** Spectator: watch any bot through its eyes or from behind. */
export function SpectatorBar({ world, vision, setVision, onChange }: { world: World3D | null; vision: boolean; setVision: (v: boolean) => void; onChange: () => void }) {
  if (!world) return null;
  const bots = world.watchable();
  const sp = world.spectate;
  const cycle = (d: number) => {
    if (!bots.length) return;
    const i = sp ? bots.indexOf(sp.bot) : -1;
    world.spectate = { bot: bots[(i + d + bots.length) % bots.length], mode: sp?.mode ?? 'follow' };
    onChange();
  };
  return (
    <div className="gp-row" data-testid="spectator-bar">
      <button className={`btn small${vision ? ' on' : ''}`} onClick={() => setVision(!vision)} data-testid="vision-toggle" title={tr('Draw what bots see and think', 'Показать, что боты видят и думают')}>
        {vision ? <EyeOff size={14} /> : <Eye size={14} />} {tr('Bot vision', 'Зрение ботов')}
      </button>
      {bots.length ? (
        <>
          <button className={`btn small${sp ? ' on' : ''}`} onClick={() => (sp ? ((world.spectate = null), onChange()) : cycle(1))} data-testid="spectate-toggle">
            👁 {sp ? tr('Back to my eyes', 'Вернуться к себе') : tr('Watch the bots', 'Наблюдать за ботами')}
          </button>
          {sp ? (
            <>
              <button className="btn small" onClick={() => cycle(-1)} aria-label={tr('Previous bot', 'Предыдущий бот')}>
                ◀
              </button>
              <b className="small">{sp.bot.name}</b>
              <button className="btn small" onClick={() => cycle(1)} aria-label={tr('Next bot', 'Следующий бот')} data-testid="spectate-next">
                ▶
              </button>
              <button className="btn small" onClick={() => ((world.spectate = { ...sp, mode: sp.mode === 'eyes' ? 'follow' : 'eyes' }), onChange())} data-testid="spectate-mode">
                {sp.mode === 'eyes' ? tr('From behind', 'Со спины') : tr('Through its eyes', 'Его глазами')}
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

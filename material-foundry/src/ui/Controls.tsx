import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Dices, Info, Lock, LockOpen, RotateCcw } from 'lucide-react';
import { PRESETS } from '../engine/presets';
import { FAMILIES, getFamily, isParamVisible } from '../engine/registry';
import { MAX_SEED } from '../engine/schema';
import type { ParamDef, ParamGroup, ParamValue } from '../engine/types';
import { useStore } from '../state/store';

const GROUP_LABEL: Record<ParamGroup, string> = {
  colors: 'Colors',
  pattern: 'Pattern & structure',
  surface: 'Surface',
  wear: 'Wear & damage',
  emission: 'Emission',
  advanced: 'Advanced',
};

const GROUP_ORDER: ParamGroup[] = ['colors', 'pattern', 'surface', 'wear', 'emission', 'advanced'];

function Section({ title, defaultOpen = true, children, id }: { title: string; defaultOpen?: boolean; children: ReactNode; id: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section" data-section={id}>
      <button className="section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function formatValue(def: ParamDef & { type: 'range' }, v: number): string {
  if (def.integer) return String(Math.round(v));
  if (def.max <= 1 && def.min >= 0) return `${Math.round(v * 100)}%`;
  return v.toFixed(2);
}

export function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  help,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  help?: string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-label">
          {label}
          {help && (
            <span className="help-dot" title={help} aria-label={help}>
              <Info size={12} />
            </span>
          )}
        </span>
        <span className="ctl-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        data-testid={testId}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ParamControl({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void }) {
  switch (def.type) {
    case 'range':
      return (
        <RangeControl
          label={def.label}
          value={value as number}
          min={def.min}
          max={def.max}
          step={def.step}
          help={def.help}
          display={formatValue(def, value as number)}
          onChange={onChange}
          testId={`param-${def.key}`}
        />
      );
    case 'color':
      return (
        <label className="color-ctl" title={def.help}>
          <input type="color" value={value as string} onChange={(e) => onChange(e.target.value)} aria-label={def.label} data-testid={`param-${def.key}`} />
          <span className="ctl-label" style={{ flex: 1 }}>
            {def.label}
          </span>
          <span className="hex">{String(value).toUpperCase()}</span>
        </label>
      );
    case 'select':
      return (
        <div className="ctl">
          <span className="ctl-label">
            {def.label}
            {def.help && (
              <span className="help-dot" title={def.help}>
                <Info size={12} />
              </span>
            )}
          </span>
          <select className="input" value={value as string} onChange={(e) => onChange(e.target.value)} aria-label={def.label} data-testid={`param-${def.key}`}>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'toggle':
      return (
        <div className="toggle" onClick={() => onChange(!(value as boolean))} role="switch" aria-checked={value as boolean} aria-label={def.label} data-testid={`param-${def.key}`}>
          <span>{def.label}</span>
          <button className={`switch ${value ? 'on' : ''}`} tabIndex={-1} aria-hidden />
        </div>
      );
  }
}

function SeedRow() {
  const seed = useStore((s) => s.settings.seed);
  const setSeed = useStore((s) => s.setSeed);
  const randomize = useStore((s) => s.randomizeSeed);
  const locked = useStore((s) => s.prefs.seedLocked);
  const setPrefs = useStore((s) => s.setPrefs);
  const [text, setText] = useState(String(seed));
  useEffect(() => setText(String(seed)), [seed]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_SEED) setSeed(n);
    else setText(String(seed));
  };
  return (
    <div className="seed-row row">
      <label htmlFor="seed-input">Seed</label>
      <input
        id="seed-input"
        className="input"
        inputMode="numeric"
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        data-testid="seed-input"
      />
      <button className="btn small" onClick={randomize} disabled={locked} title="Random seed (same settings, new random layout)" data-testid="randomize-seed">
        <Dices size={14} /> Randomize
      </button>
      <button
        className={`btn small icon ${locked ? 'active' : ''}`}
        onClick={() => setPrefs({ seedLocked: !locked })}
        title={locked ? 'Seed locked: presets and variations keep this seed. Click to unlock.' : 'Lock seed: keep this seed when switching presets and generating variations'}
        aria-pressed={locked}
        data-testid="seed-lock"
      >
        {locked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
    </div>
  );
}

export function Controls() {
  const settings = useStore((s) => s.settings);
  const setParam = useStore((s) => s.setParam);
  const loadPreset = useStore((s) => s.loadPreset);
  const resetToPreset = useStore((s) => s.resetToPreset);
  const renameCurrent = useStore((s) => s.renameCurrent);
  const workingRes = useStore((s) => s.prefs.workingRes);
  const setPrefs = useStore((s) => s.setPrefs);
  const family = getFamily(settings.family);
  const [name, setName] = useState(settings.name);
  useEffect(() => setName(settings.name), [settings.name]);

  const byGroup = new Map<ParamGroup, ParamDef[]>();
  for (const d of family.params) {
    if (!isParamVisible(d, settings.params)) continue;
    const list = byGroup.get(d.group) ?? [];
    list.push(d);
    byGroup.set(d.group, list);
  }

  const switchFamily = (id: string) => {
    const first = PRESETS.find((p) => p.family === id);
    if (first) loadPreset(first.id);
  };

  return (
    <aside className="panel right" aria-label="Material controls">
      <div className="mat-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="family">{family.label}</span>
        </div>
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameCurrent(name)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Material name"
          data-testid="material-name"
        />
        <p className="desc">{family.description}</p>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="input" value={settings.family} onChange={(e) => switchFamily(e.target.value)} aria-label="Material family" data-testid="family-select">
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SeedRow />
      <div className="panel-scroll" data-testid="controls">
        {GROUP_ORDER.map((g) => {
          const defs = byGroup.get(g) ?? [];
          if (g === 'advanced') {
            return (
              <Section key={g} id={g} title={GROUP_LABEL[g]} defaultOpen={false}>
                {defs.map((d) => (
                  <ParamControl key={d.key} def={d} value={settings.params[d.key]} onChange={(v) => setParam(d.key, v)} />
                ))}
                <div className="ctl">
                  <span className="ctl-label">Working (preview) resolution</span>
                  <div className="seg" role="radiogroup" aria-label="Working resolution">
                    {([256, 512, 1024] as const).map((r) => (
                      <button key={r} className={workingRes === r ? 'on' : ''} onClick={() => setPrefs({ workingRes: r })} role="radio" aria-checked={workingRes === r}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <span className="hint">Used for editing and previews only. Exports regenerate natively at the export resolution.</span>
                </div>
              </Section>
            );
          }
          if (!defs.length) return null;
          return (
            <Section key={g} id={g} title={GROUP_LABEL[g]}>
              {defs.map((d) => (
                <ParamControl key={d.key} def={d} value={settings.params[d.key]} onChange={(v) => setParam(d.key, v)} />
              ))}
            </Section>
          );
        })}
      </div>
      <div className="panel-foot">
        <button className="btn" onClick={resetToPreset} title="Restore every parameter of the current preset" data-testid="reset-preset">
          <RotateCcw size={14} /> Reset to preset
        </button>
      </div>
    </aside>
  );
}

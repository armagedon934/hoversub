import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { getFamily } from '../engine/registry';
import { makeVariations } from '../engine/variations';
import type { MaterialSettings } from '../engine/types';
import { useStore } from '../state/store';
import { useThumbs, settingsKey } from '../state/thumbs';
import { Priority } from '../worker/client';
import { Swatch } from './Swatch';

function describe(v: MaterialSettings, base: MaterialSettings): string[] {
  const fam = getFamily(v.family);
  const lines: string[] = [`Seed ${v.seed}`];
  for (const { key } of fam.variationKeys) {
    const a = v.params[key];
    const b = base.params[key];
    if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) > 1e-6) {
      const def = fam.params.find((d) => d.key === key);
      lines.push(`${def?.label ?? key} ${a > b ? '+' : '−'}${Math.round(Math.abs(a - b) * 100)}%`);
    }
  }
  return lines;
}

export function Variations() {
  const settings = useStore((s) => s.settings);
  const seedLocked = useStore((s) => s.prefs.seedLocked);
  const applySettings = useStore((s) => s.applySettings);
  const request = useThumbs((s) => s.request);
  const thumbs = useThumbs((s) => s.thumbs);
  const errors = useThumbs((s) => s.errors);
  const [vars, setVars] = useState<{ base: MaterialSettings; list: MaterialSettings[] } | null>(null);

  const generate = () => {
    const list = makeVariations(settings, seedLocked);
    setVars({ base: settings, list });
    for (const v of list) request(`var:${settingsKey(v)}`, v, 160, Priority.Interactive);
  };

  const stale = vars && vars.base.family !== settings.family;

  return (
    <div className="variations" data-testid="variations">
      <div className="vhead">
        <button className="btn" onClick={generate} title="Generate four variations of the current material" data-testid="generate-variations">
          <Shuffle size={14} /> 4 Variations
        </button>
        <p>{seedLocked ? 'Seed is locked: only bounded parameters vary.' : 'New seeds plus small changes to wear and detail. Click one to apply it.'}</p>
      </div>
      <div className="var-list">
        {!vars || stale ? (
          <div className="var-empty">Variations keep the material family and its essential settings.</div>
        ) : (
          vars.list.map((v, k) => {
            const key = `var:${settingsKey(v)}`;
            return (
              <button key={k} className="var-item" onClick={() => applySettings(v)} title={`Apply ${v.name}`} data-testid={`variation-${k}`}>
                <Swatch thumb={thumbs[key]} error={errors[key]} />
                <span className="meta">
                  <b>Variation {k + 1}</b>
                  {describe(v, vars.base).map((l) => (
                    <span key={l} style={{ display: 'block' }}>
                      {l}
                    </span>
                  ))}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

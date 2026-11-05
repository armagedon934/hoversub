import { useEffect, useMemo, useState } from 'react';
import { Heart, Layers, Trash2 } from 'lucide-react';
import { PRESETS } from '../engine/presets';
import { FAMILIES } from '../engine/registry';
import { settingsFromPreset, useStore, settingsEqual } from '../state/store';
import { settingsKey, useThumbs } from '../state/thumbs';
import { Swatch } from './Swatch';

export function Library() {
  const [tab, setTab] = useState<'presets' | 'favorites'>('presets');
  const [family, setFamily] = useState<string>('all');
  const settings = useStore((s) => s.settings);
  const favorites = useStore((s) => s.favorites);
  const loadPreset = useStore((s) => s.loadPreset);
  const applySettings = useStore((s) => s.applySettings);
  const removeFavorite = useStore((s) => s.removeFavorite);
  const thumbs = useThumbs((s) => s.thumbs);
  const errors = useThumbs((s) => s.errors);
  const request = useThumbs((s) => s.request);

  // Generate real thumbnails for every preset (and favorites) in the background.
  useEffect(() => {
    for (const p of PRESETS) request(`preset:${p.id}`, settingsFromPreset(p));
  }, [request]);
  useEffect(() => {
    for (const f of favorites) request(`fav:${settingsKey(f.settings)}`, f.settings);
  }, [favorites, request]);

  const groups = useMemo(
    () =>
      FAMILIES.filter((f) => family === 'all' || f.id === family).map((f) => ({
        family: f,
        presets: PRESETS.filter((p) => p.family === f.id),
      })),
    [family],
  );

  return (
    <aside className="panel left" aria-label="Material library">
      <div className="lib-head">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'presets'} className={tab === 'presets' ? 'on' : ''} onClick={() => setTab('presets')}>
            <Layers size={14} /> Presets
          </button>
          <button role="tab" aria-selected={tab === 'favorites'} className={tab === 'favorites' ? 'on' : ''} onClick={() => setTab('favorites')}>
            <Heart size={14} /> Favorites{favorites.length ? ` (${favorites.length})` : ''}
          </button>
        </div>
        {tab === 'presets' && (
          <select className="input" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Filter by material family">
            <option value="all">All families ({PRESETS.length} presets)</option>
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="panel-scroll" data-testid="library">
        {tab === 'presets' &&
          groups.map(({ family: f, presets }) => (
            <div className="lib-group" key={f.id}>
              <h4>{f.label}</h4>
              <div className="thumb-grid">
                {presets.map((p) => {
                  const key = `preset:${p.id}`;
                  const selected = settings.presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      className={`thumb ${selected ? 'selected' : ''}`}
                      onClick={() => loadPreset(p.id)}
                      title={`${p.name} — ${p.tags.join(', ')}`}
                      data-preset={p.id}
                    >
                      <Swatch thumb={thumbs[key]} error={errors[key]} />
                      <span className="label">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        {tab === 'favorites' &&
          (favorites.length === 0 ? (
            <div className="empty">
              No favorites yet.
              <br />
              Use <b>Save favorite</b> in the top bar to keep the current material here. Favorites are stored in this browser.
            </div>
          ) : (
            <div className="lib-group">
              <div className="thumb-grid">
                {favorites.map((f) => {
                  const key = `fav:${settingsKey(f.settings)}`;
                  const selected = settingsEqual(f.settings, settings);
                  return (
                    <div key={f.id} className={`thumb ${selected ? 'selected' : ''}`} data-favorite={f.id}>
                      <button
                        style={{ border: 0, padding: 0, background: 'none', textAlign: 'left' }}
                        onClick={() => applySettings(f.settings)}
                        title={`${f.settings.name} · seed ${f.settings.seed}`}
                      >
                        <Swatch thumb={thumbs[key]} error={errors[key]} />
                        <span className="label" style={{ display: 'block' }}>
                          {f.settings.name}
                        </span>
                      </button>
                      <button className="remove" title="Remove from favorites" aria-label={`Remove ${f.settings.name} from favorites`} onClick={() => removeFavorite(f.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}

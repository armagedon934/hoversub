import { useEffect } from 'react';
import { Download, FileImage, FileJson, Package, X } from 'lucide-react';
import { applicableMaps, mapFileName, MAP_INFO, type MapId } from '../export/exporter';
import { getFamily } from '../engine/registry';
import { cancelExport, exportPreviewPng, exportSettingsJson, exportSingleMap, exportZip, useExport } from '../state/exportController';
import { useStore } from '../state/store';
import type { Prefs } from '../state/persistence';

const RESOLUTIONS: Prefs['exportRes'][] = [256, 512, 1024, 2048, 4096];

export function ExportDialog() {
  const open = useStore((s) => s.exportOpen);
  const setOpen = useStore((s) => s.setExportOpen);
  const settings = useStore((s) => s.settings);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const viewMode = prefs.viewMode;
  const ex = useExport();
  const family = getFamily(settings.family);
  const hasEm = family.emits(settings.params);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !ex.running && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ex.running, setOpen]);

  if (!open) return null;
  const opts = { normalConvention: prefs.normalConvention, heightBitDepth: prefs.heightBitDepth };
  const maps: MapId[] = applicableMaps(hasEm, prefs.includeOrm);
  const res = prefs.exportRes;

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && !ex.running && setOpen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Export material" data-testid="export-dialog">
        <div className="dialog-head">
          <h2>Export “{settings.name}”</h2>
          <button className="btn ghost icon" onClick={() => setOpen(false)} disabled={ex.running} aria-label="Close export dialog" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">
          <div>
            <h3>Output settings</h3>
            <div className="field">
              <label>Resolution (square)</label>
              <div className="seg" role="radiogroup" aria-label="Export resolution" data-testid="export-res">
                {RESOLUTIONS.map((r) => (
                  <button key={r} className={res === r ? 'on' : ''} onClick={() => setPrefs({ exportRes: r })} role="radio" aria-checked={res === r} disabled={ex.running}>
                    {r}
                  </button>
                ))}
              </div>
              <span className="hint">
                Every map is regenerated procedurally at {res}×{res}; nothing is upscaled.
                {res === 4096 ? ' 4096 uses about 1.5 GB of temporary memory and may take a minute.' : ''}
              </span>
            </div>
            <div className="field">
              <label>Normal map convention</label>
              <div className="seg" role="radiogroup" aria-label="Normal convention" data-testid="export-normal">
                <button className={prefs.normalConvention === 'opengl' ? 'on' : ''} onClick={() => setPrefs({ normalConvention: 'opengl' })} disabled={ex.running}>
                  OpenGL (Y+)
                </button>
                <button className={prefs.normalConvention === 'directx' ? 'on' : ''} onClick={() => setPrefs({ normalConvention: 'directx' })} disabled={ex.running}>
                  DirectX (Y−)
                </button>
              </div>
              <span className="hint">OpenGL: Blender, Godot, Unity, glTF. DirectX: Unreal Engine. DirectX inverts only the green channel.</span>
            </div>
            <div className="field">
              <label>Height map precision</label>
              <div className="seg" role="radiogroup" aria-label="Height bit depth">
                <button className={prefs.heightBitDepth === 16 ? 'on' : ''} onClick={() => setPrefs({ heightBitDepth: 16 })} disabled={ex.running}>
                  16-bit PNG
                </button>
                <button className={prefs.heightBitDepth === 8 ? 'on' : ''} onClick={() => setPrefs({ heightBitDepth: 8 })} disabled={ex.running}>
                  8-bit PNG
                </button>
              </div>
            </div>
            <label className="toggle" onClick={() => !ex.running && setPrefs({ includeOrm: !prefs.includeOrm })} data-testid="export-orm">
              <span>Include packed ORM texture (R = AO, G = Roughness, B = Metallic)</span>
              <span className={`switch ${prefs.includeOrm ? 'on' : ''}`} />
            </label>
          </div>
          <div>
            <h3>Maps ({maps.length})</h3>
            <div className="file-list">
              {maps.map((m) => (
                <div className="file-row" key={m} title={MAP_INFO[m].description}>
                  <span className="kind">{MAP_INFO[m].label}</span>
                  <span className="fname">{mapFileName(settings, m, res, opts)}</span>
                  <button className="btn small icon" onClick={() => exportSingleMap(m)} disabled={ex.running} title={`Download ${MAP_INFO[m].label} PNG`} aria-label={`Download ${MAP_INFO[m].label}`} data-testid={`export-map-${m}`}>
                    <Download size={13} />
                  </button>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              AO is a height-based approximation, not a ray-traced bake. {hasEm ? 'Emission strength is stored in the settings and README.' : 'This material has no emissive map.'}
            </p>
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={exportSettingsJson} disabled={ex.running} data-testid="export-json">
                <FileJson size={14} /> Settings JSON
              </button>
              <button className="btn" onClick={exportPreviewPng} disabled={ex.running || viewMode !== '3d'} title={viewMode !== '3d' ? 'Switch to the 3D preview to capture it' : 'Save the current 3D view as PNG'} data-testid="export-preview">
                <FileImage size={14} /> Preview PNG
              </button>
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          {ex.running ? (
            <>
              <div className="export-progress" data-testid="export-progress">
                <span className="stage">
                  {ex.label} — {ex.stage} · {Math.round(ex.fraction * 100)}%
                </span>
                <div className="bar">
                  <div style={{ width: `${Math.round(ex.fraction * 100)}%` }} />
                </div>
              </div>
              <button className="btn" onClick={cancelExport} data-testid="export-cancel">
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="grow hint">{ex.lastResult ?? 'The ZIP contains every applicable map, settings.json and a README describing channels and conventions.'}</span>
              <button className="btn primary" onClick={exportZip} data-testid="export-zip">
                <Package size={15} /> Download ZIP ({res}px)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

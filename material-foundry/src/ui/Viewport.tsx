import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Circle,
  Cuboid,
  Image as ImageIcon,
  LoaderCircle,
  Mountain,
  RefreshCw,
  Rotate3d,
  RotateCcw,
  Square,
  Sun,
  TriangleAlert,
  X,
  Layers,
  PanelsTopLeft,
} from 'lucide-react';
import { isWebGLAvailable, PreviewRenderer } from '../preview/renderer';
import type { LightingPreset, PreviewShape } from '../state/persistence';
import { registerSnapshotProvider, exportSingleMap } from '../state/exportController';
import { useStore } from '../state/store';
import { Inspector, mapToRgba } from './Inspector';
import { RangeControl } from './Controls';
import { Variations } from './Variations';
import type { MapId } from '../export/exporter';

const SHAPES: { id: PreviewShape; label: string; icon: typeof Box; hint: string }[] = [
  { id: 'sphere', label: 'Sphere', icon: Circle, hint: 'Overall surface response and roughness' },
  { id: 'wall', label: 'Wall', icon: Square, hint: 'Architectural scale, straight-on' },
  { id: 'floor', label: 'Floor', icon: Layers, hint: 'Grazing light and long-range tiling' },
  { id: 'block', label: 'Block', icon: Cuboid, hint: 'Bevelled block: material on a simple object' },
  { id: 'scene', label: 'Scene', icon: PanelsTopLeft, hint: 'Wall-and-floor corner with crate, block and column' },
];

const LIGHTS: { id: LightingPreset; label: string }[] = [
  { id: 'studio', label: 'Studio' },
  { id: 'sun', label: 'Sunlight' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'dusk', label: 'Dusk' },
];

declare global {
  interface Window {
    __mf?: Record<string, unknown>;
  }
}

function Intro() {
  const show = useStore((s) => s.prefs.showIntro);
  const setPrefs = useStore((s) => s.setPrefs);
  if (!show) return null;
  return (
    <div className="intro" role="dialog" aria-label="How Material Foundry works" data-testid="intro">
      <h3>Make a tileable game material in five steps</h3>
      <ol>
        <li>
          <b>1 · Pick a preset</b>Start from the library on the left.
        </li>
        <li>
          <b>2 · Preview</b>Sphere, wall, floor, block or a small scene.
        </li>
        <li>
          <b>3 · Adjust</b>Colors, pattern, surface and wear on the right.
        </li>
        <li>
          <b>4 · Compare</b>Generate four variations below the preview.
        </li>
        <li>
          <b>5 · Export</b>PNG maps, a ZIP, settings JSON or a preview image.
        </li>
      </ol>
      <button className="btn small ghost icon close" onClick={() => setPrefs({ showIntro: false })} aria-label="Dismiss introduction" title="Dismiss" data-testid="dismiss-intro">
        <X size={14} />
      </button>
    </div>
  );
}

function FallbackView() {
  const material = useStore((s) => s.material);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !material) return;
    const size = material.size;
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    tile.getContext('2d')!.putImageData(new ImageData(mapToRgba(material, 'lit', 'opengl'), size, size), 0, 0);
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const pat = ctx.createPattern(tile, 'repeat');
    if (!pat) return;
    const scale = Math.min(w, h) / (size * 1.6);
    pat.setTransform(new DOMMatrix().scale(scale));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }, [material]);
  return (
    <div className="webgl-fallback">
      <div className="note">
        <TriangleAlert size={14} /> WebGL 2 is not available in this browser, so the 3D preview is disabled. Showing a lit 2D swatch instead; the Map Inspector and all exports still work.
      </div>
      <canvas ref={ref} style={{ flex: 1, width: '100%', height: '100%' }} />
    </div>
  );
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const [webgl] = useState(() => isWebGLAvailable());
  const [initError, setInitError] = useState<string | null>(null);
  const [lightOpen, setLightOpen] = useState(false);
  const material = useStore((s) => s.material);
  const materialDraft = useStore((s) => s.materialDraft);
  const gen = useStore((s) => s.gen);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const regenerate = useStore((s) => s.regenerate);
  const [dims, setDims] = useState('');
  const viewMode = prefs.viewMode;

  // Create / dispose the renderer with the 3D view.
  useEffect(() => {
    if (!webgl || viewMode !== '3d' || !hostRef.current) return;
    let r: PreviewRenderer;
    try {
      r = new PreviewRenderer(hostRef.current);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : String(e));
      return;
    }
    rendererRef.current = r;
    registerSnapshotProvider(() => r.snapshot());
    window.__mf = { ...(window.__mf ?? {}), renderer: r, stats: () => r.stats() };
    return () => {
      registerSnapshotProvider(null);
      rendererRef.current = null;
      r.dispose();
    };
  }, [webgl, viewMode]);

  // Push state into the renderer.
  const r = rendererRef.current;
  useEffect(() => {
    if (!rendererRef.current) return;
    const rr = rendererRef.current;
    rr.setShape(prefs.shape);
    rr.setTileSize(prefs.tileSize);
    rr.setDisplacement(prefs.displacement, prefs.displacementScale);
    rr.setTurntable(prefs.turntable);
    rr.setLighting(prefs.lighting, prefs.lightAzimuth, prefs.lightElevation, prefs.lightIntensity);
    setDims(rr.dimensions());
  }, [r, prefs.shape, prefs.tileSize, prefs.displacement, prefs.displacementScale, prefs.turntable, prefs.lighting, prefs.lightAzimuth, prefs.lightElevation, prefs.lightIntensity]);

  useEffect(() => {
    if (rendererRef.current && material) rendererRef.current.setMaterial(material);
  }, [r, material]);

  const shownRes = material ? `${material.size}px${materialDraft ? ' draft' : ''}` : '';

  return (
    <div className="center">
      <div className="view-toolbar" role="toolbar" aria-label="Preview options">
        <div className="seg" role="tablist" aria-label="View mode">
          <button className={viewMode === '3d' ? 'on' : ''} onClick={() => setPrefs({ viewMode: '3d' })} role="tab" aria-selected={viewMode === '3d'} data-testid="mode-3d" title="3D preview">
            <Box size={14} /> 3D
          </button>
          <button className={viewMode === 'maps' ? 'on' : ''} onClick={() => setPrefs({ viewMode: 'maps' })} role="tab" aria-selected={viewMode === 'maps'} data-testid="mode-maps" title="2D map inspector">
            <ImageIcon size={14} /> Maps
          </button>
        </div>
        {viewMode === '3d' && (
          <>
            <div className="seg" role="radiogroup" aria-label="Preview object">
              {SHAPES.map((s) => (
                <button key={s.id} className={prefs.shape === s.id ? 'on' : ''} onClick={() => setPrefs({ shape: s.id })} title={`${s.label}: ${s.hint}`} role="radio" aria-checked={prefs.shape === s.id} data-testid={`shape-${s.id}`}>
                  <s.icon size={14} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
            <div className="anchor">
              <button className={`btn small ${lightOpen ? 'active' : ''}`} onClick={() => setLightOpen(!lightOpen)} title="Lighting and preview settings" aria-expanded={lightOpen} data-testid="lighting-button">
                <Sun size={14} /> Lighting
              </button>
              {lightOpen && (
                <div className="popover" style={{ left: 0 }} data-testid="lighting-popover">
                  <div className="field">
                    <label>Light preset</label>
                    <div className="seg">
                      {LIGHTS.map((l) => (
                        <button key={l.id} className={prefs.lighting === l.id ? 'on' : ''} onClick={() => setPrefs({ lighting: l.id })}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="section-body" style={{ padding: 0 }}>
                    <RangeControl label="Light direction" value={prefs.lightAzimuth} min={-180} max={180} step={1} display={`${prefs.lightAzimuth}°`} onChange={(v) => setPrefs({ lightAzimuth: v })} />
                    <RangeControl label="Light elevation" value={prefs.lightElevation} min={5} max={90} step={1} display={`${prefs.lightElevation}°`} onChange={(v) => setPrefs({ lightElevation: v })} />
                    <RangeControl label="Light intensity" value={prefs.lightIntensity} min={0} max={3} step={0.05} display={prefs.lightIntensity.toFixed(2)} onChange={(v) => setPrefs({ lightIntensity: v })} />
                    <RangeControl
                      label="Preview tile size"
                      value={prefs.tileSize}
                      min={0.25}
                      max={8}
                      step={0.25}
                      display={`${prefs.tileSize.toFixed(2)} m`}
                      help="Physical size of one texture tile on the preview objects. This only changes the preview repeat, never the exported texture."
                      onChange={(v) => setPrefs({ tileSize: v })}
                    />
                    <label className="toggle" onClick={() => setPrefs({ displacement: !prefs.displacement })}>
                      <span>Displacement (relief geometry)</span>
                      <span className={`switch ${prefs.displacement ? 'on' : ''}`} />
                    </label>
                    {prefs.displacement && (
                      <RangeControl label="Displacement scale" value={prefs.displacementScale} min={0} max={3} step={0.05} display={`${prefs.displacementScale.toFixed(2)}×`} onChange={(v) => setPrefs({ displacementScale: v })} />
                    )}
                    <span className="hint">
                      Relief always uses the normal map. Displacement additionally moves vertices of a densely subdivided preview mesh; its quality depends on mesh subdivision, and hard mesh edges (block corners) can open small gaps.
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button className={`btn small ${prefs.turntable ? 'active' : ''}`} onClick={() => setPrefs({ turntable: !prefs.turntable })} title="Turntable rotation" aria-pressed={prefs.turntable} data-testid="turntable">
              <Rotate3d size={14} />
              <span className="btn-label">Turntable</span>
            </button>
            <button className="btn small" onClick={() => rendererRef.current?.resetCamera()} title="Reset camera" data-testid="reset-camera">
              <RotateCcw size={14} />
              <span className="btn-label">Reset view</span>
            </button>
          </>
        )}
      </div>
      <div className="viewport" onClick={() => lightOpen && setLightOpen(false)}>
        {viewMode === '3d' && webgl && !initError && <div className="preview-host" ref={hostRef} data-testid="preview-host" />}
        {viewMode === '3d' && (!webgl || initError) && <FallbackView />}
        {viewMode === 'maps' && material && <Inspector material={material} onExportMap={() => exportSingleMap(prefs.inspectMap as MapId)} />}
        {viewMode === '3d' && (
          <div className="overlay-bl">
            <span className="chip" data-testid="dimensions">
              <Mountain size={12} /> {dims} · 1 tile = {prefs.tileSize.toFixed(2)} m · ruler = 1 m
            </span>
          </div>
        )}
        <div className="overlay-br">
          {gen.busy ? (
            <div className="chip progress-chip" data-testid="gen-progress">
              <span className="row">
                <LoaderCircle size={12} className="spin" /> {gen.stage} · {Math.round(gen.fraction * 100)}%
              </span>
              <div className="bar">
                <div style={{ width: `${Math.round(gen.fraction * 100)}%` }} />
              </div>
            </div>
          ) : (
            material && (
              <span className="chip" data-testid="gen-status">
                {shownRes} · {material.timings.wall ? `${Math.round(material.timings.wall)} ms` : 'ready'}
              </span>
            )
          )}
        </div>
        {gen.error && (
          <div className="error-state" data-testid="gen-error">
            <TriangleAlert size={22} color="var(--danger)" />
            <div>
              Material generation failed: {gen.error}
              {material ? <div className="hint">The last completed material is still shown.</div> : null}
            </div>
            <button className="btn" onClick={regenerate}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}
        {!material && !gen.error && (
          <div className="error-state">
            <LoaderCircle size={22} className="spin" /> Generating the first material…
          </div>
        )}
        <Intro />
      </div>
      <Variations />
    </div>
  );
}

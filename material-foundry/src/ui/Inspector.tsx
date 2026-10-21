import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Grid3x3, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import type { GeneratedMaterial } from '../engine/generate';
import { renderSwatch } from '../engine/swatch';
import type { InspectMap } from '../state/persistence';
import { useStore } from '../state/store';

export const INSPECT_OPTIONS: { id: InspectMap; label: string }[] = [
  { id: 'basecolor', label: 'Base Color' },
  { id: 'normal', label: 'Normal' },
  { id: 'roughness', label: 'Roughness' },
  { id: 'metallic', label: 'Metallic' },
  { id: 'height', label: 'Height' },
  { id: 'ao', label: 'AO (approx.)' },
  { id: 'emissive', label: 'Emissive' },
  { id: 'orm', label: 'ORM packed' },
  { id: 'lit', label: 'Lit swatch' },
];

/** Build RGBA pixels for the requested map view (same data the 3D preview uses). */
export function mapToRgba(m: GeneratedMaterial, which: InspectMap, convention: 'opengl' | 'directx'): Uint8ClampedArray<ArrayBuffer> {
  const n = m.size * m.size;
  const maps = m.maps;
  const out = new Uint8ClampedArray(n * 4);
  const gray = (src: ArrayLike<number>, shift = 0) => {
    for (let i = 0; i < n; i++) {
      const v = shift ? src[i] >> shift : src[i];
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    }
  };
  switch (which) {
    case 'basecolor':
      out.set(maps.baseColor);
      break;
    case 'normal':
      out.set(maps.normal);
      if (convention === 'directx') for (let i = 1; i < out.length; i += 4) out[i] = 255 - out[i];
      break;
    case 'roughness':
      gray(maps.roughness);
      break;
    case 'metallic':
      gray(maps.metallic);
      break;
    case 'ao':
      gray(maps.ao);
      break;
    case 'height':
      gray(maps.height16, 8);
      break;
    case 'emissive':
      if (maps.emissive) out.set(maps.emissive);
      else for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
      break;
    case 'orm':
      for (let i = 0; i < n; i++) {
        out[i * 4] = maps.ao[i];
        out[i * 4 + 1] = maps.roughness[i];
        out[i * 4 + 2] = maps.metallic[i];
        out[i * 4 + 3] = 255;
      }
      break;
    case 'lit':
      out.set(renderSwatch(maps, { dir: [-0.45, 0.55, 0.7], intensity: 1, emissionStrength: m.emissionStrength }));
      break;
  }
  return out;
}

function describePixel(m: GeneratedMaterial, x: number, y: number, which: InspectMap, convention: 'opengl' | 'directx'): string {
  const i = y * m.size + x;
  const mp = m.maps;
  const c = (a: ArrayLike<number>) => `${a[i * 4]}, ${a[i * 4 + 1]}, ${a[i * 4 + 2]}`;
  switch (which) {
    case 'basecolor':
      return `RGB ${c(mp.baseColor)}`;
    case 'normal': {
      const g = convention === 'directx' ? 255 - mp.normal[i * 4 + 1] : mp.normal[i * 4 + 1];
      return `R ${mp.normal[i * 4]}  G ${g}  B ${mp.normal[i * 4 + 2]}`;
    }
    case 'roughness':
      return `Roughness ${(mp.roughness[i] / 255).toFixed(3)}`;
    case 'metallic':
      return `Metallic ${(mp.metallic[i] / 255).toFixed(3)}`;
    case 'ao':
      return `AO ${(mp.ao[i] / 255).toFixed(3)}`;
    case 'height':
      return `Height ${(mp.height16[i] / 65535).toFixed(4)} (16-bit ${mp.height16[i]})`;
    case 'emissive':
      return mp.emissive ? `RGB ${c(mp.emissive)}` : 'No emission';
    case 'orm':
      return `AO ${mp.ao[i]}  R ${mp.roughness[i]}  M ${mp.metallic[i]}`;
    case 'lit':
      return `RGB ${c(mp.baseColor)} (base)`;
  }
}

export function Inspector({ material, onExportMap }: { material: GeneratedMaterial; onExportMap: () => void }) {
  const which = useStore((s) => s.prefs.inspectMap);
  const tiled = useStore((s) => s.prefs.inspectTiled);
  const convention = useStore((s) => s.prefs.normalConvention);
  const setPrefs = useStore((s) => s.setPrefs);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [readout, setReadout] = useState<string>('');
  const [hostSize, setHostSize] = useState({ w: 1, h: 1 });

  const source = useMemo(() => {
    const size = material.size;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(new ImageData(mapToRgba(material, which, convention), size, size), 0, 0);
    return c;
  }, [material, which, convention]);

  const fit = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const span = material.size * (tiled ? 3 : 1);
    const zoom = Math.min(el.clientWidth, el.clientHeight) / span * 0.92;
    setView({ zoom, x: 0, y: 0 });
  }, [material.size, tiled]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHostSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit whenever the tiling mode or material resolution changes.
  useEffect(() => {
    fit();
  }, [fit, hostSize.w > 1]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(hostSize.w * dpr);
    c.height = Math.round(hostSize.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, c.width, c.height);
    const z = view.zoom * dpr;
    const size = material.size;
    const cx = c.width / 2 + view.x * dpr;
    const cy = c.height / 2 + view.y * dpr;
    ctx.imageSmoothingEnabled = view.zoom < 2;
    ctx.imageSmoothingQuality = 'high';
    const reps = tiled ? [-1, 0, 1] : [0];
    for (const ty of reps) {
      for (const tx of reps) {
        ctx.drawImage(source, cx + (tx - 0.5) * size * z, cy + (ty - 0.5) * size * z, size * z, size * z);
      }
    }
    if (tiled) {
      // Outline the central tile so seams between tiles can be inspected deliberately.
      ctx.strokeStyle = 'rgba(224,162,74,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(cx - 0.5 * size * z, cy - 0.5 * size * z, size * z, size * z);
    }
  }, [source, view, tiled, hostSize, material.size]);

  const toTexel = (clientX: number, clientY: number): [number, number] | null => {
    const el = hostRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const size = material.size;
    const px = (clientX - r.left - r.width / 2 - view.x) / view.zoom + size / 2;
    const py = (clientY - r.top - r.height / 2 - view.y) / view.zoom + size / 2;
    const span = tiled ? 1.5 * size : 0.5 * size;
    if (px < size / 2 - span || px >= size / 2 + span || py < size / 2 - span || py >= size / 2 + span) return null;
    const x = ((Math.floor(px) % size) + size) % size;
    const y = ((Math.floor(py) % size) + size) % size;
    return [x, y];
  };

  const zoomBy = (k: number, ax = 0, ay = 0) => {
    setView((v) => {
      const zoom = Math.min(64, Math.max(0.05, v.zoom * k));
      const f = zoom / v.zoom;
      return { zoom, x: ax - (ax - v.x) * f, y: ay - (ay - v.y) * f };
    });
  };

  const hasEm = material.hasEmissive;

  return (
    <>
      <div
        ref={hostRef}
        className={`inspector ${dragging ? 'dragging' : ''}`}
        data-testid="inspector"
        onWheel={(e) => {
          const r = hostRef.current!.getBoundingClientRect();
          zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerMove={(e) => {
          if (dragging) setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
          const t = toTexel(e.clientX, e.clientY);
          setReadout(t ? `x ${t[0]}  y ${t[1]}  ·  ${describePixel(material, t[0], t[1], which, convention)}` : '');
        }}
        onPointerLeave={() => setReadout('')}
        onDoubleClick={fit}
      >
        <canvas ref={canvasRef} />
      </div>
      <div className="overlay-tl">
        <div className="seg" role="radiogroup" aria-label="Map to inspect" data-testid="inspect-maps">
          {INSPECT_OPTIONS.map((o) => (
            <button
              key={o.id}
              className={which === o.id ? 'on' : ''}
              onClick={() => setPrefs({ inspectMap: o.id })}
              disabled={o.id === 'emissive' && !hasEm}
              title={o.id === 'emissive' && !hasEm ? 'This material does not emit light' : o.id === 'normal' ? `Normal map (${convention === 'opengl' ? 'OpenGL Y+' : 'DirectX Y−'})` : o.label}
              role="radio"
              aria-checked={which === o.id}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overlay-tr row">
        {which === 'normal' && (
          <div className="seg" role="radiogroup" aria-label="Normal convention">
            {(['opengl', 'directx'] as const).map((c) => (
              <button key={c} className={convention === c ? 'on' : ''} onClick={() => setPrefs({ normalConvention: c })} role="radio" aria-checked={convention === c}>
                {c === 'opengl' ? 'OpenGL (Y+)' : 'DirectX (Y−)'}
              </button>
            ))}
          </div>
        )}
        <button className={`btn small ${tiled ? 'active' : ''}`} onClick={() => setPrefs({ inspectTiled: !tiled })} title="Show the texture tiled 3×3 to check seams" aria-pressed={tiled} data-testid="tile-3x3">
          <Grid3x3 size={14} /> 3×3 tiling
        </button>
        <button className="btn small icon" onClick={() => zoomBy(1.4)} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button className="btn small icon" onClick={() => zoomBy(1 / 1.4)} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button className="btn small" onClick={fit} title="Fit to view (double-click also fits)">
          <Maximize size={14} /> Fit
        </button>
        <button className="btn small" onClick={() => setView((v) => ({ zoom: Math.max(4, v.zoom), x: v.x, y: v.y }))} title="Magnify to at least 400% to inspect individual texels">
          400%
        </button>
        <button className="btn small" onClick={onExportMap} disabled={which === 'lit'} title={which === 'lit' ? 'The lit swatch is a preview, not a texture map' : 'Download this map as PNG at the export resolution'} data-testid="export-current-map">
          <Download size={14} /> Export map
        </button>
      </div>
      <div className="overlay-bl">
        <span className="chip readout" data-testid="inspector-readout">
          {material.size}×{material.size} · zoom {Math.round(view.zoom * 100)}%{readout ? ` · ${readout}` : ''}
        </span>
      </div>
    </>
  );
}

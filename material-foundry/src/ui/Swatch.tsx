import { useEffect, useRef } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Thumb } from '../state/thumbs';

export function Swatch({ thumb, error, className }: { thumb?: Thumb; error?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !thumb) return;
    c.width = thumb.size;
    c.height = thumb.size;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(thumb.rgba), thumb.size, thumb.size), 0, 0);
  }, [thumb]);
  if (!thumb) {
    return (
      <div className={`thumb-ph ${className ?? ''}`} title={error ?? 'Generating thumbnail…'}>
        {error ? <TriangleAlert size={16} /> : <LoaderCircle size={16} className="spin" />}
      </div>
    );
  }
  return <canvas ref={ref} className={className} />;
}

// The code itself: line numbers, colours, clickable words. Only the visible lines are rendered, so
// very large files stay responsive. Clicking (or moving with the arrow keys) selects an element and
// asks the analysis worker to explain it. Nothing here runs the code.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { TOKEN_CLASSES } from '../analysis/types';
import { LineIndex } from '../analysis/lines';
import { diffLines } from '../workspace/diff';
import { useCode, workspace, type Highlight } from './store';
import { tr } from '../i18n';

const OVERSCAN = 20;

interface Seg {
  s: number;
  e: number;
  cls: string;
}

/** Sorted, non-overlapping token triples. */
function normaliseTokens(hl: Int32Array): Int32Array {
  const n = Math.floor(hl.length / 3);
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => hl[a * 3] - hl[b * 3] || hl[b * 3 + 1] - hl[a * 3 + 1]);
  const out: number[] = [];
  let last = 0;
  for (const i of idx) {
    let s = hl[i * 3];
    const e = hl[i * 3 + 1];
    if (e <= last || e <= s) continue;
    if (s < last) s = last;
    out.push(s, e, hl[i * 3 + 2]);
    last = e;
  }
  return Int32Array.from(out);
}

function firstTokenEndingAfter(tok: Int32Array, offset: number): number {
  let lo = 0;
  let hi = tok.length / 3;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tok[mid * 3 + 1] <= offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lineSegments(tok: Int32Array, start: number, end: number): Seg[] {
  const segs: Seg[] = [];
  let pos = start;
  for (let i = firstTokenEndingAfter(tok, start); i < tok.length / 3; i++) {
    const s = Math.max(tok[i * 3], start);
    const e = Math.min(tok[i * 3 + 1], end);
    if (s >= end) break;
    if (s > pos) segs.push({ s: pos, e: s, cls: '' });
    if (e > s) segs.push({ s, e, cls: TOKEN_CLASSES[tok[i * 3 + 2]] ?? 'plain' });
    pos = Math.max(pos, e);
  }
  if (pos < end) segs.push({ s: pos, e: end, cls: '' });
  return segs;
}

/** Split segments at highlight boundaries so marks line up exactly. */
function applyHighlights(segs: Seg[], hls: Highlight[]): (Seg & { marks: string })[] {
  if (!hls.length) return segs.map((s) => ({ ...s, marks: '' }));
  const out: (Seg & { marks: string })[] = [];
  for (const seg of segs) {
    const cuts = new Set<number>([seg.s, seg.e]);
    for (const h of hls) {
      if (h.start > seg.s && h.start < seg.e) cuts.add(h.start);
      if (h.end > seg.s && h.end < seg.e) cuts.add(h.end);
    }
    const pts = [...cuts].sort((a, b) => a - b);
    for (let k = 0; k < pts.length - 1; k++) {
      const s = pts[k];
      const e = pts[k + 1];
      const marks = hls.filter((h) => h.start < e && h.end > s && (h.end > h.start)).map((h) => `hl-${h.kind}`);
      out.push({ s, e, cls: seg.cls, marks: [...new Set(marks)].join(' ') });
    }
  }
  return out;
}

export function CodeView() {
  const text = useCode((s) => s.openText);
  const open = useCode((s) => s.open);
  const path = useCode((s) => s.openPath);
  const highlights = useCode((s) => s.highlights);
  const selection = useCode((s) => s.selection);
  const scrollTo = useCode((s) => s.scrollTo);
  const prefs = useCode((s) => s.prefs);
  const wsVersion = useCode((s) => s.wsVersion);
  const select = useCode((s) => s.select);
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });

  const lineHeight = Math.round(prefs.fontSize * (prefs.spacing ? 1.95 : 1.6));
  const lines = useMemo(() => new LineIndex(text), [text]);
  const lineCount = lines.starts.length;
  const tokens = useMemo(() => (open ? normaliseTokens(open.highlight) : new Int32Array()), [open]);
  const issueLines = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of open?.summary.issues ?? []) if (!m.has(i.range.line)) m.set(i.range.line, i.message);
    return m;
  }, [open]);
  const changedLines = useMemo(() => {
    const set = new Set<number>();
    if (!path) return set;
    const f = workspace.files.get(path);
    if (!f || f.original === f.current || f.current !== text) return set;
    for (const op of diffLines(f.original.split('\n'), f.current.split('\n'))) if (op.type === 'add') set.add(op.b);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, text, wsVersion]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScroll({ top: el.scrollTop, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollTo) return;
    const target = scrollTo.line * lineHeight;
    if (target < el.scrollTop + lineHeight || target > el.scrollTop + el.clientHeight - 3 * lineHeight) el.scrollTop = Math.max(0, target - el.clientHeight / 3);
    setScroll({ top: el.scrollTop, height: el.clientHeight });
  }, [scrollTo, lineHeight]);

  // Keep the keyboard-selected element visible.
  useEffect(() => {
    const el = ref.current;
    if (!el || !selection) return;
    const y = selection.element.range.line * lineHeight;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - 2 * lineHeight) {
      el.scrollTop = Math.max(0, y - el.clientHeight / 3);
      setScroll({ top: el.scrollTop, height: el.clientHeight });
    }
  }, [selection, lineHeight]);

  const first = Math.max(0, Math.floor(scroll.top / lineHeight) - OVERSCAN);
  const last = Math.min(lineCount, Math.ceil((scroll.top + scroll.height) / lineHeight) + OVERSCAN);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const span = t.closest('[data-s]') as HTMLElement | null;
    if (!span) {
      const line = t.closest('[data-line]') as HTMLElement | null;
      if (line) {
        const n = Number(line.dataset.line);
        const lineStart = lines.starts[n];
        const lineText = lines.lineText(text, n);
        const firstNonSpace = lineText.search(/\S/);
        if (firstNonSpace >= 0) void select(lineStart + firstNonSpace);
      }
      return;
    }
    let off = Number(span.dataset.s);
    const end = Number(span.dataset.e);
    // Clicking inside a long plain-text run: find the exact character under the pointer.
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const r = doc.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r && span.contains(r.startContainer)) off = Math.min(end - 1, off + r.startOffset);
    // Clicking whitespace selects the next word on the line instead of "nothing".
    while (off < end && /\s/.test(text[off])) off++;
    if (off >= end) off = Number(span.dataset.s);
    void select(off);
  };

  const moveToken = (dir: 1 | -1 | 'down' | 'up') => {
    if (!tokens.length) return;
    const cur = selection?.element.range.start ?? -1;
    const n = tokens.length / 3;
    const isWord = (i: number) => text.slice(tokens[i * 3], tokens[i * 3 + 1]).trim().length > 0;
    if (dir === 1 || dir === -1) {
      let i: number;
      if (cur < 0) i = dir === 1 ? 0 : n - 1;
      else {
        const k = firstTokenEndingAfter(tokens, cur);
        i = dir === 1 ? (k < n && tokens[k * 3] <= cur ? k + 1 : k) : k - 1;
      }
      while (i >= 0 && i < n && !isWord(i)) i += dir;
      if (i >= 0 && i < n) void select(tokens[i * 3]);
      return;
    }
    const curLine = cur < 0 ? -1 : lines.lineOf(cur);
    const col = cur < 0 ? 0 : cur - lines.starts[curLine];
    for (let ln = curLine + (dir === 'down' ? 1 : -1); ln >= 0 && ln < lineCount; ln += dir === 'down' ? 1 : -1) {
      const ls = lines.starts[ln];
      const le = ln + 1 < lineCount ? lines.starts[ln + 1] - 1 : text.length;
      const segs = lineSegments(tokens, ls, le).filter((s) => s.cls && text.slice(s.s, s.e).trim());
      if (!segs.length) continue;
      const best = segs.reduce((a, b) => (Math.abs(b.s - ls - col) < Math.abs(a.s - ls - col) ? b : a));
      void select(best.s);
      return;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const map: Record<string, 1 | -1 | 'down' | 'up'> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'down', ArrowUp: 'up' };
    const d = map[e.key];
    if (d !== undefined) {
      e.preventDefault();
      moveToken(d);
    }
  };

  const rows = [];
  for (let n = first; n < last; n++) {
    const ls = lines.starts[n];
    const le = n + 1 < lineCount ? lines.starts[n + 1] - 1 : text.length;
    const end = le > ls && text[le - 1] === '\r' ? le - 1 : le;
    const relevant = highlights.filter((h) => h.start < end && h.end > ls);
    const segs = applyHighlights(lineSegments(tokens, ls, end), relevant);
    const issue = issueLines.get(n);
    const selected = selection && selection.element.range.line <= n && selection.element.range.endLine >= n;
    rows.push(
      <div key={n} className={`cv-line${changedLines.has(n) ? ' changed' : ''}${selected ? ' current' : ''}`} style={{ top: n * lineHeight, height: lineHeight }} data-line={n}>
        <span className="cv-gutter" aria-hidden>
          {issue ? (
            <span className="cv-issue" title={issue}>
              <AlertTriangle size={11} />
            </span>
          ) : null}
          {n + 1}
        </span>
        <span className={`cv-text${issue ? ' has-issue' : ''}`}>
          {segs.map((s) => (
            <span key={s.s} data-s={s.s} data-e={s.e} className={`${s.cls ? `tk-${s.cls}` : ''} ${s.marks}`}>
              {text.slice(s.s, s.e)}
            </span>
          ))}
          {segs.length === 0 ? ' ' : null}
        </span>
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      className="cv"
      tabIndex={0}
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label={tr(`Code of ${path}. Use the arrow keys to move from word to word; the explanation updates on the right.`, `Код файла ${path}. Стрелками можно переходить от слова к слову; объяснение справа обновляется.`)}
      data-testid="code-view"
      style={{ fontSize: prefs.fontSize, lineHeight: `${lineHeight}px` }}
      onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="cv-inner" style={{ height: lineCount * lineHeight + 40 }}>
        {rows}
      </div>
    </div>
  );
}

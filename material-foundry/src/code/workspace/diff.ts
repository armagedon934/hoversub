// Line-based diff (Myers O(ND) algorithm) and side-by-side rows for the comparison view.

export type DiffOp = { type: 'same' | 'del' | 'add'; a: number; b: number };

/** Edit script between two arrays of lines (indices into a and b). */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  // Trim common prefix/suffix first (fast path for small edits in big files).
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const n = A.length;
  const m = B.length;
  const max = n + m;
  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'same', a: i, b: i });
  if (n === 0 || m === 0) {
    for (let i = 0; i < n; i++) ops.push({ type: 'del', a: start + i, b: -1 });
    for (let j = 0; j < m; j++) ops.push({ type: 'add', a: -1, b: start + j });
  } else if (max > 40000) {
    // Very large change: report as replace-all of the middle part (keeps memory bounded).
    for (let i = 0; i < n; i++) ops.push({ type: 'del', a: start + i, b: -1 });
    for (let j = 0; j < m; j++) ops.push({ type: 'add', a: -1, b: start + j });
  } else {
    const v = new Int32Array(2 * max + 2);
    const trace: Int32Array[] = [];
    let found = false;
    for (let d = 0; d <= max && !found; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && A[x] === B[y]) {
          x++;
          y++;
        }
        v[max + k] = x;
        if (x >= n && y >= m) {
          found = true;
          break;
        }
      }
    }
    // Backtrack.
    const mid: DiffOp[] = [];
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vv = trace[d];
      const k = x - y;
      const prevK = k === -d || (k !== d && vv[max + k - 1] < vv[max + k + 1]) ? k + 1 : k - 1;
      const prevX = vv[max + prevK];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        mid.push({ type: 'same', a: start + x - 1, b: start + y - 1 });
        x--;
        y--;
      }
      if (d > 0) {
        if (x === prevX) mid.push({ type: 'add', a: -1, b: start + y - 1 });
        else mid.push({ type: 'del', a: start + x - 1, b: -1 });
      }
      x = prevX;
      y = prevY;
    }
    ops.push(...mid.reverse());
  }
  for (let i = 0; i < a.length - endA; i++) ops.push({ type: 'same', a: endA + i, b: endB + i });
  return ops;
}

export interface SideBySideRow {
  type: 'same' | 'changed' | 'added' | 'removed';
  left: { line: number; text: string } | null;
  right: { line: number; text: string } | null;
}

/** Pair up deletions and additions into "changed" rows for side-by-side display. */
export function sideBySide(before: string, after: string): SideBySideRow[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const ops = diffLines(a, b);
  const rows: SideBySideRow[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'same') {
      rows.push({ type: 'same', left: { line: op.a, text: a[op.a] }, right: { line: op.b, text: b[op.b] } });
      i++;
      continue;
    }
    const dels: DiffOp[] = [];
    const adds: DiffOp[] = [];
    while (i < ops.length && ops[i].type !== 'same') {
      if (ops[i].type === 'del') dels.push(ops[i]);
      else adds.push(ops[i]);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const d = dels[k];
      const ad = adds[k];
      rows.push({
        type: d && ad ? 'changed' : d ? 'removed' : 'added',
        left: d ? { line: d.a, text: a[d.a] } : null,
        right: ad ? { line: ad.b, text: b[ad.b] } : null,
      });
    }
  }
  return rows;
}

/** Only the changed rows plus `context` unchanged rows around them (for compact previews). */
export function compactRows(rows: SideBySideRow[], context = 2): (SideBySideRow | { type: 'gap'; hidden: number })[] {
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.type !== 'same') for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (SideBySideRow | { type: 'gap'; hidden: number })[] = [];
  let hidden = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (hidden) out.push({ type: 'gap', hidden });
      hidden = 0;
      out.push(r);
    } else hidden++;
  });
  if (hidden) out.push({ type: 'gap', hidden });
  return out;
}

export function countChanges(before: string, after: string): { added: number; removed: number } {
  const ops = diffLines(before.split('\n'), after.split('\n'));
  return { added: ops.filter((o) => o.type === 'add').length, removed: ops.filter((o) => o.type === 'del').length };
}

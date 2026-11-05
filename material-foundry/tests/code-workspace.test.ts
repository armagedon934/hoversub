// Understand Code: safe editing — proposals ("what if"), apply only on request, restore points,
// undo/redo, reverting, persistence, and the diff used for previews.
import { describe, expect, it } from 'vitest';
import { CodeEngine } from '../src/code/analysis/engine';
import { buildProjectIndex } from '../src/code/analysis/project';
import { SAMPLE_FILES } from '../src/code/sample/sampleProject';
import { compactRows, countChanges, diffLines, sideBySide } from '../src/code/workspace/diff';
import { goalsFor, propose } from '../src/code/workspace/proposals';
import { MemoryStore, Workspace } from '../src/code/workspace/workspace';

async function sample() {
  const e = new CodeEngine();
  const files = [];
  for (const f of SAMPLE_FILES) {
    const r = await e.open(f.path, f.text);
    files.push({ path: f.path, size: f.text.length, languageId: r.summary.languageId, summary: r.summary });
  }
  const index = buildProjectIndex(files);
  const texts = new Map(SAMPLE_FILES.map((f) => [f.path, f.text]));
  return { e, index, texts };
}
const cart = SAMPLE_FILES.find((f) => f.path === 'shop/cart.py')!.text;

describe('diff', () => {
  it('finds the minimal line changes', () => {
    const ops = diffLines(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'd', 'e']);
    expect(ops.filter((o) => o.type === 'del').map((o) => o.a)).toEqual([1]);
    expect(ops.filter((o) => o.type === 'add').map((o) => o.b)).toEqual([1, 4]);
    expect(countChanges('x\ny\n', 'x\nz\n')).toEqual({ added: 1, removed: 1 });
  });

  it('pairs changes side by side and hides unchanged lines', () => {
    const before = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 25', 'LINE 25');
    const rows = sideBySide(before, after);
    expect(rows.filter((r) => r.type === 'changed')).toHaveLength(1);
    const compact = compactRows(rows, 2);
    expect(compact.length).toBe(7); // gap, 2 context, change, 2 context, gap
    expect(compact[0]).toEqual({ type: 'gap', hidden: 23 });
  });

  it('handles very different large inputs without hanging', () => {
    const a = Array.from({ length: 60000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 60000 }, (_, i) => `b${i}`);
    const t0 = performance.now();
    const ops = diffLines(a, b);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(ops.filter((o) => o.type === 'add')).toHaveLength(60000);
  });
});

describe('what-if proposals', () => {
  it('offers goals that fit the selected element', async () => {
    const { e } = await sample();
    await e.open('shop/cart.py', cart);
    const num = e.element('shop/cart.py', cart.indexOf('0.2'));
    expect(goalsFor(num).map((g) => g.goal)).toContain('change-value');
    const name = e.element('shop/cart.py', cart.indexOf('subtotal('));
    expect(goalsFor(name).map((g) => g.goal)).toContain('rename');
    expect(goalsFor(name).map((g) => g.goal)).not.toContain('change-value');
  });

  it('changes one value and explains it, without touching the input texts', async () => {
    const { e, texts } = await sample();
    const el = e.element('shop/cart.py', cart.indexOf('0.2'));
    const p = propose({ goal: 'change-value', element: el, path: 'shop/cart.py', files: texts, newValue: '0.25' });
    expect(p.ok).toBe(true);
    expect(p.edits).toHaveLength(1);
    expect(p.edits[0].after).toBe(cart.replace('TAX_RATE = 0.2', 'TAX_RATE = 0.25'));
    expect(p.explanations[0]).toMatch(/0\.2 becomes 0\.25/);
    expect(p.risks.some((r) => r.confidence === 'unknown')).toBe(true);
    expect(texts.get('shop/cart.py')).toBe(cart);
    // Invalid input is refused with a plain message.
    const bad = propose({ goal: 'change-value', element: el, path: 'shop/cart.py', files: texts, newValue: 'abc' });
    expect(bad.ok).toBe(false);
    expect(bad.problem).toMatch(/number/);
  });

  it('renames in the right files only, and warns about same-name things elsewhere', async () => {
    const { e, index, texts } = await sample();
    const el = e.element('shop/cart.py', cart.indexOf('TAX_RATE'));
    const p = propose({ goal: 'rename', element: el, path: 'shop/cart.py', files: texts, index, newName: 'VAT_RATE' });
    expect(p.ok).toBe(true);
    expect(p.edits.map((x) => x.path)).toEqual(['shop/cart.py']);
    expect(p.edits[0].after.match(/VAT_RATE/g)).toHaveLength(2);
    expect(p.edits[0].after).not.toMatch(/TAX_RATE/);
    expect(p.risks.some((r) => /web\/app\.js/.test(r.text) && /NOT renamed/.test(r.text))).toBe(true);
    // Cross-file rename across an import.
    const main = texts.get('main.py')!;
    await e.open('main.py', main);
    const fp = e.element('main.py', main.indexOf('format_price('));
    const p2 = propose({ goal: 'rename', element: fp, path: 'main.py', files: texts, index, newName: 'show_price' });
    expect(p2.ok).toBe(true);
    expect(p2.edits.map((x) => x.path).sort()).toEqual(['main.py', 'shop/prices.py']);
    for (const ed of p2.edits) expect(ed.after).not.toMatch(/\bformat_price\b/);
  });

  it('refuses invalid names and keywords', async () => {
    const { e, texts } = await sample();
    const el = e.element('shop/cart.py', cart.indexOf('subtotal('));
    for (const bad of ['two words', '1abc', 'class', '']) expect(propose({ goal: 'rename', element: el, path: 'shop/cart.py', files: texts, newName: bad }).ok, bad).toBe(false);
  });

  it('keeps local renames inside their function', async () => {
    const src = 'def a():\n    x = 1\n    return x\n\ndef b():\n    x = 2\n    return x\n';
    const e = new CodeEngine();
    await e.open('l.py', src);
    const el = e.element('l.py', src.indexOf('x = 1'));
    const p = propose({ goal: 'rename', element: el, path: 'l.py', files: new Map([['l.py', src]]), newName: 'count' });
    expect(p.ok).toBe(true);
    expect(p.edits[0].after).toBe('def a():\n    count = 1\n    return count\n\ndef b():\n    x = 2\n    return x\n');
  });

  it('switches a line off as a comment and keeps Python valid', async () => {
    const src = 'def f():\n    print("hi")\n\nf()\n';
    const e = new CodeEngine();
    await e.open('d.py', src);
    const el = e.element('d.py', src.indexOf('print'));
    const p = propose({ goal: 'disable-line', element: el, path: 'd.py', files: new Map([['d.py', src]]) });
    expect(p.ok).toBe(true);
    expect(p.edits[0].after).toBe('def f():\n    # print("hi")\n    pass\n\nf()\n');
    const check = await e.checkSyntax('d.py', p.edits[0].after);
    expect(check.checked).toBe(true);
    expect(check.issues).toEqual([]);
    const del = propose({ goal: 'remove-line', element: el, path: 'd.py', files: new Map([['d.py', src]]) });
    expect(del.risks.some((r) => /function called on this line/i.test(r.text))).toBe(true);
  });

  it('the syntax check notices when a change breaks the code', async () => {
    const src = 'const a = (1 + 2);\n';
    const e = new CodeEngine();
    await e.open('b.js', src);
    const el = e.element('b.js', src.indexOf('const'));
    const p = propose({ goal: 'edit-line', element: el, path: 'b.js', files: new Map([['b.js', src]]), newLine: 'const a = (1 + ;' });
    expect(p.ok).toBe(true);
    const before = await e.checkSyntax('b.js', src);
    const after = await e.checkSyntax('b.js', p.edits[0].after);
    expect(before.issues.length).toBe(0);
    expect(after.issues.length).toBeGreaterThan(0);
  });

  it('refuses to act on a stale selection', async () => {
    const { e, texts } = await sample();
    const el = e.element('shop/cart.py', cart.indexOf('0.2'));
    const changed = new Map(texts);
    changed.set('shop/cart.py', `# new first line\n${cart}`);
    const p = propose({ goal: 'change-value', element: el, path: 'shop/cart.py', files: changed, newValue: '0.3' });
    expect(p.ok).toBe(false);
    expect(p.problem).toMatch(/changed/);
  });
});

describe('workspace: apply, undo, redo, restore points', () => {
  const files = () => [
    { path: 'a.py', text: 'x = 1\n' },
    { path: 'b.py', text: 'y = 2\n' },
  ];

  it('applies a change only when asked, with a restore point first; originals stay intact', async () => {
    const ws = new Workspace(new MemoryStore());
    await ws.load('p', files());
    expect(ws.changedFiles()).toEqual([]);
    await ws.apply('Change x', [{ path: 'a.py', after: 'x = 5\n' }]);
    expect(ws.text('a.py')).toBe('x = 5\n');
    expect(ws.files.get('a.py')!.original).toBe('x = 1\n');
    expect(ws.restorePoints).toHaveLength(1);
    expect(ws.restorePoints[0].files).toEqual([{ path: 'a.py', text: 'x = 1\n' }]);
    expect(ws.isChanged('a.py')).toBe(true);
    expect(ws.isChanged('b.py')).toBe(false);
    await expect(ws.apply('Nothing', [{ path: 'a.py', after: 'x = 5\n' }])).rejects.toThrow();
    await expect(ws.apply('Unknown file', [{ path: 'zzz.py', after: '' }])).rejects.toThrow();
  });

  it('undo and redo walk the history in both directions', async () => {
    const ws = new Workspace();
    await ws.load('p', files());
    await ws.apply('one', [{ path: 'a.py', after: 'x = 2\n' }]);
    await ws.apply('two', [{ path: 'a.py', after: 'x = 3\n' }, { path: 'b.py', after: 'y = 3\n' }]);
    expect((await ws.undo())!.label).toBe('two');
    expect(ws.text('a.py')).toBe('x = 2\n');
    expect(ws.text('b.py')).toBe('y = 2\n');
    await ws.undo();
    expect(ws.text('a.py')).toBe('x = 1\n');
    expect(await ws.undo()).toBeNull();
    await ws.redo();
    await ws.redo();
    expect(ws.text('a.py')).toBe('x = 3\n');
    expect(ws.text('b.py')).toBe('y = 3\n');
    // A new change clears the redo stack.
    await ws.undo();
    await ws.apply('three', [{ path: 'b.py', after: 'y = 9\n' }]);
    expect(ws.canRedo()).toBe(false);
  });

  it('restoring a restore point is itself undoable; revert brings back the original', async () => {
    const ws = new Workspace();
    await ws.load('p', files());
    await ws.apply('one', [{ path: 'a.py', after: 'x = 2\n' }]);
    await ws.apply('two', [{ path: 'a.py', after: 'x = 3\n' }]);
    const first = ws.restorePoints[0];
    await ws.restore(first.id);
    expect(ws.text('a.py')).toBe('x = 1\n');
    await ws.undo();
    expect(ws.text('a.py')).toBe('x = 3\n');
    await ws.revertFile('a.py');
    expect(ws.text('a.py')).toBe('x = 1\n');
    expect(ws.isChanged('a.py')).toBe(false);
    await ws.undo();
    expect(ws.text('a.py')).toBe('x = 3\n');
  });

  it('marking files as saved keeps a copy of the old original', async () => {
    const ws = new Workspace();
    await ws.load('p', files());
    await ws.apply('one', [{ path: 'a.py', after: 'x = 2\n' }]);
    await ws.markSaved(['a.py']);
    expect(ws.files.get('a.py')!.original).toBe('x = 2\n');
    expect(ws.restorePoints.at(-1)!.files).toEqual([{ path: 'a.py', text: 'x = 1\n' }]);
  });

  it('survives a reload (persisted session) and ignores corrupt storage', async () => {
    const store = new MemoryStore();
    const ws = new Workspace(store);
    await ws.load('proj', files());
    await ws.apply('one', [{ path: 'a.py', after: 'x = 2\n' }]);
    const again = new Workspace(store);
    expect(await again.restoreSession()).toBe(true);
    expect(again.name).toBe('proj');
    expect(again.text('a.py')).toBe('x = 2\n');
    expect(again.history).toHaveLength(1);
    await again.undo();
    expect(again.text('a.py')).toBe('x = 1\n');

    const bad = new MemoryStore();
    await bad.set('workspace.v1', { version: 7, junk: true });
    expect(await new Workspace(bad).restoreSession()).toBe(false);
    expect(await new Workspace(null).restoreSession()).toBe(false);
  });

  it('applying the what-if proposal end to end', async () => {
    const { e, index, texts } = await sample();
    const ws = new Workspace(new MemoryStore());
    await ws.load('tiny', SAMPLE_FILES.map((f) => ({ path: f.path, text: f.text })));
    const el = e.element('shop/cart.py', cart.indexOf('TAX_RATE'));
    const p = propose({ goal: 'rename', element: el, path: 'shop/cart.py', files: texts, index, newName: 'VAT_RATE' });
    await ws.apply(p.label, p.edits.map((x) => ({ path: x.path, after: x.after })));
    expect(ws.text('shop/cart.py')).toMatch(/VAT_RATE = 0\.2/);
    expect(ws.text('web/app.js')).toMatch(/TAX_RATE/);
    await ws.undo();
    expect(ws.text('shop/cart.py')).toBe(cart);
  });
});

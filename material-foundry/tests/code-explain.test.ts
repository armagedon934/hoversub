// Understand Code: selecting symbols, explaining them at five levels, definitions/references,
// project dependency analysis and the knowledge base.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CodeEngine } from '../src/code/analysis/engine';
import { buildProjectIndex, crossReferences, projectOverview, resolveImport } from '../src/code/analysis/project';
import { explain, LEVELS, type Level } from '../src/code/explain/explain';
import { CONCEPTS, getConcept, hasConcept } from '../src/code/knowledge/concepts';
import { SAMPLE_FILES } from '../src/code/sample/sampleProject';
import { SAMPLES } from './codeSamples';

const PY = `TAX = 0.2

def total(prices, discount=0):
    """Add up prices."""
    s = 0
    for p in prices:
        s = s + p
    if s > discount:
        s = s - discount
    return s * (1 + TAX)

def other():
    s = 5
    return s

print(total([1, 2, 3]))
`;

const JS = `const rate = 2;
function scale(values) {
  const out = [];
  for (const v of values) {
    out.push(v * rate);
  }
  return out;
}
const result = scale([1, 2]);
console.log(result);
`;

async function setup() {
  const e = new CodeEngine();
  await e.open('t.py', PY);
  await e.open('t.js', JS);
  return e;
}

const at = (text: string, needle: string, nth = 0) => {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = text.indexOf(needle, i + 1);
  return i;
};

describe('selecting and explaining elements', () => {
  it('explains a variable with where it is made and used (scope-aware)', async () => {
    const e = await setup();
    const el = e.element('t.py', at(PY, 's = s + p') + 4); // the second "s" (read)
    expect(el.kind).toBe('variable');
    expect(el.symbolName).toBe('s');
    expect(el.enclosingFunction).toBe('total');
    const defLines = (el.definitions ?? []).map((d) => d.range.line);
    expect(defLines).toContain(4); // "s = 0" inside total, not "s = 5" inside other()
    expect(defLines).not.toContain(12);
    const refLines = new Set((el.references ?? []).map((r) => r.range.line));
    expect(refLines.has(12) || refLines.has(13)).toBe(false);
    expect(refLines.has(9)).toBe(true);
  });

  it('explains a function definition with inputs, outputs and calls', async () => {
    const e = await setup();
    const el = e.element('t.py', at(PY, 'total('));
    expect(el.kind).toBe('function-definition');
    expect(el.func?.params.map((p) => p.name)).toEqual(['prices', 'discount']);
    expect(el.func?.params[1].defaultValue).toBe('0');
    expect(el.func?.returns.join(' ')).toContain('s * (1 + TAX)');
    expect(el.func?.doc).toContain('Add up prices');
    expect(el.flow?.length).toBeGreaterThan(2);
    const call = e.element('t.py', at(PY, 'total([1'));
    expect(call.kind).toBe('function-call');
    expect(call.definitions?.[0].range.line).toBe(2);
  });

  it('explains brackets, operators and keywords', async () => {
    const e = await setup();
    const br = e.element('t.js', at(JS, '{', 0));
    expect(br.kind).toBe('bracket');
    expect(br.bracket?.partner).toBeTruthy();
    expect(br.bracket?.encloses).toMatch(/scale/);
    const op = e.element('t.js', at(JS, '*'));
    expect(op.kind).toBe('operator');
    expect(op.operator?.left).toBe('v');
    expect(op.operator?.right).toBe('rate');
    const kw = e.element('t.py', at(PY, 'for'));
    expect(kw.kind).toBe('keyword');
    expect(kw.keywordMeaning).toBeTruthy();
    const str = e.element('t.py', at(PY, 'Add up'));
    expect(str.kind === 'string' || str.kind === 'comment').toBe(true);
  });

  it('gives five different, non-empty explanation levels', async () => {
    const e = await setup();
    for (const needle of ['rate', 'scale(', '*', 'for', '{', 'const']) {
      const el = e.element('t.js', at(JS, needle));
      const summaries = LEVELS.map((l) => explain(el, { level: l.level }));
      for (const x of summaries) {
        expect(x.summary.length, needle).toBeGreaterThan(10);
        expect(x.blocks.length, needle).toBeGreaterThan(0);
        expect(['verified', 'likely', 'assumption', 'unknown']).toContain(x.confidence);
      }
      expect(new Set(summaries.map((x) => x.summary)).size, needle).toBeGreaterThanOrEqual(4);
      // Level 5 is a guided exercise.
      expect(summaries[4].blocks.some((b) => b.id === 'exercise')).toBe(true);
    }
  });

  it('"I don\'t understand" gives a different explanation every time, and examples on request', async () => {
    const e = await setup();
    const el = e.element('t.js', at(JS, 'for'));
    const a = explain(el, { level: 2, simplerStep: 1 }).blocks.find((b) => b.id === 'simpler')!.lines[0];
    const b = explain(el, { level: 2, simplerStep: 2 }).blocks.find((b) => b.id === 'simpler')!.lines[0];
    expect(a).not.toBe(b);
    const ex = explain(el, { level: 2, showExample: true });
    expect(ex.blocks.some((x) => x.id === 'example')).toBe(true);
    expect(ex.example?.code).toBeTruthy();
  });

  it('never claims certainty it does not have', async () => {
    const e = await setup();
    const el = e.element('t.js', at(JS, 'console'));
    const x = explain(el, { level: 3 });
    const unknowns = x.blocks.find((b) => b.id === 'unknowns');
    expect(unknowns?.lines.length).toBeGreaterThan(0);
    // Facts on name-based links are never "verified".
    for (const b of x.blocks) for (const f of b.facts ?? []) if (/other file|same name/i.test(f.text)) expect(f.confidence).not.toBe('verified');
  });

  it('go-to-definition data for every reference points at a definition', async () => {
    const e = await setup();
    for (const needle of ['rate)', 'result)', 'out.push']) {
      const el = e.element('t.js', at(JS, needle));
      expect(el.definitions?.length, needle).toBeGreaterThan(0);
      const d = el.definitions![0];
      expect(JS.slice(d.range.start, d.range.end)).toBe(el.symbolName);
    }
  });
});

describe('project analysis', () => {
  it('builds the dependency graph and an honest overview of the example project', async () => {
    const e = new CodeEngine();
    const files = [];
    for (const f of SAMPLE_FILES) {
      const r = await e.open(f.path, f.text);
      files.push({ path: f.path, size: f.text.length, languageId: r.summary.languageId, summary: r.summary });
    }
    const idx = buildProjectIndex(files);
    const edges = idx.edges.map((x) => `${x.from}>${x.to}`);
    expect(edges).toEqual(expect.arrayContaining(['main.py>shop/cart.py', 'main.py>shop/prices.py', 'web/index.html>web/style.css', 'web/index.html>web/app.js']));
    expect(idx.importedBy.get('shop/cart.py')).toEqual(['main.py']);
    const ov = projectOverview(idx, (p) => SAMPLE_FILES.find((f) => f.path === p)?.text, 'tiny-shop');
    expect(ov.entryPoints[0].path).toBe('main.py');
    expect(ov.kind.text).toMatch(/Python/);
    expect(ov.readmeIntro).toMatch(/small example shop/);
    expect(ov.settingsFiles).toContain('settings.yaml');
    expect(ov.unknowns.length).toBeGreaterThan(0);
    for (const f of ov.summary) expect(['verified', 'likely', 'assumption', 'unknown']).toContain(f.confidence);
    // Cross references by name.
    const cr = crossReferences(idx, 'format_price');
    expect(new Set(cr.refs.map((r) => r.path))).toEqual(new Set(['main.py', 'shop/prices.py']));
    expect(cr.defs.map((d) => d.path)).toEqual(['shop/prices.py']);
  });

  it('resolves imports in several languages', () => {
    const paths = new Set(['src/a.ts', 'src/lib/util.ts', 'src/lib/index.ts', 'pkg/mod.py', 'pkg/__init__.py', 'inc/util.h', 'main.c', 'styles/base.css', 'index.html']);
    const imp = (spec: string, kind: 'import' | 'include' | 'stylesheet' = 'import') => ({ spec, kind, names: [], range: { start: 0, end: 0, line: 0, col: 0, endLine: 0 } });
    expect(resolveImport('src/a.ts', imp('./lib/util'), 'typescript', paths)).toBe('src/lib/util.ts');
    expect(resolveImport('src/a.ts', imp('./lib'), 'typescript', paths)).toBe('src/lib/index.ts');
    expect(resolveImport('src/a.ts', imp('react'), 'typescript', paths)).toBeNull();
    expect(resolveImport('main.py', imp('pkg.mod'), 'python', paths)).toBe('pkg/mod.py');
    expect(resolveImport('main.c', imp('inc/util.h', 'include'), 'c', paths)).toBe('inc/util.h');
    expect(resolveImport('index.html', imp('styles/base.css', 'stylesheet'), 'html', paths)).toBe('styles/base.css');
  });
});

describe('offline knowledge base', () => {
  it('every concept has five levels and at least one simpler wording', () => {
    expect(CONCEPTS.length).toBeGreaterThan(60);
    const ids = new Set<string>();
    for (const c of CONCEPTS) {
      expect(ids.has(c.id), c.id).toBe(false);
      ids.add(c.id);
      expect(c.levels.every((l) => l.trim().length > 10), c.id).toBe(true);
      expect(c.simpler.length, c.id).toBeGreaterThan(0);
      for (const r of c.related ?? []) expect(hasConcept(r), `${c.id} -> ${r}`).toBe(true);
    }
  });

  it('every concept the analysis can produce exists in the knowledge base', async () => {
    const e = new CodeEngine();
        const missing = new Set<string>();
    for (const [path, s] of Object.entries(SAMPLES)) {
      await e.open(path, s.text);
      // Click every position (sampled) to collect concepts.
      for (let i = 0; i < s.text.length; i += 1) {
        const el = e.element(path, i);
        // Specific ids (e.g. bracket-call-arguments) may resolve to a general entry, but never to "unknown".
        if (el.concept !== 'unknown' && getConcept(el.concept).id === 'unknown') missing.add(`${path}:${el.concept}`);
        expect(getConcept(el.concept).levels.length).toBe(5);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('offline by design', () => {
  it('the code module never contacts the network', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    walk('src/code');
    for (const f of files) {
      let t = readFileSync(f, 'utf8');
      // The sandbox workers name the network functions only to REMOVE them before user code runs.
      if (/\.worker\.ts$/.test(f) && /src[\\/]code[\\/]run/.test(f)) {
        expect(t, f).toMatch(/for \(const k of \[['"]fetch['"], ['"]XMLHttpRequest['"], ['"]WebSocket['"], ['"]EventSource['"], ['"]importScripts['"]/);
        t = t.replace(/for \(const k of \[[^\]]*\]\)/g, '');
      }
      expect(t, f).not.toMatch(/\bfetch\s*\(\s*['"`]https?:/);
      expect(t, f).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/);
      expect(t, f).not.toMatch(/https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|org|net|io|dev|ai)\//i);
    }
  });

  it('opening a file never executes it', async () => {
    // A file that would have visible side effects if it were run.
    const g = globalThis as { __ranCode?: boolean };
    g.__ranCode = false;
    const e = new CodeEngine();
    await e.open('evil.js', 'globalThis.__ranCode = true;\nrequire("child_process").execSync("touch /tmp/should-not-exist");\n');
    e.element('evil.js', 3);
    expect(g.__ranCode).toBe(false);
  });

  it('all five levels are selectable by number', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5] as Level[]);
  });
});

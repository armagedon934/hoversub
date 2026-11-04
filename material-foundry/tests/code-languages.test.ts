// Understand Code: language detection and opening files in every supported language.
import { describe, expect, it } from 'vitest';
import { CodeEngine, MAX_PARSE_CHARS } from '../src/code/analysis/engine';
import { LANGUAGES, detectLanguage, getLanguage, looksBinary } from '../src/code/languages/registry';
import { hasLexer, lex } from '../src/code/languages/lexer';
import { SAMPLES } from './codeSamples';


describe('language detection', () => {
  it('detects languages from extension, file name, shebang and content', () => {
    expect(detectLanguage('src/app.py').language.id).toBe('python');
    expect(detectLanguage('a/b/C.java').language.id).toBe('java');
    expect(detectLanguage('main.rs').language.id).toBe('rust');
    expect(detectLanguage('Dockerfile').language.id).toBe('dockerfile');
    expect(detectLanguage('Makefile').reason).toBe('filename');
    expect(detectLanguage('script', '#!/usr/bin/env python3\nprint(1)\n').language.id).toBe('python');
    expect(detectLanguage('run', '#!/bin/bash\necho hi\n').reason).toBe('shebang');
    expect(detectLanguage('data', '<?xml version="1.0"?><a/>').language.id).toBe('xml');
    expect(detectLanguage('thing', '{"a": 1}').language.id).toBe('json');
  });

  it('decides between C and C++ for .h headers by content', () => {
    expect(detectLanguage('x.h', 'int add(int a, int b);\n').language.id).toBe('c');
    expect(detectLanguage('x.h', 'namespace a { class B { public: int f(); }; }\n').language.id).toBe('cpp');
  });

  it('falls back to plain text for unknown formats and says so', () => {
    const d = detectLanguage('weird.qqq', 'just some words');
    expect(d.language.mode).toBe('plain');
    expect(d.confidence).not.toBe('verified');
  });

  it('recognises binary content', () => {
    expect(looksBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 1, 2, 3]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode('print("héllo")\n'))).toBe(false);
  });

  it('every language listed has a lexer or a grammar', () => {
    for (const l of LANGUAGES) {
      if (l.mode === 'syntax-tree') expect(l.grammar, l.id).toBeTruthy();
      if (l.mode === 'tokens') expect(hasLexer(l.id), l.id).toBe(true);
    }
    expect(getLanguage('does-not-exist').mode).toBe('plain');
  });

  it('lexers cover the whole text without overlaps', () => {
    for (const [path, s] of Object.entries(SAMPLES)) {
      if (s.mode !== 'tokens') continue;
      const toks = lex(s.lang, s.text);
      let last = 0;
      for (const t of toks) {
        expect(t.start, path).toBeGreaterThanOrEqual(last);
        expect(t.end, path).toBeGreaterThan(t.start);
        last = t.end;
      }
      expect(last, path).toBeLessThanOrEqual(s.text.length);
    }
  });
});

describe('opening files in every supported language', () => {
  const engine = new CodeEngine();
  for (const [path, s] of Object.entries(SAMPLES)) {
    it(`${path} opens as ${s.lang} (${s.mode}) and a word can be explained`, async () => {
      const r = await engine.open(path, s.text);
      expect(r.summary.languageId).toBe(s.lang);
      expect(r.summary.mode).toBe(s.mode);
      expect(r.summary.issues, 'valid code must not report syntax problems').toEqual([]);
      expect(r.highlight.length % 3).toBe(0);
      const el = engine.element(path, s.text.indexOf(s.click));
      expect(el.text.length).toBeGreaterThan(0);
      expect(el.concept).toBeTruthy();
      expect(el.facts.length + el.context.length).toBeGreaterThan(0);
    });
  }

  it('finds functions in the syntax-tree languages', async () => {
    for (const [path, s] of Object.entries(SAMPLES)) {
      if (s.mode !== 'syntax-tree' || ['html', 'css', 'json', 'toml'].includes(s.lang)) continue;
      const r = await engine.open(path, s.text);
      const fns = r.summary.symbols.filter((x) => x.kind === 'function' || x.kind === 'method');
      expect(fns.length, path).toBeGreaterThan(0);
    }
  });

  it('word-level languages still find functions, classes and settings', async () => {
    const sw = await engine.open('w.swift', 'import UIKit\nstruct Point { var x: Int }\nfunc area(width w: Int, height: Int) -> Int { let r = w * height; return r }\n');
    expect(sw.summary.symbols.map((x) => `${x.kind}:${x.name}`)).toEqual(expect.arrayContaining(['class:Point', 'function:area', 'constant:r']));
    expect(sw.summary.symbols.find((x) => x.name === 'area')?.params).toEqual(['w', 'height']);
    expect(sw.summary.imports.map((i) => i.spec)).toEqual(['UIKit']);
    const lua = await engine.open('x.lua', SAMPLES['g.lua'].text);
    expect(lua.summary.symbols.some((x) => x.kind === 'function' && x.name === 'add')).toBe(true);
  });

  it('reports syntax problems in invalid code without crashing', async () => {
    const r = await engine.open('broken.py', 'def f(:\n    return (1 +\n');
    expect(r.summary.issues.length).toBeGreaterThan(0);
    const js = await engine.open('broken.js', 'function (a, { return a +; }\n');
    expect(js.summary.issues.length).toBeGreaterThan(0);
    const lua = await engine.open('broken.lua', 'local t = { 1, 2\nprint(t)\n');
    expect(lua.summary.issues.length).toBeGreaterThan(0);
    // Clicking inside broken code still answers.
    expect(engine.element('broken.py', 4).kind).toBeTruthy();
  });

  it('opens empty files and files with odd characters', async () => {
    const empty = await engine.open('empty.py', '');
    expect(empty.summary.lineCount).toBe(1);
    expect(engine.element('empty.py', 0)).toBeTruthy();
    const uni = await engine.open('u.js', 'const café = "😀"; // ünïcode\nconsole.log(café);\n');
    const el = engine.element('u.js', 'const café = "😀"; // ünïcode\nconsole.log(café);\n'.lastIndexOf('café'));
    expect(el.text).toBe('café');
    expect(uni.summary.issues).toEqual([]);
  });

  it('handles large files quickly and switches to plain text above the limit', async () => {
    const fn = (i: number) => `def f${i}(a, b):\n    total = a + b * ${i}\n    if total > 10:\n        return total\n    return 0\n\n`;
    const big = Array.from({ length: 4000 }, (_, i) => fn(i)).join('');
    const t0 = performance.now();
    const r = await engine.open('big.py', big);
    const ms = performance.now() - t0;
    expect(r.summary.lineCount).toBeGreaterThan(20000);
    expect(r.summary.symbols.filter((s) => s.kind === 'function').length).toBe(4000);
    expect(ms).toBeLessThan(15000);
    const el = engine.element('big.py', big.indexOf('f3999'));
    expect(el.symbolName).toBe('f3999');

    const huge = 'x = 1\n'.repeat(Math.ceil((MAX_PARSE_CHARS + 10) / 6));
    const h = await engine.open('huge.py', huge);
    expect(h.summary.mode).toBe('plain');
    expect(h.summary.limited).toBeTruthy();
  });
});

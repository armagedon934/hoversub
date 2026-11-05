// The lessons must tell the truth: every animation step points at a real line, the games are
// consistent, and the programs really print what the animation shows. C, C++, Python and JavaScript
// versions are compiled and run here (only this bundled lesson code — never user code).
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LESSONS, TRACKS, buggyLines, codeLines, expectedOutput, framesOf, lessonsFor, lineOf, stepsFor, type TrackId } from '../src/code/learn/lessons';

const has = (cmd: string) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
const tools = { gcc: has('gcc'), gxx: has('g++'), python: has('python3'), node: true };
const dir = mkdtempSync(join(tmpdir(), 'learn-'));

function run(track: TrackId, id: string, code: string): string | null {
  const src = codeLines({ code: { [track]: code } } as never, track)
    .map((l) => l.text)
    .join('\n');
  const base = join(dir, `${id}-${track}`);
  if (track === 'py') {
    if (!tools.python) return null;
    writeFileSync(`${base}.py`, src);
    return execFileSync('python3', [`${base}.py`], { encoding: 'utf8' });
  }
  if (track === 'js') {
    writeFileSync(`${base}.js`, src);
    return execFileSync(process.execPath, [`${base}.js`], { encoding: 'utf8' });
  }
  if (track === 'c') {
    if (!tools.gcc) return null;
    writeFileSync(`${base}.c`, src);
    execFileSync('gcc', ['-std=c11', '-Wall', '-Werror', '-o', base, `${base}.c`]);
    return execFileSync(base, { encoding: 'utf8' });
  }
  if (track === 'cpp') {
    if (!tools.gxx) return null;
    writeFileSync(`${base}.cpp`, src);
    execFileSync('g++', ['-std=c++17', '-Wall', '-Werror', '-o', base, `${base}.cpp`]);
    return execFileSync(base, { encoding: 'utf8' });
  }
  return null; // C#: no compiler in the test environment (checked structurally below)
}

describe('lessons', () => {
  it('every track has lessons and every lesson has text in both languages', () => {
    for (const t of TRACKS) expect(lessonsFor(t.id).length, t.id).toBeGreaterThanOrEqual(7);
    for (const l of LESSONS) {
      for (const txt of [l.title, l.goal, l.intro, ...l.steps.map((s) => s.say), ...l.games.map((g) => g.q)]) {
        expect(txt.en.trim().length, l.id).toBeGreaterThan(1);
        expect(txt.ru.trim().length, l.id).toBeGreaterThan(1);
        expect(txt.ru, `${l.id}: Russian text expected`).toMatch(/[а-яё]/i);
      }
    }
  });

  for (const lesson of LESSONS) {
    for (const t of TRACKS) {
      if (!lessonsFor(t.id).includes(lesson)) continue;
      it(`${lesson.id} / ${t.name}: steps, games and output agree`, () => {
        const lines = codeLines(lesson, t.id);
        const steps = stepsFor(lesson, t.id);
        expect(steps.length).toBeGreaterThan(2);
        for (const s of steps) {
          expect(lineOf(lines, s.at), `marker ${s.at}`).toBeGreaterThanOrEqual(0);
          expect(framesOf(s, t.id).length).toBeGreaterThan(0);
        }
        for (const g of lesson.games) {
          if (g.kind === 'bug') {
            const b = buggyLines(lesson, t.id, g);
            expect(b, `bug ${g.from}->${g.to}`).not.toBeNull();
            expect(b!.lines[b!.bugLine].text.slice(b!.bugCol, b!.bugCol + g.to.length)).toBe(g.to);
          }
          if (g.kind === 'order') for (const m of g.markers) expect(lineOf(lines, m), `order marker ${m}`).toBeGreaterThanOrEqual(0);
          if (g.kind === 'choice') {
            expect(g.answer).toBeLessThan(g.options.length);
            if (g.isOutput) expect(g.options[g.answer]).toBe(expectedOutput(lesson, t.id));
          }
        }
        // No marker text may leak into the visible code.
        for (const l of lines) expect(l.text).not.toMatch(/(\/\/|#)@\w+/);
        const out = run(t.id, lesson.id, lesson.code[t.id]!);
        if (out !== null) expect(out.trim()).toBe(expectedOutput(lesson, t.id));
      });
    }
  }

  it('the compilers used for checking were available (so the checks above really ran)', () => {
    expect(tools).toEqual({ gcc: true, gxx: true, python: true, node: true });
  });
});

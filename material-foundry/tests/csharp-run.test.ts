// The safe C# runner and Mini-Unity: correct results, honest errors, limits, and every level
// solvable by its reference solution (and not by the empty starter).
import { describe, expect, it } from 'vitest';
import { LESSONS, codeLines, expectedOutput } from '../src/code/learn/lessons';
import { LEVELS, asLevel } from '../src/code/run/levels';
import { runCSharp } from '../src/code/run/runner';
import { UnityWorld } from '../src/code/run/unity';

describe('C# runner', () => {
  it('runs every C# lesson and prints exactly what the lesson animation shows', async () => {
    for (const l of LESSONS) {
      if (!l.code.cs) continue;
      const src = codeLines(l, 'cs')
        .map((x) => x.text)
        .join('\n');
      const r = await runCSharp(src);
      expect(r.status, `${l.id}: ${r.error?.message}`).toBe('done');
      expect(r.output.join('\n'), l.id).toBe(expectedOutput(l, 'cs'));
    }
  });

  it('supports the everyday C# a beginner writes', async () => {
    const src = `using System;
using System.Collections.Generic;
using System.Linq;
var inv = new List<string> { "sword", "shield" };
inv.Add("potion");
var gold = new Dictionary<string, int> { ["coins"] = 5 };
gold["coins"] += 10;
float speed = 2.5f;
double avg = new List<int> { 1, 2, 4 }.Average();
Console.WriteLine($"{inv.Count} items, gold {gold["coins"]}, speed {speed}, avg {avg:F2}");
Console.WriteLine(7 / 2);
Console.WriteLine(7f / 2);
Console.WriteLine(string.Join(", ", inv.Where(s => s.Length > 5).ToList()));
int Fact(int n) => n <= 1 ? 1 : n * Fact(n - 1);
Console.WriteLine(Fact(5));
var hero = new Hero("Ari"); hero.Hit(3); hero.Hit(4);
Console.WriteLine(hero);
switch (hero.Hp) { case 3: Console.WriteLine("low"); break; default: Console.WriteLine("ok"); break; }
string name = Console.ReadLine();
Console.WriteLine("Hi " + name + "!");
try { int[] a = new int[2]; a[5] = 1; } catch (Exception e) { Console.WriteLine("caught"); }
bool ok = 3 > 2 && !(1 == 2);
Console.WriteLine(ok);
class Hero { public string Name; public int Hp { get; private set; } = 10; public Hero(string n) { Name = n; } public void Hit(int d) { Hp -= d; } public override string ToString() => $"Hero {Name}"; }
`;
    const r = await runCSharp(src, ['Bob']);
    expect(r.error?.message).toBeUndefined();
    expect(r.output).toEqual(['3 items, gold 15, speed 2.5, avg 2.33', '3', '3.5', 'shield, potion', '120', 'Hero Ari', 'low', '> Bob', 'Hi Bob!', 'caught', 'True']);
  });

  it('records steps with the call stack, like the lesson animations', async () => {
    const r = await runCSharp('int Twice(int n) { return n * 2; }\nint x = Twice(4);\nConsole.WriteLine(x);\n', [], { trace: true });
    const call = r.steps.find((s) => s.kind === 'call');
    expect(call?.frames.map((f) => f.fn)).toEqual(['', 'Twice']);
    expect(call?.frames[1].vars).toEqual([{ name: 'n', value: { text: '4' } }]);
    expect(r.steps.some((s) => s.kind === 'return' && /8/.test(s.say))).toBe(true);
    expect(r.steps.at(-1)?.output).toBe(1);
  });

  it('explains mistakes in plain words instead of crashing', async () => {
    const cases: [string, RegExp][] = [
      ['int x = 5\nConsole.WriteLine(x);', /semicolon|точк/i],
      ['int x = 1;\nConsole.WriteLine(y);', /"y"|«y»/],
      ['int i = 0;\nwhile (i < 10) { }', /endless|бесконечн/i],
      ['string s = null;\nConsole.WriteLine(s.Length);', /NullReferenceException/],
      ['int[] a = new int[3];\na[3] = 1;', /IndexOutOfRangeException/],
      ['int z = 0;\nConsole.WriteLine(5 / z);', /DivideByZeroException/],
      ['int F(int n) => F(n + 1);\nF(1);', /stack overflow|переполнение стека/i],
    ];
    for (const [src, re] of cases) {
      const r = await runCSharp(src);
      expect(r.status, src).toBe('error');
      expect(r.error?.message, src).toMatch(re);
    }
  });
});

describe('Mini-Unity', () => {
  for (const L of LEVELS) {
    it(`level "${L.id}": the solution wins, the starter does not`, async () => {
      const level = asLevel(L, 'en');
      const w = new UnityWorld(level);
      expect(await w.load(level.solution)).toBeNull();
      const r = w.simulate(12, level.demo);
      expect(r.status, r.message).toBe('won');
      const w2 = new UnityWorld(level);
      expect(await w2.load(level.starter)).toBeNull();
      expect(w2.simulate(12, level.demo).status).not.toBe('won');
    });
  }

  it('reports the classic Unity mistakes with an explanation', async () => {
    const level = asLevel(LEVELS[1], 'en');
    const w = new UnityWorld(level);
    await w.load('using UnityEngine;\npublic class H : MonoBehaviour { void Update() { transform.position.x += 1; } }');
    const r = w.frame();
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/CS1612/);
    const w2 = new UnityWorld(level);
    await w2.load('using UnityEngine;\npublic class H : MonoBehaviour { void Update() { while (true) { } } }');
    expect(w2.frame().message).toMatch(/endless loop/);
    const w3 = new UnityWorld(level);
    expect((await w3.load('using UnityEngine;\npublic class H { }'))?.[0].message).toMatch(/MonoBehaviour/);
  });
});

// Russian interface: every idea, keyword and operator has a Russian text, and explanations shown
// in Russian contain no left-over English sentences. Also checks the C / C++ / C# / game-engine
// recognition added for the "top languages".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeEngine } from '../src/code/analysis/engine';
import { buildProjectIndex, projectOverview } from '../src/code/analysis/project';
import { explain, type Level } from '../src/code/explain/explain';
import { setLocale } from '../src/code/i18n';
import { CONCEPTS, getConcept, missingRussian } from '../src/code/knowledge/concepts';
import { OPERATORS, keywordKeys } from '../src/code/knowledge/keywords';
import { RU_GENERAL, RU_OPERATORS, RU_OVERRIDES } from '../src/code/knowledge/keywords.ru';
import { goalsFor, propose } from '../src/code/workspace/proposals';
import { SAMPLES } from './codeSamples';

const CYR = /[а-яё]/i;
/** Four English words in a row without any Russian letter = an untranslated sentence. */
const englishSentence = (s: string) => !CYR.test(s) && /\b[a-z]{3,}\s+[a-z]{2,}\s+[a-z]{2,}\s+[a-z]{3,}\b/i.test(s.replace(/«[^»]*»|"[^"]*"|`[^`]*`/g, ''));

describe('Russian knowledge base', () => {
  it('every idea has a complete Russian version', () => {
    expect(missingRussian()).toEqual([]);
    setLocale('ru', false);
    try {
      for (const c of CONCEPTS) {
        const r = getConcept(c.id);
        expect(r.title, c.id).toMatch(CYR);
        expect(r.levels).toHaveLength(5);
        for (const l of r.levels) expect(l, c.id).toMatch(CYR);
        expect(r.simpler.length, c.id).toBeGreaterThan(0);
        if (c.why) expect(r.why, `${c.id} why`).toMatch(CYR);
        if (c.change) expect(r.change, `${c.id} change`).toMatch(CYR);
        if (c.example) expect(r.example?.explain, `${c.id} example`).toMatch(CYR);
      }
    } finally {
      setLocale('en', false);
    }
  });

  it('every keyword and operator meaning has a Russian version', () => {
    const k = keywordKeys();
    for (const w of k.general) if (w !== 'local_function') expect(RU_GENERAL[w], w).toBeTruthy();
    for (const [lang, words] of Object.entries(k.overrides)) for (const w of words) expect(RU_OVERRIDES[lang]?.[w], `${lang}.${w}`).toBeTruthy();
    for (const sym of Object.keys(OPERATORS)) expect(RU_OPERATORS[sym], sym).toBeTruthy();
  });
});

describe('explanations in Russian', () => {
  beforeAll(() => setLocale('ru', false));
  afterAll(() => setLocale('en', false));

  it('no English sentences are left in explanations for any language, at any level', async () => {
    const e = new CodeEngine();
    const leftovers: string[] = [];
    for (const [path, s] of Object.entries(SAMPLES)) {
      await e.open(path, s.text);
      for (let i = 0; i < s.text.length; i += 3) {
        const el = e.element(path, i);
        for (const level of [1, 2, 3, 4, 5] as Level[]) {
          const x = explain(el, { level, simplerStep: 1, showExample: true });
          for (const line of [x.summary, x.conceptTitle, ...x.blocks.flatMap((b) => [b.heading, ...b.lines, ...(b.quiz ? [b.quiz.question, b.quiz.answer] : [])])])
            if (englishSentence(line)) leftovers.push(`${path}@${i} L${level}: ${line.slice(0, 100)}`);
        }
      }
    }
    expect([...new Set(leftovers)].slice(0, 20)).toEqual([]);
  });

  it('what-if proposals and the project overview are in Russian', async () => {
    const e = new CodeEngine();
    const src = 'x = 1\nprint(x + 2)\n';
    await e.open('a.py', src);
    const el = e.element('a.py', src.indexOf('1'));
    for (const g of goalsFor(el)) expect(g.label + g.description, g.goal).toMatch(CYR);
    const p = propose({ goal: 'change-value', element: el, path: 'a.py', files: new Map([['a.py', src]]), newValue: '5' });
    expect(p.label + p.explanations.join(' ') + p.risks.map((r) => r.text).join(' ')).toMatch(CYR);
    for (const r of p.risks) expect(englishSentence(r.text), r.text).toBe(false);
    const r = await e.open('a.py', src);
    const idx = buildProjectIndex([{ path: 'a.py', size: src.length, languageId: 'python', summary: r.summary }]);
    const ov = projectOverview(idx, () => src, 'demo');
    for (const f of [ov.kind, ...ov.summary]) expect(englishSentence(f.text), f.text).toBe(false);
    for (const u of ov.unknowns) expect(englishSentence(u), u).toBe(false);
  });
});

describe('C, C++, C# and game engines', () => {
  const C = `#include <stdio.h>
#include <stdlib.h>
struct Player { int hp; };
int main(void) {
  int hp = 100;
  int *p = &hp;
  *p = 50;
  struct Player *pl = malloc(sizeof(struct Player));
  pl->hp = 3;
  printf("%d\\n", hp);
  free(pl);
  return 0;
}
`;
  const CPP = `#include <vector>
class Enemy {
public:
  virtual ~Enemy() {}
  virtual void Tick(float dt) {}
};
int main() {
  std::vector<int> v;
  v.push_back(1);
  Enemy* e = new Enemy();
  delete e;
  int& r = v[0];
  return r;
}
`;
  const CS = `using UnityEngine;
public class Player : MonoBehaviour {
  public float speed = 2f;
  public int Health { get; private set; }
  public event System.Action OnDeath;
  int? lives;
  void Update() {
    transform.Translate(Vector3.right * speed * Time.deltaTime);
    var q = from x in new[] {1, 2} where x > 1 select x;
    Debug.Log(Health);
  }
}
`;

  it('recognises pointers, addresses, ->, ::, #include, memory, destructors and references', async () => {
    const e = new CodeEngine();
    await e.open('m.c', C);
    await e.open('a.cpp', CPP);
    const at = (path: string, src: string, needle: string, shift = 0) => e.element(path, src.indexOf(needle) + shift).concept;
    expect(at('m.c', C, '#include')).toBe('preprocessor');
    expect(at('m.c', C, '*p =', 0)).toBe('pointer');
    expect(at('m.c', C, 'int *p', 4)).toBe('pointer');
    expect(at('m.c', C, '&hp')).toBe('address-of');
    expect(at('m.c', C, '->')).toBe('operator-pointer-member');
    expect(at('m.c', C, 'sizeof')).toBe('sizeof');
    expect(at('m.c', C, 'main')).toBe('main-function');
    expect(e.element('m.c', C.indexOf('malloc')).libraryMeaning).toMatch(/memory/);
    expect(at('a.cpp', CPP, '~Enemy')).toBe('destructor');
    expect(at('a.cpp', CPP, 'virtual void')).toBe('virtual');
    expect(at('a.cpp', CPP, 'std::', 3)).toBe('operator-scope');
    expect(at('a.cpp', CPP, 'vector<')).toBe('list');
    expect(at('a.cpp', CPP, 'new Enemy')).toBe('memory-alloc');
    expect(at('a.cpp', CPP, 'delete e')).toBe('memory-free');
    expect(at('a.cpp', CPP, 'int& r', 3)).toBe('reference');
    expect(at('a.cpp', CPP, 'Tick')).toBe('game-loop');
  });

  it('recognises Unity methods, properties, events, nullable types, LINQ and library calls', async () => {
    const e = new CodeEngine();
    await e.open('P.cs', CS);
    const el = (needle: string, shift = 0) => e.element('P.cs', CS.indexOf(needle) + shift);
    expect(el('Update').concept).toBe('unity-lifecycle');
    expect(el('Update').libraryMeaning).toMatch(/once per frame/);
    expect(el('Vector3').concept).toBe('vector');
    expect(el('get;').concept).toBe('accessor');
    expect(el('event').concept).toBe('delegate-event');
    expect(el('int?', 3).concept).toBe('nullable');
    expect(el('where x').concept).toBe('linq');
    expect(el('deltaTime').libraryMeaning).toMatch(/since the last frame/);
    expect(el('Log(').libraryMeaning).toMatch(/Unity Console/);
  });

  it('describes Unity and Unreal projects as game projects', async () => {
    const e = new CodeEngine();
    const r = await e.open('Assets/Scripts/Player.cs', CS);
    const idx = buildProjectIndex([{ path: 'Assets/Scripts/Player.cs', size: CS.length, languageId: 'csharp', summary: r.summary }]);
    expect(projectOverview(idx, () => CS, 'game').kind.text).toMatch(/Unity/);
    const h = 'UCLASS()\nclass AHero : public ACharacter {\n  GENERATED_BODY()\n};\n';
    const r2 = await e.open('Source/Hero.h', h);
    const idx2 = buildProjectIndex([{ path: 'Source/Hero.h', size: h.length, languageId: 'cpp', summary: r2.summary }]);
    expect(projectOverview(idx2, () => h, 'game').kind.text).toMatch(/Unreal/);
    expect(e.element('Source/Hero.h', h.indexOf('UCLASS')).concept).toBe('unreal-macro');
  });
});

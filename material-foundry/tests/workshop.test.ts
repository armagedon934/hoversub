// Workshop logic: next-step guesses, beginner/Unity checks, the recipe library and the error
// translator. All of it works without AI and without the internet.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { ERROR_RULE_COUNT, explainError, translateErrors } from '../src/code/run/errors';
import { runCSharp, parseCSharp, syntaxProblems } from '../src/code/run/runner';
import { csMembers, declaredType } from '../src/code/workshop/api';
import { lintCSharp, lintCFamily, lintJs, lintPython } from '../src/code/workshop/lint';
import { openBlocks, predict, withIndent } from '../src/code/workshop/predict';
import { RECIPES, recipeFileName, recipeLineNotes, recipeWithComments, searchRecipes, stem } from '../src/code/workshop/recipes';

setLocale('ru', false);

const at = (src: string) => {
  const i = src.indexOf('|');
  return [src.slice(0, i), src.slice(i + 1)] as const;
};

describe('next-step guesses (Layer 2)', () => {
  it('walks through the usual shape of a Unity script', () => {
    expect(predict('cs', '', '')[0].text).toBe('using UnityEngine;\n');
    expect(predict('cs', 'using UnityEngine;\n\n', '')[0].text).toMatch(/^public class Player : MonoBehaviour/);
    const inClass = at('using UnityEngine;\npublic class Player : MonoBehaviour\n{\n    |\n}');
    const g = predict('cs', ...inClass).map((p) => p.text);
    expect(g[0]).toBe('public float speed = 5f;');
    expect(g.some((t) => t.startsWith('void Update()'))).toBe(true);
    const inUpdate = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    public float speed = 5f;\n    void Update()\n    {\n        |\n    }\n}');
    expect(predict('cs', ...inUpdate)[0].text).toBe('float x = Input.GetAxis("Horizontal");');
    const afterAxis = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    public float speed = 5f;\n    void Update()\n    {\n        float x = Input.GetAxis("Horizontal");\n        |\n    }\n}');
    expect(predict('cs', ...afterAxis)[0].text).toBe('transform.Translate(x * speed * Time.deltaTime, 0, 0);');
  });

  it('knows jumps, Start initialisation and triggers', () => {
    const jump = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    public float jumpForce = 7f;\n    private Rigidbody2D rb;\n    void Update()\n    {\n        if (Input.GetKeyDown(KeyCode.Space))\n        |\n    }\n}');
    expect(predict('cs', ...jump)[0].text).toContain('rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);');
    const start = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    private Rigidbody2D rb;\n    void Start()\n    {\n        |\n    }\n}');
    expect(predict('cs', ...start)[0].text).toBe('rb = GetComponent<Rigidbody2D>();');
    const trig = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    public int score;\n    void OnTriggerEnter2D(Collider2D other)\n    {\n        |\n    }\n}');
    expect(predict('cs', ...trig)[0].text).toBe('if (other.CompareTag("Coin"))');
    const tagged = at('using UnityEngine;\npublic class P : MonoBehaviour\n{\n    public int score;\n    void OnTriggerEnter2D(Collider2D other)\n    {\n        if (other.CompareTag("Coin"))\n        |\n    }\n}');
    expect(predict('cs', ...tagged)[0].text).toContain('score++;');
  });

  it('finishes started lines and never guesses in the middle of text', () => {
    expect(predict('cs', 'using UnityEngine;\npublic class P : MonoBehaviour\n{\n    void Upd', '\n}')[0].text).toBe('ate()');
    expect(predict('cs', 'for (', '')[0].text).toBe('int i = 0; i < 10; i++)');
    expect(predict('cs', 'int x = ', '5;')).toEqual([]);
  });

  it('guesses for console C#, Python and JavaScript', () => {
    expect(predict('cs', 'using System;\nConsole.Write("Name? ");\n', '')[0].text).toBe('string answer = Console.ReadLine();');
    expect(predict('py', 'name = input("Name? ")\n', '')[0].text).toBe('print("Hello, " + name + "!")');
    expect(predict('py', 'for i in range(3):\n', '')[0].text).toBe('    print(i)');
    expect(predict('js', 'const name = prompt("Name?");\n', '')[0].text).toBe('console.log("Hello, " + name + "!");');
  });

  it('tracks open blocks and indents inserted lines', () => {
    expect(openBlocks('class A\n{\n  void Update()\n  {\n    // { not counted\n    var s = "{";\n')).toEqual(['class A', 'void Update()']);
    expect(withIndent('{\n    x;\n}', '        ')).toBe('{\n            x;\n        }');
  });
});

describe('suggestions after a dot', () => {
  it('knows Unity members and finds variable types', () => {
    expect(csMembers('transform', '').some((x) => x.label === 'Translate')).toBe(true);
    expect(csMembers('Input', '').some((x) => x.label === 'GetKeyDown')).toBe(true);
    expect(csMembers('rb', 'private Rigidbody2D rb;').some((x) => x.label === 'AddForce')).toBe(true);
    expect(csMembers('items', 'List<string> items = new List<string>();').some((x) => x.label === 'Add')).toBe(true);
    expect(csMembers('other', 'void OnTriggerEnter2D(Collider2D other)').some((x) => x.label === 'CompareTag')).toBe(true);
    expect(csMembers('transform.position', '').some((x) => x.label === 'x')).toBe(true);
    expect(declaredType('hero', 'var hero = new Hero("a");')).toBe('Hero');
  });
});

describe('beginner and Unity checks', () => {
  const codes = (src: string, file?: string) => lintCSharp(src, file).map((f) => f.code ?? f.message.slice(0, 30));

  it('catches mistakes Unity does not explain', () => {
    const src = `using UnityEngine;
public class Player : MonoBehaviour
{
    public float speed = 5.5;
    void update()
    {
        transform.position.x += 1;
        if (speed = 3) { }
        if (speed > 1);
        transform.Translate(1, 0, 0);
        var rb = GetComponent<Rigidbody2D>();
        Debug.log("hi");
    }
    void OnTriggerEnter2D(Collider other) { }
}`;
    const f = lintCSharp(src, 'Hero.cs');
    const msg = f.map((x) => x.message).join('\n');
    expect(f.find((x) => x.code === 'UnityCase')?.fix?.text).toBe('Update');
    expect(f.some((x) => x.code === 'CS1612')).toBe(true);
    expect(f.find((x) => x.code === 'CS0029')?.fix?.text).toBe('==');
    expect(f.some((x) => x.code === 'CS0642')).toBe(true);
    expect(f.find((x) => x.code === 'CS0664')?.fix?.text).toBe('5.5f');
    expect(f.find((x) => x.code === 'CS0103')?.fix?.text).toBe('Log');
    expect(msg).toMatch(/2D/);
    expect(msg).toMatch(/Hero\.cs/);
  });

  it('checks Update rules once the name is right', () => {
    const src = `using UnityEngine;
public class Player : MonoBehaviour
{
    void Update()
    {
        transform.Translate(1, 0, 0);
        var rb = GetComponent<Rigidbody2D>();
        while (true) { }
    }
}`;
    const msg = lintCSharp(src, 'Player.cs').map((x) => x.message).join('\n');
    expect(msg).toMatch(/Time\.deltaTime/);
    expect(msg).toMatch(/каждый кадр/);
    expect(msg).toMatch(/while/);
  });

  it('stays quiet on correct code and own variable names', () => {
    expect(codes('using UnityEngine;\npublic class Player : MonoBehaviour\n{\n    public float speed = 5f;\n    bool space;\n    void Update()\n    {\n        if (speed == 3 && !space) { }\n        transform.Translate(speed * Time.deltaTime, 0, 0);\n        Debug.Log("x = " + speed);\n    }\n}', 'Player.cs')).toEqual([]);
    expect(lintCSharp('using UnityEngine;\nclass A : MonoBehaviour { void Update() { var f = items.Where(x => x > 1); } }')).toEqual([]);
  });

  it('checks Python, JavaScript and C', () => {
    expect(lintPython('if x > 1\n    print(x)').some((f) => /двоеточие/.test(f.message))).toBe(true);
    expect(lintPython('print "hi"').length).toBe(1);
    expect(lintPython('n = input("n") + 1').some((f) => /int\(input/.test(f.message))).toBe(true);
    expect(lintPython('for i in range(3):\n    print(i)')).toEqual([]);
    expect(lintJs('if (a = 1) {}')[0].fix?.text).toBe('===');
    expect(lintCFamily('#include <stdio.h>\nint x; scanf("%d", x);')[0].fix?.text).toBe('&x');
    expect(lintCFamily('#include <iostream>\nint main(){ cout << 1; }')[0].fix?.text).toBe('std::cout');
  });
});

describe('"I want…" recipes', () => {
  it('finds recipes from Russian wishes with any word form', () => {
    expect(stem('монеты')).toBe(stem('монета'));
    expect(searchRecipes('хочу чтобы персонаж прыгал')[0].id).toBe('move-physics-2d');
    expect(searchRecipes('собирать монетки')[0].id).toBe('coins');
    expect(searchRecipes('камера следит за игроком')[0].id).toBe('camera-follow');
    expect(searchRecipes('враг гонится')[0].id).toBe('enemy-follow');
    expect(searchRecipes('стрельба пулями')[0].id).toBe('shoot');
    expect(searchRecipes('make the player jump')[0].id).toBe('move-physics-2d');
    expect(searchRecipes('', 'py')[0].lang).toBe('py');
  });

  it('every recipe is complete: notes match lines, Unity class matches file name', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(30);
    const ids = new Set<string>();
    for (const r of RECIPES) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      for (const [m] of r.notes) expect(r.code.includes(m), `${r.id}: ${m}`).toBe(true);
      expect(recipeLineNotes(r).join(' ').length, r.id).toBeGreaterThan(0);
      expect(recipeWithComments(r).split('\n').length).toBe(r.code.split('\n').length + r.notes.length);
      if (r.kind === 'unity') {
        expect(recipeFileName(r), r.id).toMatch(/^[A-Z]\w+\.cs$/);
        expect(lintCSharp(r.code, recipeFileName(r)).filter((f) => f.severity === 'error'), r.id).toEqual([]);
      }
    }
  });

  it('every C# recipe has correct grammar; console recipes really run', async () => {
    for (const r of RECIPES.filter((x) => x.lang === 'cs')) {
      const tree = await parseCSharp(r.code);
      expect(syntaxProblems(tree, r.code), r.id).toEqual([]);
    }
    const guess = await runCSharp(RECIPES.find((r) => r.id === 'cs-guess')!.code, ['5', '9', '1', '2', '3', '4', '6', '7', '8', '10']);
    expect(guess.status).toBe('done');
    expect(guess.output.at(-1)).toMatch(/^Right! Tries: \d+$/);
    for (const id of ['cs-hello-input', 'cs-list', 'cs-class']) {
      const r = await runCSharp(RECIPES.find((x) => x.id === id)!.code, ['Ann']);
      expect(r.status, `${id}: ${r.error?.message}`).toBe('done');
    }
    expect((await runCSharp(RECIPES.find((x) => x.id === 'cs-class')!.code)).output).toEqual(['Slime has 3 HP', 'Slime is defeated!']);
  });
});

describe('error translator', () => {
  it('explains pasted Unity console output line by line', () => {
    const cards = translateErrors(`Assets/Scripts/Player.cs(12,23): error CS1002: ; expected
NullReferenceException: Object reference not set to an instance of an object
Player.Update () (at Assets/Scripts/Player.cs:20)
Assets/Scripts/Player.cs(7,9): error CS1612: Cannot modify the return value of 'Transform.position' because it is not a variable
UnassignedReferenceException: The variable target of CameraFollow has not been assigned.`);
    expect(cards.map((c) => c.info.id)).toEqual(['CS1002', 'NullReferenceException', 'CS1612', 'UnassignedReferenceException']);
    expect(cards[0].where).toBe('Assets/Scripts/Player.cs, строка 12');
    expect(ERROR_RULE_COUNT).toBeGreaterThanOrEqual(45);
  });

  it('knows C++, linker, Python and JavaScript messages', () => {
    expect(explainError("main.cpp:5: error: 'cout' was not declared in this scope")?.id).toBe('C2065');
    expect(explainError('undefined reference to `Foo::bar()`')?.id).toBe('LNK2019');
    expect(explainError('Segmentation fault (core dumped)')?.id).toBe('Segfault');
    expect(explainError("NameError: name 'x' is not defined")?.id).toBe('NameError');
    expect(explainError("TypeError: Cannot read properties of undefined (reading 'x')")?.id).toBeDefined();
    expect(explainError('nothing to see here')).toBeNull();
  });
});

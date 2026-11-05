// "Read it simply": every line of every C# recipe, course lesson, bug case and Mini-Unity solution
// gets a plain translation (no line is left unexplained), and scripts are cut into named blocks.
import { describe, expect, it } from 'vitest';
import { pick, setLocale } from '../src/code/i18n';
import { BUGS, prepareBug } from '../src/code/learn/bugs';
import { explainLine, isTrivial, scriptMap } from '../src/code/learn/codeReader';
import { COURSES } from '../src/code/learn/courses';
import { LEVELS } from '../src/code/run/levels';
import { PROJECT } from '../src/code/run/project';
import { RECIPES } from '../src/code/workshop/recipes';
import { MISSIONS, OFFICIAL, answerOf } from '../src/code/run/shooter';

setLocale('ru', false);

const sources: [string, string][] = [
  ...RECIPES.filter((r) => r.lang === 'cs').map((r) => [`recipe ${r.id}`, r.code] as [string, string]),
  ...COURSES.flatMap((c) => c.lessons.filter((l) => l.lang === 'cs').map((l) => [`course ${l.id}`, l.code] as [string, string])),
  ...BUGS.map((b) => [`bug ${b.id}`, prepareBug(b).lines.join('\n')] as [string, string]),
  ...[...LEVELS, ...PROJECT].map((l) => [`level ${l.id}`, l.solution] as [string, string]),
  ...MISSIONS.map((m) => [`mission ${m.id}`, answerOf(m)] as [string, string]),
  ...Object.entries(OFFICIAL).map(([k, v]) => [`official ${k}`, v] as [string, string]),
];

describe('code reader', () => {
  it('translates every meaningful line of all C# material', () => {
    const missing: string[] = [];
    let total = 0;
    for (const [name, code] of sources)
      for (const line of code.split('\n')) {
        if (isTrivial(line)) continue;
        total++;
        if (!explainLine(line)) missing.push(`${name}: ${line.trim()}`);
      }
    expect(total).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });

  it('reads one-line ifs, else-if and constructors as whole sentences', () => {
    const say = (l: string) => pick(explainLine(l)!);
    expect(say('if (health != null) health.TakeDamage(damage);')).toMatch(/существует.*→ просим health сделать TakeDamage/);
    expect(say('if (Input.GetMouseButton(0) && Time.time >= nextFireTime)')).toMatch(/левая кнопка мыши и Time\.time ≥ nextFireTime/);
    expect(say('else if (playerHealth.currentHealth <= 0 || roundTime <= 0)')).toMatch(/^Иначе, если/);
    expect(say('public Weapon(string name, int damage, float fireRate)')).toMatch(/конструктор/i);
    expect(say('if (Input.GetButtonDown("Jump") && controller.isGrounded)')).toMatch(/прыжок.*Пробел.*и controller\.isGrounded/);
    expect(say('hit.collider.GetComponent<Health>().TakeDamage(5);')).toMatch(/деталь Health/);
  });

  it('gives precise translations for typical Unity lines', () => {
    const say = (l: string) => pick(explainLine(l)!);
    expect(say('float x = Input.GetAxis("Horizontal");')).toMatch(/влево\/вправо/);
    expect(say('if (Input.GetKeyDown(KeyCode.Space) && onGround)')).toMatch(/пробел.*onGround/);
    expect(say('rb = GetComponent<Rigidbody2D>();')).toMatch(/один раз/);
    expect(say('yield return new WaitForSeconds(0.5f);')).toMatch(/0\.5f сек/);
    expect(say('Destroy(other.gameObject);')).toMatch(/Убираем other\.gameObject/);
    expect(say('public float speed = 5f;')).toMatch(/Inspector/);
    expect(say('void Update()')).toMatch(/каждый кадр/);
    expect(say('// hello')).toMatch(/Заметка/);
    expect(explainLine('}')).not.toBeNull();
  });

  it('cuts a Unity script into a few named blocks', () => {
    const r = RECIPES.find((x) => x.id === 'move-physics-2d')!;
    const blocks = scriptMap(r.code);
    expect(blocks.map((b) => b.role)).toEqual(['using', 'class', 'fields', 'start', 'update']);
    expect(blocks.find((b) => b.role === 'update')!.about).toMatch(/каждый кадр/);
    const console = scriptMap(COURSES[0].lessons[0].code);
    expect(console[0].role).toBe('using');
    expect(console.some((b) => b.role === 'top')).toBe(true);
    for (const [name, code] of sources) expect(scriptMap(code).length, name).toBeLessThanOrEqual(14);
  });
});

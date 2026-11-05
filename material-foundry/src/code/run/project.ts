// "Project: your own platformer" — one script that grows over 5 steps into a small game:
// walk → jump from the ground → coins → stomp the enemy → win message. Each step is a Mini-Unity
// level whose starting code is the previous step's code (the learner's own code when it won),
// so you build ONE game instead of separate exercises. Tests play every step automatically.

import type { Text2 } from '../i18n';
import type { MiniLevel } from './levels';
import type { ObjSpec } from './unity';

const T = (en: string, ru: string): Text2 => ({ en, ru });
const ground = (w: number): ObjSpec[] => Array.from({ length: w }, (_, i) => ({ name: 'Ground', tag: 'Ground', sprite: 'platform' as const, x: i + 0.5, y: 0.5 }));

const HEAD = `using UnityEngine;

public class Player : MonoBehaviour
{
    public float speed = 4f;`;

const MOVE = `
    void Update()
    {
        float x = Input.GetAxisRaw("Horizontal");
        rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);`;

const JUMP = `
        RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f);
        bool grounded = hit.collider != null;
        if (Input.GetKeyDown(KeyCode.Space) && grounded)
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }`;

const START = `
    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }
`;

/** Builds the script of a step; `todo` is a comment where the learner adds the new part. */
function script(step: number, todo?: Text2, lang: 'en' | 'ru' = 'en'): string {
  const c = (t?: Text2) => (t ? `        // ${lang === 'ru' ? t.ru : t.en}\n` : '');
  const fields = [step >= 2 ? '    public float jumpForce = 7f;' : '', step >= 3 ? '    public int coins = 0;' : '', '    Rigidbody2D rb;'].filter(Boolean).join('\n');
  let s = `${HEAD}\n${fields}\n${START}`;
  if (step === 1) {
    s += `
    void Update()
    {
${todo ? c(todo) : '        float x = Input.GetAxisRaw("Horizontal");\n        rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);\n'}    }
}
`;
    return s;
  }
  s += MOVE;
  if (step === 2 && todo) s += `\n${c(todo)}    }\n`;
  else s += `${JUMP}\n    }\n`;
  if (step >= 3) {
    s += `
    void OnTriggerEnter2D(Collider2D other)
    {
`;
    if (step === 3 && todo) s += c(todo);
    else
      s += `        if (other.CompareTag("Coin"))
        {
            coins++;
            Destroy(other.gameObject);
        }
`;
    if (step === 4 && todo) s += c(todo);
    else if (step >= 4)
      s += `        if (other.CompareTag("Enemy") && rb.linearVelocity.y < 0)
        {
            Destroy(other.gameObject);
            rb.linearVelocity = new Vector2(rb.linearVelocity.x, 5f);
        }
`;
    if (step === 5 && todo) s += c(todo);
    else if (step >= 5)
      s += `        if (other.CompareTag("Finish"))
        {
            Debug.Log("You win! Coins: " + coins);
        }
`;
    s += '    }\n';
  }
  return s + '}\n';
}

const both = (step: number, todo: Text2): Text2 => ({ en: script(step, todo, 'en'), ru: script(step, todo, 'ru') });

export const PROJECT: MiniLevel[] = [
  {
    id: 'p1-move',
    icon: '🚶',
    title: T('Project 1/5: walk', 'Проект 1/5: ходьба'),
    learn: T('Your game starts with a hero that walks. With Rigidbody2D we set the speed (linearVelocity) instead of moving the position — then walls and gravity work by themselves.', 'Твоя игра начинается с героя, который ходит. С Rigidbody2D мы задаём скорость (linearVelocity), а не двигаем позицию — тогда стены и гравитация работают сами.'),
    task: T('Walk to the flag with the arrow keys.', 'Дойди до флага стрелками.'),
    hint: T('float x = Input.GetAxisRaw("Horizontal"); rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);', 'float x = Input.GetAxisRaw("Horizontal"); rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);'),
    width: 16,
    height: 7,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [...ground(16), { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 7, y: 1.5 }],
    goal: { type: 'reach' },
    starter: both(1, T('Read the arrows (-1, 0, 1) and set the speed of rb', 'Прочитай стрелки (-1, 0, 1) и задай скорость rb')),
    solution: script(1),
    demo: [{ until: 3, keys: ['ArrowRight'] }],
  },
  {
    id: 'p2-jump',
    icon: '🦘',
    title: T('Project 2/5: jump over the wall', 'Проект 2/5: прыжок через стену'),
    learn: T('A ray down (Physics2D.Raycast) tells whether the hero stands on something. Jump only then — no flying.', 'Луч вниз (Physics2D.Raycast) говорит, стоит ли герой на чём-то. Прыгай только тогда — никаких полётов.'),
    task: T('A wall is in the way. Add a jump on Space — only from the ground.', 'На пути стена. Добавь прыжок на пробел — только с земли.'),
    hint: T('RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f); if (Input.GetKeyDown(KeyCode.Space) && hit.collider != null) rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);', 'RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f); if (Input.GetKeyDown(KeyCode.Space) && hit.collider != null) rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);'),
    width: 16,
    height: 7,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [...ground(16), { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 }, { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 9, y: 1.5 }],
    goal: { type: 'reach' },
    starter: both(2, T('Jump on Space, but only when a short ray down hits the ground', 'Прыжок на пробел, но только если короткий луч вниз касается земли')),
    solution: script(2),
    demo: [
      { until: 0.75, keys: ['ArrowRight'] },
      { until: 0.8, keys: ['ArrowRight', ' '] },
      { until: 4, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'p3-coins',
    icon: '🪙',
    title: T('Project 3/5: coins', 'Проект 3/5: монеты'),
    learn: T('Coins are triggers with the tag "Coin". OnTriggerEnter2D is called once when the hero touches one.', 'Монеты — это триггеры с тегом «Coin». OnTriggerEnter2D вызывается один раз, когда герой касается монеты.'),
    task: T('Collect every coin: count them in coins and remove them.', 'Собери все монеты: считай их в coins и убирай.'),
    hint: T('if (other.CompareTag("Coin")) { coins++; Destroy(other.gameObject); }', 'if (other.CompareTag("Coin")) { coins++; Destroy(other.gameObject); }'),
    width: 16,
    height: 7,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [
      ...ground(16),
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 3, y: 1.5 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 5, y: 2.9 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 8, y: 1.5 },
    ],
    goal: { type: 'collect' },
    starter: both(3, T('If we touched a "Coin": add 1 to coins and Destroy the coin', 'Если коснулись «Coin»: прибавь 1 к coins и уничтожь монету (Destroy)')),
    solution: script(3),
    demo: [
      { until: 0.75, keys: ['ArrowRight'] },
      { until: 0.8, keys: ['ArrowRight', ' '] },
      { until: 4, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'p4-stomp',
    icon: '👟',
    title: T('Project 4/5: stomp the enemy', 'Проект 4/5: прыгни на врага'),
    learn: T('Touching an enemy from the side loses. Falling onto it (velocity.y < 0) defeats it — like in classic platformers. A small bounce up feels good.', 'Коснуться врага сбоку — проигрыш. Упасть на него сверху (velocity.y < 0) — победа над ним, как в классических платформерах. Маленький отскок вверх — приятно.'),
    task: T('Jump onto the enemy to defeat it.', 'Прыгни врагу на голову, чтобы победить его.'),
    hint: T('if (other.CompareTag("Enemy") && rb.linearVelocity.y < 0) { Destroy(other.gameObject); rb.linearVelocity = new Vector2(rb.linearVelocity.x, 5f); }', 'if (other.CompareTag("Enemy") && rb.linearVelocity.y < 0) { Destroy(other.gameObject); rb.linearVelocity = new Vector2(rb.linearVelocity.x, 5f); }'),
    width: 16,
    height: 7,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [...ground(16), { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 2.5, y: 1.5 }, { name: 'Slime', tag: 'Enemy', sprite: 'enemy', x: 6, y: 1.4, h: 0.8, danger: true }, { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 12, y: 1.5 }],
    goal: { type: 'destroyAll', tag: 'Enemy' },
    starter: both(4, T('If we touched an "Enemy" while falling (rb.linearVelocity.y < 0): Destroy it and bounce up', 'Если коснулись «Enemy», падая (rb.linearVelocity.y < 0): уничтожь его и отскочи вверх')),
    solution: script(4),
    demo: [
      { until: 0.8, keys: ['ArrowRight'] },
      { until: 0.85, keys: ['ArrowRight', ' '] },
      { until: 0.85, keys: ['ArrowRight'] },
      { until: 2.05, keys: [] },
      { until: 6, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'p5-win',
    icon: '🏁',
    title: T('Project 5/5: you win!', 'Проект 5/5: победа!'),
    learn: T('The flag has the tag "Finish". When the hero touches it, write the result to the Console — in a real game you would show a win screen here.', 'У флага тег «Finish». Когда герой его касается, напиши результат в консоль — в настоящей игре здесь показывают экран победы.'),
    task: T('The whole level: coins, a wall, an enemy. Reach the flag and write "You win! Coins: …".', 'Весь уровень: монеты, стена, враг. Дойди до флага и напиши «You win! Coins: …».'),
    hint: T('if (other.CompareTag("Finish")) { Debug.Log("You win! Coins: " + coins); }', 'if (other.CompareTag("Finish")) { Debug.Log("You win! Coins: " + coins); }'),
    width: 16,
    height: 7,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [
      ...ground(16),
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 3, y: 1.5 },
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 5, y: 2.9 },
      { name: 'Slime', tag: 'Enemy', sprite: 'enemy', x: 12, y: 1.4, h: 0.8, danger: true },
      { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 15, y: 1.5 },
    ],
    goal: { type: 'log', text: 'You win!' },
    starter: both(5, T('If we touched the "Finish" flag: Debug.Log("You win! Coins: " + coins);', 'Если коснулись флага «Finish»: Debug.Log("You win! Coins: " + coins);')),
    solution: script(5),
    demo: [
      { until: 0.75, keys: ['ArrowRight'] },
      { until: 0.8, keys: ['ArrowRight', ' '] },
      { until: 2.15, keys: ['ArrowRight'] },
      { until: 2.2, keys: ['ArrowRight', ' '] },
      { until: 2.65, keys: ['ArrowRight'] },
      { until: 3.85, keys: [] },
      { until: 9, keys: ['ArrowRight'] },
    ],
  },
];

export const PROJECT_IDS = new Set(PROJECT.map((p) => p.id));

// Lessons for the "Learn" section. Every lesson is a tiny piece of a game, written in five
// languages (C#, C++, C, Python, JavaScript). Lines carry markers like //@a or #@a; the step-by-step
// animation refers to markers, so one animation script works for all five languages.
//
// The printed output of the C, C++, Python and JavaScript versions is checked by the tests, which
// compile and run them (tests/learn.test.ts). Nothing from a user's own project is ever executed.

import type { Text2 } from '../i18n';

export type TrackId = 'cs' | 'cpp' | 'c' | 'py' | 'js';

export type Val = number | string | boolean | Val[] | { ref: string } | { obj: Record<string, Val> };

export interface Frame {
  /** Function name; '' is the main program. */
  fn: string;
  vars: Record<string, Val>;
}

export interface Step {
  /** Marker of the line being executed. */
  at: string;
  frames: Frame[];
  /** Text printed on the screen by this step. */
  print?: string;
  say: Text2;
  /** Variables whose value just changed (they flash). */
  changed?: string[];
  /** Only in these languages / not in these languages. */
  only?: TrackId[];
  skip?: TrackId[];
  /** Different frames for some languages. */
  langFrames?: Partial<Record<TrackId, Frame[]>>;
}

export type Game =
  | { kind: 'choice'; q: Text2; options: (string | Text2)[]; answer: number; why: Text2; /** The right option is the program's whole output. */ isOutput?: boolean }
  | { kind: 'bug'; q: Text2; at: string; from: string; to: string; why: Text2 }
  | { kind: 'order'; q: Text2; markers: string[]; why: Text2 };

export interface Lesson {
  id: string;
  icon: string;
  title: Text2;
  /** One sentence: what you will be able to do afterwards. */
  goal: Text2;
  intro: Text2;
  /** Knowledge-base concept for "learn more". */
  concept: string;
  tracks?: TrackId[];
  code: Partial<Record<TrackId, string>>;
  /** Language-specific spellings of names used in frames (e.g. C# TakeHit). */
  rename?: Partial<Record<TrackId, Record<string, string>>>;
  steps: Step[];
  games: Game[];
  gameNote?: Partial<Record<TrackId, Text2>>;
}

export interface Track {
  id: TrackId;
  name: string;
  languageId: string;
  /** What people build with it, in plain words. */
  about: Text2;
  color: string;
}

export const TRACKS: Track[] = [
  { id: 'cs', name: 'C#', languageId: 'csharp', color: '#9b6bdf', about: { en: 'Games in Unity, Windows programs, servers.', ru: 'Игры на Unity, программы для Windows, серверы.' } },
  { id: 'cpp', name: 'C++', languageId: 'cpp', color: '#5b8fd9', about: { en: 'Big games (Unreal Engine), fast programs, game engines.', ru: 'Большие игры (Unreal Engine), быстрые программы, игровые движки.' } },
  { id: 'c', name: 'C', languageId: 'c', color: '#7d8a99', about: { en: 'Small fast programs, devices, the base of many other languages.', ru: 'Маленькие быстрые программы, устройства, основа многих языков.' } },
  { id: 'py', name: 'Python', languageId: 'python', color: '#d6b13a', about: { en: 'The easiest start: scripts, data, simple games (pygame), AI.', ru: 'Самый лёгкий старт: скрипты, данные, простые игры (pygame), ИИ.' } },
  { id: 'js', name: 'JavaScript', languageId: 'javascript', color: '#e0a24a', about: { en: 'Websites and browser games.', ru: 'Сайты и игры в браузере.' } },
];

const MAIN = '';
const T = (en: string, ru: string): Text2 => ({ en, ru });

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ 1. variables
  {
    id: 'variables',
    icon: '❤️',
    title: T('Variables: the hero\'s health', 'Переменные: здоровье героя'),
    goal: T('You will know what a variable is and how its value changes.', 'Ты поймёшь, что такое переменная и как меняется её значение.'),
    intro: T(
      'A variable is a box with a name. The program puts a value in it and can replace it later. Here the box "health" keeps the hero\'s health.',
      'Переменная — это коробка с именем. Программа кладёт в неё значение и может потом заменить его. Здесь коробка «health» хранит здоровье героя.',
    ),
    concept: 'variable',
    code: {
      cs: `using System;

int health = 100;            //@a
health = health - 30;        //@b
Console.WriteLine(health);   //@c`,
      cpp: `#include <iostream>

int main() {
    int health = 100;              //@a
    health = health - 30;          //@b
    std::cout << health << "\\n";   //@c
}`,
      c: `#include <stdio.h>

int main(void) {
    int health = 100;          //@a
    health = health - 30;      //@b
    printf("%d\\n", health);    //@c
    return 0;
}`,
      py: `health = 100           #@a
health = health - 30   #@b
print(health)          #@c`,
      js: `let health = 100;         //@a
health = health - 30;     //@b
console.log(health);      //@c`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { health: 100 } }], changed: ['health'], say: T('A box named health is created and 100 is put into it. That is the hero\'s health.', 'Создаётся коробка с именем health, в неё кладётся 100. Это здоровье героя.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { health: 70 } }], changed: ['health'], say: T('First the right side is calculated: 100 − 30 = 70. Then the result goes back into health. The old 100 is gone.', 'Сначала считается правая часть: 100 − 30 = 70. Потом результат кладётся обратно в health. Старое 100 исчезает.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { health: 70 } }], print: '70', say: T('The value is shown on the screen: 70.', 'Значение показывается на экране: 70.') },
    ],
    games: [
      { kind: 'choice', q: T('What is in health after the second line?', 'Что лежит в health после второй строки?'), options: ['100', '30', '70', '130'], answer: 2, why: T('100 − 30 = 70, and the result replaces the old value.', '100 − 30 = 70, и результат заменяет старое значение.') },
      { kind: 'choice', q: T('What would be shown if the hero lost 45 instead of 30?', 'Что будет на экране, если герой потеряет 45, а не 30?'), options: ['45', '55', '145', '100'], answer: 1, why: T('100 − 45 = 55.', '100 − 45 = 55.') },
      { kind: 'bug', q: T('The hero got hit, but the health went UP! Tap the mistake.', 'Героя ударили, а здоровье ВЫРОСЛО! Нажми на ошибку.'), at: 'b', from: '-', to: '+', why: T('"+" adds. Damage must subtract, so it has to be "−".', '«+» прибавляет. Урон должен вычитать, поэтому нужен «−».') },
      { kind: 'order', q: T('Put the lines in the right order.', 'Расставь строки в правильном порядке.'), markers: ['a', 'b', 'c'], why: T('A box must exist before it is changed, and it is shown last.', 'Коробка должна появиться раньше, чем её меняют, а показывают её в конце.') },
    ],
    gameNote: {
      cs: T('In Unity, health would be a field of a script on the player object.', 'В Unity health был бы полем скрипта на объекте игрока.'),
      cpp: T('In Unreal Engine, health would be a UPROPERTY of the character class.', 'В Unreal Engine health был бы свойством (UPROPERTY) класса персонажа.'),
    },
  },

  // ------------------------------------------------------------------ 2. if
  {
    id: 'if',
    icon: '💀',
    title: T('Conditions: game over?', 'Условия: игра окончена?'),
    goal: T('You will know how a program makes decisions with if and else.', 'Ты поймёшь, как программа принимает решения с помощью if и else.'),
    intro: T(
      'if asks a yes/no question. If the answer is yes, one part runs; otherwise (else) the other part runs. Games ask such questions all the time.',
      'if задаёт вопрос «да или нет». Если ответ «да» — выполняется одна часть, иначе (else) — другая. Игры задают такие вопросы постоянно.',
    ),
    concept: 'if',
    code: {
      cs: `using System;

int health = 20;                     //@a
int damage = 25;                     //@b
health = health - damage;            //@c
if (health <= 0)                     //@d
{
    Console.WriteLine("Game over");  //@e
}
else
{
    Console.WriteLine("Keep playing");
}`,
      cpp: `#include <iostream>

int main() {
    int health = 20;                       //@a
    int damage = 25;                       //@b
    health = health - damage;              //@c
    if (health <= 0) {                     //@d
        std::cout << "Game over\\n";        //@e
    } else {
        std::cout << "Keep playing\\n";
    }
}`,
      c: `#include <stdio.h>

int main(void) {
    int health = 20;                 //@a
    int damage = 25;                 //@b
    health = health - damage;        //@c
    if (health <= 0) {               //@d
        printf("Game over\\n");       //@e
    } else {
        printf("Keep playing\\n");
    }
    return 0;
}`,
      py: `health = 20                  #@a
damage = 25                  #@b
health = health - damage     #@c
if health <= 0:              #@d
    print("Game over")       #@e
else:
    print("Keep playing")`,
      js: `let health = 20;                 //@a
const damage = 25;               //@b
health = health - damage;        //@c
if (health <= 0) {               //@d
  console.log("Game over");      //@e
} else {
  console.log("Keep playing");
}`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { health: 20 } }], changed: ['health'], say: T('The hero has only 20 health left.', 'У героя осталось всего 20 здоровья.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { health: 20, damage: 25 } }], changed: ['damage'], say: T('An enemy hits for 25.', 'Враг бьёт на 25.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { health: -5, damage: 25 } }], changed: ['health'], say: T('20 − 25 = −5. Health went below zero.', '20 − 25 = −5. Здоровье ушло ниже нуля.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { health: -5, damage: 25 } }], say: T('The question: is health ≤ 0? −5 ≤ 0 → YES. So the program goes into the first part.', 'Вопрос: health ≤ 0? −5 ≤ 0 → ДА. Значит, программа идёт в первую часть.') },
      { at: 'e', frames: [{ fn: MAIN, vars: { health: -5, damage: 25 } }], print: 'Game over', say: T('"Game over" appears. The else part is skipped completely.', 'Появляется «Game over». Часть else полностью пропускается.') },
    ],
    games: [
      { kind: 'choice', q: T('What does the program show?', 'Что покажет программа?'), options: ['Keep playing', 'Game over', '-5', T('Nothing', 'Ничего')], answer: 1, isOutput: true, why: T('−5 ≤ 0 is true, so the first part runs.', '−5 ≤ 0 — правда, поэтому выполняется первая часть.') },
      { kind: 'choice', q: T('And if the damage were 10?', 'А если урон будет 10?'), options: ['Game over', 'Keep playing', '10', T('Both lines', 'Обе строки')], answer: 1, why: T('20 − 10 = 10. 10 ≤ 0 is false → the else part runs.', '20 − 10 = 10. 10 ≤ 0 — неправда → выполняется else.') },
      { kind: 'bug', q: T('Now "Game over" appears even when the hero is alive. Tap the mistake.', 'Теперь «Game over» появляется, даже когда герой жив. Нажми на ошибку.'), at: 'd', from: '<=', to: '>=', why: T('">=" means "greater or equal". The game must end when health is LESS or equal to 0: "<=".', '«>=» значит «больше или равно». Игра должна заканчиваться, когда здоровье МЕНЬШЕ или равно 0: «<=».') },
      { kind: 'order', q: T('Put the steps in order.', 'Расставь шаги по порядку.'), markers: ['a', 'b', 'c', 'd'], why: T('Know the health and the damage, subtract, then ask the question.', 'Узнаём здоровье и урон, вычитаем, потом задаём вопрос.') },
    ],
  },

  // ------------------------------------------------------------------ 3. for loop
  {
    id: 'for',
    icon: '👾',
    title: T('Loops: a wave of enemies', 'Циклы: волна врагов'),
    goal: T('You will know how to repeat the same steps several times.', 'Ты поймёшь, как повторить одни и те же действия несколько раз.'),
    intro: T(
      'A loop repeats the same lines. A counter (here "wave") changes each time, so every round is a little different.',
      'Цикл повторяет одни и те же строки. Счётчик (здесь «wave») каждый раз меняется, поэтому каждый круг немного другой.',
    ),
    concept: 'loop-for',
    code: {
      cs: `using System;

for (int wave = 1; wave <= 3; wave++)      //@a
{
    Console.WriteLine("Enemy " + wave);    //@b
}
Console.WriteLine("Wave cleared!");        //@c`,
      cpp: `#include <iostream>

int main() {
    for (int wave = 1; wave <= 3; wave++) {        //@a
        std::cout << "Enemy " << wave << "\\n";     //@b
    }
    std::cout << "Wave cleared!\\n";                //@c
}`,
      c: `#include <stdio.h>

int main(void) {
    for (int wave = 1; wave <= 3; wave++) {    //@a
        printf("Enemy %d\\n", wave);            //@b
    }
    printf("Wave cleared!\\n");                 //@c
    return 0;
}`,
      py: `for wave in range(1, 4):      #@a
    print("Enemy", wave)      #@b
print("Wave cleared!")        #@c`,
      js: `for (let wave = 1; wave <= 3; wave++) {   //@a
  console.log("Enemy", wave);             //@b
}
console.log("Wave cleared!");             //@c`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { wave: 1 } }], changed: ['wave'], say: T('The loop starts: the counter wave is 1.', 'Цикл начинается: счётчик wave равен 1.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { wave: 1 } }], print: 'Enemy 1', say: T('The inside of the loop runs: "Enemy 1".', 'Выполняется тело цикла: «Enemy 1».') },
      { at: 'a', frames: [{ fn: MAIN, vars: { wave: 2 } }], changed: ['wave'], say: T('Back to the top: wave becomes 2. 2 is not more than 3, so we go again.', 'Снова наверх: wave становится 2. 2 не больше 3 — повторяем.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { wave: 2 } }], print: 'Enemy 2', say: T('"Enemy 2" — the second enemy.', '«Enemy 2» — второй враг.') },
      { at: 'a', frames: [{ fn: MAIN, vars: { wave: 3 } }], changed: ['wave'], say: T('wave becomes 3 — still allowed.', 'wave становится 3 — ещё можно.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { wave: 3 } }], print: 'Enemy 3', say: T('"Enemy 3". That was the last round.', '«Enemy 3». Это был последний круг.') },
      {
        at: 'c',
        frames: [{ fn: MAIN, vars: {} }],
        langFrames: { py: [{ fn: MAIN, vars: { wave: 3 } }] },
        print: 'Wave cleared!',
        say: T('The counter is past 3, so the loop ends and the program continues below it.', 'Счётчик перевалил за 3, цикл заканчивается, и программа идёт дальше, ниже цикла.'),
      },
    ],
    games: [
      { kind: 'choice', q: T('How many enemies appear?', 'Сколько врагов появится?'), options: ['1', '2', '3', '4'], answer: 2, why: T('wave goes 1, 2, 3 — three rounds.', 'wave принимает значения 1, 2, 3 — три круга.') },
      { kind: 'choice', q: T('What is the LAST line on the screen?', 'Какая строка на экране будет ПОСЛЕДНЕЙ?'), options: ['Enemy 3', 'Enemy 4', 'Wave cleared!', 'Enemy 1'], answer: 2, why: T('After the loop ends, the line below it runs once.', 'Когда цикл закончился, один раз выполняется строка под ним.') },
      { kind: 'order', q: T('Build the program: the loop, its inside, then the end message.', 'Собери программу: цикл, его тело и сообщение в конце.'), markers: ['a', 'b', 'c'], why: T('The line inside the loop must be right after the loop line.', 'Строка тела цикла должна идти сразу после строки цикла.') },
    ],
    gameNote: {
      cs: T('In Unity you could spawn enemies in such a loop with Instantiate(enemyPrefab).', 'В Unity в таком цикле можно создавать врагов: Instantiate(enemyPrefab).'),
      cpp: T('In Unreal Engine the same loop could call SpawnActor for every enemy.', 'В Unreal Engine такой же цикл мог бы вызывать SpawnActor для каждого врага.'),
    },
  },

  // ------------------------------------------------------------------ 4. while / game loop
  {
    id: 'while',
    icon: '🎞️',
    title: T('The game loop: frame by frame', 'Игровой цикл: кадр за кадром'),
    goal: T('You will know how games repeat "update the world" many times a second.', 'Ты поймёшь, как игры много раз в секунду повторяют «обнови мир».'),
    intro: T(
      'while repeats as long as a condition is true. Every game has such a loop: each round is one frame — move things, then draw them.',
      'while повторяет, пока условие верно. В каждой игре есть такой цикл: каждый круг — это один кадр: подвинуть всё, потом нарисовать.',
    ),
    concept: 'loop-while',
    code: {
      cs: `using System;

int x = 0;                            //@a
while (x < 3)                         //@b
{
    x = x + 1;                        //@c
    Console.WriteLine("Frame " + x);  //@d
}
Console.WriteLine("Done");            //@e`,
      cpp: `#include <iostream>

int main() {
    int x = 0;                               //@a
    while (x < 3) {                          //@b
        x = x + 1;                           //@c
        std::cout << "Frame " << x << "\\n";  //@d
    }
    std::cout << "Done\\n";                   //@e
}`,
      c: `#include <stdio.h>

int main(void) {
    int x = 0;                     //@a
    while (x < 3) {                //@b
        x = x + 1;                 //@c
        printf("Frame %d\\n", x);   //@d
    }
    printf("Done\\n");              //@e
    return 0;
}`,
      py: `x = 0                    #@a
while x < 3:             #@b
    x = x + 1            #@c
    print("Frame", x)    #@d
print("Done")            #@e`,
      js: `let x = 0;                     //@a
while (x < 3) {                //@b
  x = x + 1;                   //@c
  console.log("Frame", x);     //@d
}
console.log("Done");           //@e`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { x: 0 } }], changed: ['x'], say: T('The hero stands at position x = 0.', 'Герой стоит в позиции x = 0.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { x: 0 } }], say: T('Is 0 < 3? Yes → one more frame.', '0 < 3? Да → ещё один кадр.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { x: 1 } }], changed: ['x'], say: T('The hero moves one step: x = 1.', 'Герой делает шаг: x = 1.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { x: 1 } }], print: 'Frame 1', say: T('The frame is "drawn".', 'Кадр «нарисован».') },
      { at: 'b', frames: [{ fn: MAIN, vars: { x: 1 } }], say: T('1 < 3? Yes → again.', '1 < 3? Да → снова.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { x: 2 } }], changed: ['x'], say: T('Another step: x = 2.', 'Ещё шаг: x = 2.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { x: 2 } }], print: 'Frame 2', say: T('Frame 2.', 'Кадр 2.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { x: 2 } }], say: T('2 < 3? Yes.', '2 < 3? Да.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { x: 3 } }], changed: ['x'], say: T('Another step: x = 3.', 'Ещё шаг: x = 3.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { x: 3 } }], print: 'Frame 3', say: T('Frame 3.', 'Кадр 3.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { x: 3 } }], say: T('3 < 3? NO. The loop stops.', '3 < 3? НЕТ. Цикл останавливается.') },
      { at: 'e', frames: [{ fn: MAIN, vars: { x: 3 } }], print: 'Done', say: T('The program continues after the loop: "Done".', 'Программа продолжается после цикла: «Done».') },
    ],
    games: [
      { kind: 'choice', q: T('What does the screen show? (one line = one row)', 'Что будет на экране?'), options: ['Frame 0\nFrame 1\nFrame 2\nDone', 'Frame 1\nFrame 2\nFrame 3\nDone', 'Frame 1\nFrame 2\nDone', 'Done'], answer: 1, isOutput: true, why: T('x grows to 1, 2, 3 before each print; at 3 the question "3 < 3" is false.', 'x растёт до 1, 2, 3 перед каждым выводом; при 3 вопрос «3 < 3» — неправда.') },
      { kind: 'bug', q: T('This game never ends! Tap the mistake.', 'Эта игра никогда не закончится! Нажми на ошибку.'), at: 'c', from: '+', to: '-', why: T('With "−" x gets smaller (−1, −2, …) and is always < 3, so the loop never stops.', 'С «−» x уменьшается (−1, −2, …) и всегда меньше 3 — цикл не остановится никогда.') },
      { kind: 'choice', q: T('What is x when the loop stops?', 'Чему равен x, когда цикл остановился?'), options: ['0', '2', '3', '4'], answer: 2, why: T('At x = 3 the condition x < 3 becomes false.', 'При x = 3 условие x < 3 становится неправдой.') },
    ],
    gameNote: {
      cs: T('In Unity you do not write this loop yourself: the engine calls your Update() method once per frame.', 'В Unity этот цикл писать не нужно: движок сам вызывает твой метод Update() каждый кадр.'),
      cpp: T('In Unreal Engine the engine calls Tick(DeltaTime) on your actors every frame.', 'В Unreal Engine движок каждый кадр вызывает у твоих объектов Tick(DeltaTime).'),
      py: T('In pygame you write this loop yourself: while running: handle input, move, draw.', 'В pygame этот цикл пишут сами: while running: ввод, движение, рисование.'),
      js: T('In the browser, requestAnimationFrame(update) calls your function every frame.', 'В браузере requestAnimationFrame(update) вызывает твою функцию каждый кадр.'),
    },
  },

  // ------------------------------------------------------------------ 5. functions
  {
    id: 'functions',
    icon: '⚔️',
    title: T('Functions: calculating damage', 'Функции: расчёт урона'),
    goal: T('You will see how one part of a program calls another and gets a result back.', 'Ты увидишь, как одна часть программы зовёт другую и получает ответ.'),
    intro: T(
      'A function is a small machine with a name: you give it inputs, it gives back a result. Watch the "Where are we" panel: the program jumps into the function and comes back.',
      'Функция — это маленькая машина с именем: даёшь ей входные данные, она возвращает результат. Смотри на панель «Где мы сейчас»: программа прыгает в функцию и возвращается.',
    ),
    concept: 'function',
    rename: { cs: { damage: 'Damage' } },
    code: {
      cs: `using System;

int Damage(int power, bool critical)   //@f
{
    if (critical)                      //@g
    {
        return power * 2;              //@h
    }
    return power;                      //@i
}

int hit1 = Damage(10, false);          //@a
int hit2 = Damage(10, true);           //@b
Console.WriteLine(hit1 + hit2);        //@c`,
      cpp: `#include <iostream>

int damage(int power, bool critical) {   //@f
    if (critical) {                      //@g
        return power * 2;                //@h
    }
    return power;                        //@i
}

int main() {
    int hit1 = damage(10, false);        //@a
    int hit2 = damage(10, true);         //@b
    std::cout << hit1 + hit2 << "\\n";    //@c
}`,
      c: `#include <stdio.h>
#include <stdbool.h>

int damage(int power, bool critical) {   //@f
    if (critical) {                      //@g
        return power * 2;                //@h
    }
    return power;                        //@i
}

int main(void) {
    int hit1 = damage(10, false);        //@a
    int hit2 = damage(10, true);         //@b
    printf("%d\\n", hit1 + hit2);         //@c
    return 0;
}`,
      py: `def damage(power, critical):    #@f
    if critical:                #@g
        return power * 2        #@h
    return power                #@i

hit1 = damage(10, False)        #@a
hit2 = damage(10, True)         #@b
print(hit1 + hit2)              #@c`,
      js: `function damage(power, critical) {   //@f
  if (critical) {                    //@g
    return power * 2;                //@h
  }
  return power;                      //@i
}

const hit1 = damage(10, false);      //@a
const hit2 = damage(10, true);       //@b
console.log(hit1 + hit2);            //@c`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: {} }], say: T('We need the damage of the first hit, so we call the function damage(10, false).', 'Нужен урон первого удара — зовём функцию damage(10, false).') },
      { at: 'f', frames: [{ fn: MAIN, vars: {} }, { fn: 'damage', vars: { power: 10, critical: false } }], changed: ['power', 'critical'], say: T('Jump! We are inside damage now. Its inputs: power = 10, critical = false.', 'Прыжок! Теперь мы внутри damage. Её входы: power = 10, critical = false.') },
      { at: 'g', frames: [{ fn: MAIN, vars: {} }, { fn: 'damage', vars: { power: 10, critical: false } }], say: T('Is it a critical hit? No → the doubling line is skipped.', 'Удар критический? Нет → строка с удвоением пропускается.') },
      { at: 'i', frames: [{ fn: MAIN, vars: {} }, { fn: 'damage', vars: { power: 10, critical: false } }], say: T('return gives back power, which is 10, and leaves the function.', 'return отдаёт назад power, то есть 10, и выходит из функции.') },
      { at: 'a', frames: [{ fn: MAIN, vars: { hit1: 10 } }], changed: ['hit1'], say: T('Back in the main program. The answer 10 goes into hit1. The function\'s boxes are gone.', 'Вернулись в главную программу. Ответ 10 кладётся в hit1. Коробки функции исчезли.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { hit1: 10 } }], say: T('Second hit, this time critical: damage(10, true).', 'Второй удар, теперь критический: damage(10, true).') },
      { at: 'f', frames: [{ fn: MAIN, vars: { hit1: 10 } }, { fn: 'damage', vars: { power: 10, critical: true } }], changed: ['power', 'critical'], say: T('Inside damage again, with new inputs: critical = true.', 'Снова внутри damage, но с новыми входами: critical = true.') },
      { at: 'g', frames: [{ fn: MAIN, vars: { hit1: 10 } }, { fn: 'damage', vars: { power: 10, critical: true } }], say: T('Critical? Yes → go inside the if.', 'Критический? Да → заходим внутрь if.') },
      { at: 'h', frames: [{ fn: MAIN, vars: { hit1: 10 } }, { fn: 'damage', vars: { power: 10, critical: true } }], say: T('return power * 2 → 20 goes back.', 'return power * 2 → назад уходит 20.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { hit1: 10, hit2: 20 } }], changed: ['hit2'], say: T('Back again: hit2 = 20.', 'Снова назад: hit2 = 20.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { hit1: 10, hit2: 20 } }], print: '30', say: T('10 + 20 = 30 is shown.', 'На экран выводится 10 + 20 = 30.') },
    ],
    games: [
      { kind: 'choice', q: T('What does damage(10, true) give back?', 'Что вернёт damage(10, true)?'), options: ['10', '12', '20', 'true'], answer: 2, why: T('critical is true, so the function returns power * 2 = 20.', 'critical = true, значит функция возвращает power * 2 = 20.') },
      { kind: 'choice', q: T('What is printed?', 'Что будет напечатано?'), options: ['20', '30', '1020', '40'], answer: 1, isOutput: true, why: T('hit1 = 10, hit2 = 20, 10 + 20 = 30.', 'hit1 = 10, hit2 = 20, 10 + 20 = 30.') },
      { kind: 'bug', q: T('Critical hits now do LESS damage. Tap the mistake.', 'Критический удар теперь наносит МЕНЬШЕ урона. Нажми на ошибку.'), at: 'h', from: '*', to: '/', why: T('"/" divides (10 / 2 = 5). To double, multiply: "*".', '«/» делит (10 / 2 = 5). Чтобы удвоить, нужно умножать: «*».') },
      { kind: 'choice', q: T('Where does the program go right after "return"?', 'Куда идёт программа сразу после «return»?'), options: [T('To the next line inside the function', 'На следующую строку внутри функции'), T('Back to the line that called the function', 'Назад, на строку, которая вызвала функцию'), T('To the start of the program', 'В начало программы'), T('It stops', 'Останавливается')], answer: 1, why: T('return ends the function and hands the result to the caller.', 'return заканчивает функцию и отдаёт результат тому, кто её вызвал.') },
    ],
    gameNote: {
      cs: T('Unity calls your functions too: Start() once, Update() every frame, OnCollisionEnter() when something hits.', 'Unity тоже вызывает твои функции: Start() один раз, Update() каждый кадр, OnCollisionEnter() при столкновении.'),
      cpp: T('In Unreal Engine, a UFUNCTION can even be called from Blueprints.', 'В Unreal Engine функцию с UFUNCTION можно вызывать даже из Blueprints.'),
    },
  },

  // ------------------------------------------------------------------ 6. arrays / lists
  {
    id: 'arrays',
    icon: '🎒',
    title: T('Lists: the inventory', 'Списки: инвентарь'),
    goal: T('You will know how to keep many things in one variable and go through them.', 'Ты поймёшь, как хранить много вещей в одной переменной и перебирать их.'),
    intro: T(
      'A list (array) is a row of boxes under one name. Each box has a number, starting from 0. A loop can visit every box.',
      'Список (массив) — это ряд коробок под одним именем. У каждой коробки есть номер, начиная с 0. Цикл может обойти все коробки.',
    ),
    concept: 'list',
    code: {
      cs: `using System;

string[] items = { "sword", "shield", "potion" };   //@a
Console.WriteLine(items.Length);                    //@b
foreach (string item in items)                      //@c
{
    Console.WriteLine(item);                        //@d
}`,
      cpp: `#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> items = {"sword", "shield", "potion"};   //@a
    std::cout << items.size() << "\\n";                                //@b
    for (const std::string& item : items) {                           //@c
        std::cout << item << "\\n";                                    //@d
    }
}`,
      c: `#include <stdio.h>

int main(void) {
    const char *items[] = {"sword", "shield", "potion"};   //@a
    int count = sizeof(items) / sizeof(items[0]);          //@n
    printf("%d\\n", count);                                 //@b
    for (int i = 0; i < count; i++) {                      //@c
        printf("%s\\n", items[i]);                          //@d
    }
    return 0;
}`,
      py: `items = ["sword", "shield", "potion"]   #@a
print(len(items))                       #@b
for item in items:                      #@c
    print(item)                         #@d`,
      js: `const items = ["sword", "shield", "potion"];   //@a
console.log(items.length);                     //@b
for (const item of items) {                    //@c
  console.log(item);                           //@d
}`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'] } }], changed: ['items'], say: T('One name, three boxes: items[0] = sword, items[1] = shield, items[2] = potion.', 'Одно имя — три коробки: items[0] = sword, items[1] = shield, items[2] = potion.') },
      { at: 'n', only: ['c'], frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3 } }], changed: ['count'], say: T('C does not remember the length of an array, so we calculate it: total size ÷ size of one box = 3.', 'C не помнит длину массива, поэтому её вычисляют: общий размер ÷ размер одной коробки = 3.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'] } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3 } }] }, print: '3', say: T('The number of items is shown: 3.', 'Показывается количество предметов: 3.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'sword' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 0 } }] }, changed: ['item', 'i'], say: T('The loop takes the first box.', 'Цикл берёт первую коробку.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'sword' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 0 } }] }, print: 'sword', say: T('"sword" is shown.', 'Показывается «sword».') },
      { at: 'c', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'shield' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 1 } }] }, changed: ['item', 'i'], say: T('Next box.', 'Следующая коробка.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'shield' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 1 } }] }, print: 'shield', say: T('"shield" is shown.', 'Показывается «shield».') },
      { at: 'c', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'potion' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 2 } }] }, changed: ['item', 'i'], say: T('The last box.', 'Последняя коробка.') },
      { at: 'd', frames: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], item: 'potion' } }], langFrames: { c: [{ fn: MAIN, vars: { items: ['sword', 'shield', 'potion'], count: 3, i: 2 } }] }, print: 'potion', say: T('"potion". No boxes left — the loop is finished.', '«potion». Коробок больше нет — цикл закончен.') },
    ],
    games: [
      { kind: 'choice', q: T('What is the number of the box with "sword"?', 'Какой номер у коробки со «sword»?'), options: ['0', '1', '2', '3'], answer: 0, why: T('Counting starts at 0 in almost every language.', 'Почти во всех языках счёт начинается с 0.') },
      { kind: 'choice', q: T('What is printed first?', 'Что будет напечатано первым?'), options: ['sword', '3', 'potion', 'items'], answer: 1, why: T('The line with the length comes before the loop.', 'Строка с количеством идёт раньше цикла.') },
      { kind: 'order', q: T('Build it: the list, the count, the loop, its inside.', 'Собери: список, количество, цикл, тело цикла.'), markers: ['a', 'b', 'c', 'd'], why: T('A list must exist before it can be counted or looped over.', 'Список должен появиться раньше, чем его считают или перебирают.') },
    ],
    gameNote: {
      cs: T('In Unity, an inventory is often a List<Item> that grows when the player picks something up.', 'В Unity инвентарь часто делают через List<Item>, который растёт, когда игрок что-то поднимает.'),
      cpp: T('In Unreal Engine the same idea is a TArray.', 'В Unreal Engine то же самое называется TArray.'),
    },
  },

  // ------------------------------------------------------------------ 7. classes / structs
  {
    id: 'classes',
    icon: '🧙',
    title: T('Objects: a hero with abilities', 'Объекты: герой со способностями'),
    goal: T('You will know how data and actions are packed together into an object.', 'Ты поймёшь, как данные и действия упаковываются вместе в объект.'),
    intro: T(
      'A class (in C: a struct) is a blueprint. From it we make an object — a real hero with its own name and health. Methods are the hero\'s abilities.',
      'Класс (в C — структура) — это чертёж. По нему делают объект — настоящего героя со своим именем и здоровьем. Методы — это умения героя.',
    ),
    concept: 'class',
    rename: { cs: { takeHit: 'TakeHit', name: 'Name', health: 'Health', Player: 'Player' }, py: { takeHit: 'take_hit' }, c: { takeHit: 'take_hit' } },
    code: {
      cs: `using System;

var hero = new Player("Ari");                       //@a
hero.TakeHit(30);                                   //@b
Console.WriteLine(hero.Name + " " + hero.Health);   //@c

class Player
{
    public string Name;
    public int Health = 100;

    public Player(string name)       //@k
    {
        Name = name;
    }

    public void TakeHit(int amount)  //@t
    {
        Health = Health - amount;    //@u
    }
}`,
      cpp: `#include <iostream>
#include <string>

class Player {
public:
    std::string name;
    int health = 100;

    Player(std::string n) : name(n) {}     //@k

    void takeHit(int amount) {             //@t
        health = health - amount;          //@u
    }
};

int main() {
    Player hero("Ari");                                       //@a
    hero.takeHit(30);                                         //@b
    std::cout << hero.name << " " << hero.health << "\\n";     //@c
}`,
      c: `#include <stdio.h>

struct Player {
    const char *name;
    int health;
};

void take_hit(struct Player *p, int amount) {   //@t
    p->health = p->health - amount;              //@u
}

int main(void) {
    struct Player hero = {"Ari", 100};           //@a
    take_hit(&hero, 30);                         //@b
    printf("%s %d\\n", hero.name, hero.health);   //@c
    return 0;
}`,
      py: `class Player:
    def __init__(self, name):               #@k
        self.name = name
        self.health = 100

    def take_hit(self, amount):             #@t
        self.health = self.health - amount  #@u

hero = Player("Ari")                        #@a
hero.take_hit(30)                           #@b
print(hero.name, hero.health)               #@c`,
      js: `class Player {
  constructor(name) {                       //@k
    this.name = name;
    this.health = 100;
  }

  takeHit(amount) {                         //@t
    this.health = this.health - amount;     //@u
  }
}

const hero = new Player("Ari");             //@a
hero.takeHit(30);                           //@b
console.log(hero.name, hero.health);        //@c`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: {} }], skip: ['c'], say: T('We ask for a new hero made from the Player blueprint, named "Ari".', 'Просим нового героя по чертежу Player с именем «Ari».') },
      { at: 'k', skip: ['c'], frames: [{ fn: MAIN, vars: {} }, { fn: 'Player', vars: { name: 'Ari' } }], changed: ['name'], say: T('The constructor runs: it fills in the hero\'s data. name = "Ari", health = 100.', 'Работает конструктор: он заполняет данные героя. name = «Ari», health = 100.') },
      { at: 'a', frames: [{ fn: MAIN, vars: { hero: { obj: { name: 'Ari', health: 100 } } } }], changed: ['hero'], say: T('Now the variable hero holds a whole object with two fields inside.', 'Теперь в переменной hero лежит целый объект, а внутри у него два поля.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { hero: { obj: { name: 'Ari', health: 100 } } } }], say: T('We use the hero\'s ability: takeHit(30).', 'Используем умение героя: takeHit(30).') },
      { at: 't', frames: [{ fn: MAIN, vars: { hero: { obj: { name: 'Ari', health: 100 } } } }, { fn: 'takeHit', vars: { amount: 30 } }], changed: ['amount'], say: T('Inside the method. It knows which hero it belongs to (this / self), and amount = 30.', 'Внутри метода. Он знает, чей он (this / self), и amount = 30.') },
      { at: 'u', frames: [{ fn: MAIN, vars: { hero: { obj: { name: 'Ari', health: 70 } } } }, { fn: 'takeHit', vars: { amount: 30 } }], changed: ['hero'], say: T('The hero\'s own health changes: 100 − 30 = 70.', 'Меняется здоровье именно этого героя: 100 − 30 = 70.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { hero: { obj: { name: 'Ari', health: 70 } } } }], print: 'Ari 70', say: T('Name and health are shown: "Ari 70".', 'Показываются имя и здоровье: «Ari 70».') },
    ],
    games: [
      { kind: 'choice', q: T('What is printed?', 'Что будет напечатано?'), options: ['Ari 100', 'Ari 70', 'hero 70', '70 Ari'], answer: 1, isOutput: true, why: T('takeHit(30) changed the hero\'s health from 100 to 70.', 'takeHit(30) изменил здоровье героя со 100 на 70.') },
      { kind: 'choice', q: T('What is a class?', 'Что такое класс?'), options: [T('A blueprint for objects', 'Чертёж для объектов'), T('A number', 'Число'), T('A loop', 'Цикл'), T('A file name', 'Имя файла')], answer: 0, why: T('A class describes what an object has (fields) and can do (methods).', 'Класс описывает, что у объекта есть (поля) и что он умеет (методы).') },
      { kind: 'bug', q: T('The hit heals the hero instead of hurting. Tap the mistake.', 'Удар лечит героя вместо урона. Нажми на ошибку.'), at: 'u', from: '-', to: '+', why: T('Damage must be subtracted: "−".', 'Урон нужно вычитать: «−».') },
    ],
    gameNote: {
      cs: T('Every Unity script is a class: public class Player : MonoBehaviour { … }.', 'Каждый скрипт Unity — это класс: public class Player : MonoBehaviour { … }.'),
      cpp: T('Unreal characters are classes too: class AMyHero : public ACharacter { … }.', 'Персонажи в Unreal — тоже классы: class AMyHero : public ACharacter { … }.'),
      c: T('C has no classes: data lives in a struct, and functions receive a pointer to it (p->health).', 'В C нет классов: данные хранятся в struct, а функции получают указатель на неё (p->health).'),
    },
  },

  // ------------------------------------------------------------------ 8. pointers (C, C++)
  {
    id: 'pointers',
    icon: '🧭',
    title: T('Pointers: the address of a box', 'Указатели: адрес коробки'),
    goal: T('You will understand & and *, the most feared symbols of C and C++.', 'Ты поймёшь & и * — самые страшные значки в C и C++.'),
    intro: T(
      'Every box lives somewhere in memory and has an address. A pointer is a box that stores an ADDRESS. Through it you can change the original box.',
      'Каждая коробка лежит где-то в памяти и имеет адрес. Указатель — это коробка, в которой хранится АДРЕС. Через него можно изменить исходную коробку.',
    ),
    concept: 'pointer',
    tracks: ['c', 'cpp'],
    code: {
      c: `#include <stdio.h>

int main(void) {
    int health = 100;          //@a
    int *p = &health;          //@b
    *p = 50;                   //@c
    printf("%d\\n", health);    //@d
    return 0;
}`,
      cpp: `#include <iostream>

int main() {
    int health = 100;              //@a
    int* p = &health;              //@b
    *p = 50;                       //@c
    std::cout << health << "\\n";   //@d
}`,
    },
    steps: [
      { at: 'a', frames: [{ fn: MAIN, vars: { health: 100 } }], changed: ['health'], say: T('An ordinary box: health = 100.', 'Обычная коробка: health = 100.') },
      { at: 'b', frames: [{ fn: MAIN, vars: { health: 100, p: { ref: 'health' } } }], changed: ['p'], say: T('&health means "the address of health". The pointer p stores that address — it points at health.', '&health значит «адрес health». Указатель p хранит этот адрес — он указывает на health.') },
      { at: 'c', frames: [{ fn: MAIN, vars: { health: 50, p: { ref: 'health' } } }], changed: ['health'], say: T('*p means "the box p points at". So 50 goes into health itself!', '*p значит «коробка, на которую указывает p». Поэтому 50 попадает прямо в health!') },
      { at: 'd', frames: [{ fn: MAIN, vars: { health: 50, p: { ref: 'health' } } }], print: '50', say: T('health is 50, although we never wrote "health = 50".', 'health равно 50, хотя мы ни разу не написали «health = 50».') },
    ],
    games: [
      { kind: 'choice', q: T('What is printed?', 'Что будет напечатано?'), options: ['100', '50', T('an address', 'адрес'), '150'], answer: 1, isOutput: true, why: T('*p = 50 wrote into the box p points at — health.', '*p = 50 записал значение в коробку, на которую указывает p, — в health.') },
      { kind: 'choice', q: T('What does & in front of a name mean?', 'Что значит & перед именем?'), options: [T('"and"', '«и»'), T('the address of the box', 'адрес коробки'), T('multiply', 'умножить'), T('a comment', 'комментарий')], answer: 1, why: T('&health = where health lives in memory.', '&health — это место, где health лежит в памяти.') },
      { kind: 'choice', q: T('What does * in front of a pointer mean (as in *p = 50)?', 'Что значит * перед указателем (как в *p = 50)?'), options: [T('multiply', 'умножить'), T('the box it points at', 'коробка, на которую он указывает'), T('delete', 'удалить'), T('a new variable', 'новая переменная')], answer: 1, why: T('*p "follows the arrow" to the box at that address.', '*p «идёт по стрелке» к коробке по этому адресу.') },
    ],
    gameNote: {
      cpp: T('Unreal Engine uses pointers everywhere: AActor* enemy = GetWorld()->SpawnActor<…>(…);', 'Unreal Engine использует указатели везде: AActor* enemy = GetWorld()->SpawnActor<…>(…);'),
    },
  },
];

export function lessonsFor(track: TrackId): Lesson[] {
  return LESSONS.filter((l) => (!l.tracks || l.tracks.includes(track)) && l.code[track]);
}

const MARK = /\s*(?:\/\/|#)@(\w+)\s*$/;

export interface CodeLine {
  text: string;
  marker?: string;
}

/** The lesson code for a language, with markers removed from the visible text. */
export function codeLines(lesson: Lesson, track: TrackId): CodeLine[] {
  return (lesson.code[track] ?? '').split('\n').map((raw) => {
    const m = MARK.exec(raw);
    return m ? { text: raw.slice(0, m.index).replace(/\s+$/, ''), marker: m[1] } : { text: raw.replace(/\s+$/, '') };
  });
}

export function lineOf(lines: CodeLine[], marker: string): number {
  return lines.findIndex((l) => l.marker === marker);
}

export function stepsFor(lesson: Lesson, track: TrackId): Step[] {
  return lesson.steps.filter((s) => (!s.only || s.only.includes(track)) && !s.skip?.includes(track));
}

export function framesOf(step: Step, track: TrackId): Frame[] {
  return step.langFrames?.[track] ?? step.frames;
}

/** Everything the program prints, line by line. */
export function expectedOutput(lesson: Lesson, track: TrackId): string {
  return stepsFor(lesson, track)
    .filter((s) => s.print !== undefined)
    .map((s) => s.print)
    .join('\n');
}

export function displayName(lesson: Lesson, track: TrackId, name: string): string {
  return lesson.rename?.[track]?.[name] ?? name;
}

/** Value as it would be written in that language. */
export function formatVal(v: Val, track: TrackId): string {
  if (typeof v === 'boolean') return track === 'py' ? (v ? 'True' : 'False') : String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v)) return `[${v.map((x) => formatVal(x, track)).join(', ')}]`;
  if ('ref' in v) return `→ ${v.ref}`;
  return `{ ${Object.entries(v.obj)
    .map(([k, x]) => `${k}: ${formatVal(x, track)}`)
    .join(', ')} }`;
}

/** A buggy copy of the lesson code for the "find the mistake" game. */
export function buggyLines(lesson: Lesson, track: TrackId, game: Extract<Game, { kind: 'bug' }>): { lines: CodeLine[]; bugLine: number; bugCol: number } | null {
  const lines = codeLines(lesson, track).map((l) => ({ ...l }));
  const i = lineOf(lines, game.at);
  if (i < 0) return null;
  const t = lines[i].text;
  // Replace the first stand-alone occurrence of the operator.
  const re = new RegExp(`(^|[^-+*/<>=!&|])${game.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-+*/<>=&|])`);
  const m = re.exec(t);
  if (!m) return null;
  const col = m.index + m[1].length;
  lines[i].text = t.slice(0, col) + game.to + t.slice(col + game.from.length);
  return { lines, bugLine: i, bugCol: col };
}

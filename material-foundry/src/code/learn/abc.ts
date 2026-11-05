// "The ABC of code": the very first district of the path. Each level is one symbol of C# — ( ) ; " "
// = { } == // . [ ] — and the robot Bit on the right does exactly what the code says. The code is
// real C#, run by the safe interpreter; robot and cat are engine objects (like transform in Unity).
//
// How it is made to stick (on purpose, not by accident):
//  • every symbol has ONE funny "moment" — the thing that goes wrong without it (the robot glues two
//    commands and trips, faints after "lives = 0", says "What a downpour!" in the sun…). A small
//    surprise is remembered much better than a rule; the rule is then attached to the picture.
//  • every symbol has ONE short anchor sentence ("= puts, == asks") — the same words on the card,
//    in the review deck and in the boss fight.
//  • the boss at the end brings all moments back at once: retrieval, not re-reading.

import { tr, type Text2 } from '../i18n';
import { CsError, NOT_FOUND, csText, type Host, type HostV, type V } from '../run/csharp';
import { runCSharp } from '../run/runner';

const T = (en: string, ru: string): Text2 => ({ en, ru });

export type Who = 'robot' | 'cat';
export type Act = 'jump' | 'walk' | 'say' | 'wave' | 'umbrella' | 'dance' | 'take' | 'meow' | 'trip' | 'confused' | 'faint' | 'search' | 'empty' | 'look' | 'fall' | 'win';

export interface AbcAction {
  who: Who;
  act: Act;
  text?: string;
  /** For jump/walk: how many. */
  n?: number;
  /** Robot cell after the action. */
  x?: number;
}

export interface AbcRun {
  source: string;
  actions: AbcAction[];
  /** Everything said (robot.Say / cat.Meow), in order. */
  said: string[];
  error?: { line: number; message: string; code?: string };
  /** The robot's cell at the end. */
  x: number;
  fell: boolean;
  /** Variables at the end (name → shown value). */
  vars: { name: string; value: string }[];
}

export interface AbcMoment {
  id: string;
  /** Detects the mistake (on the text, or on what happened). */
  when: (run: AbcRun) => boolean;
  /** What the robot does instead (replaces the normal actions unless keep is set). */
  show: () => AbcAction[];
  keep?: boolean;
  /** One or two short sentences: what happened and why. */
  say: Text2;
}

export interface AbcGoal {
  text: Text2;
  check: (run: AbcRun) => boolean;
}

export interface AbcScene {
  rain?: boolean;
  cat?: boolean;
  bag?: string[];
  pit?: number;
  flag?: number;
  boxes?: boolean;
}

export interface AbcLevel {
  id: string;
  symbol: string;
  title: Text2;
  /** The one sentence to remember. */
  anchor: Text2;
  /** At most three short paragraphs. */
  story: Text2[];
  task: Text2;
  starter: Text2;
  answer: Text2;
  hint: Text2;
  goals: AbcGoal[];
  moments: AbcMoment[];
  scene: (source: string) => AbcScene;
  /** The same symbol in a real Unity script. */
  unity: { code: string; say: Text2 };
}

// ------------------------------------------------------------------------------------- running

const PIT_FALL = 'abc-fell';

/** Runs the learner's code: robot and cat are the engine objects. */
export async function runAbc(source: string, scene: AbcScene = {}): Promise<AbcRun> {
  const actions: AbcAction[] = [];
  const said: string[] = [];
  let x = 0;
  let fell = false;
  const push = (a: AbcAction) => {
    if (actions.length < 80) actions.push({ ...a, x });
  };
  const actor = (who: Who): HostV => ({ k: 'host', kind: 'actor', ref: who });
  const host = {
    global: (name: string): V | typeof NOT_FOUND => (name === 'robot' || name === 'cat' ? actor(name) : NOT_FOUND),
    method(target: HostV, name: string, args: V[], line: number): V | typeof NOT_FOUND {
      if (target.kind !== 'actor') return NOT_FOUND;
      const who = target.ref as Who;
      const num = (i: number, d: number) => (typeof args[i] === 'number' ? Math.max(0, Math.min(20, Math.round(args[i] as number))) : d);
      if (who === 'robot') {
        switch (name) {
          case 'Walk': {
            const n = num(0, 1);
            let down = false;
            for (let i = 0; i < n && !down; i++) {
              x += 1;
              down = scene.pit !== undefined && x === scene.pit;
            }
            push({ who, act: 'walk', n });
            if (down) {
              fell = true;
              push({ who, act: 'fall', text: tr('Aaa!', 'Аааа!') });
              throw new CsError(PIT_FALL, line, 'runtime');
            }
            return undefined;
          }
          case 'Jump': {
            const n = num(0, 1);
            // a jump hops over one cell when there is a pit right in front
            const over = scene.pit !== undefined && x + 1 === scene.pit;
            if (over) x += 2;
            push({ who, act: 'jump', n });
            return undefined;
          }
          case 'Say': {
            const t = csText(args[0]);
            said.push(t);
            push({ who, act: 'say', text: t });
            return undefined;
          }
          case 'Wave':
            push({ who, act: 'wave' });
            return undefined;
          case 'Umbrella':
            push({ who, act: 'umbrella' });
            return undefined;
          case 'Dance':
            push({ who, act: 'dance' });
            return undefined;
          case 'Take': {
            const t = csText(args[0]);
            push({ who, act: 'take', text: t });
            return undefined;
          }
          case 'AtFlag':
            return scene.flag !== undefined && x >= scene.flag;
          case 'Meow':
            throw new CsError(tr('The robot has no method Meow (CS1061): robots do not meow — cat does.', 'У робота нет метода Meow (CS1061): роботы не мяукают — это умеет cat.'), line, 'runtime', 'CS1061');
        }
      } else {
        switch (name) {
          case 'Jump':
            push({ who, act: 'jump', n: num(0, 1) });
            return undefined;
          case 'Meow':
            said.push(tr('Meow!', 'Мяу!'));
            push({ who, act: 'meow', text: tr('Meow!', 'Мяу!') });
            return undefined;
          case 'Say':
          case 'Walk':
          case 'Wave':
            throw new CsError(tr(`The cat has no method ${name} (CS1061): cats only Jump() and Meow().`, `У кота нет метода ${name} (CS1061): коты умеют только Jump() и Meow().`), line, 'runtime', 'CS1061');
        }
      }
      throw new CsError(tr(`"${who}" has no method ${name} (CS1061). Check the spelling and capital letters.`, `У «${who}» нет метода ${name} (CS1061). Проверь написание и большие буквы.`), line, 'runtime', 'CS1061');
    },
    get(target: HostV, name: string, line: number): V | typeof NOT_FOUND {
      if (target.kind !== 'actor') return NOT_FOUND;
      throw new CsError(tr(`${name} without ( ) is only a name — nothing happens (CS0201).`, `${name} без ( ) — это только название, ничего не происходит (CS0201).`), line, 'compile', 'CS0201');
    },
  };
  const r = await runCSharp(source, [], { host: host as Host, trace: true, maxSteps: 20000, maxTrace: 4000 });
  const last = r.steps.at(-1)?.frames?.[0];
  const vars = (last?.vars ?? []).map((v) => ({ name: v.name, value: v.value.text }));
  const run: AbcRun = { source, actions, said, x, fell, vars };
  const err = r.error ?? (r.problems?.[0] ? { ...r.problems[0], kind: 'compile' } : undefined);
  if (err && err.message !== PIT_FALL) run.error = { line: err.line, message: err.message, code: err.code };
  return run;
}

/** The first matching funny moment of a level (or of all levels, for the boss). */
export function momentOf(level: AbcLevel, run: AbcRun): AbcMoment | null {
  return level.moments.find((m) => m.when(run)) ?? null;
}

// ------------------------------------------------------------------------------------- moments

const said = (run: AbcRun, text: string) => run.said.some((s) => s.trim().toLowerCase() === text.toLowerCase());
const did = (run: AbcRun, who: Who, act: Act, n?: number) => run.actions.some((a) => a.who === who && a.act === act && (n === undefined || a.n === n));
const ok = (run: AbcRun) => !run.error && !run.fell;
/** The code without comments (so a commented-out line does not count). */
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const M_PARENS: AbcMoment = {
  id: 'parens',
  when: (r) => /\b(robot|cat)\.[A-Za-z]+\s*;/.test(code(r.source)),
  show: () => [{ who: 'robot', act: 'look', text: tr('Jump…? A button. Nice button.', 'Jump…? Кнопка. Красивая кнопка.') }],
  say: T('The robot read the word, looked at the button… and did not press it. Without ( ) a name is only a name. Real C# says: CS0201.', 'Робот прочитал слово, посмотрел на кнопку… и не нажал. Без ( ) — это просто название. Настоящий C# скажет: CS0201.'),
};
const M_SEMI: AbcMoment = {
  id: 'semicolon',
  when: (r) => !!r.error && /CS1002|semicolon|точка с запятой/i.test(`${r.error.code ?? ''} ${r.error.message}`),
  show: () => [{ who: 'robot', act: 'trip', text: tr('Walk(2)robot.Jump()…?!', 'Walk(2)robot.Jump()…?!') }],
  say: T('For the computer, line breaks mean nothing — two commands glued into one long word, and the robot tripped over it. ; ends a command, like a full stop ends a sentence.', 'Для компьютера переносы строк ничего не значат — две команды склеились в одно длинное слово, и робот об него споткнулся. ; заканчивает команду, как точка — предложение.'),
};
const M_QUOTES: AbcMoment = {
  id: 'quotes',
  when: (r) => !!r.error && /CS0103/.test(r.error.code ?? '') && /Say\(\s*[^"\s)]/.test(code(r.source)),
  show: () => [{ who: 'robot', act: 'search', text: tr('Where is the box with this name?', 'Где коробка с таким именем?') }],
  say: T('Without quotes the robot thought it was the NAME of a box and went looking for it. There is no such box — CS0103. Text always goes in "quotes".', 'Без кавычек робот решил, что это ИМЯ коробки, и пошёл её искать. Такой коробки нет — CS0103. Текст всегда пишут в "кавычках".'),
};
const M_ASSIGN_BACKWARDS: AbcMoment = {
  id: 'assign-backwards',
  when: (r) => /^\s*\d+\s*=\s*[A-Za-z_]/m.test(code(r.source)),
  show: () => [{ who: 'robot', act: 'confused', text: tr('Put a box INTO the number 5?!', 'Положить коробку В ЧИСЛО 5?!') }],
  say: T('= works from right to left, and on the left there must ALWAYS be a box. "5 = coins" is like putting a wardrobe into a coin. C#: CS0131.', '= работает справа налево, и слева ВСЕГДА должна быть коробка. «5 = coins» — как положить шкаф в монетку. C#: CS0131.'),
};
const M_LOST_VALUE: AbcMoment = {
  id: 'lost-value',
  when: (r) => /^\s*[A-Za-z_]\w*\s*[+\-*/]\s*\d+\s*;/m.test(code(r.source)),
  show: () => [{ who: 'robot', act: 'confused', text: tr('6… and where do I put it?', '6… а куда это положить?') }],
  keep: true,
  say: T('The robot counted coins + 1 = 6… and dropped it: nobody said WHERE to put it. You need "coins = coins + 1;". Real C# does not even allow such a line (CS0201).', 'Робот посчитал coins + 1 = 6… и уронил: никто не сказал, КУДА положить. Нужно «coins = coins + 1;». Настоящий C# такую строку даже не пропустит (CS0201).'),
};
const M_EQ: AbcMoment = {
  id: 'equals-in-if',
  when: (r) => !!r.error && (/CS0029/.test(r.error.code ?? '') || /\bif\s*\((?:[^=()]|\([^()]*\))*[^=!<>]=(?!=)/.test(code(r.source))),
  show: () => [{ who: 'robot', act: 'faint', text: tr('lives = 0… I PUT 0 into my lives?!', 'lives = 0… я ПОЛОЖИЛ 0 в свои жизни?!') }],
  say: T('One = and instead of the question "are lives 0?" the robot PUT 0 into its lives and fainted. Luckily real C# will not run this (CS0029). A question is written with two: ==.', 'Одно = — и вместо вопроса «жизней 0?» робот ПОЛОЖИЛ 0 в свои жизни и упал в обморок. Хорошо, что настоящий C# такое не запустит (CS0029). Вопрос пишут двумя: ==.'),
};
const M_RAIN: AbcMoment = {
  id: 'outside-braces',
  when: (r) => !/raining\s*=\s*true/.test(code(r.source)) && r.said.some((s) => /ливень|downpour/i.test(s)),
  show: () => [],
  keep: true,
  say: T('The sun is shining and the robot shouts "What a downpour!" 😅 That line stands AFTER the } — so it runs always. Only what is inside { } belongs to the if.', 'Светит солнце, а робот кричит «Ну и ливень!» 😅 Эта строка стоит ПОСЛЕ } — поэтому выполняется всегда. К if относится только то, что внутри { }.'),
};
const M_DANCE: AbcMoment = {
  id: 'dance',
  when: (r) => r.actions.some((a) => a.act === 'dance'),
  show: () => [],
  keep: true,
  say: T('Right in the middle of the level the robot started dancing 🕺 and the timer ran out. Do not delete the line — switch it off with //.', 'Прямо посреди уровня робот пустился в пляс 🕺 и время вышло. Не стирай строку — выключи её с помощью //.'),
};
const M_MEOW: AbcMoment = {
  id: 'robot-meow',
  when: (r) => !!r.error && /CS1061/.test(r.error.code ?? '') && /robot\s*\.\s*Meow/.test(code(r.source)),
  show: () => [{ who: 'robot', act: 'confused', text: tr('I am a robot. I. Do. Not. Meow.', 'Я робот. Я. Не. Мяукаю.') }],
  say: T('The dot says WHO does it. robot.Meow() asks the robot — and it does not know how (CS1061). cat.Meow() asks the cat.', 'Точка говорит, КТО это делает. robot.Meow() просит робота — а он не умеет (CS1061). cat.Meow() — просит кота.'),
};
const M_INDEX1: AbcMoment = {
  id: 'index-from-zero',
  when: (r) => !r.error && r.actions.some((a) => a.act === 'take' && /яблоко|apple/i.test(a.text ?? '')),
  show: () => [],
  keep: true,
  say: T('You said [1] — and the robot took the APPLE 🍎. Counting starts at 0: the key is [0], the apple [1], the sword [2]. "Zero is the first."', 'Ты сказал [1] — а робот взял ЯБЛОКО 🍎. Счёт идёт с нуля: ключ — [0], яблоко — [1], меч — [2]. «Нулевой — это первый».'),
};
const M_INDEX_OUT: AbcMoment = {
  id: 'index-out',
  when: (r) => !!r.error && /IndexOutOfRange/.test(r.error.code ?? r.error.message),
  show: () => [{ who: 'robot', act: 'empty', text: tr('There is no pocket [3]!', 'В рюкзаке нет кармана [3]!') }],
  say: T('There are only three cells: 0, 1, 2. Cell [3] does not exist — IndexOutOfRangeException, one of the most common errors in games.', 'Ячеек всего три: 0, 1, 2. Ячейки [3] нет — IndexOutOfRangeException, одна из самых частых ошибок в играх.'),
};
const M_PIT: AbcMoment = {
  id: 'pit',
  when: (r) => r.fell,
  show: () => [],
  keep: true,
  say: T('The robot walked straight into the pit. Walk to the edge, then Jump() — a jump carries it over.', 'Робот шагнул прямо в яму. Дойди до края, потом Jump() — прыжок перенесёт через неё.'),
};

const NO_SCENE = (): AbcScene => ({});

// ------------------------------------------------------------------------------------- levels

export const ABC_LEVELS: AbcLevel[] = [
  {
    id: 'abc-parens',
    symbol: '( )',
    title: T('Round brackets — press the button', 'Круглые скобки — нажать кнопку'),
    anchor: T('( ) = press the button. Inside — how much or what.', '( ) — нажать кнопку. Внутри — сколько или что.'),
    story: [
      T('This is Bit, your robot. He does exactly what the code says — not what you meant.', 'Это Бит, твой робот. Он делает ровно то, что написано в коде, — а не то, что ты имел в виду.'),
      T('robot.Jump is only the NAME of the button. The brackets ( ) press it. Inside the brackets you can say how many times: Jump(3).', 'robot.Jump — это только НАЗВАНИЕ кнопки. Скобки ( ) — нажатие. В скобках можно сказать, сколько раз: Jump(3).'),
      T('The ; at the end closes the command — that is the next level.', 'Знак ; в конце закрывает команду — про него следующий уровень.'),
    ],
    task: T('1) Make Bit jump. 2) Then make him jump 3 times with ONE command.', '1) Сделай, чтобы Бит подпрыгнул. 2) Потом — чтобы прыгнул 3 раза ОДНОЙ командой.'),
    starter: T('robot.Jump;\n', 'robot.Jump;\n'),
    answer: T('robot.Jump(3);\n', 'robot.Jump(3);\n'),
    hint: T('Add ( ) after Jump. For three jumps put 3 inside: robot.Jump(3);', 'Допиши ( ) после Jump. Для трёх прыжков положи внутрь 3: robot.Jump(3);'),
    goals: [
      { text: T('Bit jumps', 'Бит прыгает'), check: (r) => ok(r) && did(r, 'robot', 'jump') },
      { text: T('Three jumps in one command: Jump(3)', 'Три прыжка одной командой: Jump(3)'), check: (r) => ok(r) && did(r, 'robot', 'jump', 3) },
    ],
    moments: [M_PARENS, M_SEMI],
    scene: NO_SCENE,
    unity: { code: 'Jump();\nDebug.Log("Hi");', say: T('In Unity it is the same: Jump(); runs your method, Debug.Log("Hi") prints "Hi" — the brackets press the button and carry what is inside.', 'В Unity так же: Jump(); запускает твой метод, Debug.Log("Hi") печатает «Hi» — скобки нажимают кнопку и передают то, что внутри.') },
  },
  {
    id: 'abc-semicolon',
    symbol: ';',
    title: T('Semicolon — the end of a command', 'Точка с запятой — конец команды'),
    anchor: T('; = the full stop of a command.', '; — точка в конце команды.'),
    story: [
      T('The computer does not see line breaks: for it the whole code is one long ribbon.', 'Компьютер не видит переносов строк: для него весь код — одна длинная лента.'),
      T('; says "this command is over". Forget it — and two commands glue into one strange word.', '; говорит: «команда закончилась». Забудешь — и две команды склеятся в одно странное слово.'),
    ],
    task: T('Bit must walk 2 steps, jump and say "Done!". Find where ; is missing.', 'Бит должен пройти 2 шага, прыгнуть и сказать «Готово!». Найди, где не хватает ;.'),
    starter: T('robot.Walk(2)\nrobot.Jump();\nrobot.Say("Done!")\n', 'robot.Walk(2)\nrobot.Jump();\nrobot.Say("Готово!")\n'),
    answer: T('robot.Walk(2);\nrobot.Jump();\nrobot.Say("Done!");\n', 'robot.Walk(2);\nrobot.Jump();\nrobot.Say("Готово!");\n'),
    hint: T('Every command ends with ; — look at the ends of lines 1 and 3.', 'Каждая команда кончается на ; — посмотри на концы строк 1 и 3.'),
    goals: [
      { text: T('Walk 2 steps', 'Пройти 2 шага'), check: (r) => ok(r) && did(r, 'robot', 'walk', 2) },
      { text: T('Jump and say "Done!"', 'Прыгнуть и сказать «Готово!»'), check: (r) => ok(r) && did(r, 'robot', 'jump') && (said(r, 'Готово!') || said(r, 'Done!')) },
    ],
    moments: [M_SEMI, M_PARENS],
    scene: NO_SCENE,
    unity: { code: 'speed = 5f;\ntransform.position += Vector3.right;', say: T('Every line of a Unity script that DOES something ends with ;. Lines with { } (like void Update()) do not — they are rooms, see level 5.', 'Каждая строка скрипта Unity, которая что-то ДЕЛАЕТ, кончается на ;. Строки с { } (как void Update()) — нет: это комнаты, см. уровень 5.') },
  },
  {
    id: 'abc-quotes',
    symbol: '" "',
    title: T('Quotes — text as it is', 'Кавычки — текст как есть'),
    anchor: T('"in quotes" = text letter by letter. Without quotes = a name or a calculation.', '"в кавычках" — текст буква в букву. Без кавычек — имя или вычисление.'),
    story: [
      T('In "quotes" is TEXT: Bit says the letters exactly as written.', 'В "кавычках" — ТЕКСТ: Бит произносит буквы ровно как написано.'),
      T('Without quotes it is a NAME — Bit looks for a box with that name. And "2 + 2" is text, while 2 + 2 is 4.', 'Без кавычек — это ИМЯ: Бит ищет коробку с таким именем. А "2 + 2" — это текст, тогда как 2 + 2 — это 4.'),
    ],
    task: T('1) Make Bit say Hello. 2) Then: first say "2 + 2" as text, then the answer of 2 + 2.', '1) Сделай, чтобы Бит сказал Привет. 2) Потом: сначала "2 + 2" как текст, затем ответ 2 + 2.'),
    starter: T('robot.Say(Hello);\n', 'robot.Say(Привет);\n'),
    answer: T('robot.Say("Hello");\nrobot.Say("2 + 2");\nrobot.Say(2 + 2);\n', 'robot.Say("Привет");\nrobot.Say("2 + 2");\nrobot.Say(2 + 2);\n'),
    hint: T('Text goes in quotes: robot.Say("Привет"); For the sum write it without quotes: robot.Say(2 + 2);', 'Текст — в кавычки: robot.Say("Привет"); Для суммы пиши без кавычек: robot.Say(2 + 2);'),
    goals: [
      { text: T('Bit says Hello (Привет)', 'Бит говорит Привет'), check: (r) => ok(r) && (said(r, 'Привет') || said(r, 'Hello')) },
      { text: T('Says "2 + 2" as text and then 4', 'Говорит "2 + 2" как текст, а потом 4'), check: (r) => ok(r) && r.said.some((s) => s.replace(/\s/g, '') === '2+2') && said(r, '4') },
    ],
    moments: [M_QUOTES, M_SEMI, M_PARENS],
    scene: NO_SCENE,
    unity: { code: 'Debug.Log("Score: " + score);\ngameObject.tag = "Enemy";', say: T('Text in Unity is always in quotes: messages, tags, names of scenes. "Score: " + score glues text and a number.', 'Текст в Unity всегда в кавычках: сообщения, теги, имена сцен. "Score: " + score склеивает текст и число.') },
  },
  {
    id: 'abc-assign',
    symbol: '=',
    title: T('Equals — put into the box', 'Равно — положить в коробку'),
    anchor: T('= puts: the value on the right goes into the box on the left.', '= кладёт: значение справа — в коробку слева.'),
    story: [
      T('= is NOT "equals" from maths. It is an arrow "put": from right to left.', '= — это НЕ «равно» из математики. Это стрелка «положи»: справа налево.'),
      T('int coins = 5; — make a box coins and put 5 in it. coins = coins + 1; — take, add 1, put back.', 'int coins = 5; — сделай коробку coins и положи в неё 5. coins = coins + 1; — возьми, прибавь 1, положи обратно.'),
    ],
    task: T('Bit found one more coin. Add it to the box on the empty line, so he says 5 and then 6.', 'Бит нашёл ещё монету. Добавь её в коробку на пустой строке, чтобы он сказал 5, а потом 6.'),
    starter: T('int coins = 5;\nrobot.Say(coins);\n// Bit found one more coin:\n\nrobot.Say(coins);\n', 'int coins = 5;\nrobot.Say(coins);\n// Бит нашёл ещё одну монету:\n\nrobot.Say(coins);\n'),
    answer: T('int coins = 5;\nrobot.Say(coins);\n// Bit found one more coin:\ncoins = coins + 1;\nrobot.Say(coins);\n', 'int coins = 5;\nrobot.Say(coins);\n// Бит нашёл ещё одну монету:\ncoins = coins + 1;\nrobot.Say(coins);\n'),
    hint: T('On the empty line: coins = coins + 1;', 'На пустой строке: coins = coins + 1;'),
    goals: [{ text: T('Bit says 5, then 6', 'Бит говорит 5, а потом 6'), check: (r) => ok(r) && r.said.join(',') === '5,6' && /int\s+coins\s*=\s*5\s*;/.test(code(r.source)) }],
    moments: [M_ASSIGN_BACKWARDS, M_LOST_VALUE, M_SEMI, M_QUOTES],
    scene: () => ({ boxes: true }),
    unity: { code: 'health = health - damage;\nscore += 10;', say: T('In games = is everywhere: health = health - damage; score += 10 is the short form of score = score + 10.', 'В играх = повсюду: health = health - damage; а score += 10 — короткая запись score = score + 10.') },
  },
  {
    id: 'abc-braces',
    symbol: '{ }',
    title: T('Curly braces — a room of commands', 'Фигурные скобки — комната для команд'),
    anchor: T('{ } = a room: everything inside belongs to the line above it.', '{ } — комната: всё внутри принадлежит строке над ней.'),
    story: [
      T('if (raining) means "if it is raining". After it comes a room { } — the commands that run ONLY then.', 'if (raining) значит «если идёт дождь». За ним — комната { }: команды, которые выполняются ТОЛЬКО тогда.'),
      T('A line after the closing } is outside the room — it runs always.', 'Строка после закрывающей } — уже за дверью комнаты: она выполняется всегда.'),
    ],
    task: T('Run it: the sun is shining, and Bit shouts about a downpour. Move the shout into the room { }. Then set raining = true and check: umbrella and shout.', 'Запусти: светит солнце, а Бит кричит про ливень. Перенеси крик внутрь комнаты { }. Потом поставь raining = true и проверь: зонт и крик.'),
    starter: T('bool raining = false;\nif (raining)\n{\n    robot.Umbrella();\n}\nrobot.Say("What a downpour!");\n', 'bool raining = false;\nif (raining)\n{\n    robot.Umbrella();\n}\nrobot.Say("Ну и ливень!");\n'),
    answer: T('bool raining = true;\nif (raining)\n{\n    robot.Umbrella();\n    robot.Say("What a downpour!");\n}\n', 'bool raining = true;\nif (raining)\n{\n    robot.Umbrella();\n    robot.Say("Ну и ливень!");\n}\n'),
    hint: T('Cut the line robot.Say(…); and paste it right under robot.Umbrella(); — before the }.', 'Вырежи строку robot.Say(…); и вставь её сразу под robot.Umbrella(); — до }.'),
    goals: [
      { text: T('In the sun Bit is silent', 'На солнце Бит молчит'), check: (r) => ok(r) && /raining\s*=\s*false/.test(code(r.source)) && r.said.length === 0 && /\{[^{}]*Say\([^{}]*\}/.test(code(r.source)) },
      { text: T('In the rain: umbrella and the shout', 'В дождь: зонт и крик'), check: (r) => ok(r) && /raining\s*=\s*true/.test(code(r.source)) && did(r, 'robot', 'umbrella') && r.said.length > 0 },
    ],
    moments: [M_RAIN, M_SEMI, M_QUOTES],
    scene: (s) => ({ rain: /raining\s*=\s*true/.test(code(s)) }),
    unity: { code: 'void Update()\n{\n    if (Input.GetKeyDown(KeyCode.Space))\n    {\n        Jump();\n    }\n}', say: T('In Unity rooms are inside rooms: the class { }, the method Update { }, the if { }. Each } closes the nearest open room.', 'В Unity комнаты внутри комнат: класс { }, метод Update { }, if { }. Каждая } закрывает ближайшую открытую комнату.') },
  },
  {
    id: 'abc-compare',
    symbol: '==',
    title: T('Double equals — a question', 'Двойное равно — вопрос'),
    anchor: T('= puts, == asks.', '= кладёт, == спрашивает.'),
    story: [
      T('== is a question: "are they equal?" The answer is true (yes) or false (no).', '== — это вопрос: «равны ли?». Ответ — true (да) или false (нет).'),
      T('= puts, == asks. Mix them up — and instead of asking, Bit puts a number into the box.', '= кладёт, == спрашивает. Перепутаешь — и вместо вопроса Бит положит число в коробку.'),
    ],
    task: T('1) Run it and see what one = does. Fix it so Bit says "Game over". 2) Then give him lives = 3 — he must be silent.', '1) Запусти и посмотри, что делает одно =. Исправь, чтобы Бит сказал «Game over». 2) Потом дай ему lives = 3 — он должен промолчать.'),
    starter: T('int lives = 0;\nif (lives = 0)\n{\n    robot.Say("Game over");\n}\n', 'int lives = 0;\nif (lives = 0)\n{\n    robot.Say("Game over");\n}\n'),
    answer: T('int lives = 3;\nif (lives == 0)\n{\n    robot.Say("Game over");\n}\n', 'int lives = 3;\nif (lives == 0)\n{\n    robot.Say("Game over");\n}\n'),
    hint: T('In the if write two: lives == 0', 'В if нужно два: lives == 0'),
    goals: [
      { text: T('With 0 lives: "Game over"', 'При 0 жизней: «Game over»'), check: (r) => ok(r) && /==/.test(code(r.source)) && said(r, 'Game over') },
      { text: T('With 3 lives Bit is silent', 'При 3 жизнях Бит молчит'), check: (r) => ok(r) && /lives\s*=\s*3\s*;/.test(code(r.source)) && /==/.test(code(r.source)) && r.said.length === 0 },
    ],
    moments: [M_EQ, M_SEMI, M_QUOTES],
    scene: () => ({ boxes: true }),
    unity: { code: 'if (health <= 0) Die();\nif (other.tag == "Coin") Collect();', say: T('Questions in Unity: == equal, != not equal, < > less / more, <= >= less or equal / more or equal.', 'Вопросы в Unity: == равно, != не равно, < > меньше / больше, <= >= меньше или равно / больше или равно.') },
  },
  {
    id: 'abc-comment',
    symbol: '//',
    title: T('Comments — a note the robot does not read', 'Комментарии — записка, которую робот не читает'),
    anchor: T('// = for people; the robot skips it.', '// — для людей; робот это пропускает.'),
    story: [
      T('Everything after // up to the end of the line is for people. Bit skips it.', 'Всё после // до конца строки — для людей. Бит это пропускает.'),
      T('Handy: leave yourself a hint, or "switch off" a line without deleting it.', 'Удобно: оставить себе подсказку или «выключить» строку, не стирая её.'),
    ],
    task: T('Run it: Bit dances in the middle of the level 🕺. Switch the dance off with // (do not delete the line), and write a note above Walk.', 'Запусти: Бит танцует посреди уровня 🕺. Выключи танец с помощью // (не стирай строку) и напиши записку над Walk.'),
    starter: T('robot.Walk(3);\nrobot.Dance();\nrobot.Jump();\n', 'robot.Walk(3);\nrobot.Dance();\nrobot.Jump();\n'),
    answer: T('// go to the edge and jump\nrobot.Walk(3);\n// robot.Dance();\nrobot.Jump();\n', '// иду к краю и прыгаю\nrobot.Walk(3);\n// robot.Dance();\nrobot.Jump();\n'),
    hint: T('Put // in front of robot.Dance(); and add a line like // go and jump at the top.', 'Поставь // перед robot.Dance(); и допиши сверху строку вроде // иду и прыгаю.'),
    goals: [
      { text: T('No dance, the line is still there (with //)', 'Без танца, а строка осталась (с //)'), check: (r) => ok(r) && !did(r, 'robot', 'dance') && /\/\/\s*robot\.Dance/.test(r.source) && did(r, 'robot', 'jump') },
      { text: T('A note for yourself', 'Записка для себя'), check: (r) => ok(r) && (r.source.match(/\/\/(?!\s*robot\.)\s*\S/g) ?? []).length >= 1 },
    ],
    moments: [M_DANCE, M_SEMI],
    scene: NO_SCENE,
    unity: { code: '// Player speed in metres per second\npublic float speed = 5f;\n// Debug.Log("test");', say: T('In real projects // explains WHY the code is like this, and switches off test lines.', 'В настоящих проектах // объясняет, ПОЧЕМУ код такой, и выключает проверочные строки.') },
  },
  {
    id: 'abc-dot',
    symbol: '.',
    title: T('The dot — whose is it', 'Точка — «чей?»'),
    anchor: T('. = who does it: robot.Jump() is the robot, cat.Jump() is the cat.', '. — кто делает: robot.Jump() — робот, cat.Jump() — кот.'),
    story: [
      T('The dot joins WHO and WHAT: robot.Jump() — the robot jumps, cat.Jump() — the cat.', 'Точка соединяет КТО и ЧТО: robot.Jump() — прыгает робот, cat.Jump() — кот.'),
      T('In Unity it is everywhere: transform.position, Debug.Log, Input.GetKey.', 'В Unity это повсюду: transform.position, Debug.Log, Input.GetKey.'),
    ],
    task: T('Let the cat jump onto the box and meow, and Bit wave his hand.', 'Пусть кот запрыгнет на ящик и мяукнет, а Бит помашет рукой.'),
    starter: T('robot.Jump();\nrobot.Meow();\n', 'robot.Jump();\nrobot.Meow();\n'),
    answer: T('cat.Jump();\ncat.Meow();\nrobot.Wave();\n', 'cat.Jump();\ncat.Meow();\nrobot.Wave();\n'),
    hint: T('Change who does it: cat.Jump(); cat.Meow(); and robot.Wave();', 'Поменяй, кто делает: cat.Jump(); cat.Meow(); и robot.Wave();'),
    goals: [
      { text: T('The cat jumps and meows', 'Кот прыгает и мяукает'), check: (r) => ok(r) && did(r, 'cat', 'jump') && did(r, 'cat', 'meow') },
      { text: T('Bit waves', 'Бит машет'), check: (r) => ok(r) && did(r, 'robot', 'wave') },
    ],
    moments: [M_MEOW, M_SEMI, M_PARENS],
    scene: () => ({ cat: true }),
    unity: { code: 'transform.position = Vector3.zero;\nGetComponent<Rigidbody>().AddForce(Vector3.up);', say: T('Read a dot as "\'s": transform.position — the transform\'s position. Dots can chain: first who, then what he has, then what it does.', 'Читай точку как «у кого»: transform.position — позиция у transform. Точки бывают цепочкой: сначала кто, потом что у него, потом что оно делает.') },
  },
  {
    id: 'abc-index',
    symbol: '[ ]',
    title: T('Square brackets — a number in a list', 'Квадратные скобки — номер в списке'),
    anchor: T('[ ] = the cell number. Counting starts at 0: zero is the first.', '[ ] — номер ячейки. Счёт с 0: нулевой — это первый.'),
    story: [
      T('{ "key", "apple", "sword" } is a backpack with three pockets. In [ ] you write the NUMBER of the pocket.', '{ "ключ", "яблоко", "меч" } — рюкзак с тремя карманами. В [ ] пишут НОМЕР кармана.'),
      T('Counting starts at 0 — like the ground floor in a lift. Almost every language does this.', 'Счёт начинается с 0 — как нулевой этаж в лифте. Так почти во всех языках.'),
    ],
    task: T('1) Bit must take the SWORD. 2) Then try bag[3] — see what happens.', '1) Бит должен взять МЕЧ. 2) Потом попробуй bag[3] — посмотри, что будет.'),
    starter: T('string[] bag = { "key", "apple", "sword" };\nrobot.Take(bag[1]);\n', 'string[] bag = { "ключ", "яблоко", "меч" };\nrobot.Take(bag[1]);\n'),
    answer: T('string[] bag = { "key", "apple", "sword" };\nrobot.Take(bag[2]);\n', 'string[] bag = { "ключ", "яблоко", "меч" };\nrobot.Take(bag[2]);\n'),
    hint: T('key [0], apple [1], sword [2]. Then change it to [3] once to see the error.', 'ключ [0], яблоко [1], меч [2]. Потом один раз поставь [3], чтобы увидеть ошибку.'),
    goals: [
      { text: T('Bit takes the sword', 'Бит берёт меч'), check: (r) => ok(r) && r.actions.some((a) => a.act === 'take' && /меч|sword/i.test(a.text ?? '')) },
      { text: T('Seen what [3] does', 'Увидел, что делает [3]'), check: (r) => !!r.error && /IndexOutOfRange/.test(r.error.code ?? r.error.message) },
    ],
    moments: [M_INDEX_OUT, M_INDEX1, M_SEMI, M_QUOTES],
    scene: () => ({ bag: ['🗝', '🍎', '🗡'] }),
    unity: { code: 'public Transform[] spawnPoints;\nInstantiate(enemy, spawnPoints[0].position, Quaternion.identity);', say: T('In Unity lists hold spawn points, weapons, levels. The first is always [0], the last is [Length - 1].', 'В Unity в списках лежат точки появления, оружие, уровни. Первый всегда [0], последний — [Length - 1].') },
  },
  {
    id: 'abc-boss',
    symbol: '🔧',
    title: T('Boss: the broken robot', 'Босс: сломанный робот'),
    anchor: T('( ) press · ; end · " " text · = puts · == asks · { } room · // note · . whose · [ ] number from 0', '( ) нажать · ; конец · " " текст · = кладёт · == спрашивает · { } комната · // записка · . чей · [ ] номер с 0'),
    story: [
      T('Someone broke Bit: four mistakes, each one you already know. The flag 🏁 is behind the pit.', 'Кто-то сломал Бита: четыре поломки, каждую ты уже знаешь. Флаг 🏁 — за ямой.'),
      T('Run, look at what Bit does, fix, run again. Every mistake shows its own "moment".', 'Запускай, смотри, что делает Бит, исправляй, запускай снова. Каждая поломка покажет свой «момент».'),
    ],
    task: T('Fix the four mistakes: Bit walks to the edge, jumps over the pit, steps to the flag and shouts "Victory!".', 'Почини четыре поломки: Бит идёт к краю, перепрыгивает яму, шагает к флагу и кричит «Победа!».'),
    starter: T('// Walk to the edge (3 steps), jump over the pit, 1 step to the flag\nrobot.Walk(3)\nrobot.Jump;\nrobot.Walk(1);\nif (robot.AtFlag() = true)\n{\n    robot.Say(Victory!);\n}\n', '// К краю (3 шага), прыжок через яму, 1 шаг к флагу\nrobot.Walk(3)\nrobot.Jump;\nrobot.Walk(1);\nif (robot.AtFlag() = true)\n{\n    robot.Say(Победа!);\n}\n'),
    answer: T('// Walk to the edge (3 steps), jump over the pit, 1 step to the flag\nrobot.Walk(3);\nrobot.Jump();\nrobot.Walk(1);\nif (robot.AtFlag() == true)\n{\n    robot.Say("Victory!");\n}\n', '// К краю (3 шага), прыжок через яму, 1 шаг к флагу\nrobot.Walk(3);\nrobot.Jump();\nrobot.Walk(1);\nif (robot.AtFlag() == true)\n{\n    robot.Say("Победа!");\n}\n'),
    hint: T('Line 2 needs ;. Line 3 needs ( ). Line 5 asks — so ==. Line 7 is text — so quotes.', 'В строке 2 нужна ;. В строке 3 — ( ). Строка 5 спрашивает — значит ==. Строка 7 — текст, значит кавычки.'),
    goals: [
      { text: T('Bit reaches the flag', 'Бит добирается до флага'), check: (r) => !r.fell && r.x >= 6 && !r.error },
      { text: T('Shouts "Victory!"', 'Кричит «Победа!»'), check: (r) => ok(r) && (said(r, 'Победа!') || said(r, 'Victory!')) },
    ],
    moments: [M_SEMI, M_PARENS, M_EQ, M_QUOTES, M_PIT],
    scene: () => ({ pit: 4, flag: 6 }),
    unity: { code: 'void Update()\n{\n    if (Input.GetKeyDown(KeyCode.Space) && isGrounded == true)\n    {\n        rb.AddForce(Vector3.up * jumpForce);\n    }\n}', say: T('Every symbol of the ABC is in this one real Unity snippet. Find all of them — now you can read it.', 'Все символы азбуки — в этом одном настоящем куске Unity. Найди их все — теперь ты можешь его прочитать.') },
  },
];

export function abcLevel(id: string): AbcLevel | undefined {
  return ABC_LEVELS.find((l) => l.id === id);
}

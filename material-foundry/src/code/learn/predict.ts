// "What will it print?" — an endless trainer. Every question is generated from a template with
// random numbers; the RIGHT answer is never written by hand: the snippet is run by the C#
// interpreter. Each wrong option comes from a typical misunderstanding and explains it.

import type { Text2 } from '../i18n';

export interface Option {
  text: string;
  /** Why someone would pick this (for wrong options). */
  why?: Text2;
}

export interface PredictTemplate {
  id: string;
  topic: Text2;
  make(r: () => number): { code: string; wrong: Option[]; explain: Text2 };
}

const T = (en: string, ru: string): Text2 => ({ en, ru });
const W = (text: string | number, en: string, ru: string): Option => ({ text: String(text), why: { en, ru } });
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const sumTo = (n: number) => (n * (n + 1)) / 2;

export const PREDICT: PredictTemplate[] = [
  {
    id: 'int-div',
    topic: T('Whole-number division', 'Деление целых чисел'),
    make(r) {
      const b = int(r, 2, 4);
      const a = b * int(r, 2, 6) + int(r, 1, b - 1);
      return {
        code: `int coins = ${a};\nint players = ${b};\nConsole.WriteLine(coins / players);`,
        wrong: [W((a / b).toFixed(2).replace(/0$/, ''), 'You divided like a calculator. int / int throws the fraction away.', 'Ты поделил как калькулятор. int / int отбрасывает дробную часть.'), W(Math.round(a / b) === Math.floor(a / b) ? Math.floor(a / b) + 1 : Math.round(a / b), 'Rounding up? int division always cuts the fraction off, it never rounds.', 'Округлил вверх? Деление int всегда отрезает дробь, не округляет.'), W(a % b, 'That is the remainder (%), not the result of /.', 'Это остаток (%), а не результат /.')],
        explain: T('int / int gives an int: the fraction is cut off.', 'int / int даёт int: дробная часть отрезается.'),
      };
    },
  },
  {
    id: 'modulo',
    topic: T('Remainder %', 'Остаток %'),
    make(r) {
      const b = int(r, 3, 6);
      const a = b * int(r, 2, 5) + int(r, 1, b - 1);
      return {
        code: `int ammo = ${a};\nint perClip = ${b};\nConsole.WriteLine(ammo % perClip);`,
        wrong: [W(Math.floor(a / b), 'That is a / b. % gives what is LEFT after dividing.', 'Это a / b. % даёт то, что ОСТАЛОСЬ после деления.'), W(b - (a % b), 'That is how many are missing to the next full clip.', 'Это сколько не хватает до полной обоймы.'), W((a / b).toFixed(1), 'Not a division: % is the remainder.', 'Это не деление: % — это остаток.')],
        explain: T(`${a} = ${b} × ${Math.floor(a / b)} + ${a % b}. The remainder is what % gives.`, `${a} = ${b} × ${Math.floor(a / b)} + ${a % b}. Остаток — это и есть %.`),
      };
    },
  },
  {
    id: 'float-from-int',
    topic: T('int division into a float', 'Деление int в переменную float'),
    make(r) {
      const a = int(r, 3, 9) * 2 + 1;
      return {
        code: `float half = ${a} / 2;\nConsole.WriteLine(half);`,
        wrong: [W(a / 2, 'The division happens BEFORE the value goes into the float — between two ints.', 'Деление происходит ДО того, как значение попадёт во float, — между двумя int.'), W(Math.ceil(a / 2), 'No rounding up: the fraction is simply cut off.', 'Вверх не округляется: дробь просто отрезается.'), W(`${a}/2`, 'C# calculates the expression, it does not print it as text.', 'C# вычисляет выражение, а не печатает его как текст.')],
        explain: T(`${a} / 2 is int / int = ${Math.floor(a / 2)}. Only then it is stored in the float. Write ${a}f / 2 to get ${a / 2}.`, `${a} / 2 — это int / int = ${Math.floor(a / 2)}. Только потом это кладётся во float. Пиши ${a}f / 2, чтобы получить ${a / 2}.`),
      };
    },
  },
  {
    id: 'loop-sum',
    topic: T('for loop: a sum', 'Цикл for: сумма'),
    make(r) {
      const n = int(r, 3, 7);
      return {
        code: `int total = 0;\nfor (int wave = 1; wave <= ${n}; wave++)\n{\n    total += wave;\n}\nConsole.WriteLine(total);`,
        wrong: [W(sumTo(n - 1), 'The loop uses <=, so the last value ' + n + ' is included.', `В цикле <=, значит последнее значение ${n} тоже входит.`), W(n, 'That is how many rounds there are, not the sum.', 'Это сколько кругов, а не сумма.'), W(sumTo(n + 1), 'The loop stops after wave = ' + n + '.', `Цикл заканчивается после wave = ${n}.`)],
        explain: T(`1 + 2 + … + ${n} = ${sumTo(n)}.`, `1 + 2 + … + ${n} = ${sumTo(n)}.`),
      };
    },
  },
  {
    id: 'loop-count',
    topic: T('How many times does it repeat?', 'Сколько раз повторится?'),
    make(r) {
      const start = int(r, 0, 2);
      const end = start + int(r, 3, 7);
      return {
        code: `int count = 0;\nfor (int i = ${start}; i < ${end}; i++)\n{\n    count++;\n}\nConsole.WriteLine(count);`,
        wrong: [W(end - start + 1, 'With < the value ' + end + ' itself is NOT included.', `С < само значение ${end} НЕ входит.`), W(end, 'The loop starts at ' + start + ', not at 0.', `Цикл начинается с ${start}, а не с 0.`), W(end - start - 1, 'The first round (i = ' + start + ') also counts.', `Первый круг (i = ${start}) тоже считается.`)],
        explain: T(`i goes ${start} … ${end - 1}: that is ${end - start} rounds.`, `i принимает значения ${start} … ${end - 1}: это ${end - start} кругов.`),
      };
    },
  },
  {
    id: 'postfix',
    topic: T('x++ gives the OLD value', 'x++ отдаёт СТАРОЕ значение'),
    make(r) {
      const a = int(r, 2, 9);
      return {
        code: `int x = ${a};\nint y = x++;\nConsole.WriteLine(x + " " + y);`,
        wrong: [W(`${a} ${a}`, 'x++ DOES increase x — just after giving the old value to y.', 'x++ ВСЁ-ТАКИ увеличивает x — просто после того, как отдал старое значение в y.'), W(`${a + 1} ${a + 1}`, 'That would be ++x (increase first, then give).', 'Так было бы с ++x (сначала увеличить, потом отдать).'), W(`${a} ${a + 1}`, 'Mixed up: y got the old value, x the new one.', 'Перепутано: y получил старое значение, x — новое.')],
        explain: T(`y = x++ means: y gets ${a}, then x becomes ${a + 1}.`, `y = x++ значит: y получает ${a}, потом x становится ${a + 1}.`),
      };
    },
  },
  {
    id: 'if-chain',
    topic: T('if / else if: only one branch', 'if / else if: только одна ветка'),
    make(r) {
      const hp = [int(r, 51, 99), int(r, 21, 50), int(r, 0, 20)][int(r, 0, 2)];
      const all = ['Healthy', 'Hurt', 'Danger'];
      const right = hp > 50 ? 0 : hp > 20 ? 1 : 2;
      return {
        code: `int hp = ${hp};\nif (hp > 50) Console.WriteLine("Healthy");\nelse if (hp > 20) Console.WriteLine("Hurt");\nelse Console.WriteLine("Danger");`,
        wrong: [
          ...all.filter((_, i) => i !== right).map((t) => W(t, `Check the conditions from the top: ${hp} > 50? ${hp} > 20?`, `Проверяй условия сверху вниз: ${hp} > 50? ${hp} > 20?`)),
          W(right < 2 ? `${all[right]}\n${all[right + 1]}` : 'Hurt\nDanger', 'Only ONE branch of an if / else if chain runs.', 'В цепочке if / else if выполняется только ОДНА ветка.'),
        ],
        explain: T('The first true condition wins; the rest are skipped.', 'Побеждает первое верное условие, остальные пропускаются.'),
      };
    },
  },
  {
    id: 'interp',
    topic: T('Text with $"…"', 'Текст с $"…"'),
    make(r) {
      const lvl = int(r, 1, 9);
      return {
        code: `string name = "Ari";\nint level = ${lvl};\nConsole.WriteLine($"{name} → level {level + 1}");`,
        wrong: [W(`{name} → level {level + 1}`, 'The $ in front makes { } work: values are inserted.', 'Знак $ впереди включает { }: значения подставляются.'), W(`Ari → level ${lvl}1`, 'Inside { } it is calculated as a number: level + 1.', 'Внутри { } считается как число: level + 1.'), W(`Ari → level ${lvl}`, 'Do not forget the + 1 inside the braces.', 'Не забудь + 1 внутри скобок.')],
        explain: T(`{level + 1} is calculated: ${lvl} + 1 = ${lvl + 1}.`, `{level + 1} вычисляется: ${lvl} + 1 = ${lvl + 1}.`),
      };
    },
  },
  {
    id: 'list',
    topic: T('List: Add, Remove, index', 'List: Add, Remove, номер'),
    make(r) {
      const a = int(r, 1, 3) * 10;
      const b = a + 10;
      const c = b + 10;
      const d = c + 10;
      return {
        code: `var items = new List<int> { ${a}, ${b}, ${c} };\nitems.Add(${d});\nitems.Remove(${b});\nConsole.WriteLine(items.Count + " " + items[1]);`,
        wrong: [W(`3 ${b}`, `${b} was removed, so the items moved left.`, `${b} удалили, поэтому элементы сдвинулись влево.`), W(`4 ${c}`, 'Remove made the list one shorter.', 'Remove сделал список на один короче.'), W(`3 ${a}`, 'Index 1 is the SECOND item (counting from 0).', 'Номер 1 — это ВТОРОЙ элемент (счёт с 0).')],
        explain: T(`After Add and Remove: { ${a}, ${c}, ${d} }. Count = 3, items[1] = ${c}.`, `После Add и Remove: { ${a}, ${c}, ${d} }. Count = 3, items[1] = ${c}.`),
      };
    },
  },
  {
    id: 'clamp',
    topic: T('Mathf.Clamp', 'Mathf.Clamp'),
    make(r) {
      const v = [int(r, -20, -1), int(r, 11, 30), int(r, 1, 9)][int(r, 0, 2)];
      const res = Math.min(10, Math.max(0, v));
      return {
        code: `using UnityEngine;\nint health = ${v};\nConsole.WriteLine(Mathf.Clamp(health, 0, 10));`,
        wrong: [res === v ? W(10, 'The value is already inside 0…10, so it stays.', 'Значение уже внутри 0…10, поэтому остаётся.') : W(v, 'Clamp keeps the value BETWEEN min and max.', 'Clamp держит значение МЕЖДУ min и max.'), res === 0 ? W(10, 'Below the minimum → the minimum.', 'Ниже минимума → минимум.') : W(0, res === 10 ? 'Above the maximum → the maximum.' : 'Only values below 0 become 0.', res === 10 ? 'Выше максимума → максимум.' : 'В 0 превращаются только значения меньше 0.'), W(res === 5 ? 6 : 5, 'Clamp does not average anything.', 'Clamp ничего не усредняет.')],
        explain: T('Clamp(value, min, max): below min → min, above max → max, otherwise unchanged.', 'Clamp(значение, min, max): ниже min → min, выше max → max, иначе без изменений.'),
      };
    },
  },
  {
    id: 'while-break',
    topic: T('while (true) and break', 'while (true) и break'),
    make(r) {
      const a = int(r, 7, 20);
      let n = a;
      for (;;) {
        n -= 3;
        if (n < 0) break;
      }
      return {
        code: `int n = ${a};\nwhile (true)\n{\n    n -= 3;\n    if (n < 0) break;\n}\nConsole.WriteLine(n);`,
        wrong: [W(n + 3, 'The check happens AFTER subtracting, so n already went below 0.', 'Проверка идёт ПОСЛЕ вычитания, поэтому n уже ушло ниже 0.'), W(0, 'n < 0 is false for 0, the loop goes on.', 'Для 0 условие n < 0 ложно — цикл продолжается.'), W(a % 3, 'That is the remainder; the loop continues past it.', 'Это остаток; цикл идёт дальше него.')],
        explain: T(`${a} → … → ${n + 3} → ${n}: now n < 0, break.`, `${a} → … → ${n + 3} → ${n}: теперь n < 0, break.`),
      };
    },
  },
  {
    id: 'ternary',
    topic: T('Short if: condition ? a : b', 'Короткий if: условие ? a : b'),
    make(r) {
      const c = int(r, 5, 15);
      const lim = 10;
      return {
        code: `int coins = ${c};\nstring msg = coins >= ${lim} ? "Shop open" : "Need more";\nConsole.WriteLine(msg);`,
        wrong: [W(c >= lim ? 'Need more' : 'Shop open', `${c} >= ${lim} is ${c >= lim ? 'true' : 'false'}: the ${c >= lim ? 'first' : 'second'} value is taken.`, `${c} >= ${lim} — ${c >= lim ? 'верно' : 'неверно'}: берётся ${c >= lim ? 'первое' : 'второе'} значение.`), W(String(c >= lim), 'The ? : gives one of the two texts, not true/false.', '? : отдаёт один из двух текстов, а не true/false.'), W('Shop open : Need more', 'Only one of the two values is chosen.', 'Выбирается только одно из двух значений.')],
        explain: T('condition ? valueIfTrue : valueIfFalse', 'условие ? значение_если_да : значение_если_нет'),
      };
    },
  },
  {
    id: 'method',
    topic: T('Methods: return', 'Методы: return'),
    make(r) {
      const a = int(r, 2, 9);
      return {
        code: `int Twice(int n)\n{\n    return n * 2;\n}\nConsole.WriteLine(Twice(${a}) + 1);`,
        wrong: [W(2 * (a + 1), '+ 1 is added AFTER Twice returned, not to its parameter.', '+ 1 прибавляется ПОСЛЕ того, как Twice вернул результат, а не к параметру.'), W(2 * a, 'Do not forget the + 1 outside.', 'Не забудь + 1 снаружи.'), W(a + 1, 'Twice doubles the number first.', 'Twice сначала удваивает число.')],
        explain: T(`Twice(${a}) returns ${2 * a}; then + 1 = ${2 * a + 1}.`, `Twice(${a}) возвращает ${2 * a}; затем + 1 = ${2 * a + 1}.`),
      };
    },
  },
  {
    id: 'nested',
    topic: T('A loop inside a loop', 'Цикл внутри цикла'),
    make(r) {
      const a = int(r, 2, 4);
      const b = int(r, 2, 5);
      return {
        code: `int tiles = 0;\nfor (int row = 0; row < ${a}; row++)\n{\n    for (int col = 0; col < ${b}; col++)\n    {\n        tiles++;\n    }\n}\nConsole.WriteLine(tiles);`,
        wrong: [W(a + b, 'The inner loop runs completely for EACH row: multiply, do not add.', 'Внутренний цикл выполняется полностью для КАЖДОЙ строки: умножай, а не складывай.'), W((a - 1) * (b - 1), 'Both loops start at 0 and use <, so they run ' + a + ' and ' + b + ' times.', `Оба цикла начинаются с 0 и используют <, значит выполняются ${a} и ${b} раз.`), W((a + 1) * (b + 1), 'With < the end value is not included.', 'С < последнее значение не входит.')],
        explain: T(`${a} rows × ${b} columns = ${a * b} tiles.`, `${a} строки × ${b} столбцов = ${a * b} плиток.`),
      };
    },
  },
  {
    id: 'string-len',
    topic: T('Text: Length and ToUpper', 'Текст: Length и ToUpper'),
    make(r) {
      const words = ['Unity', 'Player', 'Enemy', 'Coin', 'Shield', 'Dragon'];
      const w = words[int(r, 0, words.length - 1)];
      return {
        code: `string word = "${w}";\nConsole.WriteLine(word.ToUpper() + word.Length);`,
        wrong: [W(`${w.toUpperCase()} ${w.length}`, 'Nothing adds a space: + glues the text directly.', 'Пробел никто не добавлял: + склеивает текст вплотную.'), W(`${w}${w.length}`, 'ToUpper makes ALL letters capital.', 'ToUpper делает ВСЕ буквы большими.'), W(`${w.toUpperCase()}${w.length - 1}`, 'Length counts all letters (the last index is Length - 1).', 'Length считает все буквы (последний номер — Length - 1).')],
        explain: T(`"${w}".ToUpper() = "${w.toUpperCase()}", Length = ${w.length}, glued together.`, `"${w}".ToUpper() = "${w.toUpperCase()}", Length = ${w.length}, склеено вместе.`),
      };
    },
  },
];

/** Small fast deterministic random generator (so a question can be recreated from its seed). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PredictQuestion {
  id: string;
  topic: Text2;
  code: string;
  options: Option[];
  answer: number;
  explain: Text2;
}

/** Builds a question; `run` executes C# and returns its output lines (the real answer). */
export async function makeQuestion(t: PredictTemplate, seed: number, run: (code: string) => Promise<string[] | null>): Promise<PredictQuestion | null> {
  const r = rng(seed);
  const q = t.make(r);
  const source = `using System;\nusing System.Collections.Generic;\n${q.code}`;
  const out = await run(source);
  if (!out) return null;
  const right = out.join('\n');
  const seen = new Set([right]);
  const wrong = q.wrong.filter((o) => !seen.has(o.text) && !!seen.add(o.text)).slice(0, 3);
  // Rarely two misunderstandings give the same number: add near numbers so there are always 4 choices.
  const n = Number(right);
  for (const d of [1, -1, 2, -2, 10]) {
    if (wrong.length >= 3 || !Number.isFinite(n) || !/^-?\d+$/.test(right)) break;
    const text = String(n + d);
    if (seen.has(text)) continue;
    seen.add(text);
    wrong.push({ text, why: { en: 'Close, but count once more step by step.', ru: 'Близко, но посчитай ещё раз по шагам.' } });
  }
  const options = [{ text: right }, ...wrong];
  // Shuffle with the same generator, so the question is reproducible.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { id: `${t.id}:${seed}`, topic: t.topic, code: q.code, options, answer: options.findIndex((o) => o.text === right && !o.why), explain: q.explain };
}

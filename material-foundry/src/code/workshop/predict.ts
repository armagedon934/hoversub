// "What comes next?" — guesses the next piece of code from what is already written, without any AI.
// Rules know the usual shape of Unity scripts (using → class → fields → Start/Update → movement →
// jump → triggers), console C# programs, Python and JavaScript. Every guess says WHY it is likely,
// so the guess teaches instead of just typing for you. The editor shows the first guess as grey
// "ghost" text (Tab accepts it) and lists the others in the side panel.

import type { Text2 } from '../i18n';

export interface Prediction {
  /** Text to insert at the cursor. "\n" lines get the current indentation automatically. */
  text: string;
  why: Text2;
}

export type EditLang = 'cs' | 'py' | 'js' | 'cpp' | 'c';

const P = (text: string, en: string, ru: string): Prediction => ({ text, why: { en, ru } });

/** Unclosed { blocks before the cursor, innermost last, with the text that opened each one. */
export function openBlocks(before: string): string[] {
  const stack: string[] = [];
  let line = '';
  let prevLines: string[] = [];
  let inStr: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    const n = before[i + 1];
    if (c === '\n') {
      prevLines.push(line);
      if (prevLines.length > 4) prevLines = prevLines.slice(-4);
      line = '';
      inLineComment = false;
      if (inStr !== '`') inStr = null;
      continue;
    }
    line += c;
    if (inLineComment) continue;
    if (inBlockComment) {
      if (c === '*' && n === '/') inBlockComment = false;
      continue;
    }
    if (inStr) {
      if (c === '\\') {
        line += n ?? '';
        i++;
      } else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') inLineComment = true;
    else if (c === '/' && n === '*') inBlockComment = true;
    else if (c === '"' || c === "'" || c === '`') inStr = c;
    else if (c === '{') {
      const head = line.slice(0, -1).trim() || [...prevLines].reverse().find((l) => l.trim() && !/^\s*(\/\/|\[)/.test(l))?.trim() || '';
      stack.push(head);
    } else if (c === '}') stack.pop();
  }
  return stack;
}

function indentUnit(doc: string): string {
  const m = /\n(\t| {2,4})\S/.exec(doc);
  return m ? m[1] : '    ';
}

function methodOf(blocks: string[]): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const m = /\b(?:void|IEnumerator|int|float|bool|string)\s+(\w+)\s*\(/.exec(blocks[i]);
    if (m) return m[1];
  }
  return null;
}

const has = (doc: string, re: RegExp) => re.test(doc);

/** Field names of a given type, e.g. Rigidbody2D → ["rb"]. */
function fieldOf(doc: string, type: string): string | null {
  const m = new RegExp(`\\b${type}\\s+(\\w+)\\s*[;=]`).exec(doc);
  return m ? m[1] : null;
}

function numberField(doc: string, re: RegExp): string | null {
  const m = new RegExp(`\\b(?:float|int|double)\\s+(${re.source})\\s*[;=]`, 'i').exec(doc);
  return m ? m[1] : null;
}

/** Guesses for C# (Unity first). */
function csharp(before: string, after: string, curLine: string, prevLine: string): Prediction[] {
  const doc = before + after;
  const out: Prediction[] = [];
  const blocks = openBlocks(before);
  const method = methodOf(blocks);
  const trimmed = curLine.trim();
  const prev = prevLine.trim();
  const unity = has(doc, /UnityEngine|MonoBehaviour/);

  // ---- finishing the current line
  if (trimmed) {
    if (/^void\s+Upd?a?t?e?$/.test(trimmed) && !/void\s+Update\s*\(/.test(doc)) out.push(P('Update()'.slice(trimmed.replace(/^void\s+/, '').length), 'Update runs every frame — the heart of a game script.', 'Update выполняется каждый кадр — сердце игрового скрипта.'));
    if (/^void\s+Sta?r?t?$/.test(trimmed) && !/void\s+Start\s*\(/.test(doc)) out.push(P('Start()'.slice(trimmed.replace(/^void\s+/, '').length), 'Start runs once at the beginning.', 'Start выполняется один раз в начале.'));
    if (/^for\s*\($/.test(trimmed)) out.push(P('int i = 0; i < 10; i++)', 'The usual counting loop: from 0, while less than 10, plus one each time.', 'Обычный цикл со счётчиком: с 0, пока меньше 10, каждый раз +1.'));
    if (/^foreach\s*\($/.test(trimmed)) out.push(P('var item in items)', 'Go through every item of a list.', 'Пройти по каждому элементу списка.'));
    if (/^if\s*\($/.test(trimmed) && method === 'Update' && unity) out.push(P('Input.GetKeyDown(KeyCode.Space))', 'In Update, an if usually checks a key press.', 'В Update if чаще всего проверяет нажатие клавиши.'));
    if (/^if\s*\($/.test(trimmed) && /^OnTrigger|^OnCollision/.test(method ?? '')) out.push(P('other.CompareTag("Coin"))', 'In a trigger, first check WHAT we touched — by its tag.', 'В триггере сначала проверяют, ЧЕГО коснулись — по тегу.'));
    if (/^public\s+class\s+\w+$/.test(trimmed) && unity) out.push(P(' : MonoBehaviour', 'A Unity script must inherit MonoBehaviour to be put on objects.', 'Скрипт Unity должен наследовать MonoBehaviour, чтобы его можно было повесить на объект.'));
    if (/=\s*GetComponent$/.test(trimmed)) {
      const t = /^(\w+)\s+\w+\s*=/.exec(trimmed)?.[1] ?? /(\w+)\s*=\s*GetComponent$/.exec(trimmed)?.[1];
      const type = t && /^[A-Z]/.test(t) ? t : 'Rigidbody2D';
      out.push(P(`<${type}>();`, 'GetComponent needs the component type in < >.', 'GetComponent нужен тип компонента в < >.'));
    }
    return out;
  }

  // ---- a new line
  const usingDone = /using\s+UnityEngine\s*;/.test(doc);
  const hasClass = /\bclass\s+\w+/.test(doc);
  if (!doc.trim()) {
    out.push(P('using UnityEngine;\n', 'Almost every Unity script starts by connecting UnityEngine.', 'Почти каждый скрипт Unity начинается с подключения UnityEngine.'));
    out.push(P('using System;\n', 'A console C# program starts with "using System;".', 'Консольная программа на C# начинается с «using System;».'));
    return out;
  }
  if (blocks.length === 0) {
    if (usingDone && !hasClass) out.push(P('public class Player : MonoBehaviour\n{\n\t\n}', 'Next comes the class — the script itself. Its name must match the file name.', 'Дальше — класс, то есть сам скрипт. Его имя должно совпадать с именем файла.'));
    if (/using\s+System\s*;/.test(doc) && !usingDone && !hasClass && !/Console\./.test(doc)) out.push(P('Console.WriteLine("Hello!");', 'A short program can start right away with a command.', 'Короткая программа может сразу начинаться с команды.'));
    if (/Console\.Write(Line)?\(".*\?\s*"\);\s*$/.test(prev)) out.push(P('string answer = Console.ReadLine();', 'You asked a question — now read the answer.', 'Ты задал вопрос — теперь прочитай ответ.'));
    const read = /string\s+(\w+)\s*=\s*Console\.ReadLine\(\)/.exec(prev);
    if (read) {
      out.push(P(`Console.WriteLine("Hello, " + ${read[1]} + "!");`, 'Use the answer: show it back.', 'Используй ответ: покажи его.'));
      out.push(P(`int number = int.Parse(${read[1]});`, 'The answer is text. To count with it, turn it into a number.', 'Ответ — это текст. Чтобы считать, преврати его в число.'));
    }
    return out;
  }

  const inClass = blocks.length === 1 && /\bclass\b/.test(blocks[0]);
  if (inClass && unity) {
    const fields = /\b(public|private|\[SerializeField\])\s+[\w<>[\]]+\s+\w+\s*(=|;)/.test(doc);
    if (!fields) out.push(P('public float speed = 5f;', 'Scripts usually begin with settings (fields). "public" shows them in the Inspector, so you can tune without code.', 'Скрипты обычно начинаются с настроек (полей). «public» показывает их в Inspector — можно настраивать без кода.'));
    if (/speed/.test(doc) && !fieldOf(doc, 'Rigidbody2D') && /jump/i.test(doc)) out.push(P('private Rigidbody2D rb;', 'For jumping you need the physics body; keep it in a field.', 'Для прыжка нужно физическое тело; храни его в поле.'));
    if (!/void\s+Start\s*\(/.test(doc)) out.push(P('void Start()\n{\n\t\n}', 'Start runs once at the beginning — prepare things here.', 'Start выполняется один раз в начале — здесь всё готовят.'));
    if (!/void\s+Update\s*\(/.test(doc)) out.push(P('void Update()\n{\n\t\n}', 'Update runs every frame — keys and movement go here.', 'Update выполняется каждый кадр — сюда пишут клавиши и движение.'));
    if (/tag|Coin|Enemy|score/i.test(doc) && !/OnTriggerEnter2D/.test(doc)) out.push(P('void OnTriggerEnter2D(Collider2D other)\n{\n\t\n}', 'To react when the player touches something, use OnTriggerEnter2D.', 'Чтобы реагировать на касание, используют OnTriggerEnter2D.'));
    return out;
  }

  if (method === 'Start' || method === 'Awake') {
    const rb = fieldOf(doc, 'Rigidbody2D');
    if (rb && !new RegExp(`${rb}\\s*=\\s*GetComponent`).test(doc)) out.push(P(`${rb} = GetComponent<Rigidbody2D>();`, `The field ${rb} is empty until you fill it. Find the component once, here.`, `Поле ${rb} пустое, пока его не заполнить. Найди компонент один раз — здесь.`));
    const hp = numberField(doc, /health|hp|lives/);
    const maxHp = numberField(doc, /maxHealth|maxHp/);
    if (hp && maxHp && !new RegExp(`${hp}\\s*=\\s*${maxHp}`).test(doc)) out.push(P(`${hp} = ${maxHp};`, 'At the start, health is full.', 'В начале здоровье полное.'));
    if (unity && !/Debug\.Log/.test(doc)) out.push(P('Debug.Log("Started!");', 'A message in the Console shows that the script really works.', 'Сообщение в Console покажет, что скрипт действительно работает.'));
  }

  if (method === 'Update') {
    const speed = numberField(doc, /\w*speed\w*/) ?? 'speed';
    if (/float\s+(\w+)\s*=\s*Input\.GetAxis(Raw)?\("Horizontal"\)/.test(prev)) {
      const v = /float\s+(\w+)/.exec(prev)![1];
      out.push(P(`transform.Translate(${v} * ${speed} * Time.deltaTime, 0, 0);`, `${v} is -1…1 from the keys. Multiply by speed and Time.deltaTime and move.`, `${v} — от -1 до 1 по клавишам. Умножь на скорость и Time.deltaTime и двигай.`));
      const rb = fieldOf(doc, 'Rigidbody2D');
      if (rb) out.push(P(`${rb}.linearVelocity = new Vector2(${v} * ${speed}, ${rb}.linearVelocity.y);`, 'With physics, set the speed instead of moving directly (y stays for gravity and jumps).', 'С физикой задают скорость, а не двигают напрямую (y оставляем для гравитации и прыжков).'));
    }
    if (/if\s*\(\s*Input\.GetKeyDown\(KeyCode\.Space\)\s*\)\s*$/.test(prev)) {
      const rb = fieldOf(doc, 'Rigidbody2D');
      const jump = numberField(doc, /\w*jump\w*/) ?? '5f';
      if (rb) out.push(P(`{\n\t${rb}.AddForce(Vector2.up * ${jump}, ForceMode2D.Impulse);\n}`, 'Space pressed → a sharp push up = a jump.', 'Нажат пробел → резкий толчок вверх = прыжок.'));
      else out.push(P('{\n\tDebug.Log("Space!");\n}', 'Do something when Space is pressed.', 'Сделай что-то, когда нажат пробел.'));
    }
    if (!/Input\./.test(doc)) {
      out.push(P('float x = Input.GetAxis("Horizontal");', 'Read the arrows / A-D: -1 = left, 1 = right, 0 = nothing pressed.', 'Прочитай стрелки / A-D: -1 — влево, 1 — вправо, 0 — ничего не нажато.'));
      out.push(P('if (Input.GetKeyDown(KeyCode.Space))', 'Check if Space was pressed in this frame (jump, shoot).', 'Проверь, нажат ли пробел в этом кадре (прыжок, выстрел).'));
    } else if (/GetAxis\("Horizontal"\)/.test(doc) && !/GetKeyDown/.test(doc) && /jump/i.test(doc)) out.push(P('if (Input.GetKeyDown(KeyCode.Space))', 'Moving works — now a jump on Space.', 'Движение есть — теперь прыжок по пробелу.'));
    const hp = numberField(doc, /health|hp|lives/);
    if (hp && !new RegExp(`if\\s*\\(\\s*${hp}\\s*<=\\s*0`).test(doc)) out.push(P(`if (${hp} <= 0)\n{\n\tDestroy(gameObject);\n}`, 'Check whether the character has run out of health.', 'Проверь, не закончилось ли здоровье.'));
  }

  if (/^if\s*\(\s*(\w+)\s*<=\s*0\s*\)\s*$/.test(prev)) out.push(P('{\n\tDestroy(gameObject);\n}', 'Nothing left → remove the object (or show Game Over).', 'Ничего не осталось → убираем объект (или показываем Game Over).'));

  if (/^OnTrigger|^OnCollision/.test(method ?? '')) {
    const param = /\((?:Collider2D|Collider|Collision2D|Collision)\s+(\w+)\)/.exec(blocks[blocks.length - 1] ?? '')?.[1] ?? 'other';
    const tagged = /if\s*\(\s*(\w+)\.(?:gameObject\.)?CompareTag\("(\w+)"\)\s*\)\s*$/.exec(prev);
    if (tagged) {
      const score = numberField(doc, /score|coins|points/);
      if (/coin/i.test(tagged[2]) || score) out.push(P(`{\n\t${score ?? 'score'}++;\n\tDestroy(${tagged[1]}.gameObject);\n}`, 'Picked up → add a point and remove the coin.', 'Подобрали → +1 очко и убираем монету.'));
      if (/enemy|spike|danger/i.test(tagged[2])) out.push(P('{\n\tDestroy(gameObject);\n}', 'Touched an enemy → the player is gone.', 'Коснулись врага → игрок исчезает.'));
    } else if (!/CompareTag/.test(blocks.join('\n') + prev)) out.push(P(`if (${param}.CompareTag("Coin"))`, 'First check WHAT was touched — by its tag (set the tag in the Inspector).', 'Сначала проверь, ЧЕГО коснулись — по тегу (тег ставят в Inspector).'));
  }

  // General C#
  if (/^for\s*\(.+\)\s*$/.test(prev) || /^foreach\s*\(.+\)\s*$/.test(prev) || /^while\s*\(.+\)\s*$/.test(prev) || /^(if|else if)\s*\(.+\)\s*$/.test(prev) || /^else$/.test(prev)) {
    if (!out.length) out.push(P('{\n\t\n}', 'After for / if / while comes a block in { } with what to do.', 'После for / if / while идёт блок в { } с тем, что делать.'));
  }
  if (/Console\.Write(Line)?\(".*\?\s*"\);\s*$/.test(prev)) out.push(P('string answer = Console.ReadLine();', 'You asked a question — now read the answer.', 'Ты задал вопрос — теперь прочитай ответ.'));
  const read = /string\s+(\w+)\s*=\s*Console\.ReadLine\(\)/.exec(prev);
  if (read) out.push(P(`Console.WriteLine("Hello, " + ${read[1]} + "!");`, 'Use the answer: show it back.', 'Используй ответ: покажи его.'));
  return out;
}

function python(before: string, curLine: string, prevLine: string): Prediction[] {
  const out: Prediction[] = [];
  const prev = prevLine.trim();
  if (curLine.trim()) {
    if (/^for\s+\w+\s+in\s*$/.test(curLine.trim())) out.push(P(' range(10):', 'Count from 0 to 9.', 'Считать от 0 до 9.'));
    if (/^def\s+\w+$/.test(curLine.trim())) out.push(P('():', 'A function needs ( ) and a colon.', 'Функции нужны ( ) и двоеточие.'));
    return out;
  }
  if (!before.trim()) {
    out.push(P('name = input("What is your name? ")', 'Ask the person something.', 'Спроси человека о чём-нибудь.'));
    out.push(P('import random', 'Connect randomness — for games.', 'Подключи случайность — для игр.'));
    return out;
  }
  const inp = /^(\w+)\s*=\s*input\(/.exec(prev);
  if (inp) {
    out.push(P(`print("Hello, " + ${inp[1]} + "!")`, 'Use the answer.', 'Используй ответ.'));
    out.push(P(`${inp[1]} = int(${inp[1]})`, 'input() gives text. To count, turn it into a number.', 'input() даёт текст. Чтобы считать, преврати в число.'));
  }
  if (/^import\s+random/.test(prev)) out.push(P('secret = random.randint(1, 10)', 'A random number from 1 to 10 — the start of a guessing game.', 'Случайное число от 1 до 10 — начало игры «угадай число».'));
  if (/^(for|while|if|elif|else|def|class)\b.*:\s*$/.test(prev)) {
    const v = /^for\s+(\w+)\s+in/.exec(prev)?.[1];
    if (v) out.push(P(`\tprint(${v})`, 'Inside the loop (4 spaces in), do something with each value.', 'Внутри цикла (отступ 4 пробела) сделай что-то с каждым значением.'));
    else if (/^def\s/.test(prev)) out.push(P('\treturn', 'A function usually ends by giving a result back.', 'Функция обычно заканчивается возвратом результата.'));
    else out.push(P('\tprint("...")', 'The block inside needs an indent (4 spaces).', 'Блоку внутри нужен отступ (4 пробела).'));
  }
  if (/secret\s*=\s*random/.test(before) && !/while/.test(before)) out.push(P('guess = int(input("Your guess: "))', 'Now ask the player to guess.', 'Теперь попроси игрока угадать.'));
  return out;
}

function javascript(before: string, curLine: string, prevLine: string): Prediction[] {
  const out: Prediction[] = [];
  const prev = prevLine.trim();
  if (curLine.trim()) {
    if (/^for\s*\($/.test(curLine.trim())) out.push(P('let i = 0; i < 10; i++)', 'The usual counting loop.', 'Обычный цикл со счётчиком.'));
    return out;
  }
  if (!before.trim()) out.push(P('const name = prompt("What is your name?");', 'Ask the person something.', 'Спроси человека о чём-нибудь.'));
  const ask = /(?:let|const)\s+(\w+)\s*=\s*prompt\(/.exec(prev);
  if (ask) out.push(P(`console.log("Hello, " + ${ask[1]} + "!");`, 'Use the answer.', 'Используй ответ.'));
  if (/\)\s*$/.test(prev) && /^(for|while|if)\b/.test(prev)) out.push(P('{\n\t\n}', 'A block in { } with what to do.', 'Блок в { } с тем, что делать.'));
  return out;
}

function cfamily(before: string, curLine: string, prevLine: string, lang: EditLang): Prediction[] {
  const out: Prediction[] = [];
  if (curLine.trim()) return out;
  if (!before.trim()) {
    out.push(lang === 'c' ? P('#include <stdio.h>\n', 'Connect printf/scanf.', 'Подключи printf/scanf.') : P('#include <iostream>\n', 'Connect std::cout / std::cin.', 'Подключи std::cout / std::cin.'));
    return out;
  }
  if (/#include/.test(before) && !/\bmain\s*\(/.test(before)) out.push(P('int main()\n{\n\t\n\treturn 0;\n}', 'The program starts in main.', 'Программа начинается с main.'));
  if (/^(for|while|if)\b.*\)\s*$/.test(prevLine.trim())) out.push(P('{\n\t\n}', 'A block in { } with what to do.', 'Блок в { } с тем, что делать.'));
  return out;
}

/** Guesses for the text right at the cursor. Most likely first. */
export function predict(lang: EditLang, before: string, after: string): Prediction[] {
  const lines = before.split('\n');
  const curLine = lines[lines.length - 1];
  let prevLine = '';
  for (let i = lines.length - 2; i >= 0; i--)
    if (lines[i].trim()) {
      prevLine = lines[i];
      break;
    }
  // Only at the end of a line: never guess in the middle of existing text.
  if (after.split('\n')[0].trim()) return [];
  const list = lang === 'cs' ? csharp(before, after, curLine, prevLine) : lang === 'py' ? python(before, curLine, prevLine) : lang === 'js' ? javascript(before, curLine, prevLine) : cfamily(before, curLine, prevLine, lang);
  const unit = indentUnit(before + after);
  const seen = new Set<string>();
  return list
    .map((p) => ({ ...p, text: p.text.replace(/\t/g, unit) }))
    .filter((p) => !seen.has(p.text) && !!seen.add(p.text));
}

/** Text to insert for a prediction: later lines are indented like the current line. */
export function withIndent(text: string, currentLine: string): string {
  const indent = /^\s*/.exec(currentLine)![0];
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : l ? indent + l : l))
    .join('\n');
}

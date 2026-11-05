// "Code reader" — makes a big scary script small:
//  • a MAP: the script is cut into a few coloured blocks with one plain sentence each
//    ("settings", "once at the start", "every frame", "when something touches"),
//  • a TRANSLATION of every line into plain words, read 5 lines at a time,
//  • a TRAFFIC LIGHT per line (red = error, yellow = warning) from the live checks.
// Everything is rule-based and honest: a line that matches no rule says so instead of guessing.

import { tr, type Text2 } from '../i18n';

export type BlockRole = 'using' | 'class' | 'fields' | 'start' | 'update' | 'physics' | 'touch' | 'coroutine' | 'method' | 'top' | 'other';

export interface CodeBlock {
  role: BlockRole;
  name: string;
  /** 0-based, inclusive. */
  from: number;
  to: number;
  about: string;
  icon: string;
}

const ROLE_ICON: Record<BlockRole, string> = { using: '📦', class: '🧱', fields: '⚙️', start: '▶️', update: '🔁', physics: '🧲', touch: '🤝', coroutine: '⏳', method: '🔧', top: '📜', other: '·' };

const UNITY_EVENT_ABOUT: Record<string, [BlockRole, Text2]> = {
  Awake: ['start', { en: 'once, the moment the object appears', ru: 'один раз, в момент появления объекта' }],
  Start: ['start', { en: 'once, before the first frame — preparation', ru: 'один раз перед первым кадром — подготовка' }],
  OnEnable: ['start', { en: 'every time the object is switched on', ru: 'каждый раз, когда объект включают' }],
  Update: ['update', { en: 'every frame (~60 times a second) — keys, movement, timers', ru: 'каждый кадр (~60 раз в секунду) — клавиши, движение, таймеры' }],
  LateUpdate: ['update', { en: 'every frame after all Updates — cameras', ru: 'каждый кадр после всех Update — камеры' }],
  FixedUpdate: ['physics', { en: 'every physics step — forces and Rigidbody', ru: 'каждый шаг физики — силы и Rigidbody' }],
  OnTriggerEnter: ['touch', { en: 'when something enters this trigger', ru: 'когда что-то вошло в этот триггер' }],
  OnTriggerEnter2D: ['touch', { en: 'when something enters this trigger', ru: 'когда что-то вошло в этот триггер' }],
  OnTriggerExit: ['touch', { en: 'when something leaves the trigger', ru: 'когда что-то вышло из триггера' }],
  OnTriggerExit2D: ['touch', { en: 'when something leaves the trigger', ru: 'когда что-то вышло из триггера' }],
  OnCollisionEnter: ['touch', { en: 'when this object bumps into something solid', ru: 'когда объект врезался во что-то твёрдое' }],
  OnCollisionEnter2D: ['touch', { en: 'when this object bumps into something solid', ru: 'когда объект врезался во что-то твёрдое' }],
  OnDisable: ['other', { en: 'when the object is switched off', ru: 'когда объект выключают' }],
  OnDestroy: ['other', { en: 'when the object is destroyed', ru: 'когда объект уничтожают' }],
};

function words(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Cuts a C#-like script into blocks a beginner can name. */
export function scriptMap(code: string): CodeBlock[] {
  const lines = code.split('\n');
  const blocks: CodeBlock[] = [];
  let i = 0;
  const push = (b: Omit<CodeBlock, 'icon'>) => blocks.push({ ...b, icon: ROLE_ICON[b.role] });
  const endOfBraces = (start: number): number => {
    let depth = 0;
    let opened = false;
    for (let k = start; k < lines.length; k++) {
      for (const ch of lines[k].replace(/"(?:[^"\\]|\\.)*"|\/\/.*$/g, '')) {
        if (ch === '{') {
          depth++;
          opened = true;
        } else if (ch === '}') depth--;
      }
      if (opened && depth <= 0) return k;
      if (!opened && /;\s*$/.test(lines[k])) return k;
    }
    return lines.length - 1;
  };
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || t === '{' || t === '}' || t.startsWith('//')) {
      i++;
      continue;
    }
    if (/^using\s/.test(t)) {
      let j = i;
      while (j + 1 < lines.length && /^\s*using\s/.test(lines[j + 1])) j++;
      push({ role: 'using', name: 'using', from: i, to: j, about: tr('Connect ready-made libraries (UnityEngine = everything about the game).', 'Подключаем готовые библиотеки (UnityEngine — всё про игру).') });
      i = j + 1;
      continue;
    }
    const cls = /\b(class|struct|interface|enum)\s+(\w+)(?:\s*:\s*([\w, <>]+))?/.exec(t);
    if (cls && !/[;=]\s*$/.test(t)) {
      const base = cls[3]?.trim();
      push({
        role: 'class',
        name: cls[2],
        from: i,
        to: i,
        about:
          base === 'MonoBehaviour'
            ? tr(`The script "${cls[2]}": put it on an object in Unity and it starts working.`, `Скрипт «${cls[2]}»: повесь его на объект в Unity — и он заработает.`)
            : cls[1] === 'interface'
              ? tr(`The promise "${cls[2]}": a list of methods that classes must have.`, `Обещание «${cls[2]}»: список методов, которые должны быть у классов.`)
              : cls[1] === 'enum'
                ? tr(`The list of options "${cls[2]}".`, `Список вариантов «${cls[2]}».`)
                : tr(`The blueprint "${cls[2]}"${base ? ` (based on ${base})` : ''}.`, `Чертёж «${cls[2]}»${base ? ` (на основе ${base})` : ''}.`),
      });
      if (cls[1] === 'enum') {
        i = endOfBraces(i) + 1;
        blocks[blocks.length - 1].to = i - 1;
      } else i++;
      continue;
    }
    const method = /^(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|override|virtual|async)\s+)*([\w<>[\],.]+)\s+(\w+)\s*\(([^)]*)\)\s*(\{|=>|$)/.exec(t);
    if (method && !/^(return|new|if|while|for|foreach|switch|else)\b/.test(t) && !/=\s*new\b/.test(t)) {
      const [, ret, name] = method;
      const end = method[4] === '=>' ? endOfBraces(i) : endOfBraces(i);
      const ev = UNITY_EVENT_ABOUT[name];
      const role: BlockRole = ev ? ev[0] : ret === 'IEnumerator' ? 'coroutine' : 'method';
      push({
        role,
        name,
        from: i,
        to: end,
        about: ev
          ? tr(`${name}: ${ev[1].en}.`, `${name}: ${ev[1].ru}.`)
          : role === 'coroutine'
            ? tr(`Coroutine "${name}": can wait (yield) while the game goes on.`, `Корутина «${name}»: умеет ждать (yield), пока игра идёт дальше.`)
            : tr(`Action "${words(name)}"${ret !== 'void' ? ` — gives back ${ret}` : ''}. Runs only when someone calls ${name}().`, `Действие «${words(name)}»${ret !== 'void' ? ` — возвращает ${ret}` : ''}. Выполняется, только когда кто-то вызовет ${name}().`),
      });
      i = end + 1;
      continue;
    }
    if (/^(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|static|readonly|const)\s+)+[\w<>[\],.]+\s+\w+/.test(t) || /^(?:\[[^\]]*\]\s*)*[A-Z][\w<>[\]]*\s+\w+\s*(=[^=].*)?;$/.test(t) || /^(int|float|bool|string|double)\s+\w+\s*(=.*)?;$/.test(t)) {
      let j = i;
      while (j + 1 < lines.length && /^\s*(\[[^\]]*\]\s*)*((public|private|protected|static|readonly|const)\s+)*[\w<>[\],.]+\s+\w+\s*(=[^=].*)?;\s*(\/\/.*)?$/.test(lines[j + 1]) && !/^\s*return\b/.test(lines[j + 1])) j++;
      const prev = blocks[blocks.length - 1];
      const insideClass = blocks.some((b) => b.role === 'class');
      if (prev && prev.role === 'fields' && prev.to >= i - 2) prev.to = j;
      else
        push({
          role: insideClass ? 'fields' : 'top',
          name: insideClass ? tr('settings', 'настройки') : tr('commands', 'команды'),
          from: i,
          to: j,
          about: insideClass ? tr('Boxes with settings and memory of the script. "public" ones can be changed in the Inspector.', 'Коробки с настройками и памятью скрипта. «public» можно менять в Inspector.') : tr('Commands that run from top to bottom.', 'Команды, которые выполняются сверху вниз.'),
        });
      i = j + 1;
      continue;
    }
    // Top-level statements (console programs).
    let j = i;
    if (/[{]\s*$/.test(t)) j = endOfBraces(i);
    const prev = blocks[blocks.length - 1];
    if (prev && prev.role === 'top' && prev.to >= i - 2) prev.to = j;
    else push({ role: 'top', name: tr('commands', 'команды'), from: i, to: j, about: tr('Commands that run from top to bottom.', 'Команды, которые выполняются сверху вниз.') });
    i = j + 1;
  }
  return blocks;
}

// ------------------------------------------------------------------------------- line by line

type Rule = [RegExp, (m: RegExpExecArray) => Text2];
const T = (en: string, ru: string): Text2 => ({ en, ru });

const KEY_RU: Record<string, string> = { Space: 'пробел', LeftShift: 'левый Shift', LeftControl: 'левый Ctrl', Escape: 'Esc', Return: 'Enter', Mouse0: 'левую кнопку мыши', R: 'R', E: 'E', W: 'W', A: 'A', S: 'S', D: 'D', C: 'C', F: 'F', Q: 'Q' };
const key = (k: string) => KEY_RU[k] ?? k;
const AXIS_RU: Record<string, string> = { Horizontal: 'влево/вправо (A-D, стрелки)', Vertical: 'вперёд/назад (W-S, стрелки)', 'Mouse X': 'движение мыши по горизонтали', 'Mouse Y': 'движение мыши по вертикали', Jump: 'прыжок' };
const AXIS_EN: Record<string, string> = { Horizontal: 'left/right (A-D, arrows)', Vertical: 'forward/back (W-S, arrows)', 'Mouse X': 'mouse movement left/right', 'Mouse Y': 'mouse movement up/down', Jump: 'jump' };
const TYPE_RU: Record<string, string> = { int: 'целое число', float: 'дробное число', bool: 'да/нет', string: 'текст', double: 'дробное число', Vector3: 'точка/направление в 3D', Vector2: 'точка/направление в 2D', GameObject: 'объект сцены', Transform: 'положение объекта', Rigidbody: 'физическое тело', Rigidbody2D: 'физическое тело 2D', CharacterController: 'контроллер персонажа', Camera: 'камера', Animator: 'аниматор', AudioSource: 'источник звука', Quaternion: 'поворот', LayerMask: 'слои', var: 'значение' };
const TYPE_EN: Record<string, string> = { int: 'whole number', float: 'fractional number', bool: 'yes/no', string: 'text', double: 'fractional number', Vector3: '3D point/direction', Vector2: '2D point/direction', GameObject: 'scene object', Transform: 'object position', Rigidbody: 'physics body', Rigidbody2D: '2D physics body', CharacterController: 'character controller', Camera: 'camera', Animator: 'animator', AudioSource: 'sound source', Quaternion: 'rotation', LayerMask: 'layers', var: 'value' };
const typeName = (t: string, ru: boolean) => {
  const base = t.replace(/\[\]$/, '');
  const arr = t.endsWith('[]');
  const list = /^List<(.+)>$/.exec(t);
  if (list) return ru ? `список (${TYPE_RU[list[1]] ?? list[1]})` : `list of ${TYPE_EN[list[1]] ?? list[1]}`;
  const name = (ru ? TYPE_RU : TYPE_EN)[base] ?? base;
  return arr ? (ru ? `несколько: ${name}` : `several: ${name}`) : name;
};
const cond = (c: string) => c.replace(/&&/g, ' И ').replace(/\|\|/g, ' ИЛИ ').replace(/!=/g, ' ≠ ').replace(/==/g, ' = ').replace(/>=/g, ' ≥ ').replace(/<=/g, ' ≤ ').replace(/\s+/g, ' ').trim();
const condEn = (c: string) => c.replace(/&&/g, ' AND ').replace(/\|\|/g, ' OR ').replace(/!=/g, ' ≠ ').replace(/==/g, ' = ').replace(/>=/g, ' ≥ ').replace(/<=/g, ' ≤ ').replace(/\s+/g, ' ').trim();

const RULES: Rule[] = [
  [/^(?:([\w.]+)\.)?GetComponent<Renderer>\(\)\.material\.color\s*=\s*(.+);$/, (m) => T(`Paint ${m[1] ?? 'this object'}: its colour becomes ${m[2]}.`, `Красим ${m[1] ?? 'этот объект'}: его цвет становится ${m[2]}.`)],
  [/^(float|int|bool|string|Vector3|GameObject|Transform)\[\]\s+(\w+)\s*;$/, (m) => T(`An empty array (a numbered row of boxes) "${m[2]}" for ${m[1]} values — created later with new.`, `Пустой массив (пронумерованный ряд коробок) «${m[2]}» для значений ${m[1]} — создаётся позже через new.`)],
  [/^([\w.]+)\.GetComponent<(\w+)>\(\)\.(\w+)\((.*)\);$/, (m) => T(`Take the ${m[2]} part of ${m[1]} and ask it to do ${m[3]}(${m[4]}).`, `Берём у ${m[1]} деталь ${m[2]} и просим её сделать ${m[3]}(${m[4]}).`)],
  [/^\/\/\s*(.*)$/, (m) => T(`A note for people (the computer ignores it): ${m[1]}`, `Заметка для людей (компьютер её пропускает): ${m[1]}`)],
  [/^using\s+UnityEngine\s*;/, () => T('Connect Unity: GameObject, transform, Input, Time, physics…', 'Подключаем Unity: GameObject, transform, Input, Time, физику…')],
  [/^using\s+System\.Collections\s*;/, () => T('Connect IEnumerator — needed for coroutines.', 'Подключаем IEnumerator — нужен для корутин.')],
  [/^using\s+System\.Collections\.Generic\s*;/, () => T('Connect List and Dictionary.', 'Подключаем List и Dictionary.')],
  [/^using\s+([\w.]+)\s*;/, (m) => T(`Connect the library ${m[1]}.`, `Подключаем библиотеку ${m[1]}.`)],
  [/^\[RequireComponent\(typeof\((\w+)\)\)\]/, (m) => T(`Unity adds ${m[1]} to the object automatically if it is missing.`, `Unity сама добавит ${m[1]} на объект, если его нет.`)],
  [/^\[SerializeField\]\s*(?:private\s+)?([\w<>[\]]+)\s+(\w+)\s*(?:=\s*(.+?))?;/, (m) => T(`A private box "${m[2]}" (${typeName(m[1], false)}) that is still shown in the Inspector${m[3] ? `; starts as ${m[3]}` : ''}.`, `Закрытая коробка «${m[2]}» (${typeName(m[1], true)}), но её видно в Inspector${m[3] ? `; в начале ${m[3]}` : ''}.`)],
  [/^\[Header\("(.+)"\)\]/, (m) => T(`A title "${m[1]}" in the Inspector.`, `Заголовок «${m[1]}» в Inspector.`)],
  [/^public\s+class\s+(\w+)\s*:\s*MonoBehaviour/, (m) => T(`The script ${m[1]} — a component you put on an object.`, `Скрипт ${m[1]} — компонент, который вешают на объект.`)],
  [/^(?:public\s+)?(?:static\s+)?class\s+(\w+)(?:\s*:\s*(\w+))?/, (m) => T(`The blueprint ${m[1]}${m[2] ? ` (based on ${m[2]})` : ''}.`, `Чертёж ${m[1]}${m[2] ? ` (на основе ${m[2]})` : ''}.`)],
  [/^(?:public\s+)?interface\s+(\w+)/, (m) => T(`The promise ${m[1]}: classes that sign it must have its methods.`, `Обещание ${m[1]}: классы, которые его подписали, обязаны иметь эти методы.`)],
  [/^(?:public\s+)?enum\s+(\w+)/, (m) => T(`The list of options ${m[1]}.`, `Список вариантов ${m[1]}.`)],
  [/^public\s+(?:static\s+)?event\s+([\w<>]+)\s+(\w+)\s*;/, (m) => T(`The event ${m[2]}: others can subscribe and get a message.`, `Событие ${m[2]}: другие могут подписаться и получать сообщение.`)],
  [/^(public|private|protected|const)\s+(static\s+)?(readonly\s+|const\s+)?([\w<>[\],.]+)\s+(\w+)\s*=\s*(.+?);\s*(\/\/.*)?$/, (m) => T(`${m[1] === 'public' ? 'A setting' : 'A box'} "${m[5]}" (${typeName(m[4], false)}) = ${m[6]}${m[1] === 'public' ? ' — change it in the Inspector' : ''}${m[3]?.trim() === 'const' ? ' — never changes' : ''}.`, `${m[1] === 'public' ? 'Настройка' : 'Коробка'} «${m[5]}» (${typeName(m[4], true)}) = ${m[6]}${m[1] === 'public' ? ' — можно менять в Inspector' : ''}${m[3]?.trim() === 'const' ? ' — никогда не меняется' : ''}.`)],
  [/^(public|private|protected)\s+(static\s+)?([\w<>[\],.]+)\s+(\w+)\s*;/, (m) => T(`${m[1] === 'public' ? 'A slot' : 'An empty box'} "${m[4]}" for a ${typeName(m[3], false)}${m[1] === 'public' ? ' — fill it in the Inspector' : ' — filled later'}.`, `${m[1] === 'public' ? 'Ячейка' : 'Пустая коробка'} «${m[4]}» для: ${typeName(m[3], true)}${m[1] === 'public' ? ' — заполняется в Inspector' : ' — заполним позже'}.`)],
  [/^([A-Z][\w<>[\]]*|int|float|bool|string|double)\s+(\w+)\s*;/, (m) => T(`An empty box "${m[2]}" for a ${typeName(m[1], false)}.`, `Пустая коробка «${m[2]}» для: ${typeName(m[1], true)}.`)],
  [/^void\s+(Start|Awake|Update|LateUpdate|FixedUpdate|OnEnable|OnDisable|OnDestroy)\s*\(\)/, (m) => T(`Begin "${m[1]}": ${UNITY_EVENT_ABOUT[m[1]][1].en}.`, `Начало «${m[1]}»: ${UNITY_EVENT_ABOUT[m[1]][1].ru}.`)],
  [/^void\s+(OnTrigger\w+|OnCollision\w+)\s*\(\s*(\w+)\s+(\w+)\s*\)/, (m) => T(`Begin "${m[1]}": ${UNITY_EVENT_ABOUT[m[1]]?.[1].en ?? 'Unity calls it on contact'}. ${m[3]} = what we touched.`, `Начало «${m[1]}»: ${UNITY_EVENT_ABOUT[m[1]]?.[1].ru ?? 'Unity вызывает его при касании'}. ${m[3]} — то, чего коснулись.`)],
  [/^IEnumerator\s+(\w+)\s*\(/, (m) => T(`Begin the coroutine ${m[1]} — it can pause and continue later.`, `Начало корутины ${m[1]} — она умеет вставать на паузу и продолжать.`)],
  [/^public\s+(\w+)\s*\(([^)]*)\)\s*\{.*\}$/, (m) => T(`The constructor of ${m[1]}(${m[2]}): fills the fields of a new object.`, `Конструктор ${m[1]}(${m[2]}): заполняет поля нового объекта.`)],
  [/^(?:public|private|protected|internal)\s+([A-Z]\w*)\s*\(([^)]*)\)$/, (m) => T(`Begin the constructor of ${m[1]}(${m[2]}): runs once for every new object.`, `Начало конструктора ${m[1]}(${m[2]}): выполняется один раз для каждого нового объекта.`)],
  [/^(?!else\b|return\b|new\b)(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?!public\b|private\b)(void|[\w<>[\]]+)\s+(?!(?:if|while|for|foreach|switch|catch|using|lock)\b)(\w+)\s*\(([^)]*)\)\s*(\{)?$/, (m) => T(`Begin the action ${m[2]}(${m[3] ? m[3] : ''})${m[1] !== 'void' ? ` — it gives back a ${typeName(m[1], false)}` : ''}.`, `Начало действия ${m[2]}(${m[3] ? m[3] : ''})${m[1] !== 'void' ? ` — оно возвращает: ${typeName(m[1], true)}` : ''}.`)],
  [/^(?:public\s+)?struct\s+(\w+)/, (m) => T(`The value-blueprint (struct) ${m[1]}: copied on every assignment.`, `Чертёж-значение (struct) ${m[1]}: копируется при каждом присваивании.`)],
  [/^public\s+virtual\s+(\w+)\s+(\w+)\s*\(/, (m) => T(`Begin ${m[2]}: "virtual" — child classes may replace it.`, `Начало ${m[2]}: «virtual» — наследники могут заменить его своим.`)],
  [/^public\s+override\s+(\w+)\s+(\w+)\s*\(/, (m) => T(`Begin ${m[2]}: "override" — this class's own version replaces the parent's.`, `Начало ${m[2]}: «override» — своя версия этого класса вместо родительской.`)],
  [/^(?:public\s+)?(\w+)\s+(\w+)\s*\{\s*get;\s*(private\s+)?set;\s*\}(?:\s*=\s*(.+);)?/, (m) => T(`A property ${m[2]} (${typeName(m[1], false)}): everybody can read it${m[3] ? ', only this class can change it' : ''}${m[4] ? `; starts as ${m[4]}` : ''}.`, `Свойство ${m[2]} (${typeName(m[1], true)}): прочитать может любой${m[3] ? ', изменить — только этот класс' : ''}${m[4] ? `; в начале ${m[4]}` : ''}.`)],
  [/^(?:public\s+)?(\w+)\s+(\w+)\s*=>\s*(.+);/, (m) => T(`${m[2]} is calculated every time: ${m[3]}.`, `${m[2]} вычисляется каждый раз заново: ${m[3]}.`)],
  [/^public\s+readonly\s+([\w<>[\]]+)\s+(\w+)\s*;/, (m) => T(`A box "${m[2]}" (${typeName(m[1], false)}) set once in the constructor and then locked.`, `Коробка «${m[2]}» (${typeName(m[1], true)}): задаётся один раз в конструкторе и потом заперта.`)],
  [/^(void|[\w<>[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;$/, (m) => T(`A promised method ${m[2]}(${m[3]}) — each class writes its own body.`, `Обещанный метод ${m[2]}(${m[3]}) — тело пишет каждый класс сам.`)],
  [/^(\w+)\s+(\w+)<(\w+)>\s*\(([^)]*)\)/, (m) => T(`Begin the generic action ${m[2]}<${m[3]}>: works for any type ${m[3]}.`, `Начало обобщённого действия ${m[2]}<${m[3]}>: работает для любого типа ${m[3]}.`)],
  [/^([\w<>]+)\[\]\s+(\w+)\s*=\s*\{(.*)\};/, (m) => T(`A row of boxes "${m[2]}": ${m[3].trim()} (numbers start at 0).`, `Ряд коробок «${m[2]}»: ${m[3].trim()} (номера с 0).`)],
  [/^try$/, () => T('Try the next block; if something breaks, jump to catch instead of crashing:', 'Пробуем блок ниже; если что-то сломается — переходим в catch, а не падаем:')],
  [/^catch\s*\((\w+)(?:\s+\w+)?\)/, (m) => T(`If an error of the kind ${m[1]} happened above, do this:`, `Если выше случилась ошибка вида ${m[1]}, делаем это:`)],
  [/^catch$/, () => T('If any error happened above, do this:', 'Если выше случилась любая ошибка, делаем это:')],
  [/^finally$/, () => T('Always do this at the end (error or not):', 'В конце всегда делаем это (была ошибка или нет):')],
  [/^(\w+)\s*\?\?=\s*(.+);/, (m) => T(`If ${m[1]} is empty (null), put ${m[2]} into it.`, `Если ${m[1]} пустой (null), кладём в него ${m[2]}.`)],
  [/^(\w+)\["?([^"\]]+)"?\]\s*=\s*(.+);/, (m) => T(`Under the key "${m[2]}" in ${m[1]} put ${m[3]}.`, `Под ключ «${m[2]}» в ${m[1]} кладём ${m[3]}.`)],
  [/^(\w+)\["?([^"\]]+)"?\]\s*(\+|-)=\s*(.+);/, (m) => T(`${m[3] === '+' ? 'Add' : 'Subtract'} ${m[4]} ${m[3] === '+' ? 'to' : 'from'} the value under the key "${m[2]}" in ${m[1]}.`, `${m[3] === '+' ? 'Прибавляем' : 'Вычитаем'} ${m[4]} ${m[3] === '+' ? 'к значению' : 'из значения'} под ключом «${m[2]}» в ${m[1]}.`)],
  [/^(\w+)\[(\w+)\]\.(\w+)\((.*)\);/, (m) => T(`Ask element number ${m[2]} of ${m[1]} to do ${m[3]}(${m[4]}).`, `Просим элемент номер ${m[2]} из ${m[1]} сделать ${m[3]}(${m[4]}).`)],
  [/^GetComponent<(\w+)>\(\)\.(\w+)\s*=\s*(.+);/, (m) => T(`Find the ${m[1]} on this object and set its ${m[2]} to ${m[3]}.`, `Находим ${m[1]} на этом объекте и ставим ему ${m[2]} = ${m[3]}.`)],
  [/^\{$/, () => T('Start of the block.', 'Начало блока.')],
  [/^\}$/, () => T('End of the block.', 'Конец блока.')],
  [/^\};$/, () => T('End of the block (C++ needs ; here).', 'Конец блока (в C++ здесь нужна ;).')],
  [/^else\s+if\s*\((.+)\)/, (m) => T(`Otherwise, if ${condEn(m[1])}:`, `Иначе, если ${cond(m[1])}:`)],
  [/^if\s*\(\s*Input\.GetKeyDown\(KeyCode\.(\w+)\)\s*(&&\s*(.+))?\)/, (m) => T(`If ${m[1]} was JUST pressed (this frame)${m[3] ? ` and ${condEn(m[3])}` : ''}:`, `Если только что нажали ${key(m[1])} (в этом кадре)${m[3] ? ` и ${cond(m[3])}` : ''}:`)],
  [/^if\s*\(\s*Input\.GetKey\(KeyCode\.(\w+)\)\s*\)/, (m) => T(`While ${m[1]} is held:`, `Пока зажата ${key(m[1])}:`)],
  [/^if\s*\(\s*Input\.GetButtonDown\("(\w+)"\)\s*\)/, (m) => T(`If the "${m[1]}" button was JUST pressed${m[1] === 'Jump' ? ' (Space)' : ''}:`, `Если только что нажали кнопку «${AXIS_RU[m[1]] ?? m[1]}»${m[1] === 'Jump' ? ' (Пробел)' : ''}:`)],
  [/^if\s*\(\s*Input\.GetButton\("(\w+)"\)\s*\)/, (m) => T(`While the "${m[1]}" button is held:`, `Пока зажата кнопка «${AXIS_RU[m[1]] ?? m[1]}»:`)],
  [/^if\s*\(\s*Input\.GetMouseButtonDown\(0\)/, () => T('If the left mouse button was just clicked:', 'Если только что нажали левую кнопку мыши:')],
  [/^if\s*\(\s*Input\.GetMouseButton\(0\)/, () => T('While the left mouse button is held:', 'Пока зажата левая кнопка мыши:')],
  [/^if\s*\(\s*(\w+)\.CompareTag\("(\w+)"\)\s*\)/, (m) => T(`If ${m[1]} has the tag "${m[2]}":`, `Если у ${m[1]} тег «${m[2]}»:`)],
  [/^if\s*\(\s*Physics\.Raycast\((.+)\)\s*\)/, () => T('If the invisible ray hit something:', 'Если невидимый луч во что-то попал:')],
  [/^if\s*\((.+?)\s*==\s*null\s*\)/, (m) => T(`If ${m[1]} is empty (null):`, `Если ${m[1]} пустой (null):`)],
  [/^if\s*\((.+?)\s*!=\s*null\s*\)/, (m) => T(`If ${m[1]} exists (not null):`, `Если ${m[1]} существует (не null):`)],
  [/^if\s*\((.+)\)\s*return\s*;/, (m) => T(`If ${condEn(m[1])} — stop here.`, `Если ${cond(m[1])} — дальше не идём.`)],
  [/^if\s*\((.+)\)\s*(.+);$/, (m) => T(`If ${condEn(m[1])}, then: ${m[2]}.`, `Если ${cond(m[1])}, то: ${m[2]}.`)],
  [/^if\s*\((.+)\)/, (m) => T(`If ${condEn(m[1])}:`, `Если ${cond(m[1])}:`)],
  [/^else$/, () => T('Otherwise (when the "if" above was false):', 'Иначе (когда «если» выше не подошло):')],
  [/^else\s+(.+);$/, (m) => T(`Otherwise: ${m[1]}.`, `Иначе: ${m[1]}.`)],
  [/^\[(\w+)/, (m) => T(`An attribute [${m[1]}]: a note for Unity about the next line.`, `Атрибут [${m[1]}]: пометка для Unity о следующей строке.`)],
  [/^(?:bool\s+)?(\w+)\s*=\s*Physics2?D?\.OverlapCircle\((.+?),\s*(.+?)(?:,\s*(.+))?\);/, (m) => T(`${m[1]} = is there anything${m[4] ? ` on ${m[4]}` : ''} in a small circle (radius ${m[3]}) at ${m[2]}? (yes/no)`, `${m[1]} = есть ли что-то${m[4] ? ` из ${m[4]}` : ''} в маленьком круге (радиус ${m[3]}) у ${m[2]}? (да/нет)`)],
  [/^(?:bool\s+)?(\w+)\s*=\s*(\w+)\.isGrounded;/, (m) => T(`${m[1]} = does ${m[2]} stand on the ground? (yes/no)`, `${m[1]} = стоит ли ${m[2]} на земле? (да/нет)`)],
  [/^RaycastHit2?D?\s+(\w+)\s*=\s*Physics2?D?\.Raycast\((.+?),\s*(.+?)(?:,\s*(.+))?\);/, (m) => T(`Shoot an invisible ray from ${m[2]} towards ${m[3]}${m[4] ? ` (length ${m[4]})` : ''}; what it hits goes into ${m[1]}.`, `Пускаем невидимый луч из ${m[2]} в сторону ${m[3]}${m[4] ? ` (длина ${m[4]})` : ''}; во что попал — кладём в ${m[1]}.`)],
  [/^for\s*\(\s*int\s+(\w+)\s*=\s*(\S+);\s*\w+\s*(<|<=)\s*(.+?);\s*\w+\+\+\s*\)/, (m) => T(`Repeat with ${m[1]} = ${m[2]}, ${m[2]}+1, … while ${m[1]} ${m[3]} ${m[4]}:`, `Повторяй: ${m[1]} = ${m[2]}, ${m[2]}+1, … пока ${m[1]} ${m[3]} ${m[4]}:`)],
  [/^foreach\s*\(\s*(?:var|[\w<>]+)\s+(\w+)\s+in\s+(.+)\)/, (m) => T(`For each ${m[1]} in ${m[2]}:`, `Для каждого ${m[1]} из ${m[2]}:`)],
  [/^while\s*\(\s*true\s*\)/, () => T('Repeat forever (until break or return):', 'Повторяй бесконечно (пока не break или return):')],
  [/^while\s*\((.+)\)/, (m) => T(`Repeat while ${condEn(m[1])}:`, `Повторяй, пока ${cond(m[1])}:`)],
  [/^switch\s*\((.+)\)/, (m) => T(`Choose by ${m[1]}:`, `Выбираем по ${m[1]}:`)],
  [/^case\s+(.+):/, (m) => T(`If it is ${m[1]}:`, `Если это ${m[1]}:`)],
  [/^default\s*:/, () => T('Any other case:', 'Во всех остальных случаях:')],
  [/^break\s*;/, () => T('Leave the loop / the case.', 'Выходим из цикла / варианта.')],
  [/^continue\s*;/, () => T('Skip to the next round of the loop.', 'Переходим к следующему кругу цикла.')],
  [/^return\s*;/, () => T('Stop this action here.', 'Здесь действие заканчивается.')],
  [/^return\s+(.+);/, (m) => T(`Give back ${m[1]} and stop.`, `Отдаём ${m[1]} и заканчиваем.`)],
  [/^yield\s+return\s+new\s+WaitForSeconds\((.+)\);/, (m) => T(`Wait ${m[1]} seconds (the game keeps running), then continue.`, `Ждём ${m[1]} сек. (игра при этом идёт), потом продолжаем.`)],
  [/^yield\s+return\s+null\s*;/, () => T('Wait until the next frame, then continue.', 'Ждём до следующего кадра и продолжаем.')],
  [/^StartCoroutine\((\w+)\(.*\)\);/, (m) => T(`Start the coroutine ${m[1]} (it runs alongside the game).`, `Запускаем корутину ${m[1]} (она идёт параллельно с игрой).`)],
  [/^Debug\.Log(?:Warning|Error)?\((.+)\);/, (m) => T(`Write to the Console: ${m[1]}.`, `Пишем в консоль: ${m[1]}.`)],
  [/^Console\.WriteLine\((.*)\);/, (m) => T(`Show on the screen: ${m[1] || 'an empty line'}.`, `Показываем на экране: ${m[1] || 'пустую строку'}.`)],
  [/^(?:float|var|int)\s+(\w+)\s*=\s*Input\.GetAxis(?:Raw)?\("([\w ]+)"\)(.*);/, (m) => T(`Put into ${m[1]} how much the player presses ${AXIS_EN[m[2]] ?? m[2]}: from -1 to 1${m[3] ? ` (${m[3].trim()})` : ''}.`, `Кладём в ${m[1]}, насколько нажато ${AXIS_RU[m[2]] ?? m[2]}: от -1 до 1${m[3] ? ` (${m[3].trim()})` : ''}.`)],
  [/^(\w+)\s*(\+|-)=\s*Input\.GetAxis(?:Raw)?\("([\w ]+)"\)(.*);/, (m) => T(`Change ${m[1]} by the ${AXIS_EN[m[3]] ?? m[3]}${m[4] ? ` ${m[4].trim()}` : ''}.`, `Меняем ${m[1]} на ${AXIS_RU[m[3]] ?? m[3]}${m[4] ? ` ${m[4].trim()}` : ''}.`)],
  [/^(\w+)\s*=\s*GetComponent<(\w+)>\(\);/, (m) => T(`Find the ${m[2]} on this object and remember it in ${m[1]} (do it once, not every frame).`, `Находим ${m[2]} на этом объекте и запоминаем в ${m[1]} (один раз, не каждый кадр).`)],
  [/^(\w+)\s*=\s*Camera\.main(?:\.transform)?;/, (m) => T(`Remember the main camera in ${m[1]}.`, `Запоминаем главную камеру в ${m[1]}.`)],
  [/^Cursor\.lockState\s*=\s*CursorLockMode\.Locked;/, () => T('Hide and lock the mouse cursor in the middle (first-person view).', 'Прячем и закрепляем курсор мыши в центре (вид от первого лица).')],
  [/^Cursor\.visible\s*=\s*(true|false);/, (m) => T(`${m[1] === 'true' ? 'Show' : 'Hide'} the mouse cursor.`, `${m[1] === 'true' ? 'Показываем' : 'Прячем'} курсор мыши.`)],
  [/^transform\.Translate\((.+)\);/, (m) => T(`Move this object by ${m[1]}.`, `Сдвигаем этот объект на ${m[1]}.`)],
  [/^transform\.Rotate\((.+)\);/, (m) => T(`Turn this object by ${m[1]} degrees.`, `Поворачиваем этот объект на ${m[1]} градусов.`)],
  [/^transform\.position\s*\+=\s*(.+);/, (m) => T(`Move this object by ${m[1]}.`, `Сдвигаем этот объект на ${m[1]}.`)],
  [/^transform\.position\s*=\s*(.+);/, (m) => T(`Put this object at ${m[1]}.`, `Ставим этот объект в точку ${m[1]}.`)],
  [/^transform\.(?:local)?[Rr]otation\s*=\s*(.+);/, (m) => T(`Turn this object to ${m[1]}.`, `Поворачиваем этот объект так: ${m[1]}.`)],
  [/^(\w+)\.(?:local)?[Rr]otation\s*=\s*(.+);/, (m) => T(`Turn ${m[1]} to ${m[2]}.`, `Поворачиваем ${m[1]} так: ${m[2]}.`)],
  [/^(\w+)\.Move\((.+)\);/, (m) => T(`Move the character by ${m[2]} — walls stop it.`, `Двигаем персонажа на ${m[2]} — стены его остановят.`)],
  [/^(\w+)\.AddForce\((.+?)(?:,\s*ForceMode2?D?\.(\w+))?\);/, (m) => T(`Push ${m[1]} with ${m[2]}${m[3] === 'Impulse' ? ' at once (impulse)' : ''}.`, `Толкаем ${m[1]} силой ${m[2]}${m[3] === 'Impulse' ? ' — резко, сразу' : ''}.`)],
  [/^(\w+)\.(?:linearVelocity|velocity)\s*=\s*(.+);/, (m) => T(`Set the speed of ${m[1]} to ${m[2]}.`, `Задаём скорость ${m[1]}: ${m[2]}.`)],
  [/^(\w+)\.fieldOfView\s*=\s*(.+);/, (m) => T(`Set the camera's field of view (zoom) to ${m[2]}.`, `Задаём угол обзора камеры (приближение): ${m[2]}.`)],
  [/^Destroy\((.+?)(?:,\s*(.+))?\);/, (m) => T(`Remove ${m[1]} from the game${m[2] ? ` after ${m[2]} s` : ''}.`, `Убираем ${m[1]} из игры${m[2] ? ` через ${m[2]} сек.` : ''}.`)],
  [/^(?:\w+\s+)?(\w+\s*=\s*)?Instantiate\((\w+)(.*)\);/, (m) => T(`Create a copy of ${m[2]}${m[1] ? ` and remember it in ${m[1].replace(/\s*=\s*$/, '')}` : ''}.`, `Создаём копию ${m[2]}${m[1] ? ` и запоминаем в ${m[1].replace(/\s*=\s*$/, '')}` : ''}.`)],
  [/^(?:RaycastHit\s+)?(\w+)?;?\s*Physics\.Raycast\((.+)\);/, () => T('Shoot an invisible ray and see what it hits.', 'Пускаем невидимый луч и смотрим, во что он попал.')],
  [/^(\w+)\.SetActive\((true|false)\);/, (m) => T(`${m[2] === 'true' ? 'Switch on' : 'Switch off'} ${m[1]}.`, `${m[2] === 'true' ? 'Включаем' : 'Выключаем'} ${m[1]}.`)],
  [/^(\w+)\.(SetFloat|SetBool|SetTrigger|SetInteger)\("(\w+)"(?:,\s*(.+))?\);/, (m) => T(`Tell the animator: ${m[3]}${m[4] ? ` = ${m[4]}` : ''}.`, `Сообщаем аниматору: ${m[3]}${m[4] ? ` = ${m[4]}` : ''}.`)],
  [/^(\w+)\.(PlayOneShot|Play)\((.*)\);/, (m) => T(`Play the sound${m[3] ? ` ${m[3]}` : ''}.`, `Проигрываем звук${m[3] ? ` ${m[3]}` : ''}.`)],
  [/^(\w+)\?\.Invoke\((.*)\);/, (m) => T(`Tell everyone subscribed to ${m[1]}${m[2] ? ` (with ${m[2]})` : ''}.`, `Сообщаем всем подписчикам ${m[1]}${m[2] ? ` (передаём ${m[2]})` : ''}.`)],
  [/^(\w+)\s*\+=\s*(\w+)\s*;/, (m) => T(`Add ${m[2]} to ${m[1]} (or subscribe ${m[2]} to the event ${m[1]}).`, `Прибавляем ${m[2]} к ${m[1]} (или подписываем ${m[2]} на событие ${m[1]}).`)],
  [/^(\w+)\+\+;/, (m) => T(`${m[1]} becomes 1 bigger.`, `${m[1]} становится на 1 больше.`)],
  [/^(\w+)--;/, (m) => T(`${m[1]} becomes 1 smaller.`, `${m[1]} становится на 1 меньше.`)],
  [/^([\w.]+)\s*\+=\s*(.+);/, (m) => T(`Add ${m[2]} to ${m[1]}.`, `Прибавляем ${m[2]} к ${m[1]}.`)],
  [/^([\w.]+)\s*-=\s*(.+);/, (m) => T(`Subtract ${m[2]} from ${m[1]}.`, `Вычитаем ${m[2]} из ${m[1]}.`)],
  [/^([\w.]+)\s*\*=\s*(.+);/, (m) => T(`Multiply ${m[1]} by ${m[2]}.`, `Умножаем ${m[1]} на ${m[2]}.`)],
  [/^(\w+)\s*=\s*Mathf\.Clamp\((.+?),\s*(.+?),\s*(.+)\);/, (m) => T(`${m[1]} = ${m[2]}, but kept between ${m[3]} and ${m[4]}.`, `${m[1]} = ${m[2]}, но не меньше ${m[3]} и не больше ${m[4]}.`)],
  [/^(\w+)\s*=\s*Mathf\.Lerp\((.+?),\s*(.+?),\s*(.+)\);/, (m) => T(`${m[1]} moves smoothly from ${m[2]} towards ${m[3]} (a part ${m[4]} per frame).`, `${m[1]} плавно движется от ${m[2]} к ${m[3]} (доля ${m[4]} за кадр).`)],
  [/^(\w+)\s*=\s*Vector3\.Lerp\((.+?),\s*(.+?),\s*(.+)\);/, (m) => T(`${m[1]} moves smoothly towards ${m[3]}.`, `${m[1]} плавно движется к ${m[3]}.`)],
  [/^(?:Vector3|Vector2|var)\s+(\w+)\s*=\s*(.+);/, (m) => T(`A direction/point "${m[1]}" = ${m[2]}.`, `Направление/точка «${m[1]}» = ${m[2]}.`)],
  [/^(?:float|int|double|bool|string|var)\s+(\w+)\s*=\s*(.+);/, (m) => T(`A new box "${m[1]}" = ${m[2]}.`, `Новая коробка «${m[1]}» = ${m[2]}.`)],
  [/^([A-Z][\w.]*(?:<[^=]*>)?(?:\[\])?)\s+(\w+)\s*=\s*(.+);/, (m) => T(`"${m[2]}" (${m[1]}) = ${m[3]}.`, `«${m[2]}» (${m[1]}) = ${m[3]}.`)],
  [/^([\w.[\]]+)\s*=\s*(.+);/, (m) => T(`Put ${m[2]} into ${m[1]}.`, `Кладём ${m[2]} в ${m[1]}.`)],
  [/^(\w+)\((.*)\);$/, (m) => T(`Do the action ${m[1]}(${m[2]}).`, `Выполняем действие ${m[1]}(${m[2]}).`)],
  [/^([\w.]+)\.(\w+)\((.*)\);$/, (m) => T(`Ask ${m[1]} to do ${m[2]}(${m[3]}).`, `Просим ${m[1]} сделать ${m[2]}(${m[3]}).`)],
];

/** Plain-words translation of one line, or null when no rule knows it (honest, no guessing). */
function ruleFor(src: string): Text2 | null {
  for (const [re, f] of RULES) {
    const m = re.exec(src);
    if (m) return f(m);
  }
  return null;
}

/** "if (" … the matching ")" — returns the condition and what follows, or null. */
function splitIf(src: string): { cond: string; rest: string } | null {
  const m = /^if\s*\(/.exec(src);
  if (!m) return null;
  let depth = 1;
  for (let i = m[0].length; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return { cond: src.slice(m[0].length, i).trim(), rest: src.slice(i + 1).trim() };
  }
  return null;
}

/** Splits a condition at its first top-level && or ||. */
function splitCond(c: string): { first: string; op: string; rest: string } | null {
  let depth = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const ch = c[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (c.slice(i, i + 2) === '&&' || c.slice(i, i + 2) === '||')) return { first: c.slice(0, i).trim(), op: c.slice(i, i + 2), rest: c.slice(i + 2).trim() };
  }
  return null;
}

const lower1 = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
const SPECIAL_COND = /^(Input\.|Physics\.|[\w.]+\.CompareTag\(|.+\s[!=]=\s*null$)/;

/** One-line ifs ("if (x) y;"), "else if" and "special check && something" read as a whole sentence. */
function explainIf(src: string): Text2 | null {
  const elseIf = /^else\s+(if\s*\(.*)$/.exec(src);
  if (elseIf) {
    const inner = explainIf(elseIf[1]) ?? ruleFor(elseIf[1]);
    return inner ? T(`Otherwise, ${lower1(inner.en)}`, `Иначе, ${lower1(inner.ru)}`) : null;
  }
  const p = splitIf(src);
  if (!p) return null;
  let head: Text2 | null = null;
  const parts = splitCond(p.cond);
  if (parts && SPECIAL_COND.test(parts.first)) {
    const h = ruleFor(`if (${parts.first})`);
    if (h) head = T(`${h.en.replace(/:$/, '')} ${parts.op === '&&' ? 'and' : 'or'} ${condEn(parts.rest)}:`, `${h.ru.replace(/:$/, '')} ${parts.op === '&&' ? 'и' : 'или'} ${cond(parts.rest)}:`);
  }
  head ??= ruleFor(`if (${p.cond})`);
  if (!p.rest || p.rest === '{') return parts && head ? head : null;
  if (/^return\s*;$/.test(p.rest)) return null;
  const action = explainLine(p.rest);
  if (!head || !action) return null;
  return T(`${head.en.replace(/:$/, '')} → ${lower1(action.en)}`, `${head.ru.replace(/:$/, '')} → ${lower1(action.ru)}`);
}

export function explainLine(line: string): Text2 | null {
  const t = line.trim().replace(/\s*\/\/(?!.*["']).*$/, (c) => (line.trim().startsWith('//') ? c : ''));
  if (!t) return null;
  const src = line.trim().startsWith('//') ? line.trim() : t.trim();
  if (/^(else\s+)?if\s*\(/.test(src)) {
    const r = explainIf(src);
    if (r) return r;
  }
  return ruleFor(src);
}

/** Lines that need no explanation (empty, braces only). */
export function isTrivial(line: string): boolean {
  return !line.trim() || /^[{}];?$/.test(line.trim());
}

// Friendly checks while typing, written for beginners and especially for Unity. They catch the
// mistakes Unity itself does not explain well — or does not report at all (a lowercase "update"
// is silently never called!). Each finding says what is wrong, why, and usually offers a fix.

import { tr } from '../i18n';
import type { EditLang } from './predict';

export interface LintFinding {
  line: number;
  /** Column range on that line. */
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Optional automatic fix: replace [from, to) on the line with this text. */
  fix?: { label: string; text: string };
  code?: string;
}

const UNITY_EVENTS = ['Start', 'Update', 'Awake', 'FixedUpdate', 'LateUpdate', 'OnEnable', 'OnDisable', 'OnDestroy', 'OnTriggerEnter2D', 'OnTriggerExit2D', 'OnTriggerStay2D', 'OnCollisionEnter2D', 'OnCollisionExit2D', 'OnTriggerEnter', 'OnTriggerExit', 'OnCollisionEnter', 'OnCollisionExit', 'OnMouseDown', 'OnGUI'];

/** Names whose letter case beginners often get wrong. */
const KNOWN = [
  'Debug', 'Log', 'LogWarning', 'LogError', 'Input', 'GetKey', 'GetKeyDown', 'GetKeyUp', 'GetAxis', 'GetAxisRaw', 'GetMouseButtonDown', 'transform', 'Translate', 'Rotate', 'position', 'gameObject',
  'GetComponent', 'Vector3', 'Vector2', 'Time', 'deltaTime', 'Destroy', 'Instantiate', 'Console', 'WriteLine', 'ReadLine', 'MonoBehaviour', 'KeyCode', 'Rigidbody2D', 'AddForce', 'CompareTag',
  'SetActive', 'Mathf', 'Quaternion', 'StartCoroutine', 'WaitForSeconds', 'SceneManager', 'LoadScene', 'PlayerPrefs', 'Collider2D', 'Collision2D', 'linearVelocity', 'velocity', 'Space', 'Horizontal', 'Vertical',
];
const KNOWN_LOWER = new Map(KNOWN.map((k) => [k.toLowerCase(), k]));
/** Spellings that are correct names themselves (Time.time, gameObject.name…). */
const ALSO_VALID = new Set(['time', 'name', 'tag', 'layer', 'value', 'enabled']);
const CAPITAL_KEYWORDS: Record<string, string> = { Void: 'void', Int: 'int', Float: 'float', Bool: 'bool', Public: 'public', Private: 'private', Class: 'class', If: 'if', Else: 'else', Return: 'return', Using: 'using', For: 'for', While: 'while', New: 'new', True: 'true', False: 'false', Null: 'null', Static: 'static', Foreach: 'foreach' };

/** Strips string contents and comments so rules do not fire inside text. */
function codeOnly(line: string): string {
  return line
    .replace(/\/\/.*$/, (m) => ' '.repeat(m.length))
    .replace(/"(?:[^"\\]|\\.)*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`)
    .replace(/'(?:[^'\\]|\\.)*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`);
}

/** Which method each line is in (by brace counting). */
function methodsPerLine(lines: string[]): (string | null)[] {
  const out: (string | null)[] = [];
  const stack: (string | null)[] = [];
  let pendingMethod: string | null = null;
  for (const raw of lines) {
    const line = codeOnly(raw);
    const m = /\b(?:void|IEnumerator|int|float|bool|string)\s+(\w+)\s*\([^)]*\)/.exec(line);
    if (m && !/;\s*$/.test(line)) pendingMethod = m[1];
    out.push(stack.filter(Boolean).pop() ?? null);
    for (const c of line) {
      if (c === '{') {
        stack.push(pendingMethod);
        pendingMethod = null;
      } else if (c === '}') stack.pop();
    }
    // a line that opened the method's brace belongs to it as well
    if (out[out.length - 1] === null) out[out.length - 1] = stack.filter(Boolean).pop() ?? null;
  }
  return out;
}

export function lintCSharp(src: string, fileName?: string): LintFinding[] {
  const lines = src.split('\n');
  const out: LintFinding[] = [];
  const unity = /MonoBehaviour|UnityEngine/.test(src);
  const methods = methodsPerLine(lines);
  const add = (f: LintFinding) => out.push(f);

  lines.forEach((raw, i) => {
    const line = codeOnly(raw);
    let m: RegExpExecArray | null;

    // Unity event with the wrong letter case or a wrong parameter.
    if (unity && (m = /\bvoid\s+(\w+)\s*\(([^)]*)\)/.exec(line))) {
      const name = m[1];
      const right = UNITY_EVENTS.find((e) => e.toLowerCase() === name.toLowerCase() && e !== name);
      if (right) {
        const from = line.indexOf(name, m.index);
        add({ line: i, from, to: from + name.length, severity: 'error', code: 'UnityCase', message: tr(`Unity will never call "${name}" — the name must be exactly "${right}" (with a capital letter). Unity gives no error for this, the code just silently does nothing.`, `Unity никогда не вызовет «${name}» — имя должно быть ровно «${right}» (с большой буквы). Unity не покажет ошибку, код просто молча не будет работать.`), fix: { label: tr(`Change to ${right}`, `Исправить на ${right}`), text: right } });
      }
      const param = m[2].trim();
      if (/2D$/.test(name) && /^(Collider|Collision)\s/.test(param)) {
        const from = line.indexOf(param, m.index);
        add({ line: i, from, to: from + param.length, severity: 'error', message: tr(`${name} needs a 2D type: ${param.replace(/^(\w+)/, '$12D')}. With a 3D type Unity does not call it.`, `${name} нужен 2D-тип: ${param.replace(/^(\w+)/, '$12D')}. С 3D-типом Unity его не вызовет.`), fix: { label: tr('Use the 2D type', 'Поставить 2D-тип'), text: param.replace(/^(\w+)/, '$12D') } });
      }
      if (/^OnTrigger/.test(name) && /^Collision/.test(param)) {
        const from = line.indexOf(param, m.index);
        add({ line: i, from, to: from + param.length, severity: 'error', message: tr('Trigger methods receive a Collider (Collider2D), not a Collision.', 'Методы триггера получают Collider (Collider2D), а не Collision.') });
      }
      if (/^OnCollision/.test(name) && /^Collider/.test(param)) {
        const from = line.indexOf(param, m.index);
        add({ line: i, from, to: from + param.length, severity: 'error', message: tr('Collision methods receive a Collision (Collision2D), not a Collider.', 'Методы столкновения получают Collision (Collision2D), а не Collider.') });
      }
    }

    // Wrong letter case of well-known names.
    for (const w of line.matchAll(/\b[A-Za-z_]\w*\b/g)) {
      const word = w[0];
      const known = KNOWN_LOWER.get(word.toLowerCase());
      const prevChar = line[w.index! - 1];
      if (known && known !== word && !ALSO_VALID.has(word) && !(word === 'string' || word === 'String')) {
        // Only where the word is clearly used as the API (after a dot, or followed by . ( <), so the
        // learner's own variables (space, time, input…) are never flagged.
        const nextChar = line.slice(w.index! + word.length).trimStart()[0];
        if (/^[a-z]/.test(known) ? prevChar !== '.' : prevChar !== '.' && !['.', '(', '<'].includes(nextChar ?? '')) continue;
        add({ line: i, from: w.index!, to: w.index! + word.length, severity: 'error', code: 'CS0103', message: tr(`Probably "${known}". C# cares about big and small letters: ${word} and ${known} are different names.`, `Скорее всего «${known}». C# различает большие и маленькие буквы: ${word} и ${known} — разные имена.`), fix: { label: tr(`Change to ${known}`, `Исправить на ${known}`), text: known } });
      }
      if (CAPITAL_KEYWORDS[word] && prevChar !== '.') add({ line: i, from: w.index!, to: w.index! + word.length, severity: 'error', message: tr(`C# keywords are written in small letters: ${CAPITAL_KEYWORDS[word]}.`, `Ключевые слова C# пишутся маленькими буквами: ${CAPITAL_KEYWORDS[word]}.`), fix: { label: CAPITAL_KEYWORDS[word], text: CAPITAL_KEYWORDS[word] } });
    }

    // = instead of == in a condition.
    if ((m = /\b(if|while)\s*\((.*)\)/.exec(line))) {
      // only what is inside the brackets of the condition (not "if (x) y = 1;")
      let depth = 1;
      let end = 0;
      for (let k = 0; k < m[2].length; k++) {
        if (m[2][k] === '(') depth++;
        else if (m[2][k] === ')' && --depth === 0) {
          end = k;
          break;
        }
      }
      const cond = depth === 0 ? m[2].slice(0, end) : m[2];
      const eq = /(^|[^=!<>+\-*/%&|^])=([^=]|$)/.exec(cond);
      if (eq && !/=>/.test(cond)) {
        const from = line.indexOf(cond, m.index) + eq.index + eq[1].length;
        add({ line: i, from, to: from + 1, severity: 'error', code: 'CS0029', message: tr('One "=" PUTS a value. To COMPARE, write "==".', 'Один «=» КЛАДЁТ значение. Чтобы СРАВНИТЬ, пиши «==».'), fix: { label: '==', text: '==' } });
      }
    }

    // if (...);  — an empty statement swallows the condition.
    if ((m = /\b(if|while|for)\s*\(.*\)\s*;\s*$/.exec(line))) {
      const from = line.lastIndexOf(';');
      add({ line: i, from, to: from + 1, severity: 'warning', code: 'CS0642', message: tr(`The ";" right after ${m[1]}(...) ends it immediately — the next line runs ALWAYS, not only when the condition is true.`, `«;» сразу после ${m[1]}(...) завершает его — следующая строка выполнится ВСЕГДА, а не только при верном условии.`), fix: { label: tr('Remove ;', 'Убрать ;'), text: '' } });
    }

    // transform.position.x = …
    if ((m = /\b((?:\w+\.)*(?:position|localPosition|velocity|linearVelocity|localScale|eulerAngles))\.(x|y|z)\s*([+\-*/]?=)(?!=)/.exec(line))) {
      add({ line: i, from: m.index, to: m.index + m[0].length, severity: 'error', code: 'CS1612', message: tr(`Error CS1612: you cannot change only .${m[2]} of ${m[1]} — it is a copy. Copy it into a variable, change .${m[2]}, and put it back.`, `Ошибка CS1612: нельзя менять только .${m[2]} у ${m[1]} — это копия. Скопируй в переменную, измени .${m[2]} и положи обратно.`) });
    }

    // float x = 5.5;  (missing f)
    if ((m = /\bfloat\s+\w+\s*=\s*(-?\d+\.\d+)(?![fFdDmM\w])/.exec(line))) {
      const from = line.indexOf(m[1], m.index);
      add({ line: i, from, to: from + m[1].length, severity: 'error', code: 'CS0664', message: tr(`${m[1]} is a double. For float add the letter f: ${m[1]}f.`, `${m[1]} — это double. Для float допиши букву f: ${m[1]}f.`), fix: { label: `${m[1]}f`, text: `${m[1]}f` } });
    }

    const method = methods[i];
    if (unity && method === 'Update') {
      if (/\b(Translate|position\s*[+\-]=|Rotate)\b/.test(line) && !/deltaTime/.test(line) && !/linearVelocity|velocity/.test(line)) {
        const at = line.search(/Translate|position|Rotate/);
        add({ line: i, from: at, to: line.trimEnd().length, severity: 'warning', message: tr('Movement in Update without Time.deltaTime: the speed will depend on the computer (FPS). Multiply by Time.deltaTime.', 'Движение в Update без Time.deltaTime: скорость будет зависеть от компьютера (FPS). Умножь на Time.deltaTime.') });
      }
      if ((m = /\b(GetComponent\s*<|GameObject\.Find\w*\s*\(|FindObjectOfType\s*<|FindFirstObjectByType\s*<|Camera\.main)/.exec(line)) && !/Camera\.main/.test(m[1])) {
        add({ line: i, from: m.index, to: m.index + m[1].length, severity: 'warning', message: tr('This search runs every frame and slows the game down. Do it once in Start/Awake and keep the result in a field.', 'Этот поиск выполняется каждый кадр и тормозит игру. Сделай его один раз в Start/Awake и сохрани в поле.') });
      }
      if (/\bwhile\s*\(/.test(line)) {
        const at = line.indexOf('while');
        add({ line: i, from: at, to: at + 5, severity: 'warning', message: tr('A while loop inside Update: if it does not end in the same frame, Unity freezes. Update is already a loop — usually an if is enough.', 'Цикл while внутри Update: если он не закончится в этом же кадре, Unity зависнет. Update — уже цикл, обычно хватает if.') });
      }
    }

    // new for MonoBehaviour classes.
    if ((m = /\bnew\s+([A-Z]\w*)\s*\(/.exec(line))) {
      const cls = m[1];
      if (new RegExp(`class\\s+${cls}\\s*:\\s*MonoBehaviour`).test(src)) add({ line: i, from: m.index, to: m.index + m[0].length, severity: 'error', message: tr(`${cls} is a MonoBehaviour: it cannot be created with new. Use gameObject.AddComponent<${cls}>() or put it on an object in the editor.`, `${cls} — это MonoBehaviour: его нельзя создать через new. Используй gameObject.AddComponent<${cls}>() или повесь на объект в редакторе.`) });
    }
  });

  if (/:\s*MonoBehaviour/.test(src) && !/using\s+UnityEngine\s*;/.test(src)) {
    const i = lines.findIndex((l) => /MonoBehaviour/.test(l));
    const from = lines[i].indexOf('MonoBehaviour');
    add({ line: i, from, to: from + 13, severity: 'error', code: 'CS0246', message: tr('MonoBehaviour is unknown: add "using UnityEngine;" at the very top.', 'MonoBehaviour неизвестен: добавь «using UnityEngine;» в самом начале.') });
  }

  if (fileName && unity) {
    const cls = /class\s+(\w+)\s*:\s*MonoBehaviour/.exec(src);
    const base = fileName.replace(/^.*[\\/]/, '').replace(/\.cs$/i, '');
    if (cls && base && cls[1] !== base) {
      const i = lines.findIndex((l) => l.includes(cls[0]));
      const from = lines[i].indexOf(cls[1]);
      add({ line: i, from, to: from + cls[1].length, severity: 'warning', message: tr(`The class is called ${cls[1]}, but the file is ${base}.cs. In Unity they must match, otherwise the script cannot be added to an object.`, `Класс называется ${cls[1]}, а файл — ${base}.cs. В Unity они должны совпадать, иначе скрипт нельзя повесить на объект.`) });
    }
  }
  return out;
}

export function lintPython(src: string): LintFinding[] {
  const out: LintFinding[] = [];
  const lines = src.split('\n');
  let tabs = false;
  let spaces = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
    const t = line.trim();
    if (/^\t/.test(raw)) tabs = true;
    if (/^ /.test(raw)) spaces = true;
    let m: RegExpExecArray | null;
    if ((m = /^(if|elif|while|for|def|class|else|try|except|with)\b[^:]*$/.exec(t)) && !/\\$/.test(t) && !/[([{,]$/.test(t)) {
      const from = raw.trimEnd().length;
      out.push({ line: i, from: Math.max(0, from - 1), to: from, severity: 'error', code: 'SyntaxError', message: tr(`After ${m[1]} there must be a colon ":" at the end of the line.`, `После ${m[1]} в конце строки нужно двоеточие «:».`), fix: { label: tr('Add :', 'Добавить :'), text: raw.trimEnd().slice(-1) + ':' } });
    }
    if ((m = /^(if|elif|while)\s+(.*[^=!<>])=([^=].*):?$/.exec(t))) {
      const from = raw.indexOf(m[2]) + m[2].length;
      out.push({ line: i, from, to: from + 1, severity: 'error', message: tr('One "=" puts a value. To compare, write "==".', 'Один «=» кладёт значение. Чтобы сравнить, пиши «==».'), fix: { label: '==', text: '==' } });
    }
    if ((m = /^print\s+["'\w]/.exec(t))) {
      const from = raw.indexOf('print');
      out.push({ line: i, from, to: from + 5, severity: 'error', message: tr('In Python 3 print needs brackets: print("text").', 'В Python 3 у print нужны скобки: print("текст").') });
    }
    if (/\binput\(.*\)\s*[+\-*/]\s*\d/.test(t) || /\d\s*[+\-*/]\s*input\(/.test(t)) {
      const from = raw.indexOf('input');
      out.push({ line: i, from, to: from + 5, severity: 'warning', message: tr('input() gives TEXT. To calculate, wrap it: int(input(...)).', 'input() даёт ТЕКСТ. Чтобы считать, оберни: int(input(...)).') });
    }
  });
  if (tabs && spaces) out.push({ line: lines.findIndex((l) => /^\t/.test(l)), from: 0, to: 1, severity: 'warning', message: tr('Tabs and spaces are mixed for indentation — Python may get confused. Use only spaces.', 'Для отступов смешаны табуляции и пробелы — Python может запутаться. Используй только пробелы.') });
  return out;
}

export function lintJs(src: string): LintFinding[] {
  const out: LintFinding[] = [];
  src.split('\n').forEach((raw, i) => {
    const line = codeOnly(raw);
    const m = /\b(if|while)\s*\((.*)\)/.exec(line);
    if (m) {
      const eq = /(^|[^=!<>+\-*/%&|^])=([^=>]|$)/.exec(m[2]);
      if (eq) {
        const from = line.indexOf(m[2], m.index) + eq.index + eq[1].length;
        out.push({ line: i, from, to: from + 1, severity: 'error', message: tr('One "=" puts a value. To compare, write "===".', 'Один «=» кладёт значение. Чтобы сравнить, пиши «===».'), fix: { label: '===', text: '===' } });
      }
    }
    const v = /\bvar\s/.exec(line);
    if (v) out.push({ line: i, from: v.index, to: v.index + 3, severity: 'info', message: tr('"var" is the old way. Today people write let (can change) or const (will not change).', '«var» — старый способ. Сейчас пишут let (можно менять) или const (не будет меняться).'), fix: { label: 'let', text: 'let' } });
  });
  return out;
}

export function lintCFamily(src: string): LintFinding[] {
  const out: LintFinding[] = [];
  src.split('\n').forEach((raw, i) => {
    const line = codeOnly(raw);
    const m = /\b(if|while)\s*\((.*)\)/.exec(line);
    if (m) {
      const eq = /(^|[^=!<>+\-*/%&|^])=([^=]|$)/.exec(m[2]);
      if (eq) {
        const from = line.indexOf(m[2], m.index) + eq.index + eq[1].length;
        out.push({ line: i, from, to: from + 1, severity: 'warning', message: tr('One "=" puts a value (and the condition is then almost always true). To compare, write "==".', 'Один «=» кладёт значение (и условие почти всегда будет верным). Чтобы сравнить, пиши «==».'), fix: { label: '==', text: '==' } });
      }
    }
    const s = /\bscanf\s*\(\s*"[^"]*%[dfc][^"]*"\s*,\s*(\w+)\s*\)/.exec(raw);
    if (s) {
      const from = line.indexOf(s[1], s.index);
      out.push({ line: i, from, to: from + s[1].length, severity: 'error', message: tr(`scanf needs the ADDRESS of the variable: &${s[1]}.`, `scanf нужен АДРЕС переменной: &${s[1]}.`), fix: { label: `&${s[1]}`, text: `&${s[1]}` } });
    }
    if (/\bcout\b/.test(line) && !/std::cout|using\s+namespace\s+std/.test(src)) {
      const from = line.indexOf('cout');
      if (line[from - 1] !== ':') out.push({ line: i, from, to: from + 4, severity: 'error', message: tr('cout lives in std: write std::cout (or add "using namespace std;").', 'cout живёт в std: пиши std::cout (или добавь «using namespace std;»).'), fix: { label: 'std::cout', text: 'std::cout' } });
    }
  });
  return out;
}

export function lintCode(lang: EditLang, src: string, fileName?: string): LintFinding[] {
  return lang === 'cs' ? lintCSharp(src, fileName) : lang === 'py' ? lintPython(src) : lang === 'js' ? lintJs(src) : lintCFamily(src);
}

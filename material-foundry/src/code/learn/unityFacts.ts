// Unity knowledge for the trainers: the order of Unity's event methods (a game: tap them in
// order), quick "which method?" questions and a printable cheat sheet.

import type { Text2 } from '../i18n';

const T = (en: string, ru: string): Text2 => ({ en, ru });

export interface LifecycleStep {
  name: string;
  when: Text2;
  use: Text2;
}

/** The order Unity calls them in for one object (simplified to what beginners use). */
export const LIFECYCLE: LifecycleStep[] = [
  { name: 'Awake', when: T('once, when the object appears', 'один раз, когда объект появился'), use: T('GetComponent, set up references', 'GetComponent, подготовка ссылок') },
  { name: 'OnEnable', when: T('every time the object is turned on', 'каждый раз, когда объект включают'), use: T('subscribe to events', 'подписка на события') },
  { name: 'Start', when: T('once, before the first frame', 'один раз перед первым кадром'), use: T('starting values, StartCoroutine', 'начальные значения, StartCoroutine') },
  { name: 'FixedUpdate', when: T('every physics step (50 per second)', 'каждый шаг физики (50 раз в секунду)'), use: T('Rigidbody forces and velocity', 'силы и скорость Rigidbody') },
  { name: 'Update', when: T('every frame', 'каждый кадр'), use: T('input, movement, timers', 'ввод, движение, таймеры') },
  { name: 'LateUpdate', when: T('every frame, after all Updates', 'каждый кадр, после всех Update'), use: T('a camera following the player', 'камера, следующая за игроком') },
  { name: 'OnDisable', when: T('when the object is turned off', 'когда объект выключают'), use: T('unsubscribe from events', 'отписка от событий') },
  { name: 'OnDestroy', when: T('when the object is destroyed', 'когда объект уничтожают'), use: T('cleanup, save', 'уборка, сохранение') },
];

export interface WhichMethod {
  q: Text2;
  answer: string;
  why: Text2;
}

/** "Where would you put this code?" */
export const WHICH: WhichMethod[] = [
  { q: T('Read the arrow keys and move the player.', 'Читать стрелки и двигать игрока.'), answer: 'Update', why: T('Input must be read every frame.', 'Ввод нужно читать каждый кадр.') },
  { q: T('rb = GetComponent<Rigidbody2D>();', 'rb = GetComponent<Rigidbody2D>();'), answer: 'Awake', why: T('Find components once, as early as possible (Start also works).', 'Компоненты ищут один раз и как можно раньше (Start тоже подойдёт).') },
  { q: T('The camera moves to the player after he has moved this frame.', 'Камера сдвигается к игроку после того, как он сдвинулся в этом кадре.'), answer: 'LateUpdate', why: T('LateUpdate runs after every Update — no shaking.', 'LateUpdate выполняется после всех Update — без дрожания.') },
  { q: T('rb.AddForce(…) every physics step for a steady engine force.', 'rb.AddForce(…) каждый шаг физики — постоянная сила двигателя.'), answer: 'FixedUpdate', why: T('Physics runs in fixed steps; continuous forces belong there.', 'Физика работает фиксированными шагами; постоянные силы — туда.') },
  { q: T('Set health = maxHealth at the beginning.', 'Задать health = maxHealth в начале.'), answer: 'Start', why: T('Once, before the first frame.', 'Один раз, перед первым кадром.') },
  { q: T('Save the best score when the object is removed.', 'Сохранить рекорд, когда объект убирают.'), answer: 'OnDestroy', why: T('Called right before the object disappears.', 'Вызывается прямо перед исчезновением объекта.') },
  { q: T('Do something every time a menu panel is shown again.', 'Делать что-то каждый раз, когда панель меню снова показывают.'), answer: 'OnEnable', why: T('SetActive(true) calls OnEnable every time; Start only once.', 'SetActive(true) каждый раз вызывает OnEnable; Start — только один раз.') },
];

export interface CheatSection {
  title: Text2;
  rows: [string, Text2][];
}

export const CHEAT_SHEET: CheatSection[] = [
  {
    title: T('Moving', 'Движение'),
    rows: [
      ['transform.Translate(x * speed * Time.deltaTime, 0, 0);', T('move by an amount (always × Time.deltaTime)', 'сдвинуть (всегда × Time.deltaTime)')],
      ['transform.position = new Vector3(0, 1, 0);', T('put somewhere', 'поставить в точку')],
      ['Vector2.MoveTowards(from, to, step)', T('a step towards a target', 'шаг к цели')],
      ['transform.Rotate(0, 0, 90 * Time.deltaTime);', T('turn around Z (2D)', 'повернуть вокруг Z (2D)')],
      ['rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);', T('physics walking (Unity 6; older: velocity)', 'ходьба с физикой (Unity 6; старые — velocity)')],
      ['rb.AddForce(Vector2.up * jump, ForceMode2D.Impulse);', T('jump', 'прыжок')],
    ],
  },
  {
    title: T('Input', 'Ввод'),
    rows: [
      ['Input.GetAxis("Horizontal")', T('-1 … 1 from arrows / A-D', 'от -1 до 1 по стрелкам / A-D')],
      ['Input.GetKeyDown(KeyCode.Space)', T('the one frame of pressing', 'кадр нажатия')],
      ['Input.GetKey(KeyCode.LeftShift)', T('while held', 'пока зажата')],
      ['Input.GetMouseButtonDown(0)', T('left click', 'левый клик')],
      ['Camera.main.ScreenToWorldPoint(Input.mousePosition)', T('mouse in the world', 'мышь в мире')],
    ],
  },
  {
    title: T('Objects', 'Объекты'),
    rows: [
      ['Instantiate(prefab, pos, Quaternion.identity)', T('create a copy of a prefab', 'создать копию префаба')],
      ['Destroy(gameObject, 2f)', T('remove (after 2 s)', 'убрать (через 2 с)')],
      ['GetComponent<Rigidbody2D>()', T('another component (cache it!)', 'другой компонент (сохрани в поле!)')],
      ['GameObject.FindWithTag("Player")', T('find by tag (in Start, not Update)', 'найти по тегу (в Start, не в Update)')],
      ['gameObject.SetActive(false)', T('turn off', 'выключить')],
      ['other.CompareTag("Coin")', T('check a tag', 'проверить тег')],
    ],
  },
  {
    title: T('Time and waiting', 'Время и ожидание'),
    rows: [
      ['Time.deltaTime', T('seconds since the last frame', 'секунды с прошлого кадра')],
      ['StartCoroutine(Routine());', T('start a coroutine', 'запустить корутину')],
      ['yield return new WaitForSeconds(1f);', T('wait inside a coroutine', 'подождать внутри корутины')],
      ['Invoke("Method", 2f);', T('call a method later', 'вызвать метод позже')],
      ['InvokeRepeating("Method", 1f, 0.5f);', T('call again and again', 'вызывать снова и снова')],
      ['Time.timeScale = 0f;', T('pause the game', 'поставить игру на паузу')],
    ],
  },
  {
    title: T('Collisions', 'Касания'),
    rows: [
      ['void OnTriggerEnter2D(Collider2D other)', T('entered a trigger (Is Trigger ticked)', 'вошли в триггер (галочка Is Trigger)')],
      ['void OnCollisionEnter2D(Collision2D c)', T('bumped into something solid', 'врезались во что-то твёрдое')],
      ['Physics2D.Raycast(pos, Vector2.down, 0.6f)', T('a ray: is there ground?', 'луч: есть ли земля?')],
      ['Physics2D.OverlapCircle(point, 0.2f, layer)', T('anything in this circle?', 'есть ли что-то в круге?')],
    ],
  },
  {
    title: T('Classic mistakes', 'Классические ошибки'),
    rows: [
      ['void update()', T('→ Update: lowercase is never called', '→ Update: с маленькой буквы не вызывается')],
      ['transform.position.x += 1;', T('→ CS1612: change the whole vector', '→ CS1612: меняй вектор целиком')],
      ['if (x = 5)', T('→ == compares', '→ == сравнивает')],
      ['float f = 2.5;', T('→ 2.5f', '→ 2.5f')],
      ['Destroy(other);', T('→ Destroy(other.gameObject)', '→ Destroy(other.gameObject)')],
      ['health / maxHealth (ints)', T('→ (float)health / maxHealth', '→ (float)health / maxHealth')],
    ],
  },
];

// Campaign "Models and materials": build models from parts by code, dress them with materials made
// by the program's own texture generator, make textures sit right (tiling by size), add relief with
// normal maps, switch detail by distance (LOD) and dress a whole scene. You walk around your work.

import type { Text2 } from '../i18n';
import { OFFICIAL, objByName, walkTo, type Mission } from './shooter';
import { v3, type Level3, type Spec3, type World3D } from './unity3d';

const T = (en: string, ru: string): Text2 => ({ en, ru });

export const MODEL_CHAPTERS: { n: number; icon: string; title: Text2; about: Text2 }[] = [
  { n: 1, icon: '🧱', title: T('Models', 'Модели'), about: T('A model is many simple parts put together by code.', 'Модель — это много простых деталей, собранных кодом.') },
  { n: 2, icon: '🎨', title: T('Materials', 'Материалы'), about: T('Textures from your own texture studio: colour, relief, roughness — sized right.', 'Текстуры из твоей студии: цвет, рельеф, шероховатость — правильного размера.') },
  { n: 3, icon: '🏛', title: T('Scene', 'Сцена'), about: T('Detail where you look, a whole room dressed by code.', 'Детали там, куда смотришь, и целая комната, одетая кодом.') },
];

const STUDIO = { sky: '#d9dee6', fog: 0.012, floor: { size: 60, color: '#b9bec6' } };
const walls = (size: number, h = 3.5): Spec3[] => {
  const c = '#c9ced6';
  const half = size / 2;
  return [
    { name: 'Wall', tag: 'Wall', shape: 'box', pos: [0, h / 2, half], size: [size, h, 0.4], color: c },
    { name: 'Wall', tag: 'Wall', shape: 'box', pos: [0, h / 2, -half], size: [size, h, 0.4], color: c },
    { name: 'Wall', tag: 'Wall', shape: 'box', pos: [half, h / 2, 0], size: [0.4, h, size], color: c },
    { name: 'Wall', tag: 'Wall', shape: 'box', pos: [-half, h / 2, 0], size: [0.4, h, size], color: c },
  ];
};
const base = (id: string, objects: Spec3[], extra: Partial<Level3> = {}): Level3 => ({
  id,
  ...STUDIO,
  objects: [...walls(18), ...objects],
  player: { pos: [0, 0.9, -5] },
  scripts: [{ source: OFFICIAL.look, on: 'Player' }, { source: OFFICIAL.move, on: 'Player' }],
  autoInspector: true,
  ...extra,
});
const children = (w: World3D, name: string) => {
  const o = objByName(w, name);
  return o ? w.objects.filter((x) => x.parent === o && x.alive) : [];
};

export const MODEL_MISSIONS: Mission[] = [
  {
    id: 'm1',
    chapter: 1,
    icon: '🪑',
    title: T('A model from cubes', 'Модель из кубиков'),
    system: T('Builder', 'Конструктор'),
    radio: T('Every game model — a table, a car, a house — starts as simple shapes. Let us build a table by code: a top and four legs, each a scaled cube placed inside the "Workbench".', 'Любая игровая модель — стол, машина, дом — начинается с простых фигур. Соберём стол кодом: столешница и четыре ножки, каждая — растянутый куб внутри «Workbench».'),
    task: T('Fill the blanks: build a table of 5 parts. Walk around it!', 'Заполни пропуски: собери стол из 5 деталей. Обойди его!'),
    words: [
      { word: 'GameObject.CreatePrimitive', say: T('Creates a cube / sphere / cylinder in the scene.', 'Создаёт куб / шар / цилиндр в сцене.') },
      { word: 'SetParent(transform)', say: T('Makes the part a child of this object (they move together).', 'Делает деталь ребёнком этого объекта (двигаются вместе).') },
      { word: 'localScale', say: T('The size of the part: (width, height, depth).', 'Размер детали: (ширина, высота, глубина).') },
    ],
    hints: [T('Cube; SetParent(transform); size as localScale; four legs in a loop.', 'Cube; SetParent(transform); размер — localScale; четыре ножки в цикле.'), T('Cube, transform, size, 4', 'Cube, transform, size, 4')],
    code: () => `using UnityEngine;

public class TableBuilder : MonoBehaviour
{
    public float width = 2f;
    public float depth = 1f;
    public float height = 0.9f;

    void Start()
    {
        Part(new Vector3(0, height, 0), new Vector3(width, 0.1f, depth));
        for (int i = 0; i < ⟦4⟧; i++)
        {
            float x = (i % 2 == 0 ? -1 : 1) * (width / 2 - 0.1f);
            float z = (i < 2 ? -1 : 1) * (depth / 2 - 0.1f);
            Part(new Vector3(x, height / 2, z), new Vector3(0.1f, height, 0.1f));
        }
    }

    void Part(Vector3 position, Vector3 size)
    {
        GameObject p = GameObject.CreatePrimitive(PrimitiveType.⟦Cube⟧);
        p.transform.SetParent(⟦transform⟧);
        p.transform.localPosition = position;
        p.transform.localScale = ⟦size⟧;
    }
}
`,
    file: 'TableBuilder.cs',
    attachTo: 'Workbench',
    level: () => base('m1', [{ name: 'Workbench', shape: 'none', pos: [0, 0, 2] }]),
    goals: [
      { text: T('A table of 5 parts (top + 4 legs)', 'Стол из 5 деталей (столешница + 4 ножки)'), check: (w) => children(w, 'Workbench').length >= 5 },
      { text: T('The top is at the right height (0.9 m)', 'Столешница на нужной высоте (0,9 м)'), check: (w) => children(w, 'Workbench').some((c) => Math.abs(c.pos.y - 0.9) < 0.05 && c.scale.x > 1.5) },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('You build models from parts by code.', 'Ты собираешь модели из деталей кодом.'),
    inUnity: T('In Unity you can also do it by hand: GameObject → 3D Object → Cube, then drag cubes onto an empty object. Code is handy for many similar parts (a fence, stairs, shelves).', 'В Unity можно и руками: GameObject → 3D Object → Cube, потом перетащить кубы на пустой объект. Код удобен для множества похожих деталей (забор, лестница, полки).'),
    demo: (t, w) => (t < 1.5 ? { until: 1e9 } : walkTo(w, v3(3, 0, 0))),
    demoSeconds: 3,
  },
  {
    id: 'm2',
    chapter: 2,
    icon: '🪵',
    title: T('A material from your studio', 'Материал из твоей студии'),
    system: T('Materials', 'Материалы'),
    radio: T('A grey table is boring. Your texture studio makes real materials: wood, stone, metal — colour, relief and roughness. Load one and put it on every part of the table.', 'Серый стол — скучно. Твоя студия текстур делает настоящие материалы: дерево, камень, металл — цвет, рельеф и шероховатость. Загрузи один и надень на каждую деталь стола.'),
    task: T('Fill the blanks: the whole table must become oak.', 'Заполни пропуски: весь стол должен стать дубовым.'),
    words: [
      { word: 'Resources.Load<Material>("oak_floor")', say: T('Load a material by its name.', 'Загрузить материал по имени.') },
      { word: 'transform.childCount / GetChild(i)', say: T('How many parts the object has / the part number i.', 'Сколько у объекта деталей / деталь номер i.') },
    ],
    hints: [T('"oak_floor"; go through childCount; renderer.material = wood.', '"oak_floor"; пройди по childCount; renderer.material = wood.'), T('"oak_floor", childCount, wood', '"oak_floor", childCount, wood')],
    code: () => `using UnityEngine;

public class TablePaint : MonoBehaviour
{
    void Start()
    {
        Material wood = Resources.Load<Material>(⟦"oak_floor"⟧);
        for (int i = 0; i < transform.⟦childCount⟧; i++)
        {
            Renderer r = transform.GetChild(i).GetComponent<Renderer>();
            r.material = ⟦wood⟧;
        }
    }
}
`,
    file: 'TablePaint.cs',
    attachTo: 'Table',
    level: () => base('m2', table(), { setup: prepareModelWorld }),
    goals: [{ text: T('Every part of the table is oak', 'Каждая деталь стола — дуб'), check: (w) => children(w, 'Table').length >= 5 && children(w, 'Table').every((c) => c.material?.id === 'oak_floor') }],
    keys: ['WASD', 'mouse'],
    ability: T('Your models wear real materials.', 'Твои модели в настоящих материалах.'),
    inUnity: T('Export the material from the studio (PNG maps), make a Material in Unity and put the maps into Albedo, Normal Map, Metallic/Smoothness. Put it in a folder named Resources to load it by name.', 'Экспортируй материал из студии (PNG-карты), создай Material в Unity и вставь карты в Albedo, Normal Map, Metallic/Smoothness. Положи его в папку Resources, чтобы загружать по имени.'),
    demo: (t, w) => (t < 1 ? { until: 1e9 } : walkTo(w, v3(2.5, 0, 0))),
    demoSeconds: 3,
  },
  {
    id: 'm3',
    chapter: 2,
    icon: '🧱',
    title: T('Tiling: no stretched bricks', 'Плитка: без растянутых кирпичей'),
    system: T('Tiling', 'Плитка'),
    radio: T('Put a brick texture on a long wall and the bricks stretch like gum. The texture must repeat by the size of the wall: repeats = size / tile size. That is mainTextureScale.', 'Наденешь кирпич на длинную стену — кирпичи растянутся, как жвачка. Текстура должна повторяться по размеру стены: повторов = размер / размер плитки. Это mainTextureScale.'),
    task: T('Fill the blanks: the brick wall (8 × 3 m) must repeat by its size (tile 2 m).', 'Заполни пропуски: кирпичная стена (8 × 3 м) должна повторяться по размеру (плитка 2 м).'),
    words: [
      { word: 'renderer.bounds.size', say: T('The real size of the object in metres.', 'Настоящий размер объекта в метрах.') },
      { word: 'mainTextureScale', say: T('How many times the texture repeats across and up.', 'Сколько раз текстура повторяется вширь и вверх.') },
    ],
    hints: [T('size.x / tileSize and size.y / tileSize.', 'size.x / tileSize и size.y / tileSize.'), T('red_brick, tileSize, size.y', 'red_brick, tileSize, size.y')],
    code: () => `using UnityEngine;

public class BrickWall : MonoBehaviour
{
    public float tileSize = 2f;

    void Start()
    {
        Renderer r = GetComponent<Renderer>();
        r.material = Resources.Load<Material>(⟦"red_brick"⟧);
        Vector3 size = r.bounds.size;
        r.material.mainTextureScale = new Vector2(size.x / ⟦tileSize⟧, ⟦size.y⟧ / tileSize);
    }
}
`,
    file: 'BrickWall.cs',
    attachTo: 'LongWall',
    level: () => base('m3', [{ name: 'LongWall', shape: 'box', pos: [0, 1.5, 4], size: [8, 3, 0.3], color: '#c9ced6' }]),
    goals: [
      { text: T('The wall wears bricks', 'Стена в кирпиче'), check: (w) => objByName(w, 'LongWall')?.material?.id === 'red_brick' },
      { text: T('…repeated by its size: 4 × 1.5', '…повторённом по размеру: 4 × 1,5'), check: (w) => {
        const m = objByName(w, 'LongWall')?.material;
        return !!m && Math.abs(m.scale.x - 4) < 0.05 && Math.abs(m.scale.y - 1.5) < 0.05;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Textures sit right on any size.', 'Текстуры ровно сидят на любом размере.'),
    inUnity: T('The same field is in the material Inspector: Tiling X/Y. Many artists use "world-space" shaders so tiling follows the size by itself — the material picker under the game does exactly that.', 'То же поле есть в Inspector материала: Tiling X/Y. Многие художники используют «мировые» шейдеры, чтобы плитка сама следовала размеру, — выбор материалов под игрой делает ровно это.'),
    demo: (t, w) => (t < 1 ? { until: 1e9 } : walkTo(w, v3(0, 0, 1))),
    demoSeconds: 3,
  },
  {
    id: 'm4',
    chapter: 2,
    icon: '⛰',
    title: T('Relief without polygons', 'Рельеф без полигонов'),
    system: T('Normal maps', 'Карты нормалей'),
    radio: T('Real stones have bumps, but millions of tiny triangles would kill the game. A normal map tells the light how the surface is tilted at every pixel — flat geometry looks bumpy. _BumpScale = how strong.', 'У настоящих камней есть выпуклости, но миллионы крошечных треугольников убьют игру. Карта нормалей говорит свету, как наклонена поверхность в каждом пикселе, — плоская геометрия выглядит рельефной. _BumpScale — насколько сильно.'),
    task: T('Fill the blanks: a stone block with strong relief (bump 1.5). Walk around: light plays on the stones.', 'Заполни пропуски: каменный блок с сильным рельефом (bump 1,5). Обойди его: свет играет на камнях.'),
    words: [{ word: 'normal map', say: T('A picture that stores the tilt of the surface (the blue-purple map in the studio).', 'Картинка, где хранится наклон поверхности (сине-фиолетовая карта в студии).') }],
    hints: [T('Load "castle_ashlar"; SetFloat("_BumpScale", bump).', 'Загрузи "castle_ashlar"; SetFloat("_BumpScale", bump).'), T('"castle_ashlar", "_BumpScale", bump', '"castle_ashlar", "_BumpScale", bump')],
    code: () => `using UnityEngine;

public class StoneBlock : MonoBehaviour
{
    public float bump = 1.5f;

    void Start()
    {
        Renderer r = GetComponent<Renderer>();
        r.material = Resources.Load<Material>(⟦"castle_ashlar"⟧);
        r.material.mainTextureScale = new Vector2(1.5f, 1.5f);
        r.material.SetFloat(⟦"_BumpScale"⟧, ⟦bump⟧);
    }
}
`,
    file: 'StoneBlock.cs',
    attachTo: 'Block',
    level: () => base('m4', [{ name: 'Block', shape: 'box', pos: [0, 1.25, 3], size: [2.5, 2.5, 2.5], color: '#c9ced6' }]),
    goals: [
      { text: T('The block is stone', 'Блок каменный'), check: (w) => objByName(w, 'Block')?.material?.id === 'castle_ashlar' },
      { text: T('…with strong relief (1–3)', '…с сильным рельефом (1–3)'), check: (w) => {
        const b = objByName(w, 'Block')?.material?.bump ?? 0;
        return b >= 1 && b <= 3;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Relief from a picture: cheap and beautiful.', 'Рельеф из картинки: дёшево и красиво.'),
    inUnity: T('In Unity the Standard shader has "Normal Map" with a strength number next to it. Move "bump" in the Inspector under the game to see the difference live.', 'В Unity у Standard-шейдера есть «Normal Map» и число силы рядом. Подвигай «bump» в Inspector под игрой — увидишь разницу вживую.'),
    demo: (t, w) => (t < 1 ? { until: 1e9 } : walkTo(w, v3(3, 0, 1))),
    demoSeconds: 3,
  },
  {
    id: 'm5',
    chapter: 3,
    icon: '🔭',
    title: T('Detail by distance (LOD)', 'Детали по расстоянию (LOD)'),
    system: T('Level of detail', 'Уровни детализации'),
    radio: T('Far away nobody sees small details, but the computer still draws them. LOD: near — the detailed model, far — a simple one. Walk away and come back: watch the statue switch.', 'Издалека мелкие детали никто не видит, а компьютер их всё равно рисует. LOD: близко — подробная модель, далеко — простая. Отойди и вернись: смотри, как статуя переключается.'),
    task: T('Fill the blanks: near (< 8 m) the detailed statue, far — the simple one.', 'Заполни пропуски: близко (< 8 м) подробная статуя, далеко — простая.'),
    words: [{ word: 'SetActive(true / false)', say: T('Show or hide an object (it is not drawn when hidden).', 'Показать или спрятать объект (спрятанный не рисуется).') }],
    hints: [T('d < switchDistance → detailed on, simple off; else the opposite.', 'd < switchDistance → подробная включена, простая выключена; иначе наоборот.'), T('switchDistance, !near', 'switchDistance, !near')],
    code: () => `using UnityEngine;

public class SimpleLOD : MonoBehaviour
{
    public float switchDistance = 8f;
    Transform detailed;
    Transform simple;

    void Start()
    {
        detailed = transform.Find("Detailed");
        simple = transform.Find("Simple");
    }

    void Update()
    {
        float d = Vector3.Distance(Camera.main.transform.position, transform.position);
        bool near = d < ⟦switchDistance⟧;
        detailed.gameObject.SetActive(⟦near⟧);
        simple.gameObject.SetActive(⟦!near⟧);
    }
}
`,
    file: 'SimpleLOD.cs',
    attachTo: 'Statue',
    level: () => base('m5', [], { objects: [...walls(40), ...statue()], setup: prepareModelWorld }),
    goals: [
      { text: T('Near: the detailed statue', 'Близко: подробная статуя'), check: (w, r) => {
        const near = Math.hypot(w.player.pos.x, w.player.pos.z - 4) < 6;
        const det = objByName(w, 'Detailed');
        const simp = objByName(w, 'Simple');
        if (near && det && simp && !det.hidden && simp.hidden) r.mem.nearOk = 1;
        return r.mem.nearOk === 1;
      } },
      { text: T('Far: the simple one', 'Далеко: простая'), check: (w, r) => {
        const far = Math.hypot(w.player.pos.x, w.player.pos.z - 4) > 10;
        const det = objByName(w, 'Detailed');
        const simp = objByName(w, 'Simple');
        if (far && det && simp && det.hidden && !simp.hidden) r.mem.farOk = 1;
        return r.mem.farOk === 1;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Detail only where it is seen.', 'Детали только там, где их видно.'),
    inUnity: T('Unity has a ready LOD Group component: drag the detailed and simple models into its levels.', 'В Unity есть готовый компонент LOD Group: перетащи подробную и простую модели в его уровни.'),
    demo: (t, w) => (t < 2 ? walkTo(w, v3(0, 0, 1)) : walkTo(w, v3(0, 0, -12))),
    demoSeconds: 8,
  },
  {
    id: 'm6',
    chapter: 3,
    icon: '🏛',
    title: T('Dress the whole room', 'Одень всю комнату'),
    system: T('Set dressing', 'Оформление сцены'),
    radio: T('Last: a whole room by code. Find every wall by its tag, give it a material from your studio and make it repeat by size. A real level designer does this in seconds.', 'Последнее: целая комната кодом. Найди каждую стену по тегу, дай ей материал из студии и сделай повтор по размеру. Настоящий дизайнер уровней делает это за секунды.'),
    task: T('Fill the blanks: all four walls get weathered brick, tiled by their size.', 'Заполни пропуски: все четыре стены получают старый кирпич с повтором по размеру.'),
    words: [{ word: 'foreach (GameObject wall in walls)', say: T('Do the same for every wall in the array.', 'Сделать одно и то же для каждой стены массива.') }],
    hints: [T('FindGameObjectsWithTag("Wall"); bounds.size; the bigger of x and z is the length.', 'FindGameObjectsWithTag("Wall"); bounds.size; большее из x и z — длина.'), T('"Wall", material, tileSize', '"Wall", material, tileSize')],
    code: () => `using UnityEngine;

public class RoomDresser : MonoBehaviour
{
    public string materialName = "weathered_brick";
    public float tileSize = 2f;

    void Start()
    {
        GameObject[] walls = GameObject.FindGameObjectsWithTag(⟦"Wall"⟧);
        foreach (GameObject wall in walls)
        {
            Renderer r = wall.GetComponent<Renderer>();
            r.material = Resources.Load<Material>(⟦materialName⟧);
            Vector3 size = r.bounds.size;
            float length = Mathf.Max(size.x, size.z);
            r.material.mainTextureScale = new Vector2(length / ⟦tileSize⟧, size.y / tileSize);
        }
    }
}
`,
    file: 'RoomDresser.cs',
    attachTo: 'Designer',
    level: () => base('m6', [{ name: 'Designer', shape: 'none', pos: [0, 0, 0] }]),
    goals: [
      { text: T('All 4 walls are brick', 'Все 4 стены кирпичные'), check: (w) => w.objects.filter((o) => o.tag === 'Wall').every((o) => o.material?.id === 'weathered_brick') },
      { text: T('…tiled by size (18 m long → 9 repeats)', '…с повтором по размеру (18 м → 9 повторов)'), check: (w) => w.objects.filter((o) => o.tag === 'Wall').every((o) => Math.abs((o.material?.scale.x ?? 0) - 9.2) < 0.4) },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('You dress whole levels with code and your own materials.', 'Ты одеваешь целые уровни кодом и своими материалами.'),
    inUnity: T('Tags are set at the top of the Inspector (Tag → Add Tag). The same loop can place props, lights or sounds.', 'Теги ставятся вверху Inspector (Tag → Add Tag). Такой же цикл может расставлять предметы, свет или звуки.'),
    demo: (t, w) => (t < 1 ? { until: 1e9 } : walkTo(w, v3(5, 0, 5))),
    demoSeconds: 3,
  },
];

/** A ready table (for the material lessons). */
function table(): Spec3[] {
  const out: Spec3[] = [{ name: 'Table', shape: 'none', pos: [0, 0, 2] }];
  return out;
}

/** A statue in two versions: detailed (many parts) and simple (one block). */
function statue(): Spec3[] {
  return [{ name: 'Statue', shape: 'none', pos: [0, 0, 4] }];
}

/** Builds the parts that the levels above refer to (table legs, statue versions) right after loading. */
export function prepareModelWorld(w: World3D): void {
  const tableObj = objByName(w, 'Table');
  if (tableObj && !w.objects.some((o) => o.parent === tableObj)) {
    const part = (pos: [number, number, number], size: [number, number, number]) => {
      const p = w.add({ name: 'Part', shape: 'box', pos: [0, 0, 0], size, color: '#c8ccd2', solid: false });
      p.parent = tableObj;
      p.local = { pos: v3(...pos), rot: tableObj.rot };
    };
    part([0, 0.9, 0], [2, 0.1, 1]);
    for (const [x, z] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) part([x, 0.45, z], [0.1, 0.9, 0.1]);
  }
  const st = objByName(w, 'Statue');
  if (st && !w.objects.some((o) => o.parent === st)) {
    const det = w.add({ name: 'Detailed', shape: 'none', pos: [0, 0, 0] });
    det.parent = st;
    det.local = { pos: v3(), rot: st.rot };
    const add = (parent: typeof det, name: string, shape: 'box' | 'sphere' | 'cylinder', pos: [number, number, number], size: [number, number, number], color: string) => {
      const p = w.add({ name, shape, pos: [0, 0, 0], size, color, solid: false });
      p.parent = parent;
      p.local = { pos: v3(...pos), rot: st.rot };
    };
    add(det, 'Plinth', 'box', [0, 0.4, 0], [1.6, 0.8, 1.6], '#b7b2a8');
    add(det, 'Body', 'cylinder', [0, 1.5, 0], [0.8, 1.4, 0.8], '#d8d2c4');
    add(det, 'Head', 'sphere', [0, 2.5, 0], [0.6, 0.6, 0.6], '#d8d2c4');
    add(det, 'ArmL', 'cylinder', [-0.55, 1.6, 0], [0.22, 1, 0.22], '#d8d2c4');
    add(det, 'ArmR', 'cylinder', [0.55, 1.6, 0], [0.22, 1, 0.22], '#d8d2c4');
    for (let i = 0; i < 4; i++) add(det, 'Ornament', 'sphere', [Math.cos(i * 1.57) * 0.75, 0.85, Math.sin(i * 1.57) * 0.75], [0.18, 0.18, 0.18], '#c9a96e');
    const simp = w.add({ name: 'Simple', shape: 'box', pos: [0, 0, 0], size: [1.4, 2.8, 1.4], color: '#cfc9bb', solid: false });
    simp.parent = st;
    simp.local = { pos: v3(0, 1.4, 0), rot: st.rot };
    // until the script decides, show the detailed one
    simp.hidden = true;
  }
  w.follow();
}

export const MODEL_IDS = new Set(MODEL_MISSIONS.map((m) => m.id));

/** Free: a room to dress with any material (the picker under the game) — and your scripts. */
export function modelFreeScripts(): { file: string; on: string; source: string }[] {
  const answer = (id: string) => MODEL_MISSIONS.find((m) => m.id === id)!.code().replace(/⟦([^⟧]*)⟧/g, '$1');
  return [
    { file: 'RoomDresser.cs', on: 'Designer', source: answer('m6') },
    { file: 'TableBuilder.cs', on: 'Workbench', source: answer('m1') },
    { file: 'MouseLook.cs', on: 'Player', source: OFFICIAL.look },
    { file: 'PlayerMovement.cs', on: 'Player', source: OFFICIAL.move },
  ];
}
export function modelFreeLevel(scripts: { source: string; on: string }[]): Level3 {
  return {
    ...base('models-free', [
      { name: 'Designer', shape: 'none', pos: [0, 0, 0] },
      { name: 'Workbench', shape: 'none', pos: [-3, 0, 3] },
      { name: 'Crate', shape: 'box', pos: [4, 0.6, 4], size: [1.2, 1.2, 1.2], color: '#a07a4e' },
      { name: 'Crate', shape: 'box', pos: [5.4, 0.6, 3.6], size: [1.2, 1.2, 1.2], color: '#a07a4e' },
      { name: 'Pillar', shape: 'box', pos: [-6, 1.75, -4], size: [0.8, 3.5, 0.8], color: '#c9ced6' },
      { name: 'Pillar', shape: 'box', pos: [6, 1.75, -4], size: [0.8, 3.5, 0.8], color: '#c9ced6' },
      { name: 'Block', shape: 'box', pos: [0, 1, 6], size: [2, 2, 2], color: '#c9ced6' },
    ]),
    scripts,
  };
}

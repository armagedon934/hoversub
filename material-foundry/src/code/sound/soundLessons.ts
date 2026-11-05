// "Sound from zero": 9 lessons where the learner writes real Unity procedural audio
// (OnAudioFilterRead) — a tone, fading, a retro square wave, a jump slide, an explosion from noise,
// a coin of two notes, vibrato, a laser and an engine. The right window shows the wave and plays it
// (normal or twice as slow). Goals are checked by listening to the result (sound analysis).

import { tr, type Text2 } from '../i18n';
import type { Analysis } from './synth';

export interface SoundGoal {
  text: Text2;
  check: (a: Analysis) => boolean;
}

export interface SoundLesson {
  id: string;
  icon: string;
  title: Text2;
  story: Text2;
  task: Text2;
  words: { word: string; say: Text2 }[];
  hints: Text2[];
  /** Script with blanks marked ⟦…⟧. */
  code: () => string;
  file: string;
  seconds: number;
  goals: SoundGoal[];
  inUnity: Text2;
}

const T = (en: string, ru: string): Text2 => ({ en, ru });
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const audible = (a: Analysis) => a.peak > 0.08;
const fades = (a: Analysis) => a.loudness[0] > 0.04 && a.loudness[9] < a.loudness[0] * 0.3;
const pitchAt = (a: Analysis, from: number, to: number) => avg(a.pitch.slice(from, to).filter((p) => p > 0));

const HEAD = (cls: string, fields: string) => `using UnityEngine;

public class ${cls} : MonoBehaviour
{
${fields}
    float sampleRate;

    void Start()
    {
        sampleRate = AudioSettings.outputSampleRate;
    }
`;

export const SOUND_LESSONS: SoundLesson[] = [
  {
    id: 'z1',
    icon: '🎵',
    title: T('The first note', 'Первая нота'),
    story: T('A sound is air shaking back and forth. A sine wave is the smoothest shaking. Frequency = how many times per second (Hz). The note A is 440 times a second.', 'Звук — это воздух, который дрожит туда-сюда. Синусоида — самое плавное дрожание. Частота — сколько раз в секунду (Гц). Нота Ля — 440 раз в секунду.'),
    task: T('Fill the blanks and play the note A (440 Hz).', 'Заполни пропуски и сыграй ноту Ля (440 Гц).'),
    words: [
      { word: 'OnAudioFilterRead', say: T('Unity calls it to ask: "fill this array with the next sound".', 'Unity вызывает его и просит: «заполни этот массив следующим кусочком звука».') },
      { word: 'data[i]', say: T('One tiny moment of sound: a number from -1 to 1.', 'Один крошечный момент звука: число от -1 до 1.') },
      { word: 'Mathf.Sin(phase)', say: T('A smooth wave up and down.', 'Плавная волна вверх-вниз.') },
    ],
    hints: [T('frequency = 440f; the wave is Mathf.Sin; multiply by volume.', 'frequency = 440f; волна — Mathf.Sin; умножь на volume.'), T('440f, Sin, volume', '440f, Sin, volume')],
    code: () => `${HEAD('Tone', `    public float frequency = ⟦440f⟧;
    public float volume = 0.4f;
    float phase;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            data[i] = Mathf.⟦Sin⟧(phase) * ⟦volume⟧;
            phase += 2f * Mathf.PI * frequency / sampleRate;
        }
    }
}
`,
    file: 'Tone.cs',
    seconds: 0.6,
    goals: [
      { text: T('The sound is audible', 'Звук слышно'), check: audible },
      { text: T('It is the note A: about 440 Hz', 'Это нота Ля: около 440 Гц'), check: (a) => Math.abs(pitchAt(a, 0, 10) - 440) < 25 },
    ],
    inUnity: T('Add an AudioSource to an object and put this script on it. Press Play — Unity calls OnAudioFilterRead by itself, all the time.', 'Добавь объекту AudioSource и повесь этот скрипт. Нажми Play — Unity сам всё время вызывает OnAudioFilterRead.'),
  },
  {
    id: 'z2',
    icon: '📉',
    title: T('Fade out', 'Затухание'),
    story: T('Real sounds do not stop like a switch: a bell fades. An envelope multiplies the wave by a number that goes from 1 to 0.', 'Настоящие звуки не обрываются, как выключатель: колокольчик затихает. Огибающая умножает волну на число, которое идёт от 1 к 0.'),
    task: T('Make the note fade away smoothly.', 'Сделай так, чтобы нота плавно затихала.'),
    words: [
      { word: 'time', say: T('How long the sound has been playing, in seconds.', 'Сколько секунд звук уже звучит.') },
      { word: 'fade', say: T('1 at the start, 0 at the end.', '1 в начале, 0 в конце.') },
    ],
    hints: [T('fade = 1 − time / length; multiply by fade; time grows by 1 / sampleRate.', 'fade = 1 − time / length; умножь на fade; time растёт на 1 / sampleRate.'), T('length, fade, sampleRate', 'length, fade, sampleRate')],
    code: () => `${HEAD('Bell', `    public float frequency = 660f;
    public float volume = 0.5f;
    public float length = 0.6f;
    float phase;
    float time;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = 1f - time / ⟦length⟧;
            if (fade < 0) fade = 0;
            data[i] = Mathf.Sin(phase) * volume * ⟦fade⟧;
            phase += 2f * Mathf.PI * frequency / sampleRate;
            time += 1f / ⟦sampleRate⟧;
        }
    }
}
`,
    file: 'Bell.cs',
    seconds: 0.6,
    goals: [
      { text: T('Loud at the start', 'Громко в начале'), check: (a) => a.loudness[0] > 0.12 },
      { text: T('Quiet at the end (fades)', 'Тихо в конце (затухает)'), check: fades },
    ],
    inUnity: T('Envelopes are everywhere: footsteps, shots, music. In Unity you can also fade an AudioSource with audioSource.volume in Update.', 'Огибающие — везде: шаги, выстрелы, музыка. В Unity можно ещё плавно менять audioSource.volume в Update.'),
  },
  {
    id: 'z3',
    icon: '👾',
    title: T('Retro square', 'Ретро-квадрат'),
    story: T('Old consoles had square waves: the speaker is either fully up or fully down. That is the 8-bit sound.', 'В старых приставках были квадратные волны: динамик либо полностью вверх, либо вниз. Это и есть 8-битный звук.'),
    task: T('Turn the smooth wave into a square one.', 'Преврати плавную волну в квадратную.'),
    words: [{ word: 'a ? b : c', say: T('"If a — then b, otherwise c". Here: wave above 0 → 1, else → -1.', '«Если a — то b, иначе c». Здесь: волна выше 0 → 1, иначе → -1.') }],
    hints: [T('Mathf.Sin(phase) > 0 ? 1f : -1f', 'Mathf.Sin(phase) > 0 ? 1f : -1f')],
    code: () => `${HEAD('Retro', `    public float frequency = 330f;
    public float volume = 0.3f;
    public float length = 0.6f;
    float phase;
    float time;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = Mathf.Max(0, 1f - time / length);
            float wave = Mathf.Sin(phase) > 0 ⟦?⟧ 1f ⟦:⟧ -1f;
            data[i] = wave * volume * fade;
            phase += 2f * Mathf.PI * frequency / sampleRate;
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Retro.cs',
    seconds: 0.6,
    goals: [
      { text: T('The wave is square (8-bit)', 'Волна квадратная (8 бит)'), check: (a) => a.squareness > 0.7 },
      { text: T('It still fades', 'И всё так же затихает'), check: fades },
    ],
    inUnity: T('Square waves with a short envelope = most sounds of classic platformers. Try frequency 110 and 880.', 'Квадратная волна с короткой огибающей — большинство звуков классических платформеров. Попробуй частоту 110 и 880.'),
  },
  {
    id: 'z4',
    icon: '🦘',
    title: T('Jump', 'Прыжок'),
    story: T('A jump sound goes up: the frequency grows while it plays. That is a pitch slide.', 'Звук прыжка «взлетает»: частота растёт, пока он звучит. Это скольжение высоты.'),
    task: T('Make the pitch slide up — a jump sound.', 'Сделай, чтобы высота поднималась, — звук прыжка.'),
    words: [{ word: 'frequency += slide / sampleRate', say: T('Every moment the note gets a bit higher: slide Hz per second.', 'Каждый момент нота чуть выше: на slide Гц в секунду.') }],
    hints: [T('Start from startFrequency; add slide / sampleRate each step.', 'Начни с startFrequency; каждый шаг прибавляй slide / sampleRate.'), T('startFrequency, slide', 'startFrequency, slide')],
    code: () => `using UnityEngine;

public class Jump : MonoBehaviour
{
    public float startFrequency = 260f;
    public float slide = 1600f;
    public float volume = 0.3f;
    public float length = 0.35f;
    float frequency;
    float phase;
    float time;
    float sampleRate;

    void Start()
    {
        sampleRate = AudioSettings.outputSampleRate;
        frequency = ⟦startFrequency⟧;
    }

    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = Mathf.Max(0, 1f - time / length);
            data[i] = (Mathf.Sin(phase) > 0 ? 1f : -1f) * volume * fade;
            phase += 2f * Mathf.PI * frequency / sampleRate;
            frequency += ⟦slide⟧ / sampleRate;
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Jump.cs',
    seconds: 0.35,
    goals: [
      { text: T('The pitch goes up', 'Высота поднимается'), check: (a) => pitchAt(a, 6, 9) > pitchAt(a, 0, 2) * 1.5 },
      { text: T('Short and fading', 'Короткий и затухает'), check: fades },
    ],
    inUnity: T('Play it from your player script when jumping: GetComponent<AudioSource>().Play(). A pitch going DOWN sounds like falling or a hit.', 'Включай его из скрипта игрока при прыжке: GetComponent<AudioSource>().Play(). Если высота идёт ВНИЗ — звучит как падение или удар.'),
  },
  {
    id: 'z5',
    icon: '🧨',
    title: T('Explosion from noise', 'Взрыв из шума'),
    story: T('Noise is random numbers: no note at all. Loud noise that fades — an explosion; very short — a shot or a step.', 'Шум — это случайные числа: никакой ноты. Громкий затихающий шум — взрыв; очень короткий — выстрел или шаг.'),
    task: T('Make an explosion: random numbers that fade out.', 'Сделай взрыв: случайные числа, которые затихают.'),
    words: [{ word: 'Random.Range(-1f, 1f)', say: T('A random number from -1 to 1 — every time a new one.', 'Случайное число от -1 до 1 — каждый раз новое.') }],
    hints: [T('Random.Range(-1f, 1f)', 'Random.Range(-1f, 1f)')],
    code: () => `${HEAD('Explosion', `    public float volume = 0.6f;
    public float length = 0.8f;
    float time;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = Mathf.Max(0, 1f - time / length);
            fade = fade * fade;
            data[i] = Random.Range(⟦-1f⟧, ⟦1f⟧) * volume * fade;
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Explosion.cs',
    seconds: 0.8,
    goals: [
      { text: T('It is noise, not a note', 'Это шум, а не нота'), check: (a) => a.noisiness > 0.5 },
      { text: T('Loud at first, then dies away', 'Сначала громко, потом стихает'), check: (a) => a.loudness[0] > 0.15 && fades(a) },
    ],
    inUnity: T('fade * fade makes the end softer and the start punchier. Try length 0.1 — it becomes a gunshot.', 'fade * fade делает конец мягче, а начало резче. Попробуй length 0.1 — получится выстрел.'),
  },
  {
    id: 'z6',
    icon: '🪙',
    title: T('Coin', 'Монетка'),
    story: T('The famous coin sound is two notes: a short one and a higher one right after it.', 'Знаменитый звук монетки — это две ноты: короткая и сразу за ней повыше.'),
    task: T('Play two notes: 988 Hz, then after 0.08 s — 1319 Hz.', 'Сыграй две ноты: 988 Гц, а через 0,08 с — 1319 Гц.'),
    words: [{ word: 'time < 0.08f ? a : b', say: T('First 0.08 seconds — note a, then note b.', 'Первые 0,08 секунды — нота a, потом нота b.') }],
    hints: [T('0.08f, then 1319f.', '0.08f, потом 1319f.')],
    code: () => `${HEAD('Coin', `    public float volume = 0.25f;
    public float length = 0.45f;
    float phase;
    float time;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = Mathf.Max(0, 1f - time / length);
            float f = time < ⟦0.08f⟧ ? 988f : ⟦1319f⟧;
            phase += 2f * Mathf.PI * f / sampleRate;
            data[i] = (Mathf.Sin(phase) > 0 ? 1f : -1f) * volume * fade;
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Coin.cs',
    seconds: 0.45,
    goals: [
      { text: T('First note about 988 Hz', 'Первая нота около 988 Гц'), check: (a) => Math.abs(a.pitch[0] - 988) < 60 },
      { text: T('Then a higher one, about 1319 Hz', 'Потом выше, около 1319 Гц'), check: (a) => Math.abs(pitchAt(a, 3, 7) - 1319) < 70 },
    ],
    inUnity: T('988 and 1319 Hz are the notes B and E — a happy "fourth". Any two notes going up sound like a reward.', '988 и 1319 Гц — это ноты Си и Ми, весёлая «кварта». Любые две ноты вверх звучат как награда.'),
  },
  {
    id: 'z7',
    icon: '〰️',
    title: T('Vibrato', 'Вибрато'),
    story: T('Singers and sirens wobble the note a little. Add a slow sine wave to the frequency.', 'Певцы и сирены чуть-чуть «качают» ноту. Прибавь к частоте медленную синусоиду.'),
    task: T('Make the note wobble up and down.', 'Сделай так, чтобы нота качалась вверх-вниз.'),
    words: [{ word: 'wobble', say: T('A slow wave that adds or removes a few Hz.', 'Медленная волна, которая прибавляет или убирает немного Гц.') }],
    hints: [T('Mathf.Sin(time * 2π * vibratoSpeed) * vibratoDepth', 'Mathf.Sin(time * 2π * vibratoSpeed) * vibratoDepth'), T('vibratoSpeed, vibratoDepth, wobble', 'vibratoSpeed, vibratoDepth, wobble')],
    code: () => `${HEAD('Siren', `    public float frequency = 600f;
    public float vibratoSpeed = 5f;
    public float vibratoDepth = 120f;
    public float volume = 0.3f;
    float phase;
    float time;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float wobble = Mathf.Sin(time * 2f * Mathf.PI * ⟦vibratoSpeed⟧) * ⟦vibratoDepth⟧;
            phase += 2f * Mathf.PI * (frequency + ⟦wobble⟧) / sampleRate;
            data[i] = Mathf.Sin(phase) * volume;
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Siren.cs',
    seconds: 1,
    goals: [
      { text: T('The pitch goes up and down', 'Высота ходит вверх-вниз'), check: (a) => Math.max(...a.pitch) - Math.min(...a.pitch.filter((p) => p > 0)) > 60 },
      { text: T('…around 600 Hz', '…вокруг 600 Гц'), check: (a) => Math.abs(pitchAt(a, 0, 10) - 600) < 80 },
    ],
    inUnity: T('A slow deep vibrato = an alarm; a fast small one = a singer; very fast = a "buzz".', 'Медленное глубокое вибрато — тревога; быстрое маленькое — певец; очень быстрое — «жужжание».'),
  },
  {
    id: 'z8',
    icon: '🔫',
    title: T('Laser', 'Лазер'),
    story: T('Put everything together: a square wave, a pitch that falls fast, and a fade. That is a sci-fi laser.', 'Собери всё вместе: квадратная волна, быстро падающая высота и затухание. Это фантастический лазер.'),
    task: T('Make the pitch fall (but not below 80 Hz).', 'Сделай, чтобы высота падала (но не ниже 80 Гц).'),
    words: [{ word: 'Mathf.Max(a, b)', say: T('The bigger of two numbers — here: never below 80.', 'Большее из двух чисел — здесь: никогда не ниже 80.') }],
    hints: [T('frequency -= drop / sampleRate; Mathf.Max(frequency, 80f)', 'frequency -= drop / sampleRate; Mathf.Max(frequency, 80f)'), T('drop, 80f', 'drop, 80f')],
    code: () => `using UnityEngine;

public class Laser : MonoBehaviour
{
    public float startFrequency = 1400f;
    public float drop = 4000f;
    public float volume = 0.3f;
    public float length = 0.3f;
    float frequency;
    float phase;
    float time;
    float sampleRate;

    void Start()
    {
        sampleRate = AudioSettings.outputSampleRate;
        frequency = startFrequency;
    }

    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float fade = Mathf.Max(0, 1f - time / length);
            data[i] = (Mathf.Sin(phase) > 0 ? 1f : -1f) * volume * fade;
            phase += 2f * Mathf.PI * frequency / sampleRate;
            frequency -= ⟦drop⟧ / sampleRate;
            frequency = Mathf.Max(frequency, ⟦80f⟧);
            time += 1f / sampleRate;
        }
    }
}
`,
    file: 'Laser.cs',
    seconds: 0.3,
    goals: [
      { text: T('The pitch falls', 'Высота падает'), check: (a) => pitchAt(a, 6, 9) < pitchAt(a, 0, 2) * 0.6 },
      { text: T('Square and fading', 'Квадратный и затухает'), check: (a) => a.squareness > 0.6 && fades(a) },
    ],
    inUnity: T('Make two AudioSources and you can play the laser and the explosion together.', 'Сделай два AudioSource — и сможешь играть лазер и взрыв одновременно.'),
  },
  {
    id: 'z9',
    icon: '🏎',
    title: T('Engine', 'Мотор'),
    story: T('An engine is a low buzzing saw wave. Its pitch follows the speed: faster car — higher hum. Later you will use it in the racing game.', 'Мотор — низкое жужжание пилообразной волны. Высота следует за скоростью: быстрее машина — выше гул. Потом ты применишь его в гонке.'),
    task: T('Make a saw wave whose pitch grows with rpm.', 'Сделай пилу, высота которой растёт с оборотами (rpm).'),
    words: [
      { word: 'saw wave', say: T('Goes up slowly, drops at once: 2 * (phase % 1) − 1. Sounds buzzy.', 'Медленно растёт и сразу падает: 2 * (phase % 1) − 1. Звучит «жужжаще».') },
      { word: 'rpm', say: T('Revolutions per minute of the engine.', 'Обороты мотора в минуту.') },
    ],
    hints: [T('frequency = rpm / 60 * 2; the wave: 2f * cycle - 1f; rpm grows by revUp per second.', 'frequency = rpm / 60 * 2; волна: 2f * cycle - 1f; rpm растёт на revUp в секунду.'), T('60f, cycle, revUp', '60f, cycle, revUp')],
    code: () => `${HEAD('Engine', `    public float rpm = 1500f;
    public float revUp = 3000f;
    public float volume = 0.25f;
    float cycle;`)}
    void OnAudioFilterRead(float[] data, int channels)
    {
        for (int i = 0; i < data.Length; i++)
        {
            float frequency = rpm / ⟦60f⟧ * 2f;
            cycle = (cycle + frequency / sampleRate) % 1f;
            data[i] = (2f * ⟦cycle⟧ - 1f) * volume;
            rpm += ⟦revUp⟧ / sampleRate;
        }
    }
}
`,
    file: 'Engine.cs',
    seconds: 1,
    goals: [
      { text: T('Low hum at first (under 100 Hz)', 'Сначала низкий гул (ниже 100 Гц)'), check: (a) => a.pitch[0] > 20 && a.pitch[0] < 100 },
      { text: T('It revs up', 'Обороты растут'), check: (a) => a.pitch[9] > a.pitch[0] * 1.6 },
    ],
    inUnity: T('In a racing game set rpm from the speed of the car in Update, and OnAudioFilterRead plays the engine all the time.', 'В гонке задавай rpm от скорости машины в Update, а OnAudioFilterRead всё время играет мотор.'),
  },
];

export const SOUND_LESSON_IDS = new Set(SOUND_LESSONS.map((l) => l.id));
export const soundLessonTitle = (l: SoundLesson) => `${l.icon} ${tr(l.title.en, l.title.ru)}`;

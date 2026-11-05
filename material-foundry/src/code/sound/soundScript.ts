// Runs a Unity-style procedural sound script: a MonoBehaviour with OnAudioFilterRead(float[] data,
// int channels) — exactly how Unity lets you make sound with code. The safe interpreter fills the
// buffer once (mono, 22 050 samples per second); the Inspector values (sliders) are applied before
// Start(), like in Unity.

import { tr } from '../i18n';
import { CsError, CsProgram, NOT_FOUND, csText, type ArrV, type ObjV, type V } from '../run/csharp';
import { parseCSharp, syntaxProblems, type Problem } from '../run/runner';
import { SAMPLE_RATE } from './synth';

export interface SoundField {
  name: string;
  type: string;
  value: number;
}

export interface SoundResult {
  samples: Float32Array;
  fields: SoundField[];
  logs: string[];
  problems: Problem[] | null;
  error?: { line: number; message: string };
}

function drain<T>(g: Generator<unknown, T, string | undefined>, budget: number): T {
  let n = 0;
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    const ev = r.value as { t: string };
    if (ev.t === 'wait') throw new CsError(tr('"yield return" does not work in OnAudioFilterRead.', '«yield return» не работает в OnAudioFilterRead.'), 0, 'runtime');
    if (ev.t === 'input') throw new CsError(tr('Console.ReadLine does not work here.', 'Console.ReadLine здесь не работает.'), 0, 'unsupported');
    if (++n > budget) throw new CsError(tr('Too much work — probably an endless loop.', 'Слишком много работы — скорее всего, бесконечный цикл.'), 0, 'limit');
  }
}

/** Public number fields of the script (shown as sliders). */
function numberFields(self: ObjV, source: string): SoundField[] {
  const out: SoundField[] = [];
  for (const [name, c] of self.fields) {
    if (typeof c.v !== 'number') continue;
    if (!new RegExp(`public\\s+(?:float|int|double)\\s+${name}\\b`).test(source)) continue;
    out.push({ name, type: c.type, value: c.v });
  }
  return out;
}

export async function renderSoundScript(source: string, seconds: number, overrides: Record<string, number> = {}): Promise<SoundResult> {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  const logs: string[] = [];
  const tree = await parseCSharp(source);
  const problems = syntaxProblems(tree, source);
  if (problems.length) return { samples, fields: [], logs, problems };
  const program = new CsProgram(tree, source, { maxSteps: 2_000_000_000, maxDepth: 100, maxTrace: 0, maxOutput: 200 });
  const cls = [...program.classes.values()].find((c) => c.base === 'MonoBehaviour');
  if (!cls) return { samples, fields: [], logs, problems: [{ line: 0, col: 0, message: tr('Write a class that inherits MonoBehaviour.', 'Нужен класс, который наследует MonoBehaviour.') }] };
  const method = cls.methods.get('OnAudioFilterRead')?.[0];
  if (!method) return { samples, fields: [], logs, problems: [{ line: 0, col: 0, message: tr('The script needs the method void OnAudioFilterRead(float[] data, int channels).', 'В скрипте нужен метод void OnAudioFilterRead(float[] data, int channels).') }] };
  program.host = {
    log: (t: string) => void logs.push(t),
    global(name: string): V | typeof NOT_FOUND {
      if (name === 'AudioSettings') return { k: 'type', name };
      if (name === 'AudioSettings.outputSampleRate') return SAMPLE_RATE;
      return NOT_FOUND;
    },
    call(name: string, args: V[]): V | typeof NOT_FOUND {
      if (name === 'print') {
        logs.push(csText(args[0]));
        return undefined;
      }
      return NOT_FOUND;
    },
  };
  try {
    program.activate();
    drain(program.initStatics() as Generator<unknown, void, string | undefined>, 1e6);
    const self = drain(program.instantiate(cls, [], 0) as Generator<unknown, ObjV, string | undefined>, 1e6);
    for (const [k, v] of Object.entries(overrides)) {
      const c = self.fields.get(k);
      if (c && typeof c.v === 'number') c.v = c.type === 'int' ? Math.round(v) : v;
    }
    const fields = numberFields(self, source);
    for (const name of ['Awake', 'Start']) {
      const m = cls.methods.get(name)?.[0];
      if (m) drain(program.invokeMethod(m, cls, self, [], m.startPosition.row) as Generator<unknown, V, string | undefined>, 1e6);
    }
    const arr: ArrV = { k: 'arr', items: new Array(samples.length).fill(0), elem: 'float' };
    drain(program.invokeMethod(method, cls, self, [arr, 1], method.startPosition.row) as Generator<unknown, V, string | undefined>, 5e8);
    for (let i = 0; i < samples.length; i++) {
      const v = arr.items[i];
      samples[i] = typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    }
    return { samples, fields, logs, problems: null };
  } catch (e) {
    const err = e instanceof CsError ? e : new CsError(String(e instanceof Error ? e.message : e), 0);
    return { samples, fields: [], logs, problems: null, error: { line: err.line, message: err.message } };
  }
}

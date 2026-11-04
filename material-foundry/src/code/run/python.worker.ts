/// <reference lib="webworker" />
// Runs Python with Pyodide (real CPython compiled to WebAssembly) inside this worker. The worker
// has no access to files on the computer; network functions are removed before user code runs.
// sys.settrace records every executed line with the variables of each active function.

declare const self: DedicatedWorkerGlobalScope;
export {};

interface PyodideLike {
  runPython(code: string): unknown;
  globals: { set(name: string, value: unknown): void };
  setStdout?(o: unknown): void;
  toPy?(v: unknown): unknown;
}

let pyodide: Promise<PyodideLike> | null = null;

const RUNNER = String.raw`
import sys, json, types
_out = []
_cur = ['']
class _W:
    def write(self, s):
        parts = s.split('\n')
        _cur[0] += parts[0]
        for p in parts[1:]:
            _out.append(_cur[0]); _cur[0] = p
        return len(s)
    def flush(self): pass
_inputs = list(__inputs)
def _input(prompt=''):
    if prompt: _W().write(str(prompt))
    if not _inputs:
        raise EOFError('no input left')
    v = _inputs.pop(0)
    _W().write(v + '\n')
    return v
_steps = []
_count = [0]
class _Limit(Exception): pass
def _show(v, depth=0):
    try:
        if isinstance(v, bool): return {'text': 'True' if v else 'False'}
        if isinstance(v, (int, float)): return {'text': repr(v)}
        if isinstance(v, str): return {'text': repr(v if len(v) < 40 else v[:39] + '…')}
        if v is None: return {'text': 'None'}
        if isinstance(v, (list, tuple, set)) and depth == 0:
            return {'text': type(v).__name__ + ' (' + str(len(v)) + ')', 'parts': [{'label': '[' + str(i) + ']', 'text': _show(x, 1)['text']} for i, x in enumerate(list(v)[:12])]}
        if isinstance(v, dict) and depth == 0:
            return {'text': 'dict (' + str(len(v)) + ')', 'parts': [{'label': repr(k), 'text': _show(x, 1)['text']} for k, x in list(v.items())[:10]]}
        if hasattr(v, '__dict__') and not isinstance(v, (types.ModuleType, types.FunctionType, type)) and depth == 0:
            return {'text': type(v).__name__, 'parts': [{'label': k, 'text': _show(x, 1)['text']} for k, x in list(vars(v).items())[:10]]}
        return {'text': repr(v)[:60]}
    except Exception:
        return {'text': '?'}
def _frames(frame):
    st = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == '<user>': st.append(f)
        f = f.f_back
    st.reverse()
    res = []
    for s in st:
        vs = []
        for k, v in list(s.f_locals.items()):
            if k.startswith('__') or k == 'input' or isinstance(v, (types.ModuleType, types.FunctionType, type, types.BuiltinFunctionType)): continue
            vs.append({'name': k, 'value': _show(v)})
        res.append({'fn': '' if s.f_code.co_name == '<module>' else s.f_code.co_name, 'vars': vs})
    return res
def _tracer(frame, event, arg):
    if frame.f_code.co_filename != '<user>': return None
    _count[0] += 1
    if _count[0] > 200000: raise _Limit()
    if __trace and len(_steps) < 3000 and event in ('line', 'call', 'return'):
        _steps.append({'line': frame.f_lineno - 1, 'kind': event, 'fn': frame.f_code.co_name, 'ret': _show(arg)['text'] if event == 'return' else None, 'frames': _frames(frame), 'output': len(_out) + (1 if _cur[0] else 0)})
    return _tracer
_err = None
_g = {'__name__': '__main__', 'input': _input}
_old = sys.stdout
sys.stdout = _W()
sys.stderr = _W()
try:
    _code = compile(__user_code, '<user>', 'exec')
    sys.settrace(_tracer)
    exec(_code, _g)
except _Limit:
    _err = {'type': 'Limit', 'line': -1, 'message': ''}
except SyntaxError as e:
    _err = {'type': type(e).__name__, 'line': (e.lineno or 1) - 1, 'message': str(e.msg)}
except BaseException as e:
    tb = e.__traceback__
    line = -1
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == '<user>': line = tb.tb_lineno - 1
        tb = tb.tb_next
    _err = {'type': type(e).__name__, 'line': line, 'message': str(e)}
finally:
    sys.settrace(None)
    sys.stdout = _old
if _cur[0]: _out.append(_cur[0])
json.dumps({'output': _out, 'steps': _steps, 'error': _err, 'truncated': len(_steps) >= 3000})
`;

async function load(base: string): Promise<PyodideLike> {
  const mod = (await import(/* @vite-ignore */ `${base}pyodide.mjs`)) as { loadPyodide(o: { indexURL: string }): Promise<PyodideLike> };
  const py = await mod.loadPyodide({ indexURL: base });
  // No network for user code: remove the browser's network functions from this worker.
  for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    try {
      (self as unknown as Record<string, unknown>)[k] = undefined;
    } catch {
      /* ignore */
    }
  }
  py.runPython('import sys\nsys.modules["pyodide_http"] = None');
  return py;
}

self.onmessage = async (e: MessageEvent<{ id: number; base: string; code: string; inputs: string[]; trace: boolean }>) => {
  const { id, base, code, inputs, trace } = e.data;
  try {
    pyodide ??= load(base);
    const py = await pyodide;
    py.globals.set('__user_code', code);
    py.globals.set('__inputs', py.toPy ? py.toPy(inputs) : inputs);
    py.globals.set('__trace', trace);
    const json = py.runPython(RUNNER) as string;
    self.postMessage({ id, ok: true, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

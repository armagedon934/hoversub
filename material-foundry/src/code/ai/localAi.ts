// Optional bridge to an AI model running on this computer (Ollama or LM Studio / llama.cpp /
// any OpenAI-compatible local server). The app works fully without it; when turned on, it can
// guess the next code, explain a line in other words, or suggest a fix for an error.
//
// Safety: only addresses on this computer are allowed (localhost / 127.0.0.1 / ::1) — the code
// never leaves the machine. Answers are always marked as an AI guess and are inserted only when
// the person clicks. In the desktop app requests go through the app itself (no browser CORS
// limits); in a browser the local server must allow this page (see docs/LOCAL_AI.md).

import { create } from 'zustand';
import { getLocale, tr } from '../i18n';

export type AiKind = 'ollama' | 'openai';

export interface AiSettings {
  enabled: boolean;
  kind: AiKind;
  url: string;
  model: string;
  /** Small models need short answers; this caps the answer length (tokens). */
  maxTokens: number;
}

const KEY = 'mf.ai.v1';
export const DEFAULTS: Record<AiKind, string> = { ollama: 'http://localhost:11434', openai: 'http://localhost:1234/v1' };

function load(): AiSettings {
  const d: AiSettings = { enabled: false, kind: 'ollama', url: DEFAULTS.ollama, model: '', maxTokens: 256 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (typeof raw.enabled === 'boolean') d.enabled = raw.enabled;
    if (raw.kind === 'ollama' || raw.kind === 'openai') d.kind = raw.kind;
    if (typeof raw.url === 'string' && isLocalUrl(raw.url)) d.url = raw.url;
    if (typeof raw.model === 'string') d.model = raw.model;
    if (Number.isFinite(raw.maxTokens)) d.maxTokens = Math.min(2048, Math.max(32, raw.maxTokens));
  } catch {
    /* defaults */
  }
  return d;
}

interface AiState extends AiSettings {
  status: 'off' | 'unknown' | 'ok' | 'error';
  statusText: string;
  models: string[];
  set: (p: Partial<AiSettings>) => void;
}

export const useAi = create<AiState>((set, get) => ({
  ...load(),
  status: 'unknown',
  statusText: '',
  models: [],
  set(p) {
    if (p.url !== undefined && !isLocalUrl(p.url)) return;
    set(p);
    const s = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, kind: s.kind, url: s.url, model: s.model, maxTokens: s.maxTokens }));
    } catch {
      /* ignore */
    }
  },
}));

/** Only this computer: the code never goes to the internet. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

interface DesktopBridge {
  aiRequest(req: { url: string; method: string; body?: string }): Promise<{ status: number; body: string }>;
}

function desktop(): DesktopBridge | undefined {
  return (globalThis as unknown as { mfDesktop?: DesktopBridge }).mfDesktop;
}

async function request(url: string, method: 'GET' | 'POST', body?: unknown, signal?: AbortSignal, timeoutMs = 60_000): Promise<unknown> {
  if (!isLocalUrl(url)) throw new Error(tr('Only addresses on this computer are allowed.', 'Разрешены только адреса на этом компьютере.'));
  const text = body === undefined ? undefined : JSON.stringify(body);
  const d = desktop();
  if (d) {
    const r = await Promise.race([
      d.aiRequest({ url, method, body: text }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(tr('The local AI did not answer in time.', 'Локальный ИИ не ответил вовремя.'))), timeoutMs)),
    ]);
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 200)}`);
    return JSON.parse(r.body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { method, body: text, headers: text ? { 'Content-Type': 'application/json' } : undefined, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(tr('The local AI did not answer in time.', 'Локальный ИИ не ответил вовремя.'));
    if (e instanceof TypeError)
      throw new Error(
        tr(
          'Cannot reach the local AI. Is it running? In a browser the server must also allow this page (Ollama: set OLLAMA_ORIGINS=*; LM Studio: turn on CORS). The desktop app does not need this.',
          'Не получается достучаться до локального ИИ. Он запущен? В браузере сервер ещё должен разрешать эту страницу (Ollama: переменная OLLAMA_ORIGINS=*; LM Studio: включи CORS). В программе для ПК это не нужно.',
        ),
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const join = (base: string, path: string) => base.replace(/\/+$/, '') + path;

/** Checks the connection and lists the models the server has. */
export async function testAi(): Promise<string[]> {
  const s = useAi.getState();
  try {
    let models: string[];
    if (s.kind === 'ollama') {
      const r = (await request(join(s.url, '/api/tags'), 'GET', undefined, undefined, 8000)) as { models?: { name: string }[] };
      models = (r.models ?? []).map((m) => m.name);
    } else {
      const r = (await request(join(s.url, '/models'), 'GET', undefined, undefined, 8000)) as { data?: { id: string }[] };
      models = (r.data ?? []).map((m) => m.id);
    }
    useAi.setState({ status: 'ok', statusText: tr(`Connected. Models: ${models.length}`, `Подключено. Моделей: ${models.length}`), models });
    if (!s.model && models[0]) useAi.getState().set({ model: models[0] });
    return models;
  } catch (e) {
    useAi.setState({ status: 'error', statusText: e instanceof Error ? e.message : String(e), models: [] });
    throw e;
  }
}

/** One question to the local model. */
export async function askAi(system: string, prompt: string, signal?: AbortSignal, maxTokens?: number): Promise<string> {
  const s = useAi.getState();
  if (!s.enabled) throw new Error(tr('The local AI is turned off (Settings → Local AI).', 'Локальный ИИ выключен (Настройки → Локальный ИИ).'));
  if (!s.model) throw new Error(tr('Choose a model first (Settings → Local AI → Check).', 'Сначала выбери модель (Настройки → Локальный ИИ → Проверить).'));
  const n = maxTokens ?? s.maxTokens;
  if (s.kind === 'ollama') {
    const r = (await request(join(s.url, '/api/generate'), 'POST', { model: s.model, system, prompt, stream: false, options: { num_predict: n, temperature: 0.2 } }, signal)) as { response?: string };
    return (r.response ?? '').trim();
  }
  const r = (await request(
    join(s.url, '/chat/completions'),
    'POST',
    {
      model: s.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: n,
      temperature: 0.2,
      stream: false,
    },
    signal,
  )) as { choices?: { message?: { content?: string } }[] };
  return (r.choices?.[0]?.message?.content ?? '').trim();
}

const LANG_NAME: Record<string, string> = { cs: 'C# (Unity)', py: 'Python', js: 'JavaScript', cpp: 'C++', c: 'C' };

/** Removes ``` fences and chatter around code a small model may add. */
export function cleanCode(answer: string): string {
  const fence = /```[\w#+-]*\n([\s\S]*?)```/.exec(answer);
  let code = fence ? fence[1] : answer.replace(/^```[\w#+-]*\n?/, '').replace(/```\s*$/, '');
  code = code.replace(/^\s*(Here is|Here's|Вот|Конечно)[^\n]*\n/i, '');
  return code.replace(/\s+$/, '');
}

/** "Guess the next code": short continuation at the cursor (marked as an AI guess in the editor). */
export async function aiNextCode(lang: string, before: string, after: string, signal?: AbortSignal): Promise<string> {
  const system = `You complete ${LANG_NAME[lang] ?? lang} code for a beginner. Reply with ONLY the code to insert at <CURSOR> (1 to 6 lines). No explanations, no markdown, do not repeat existing code.`;
  const prompt = `${before.slice(-2500)}<CURSOR>${after.slice(0, 800)}`;
  return cleanCode(await askAi(system, prompt, signal, 160));
}

/** Plain-language explanation of a piece of code, in the interface language. */
export async function aiExplain(lang: string, code: string, focus: string, signal?: AbortSignal): Promise<string> {
  const ru = getLocale() === 'ru';
  const system = ru
    ? `Ты добрый учитель программирования для новичка с СДВГ. Объясняй ${LANG_NAME[lang] ?? lang} коротко, простыми словами, по-русски: 2–4 коротких предложения, без markdown-заголовков. Если не уверен — так и скажи.`
    : `You are a kind programming teacher for a beginner with ADHD. Explain ${LANG_NAME[lang] ?? lang} briefly in plain words: 2–4 short sentences, no headings. If unsure, say so.`;
  const prompt = ru ? `Код:\n${code.slice(0, 3000)}\n\nОбъясни эту строку: ${focus}` : `Code:\n${code.slice(0, 3000)}\n\nExplain this line: ${focus}`;
  return askAi(system, prompt, signal, 220);
}

/** A suggested fix for an error message (shown as a suggestion, never applied automatically). */
export async function aiFix(lang: string, code: string, error: string, signal?: AbortSignal): Promise<string> {
  const ru = getLocale() === 'ru';
  const system = ru
    ? `Ты помогаешь новичку исправить ошибку в ${LANG_NAME[lang] ?? lang}. Ответ: 1) одно предложение — в чём причина; 2) исправленные строки кода. Коротко, по-русски.`
    : `You help a beginner fix an error in ${LANG_NAME[lang] ?? lang}. Answer: 1) one sentence about the cause; 2) the corrected lines of code. Be brief.`;
  return askAi(system, `${ru ? 'Ошибка' : 'Error'}: ${error}\n\n${ru ? 'Код' : 'Code'}:\n${code.slice(0, 3500)}`, signal, 320);
}

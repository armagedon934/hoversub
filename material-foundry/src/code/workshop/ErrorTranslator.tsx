// "Error translator": paste what Unity's Console, Visual Studio, a compiler or Python printed,
// and get every recognised error explained in plain words: what it means and how to fix it.

import { useMemo, useState } from 'react';
import { Bot, ClipboardPaste, Languages } from 'lucide-react';
import { pick, tr } from '../i18n';
import { askAi, useAi } from '../ai/localAi';
import { ERROR_RULE_COUNT, errorText, translateErrors } from '../run/errors';
import { useNotebook } from '../memory/notebook';
import { useCode } from '../ui/store';

const EXAMPLE = `Assets/Scripts/Player.cs(12,23): error CS1002: ; expected
NullReferenceException: Object reference not set to an instance of an object
Player.Update () (at Assets/Scripts/Player.cs:20)
Assets/Scripts/Player.cs(7,9): error CS1612: Cannot modify the return value of 'Transform.position' because it is not a variable`;

export function ErrorTranslator() {
  const [text, setText] = useState('');
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aiOn = useAi((s) => s.enabled);
  const addNote = useNotebook((s) => s.add);
  const toast = useCode((s) => s.toast);
  const cards = useMemo(() => translateErrors(text), [text]);

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast('info', tr('Press Ctrl+V in the box.', 'Нажми Ctrl+V в поле.'));
    }
  };

  const askAiAbout = async () => {
    setBusy(true);
    setAi(null);
    try {
      setAi(await askAi(tr('Explain this programming error to a beginner in 2-4 short sentences and say how to fix it.', 'Объясни эту ошибку программирования новичку в 2–4 коротких предложениях, по-русски, и скажи, как исправить.'), text.slice(0, 3000)));
    } catch (e) {
      setAi(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="et" data-testid="error-translator">
      <h2>
        <Languages size={20} aria-hidden /> {tr('Error translator', 'Переводчик ошибок')}
      </h2>
      <p className="muted">
        {tr(
          `Paste the red text from Unity's Console, Visual Studio, a C++ compiler, Python or a browser. ${ERROR_RULE_COUNT} kinds of errors are known.`,
          `Вставь красный текст из Console Unity, Visual Studio, компилятора C++, Python или браузера. Программа знает ${ERROR_RULE_COUNT} видов ошибок.`,
        )}
      </p>
      <textarea className="et-input" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={tr('Paste the error text here…', 'Вставь сюда текст ошибки…')} data-testid="et-input" spellCheck={false} />
      <div className="ws-row">
        <button className="btn" onClick={() => void paste()}>
          <ClipboardPaste size={15} /> {tr('Paste from clipboard', 'Вставить из буфера')}
        </button>
        <button className="btn ghost" onClick={() => setText(EXAMPLE)} data-testid="et-example">
          {tr('Show an example', 'Показать пример')}
        </button>
        {aiOn && text.trim() ? (
          <button className="btn" onClick={() => void askAiAbout()} disabled={busy}>
            <Bot size={15} /> {busy ? tr('AI is thinking…', 'ИИ думает…') : tr('Ask the local AI too', 'Спросить ещё и локальный ИИ')}
          </button>
        ) : null}
      </div>
      {text.trim() && !cards.length ? (
        <p className="et-none" data-testid="et-none">
          {tr('This text does not look like a known error. Copy the whole red line (with the error code, for example CS0103).', 'Этот текст не похож на знакомую ошибку. Скопируй всю красную строку целиком (с кодом ошибки, например CS0103).')}
        </p>
      ) : null}
      <div className="et-cards">
        {cards.map((c, i) => {
          const t = errorText(c.info);
          return (
            <article key={i} className="et-card" data-testid="et-card">
              <header>
                <span className="pill">{c.info.source}</span> <b>{t.title}</b> <code>{c.info.id}</code>
              </header>
              {c.where ? <p className="muted small">📍 {c.where}</p> : null}
              <p className="et-raw">
                <code>{c.line}</code>
              </p>
              <p>
                <b>{tr('What it means:', 'Что это значит:')}</b> {t.meaning}
              </p>
              <p>
                <b>{tr('How to fix:', 'Как исправить:')}</b> {t.fix}
              </p>
              {c.info.example ? (
                <div className="et-example">
                  <div>
                    <span className="bad">✗</span> <code>{c.info.example.bad}</code>
                  </div>
                  <div>
                    <span className="good">✓</span> <code>{c.info.example.good}</code>
                  </div>
                </div>
              ) : null}
              <button
                className="btn small ghost"
                onClick={() => {
                  addNote({ title: `${c.info.id}: ${t.title}`, text: `${t.meaning}\n${tr('Fix', 'Исправление')}: ${t.fix}`, source: tr('Error translator', 'Переводчик ошибок') });
                  toast('info', tr('Saved to the notebook ⭐', 'Сохранено в блокнот ⭐'));
                }}
              >
                ⭐ {tr('Save to notebook', 'В блокнот')}
              </button>
            </article>
          );
        })}
      </div>
      {ai ? (
        <div className="ws-ai-answer">
          <span className="pill">{tr('AI guess — may be wrong', 'Догадка ИИ — может ошибаться')}</span>
          <p>{ai}</p>
        </div>
      ) : null}
      <p className="muted small">{pick({ en: 'Nothing is sent anywhere: the translation happens on this computer.', ru: 'Ничего никуда не отправляется: перевод происходит на этом компьютере.' })}</p>
    </div>
  );
}

// Material Foundry desktop app (Electron). Opens the same offline web app in its own window.
// Safety: no Node.js in the page (contextIsolation + sandbox), only the app's own files are
// served (app:// scheme), external links open in the normal browser, new windows are blocked,
// and the only extra ability is talking to an AI server on THIS computer (localhost).
const { app, BrowserWindow, ipcMain, protocol, shell, session, Menu } = require('electron');
const { join } = require('node:path');
const { makeHandler } = require('./server.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLocal(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

ipcMain.handle('mf:ai-request', async (_e, req) => {
  if (!req || typeof req.url !== 'string' || !isLocal(req.url)) return { status: 400, body: 'Only addresses on this computer are allowed.' };
  if (req.method !== 'GET' && req.method !== 'POST') return { status: 400, body: 'Bad method' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(req.url, { method: req.method, body: req.body, headers: req.body ? { 'Content-Type': 'application/json' } : undefined, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 2_000_000) };
  } catch (err) {
    return { status: 502, body: `Cannot reach the local AI: ${err && err.message ? err.message : err}` };
  } finally {
    clearTimeout(timer);
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#16191f',
    title: 'Material Foundry',
    icon: join(__dirname, 'app', 'favicon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  void win.loadURL('app://local/index.html');
  if (process.argv.includes('--smoke-test')) smokeTest(win);
}

/** Used by the Windows build check: opens the app, the code module and the C# runner, then exits. */
function smokeTest(win) {
  const fail = (why) => {
    console.error(`SMOKE FAIL: ${why}`);
    app.exit(1);
  };
  const timer = setTimeout(() => fail('timeout'), 90000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const wait = async (sel) => { for (let i = 0; i < 300; i++) { const e = document.querySelector(sel); if (e) return e; await new Promise((r) => setTimeout(r, 100)); } throw new Error('missing ' + sel); };
        (await wait('[data-testid="mode-code"]')).click();
        (await wait('[data-testid="start-workshop"]')).click();
        await wait('[data-testid="ws-editor"] .cm-content');
        const pyodide = (await fetch('app://local/pyodide/pyodide-lock.json')).ok;
        const grammar = (await fetch('app://local/grammars/tree-sitter-c_sharp.wasm')).ok;
        return { pyodide, grammar };
      })()`);
      clearTimeout(timer);
      if (!result.pyodide || !result.grammar) return fail(JSON.stringify(result));
      console.log('SMOKE OK', JSON.stringify(result));
      app.exit(0);
    } catch (e) {
      fail(e && e.message ? e.message : String(e));
    }
  });
}

app.whenReady().then(() => {
  protocol.handle('app', makeHandler(join(__dirname, 'app')));
  // Nothing in the app needs the camera, microphone, location or notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['clipboard-sanitized-write', 'clipboard-read', 'fileSystem'].includes(permission)));
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

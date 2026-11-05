// The only bridge between the web page and the computer: asking a LOCAL AI server (Ollama,
// LM Studio…). The page cannot reach files, processes or the internet through it.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mfDesktop', {
  platform: 'desktop',
  aiRequest: (req) => ipcRenderer.invoke('mf:ai-request', { url: String(req.url), method: String(req.method), body: req.body === undefined ? undefined : String(req.body) }),
});

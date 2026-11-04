// Local launcher for Material Foundry / Understand Code using Node.js (any OS).
// Serves the app folder on 127.0.0.1 only and opens the browser. Stop with Ctrl+C.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const APP = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

if (!existsSync(join(APP, 'index.html'))) {
  console.log("The 'app' folder was not found next to this launcher. Please unpack the whole ZIP first.");
  process.exit(1);
}

const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/') path = '/index.html';
  const full = normalize(join(APP, path));
  if (!full.startsWith(APP + sep) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(full).pipe(res);
});

let port = 8765;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port < 8785) server.listen(++port, '127.0.0.1');
  else throw e;
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${port}/${process.argv.includes('--materials') ? '' : '#code'}`;
  console.log('Material Foundry is running:', url);
  console.log('Программа запущена:', url);
  console.log('Press Ctrl+C to stop. / Чтобы остановить, нажмите Ctrl+C.');
  if (!process.argv.includes('--no-browser')) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.listen(port, '127.0.0.1');

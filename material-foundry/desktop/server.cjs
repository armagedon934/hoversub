// Serves the bundled web app from the "app" folder through the private app:// scheme.
// Only files inside that folder can be read; everything is local.
const { readFile } = require('node:fs/promises');
const { join, normalize, extname, sep } = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
};

// Code typed in the Workshop runs in workers; JavaScript needs 'unsafe-eval' and Python
// (WebAssembly) needs 'wasm-unsafe-eval'. No remote origins are allowed at all.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

function makeHandler(root) {
  const base = normalize(root + sep);
  return async (request) => {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(base)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await readFile(file);
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
      if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
      return new Response(data, { status: 200, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { makeHandler, CSP, TYPES };

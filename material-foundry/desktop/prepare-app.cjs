// Copies the built web app (../dist, made by "npm run build" in the main folder) into ./app,
// which electron-builder packs into the installer.
const { cpSync, existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const dist = join(__dirname, '..', 'dist');
const app = join(__dirname, 'app');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('Build the web app first: run "npm run build" in the main folder.');
  process.exit(1);
}
rmSync(app, { recursive: true, force: true });
cpSync(dist, app, { recursive: true });
console.log('Copied the web app into desktop/app');

// Makes build/icon.png (256 px) and build/icon.ico (16–256 px, PNG-compressed) from the app's
// favicon.svg, using the Chromium that Playwright provides. Run once: node desktop/make-icons.cjs
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const svg = readFileSync(join(__dirname, '..', 'public', 'favicon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }));
  }
  await browser.close();
  writeFileSync(join(__dirname, 'build', 'icon.png'), pngs[pngs.length - 1]);
  // ICO = header + directory + PNG images.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const s = sizes[i];
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16);
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16 + 1);
    dir.writeUInt8(0, i * 16 + 2);
    dir.writeUInt8(0, i * 16 + 3);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(p.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += p.length;
  });
  writeFileSync(join(__dirname, 'build', 'icon.ico'), Buffer.concat([header, dir, ...pngs]));
  console.log('icons written');
})();

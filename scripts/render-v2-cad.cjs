#!/usr/bin/env node
/* Capture the production CAD studio. Run finish-v2-cad.py to verify and encode. */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const repository = path.resolve(__dirname, '..');
const output = path.join(repository, 'assets/images/v2');
const baseURL = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const sourcePaths = [
  'assets/models/framework-esp32/framework-board.glb',
  'assets/models/framework-esp32/framework-usbc.glb',
  'assets/models/framework-esp32/framework-markings-silk.svg',
  'assets/models/tramtrace/tramtrace-kicad-source.glb',
  'assets/images/interactive/tramtrace/tramtrace-front-silk.svg'
];
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(repository, file))).digest('hex');

async function main() {
  const sourceHashes = sourcePaths.map(digest);
  fs.mkdirSync(output, { recursive: true });

  // Retain every source silk path. Crop to the existing board bounds and change
  // black plot ink to the white ink used by the assembled display.
  const silkSource = fs.readFileSync(path.join(repository, sourcePaths[4]), 'utf8');
  const sourceViewport = 'width="223.7486mm" height="111.1758mm" viewBox="0.0000 0.0000 223.7486 111.1758"';
  assert.ok(silkSource.includes(sourceViewport), 'TramTrace source viewport changed; check board registration before rendering.');
  const silk = silkSource
    .replace(sourceViewport, 'width="2400" height="1092" viewBox="5.6897 1.11 207.81 94.55"')
    .replaceAll('#000000', '#e8e4d9')
    .replace(/[ \t]+$/gm, '').trimEnd() + '\n';
  fs.writeFileSync(path.join(output, 'tramtrace-silk.svg'), silk);

  const options = { headless: true, args: ['--enable-unsafe-swiftshader'] };
  if (process.env.CHROMIUM_EXECUTABLE) options.executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    for (const model of ['framework', 'tramtrace']) {
      errors.length = 0;
      const url = new URL('/v2/render/', baseURL);
      url.searchParams.set('model', model);
      const response = await page.goto(url.href, { waitUntil: 'load' });
      assert.ok(response?.ok(), `Studio page failed: ${url.href}`);
      await page.waitForFunction(() => ['ready', 'unavailable'].includes(document.querySelector('[data-cad-hero]')?.dataset.cadState), null, { timeout: 60000 });
      assert.equal(await page.locator('[data-cad-hero]').getAttribute('data-cad-state'), 'ready', `${model} CAD could not load; existing WebP is unchanged.`);
      assert.equal(await page.locator('[data-cad-hero]').getAttribute('data-cad-source'), 'kicad-glb');
      assert.deepEqual(errors, [], `${model} studio reported a browser error`);
      await page.locator('[data-cad-canvas]').screenshot({ path: path.join(output, `${model}-cad.png`), omitBackground: true });
      console.log(`Captured ${model}-cad.png (1600 x 1200, transparent).`);
    }
  } finally {
    await browser.close();
    assert.deepEqual(sourcePaths.map(digest), sourceHashes, 'A source CAD or silk file changed during capture.');
  }
  console.log('Original source files unchanged. Next: python scripts/finish-v2-cad.py');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

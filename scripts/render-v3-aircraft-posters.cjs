/* Render responsive posters from the production scene, camera and lighting.
 * Requires the local site server, Playwright, and optional CHROMIUM_EXECUTABLE.
 * The capture query exposes deterministic poses without changing normal visits. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.V3_BASE_URL || 'http://127.0.0.1:8080';
const output = path.resolve(__dirname, '../assets/images/v3');
const evidence = path.resolve(__dirname, '../.codex-temp/aircraft-final');
(async () => {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    for (const [suffix, viewport] of [['', { width: 1600, height: 1076 }], ['-mobile', { width: 390, height: 834 }]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/v3/?capture=posters', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__v3Aircraft, null, { timeout: 120000 });
      const poses = [{ name: 'approach', type: 'Landing', value: 0 }, { name: 'stopped', type: 'Progress', value: 0 }, { name: 'unwrapping', type: 'Progress', value: .20 }, { name: 'open', type: 'Progress', value: .43 }, { name: 'telemetry', type: 'Progress', value: 1 }];
      for (const pose of poses) {
        await page.evaluate(({ type, value }) => window.__v3Aircraft['seek' + type](value), pose);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForTimeout(450);
        if (pose.name === 'approach' || pose.name === 'stopped') {
          const data = await page.evaluate(() => {
            const { renderer, scene, camera } = window.__v3Aircraft;
            renderer.render(scene, camera);
            return { url: renderer.domElement.toDataURL('image/webp', .93), width: renderer.domElement.width, height: renderer.domElement.height };
          });
          const file = `skylabs-${pose.name}${suffix}.webp`;
          fs.writeFileSync(path.join(output, file), Buffer.from(data.url.split(',')[1], 'base64'));
          console.log(`${file}: ${data.width} × ${data.height}, ${fs.statSync(path.join(output, file)).size} bytes`);
        }
        await page.screenshot({ path: path.join(evidence, `${pose.name}${suffix}.png`) });
      }
      if (errors.length) throw new Error(errors.join('\n'));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

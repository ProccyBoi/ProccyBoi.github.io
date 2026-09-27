/* Render the Pi card with the same geometry, materials and camera as its inspector. */
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const repository = path.resolve(__dirname, '..');
  const fragment = await fs.readFile(path.join(repository, 'scripts/content/framework-raspberry-pi.html'), 'utf8');
  const viewer = fragment.match(/<figure data-pi-inspector>[\s\S]*?<\/figure>/)[0].replace('data-pi-inspector', 'data-pi-inspector data-pi-capture');
  const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await page.route('**/__pi_capture__', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/v2-pi.css"><style>html,body{margin:0;background:transparent}[data-pi-inspector]{background:transparent;border:0;border-radius:0}.pi-stage{width:1600px;height:1200px;background:transparent}.pi-viewer-topline,.pi-controls,.pi-status,.pi-parts,.pi-part-detail{display:none!important}</style></head><body>${viewer}<script src="/assets/v2-pi.js"></script></body></html>` }));
    await page.goto(`${base}/__pi_capture__`);
    await page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piState === 'ready');
    await page.waitForFunction(() => Number(document.querySelector('[data-pi-inspector]').dataset.piFrames) >= 2);
    const output = path.join(repository, 'assets/images/v2/framework-pi-cad.png');
    await page.locator('[data-pi-canvas]').screenshot({ path: output, omitBackground: true });
    console.log(`Rendered ${output}`);
    console.log('Convert the verified PNG with python scripts/finish-framework-pi.py.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const url = `${base}/v2/projects/framework-raspberry-pi/`;
const root = '[data-pi-inspector]';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const output = path.resolve(__dirname, '../.codex-temp/pi-qa'); await fs.mkdir(output, { recursive: true });
  const ready = page => page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piState === 'ready');
  const idle = page => page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piMotion === 'idle');
  const state = page => page.locator(root).evaluate(el => ({ ...el.dataset }));
  const settle = async page => { await idle(page); await page.waitForTimeout(100); const a = (await state(page)).piFrames; await page.waitForTimeout(250); assert.equal((await state(page)).piFrames, a, 'Viewer must stop rendering when idle'); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
    const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/framework-pi.*\.(glb|stl)/.test(r.url())) requests.push(r.url()); });
    await page.goto(url); assert.equal(requests.length, 0, 'Geometry must remain on demand');
    assert.equal((await state(page)).piState, 'poster');
    await page.locator('[data-pi-start]').click(); await ready(page); await settle(page);
    assert.equal(requests.length, 3); assert.equal((await state(page)).piComponents, '33');
    await page.locator(root).screenshot({ path: path.join(output, 'assembled.png') });
    assert.equal(await page.locator('[data-pi-explode]').evaluate(button => { button.click(); return button.closest('[data-pi-inspector]').dataset.piMotion; }), 'transition');
    await idle(page); assert.equal((await state(page)).piProgress, '1.000'); await settle(page);
    await page.locator(root).screenshot({ path: path.join(output, 'exploded.png') });
    await page.locator('[data-pi-part="U5"]').click(); assert.equal((await state(page)).piSelection, 'U5');
    assert.match(await page.locator('[data-pi-part-name]').innerText(), /RP2354B/);
    await page.locator('[data-pi-shell]').click(); assert.equal(await page.locator('[data-pi-shell]').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-pi-view="top"]').click(); assert.equal((await state(page)).piAngle, 'top'); await settle(page);
    await page.locator('[data-pi-explode]').click(); await idle(page); assert.equal((await state(page)).piProgress, '0.000'); await settle(page);
    await page.locator('[data-pi-canvas]').press('ArrowRight'); assert.equal((await state(page)).piAngle, 'custom'); await settle(page);
    await page.locator('[data-pi-canvas]').press('Home'); await settle(page); assert.equal((await state(page)).piAngle, 'iso');
    await page.setViewportSize({ width: 1440, height: 650 }); await page.locator('[data-pi-explode]').evaluate(button => { const spacer = document.createElement('div'); spacer.style.height = '2000px'; document.body.prepend(spacer); button.click(); window.scrollTo({ top: 0, behavior: 'instant' }); }); await page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piMotion === 'paused');
    assert.equal((await state(page)).piMotion, 'paused'); const paused = (await state(page)).piFrames; await page.waitForTimeout(200); assert.equal((await state(page)).piFrames, paused);
    await page.locator('[data-pi-canvas]').scrollIntoViewIfNeeded(); await settle(page); assert.equal((await state(page)).piProgress, '1.000');
    await page.locator('[data-pi-canvas]').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal((await state(page)).piState, 'unavailable'); assert.equal(await page.locator('[data-pi-poster]').isVisible(), true);
    const failed = (await state(page)).piFrames; await page.waitForTimeout(250); assert.equal((await state(page)).piFrames, failed); assert.deepEqual(errors, []);
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await mobile.goto(url); await mobile.locator('[data-pi-start]').click(); await ready(mobile); await settle(mobile);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile overflow');
    assert.match(await mobile.locator('[data-pi-canvas]').evaluate(el => getComputedStyle(el).touchAction), /pan-y/);
    await mobile.locator('[data-pi-explode]').click(); await mobile.waitForTimeout(70); assert.equal((await state(mobile)).piMotion, 'idle'); assert.equal((await state(mobile)).piProgress, '1.000'); await settle(mobile);
    await mobile.locator(root).screenshot({ path: path.join(output, 'mobile.png') }); await mobile.close();

    const failure = await browser.newPage(); await failure.route('**/framework-pi-board.glb', r => r.abort());
    await failure.goto(url); await failure.locator('[data-pi-start]').click(); await failure.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piState === 'unavailable');
    assert.equal(await failure.locator('[data-pi-poster]').isVisible(), true); await failure.close();
    console.log('PASS: on-demand geometry; 33 components; explode/reassemble; idle; camera; keyboard; component selection; shell; offscreen pause/resume; context loss; mobile; reduced motion; failed model fallback.');
    console.log(`Visual checks: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Archived prototype PCB acceptance checks, separate from verify-dash-device.cjs.
 * The current enclosure/device viewer retains its own acceptance suite.
 * Requires Playwright and a preview.
 * DASH_BASE_URL, DASH_SCREENSHOTS and CHROMIUM_EXECUTABLE are optional. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.DASH_BASE_URL || 'http://127.0.0.1:8765';
const screenshots = process.env.DASH_SCREENSHOTS;
const routes = ['/projects/dash/', '/v2/projects/dash/'];

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined});
  const errors = [];
  const watch = page => page.on('pageerror', error => errors.push(error.message));
  const rootSelector = '[data-dash-assembly]';
  const ready = async page => {
    // This archived PCB viewer sits below the current full-device assembly.
    // Its source geometry is deliberately lazy-loaded on viewport entry.
    await page.locator('#prototype [data-assembly-stage]').scrollIntoViewIfNeeded();
    await page.locator('#prototype [data-dash-assembly-state="ready"]').waitFor({timeout: 30000});
  };
  const settled = page => page.waitForFunction(() => document.querySelector('[data-dash-assembly]').dataset.assemblyMotion === 'idle');
  const shot = async (page, name, fullPage = false) => {
    if (screenshots) await page.screenshot({path: path.join(screenshots, name + '.png'), fullPage});
  };
  try {
    if (screenshots) await fs.mkdir(screenshots, {recursive: true});
    const context = await browser.newContext({reducedMotion: 'no-preference', viewport: {width: 1440, height: 1100}});
    const page = await context.newPage(); watch(page);
    for (const route of routes) {
      await page.goto(base + route, {waitUntil: 'networkidle'});
      await ready(page);
      const root = page.locator(rootSelector);
      const canvas = root.locator('canvas');
      await root.locator('[data-assembly-stage]').scrollIntoViewIfNeeded();
      assert.equal(await canvas.isVisible(), true);
      assert.equal(await root.locator('[data-assembly-poster]').isVisible(), false);
      assert.equal(await root.locator('.dash-assembly__group').count(), 4);
      await settled(page);
      assert.equal(await root.getAttribute('data-assembly-progress'), '100');
      await page.waitForTimeout(150);
      const idleFrames = await root.getAttribute('data-assembly-frames');
      await page.waitForTimeout(400);
      assert.equal(await root.getAttribute('data-assembly-frames'), idleFrames, 'Rendering stops after assembly');
      const prefix = route.startsWith('/v2') ? 'dash-v2' : 'dash';
      await root.locator('[data-assembly-stage]').scrollIntoViewIfNeeded();
      await shot(page, prefix + '-prototype-assembly');

      await root.evaluate(node => {
        node.__midpointSeen = false;
        const observer = new MutationObserver(() => {
          const value = Number(node.dataset.assemblyProgress);
          if (value > 0 && value < 100) { node.__midpointSeen = true; observer.disconnect(); }
        });
        observer.observe(node, {attributes: true, attributeFilter: ['data-assembly-progress']});
      });
      await root.getByRole('button', {name: 'Exploded', exact: true}).click();
      await settled(page);
      assert.equal(await root.evaluate(node => node.__midpointSeen), true, 'Explode has intermediate animated positions');
      assert.equal(await root.getAttribute('data-assembly-progress'), '0');
      await shot(page, prefix + '-exploded');
      await root.getByRole('button', {name: 'Assembled', exact: true}).click();
      await settled(page);
      assert.equal(await root.getAttribute('data-assembly-progress'), '100');

      for (const name of ['Top', 'Bottom', 'Isometric']) {
        await root.getByRole('button', {name, exact: true}).click();
        await settled(page);
        assert.equal(await root.getByRole('button', {name, exact: true}).getAttribute('aria-pressed'), 'true');
        if (name === 'Top') await shot(page, prefix + '-top');
      }
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await root.getAttribute('data-assembly-view'), 'custom');
      await page.keyboard.press('Home');
      assert.equal(await root.getAttribute('data-assembly-view'), 'iso');

      const slider = root.getByRole('slider', {name: 'Assembly progress'});
      await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
      assert.equal(await root.getAttribute('data-assembly-progress'), '1');
      await root.locator('[data-assembly-play]').click();
      await page.waitForTimeout(450);
      await root.locator('[data-assembly-play]').click();
      await page.waitForTimeout(80);
      const paused = await root.getAttribute('data-assembly-progress');
      await page.waitForTimeout(350);
      assert.equal(await root.getAttribute('data-assembly-progress'), paused, 'Pause holds assembly position');
      await root.locator('[data-assembly-play]').click();
      await page.evaluate(() => scrollTo({top: document.body.scrollHeight, behavior: 'instant'}));
      await page.waitForTimeout(150);
      const offscreenFrames = await root.getAttribute('data-assembly-frames');
      await page.waitForTimeout(400);
      assert.equal(await root.getAttribute('data-assembly-frames'), offscreenFrames, 'Offscreen assembly does not render');
      await root.locator('[data-assembly-stage]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.ok(Number(await root.getAttribute('data-assembly-frames')) > Number(offscreenFrames), 'Visible assembly resumes');
      await root.getByRole('button', {name: 'Assembled', exact: true}).click(); await settled(page);

      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({width, height: 1000});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}: overflow at ${width}px`);
      }
      await page.setViewportSize({width: 390, height: 844});
      await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
      await shot(page, prefix + '-assembly-mobile', true);
      await page.setViewportSize({width: 1440, height: 1100});
      console.log(`PASS ${route}: source model, finite assembly/explode/camera motion, scrub, keyboard, pause, offscreen suspension, 4 widths`);
    }
    await context.close();

    const reduced = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 1000}});
    const reducedPage = await reduced.newPage(); watch(reducedPage);
    await reducedPage.goto(base + routes[1]); await ready(reducedPage);
    const reducedRoot = reducedPage.locator(rootSelector);
    assert.equal(await reducedRoot.getAttribute('data-assembly-progress'), '100');
    await reducedRoot.getByRole('button', {name: 'Exploded', exact: true}).click();
    assert.equal(await reducedRoot.getAttribute('data-assembly-progress'), '0');
    await reducedPage.emulateMedia({reducedMotion: 'no-preference'});
    await reducedRoot.locator('[data-assembly-play]').click();
    await reducedPage.waitForTimeout(200);
    await reducedPage.emulateMedia({reducedMotion: 'reduce'});
    await settled(reducedPage);
    assert.equal(await reducedRoot.getAttribute('data-assembly-progress'), '100');
    await reducedPage.locator('canvas[data-assembly-canvas]').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true})));
    assert.equal(await reducedRoot.getAttribute('data-dash-assembly-state'), 'unavailable');
    assert.equal(await reducedRoot.locator('[data-assembly-poster]').isVisible(), true);
    await reduced.close();

    const fallback = await browser.newContext({viewport: {width: 390, height: 844}});
    await fallback.route('**/dash-prototype.glb', route => route.abort());
    const fallbackPage = await fallback.newPage(); watch(fallbackPage);
    await fallbackPage.goto(base + routes[1]);
    await fallbackPage.locator('#prototype [data-assembly-stage]').scrollIntoViewIfNeeded();
    await fallbackPage.locator('[data-dash-assembly-state="unavailable"]').waitFor();
    assert.equal(await fallbackPage.locator('[data-assembly-poster]').isVisible(), true);
    assert.equal(await fallbackPage.locator('[data-assembly-controls]').isVisible(), false);
    await fallback.close();
    const noJS = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
    const staticPage = await noJS.newPage();
    await staticPage.goto(base + routes[1]);
    await staticPage.locator('#prototype [data-assembly-stage]').scrollIntoViewIfNeeded();
    assert.equal(await staticPage.locator('[data-assembly-poster]').isVisible(), true);
    assert.equal(await staticPage.locator('[data-assembly-controls]').isVisible(), false);
    await noJS.close();
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS reduced-motion startup/live toggle, context loss, failed model, no-JS photo fallback and zero JavaScript errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

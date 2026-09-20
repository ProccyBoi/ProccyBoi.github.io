/* CAD camera acceptance tests. Requires Playwright and a local static server.
 * Optional: V2_BASE_URL and CHROMIUM_EXECUTABLE, as in render-v2-cad.cjs. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader']
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/v2/');
    const hero = page.locator('[data-cad-hero]');
    const canvas = page.locator('[data-cad-canvas]');
    const idle = () => page.waitForFunction(() => document.querySelector('[data-cad-hero]').dataset.cadMotion === 'idle');
    const pose = async () => (await hero.getAttribute('data-cad-orbit')).split(',').map(Number);
    await page.locator('[data-cad-start]').click();
    await page.waitForFunction(() => document.querySelector('[data-cad-hero]').dataset.cadState === 'ready', null, { timeout: 60000 });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-cad-hero]').dataset.cadOrbit));

    const initial = await pose();
    const initialFrames = Number(await hero.getAttribute('data-cad-frames'));
    const selection = await page.evaluate(() => {
      document.querySelector('[data-cad-view="top"]').click();
      return { motion: document.querySelector('[data-cad-hero]').dataset.cadMotion, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    assert.equal(await hero.getAttribute('data-cad-angle'), 'top', 'Preset selection updates synchronously');
    assert.equal(selection.motion, 'transition', JSON.stringify(selection));
    const intermediate = await page.waitForFunction(() => {
      const root = document.querySelector('[data-cad-hero]');
      const pose = root.dataset.cadOrbit.split(',').map(Number);
      return root.dataset.cadMotion === 'transition' && pose[1] > 45 && pose[1] < 88 ? pose : false;
    });
    const middle = await intermediate.jsonValue();
    assert.ok(middle[1] > initial[1] && middle[1] < 89.8, 'Intermediate camera pose is rendered');
    await idle();
    const top = await pose();
    assert.equal(top[1], 89.8);
    assert.ok(Number(await hero.getAttribute('data-cad-frames')) > initialFrames + 2);
    const settledFrames = await hero.getAttribute('data-cad-frames');
    await page.waitForTimeout(850);
    assert.equal(await hero.getAttribute('data-cad-frames'), settledFrames, 'No frames are rendered after the transition settles');
    console.log('PASS: smooth intermediate poses, exact final preset, synchronous selection, idle rendering stops');

    // Rotate past a full revolution, then ask for the top view. The orbit must
    // take the short route to the equivalent angle rather than unwind 400°.
    await canvas.focus();
    await canvas.evaluate((element) => {
      for (let index = 0; index < 40; index += 1) element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    await page.waitForFunction(() => Number(document.querySelector('[data-cad-hero]').dataset.cadOrbit.split(',')[0]) > 390);
    const rotated = await pose();
    await page.locator('[data-cad-view="top"]').click();
    await idle();
    const shortest = await pose();
    assert.ok(Math.abs(shortest[0] - rotated[0]) < 180, 'Preset uses the shortest yaw path');
    assert.equal(shortest[0] % 360, 0);

    await page.locator('[data-cad-view="side"]').click();
    await canvas.dispatchEvent('keydown', { key: 'ArrowRight' });
    assert.equal(await hero.getAttribute('data-cad-motion'), 'idle', 'Direct keyboard input cancels the preset move');
    assert.equal(await hero.getAttribute('data-cad-angle'), 'custom');
    await page.waitForTimeout(100);
    const interrupted = await pose();
    await page.waitForTimeout(850);
    assert.deepEqual(await pose(), interrupted, 'Canceled move cannot resume behind direct input');
    console.log('PASS: shortest orbit after accumulated rotations, immediate input takeover, no residual movement');

    // Start and scroll away in one event task so even a slow software GPU
    // cannot finish the complete animation before the offscreen observation.
    await page.evaluate(() => {
      document.querySelector('[data-cad-view="iso"]').click();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    });
    await page.waitForFunction(() => document.querySelector('[data-cad-hero]').dataset.cadMotion === 'paused');
    const pausedFrames = await hero.getAttribute('data-cad-frames');
    const pausedPose = await pose();
    await page.waitForTimeout(850);
    assert.equal(await hero.getAttribute('data-cad-frames'), pausedFrames);
    assert.deepEqual(await pose(), pausedPose);
    await canvas.scrollIntoViewIfNeeded();
    await idle();
    assert.equal((await pose())[1], 43);
    console.log('PASS: offscreen move pauses without frames and completes after returning');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-cad-view="top"]').click();
    assert.equal(await hero.getAttribute('data-cad-motion'), 'idle');
    await page.waitForFunction(() => Number(document.querySelector('[data-cad-hero]').dataset.cadOrbit.split(',')[1]) === 89.8);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-cad-view="side"]').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await idle();
    await page.waitForFunction(() => Number(document.querySelector('[data-cad-hero]').dataset.cadOrbit.split(',')[1]) === 12);
    console.log('PASS: reduced motion gives instant presets and settles an in-progress transition');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-cad-view="top"]').click();
    await canvas.evaluate((element) => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      gl.getExtension('WEBGL_lose_context').loseContext();
    });
    await page.waitForFunction(() => document.querySelector('[data-cad-hero]').dataset.cadState === 'unavailable');
    const lostFrames = await hero.getAttribute('data-cad-frames');
    await canvas.dispatchEvent('keydown', { key: 'ArrowLeft' });
    await page.waitForTimeout(850);
    assert.equal(await hero.getAttribute('data-cad-frames'), lostFrames);
    assert.equal(await page.locator('[data-cad-poster]').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: context loss cancels an active transition and restores the poster without browser errors');
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

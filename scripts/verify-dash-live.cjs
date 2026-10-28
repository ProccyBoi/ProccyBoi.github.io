/* Live full-device/character integration acceptance checks.
 * Runs against a local preview of the reviewed repository source, not a claim
 * about the deployed GitHub Pages site. Does not modify production assets.
 * DASH_BASE_URL defaults to http://127.0.0.1:8081. Optional:
 * CHROMIUM_EXECUTABLE, DASH_SCREENSHOTS (screenshots and JSON report).
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.DASH_BASE_URL || 'http://127.0.0.1:8081';
const output = process.env.DASH_SCREENSHOTS;
const report = {source: 'local repository preview', base, routes: [], passed: false};
const liveSelector = '[data-hardware].dash-device-live';

async function instrument(page) {
  await page.route(/\/(?:v3\/)?assets\/v2-hardware\.js(?:\?|$)/, async route => {
    const response = await route.fetch(), body = await response.text();
    const marker = 'renderer.render(scene,camera);';
    assert.ok(body.includes(marker), 'Real viewer render marker exists');
    await route.fulfill({response, body: body.replace(marker,
      'window.__dashLiveQA={model,scene,camera,renderer};' + marker)});
  });
}
async function ready(page, version) {
  await page.goto(`${base}/${version}/projects/dash/`, {waitUntil: 'networkidle'});
  await page.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
  await page.locator(liveSelector).waitFor({timeout: 60000});
  await page.waitForFunction(() => window.__dashLiveQA && document.querySelector('[data-hardware]').dataset.hardwareState === 'ready');
  return page.locator(liveSelector);
}
async function shot(page, root, name) {
  if (!output) return;
  await page.mouse.move(0, 0);
  await root.screenshot({path: path.join(output, name + '.png'),
    style: '.v2-header,.v2-case-nav{visibility:hidden!important}'});
}
async function modelSignature(page) {
  return page.evaluate(() => {
    const list = [];
    window.__dashLiveQA.model.group.traverse(node => list.push({
      id: node.uuid, geometry: node.geometry?.uuid,
      vertices: node.geometry?.attributes.position?.count,
      position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray()
    }));
    return list;
  });
}

(async () => {
  if (output) await fs.mkdir(output, {recursive: true});
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--enable-unsafe-swiftshader']});
  try {
    for (const version of ['v2', 'v3']) {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
      const errors = [], failed = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {if (response.status() >= 400) failed.push({url: response.url(), status: response.status()});});
      await instrument(page);
      const root = await ready(page, version), panel = root.locator('.dash-device-panel');
      const action = panel.locator('[data-device-command="action"]');
      const reset = panel.locator('[data-device-command="reset"]');
      const duration = panel.locator('[data-device-duration]');
      const clock = panel.locator('[data-device-time]');
      const demo = page.locator('[data-dash-demo]');
      const characterAction = demo.locator('[data-dash-action]');
      const characterClock = demo.locator('[data-dash-time]');
      const pixelData = () => panel.locator('canvas').evaluate(canvas => canvas.toDataURL());
      await page.clock.install();
      await page.clock.fastForward(2500);
      assert.equal(await page.evaluate(() => {
        const screen = window.__dashLiveQA.model.group.getObjectByName('Inactive OLED viewing area');
        return screen.material.map.image === document.querySelector('.dash-device-screen canvas');
      }), true, 'The visible framebuffer is the exact texture displayed by the 3D OLED');
      assert.equal(await clock.textContent(), '00:10');
      assert.equal(await reset.isDisabled(), true);

      // A duration selected beside the model is immediately shared with the
      // existing character study; changing it there updates the device too.
      await duration.selectOption('1500');
      assert.equal(await demo.locator('[data-dash-duration]').inputValue(), '1500');
      assert.equal(await clock.textContent(), '25:00');
      await demo.locator('[data-dash-duration]').selectOption('10');
      assert.equal(await duration.inputValue(), '10');
      // Selecting the distant character control scrolls the live OLED offscreen.
      // Bring its panel back before comparing rendered pixels; offscreen output
      // is deliberately suspended until IntersectionObserver resumes it.
      await panel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100); await page.clock.runFor(100);
      const idlePixels = await pixelData();
      await action.focus(); await page.keyboard.press('Enter');
      assert.equal(await characterAction.textContent(), 'Pause');
      assert.equal(await duration.isDisabled(), true);
      await page.clock.fastForward(3100);
      assert.match(await clock.textContent(), /^00:0[67]$/);
      assert.equal(await clock.textContent(), await characterClock.textContent());
      assert.notEqual(await pixelData(), idlePixels, 'Starting focus changes the real OLED output');

      await characterAction.click();
      assert.equal(await action.textContent(), 'Resume', 'Pausing in the character study updates the device transport');
      const pausedTime = await clock.textContent();
      await page.clock.fastForward(5000);
      assert.equal(await clock.textContent(), pausedTime, 'Pause freezes the shared countdown');
      await panel.scrollIntoViewIfNeeded();
      await action.click();
      assert.equal(await characterAction.textContent(), 'Pause');
      await page.clock.fastForward(8000);
      assert.equal(await clock.textContent(), '00:00');
      assert.equal(await action.textContent(), 'Start again');
      assert.equal(await characterAction.textContent(), 'Start again');
      assert.equal(await root.getAttribute('data-dash-session'), 'rest');
      await reset.click();
      assert.equal(await characterClock.textContent(), '00:10');
      assert.equal(await demo.getAttribute('data-dash-state'), 'idle');

      // Reduced motion settles without an idle WebGL loop. Normal gesture
      // input must alter the shared display without starting a focus timer.
      await page.clock.fastForward(3000);
      await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const idleFrames = await root.getAttribute('data-hardware-frames');
      await page.clock.fastForward(2200); await page.waitForTimeout(100);
      assert.equal(await root.getAttribute('data-hardware-frames'), idleFrames, 'Reduced-motion idle settles without continuous renders');
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await panel.scrollIntoViewIfNeeded();
      const beforeGesture = await pixelData();
      await panel.locator('[data-device-gesture="shake"]').click();
      assert.equal(await demo.getAttribute('data-dash-reaction'), 'shake');
      await page.clock.runFor(160);
      assert.notEqual(await pixelData(), beforeGesture, 'Shake changes the actual framebuffer');
      assert.equal(await clock.textContent(), '00:10', 'Gestures do not start or reset a timer');
      await page.clock.runFor(2200);
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.clock.fastForward(1000);

      // Shell inspection is reversible and changes visibility only.
      const geometryBefore = await modelSignature(page);
      await root.locator('[data-device-shell]').click();
      assert.equal(await page.evaluate(() => window.__dashLiveQA.model.parts.filter(part => part.object.userData.sourceFile).every(part => !part.object.visible)), true);
      await root.locator('[data-device-shell]').click();
      assert.deepEqual(await modelSignature(page), geometryBefore, 'Showing the shell restores the same source model transforms and geometry');
      const rotations = [];
      for (const name of ['front', 'rear', 'angled']) {
        const framesBeforeView = Number(await root.getAttribute('data-hardware-frames'));
        await root.locator(`[data-device-view="${name}"]`).click();
        await page.clock.runFor(80);
        await page.waitForFunction(before => Number(document.querySelector('[data-hardware]').dataset.hardwareFrames) > before, framesBeforeView);
        assert.equal(await root.locator(`[data-device-view="${name}"]`).getAttribute('aria-pressed'), 'true');
        rotations.push(await page.evaluate(() => window.__dashLiveQA.model.group.rotation.toArray().slice(0, 3)));
      }
      assert.notDeepEqual(rotations[0], rotations[1], 'Front and rear inspect different sides');
      assert.notDeepEqual(rotations[0], rotations[2], 'Angled view restores an oblique inspection');

      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({width, height: width === 1440 ? 1000 : 844});
        await root.scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${version}: no horizontal overflow at ${width}px`);
        for (const control of [action, duration, panel.locator('[data-device-gesture="shake"]')]) {
          assert.equal(await control.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.width > 0;
          }), true, `${version}: controls fit at ${width}px`);
        }
        if (width !== 320) await shot(page, root, `${version}-live-${width === 1440 ? 'desktop' : 'mobile'}`);
      }

      await page.setViewportSize({width: 1440, height: 1000});
      await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
      await duration.selectOption('1500'); await action.click();
      await page.evaluate(() => scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
      await page.waitForTimeout(200);
      const offscreenFrames = await root.getAttribute('data-hardware-frames');
      await page.clock.fastForward(4000); await page.waitForTimeout(100);
      assert.equal(await root.getAttribute('data-hardware-frames'), offscreenFrames, 'Offscreen live device stops WebGL drawing while its session continues');
      await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
      assert.equal(await clock.textContent(), await characterClock.textContent(), 'Returning to the device reconciles the same session');
      assert.deepEqual(errors, [], 'No browser exceptions');
      assert.deepEqual(failed, [], 'No failed page/model assets');
      report.routes.push({version,sharedFramebuffer:true,bidirectionalControls:true,pauseResume:true,completion:true,gesturePixels:true,sourceTransformsPreserved:true,cameraViews:true,responsiveWidths:[1440,390,320],reducedMotionIdle:true,offscreenPaused:true,errors,failed});
      await page.close();
    }
    report.passed = true;
  } catch (error) {
    report.error = error.stack;
    throw error;
  } finally {
    await browser.close();
    if (output) await fs.writeFile(path.join(output, 'live-bridge-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});

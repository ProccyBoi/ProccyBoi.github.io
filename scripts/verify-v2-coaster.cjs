/* Coaster assembly interaction and original-page compatibility. Requires a static server. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const root = '[data-coaster-inspector]', stage = '[data-coaster-stage]';
const manifest = require('../assets/models/coaster/manifest.json');
async function instrument(context) {
  await context.addInitScript(() => {
    let explorer;
    Object.defineProperty(window, 'PortfolioExplorer', { configurable: true, get: () => explorer, set: value => {
      explorer = value;
      const create = value.createRenderer;
      value.createRenderer = function (...args) {
        args[1].preserveDrawingBuffer = true;
        const renderer = create(...args);
        if (renderer) {
          const render = renderer.render.bind(renderer);
          renderer.render = (scene, camera) => {
            window.__coaster = { scene, camera };
            if (window.__coasterTrace) {
              const frame = {};
              scene.traverse(object => { if (object.isGroup && object.userData.spec) frame[object.userData.spec.key] = object.position.toArray(); });
              window.__coasterTrace.push(frame);
            }
            return render(scene, camera);
          };
        }
        return renderer;
      };
    } });
  });
}
async function idle(page) {
  // Initial sensor debounce and resize observers may schedule one final frame.
  await page.waitForTimeout(1000);
  try { await page.waitForFunction(() => document.querySelector('[data-coaster-inspector]').dataset.explorerMotion === 'idle', null, { timeout: 45000 }); }
  catch (error) { console.error(await page.evaluate(() => ({ root: { ...document.querySelector('[data-coaster-inspector]').dataset }, rect: document.querySelector('[data-coaster-stage]').getBoundingClientRect().toJSON(), scrollY, innerHeight }))); throw error; }
  const frames = await page.locator(root).getAttribute('data-coaster-frames');
  await page.waitForTimeout(300);
  assert.equal(await page.locator(root).getAttribute('data-coaster-frames'), frames, 'Idle assembly stops rendering');
}
async function poses(page) {
  return page.evaluate(() => {
    const result = {};
    window.__coaster.scene.traverse(object => { if (object.isGroup && object.userData.spec) result[object.userData.spec.key] = { p: object.position.toArray(), q: object.quaternion.toArray() }; });
    return result;
  });
}
async function bounds(page) {
  return page.evaluate(() => {
    const { scene, camera } = window.__coaster, point = new THREE.Vector3(), bounds = [Infinity, Infinity, -Infinity, -Infinity];
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!object.isMesh || !object.userData.spec || !object.parent?.userData.spec) return;
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
        bounds[0] = Math.min(bounds[0], point.x); bounds[1] = Math.min(bounds[1], point.y);
        bounds[2] = Math.max(bounds[2], point.x); bounds[3] = Math.max(bounds[3], point.y);
      }
    });
    return bounds;
  });
}
async function point(page, ref, key) {
  const component = manifest.pcb_step_components.find(component => component.ref === ref);
  assert.ok(component, 'Source manifest component ' + ref);
  return page.evaluate(({ component, key }) => {
    const { scene, camera } = window.__coaster, T = THREE;
    let group;
    scene.traverse(object => { if (object.isGroup && object.userData.spec?.key === key) group = object; });
    if (!group) throw Error('Missing geometry group ' + key);
    scene.updateMatrixWorld(true);
    const b = component.bounds_mm;
    const p = new T.Vector3((b[0]+b[3])/2-133.2, (b[1]+b[4])/2+94.59, b[5]-0.03);
    group.localToWorld(p); p.project(camera);
    const rect = document.querySelector('[data-coaster-canvas]').getBoundingClientRect();
    return { x: rect.left+(p.x+1)*rect.width/2, y: rect.top+(1-p.y)*rect.height/2 };
  }, { component, key });
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    await fs.mkdir('.codex-temp/coaster-qa', { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); await instrument(context);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base+'/v2/projects/coaster/', { waitUntil: 'networkidle' }); await page.locator(stage).scrollIntoViewIfNeeded();
    await page.locator('[data-coaster-status].is-ready').waitFor({ state: 'attached' }); await idle(page);
    assert.equal(await page.locator('.coaster-3d-toolbar button:visible').count(), 1);
    assert.equal(await page.locator('.coaster-3d-toolbar select, .coaster-3d-toolbar input').count(), 0);
    assert.equal(await page.locator('[data-coaster-explode]').innerText(), 'Disassemble');
    const original = await poses(page); assert.equal(Object.keys(original).length, 14);
    await page.locator(stage).screenshot({ path: '.codex-temp/coaster-qa/assembled.png' });
    await page.locator('[data-coaster-explode]').evaluate(button => { window.__coasterTrace = []; button.click(); });
    await idle(page); assert.equal(await page.locator(root).getAttribute('data-coaster-progress'), '1.0000');
    const trace = await page.evaluate(() => { const trace = window.__coasterTrace; delete window.__coasterTrace; return trace; });
    assert.ok(trace.some(frame => JSON.stringify(frame.base) !== JSON.stringify(original.base.p) && JSON.stringify(frame.sht) === JSON.stringify(original.sht.p)), 'Housing releases before sensors');
    const exploded = await poses(page), changed = Object.keys(original).filter(key => key !== 'board');
    const desktopBounds = await bounds(page); console.log('Desktop exploded bounds:', desktopBounds);
    assert.ok(desktopBounds.every(value => Math.abs(value) < .98), 'Desktop physical geometry fits');
    assert.equal(changed.filter(key => JSON.stringify(original[key].p) !== JSON.stringify(exploded[key].p)).length, 13);
    assert.equal(changed.filter(key => JSON.stringify(original[key].q) !== JSON.stringify(exploded[key].q)).length, 13);
    for (const [ref, key] of [['U3','mcu'], ['C7','capacitors'], ['R3','resistors'], ['LED118','leds']]) {
      const hit = await point(page, ref, key); await page.mouse.move(hit.x, hit.y);
      await page.waitForFunction(ref => document.querySelector('[data-coaster-inspector]').dataset.coasterSelection === ref, ref);
      assert.match(await page.locator('[data-coaster-readout]').innerText(), new RegExp(ref));
    }
    await page.locator(stage).screenshot({ path: '.codex-temp/coaster-qa/exploded.png' });
    const stationary = await point(page, 'U3', 'mcu'); await page.mouse.move(stationary.x, stationary.y);
    await page.locator('[data-coaster-explode]').evaluate(button => button.click()); await idle(page);
    assert.notEqual(await page.locator(root).getAttribute('data-coaster-selection'), 'U3', 'Hover follows moving geometry beneath a stationary pointer');
    assert.deepEqual(await poses(page), original, 'Exact reassembly');
    await page.mouse.move(1,1); assert.equal(await page.locator('[data-coaster-readout]').isVisible(), false);
    await page.locator('[data-coaster-vessel="cup"]').click(); await page.waitForFunction(() => document.querySelector('[data-coaster-stage]').dataset.coasterOccupied === 'true');
    assert.equal(await page.locator(stage).getAttribute('data-coaster-lit-pixels'), '24');
    await page.locator('[data-coaster-vessel="none"]').click(); await page.waitForFunction(() => document.querySelector('[data-coaster-stage]').dataset.coasterOccupied === 'false'); await idle(page);
    await context.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }); await instrument(mobile);
    const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base+'/v2/projects/coaster/', { waitUntil: 'networkidle' }); await phone.locator('[data-coaster-status].is-ready').waitFor({ state: 'attached' }); await phone.locator(stage).scrollIntoViewIfNeeded(); await idle(phone);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.match(await phone.locator(stage).evaluate(el => getComputedStyle(el).touchAction), /pan-y/);
    const mobileOriginal = await poses(phone); await phone.locator('[data-coaster-explode]').click(); await idle(phone);
    const mobileBounds = await bounds(phone); console.log('Mobile exploded bounds:', mobileBounds);
    assert.ok(mobileBounds.every(value => Math.abs(value) < .98), 'Mobile physical geometry fits');
    const tap = await point(phone, 'U3', 'mcu'); await phone.touchscreen.tap(tap.x, tap.y);
    assert.equal(await phone.locator(root).getAttribute('data-coaster-selection'), 'U3');
    const readout = await phone.locator('[data-coaster-readout]').boundingBox(), stageBounds = await phone.locator(stage).boundingBox();
    assert.ok(readout.x+readout.width <= stageBounds.x+stageBounds.width && readout.y >= stageBounds.y && readout.y < stageBounds.y+50);
    await phone.locator(stage).screenshot({ path: '.codex-temp/coaster-qa/mobile.png' });
    await phone.locator(stage).press('Escape'); assert.equal(await phone.locator('[data-coaster-readout]').isVisible(), false);
    await phone.locator('[data-coaster-explode]').click(); await idle(phone); assert.deepEqual(await poses(phone), mobileOriginal);
    await mobile.close();

    const legacy = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); legacy.on('pageerror', error => errors.push(error.message));
    await legacy.goto(base+'/projects/coaster/'); await legacy.locator(stage).scrollIntoViewIfNeeded(); await legacy.locator('[data-coaster-status].is-ready').waitFor({ state: 'attached' });
    assert.ok(await legacy.locator('[data-coaster-view]').count() >= 3, 'Original page keeps camera controls');
    await legacy.locator('[data-coaster-lid]').click(); assert.equal(await legacy.locator('[data-coaster-lid]').innerText(), 'Show lid');
    await legacy.locator('[data-coaster-explode]').click(); assert.equal(await legacy.locator('[data-coaster-explode]').innerText(), 'Assemble');
    await legacy.locator('[data-coaster-reset]').click(); assert.equal(await legacy.locator('[data-coaster-explode]').innerText(), 'Explode');
    await legacy.close(); assert.deepEqual(errors, []);
    console.log('PASS: one assembly action; 14 CAD groups; stagger, drift and tilt; exact reassembly; chip/passive/LED reference hover; top-right touch identity; mobile, reduced motion, idle; separate cup demo and original-page compatibility.');
    console.log('Visual checks: .codex-temp/coaster-qa');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

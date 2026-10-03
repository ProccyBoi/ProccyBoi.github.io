const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const url = `${base}/v2/projects/framework-raspberry-pi/`;
const root = '[data-pi-inspector]';

// Observe actual Three scenes without adding a testing API to the viewer.
async function observe(page) {
  await page.addInitScript(() => {
    let three;
    Object.defineProperty(window, 'THREE', { configurable: true, get: () => three, set: value => {
      three = value; let Renderer;
      Object.defineProperty(value, 'WebGLRenderer', { configurable: true, get: () => Renderer, set: Original => {
        Renderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = (scene, camera) => {
            if (scene.children.some(child => child.isGroup)) {
              window.__piScene = { scene, camera };
              if (window.__piTrace) { const frame = {}; scene.traverse(object => { if (['Enclosure','M2-1','C1'].includes(object.userData.piRef)) frame[object.userData.piRef] = object.position.toArray(); }); window.__piTrace.push(frame); }
            }
            return render(scene, camera);
          };
          return renderer;
        };
        Renderer.prototype = Original.prototype;
      } });
    } });
  });
}
const poses = page => page.evaluate(() => {
  const result = {};
  window.__piScene.scene.traverse(object => { if (object.userData.piRef) result[object.userData.piRef] = { p: object.position.toArray(), q: object.quaternion.toArray() }; });
  return result;
});
// Find an actually visible triangle of a named part, then exercise native input.
const pickPoint = (page, ref) => page.evaluate(ref => {
  const T = THREE, { scene, camera } = window.__piScene, roots = scene.children.filter(object => object.isGroup), box = new T.Box3(), ray = new T.Raycaster();
  let target; scene.traverse(object => { if (object.userData.piRef === ref) target = object; });
  if (!target) throw new Error('No physical part ' + ref);
  box.setFromObject(target);
  const min = new T.Vector2(Infinity, Infinity), max = new T.Vector2(-Infinity, -Infinity);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new T.Vector3(x, y, z).project(camera); min.min(new T.Vector2(p.x, p.y)); max.max(new T.Vector2(p.x, p.y));
  }
  const rect = document.querySelector('[data-pi-canvas]').getBoundingClientRect();
  for (const fy of [.5,.35,.65,.2,.8,.1,.9]) for (const fx of [.5,.35,.65,.2,.8,.1,.9]) {
    const p = new T.Vector2(T.MathUtils.lerp(min.x, max.x, fx), T.MathUtils.lerp(min.y, max.y, fy));
    if (Math.abs(p.x)>1 || Math.abs(p.y)>1) continue;
    ray.setFromCamera(p, camera);
    const hits = ray.intersectObjects(roots, true).filter(hit => {
      if (!hit.object.isMesh || hit.object.material.map) return false;
      for (let n=hit.object;n;n=n.parent) if (!n.visible) return false;
      return true;
    });
    let object = hits[0]?.object; while (object && !object.userData.piRef) object = object.parent;
    if (object?.userData.piRef === ref) return { x: rect.left + (p.x+1)*rect.width/2, y: rect.top + (1-p.y)*rect.height/2 };
  }
  throw new Error('No visible test point for ' + ref);
}, ref);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const output = path.resolve(__dirname, '../.codex-temp/pi-qa'); await fs.mkdir(output, { recursive: true });
  const ready = page => page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piState === 'ready');
  const idle = page => page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piMotion === 'idle');
  const state = page => page.locator(root).evaluate(el => ({ ...el.dataset }));
  const settle = async page => { await idle(page); await page.waitForTimeout(100); const a = (await state(page)).piFrames; await page.waitForTimeout(250); assert.equal((await state(page)).piFrames, a, 'Viewer must stop rendering when idle'); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' }); await observe(page);
    const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/\/assets\/models\/(?:framework-pi|framework-mechanics)\/.*\.(glb|stl)(?:\?|$)/.test(r.url())) requests.push(r.url()); });
    await page.goto(url); await page.locator('[data-pi-stage]').scrollIntoViewIfNeeded(); await ready(page); await settle(page);
    assert.equal(requests.length, 4); assert.equal((await state(page)).piComponents, '35'); assert.equal((await state(page)).piPickables, '37');
    assert.equal(await page.locator(`${root} button:visible`).count(), 1, 'One normal assembly action');
    assert.equal(await page.locator('[data-pi-explode]').innerText(), 'Disassemble');
    const original = await poses(page); assert.equal(Object.keys(original).length, 37);
    const mechanical = await page.evaluate(() => {
      const result = {}, T = THREE;
      window.__piScene.scene.updateMatrixWorld(true);
      window.__piScene.scene.traverse(object => {
        if (!['Enclosure', 'M2-1', 'M2-2'].includes(object.userData.piRef)) return;
        object.geometry.computeBoundingBox();
        const bounds = new T.Box3().setFromObject(object);
        result[object.userData.piRef] = {
          visible: object.visible, role: object.userData.mechanicalRole,
          position: object.getWorldPosition(new T.Vector3()).toArray(),
          min: bounds.min.toArray(), max: bounds.max.toArray(),
          localMin: object.geometry.boundingBox.min.toArray(), localMax: object.geometry.boundingBox.max.toArray()
        };
      });
      return result;
    });
    const near = (actual, expected, message) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-5, `${message}, axis ${index}: ${value}`));
    assert.equal(mechanical.Enclosure.visible, true); assert.equal(mechanical.Enclosure.role, 'enclosure');
    near(mechanical.Enclosure.min, [-15, 0, -17], 'Original housing minimum');
    near(mechanical.Enclosure.max, [15, 6.8, 15], 'Original housing maximum');
    for (const [ref, x] of [['M2-1', -11.3], ['M2-2', 11.3]]) {
      assert.equal(mechanical[ref].visible, true); assert.equal(mechanical[ref].role, 'screw');
      near(mechanical[ref].position, [x, 3.9, 4.5], 'M2 bearing face seats on native PCB mounting hole');
      near(mechanical[ref].localMin, [-1.75, -3, -1.749994], 'Source screw lower bounds');
      near(mechanical[ref].localMax, [1.75, 0.8, 1.749994], 'Source screw upper bounds');
    }
    await page.locator(root).screenshot({ path: path.join(output, 'assembled.png') });
    await page.locator('[data-pi-explode]').evaluate(button => { window.__piTrace = []; button.click(); });
    await settle(page); assert.equal((await state(page)).piProgress, '1.000');
    const trace = await page.evaluate(() => { const trace = window.__piTrace; delete window.__piTrace; return trace; });
    assert.ok(trace.some(frame => JSON.stringify(frame['M2-1']) !== JSON.stringify(original['M2-1'].p) && JSON.stringify(frame.Enclosure) === JSON.stringify(original.Enclosure.p)), 'Fasteners release before the housing');
    assert.ok(trace.some(frame => JSON.stringify(frame.Enclosure) !== JSON.stringify(original.Enclosure.p) && JSON.stringify(frame.C1) === JSON.stringify(original.C1.p)), 'Housing moves before passives');
    assert.equal(await page.locator('[data-pi-explode]').innerText(), 'Assemble');
    const spread = await poses(page), refs = Object.keys(original).filter(ref => ref !== 'PCB');
    assert.equal(refs.filter(ref => JSON.stringify(spread[ref].p) !== JSON.stringify(original[ref].p)).length, 36);
    assert.ok(refs.filter(ref => JSON.stringify(spread[ref].q) !== JSON.stringify(original[ref].q)).length > 25, 'Physical parts rotate as well as lift');
    assert.ok(new Set(refs.map(ref => spread[ref].p.map((v,i)=>+(v-original[ref].p[i]).toFixed(5)).join(','))).size > 20, 'Distinct physical displacement paths');
    for (const ref of ['M2-1','M2-2','Enclosure','U5','R1','C5','P1']) {
      const p = await pickPoint(page, ref); await page.mouse.move(p.x, p.y);
      await page.waitForFunction(ref => document.querySelector('[data-pi-inspector]').dataset.piSelection === ref, ref);
      assert.match(await page.locator('output[data-pi-part]').innerText(), new RegExp(ref));
    }
    await page.locator(root).screenshot({ path: path.join(output, 'exploded.png') });
    await page.locator('[data-pi-explode]').evaluate(button => button.click()); await settle(page);
    assert.notEqual((await state(page)).piSelection, 'P1', 'Hover tracks geometry moving below a stationary pointer');
    assert.deepEqual(await poses(page), original, 'Every assembled transform reverses exactly');
    await page.mouse.move(0,0); assert.equal(await page.locator('output[data-pi-part]').isVisible(), false);
    const canvas = page.locator('[data-pi-canvas]');
    await canvas.press(']'); assert.equal(await page.locator('output[data-pi-part]').isVisible(), true);
    await canvas.press('Escape'); assert.equal(await page.locator('output[data-pi-part]').isVisible(), false);
    await canvas.press('ArrowRight'); assert.equal((await state(page)).piAngle, 'custom'); await settle(page);
    await canvas.press('Home'); await settle(page); assert.equal((await state(page)).piAngle, 'iso');
    await page.setViewportSize({ width: 1440, height: 650 }); await page.locator('[data-pi-explode]').evaluate(button => { const spacer = document.createElement('div'); spacer.style.height = '2000px'; document.body.prepend(spacer); button.click(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piMotion === 'paused');
    const paused = (await state(page)).piFrames; await page.waitForTimeout(200); assert.equal((await state(page)).piFrames, paused);
    await canvas.scrollIntoViewIfNeeded(); await settle(page); assert.equal((await state(page)).piProgress, '1.000');
    await canvas.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal((await state(page)).piState, 'unavailable'); assert.equal(await page.locator('[data-pi-poster]').isVisible(), true);
    const failed = (await state(page)).piFrames; await page.waitForTimeout(250); assert.equal((await state(page)).piFrames, failed);
    await page.locator('[data-pi-start]').click(); await ready(page); await settle(page); assert.deepEqual(errors, []); await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }); await observe(mobile);
    await mobile.goto(url); await mobile.locator('[data-pi-stage]').scrollIntoViewIfNeeded(); await ready(mobile); await settle(mobile);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile overflow');
    assert.match(await mobile.locator('[data-pi-canvas]').evaluate(el => getComputedStyle(el).touchAction), /pan-y/);
    const mobileOriginal = await poses(mobile);
    await mobile.locator('[data-pi-explode]').click(); await mobile.waitForTimeout(70); assert.equal((await state(mobile)).piMotion, 'idle'); assert.equal((await state(mobile)).piProgress, '1.000'); await settle(mobile);
    const tap = await pickPoint(mobile, 'U5'); await mobile.touchscreen.tap(tap.x, tap.y); assert.equal((await state(mobile)).piSelection, 'U5');
    assert.match(await mobile.locator('output[data-pi-part]').innerText(), /RP2354B/);
    const readout = await mobile.locator('output[data-pi-part]').boundingBox(), stage = await mobile.locator('[data-pi-stage]').boundingBox();
    assert.ok(readout.x + readout.width <= stage.x + stage.width && readout.y >= stage.y && readout.y < stage.y + 45, 'Identity stays top-right');
    await mobile.locator(root).screenshot({ path: path.join(output, 'mobile.png') });
    await mobile.locator('[data-pi-explode]').click(); await settle(mobile); assert.deepEqual(await poses(mobile), mobileOriginal); await mobile.close();

    const failure = await browser.newPage(); await failure.route('**/framework-pi-board.glb', r => r.abort());
    await failure.goto(url); await failure.locator('[data-pi-stage]').scrollIntoViewIfNeeded(); await failure.waitForFunction(() => document.querySelector('[data-pi-inspector]').dataset.piState === 'unavailable');
    assert.equal(await failure.locator('[data-pi-poster]').isVisible(), true); assert.equal(await failure.locator('[data-pi-start]').innerText(), 'Retry 3D'); await failure.close();
    console.log('PASS: autoload; one action; 35 components/37 identities; registered housing and two exact M2 × 3 screws; fasteners release first; distinct staggered translations and rotations; exact assembly reversal; mechanical/passive/major hover; touch identity; keyboard; idle/offscreen/retry; responsive/reduced-motion/fallback.');
    console.log(`Visual checks: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

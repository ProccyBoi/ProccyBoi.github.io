/* Native-page acceptance for the real trainer/telemetry scene. A local server
 * and Playwright are required. --static-only avoids WebGL; --scene-only runs
 * the renderer/lifecycle checks. --atmosphere-only runs the bounded sky,
 * poster and lifecycle regression checks. No production test hooks are enabled unless
 * the page explicitly receives ?capture. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.V3_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.V3_AIRCRAFT_OUT || '.codex-temp/v3-aircraft';
const evidence = [];
const atmosphereOnly = process.argv.includes('--atmosphere-only');
const hero = '[data-aircraft-hero]';
const cadRequest = /\/assets\/(?:models\/(?:aircraft|hero)\/|vendor\/three\.min\.js|v3-aircraft-(?:scene|atmosphere)\.js)/;

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, javaScriptEnabled: options.js !== false, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  if (options.saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
  if (options.raf) await context.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window); window.__testRafRequests = 0;
    window.requestAnimationFrame = callback => { window.__testRafRequests++; return request(callback); };
  });
  if (options.block) await context.route(options.block, route => route.abort());
  const page = await context.newPage(), errors = [], shaders = [], requests = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, errors, shaders, requests };
}
function passed(run, name, details = {}) {
  assert.deepEqual(run.errors, [], 'No unhandled browser exceptions');
  assert.deepEqual(run.shaders, [], 'No shader errors');
  evidence.push({ name, ...details }); console.log('PASS ' + name);
}
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState)));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function layout(page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('[data-aircraft-hero]');
    const box = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, story: root.classList.contains('is-story'), header: document.querySelector('header').getBoundingClientRect().bottom, nav: [...root.querySelectorAll('[data-aircraft-go]')].map(box), copy: [...root.querySelectorAll('.is-current > *')].filter(element => getComputedStyle(element).display !== 'none').map(box) };
  });
  assert.equal(result.overflow, false, 'No horizontal page overflow');
  const viewport = page.viewportSize();
  for (const box of result.nav) {
    assert.ok(box.width >= 44 && box.height >= 44, 'Stage navigation has 44px targets');
    assert.ok(box.x >= -1 && box.right <= viewport.width + 1, 'Stage navigation fits horizontally');
    if (result.story) assert.ok(box.y >= result.header && box.bottom <= viewport.height + 1, 'Pinned navigation remains in the viewport');
  }
  if (result.story) for (const box of result.copy) {
    assert.ok(box.y >= result.header - 1 && box.bottom < Math.min(...result.nav.map(nav => nav.y)), 'Active copy fits between header and navigation');
    assert.ok(box.x >= 0 && box.right <= viewport.width + 1, 'Copy fits horizontally');
  }
}
async function staticContent(page) {
  assert.equal(await page.locator(hero + '.is-story').count(), 0, 'Static state removes the long scroll track');
  for (const id of ['aircraft', 'inside', 'telemetry']) {
    assert.equal(await page.locator('#' + id).isVisible(), true, 'All source chapters are visible');
    assert.equal(await page.locator('#' + id).getAttribute('aria-hidden'), null);
  }
  await page.waitForFunction(() => { const image = document.querySelector('[data-aircraft-poster]'); return image.complete && image.naturalWidth > 0 && image.currentSrc.includes('stopped'); });
  await page.locator('.v3-aircraft-static-photo').evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.waitForFunction(() => [...document.querySelectorAll('.v3-aircraft-static-photo img')].some(image => image.getBoundingClientRect().height > 0 && image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('#telemetry a').getAttribute('href'), '/v3/projects/skylabs/boards/telemetry/');
  await layout(page);
}
async function posterSky(page) {
  const result = await page.evaluate(() => {
    const image = document.querySelector('[data-aircraft-poster]'), canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.fillStyle = '#101210'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
    const pixels = [];
    for (const y of [.04, .09, .14]) for (const x of [.12, .37, .62, .87]) pixels.push([...context.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data].slice(0, 3));
    return { source: image.currentSrc, pixels };
  });
  const difference = result.pixels.reduce((sum, pixel) => sum + pixel.reduce((total, value, index) => total + Math.abs(value - [16, 18, 16][index]), 0) / 3, 0) / result.pixels.length;
  assert.ok(difference > (page.viewportSize().width <= 760 ? 1 : 5), 'The actual fallback poster includes the rendered atmosphere');
  return { source: result.source, meanSkyDifference: difference };
}
async function staticCase(browser, name, options) {
  const run = await open(browser, options);
  try {
    await run.page.goto(base + '/v3/?v=aircraft-test', { waitUntil: 'networkidle' });
    if (options.failed) await run.page.locator('[data-aircraft-state="unavailable"]').waitFor();
    await staticContent(run.page);
    if (!options.block) assert.equal(run.requests.some(url => cadRequest.test(url)), false, 'Static preferences avoid all model/Three requests');
    const poster = options.atmosphere ? await posterSky(run.page) : undefined;
    assert.equal(await run.page.evaluate(() => '__v3Aircraft' in window), false, 'Production page has no capture global');
    await run.page.screenshot({ path: path.join(output, name + '.png') });
    passed(run, name, { requests: run.requests.length, ...(poster ? { poster } : {}) });
  } finally { await run.context.close(); }
}
async function progress(page, target) {
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-aircraft-hero]'), stage = root.querySelector('[data-aircraft-stage]'), track = root.querySelector('.v3-aircraft-track');
    return track && Math.abs(parseFloat(track.style.height) - stage.clientHeight * (stage.clientWidth < 761 ? 4.7 : 4.1)) < 1;
  });
  await page.locator(hero).evaluate((root, amount) => {
    const top = scrollY + root.getBoundingClientRect().top;
    scrollTo({ top: top + (root.offsetHeight - root.querySelector('[data-aircraft-stage]').offsetHeight) * amount, behavior: 'instant' });
  }, target);
  await page.waitForFunction(amount => Math.abs(Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) - amount) < .003, target);
  await settle(page);
  return page.locator(hero).evaluate(root => ({ ...root.dataset }));
}
async function seek(page, kind, value) {
  const count = await page.locator(hero).getAttribute('data-aircraft-frames');
  await page.evaluate(({ kind, value }) => window.__v3Aircraft[kind](value), { kind, value });
  await page.waitForFunction(before => document.querySelector('[data-aircraft-hero]').dataset.aircraftFrames !== before, count);
  await settle(page);
}
async function idle(page, name) {
  await page.waitForTimeout(350);
  const frames = await page.locator(hero).getAttribute('data-aircraft-frames');
  const requested = await page.evaluate(() => window.__testRafRequests ?? null);
  await page.waitForTimeout(650);
  assert.equal(await page.locator(hero).getAttribute('data-aircraft-frames'), frames, name);
  if (requested !== null) assert.equal(await page.evaluate(() => window.__testRafRequests), requested, name + ' (all RAF requests)');
}
async function geometry(page) {
  return page.evaluate(() => {
    const { flight } = window.__v3Aircraft, T = window.THREE;
    flight.setLanding(1);
    const ground = ['mainLeft', 'mainRight', 'nose'].map(name => new T.Vector3(...flight.metadata.contacts[name].aircraftLocal).applyMatrix4(flight.carrier.matrixWorld).y);
    const prop = flight.group.getObjectByName(flight.metadata.contacts.propeller.nodeName);
    const shaft = new T.Vector3(...flight.metadata.contacts.propeller.centre);
    const localShaft = prop.worldToLocal(flight.carrier.localToWorld(shaft.clone()));
    let shaftError = 0;
    for (const amount of [.05, .35, .65, .85, 1]) {
      flight.setLanding(amount);
      shaftError = Math.max(shaftError, prop.localToWorld(localShaft.clone()).distanceTo(flight.carrier.localToWorld(shaft.clone())));
    }
    flight.setLanding(.68);
    let mainBottom = Infinity, noseBottom = Infinity;
    for (const name of ['derived-main-wheel-left', 'derived-main-wheel-right', 'derived-nose-wheel']) {
      flight.group.getObjectByName(name).traverse(mesh => {
        if (!mesh.isMesh) return;
        const point = new T.Vector3(), positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          if (name.includes('main')) mainBottom = Math.min(mainBottom, point.y); else noseBottom = Math.min(noseBottom, point.y);
        }
      });
    }
    const step = 1e-6;
    flight.setLanding(.64 - step); const beforeContact = flight.carrier.position.x;
    flight.setLanding(.64); const atContact = flight.carrier.position.x;
    flight.setLanding(.64 + step); const afterContact = flight.carrier.position.x;
    const contactVelocity = [(atContact - beforeContact) / step, (afterContact - atContact) / step];
    flight.setProgress(0);
    const baseline = flight.parts.map(part => part.object.matrixWorld.toArray());
    for (const amount of [1, .5, .2, .8, 0]) flight.setProgress(amount);
    const reverseError = flight.parts.reduce((max, part, index) => Math.max(max, ...part.object.matrixWorld.elements.map((value, axis) => Math.abs(value - baseline[index][axis]))), 0);
    return { ground, shaftError, mainBottom, noseBottom, contactVelocity, reverseError, assemblyError: flight.assemblyError(), boardScale: flight.board.children[0].scale.toArray(), stats: flight.statistics };
  });
}
async function filmGeometry(page) {
  return page.evaluate(() => {
    const { flight } = window.__v3Aircraft, T = window.THREE;
    flight.setProgress(0);
    const originalCad = [];
    flight.carrier.traverse(mesh => {
      if (mesh.isMesh && !mesh.userData.filmSurface) originalCad.push([mesh.geometry.attributes.position.array, mesh.geometry.attributes.position.array.slice()]);
    });
    flight.setProgress(.20);
    let attached = 0, peeled = 0, attachedError = 0, seamGap = 0, chordChange = 0, seamBridge = 0, nonfinite = 0;
    const wrappers = flight.films.filter(patch => patch.surface === 'wrap');
    for (const patch of wrappers) {
      attached += patch.attached; peeled += patch.peeled;
      const positions = patch.mesh.geometry.attributes.position, uv = patch.mesh.geometry.attributes.uv, indices = patch.mesh.geometry.index;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        if (uv.getX(vertex) <= 1 - patch.amount * 1.025) for (let axis = 0; axis < 3; axis++) attachedError = Math.max(attachedError, Math.abs(positions.array[vertex * 3 + axis] - patch.rest[vertex * 3 + axis]));
      }
      for (let index = 0; index < indices.count; index += 3) {
        const u = [0, 1, 2].map(offset => uv.getX(indices.getX(index + offset)));
        seamBridge = Math.max(seamBridge, Math.max(...u) - Math.min(...u));
      }
      for (const ring of patch.rings) {
        const first = ring.points[0], last = ring.points[ring.points.length - 1];
        const a = new T.Vector3().fromBufferAttribute(positions, first.index), b = new T.Vector3().fromBufferAttribute(positions, last.index);
        seamGap = Math.max(seamGap, a.distanceTo(b));
        const quarter = ring.points[Math.floor(ring.points.length * .25)], third = ring.points[Math.floor(ring.points.length * .75)];
        const c = new T.Vector3().fromBufferAttribute(positions, quarter.index), d = new T.Vector3().fromBufferAttribute(positions, third.index);
        chordChange = Math.max(chordChange, Math.abs(c.distanceTo(d) - quarter.point.distanceTo(third.point)));
      }
      for (const array of [positions.array, patch.mesh.geometry.attributes.normal.array]) for (const value of array) if (!Number.isFinite(value)) nonfinite++;
    }
    const structuralMotion = flight.parts.filter(part => part.category !== 'covering').reduce((max, part) => Math.max(max, part.object.position.distanceTo(part.base)), 0);
    for (const amount of [.5, .85, .1, 1, 0]) flight.setProgress(amount);
    let restoredError = 0, cadChanges = 0;
    flight.films.forEach(patch => patch.rest.forEach((value, index) => { restoredError = Math.max(restoredError, Math.abs(patch.mesh.geometry.attributes.position.array[index] - value)); }));
    originalCad.forEach(([array, rest]) => rest.forEach((value, index) => { if (array[index] !== value) cadChanges++; }));
    return { wrappers: wrappers.length, attached, peeled, attachedError, seamGap, chordChange, seamBridge, nonfinite, structuralMotion, restoredError, cadChanges };
  });
}
async function framing(page, value) {
  await seek(page, 'seekProgress', value);
  return page.evaluate(value => {
    const { flight, camera } = window.__v3Aircraft, T = window.THREE;
    camera.updateMatrixWorld(true);
    let outside = 0, vertices = 0;
    flight.carrier.traverse(mesh => {
      if (!mesh.isMesh || !mesh.visible) return;
      if (flight.statistics.detailedFilm && value > .35 && mesh.userData.filmSurface) return;
      let ancestor = mesh; while (ancestor && ancestor !== flight.board) ancestor = ancestor.parent;
      if (ancestor === flight.board) return;
      const point = new T.Vector3(), positions = mesh.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).project(camera); vertices++;
        if (Math.abs(point.x) > 1.001 || Math.abs(point.y) > 1.001 || Math.abs(point.z) > 1.001) outside++;
      }
    });
    return { outside, vertices, near: camera.near };
  }, value);
}
async function sceneCase(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v3/?capture&v=aircraft-test', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    const started = Date.now();
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    const duration = Date.now() - started;
    assert.ok(duration < 20000, 'Finite autoplay completes without scroll');
    await page.waitForFunction(() => !!window.__v3Aircraft);
    assert.equal(await page.locator('[data-aircraft-skip]').isVisible(), false);
    await layout(page); await idle(page, 'No idle renderer loop after landing');
    assert.ok(run.requests.some(url => /airframe\.meshopt\.glb/.test(url)), 'Lossless compact transport is used');
    assert.equal(run.requests.some(url => /\/airframe\.glb/.test(url)), false, 'Original fallback transport is not downloaded unnecessarily');
    const physical = await geometry(page);
    assert.equal(physical.stats.sourceOccurrences, 117); assert.equal(physical.stats.telemetryComponents, 153);
    assert.deepEqual(physical.boardScale, [.07303, .07303, .07303]);
    physical.ground.forEach(y => assert.ok(Math.abs(y) < 1e-8, 'All three wheels settle on the ground'));
    assert.ok(physical.shaftError < 1e-9, 'Spinning propeller retains the exact shaft axis');
    assert.ok(Math.abs(physical.mainBottom) < 1e-6 && physical.noseBottom > .01, 'Main wheels touch before the nose wheel');
    assert.ok(Math.abs(physical.contactVelocity[0] - physical.contactVelocity[1]) < .001, 'Forward velocity is continuous at main-wheel contact');
    assert.equal(physical.reverseError, 0); assert.equal(physical.assemblyError, 0);
    passed(run, 'automatic landing and physical assembly', { duration, physical });
    const film = await filmGeometry(page);
    assert.ok(film.wrappers >= 11 && film.attached > 0 && film.peeled > 0, 'Mid-peel retains both attached skin and released sheet');
    assert.equal(film.attachedError, 0); assert.equal(film.structuralMotion, 0, 'Covering peels before structural separation');
    assert.ok(film.seamGap > .02 && film.chordChange > .02, 'Open seams and changed pair distances prove non-rigid unwrapping');
    assert.ok(film.seamBridge < .1, 'No triangle bridges the opened perimeter seam');
    assert.equal(film.nonfinite, 0); assert.equal(film.restoredError, 0); assert.equal(film.cadChanges, 0);
    passed(run, 'flexible film peel and exact restoration', { film });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      for (const amount of [0, .20, .30, .50, 1]) {
        const projection = await framing(page, amount);
        if (amount <= .50) assert.equal(projection.outside, 0, 'Opaque aircraft is framed before the deliberate PCB close-up');
        await layout(page);
        await page.screenshot({ path: path.join(output, `${viewport.width}-progress-${amount}.png`) });
      }
      passed(run, `scene and layout ${viewport.width}x${viewport.height}`);
    }
    await page.setViewportSize({ width: 1265, height: 712 });
    await page.evaluate(() => window.__v3Aircraft.resume());
    const opened = await progress(page, .5); assert.equal(opened.aircraftPhase, 'extraction');
    await layout(page);
    await page.locator('[data-aircraft-go="0"]').focus(); await page.keyboard.press('End');
    assert.equal(await page.locator('[data-aircraft-go="2"]').evaluate(link => link === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#telemetry' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '2');
    await settle(page); await idle(page, 'Scroll scene stops drawing at rest');
    await page.locator('#work').evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().top + 20, behavior: 'instant' }));
    await idle(page, 'Offscreen scene does not render');
    await progress(page, 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-aircraft-state="static"]').waitFor();
    await staticContent(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator(hero + '.is-story').waitFor();
    await seek(page, 'seekProgress', 1);
    await page.evaluate(() => window.__v3Aircraft.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await page.locator('[data-aircraft-state="unavailable"]').waitFor();
    await staticContent(page);
    passed(run, 'native keyboard, idle, live reduced motion and context-loss recovery');
  } finally { await run.context.close(); }
}
async function pendingTelemetry(browser) {
  const run = await open(browser), { page } = run;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await run.context.route('**/models/hero/telemetry.*', async route => { await held; await route.continue().catch(() => {}); });
  try {
    await page.goto(base + '/v3/?v=aircraft-test', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    await page.locator('[data-aircraft-skip]').focus(); await page.keyboard.press('Enter');
    await page.locator('[data-aircraft-phase="stopped"]').waitFor();
    assert.equal(await page.locator('[data-aircraft-go="0"]').evaluate(link => link === document.activeElement), true, 'Skip transfers focus before disappearing');
    await progress(page, 1);
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-chapter'), '1', 'Early scrolling holds the open aircraft until the real board arrives');
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-telemetry-ready'), null);
    release(); await page.locator('[data-aircraft-telemetry-ready="true"][data-aircraft-chapter="2"]').waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => '__v3Aircraft' in window), false);
    passed(run, 'keyboard skip and deferred telemetry hold');
    // A fresh native landing receives an actual wheel event before completion.
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(100);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    await page.mouse.move(700, 500); await page.mouse.wheel(0, 80);
    await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').dataset.aircraftLanding === '1.000000');
    passed(run, 'native scroll interrupts landing');
  } finally { release(); await run.context.close(); }
}
async function earlyPreference(browser) {
  const run = await open(browser), { page } = run;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await run.context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { const result = getContext.call(this, type, ...args); if (String(type).includes('webgl') && result) window.__testWebglCreated = true; return result; };
  });
  await run.context.route('**/airframe*.glb*', async route => { await held; await route.continue().catch(() => {}); });
  try {
    await page.goto(base + '/v3/?v=aircraft-test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__testWebglCreated, null, { timeout: 60000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-aircraft-state="static"]').waitFor();
    release();
    await page.locator('[data-aircraft-source-occurrences="117"]').waitFor({ timeout: 60000 });
    assert.equal(run.requests.some(url => /\/models\/hero\/telemetry\./.test(url)), false, 'An early static preference defers telemetry');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout: 60000 });
    await progress(page, 1);
    assert.equal(await page.locator(hero).getAttribute('data-aircraft-chapter'), '2');
    passed(run, 'early preference change resumes deferred telemetry');
  } finally { release(); await run.context.close(); }
}
async function atmospherePixels(page) {
  return page.evaluate(() => {
    const capture = window.__v3Aircraft;
    capture.renderFrame();
    const gl = capture.renderer.getContext(), sample = new Uint8Array(4), pixels = [];
    for (const y of [.86, .91, .96]) for (const x of [.12, .37, .62, .87]) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * x), Math.floor(gl.drawingBufferHeight * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sample);
      // A transparent canvas clear is composited over the unchanged page matte.
      // WebGL's framebuffer is premultiplied, so add only the uncovered matte.
      pixels.push([0, 1, 2].map(index => Math.round(sample[index] + [16, 18, 16][index] * (1 - sample[3] / 255))));
    }
    return { opacity: capture.atmosphere.opacity, dataset: Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftAtmosphere), pixels };
  });
}
async function atmosphereSequence(page, run, label) {
  const samples = [];
  for (const amount of [0, .10, .20, .30, .38, .43, 1]) {
    await seek(page, 'seekProgress', amount);
    const sample = await atmospherePixels(page);
    assert.ok(Number.isFinite(sample.opacity), 'Atmosphere exposes a finite strength');
    assert.ok(Math.abs(sample.dataset - sample.opacity) < .001, 'Controller and rendered atmosphere agree');
    samples.push({ progress: amount, ...sample });
    if ([0, .20, 1].includes(amount)) await page.screenshot({ path: path.join(output, `${label}-atmosphere-${amount}.png`) });
  }
  assert.equal(samples[0].opacity, 1, 'The entry sky is fully present');
  assert.ok(samples[2].opacity > 0 && samples[2].opacity < 1, 'The sky fades through intermediate strengths');
  samples.slice(1).forEach((sample, index) => assert.ok(sample.opacity <= samples[index].opacity, 'The fade is monotonic'));
  for (const sample of samples.filter(sample => sample.progress >= .38)) {
    assert.equal(sample.opacity, 0, 'The sky is gone before the board close-up');
    sample.pixels.forEach(pixel => assert.deepEqual(pixel, [16, 18, 16], 'The final sky area is the exact original dark matte'));
  }
  const entryDifference = samples[0].pixels.reduce((sum, pixel) => sum + pixel.reduce((total, value, index) => total + Math.abs(value - [16, 18, 16][index]), 0), 0);
  assert.ok(entryDifference > (page.viewportSize().width <= 760 ? 36 : 180), 'The entry sky is visibly different from the dark stage');
  assert.ok(new Set(samples[0].pixels.map(pixel => pixel.join(','))).size >= 3, 'The background contains spatial variation even in the quiet text area');
  await seek(page, 'seekProgress', 0);
  const reverse = await atmospherePixels(page);
  assert.deepEqual(reverse.pixels, samples[0].pixels, 'Reverse scrolling reproduces the same sky pixels');
  await idle(page, 'Atmosphere adds no idle animation loop');
  passed(run, `atmosphere fade and reverse ${label}`, { samples });
}
async function atmosphereCopyContrast(page) {
  const contrast = await page.evaluate(() => {
    const capture = window.__v3Aircraft; capture.renderFrame();
    const gl = capture.renderer.getContext(), canvas = capture.renderer.domElement.getBoundingClientRect(), pixel = new Uint8Array(4);
    const luminance = colour => colour.map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4); }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const samples = [];
    for (const paragraph of document.querySelectorAll('[data-aircraft-chapter].is-current > p')) {
      const colour = getComputedStyle(paragraph).color.match(/[\d.]+/g).slice(0, 3).map(Number), foreground = luminance(colour), range = document.createRange();
      range.selectNodeContents(paragraph);
      for (const rectangle of range.getClientRects()) for (const x of [.08, .5, .92]) for (const y of [.25, .5, .75]) {
        const px = Math.floor((rectangle.x + rectangle.width * x - canvas.x) / canvas.width * gl.drawingBufferWidth);
        const py = Math.floor((1 - (rectangle.y + rectangle.height * y - canvas.y) / canvas.height) * gl.drawingBufferHeight);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const background = luminance([0, 1, 2].map(index => Math.round(pixel[index] + [16, 18, 16][index] * (1 - pixel[3] / 255))));
        samples.push((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05));
      }
    }
    return { minimum: Math.min(...samples), samples: samples.length };
  });
  assert.ok(contrast.samples > 0 && contrast.minimum >= 4.5, 'Sampled paragraph backgrounds retain at least 4.5:1 contrast');
  return contrast;
}
async function atmosphereCase(browser) {
  const run = await open(browser, { raf: true }), { page } = run;
  try {
    await page.goto(base + '/v3/?capture&v=atmosphere-test', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout: 120000 });
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => typeof window.__v3Aircraft?.renderFrame === 'function' && !!window.__v3Aircraft.atmosphere);
    await page.waitForLoadState('networkidle');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/v3-aircraft-atmosphere.js')).map(entry => ({ name: entry.name, bytes: entry.decodedBodySize })));
    assert.equal(resources.length, 1, 'Atmosphere adds exactly one script request');
    assert.ok(resources[0].bytes > 0 && resources[0].bytes < 16000, 'Procedural atmosphere stays within a small script budget');
    const requestsBefore = run.requests.length;
    await atmosphereSequence(page, run, '1440');
    assert.equal(run.requests.length, requestsBefore, 'Seeking the atmosphere starts no additional asset requests');
    const physical = await geometry(page), film = await filmGeometry(page);
    assert.equal(physical.reverseError, 0); assert.equal(physical.assemblyError, 0); assert.ok(physical.shaftError < 1e-9);
    physical.ground.forEach(y => assert.ok(Math.abs(y) < 1e-8));
    assert.equal(film.attachedError, 0); assert.equal(film.restoredError, 0); assert.equal(film.cadChanges, 0); assert.ok(film.seamGap > .02);
    passed(run, 'atmosphere preserves landing and film geometry', { resources, physical, film });
    await page.setViewportSize({ width: 390, height: 844 });
    await atmosphereSequence(page, run, '390');
    await layout(page);
    await page.setViewportSize({ width: 1600, height: 650 });
    await seek(page, 'seekProgress', 0); await layout(page);
    const contrast = await atmosphereCopyContrast(page);
    await page.screenshot({ path: path.join(output, '1600x650-atmosphere-entry.png') });
    await seek(page, 'seekProgress', .20);
    await page.screenshot({ path: path.join(output, '1600x650-atmosphere-peel.png') });
    passed(run, 'short desktop atmosphere and paragraph contrast', { contrast });
    await page.evaluate(() => window.__v3Aircraft.resume());
    await progress(page, 1);
    await page.locator('#work').evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().top + 20, behavior: 'instant' }));
    await idle(page, 'Offscreen atmosphere does not render');
    await progress(page, 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-aircraft-state="static"]').waitFor();
    await staticContent(page); await posterSky(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator(hero + '.is-story').waitFor();
    await seek(page, 'seekProgress', 1);
    await page.evaluate(() => window.__v3Aircraft.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await page.locator('[data-aircraft-state="unavailable"]').waitFor();
    await staticContent(page); await posterSky(page);
    passed(run, 'atmosphere preference, context-loss and offscreen recovery');
  } finally { await run.context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (atmosphereOnly) {
      await staticCase(browser, 'atmosphere reduced-motion poster', { reduced: true, atmosphere: true });
      await staticCase(browser, 'atmosphere save-data poster', { saveData: true, atmosphere: true, viewport: { width: 390, height: 844 } });
      await staticCase(browser, 'atmosphere no-javascript poster', { js: false, atmosphere: true, viewport: { width: 390, height: 844 } });
      await atmosphereCase(browser);
    } else if (!process.argv.includes('--scene-only')) {
      await staticCase(browser, 'reduced-motion', { reduced: true });
      await staticCase(browser, 'save-data', { saveData: true, viewport: { width: 390, height: 844 } });
      await staticCase(browser, 'no-javascript', { js: false, viewport: { width: 390, height: 844 } });
      await staticCase(browser, 'blocked-controller', { block: '**/v3-aircraft-hero.js*' });
      await staticCase(browser, 'blocked-three', { block: '**/vendor/three.min.js', failed: true });
      await staticCase(browser, 'short-landscape', { viewport: { width: 844, height: 390 } });
    }
    if (!atmosphereOnly && !process.argv.includes('--static-only')) { await sceneCase(browser); await pendingTelemetry(browser); await earlyPreference(browser); }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, atmosphereOnly ? 'evidence-atmosphere.json' : 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n'); }
  console.log(`${evidence.length} aircraft acceptance groups passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

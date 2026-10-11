/* Acceptance for the accepted two-destination aircraft story inside v2.
 * Serve the repository root, then run with Playwright installed. Software
 * WebGL gets long readiness waits; timing claims belong to the wheel suite.
 * --source-only needs no browser; --static-only omits WebGL; --scene-only
 * omits static cases; --mobile-only runs the narrow-screen scene cases. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_AIRCRAFT_OUT || '.codex-temp/v2-aircraft';
const baseline = process.env.V2_AIRCRAFT_BASELINE || 'd725a378806eb05c8d5b981f8e54d33dde502cac';
const aircraft = '[data-aircraft-hero]';
const evidence = [];
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const aircraftRequest = /\/assets\/(?:models\/aircraft\/|v3-aircraft-(?:scene|atmosphere|electronics)\.js)/i;
const telemetryRequest = /\/assets\/models\/hero\/telemetry\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
function passed(name, details = {}, run) {
  if (run) { assert.deepEqual(run.errors, [], 'No unhandled browser errors'); assert.deepEqual(run.shaders, [], 'No shader compilation errors'); }
  evidence.push({ name, ...details }); console.log('PASS ' + name);
}
function sourceContract() {
  const original = execFileSync('git', ['-c', 'safe.directory=' + process.cwd().replaceAll('\\', '/'), 'show', baseline + ':v2/index.html'], { encoding: 'utf8' });
  const current = fs.readFileSync('v2/index.html', 'utf8');
  const initialHero = html => html.match(/<section class="v2-assembly"[\s\S]*?<\/section>/)?.[0].replaceAll('\r\n', '\n');
  assert.ok(initialHero(original));assert.ok(initialHero(current));
  assert.equal((initialHero(current).match(/data-assembly-select=/g)||[]).length,3,'The three-project hero remains, with explicitly requested selector/navigation markup changes');
  const originalMotion=execFileSync('git',['show',baseline+':assets/v2-hero-motion.js'],{encoding:'utf8'});
  assert.equal(fs.readFileSync('assets/v2-hero-motion.js','utf8'),originalMotion,'Shorter hero length does not change normalized component choreography');
  assert.match(current, /id="work"/, '#work remains a real navigation destination');
  assert.ok(current.indexOf('data-selected-work') > current.indexOf('data-assembly') && current.indexOf('data-selected-work') < current.indexOf('data-aircraft-hero') && current.indexOf('data-aircraft-hero') < current.indexOf('class="v2-about-preview'), 'Selected work follows the hero; aircraft still precedes About');
  assert.match(current, /data-aircraft-hero[^>]*data-aircraft-detailed[^>]*data-aircraft-deferred[^>]*data-aircraft-smooth/);
  assert.match(current, /<section[^>]*data-aircraft-hero[^>]*data-aircraft-background/, 'v2 opts into background preparation');
  assert.deepEqual([...current.matchAll(/<article id="([^"]+)" data-aircraft-chapter="(\d+)"/g)].map(match => [match[1], match[2]]), [['skylabs-aircraft', '0'], ['skylabs-telemetry', '1']]);
  assert.doesNotMatch(current, /skylabs-inside|data-aircraft-go="2"/, 'No obsolete inspection chapter');
  assert.match(current, /href="\/v2\/projects\/skylabs\/boards\/telemetry\/"/);
  passed('preserved hero choreography, namespaced two-chapter story and section ordering', { baseline });
}
async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, javaScriptEnabled: options.js !== false, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript(() => {
    const probe = window.__v2AircraftProbe = { firstLive: null, frames: [], entryRequestedMs: null };
    // Observe the actual first live draw in its own microtask. A later protocol
    // read can consume most of the automatic landing on a slow GPU runner.
    new MutationObserver(records => {
      if (!records.some(record => record.attributeName === 'data-aircraft-frames')) return;
      const root = document.querySelector('[data-aircraft-hero]');
      if (!root || !(Number(root.dataset.aircraftFrames) > 0)) return;
      const box = root.getBoundingClientRect(), canvas = root.querySelector('[data-aircraft-canvas]');
      const sample = { t: performance.now(), y: scrollY, frame: Number(root.dataset.aircraftFrames), submitted: Number(root.dataset.aircraftSubmittedFrames || 0), completed: Number(root.dataset.aircraftCompletedFrames || 0), lastFrame: root.dataset.aircraftLastFrame ? JSON.parse(root.dataset.aircraftLastFrame) : null, landing: Number(root.dataset.aircraftLanding), state: root.dataset.aircraftState, phase: root.dataset.aircraftPhase, progress: Number(root.dataset.aircraftProgress), rendered: Number(root.dataset.aircraftRenderedProgress), visible: box.top < innerHeight && box.bottom > 0, top: box.top, bottom: box.bottom, canvasVisibility: canvas ? getComputedStyle(canvas).visibility : null };
      if (!probe.firstLive) probe.firstLive = sample;
      if (sample.frame !== probe.frames.at(-1)?.frame) { probe.frames.push(sample); if (probe.frames.length > 256) probe.frames.shift(); }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-aircraft-frames'] });
  });
  if (options.saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
  if (options.webglFailure) await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return this.matches('[data-aircraft-canvas]') && /webgl/i.test(type) ? null : getContext.call(this, type, ...args); };
  });
  const page = await context.newPage(), requests = [], errors = [], shaders = [];
  page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, requests, errors, shaders };
}
async function diagnose(run, name, error) {
  const report = { error: error.stack, requests: run.requests, errors: run.errors, shaders: run.shaders };
  try {
    report.state = await run.page.evaluate(() => {
      const roots = {};
      for (const [name, selector] of [['aircraft', '[data-aircraft-hero]'], ['selected', '[data-selected-work]'], ['hero', '[data-assembly]']]) {
        const node = document.querySelector(selector), box = node?.getBoundingClientRect();
        roots[name] = node ? { dataset: { ...node.dataset }, visible: box.top < innerHeight && box.bottom > 0, top: box.top, bottom: box.bottom } : null;
      }
      return { url: location.href, y: scrollY, viewport: { width: innerWidth, height: innerHeight }, roots, probe: window.__v2AircraftProbe };
    });
  } catch (failure) { report.collectionError = failure.message; }
  fs.writeFileSync(path.join(output, name + '-failure.json'), JSON.stringify(report, null, 2) + '\n');
  await run.page.screenshot({ path: path.join(output, name + '-failure.png'), timeout: 15000 }).catch(() => {});
}
async function scrollTo(page, selector, offset = 0) {
  await page.locator(selector).evaluate((element, adjustment) => scrollTo({ top: scrollY + element.getBoundingClientRect().top + adjustment, behavior: 'instant' }), offset);
}
async function idleFrames(page, selector, key, label) {
  // Poll for a quiet interval rather than assuming software WebGL settles in 400ms.
  await page.waitForFunction(({ selector, key }) => {
    const node = document.querySelector(selector), value = node?.getAttribute(key), now = performance.now();
    const state = window.__v2IdleSample ||= {};
    if (state.selector !== selector || state.key !== key || state.value !== value) Object.assign(state, { selector, key, value, since: now });
    return now - state.since >= 800;
  }, { selector, key }, { polling: 100, timeout });
  const before = await page.locator(selector).getAttribute(key);
  await page.waitForTimeout(650);
  assert.equal(await page.locator(selector).getAttribute(key), before, label);
}
async function settle(page, capture = false) {
  if (!capture) await page.waitForFunction(() => {
    const root = document.querySelector('[data-aircraft-hero]');
    return !root.hasAttribute('data-aircraft-smooth') || Math.abs(Number(root.dataset.aircraftRenderedProgress) - Number(root.dataset.aircraftProgress)) <= .000002;
  }, null, { timeout });
  await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState)), null, { timeout });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-aircraft-hero]');
    return root.dataset.aircraftSubmittedFrames === undefined || (root.dataset.aircraftGPUPending === 'false' && root.dataset.aircraftWarmMask === 'false' && root.dataset.aircraftState === 'ready');
  }, null, { timeout });
}
async function progress(page, amount) {
  await page.locator(aircraft).evaluate((root, value) => {
    const stage = root.querySelector('[data-aircraft-stage]'), distance = parseFloat(root.querySelector('.v3-aircraft-track').style.height) - stage.clientHeight;
    scrollTo({ top: scrollY + root.getBoundingClientRect().top + distance * value + (value === 1 ? 1 : value === 0 ? -1 : 0), behavior: 'instant' });
  }, amount);
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) - value) < .001, amount, { timeout });
  await settle(page);
  return page.locator(aircraft).evaluate(root => ({ ...root.dataset }));
}
async function layout(page, pinned = true) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('[data-aircraft-hero]'), rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, header: document.querySelector('header').getBoundingClientRect().bottom, navigation: [...root.querySelectorAll('[data-aircraft-go]')].map(rect), copy: [...root.querySelectorAll('article[data-aircraft-chapter].is-current > *')].filter(element => getComputedStyle(element).display !== 'none').map(rect) };
  });
  assert.equal(result.overflow, false, 'No horizontal overflow');
  for (const box of result.navigation) {
    assert.ok(box.width >= 44 && box.height >= 44, 'Aircraft navigation uses 44px targets');
    assert.ok(box.x >= -1 && box.right <= page.viewportSize().width + 1, 'Aircraft navigation fits horizontally');
    if (pinned) assert.ok(box.y >= result.header - 1 && box.bottom <= page.viewportSize().height + 1, 'Pinned navigation fits below the header');
  }
  if (pinned) for (const box of result.copy) {
    assert.ok(box.x >= -1 && box.right <= page.viewportSize().width + 1, 'Story copy fits horizontally');
    assert.ok(box.y >= result.header - 1 && box.bottom < Math.min(...result.navigation.map(nav => nav.y)), `Story copy fits between header and controls (${JSON.stringify({ box, header: result.header, navigation: result.navigation })})`);
  }
  return result;
}
async function chapter(page, index, prefix = 'skylabs-') {
  await page.locator(`[data-aircraft-go="${index}"]`).click();
  const hash = '#' + prefix + (index ? 'telemetry' : 'aircraft');
  await page.waitForFunction(({ index, hash }) => location.hash === hash && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === String(index), { index, hash });
  await settle(page);
  assert.equal(await page.locator('[data-aircraft-go][aria-current="step"]').getAttribute('data-aircraft-go'), String(index));
  assert.equal(await page.locator('article[data-aircraft-chapter].is-current').getAttribute('aria-hidden'), 'false');
  assert.equal(await page.locator('article[data-aircraft-chapter]:not(.is-current)').evaluate(element => element.inert), true);
}
async function captureContract(page) {
  // Capture seeks must be exact, even if the native scrollbar is elsewhere.
  await progress(page, 0);
  const samples = [];
  for (const amount of [.2, .60, .62, 1, 0]) {
    const before = await page.locator(aircraft).getAttribute('data-aircraft-frames');
    await page.evaluate(value => window.__v3Aircraft.seekProgress(value), amount);
    await page.waitForFunction(({ before, amount }) => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftFrames !== before && Number(root.dataset.aircraftRenderedProgress) === amount && (root.dataset.aircraftSubmittedFrames === undefined || (root.dataset.aircraftGPUPending === 'false' && root.dataset.aircraftWarmMask === 'false'));
    }, { before, amount });
    await settle(page, true);
    const state = await page.evaluate(() => {
      const root = document.querySelector('[data-aircraft-hero]'), { flight } = window.__v3Aircraft;
      return { bar: Number(root.querySelector('[data-aircraft-progress]').style.transform.match(/scaleX\(([^)]+)\)/)?.[1]), rendered: Number(root.dataset.aircraftRenderedProgress), chapter: Number(root.dataset.aircraftChapter), lastFrame: root.dataset.aircraftLastFrame ? JSON.parse(root.dataset.aircraftLastFrame) : null, visibleFilms: flight.films.filter(patch => patch.mesh.visible).length, rigidMotion: Math.max(...flight.parts.filter(part => !part.filmPatches).map(part => Math.max(part.object.position.distanceTo(part.base), 1 - Math.abs(part.object.quaternion.dot(part.quaternion))))), electronicsVisible: flight.electronics.group.visible, assemblyError: flight.assemblyError() };
    });
    assert.equal(state.rendered, amount, 'Capture reports the exact requested progress');
    assert.equal(state.bar, amount, 'Capture progress indicator follows its exact pose');
    assert.equal(state.chapter, amount < .76 ? 0 : 1, 'Capture chapter follows capture pose, not native scrollbar');
    assert.equal(state.lastFrame?.value, amount, 'The submitted capture pose is the exact requested value');
    assert.equal(state.lastFrame?.gpu.state, 'complete', 'Exact capture inspection follows actual own-context GPU completion');
    assert.equal(state.lastFrame?.published, true);
    if (amount >= .60) assert.equal(state.visibleFilms, 0, 'Peel is fully gone by .60');
    if (amount <= .62) assert.ok(state.rigidMotion < 1e-12, 'Rigid exterior remains installed until .62');
    if (amount === 1) assert.equal(state.electronicsVisible, false, 'Endpoint isolates the telemetry board');
    if (amount === 0) assert.ok(state.assemblyError < 1e-9, 'Reverse returns to exact assembled endpoint');
    samples.push({ amount, ...state });
  }
  const beforeResume = await page.locator(aircraft).getAttribute('data-aircraft-frames');
  await page.evaluate(() => window.__v3Aircraft.resume());
  await page.waitForFunction(before => document.querySelector('[data-aircraft-hero]').dataset.aircraftFrames !== before, beforeResume);
  await settle(page);
  return samples;
}
async function desktop(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v2/?capture&v=aircraft-integration-test', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-assembly-models-ready="3"]').waitFor({ timeout });
    await page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]').dataset.aircraftTransportState==='ready',null,{timeout});
    assert.equal(await page.evaluate(()=>scrollY),0,'Cached aircraft transport requires no scrolling');
    assert.notEqual(await page.locator(aircraft).getAttribute('data-aircraft-background-ready'),'true','Distant aircraft GPU work stays deferred');
    assert.ok(run.requests.some(url => aircraftRequest.test(url)), 'Aircraft dependencies are fetched from the initial viewport');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames'),'0','Distant aircraft submits no speculative warm draws');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), 0, 'Offscreen preparation does not start the live animation');
    await idleFrames(page, aircraft, 'data-aircraft-warm-frames', 'Background preparation does not retain a hidden render loop');
    await page.mouse.move(700, 450); await page.mouse.wheel(0, 120); await page.waitForTimeout(200);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-landing')), 0, 'Original hero scrolling preserves the unseen landing');
    await scrollTo(page, '#work'); await page.waitForTimeout(300);
    const distance = await page.locator(aircraft).evaluate(root => root.getBoundingClientRect().top - innerHeight);
    assert.notEqual(await page.locator(aircraft).getAttribute('data-aircraft-background-ready'),'true','Reading Selected does not force competing distant aircraft GPU preparation');
    assert.equal(run.requests.filter(url => telemetryRequest.test(url)).length, 1, 'Original hero fetches its telemetry pack once');
    passed('cached transport preserves the hero and unseen cold landing',{distance,warmFrames:0}, run);
    assert.equal(await page.evaluate(() => window.__v2AircraftProbe.firstLive), null, 'The unseen landing has not already played');
    await page.locator(aircraft).evaluate(root => {
      window.__v2AircraftProbe.entryRequestedMs = performance.now();
      scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' });
    });
    await page.waitForFunction(() => !!window.__v2AircraftProbe.firstLive, null, { timeout });
    const entry = await page.evaluate(() => ({ requestedMs: window.__v2AircraftProbe.entryRequestedMs, firstLive: window.__v2AircraftProbe.firstLive }));
    const landing = entry.firstLive.landing;
    assert.equal(entry.firstLive.frame, 1, 'The first actual live draw is captured, independently of protocol latency');
    assert.equal(entry.firstLive.state, 'landing', 'Actual entry starts automatic landing rather than skipping to ready');
    assert.equal(entry.firstLive.lastFrame?.gpu.state, 'complete', 'The first landing publication follows its real GPU completion');
    assert.equal(entry.firstLive.lastFrame?.published, true);
    assert.equal(entry.firstLive.visible, true, 'Automatic landing starts in the real visible aircraft section');
    assert.ok(entry.firstLive.t >= entry.requestedMs && landing >= 0, 'The first landing draw follows the requested native entry');
    assert.ok(landing < .7, 'Entry starts the automatic landing');
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout });
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    await page.waitForFunction(() => !!window.__v3Aircraft?.atmosphere, null, { timeout });
    await settle(page);
    assert.equal(run.requests.filter(url => telemetryRequest.test(url)).length, 1, 'Aircraft reuses the hero telemetry download');
    assert.equal(run.requests.filter(url => /\/v2-hero-assets\.js/.test(url)).length, 1, 'Shared asset loader initializes once');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-source-occurrences'), '117');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-detailed-film'), 'true');
    await idleFrames(page, '[data-assembly]', 'data-assembly-frames', 'Opening hero stops rendering while aircraft is visible');
    await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft stops rendering after landing');
    await layout(page); await page.screenshot({ path: path.join(output, 'desktop-aircraft.png') });
    passed('entry landing, detailed accepted CAD and shared telemetry reuse', { landing, entry }, run);
    const samples = [];
    for (const amount of [0, .2, .43, .60, .62, .76, 1, .62, .2, 0]) {
      const state = await progress(page, amount); samples.push({ progress: amount, rendered: Number(state.aircraftRenderedProgress), sky: Number(state.aircraftAtmosphere), phase: state.aircraftPhase });
      if (amount === 0) assert.equal(Number(state.aircraftAtmosphere), 1, 'Reverse scrolling restores the clouds');
      if (amount === .2) assert.ok(Number(state.aircraftAtmosphere) > 0 && Number(state.aircraftAtmosphere) < 1, 'Clouds fade during peel');
      if (amount >= .43) assert.equal(Number(state.aircraftAtmosphere), 0, 'Clouds clear before extraction');
      if (amount === 0 || amount === 1) assert.equal(Number(state.aircraftRenderedProgress), amount, 'Native endpoint is exact');
      await layout(page);
    }
    const captures = await captureContract(page);
    await chapter(page, 1);
    assert.equal(await page.locator('#copy-skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    await page.screenshot({ path: path.join(output, 'desktop-telemetry.png') });
    await scrollTo(page, '.v2-about-preview', 100); await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft suspends below its section');
    await scrollTo(page, '#work'); await idleFrames(page, aircraft, 'data-aircraft-frames', 'Aircraft suspends above its section');
    await progress(page, 1); assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-chapter'), '1', 'Offscreen re-entry restores current destination');
    passed('peel clearance, reverse endpoints, exact capture, chapter links and offscreen suspension', { samples, captures }, run);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator(aircraft + ':not(.is-story)').waitFor();
    assert.equal(await page.locator('#skylabs-telemetry').getAttribute('aria-hidden'), null);
    await idleFrames(page, aircraft, 'data-aircraft-frames', 'Live reduced-motion preference stops rendering');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator(aircraft + '.is-story').waitFor(); await progress(page, 1); await layout(page);
    assert.equal(await page.locator('.v3-aircraft-track').count(), 1, 'Re-enabling motion creates exactly one track');
    passed('live reduced-motion toggle and resume', {}, run);
  } catch (error) { await diagnose(run, 'desktop-aircraft', error); throw error; } finally { await run.context.close(); }
}
async function mobile(browser, viewport = { width: 390, height: 844 }) {
  const run = await open(browser, { viewport }), { page } = run;
  try {
    await page.goto(base + '/v2/?v=aircraft-integration-mobile#skylabs-telemetry', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-telemetry-ready="true"][data-aircraft-chapter="1"]').waitFor({ timeout });
    await settle(page); await layout(page);
    assert.equal(await page.evaluate(() => '__v3Aircraft' in window), false, 'Production exposes no capture controls');
    await page.screenshot({ path: path.join(output, `mobile-${viewport.width}-telemetry.png`) });
    await chapter(page, 0); await layout(page);
    await page.screenshot({ path: path.join(output, `mobile-${viewport.width}-aircraft.png`) });
    await page.goBack();
    await page.waitForFunction(() => location.hash === '#skylabs-telemetry' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '1');
    await settle(page); await layout(page);
    await page.goForward();
    await page.waitForFunction(() => location.hash === '#skylabs-aircraft' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '0');
    await settle(page); await layout(page);
    // Both destinations remain keyboard navigable; no hidden third chapter.
    await page.locator('[data-aircraft-go="0"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-aircraft-go="1"]').evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Enter'); await page.waitForFunction(() => location.hash === '#skylabs-telemetry' && document.querySelector('[data-aircraft-hero]').dataset.aircraftChapter === '1'); await settle(page);
    passed(`mobile ${viewport.width}px deep link, Back/Forward, keyboard and layout`, {}, run);
  } catch (error) { await diagnose(run, `mobile-${viewport.width}-aircraft`, error); throw error; } finally { await run.context.close(); }
}
async function staticCase(browser, name, options) {
  const run = await open(browser, options), { page } = run;
  try {
    await page.goto(base + '/v2/?v=aircraft-integration-static#skylabs-aircraft', { waitUntil: 'domcontentloaded' });
    if (options.webglFailure) await page.locator('[data-aircraft-state="unavailable"]').waitFor({ timeout });
    assert.equal(await page.locator(aircraft + '.is-story').count(), 0, 'Static mode removes the long animation track');
    assert.equal(await page.locator('article[data-aircraft-chapter]').count(), 2, 'Exactly two actual static articles remain');
    for (const id of ['skylabs-aircraft', 'skylabs-telemetry']) {
      assert.equal(await page.locator('#' + id).isVisible(), true, 'Both static chapters remain readable');
      assert.equal(await page.locator('#' + id).getAttribute('aria-hidden'), null);
      assert.equal(await page.locator('#' + id).evaluate(element => element.inert), false);
    }
    await page.waitForFunction(() => { const image = document.querySelector('[data-aircraft-poster]'); return image.complete && image.naturalWidth > 0 && image.currentSrc.includes('stopped'); });
    if (!options.webglFailure) assert.equal(run.requests.filter(url => aircraftRequest.test(url)).length, 0, 'Static preference loads no aircraft renderer or CAD');
    await scrollTo(page, aircraft); await layout(page, false);
    await page.screenshot({ path: path.join(output, name + '.png') });
    assert.equal(await page.locator('#skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    passed(name, {}, run);
  } catch (error) { await diagnose(run, name, error); throw error; } finally { await run.context.close(); }
}
async function v3Regression(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v3/?v=shared-controller-regression', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-smooth'), null, 'v3 does not inherit v2 smoothing');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-background'), null, 'v3 does not inherit v2 background warming');
    const preloadDistance = await page.locator(aircraft).evaluate(root => root.getBoundingClientRect().top - innerHeight);
    if (preloadDistance > 420) assert.equal(run.requests.filter(url => aircraftRequest.test(url)).length, 0, 'v3 waits until its original preload margin');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames')), 0, 'v3 does not inherit offscreen warm draws');
    // v3 now also defers its aircraft below the hardware portfolio.
    await scrollTo(page, aircraft);
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout });
    await page.locator('[data-aircraft-phase="stopped"][data-aircraft-state="ready"]').waitFor({ timeout });
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-atmosphere')), 1, 'v3 retains automatic landing and sky');
    await chapter(page, 1, ''); await layout(page);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-atmosphere')), 0, 'v3 telemetry destination clears sky');
    assert.equal(await page.locator('#copy-telemetry a').first().getAttribute('href'), '/v3/projects/skylabs/boards/telemetry/');
    await chapter(page, 0, '');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-atmosphere')), 1, 'v3 reverse preserves accepted sky');
    passed('deferred v3 two-destination shared-controller regression', {}, run);
  } catch (error) { await diagnose(run, 'v3-regression', error); throw error; } finally { await run.context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); sourceContract();
  if (process.argv.includes('--source-only')) return;
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!process.argv.includes('--scene-only') && !process.argv.includes('--mobile-only')) {
      await staticCase(browser, 'reduced-motion', { reduced: true });
      await staticCase(browser, 'no-javascript', { js: false, viewport: { width: 390, height: 844 } });
      await staticCase(browser, 'save-data', { saveData: true });
      await staticCase(browser, 'short-viewport', { viewport: { width: 1440, height: 550 } });
      await staticCase(browser, 'webgl-failure', { webglFailure: true });
    }
    if (!process.argv.includes('--static-only')) {
      if (!process.argv.includes('--mobile-only')) await desktop(browser);
      await mobile(browser); await mobile(browser, { width: 320, height: 740 });
      if (!process.argv.includes('--mobile-only')) await v3Regression(browser);
    }
  } finally { await browser.close(); }
  console.log(`${evidence.length} v2 aircraft acceptance groups passed.`);
})().catch(error => { console.error(error); evidence.push({ name: 'failure', error: error.stack }); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
});

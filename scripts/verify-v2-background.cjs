/* v2-only background preparation acceptance. Run against a repository-root
 * HTTP server with Playwright installed. No test calls image.decode(), enables
 * capture controls, or scrolls before the initial readiness proof.
 * Software-WebGL durations are evidence, not real-device performance claims.
 * --source-only needs no browser; --static-only runs preference guards only.
 * --profile-only isolates the full cold 10Mbps/40ms readiness trace. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_BACKGROUND_OUT || '.codex-temp/v2-background';
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
// Explicit comparison-only mode for the old image-only Selected Work page.
// Never manufacture CAD readiness for a baseline that does not implement it.
const expectSelectedCAD = process.env.V2_BACKGROUND_EXPECT_SELECTED_CAD !== '0';
const aircraft = '[data-aircraft-hero]', selected = '[data-selected-work]';
const aircraftDependency = /\/assets\/(?:models\/aircraft\/|v3-aircraft-(?:scene|atmosphere|electronics)\.js)/;
const airframeBytes = /\/assets\/models\/aircraft\/skylabs-trainer\/airframe(?:\.meshopt)?\.glb(?:\.gz)?(?:\?|$)/;
const leadBytes = /\/assets\/models\/hero\/tramtrace\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
const telemetryBytes = /\/assets\/models\/hero\/telemetry\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
const evidence = [];
function sourceContract() {
  const v2 = fs.readFileSync('v2/index.html', 'utf8'), v3 = fs.readFileSync('v3/index.html', 'utf8');
  assert.match(v2, /<section[^>]*data-aircraft-hero[^>]*data-aircraft-background/, 'Only the requested v2 feature opts into background preparation');
  assert.match(v2, /data-selected-work/); assert.match(v2, /data-selected-image/);
  assert.doesNotMatch(v3, /data-aircraft-background|data-selected-work/, 'v3 markup retains its separate deferred experience');
  const selectedStart = v2.indexOf('data-selected-work'), aircraftStart = v2.indexOf('<section class="v3-aircraft', selectedStart);
  assert.ok(selectedStart >= 0 && aircraftStart > selectedStart, 'Selected Work precedes the aircraft section');
  const section = v2.slice(selectedStart, aircraftStart);
  const images = [...section.matchAll(/<img\b[^>]*data-selected-image[^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, 6, 'Framework collection and two supporting projects have six original images');
  for (const image of images) {
    assert.match(image, /\ssrc="[^"]+"/, 'Images have initial HTML sources without a scroll trigger');
    assert.match(image, /loading="eager"/, 'Below-fold selected images load from the initial viewport');
    assert.match(image, /fetchpriority="low"/, 'Selected images do not claim foreground priority');
    assert.match(image, /decoding="async"/, 'Image decoding is asynchronous');
  }
  evidence.push({ name: 'source-contract', images: images.length }); console.log('PASS source-contract');
}
function probe() {
  performance.setResourceTimingBufferSize(2000);
  const data = window.__v2BackgroundProbe = { scrolls: [], changes: [], longTasks: [], transportGates: [], cpuGates: [], selectedGates: [], fetches: [], contexts: [], visibility: [], selectedFirstLive: null };
  const nativeTimeout = window.setTimeout.bind(window), nativeFetch = window.fetch.bind(window), nativeContext = HTMLCanvasElement.prototype.getContext;
  window.setTimeout = (callback, delay, ...args) => {
    const root = document.querySelector('[data-aircraft-background]');
    if (root && delay === 4500 && root.dataset.aircraftTransportState === 'waiting-hero-bytes') data.transportGates.push({ t: performance.now(), delay });
    if (root && delay === 12000 && root.dataset.aircraftBackgroundState === 'warming') data.cpuGates.push({ t: performance.now(), delay });
    if (root && delay === 18000 && root.dataset.aircraftBackgroundState === 'warming') data.selectedGates.push({ t: performance.now(), delay });
    return nativeTimeout(callback, delay, ...args);
  };
  window.fetch = (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || String(args[0]);
    if (/\/assets\/models\/aircraft\/.+\.glb(?:\.gz)?(?:\?|$)/.test(url)) data.fetches.push({ url, t: performance.now() });
    return nativeFetch(...args);
  };
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (this.matches('[data-aircraft-canvas]') && /webgl/i.test(type)) {
      const root = this.closest('[data-aircraft-hero]'), hero = document.querySelector('[data-assembly]'), work = document.querySelector('[data-selected-work]'), bounds = root.getBoundingClientRect();
      data.contexts.push({ t: performance.now(), y: scrollY, top: bounds.top, bottom: bounds.bottom, viewportHeight: innerHeight, visible: bounds.top < innerHeight && bounds.bottom > 0, near: bounds.top < innerHeight + 420 && bounds.bottom > -420, promoted: root.dataset.aircraftBackgroundState === 'promoted', selectedGate: root.dataset.aircraftSelectedGate, modelsSettled: hero?.dataset.assemblyModelsSettled, heroState: hero?.dataset.assemblyState, cpuGateStart: data.cpuGates.at(-1)?.t ?? null, selectedReady: work?.dataset.selectedBackgroundReady, selectedState: work?.dataset.selectedState, selectedGateStart: data.selectedGates.at(-1)?.t ?? null });
    }
    return nativeContext.call(this, type, ...args);
  };
  const NativeIntersectionObserver = window.IntersectionObserver;
  if (NativeIntersectionObserver) window.IntersectionObserver = class extends NativeIntersectionObserver {
    constructor(callback, options) {
      super((entries, observer) => {
        callback(entries, observer);
        // Record after the real no-margin visibility callback has updated its
        // closure. A separate observer or two RAFs cannot establish this barrier.
        if (!options?.rootMargin) for (const entry of entries) if (entry.target.matches('[data-aircraft-hero]')) data.visibility.push({ t: performance.now(), y: scrollY, visible: entry.isIntersecting });
      }, options);
    }
  };
  addEventListener('scroll', () => data.scrolls.push({ t: performance.now(), y: scrollY }), { passive: true });
  const attributes = ['data-aircraft-transport-state', 'data-aircraft-background-state', 'data-aircraft-background-ready', 'data-aircraft-warm-frames', 'data-aircraft-frames', 'data-aircraft-landing', 'data-aircraft-telemetry-ready', 'data-assembly-models-ready', 'data-assembly-models-settled', 'data-image-decoded', 'data-selected-ready', 'data-selected-models-ready', 'data-selected-background-ready', 'data-selected-preparation-frames', 'data-selected-prepared-models', 'data-selected-warm-poses-completed', 'data-selected-warm-frames', 'data-selected-frames'];
  new MutationObserver(records => {
    for (const record of records) if (data.changes.length < 2000) data.changes.push({ t: performance.now(), attribute: record.attributeName, value: record.target.getAttribute(record.attributeName), tag: record.target.tagName, scrollY });
    if (!data.selectedFirstLive && records.some(record => record.attributeName === 'data-selected-frames')) {
      const work = document.querySelector('[data-selected-work]');
      if (Number(work?.dataset.selectedFrames) > 0) data.selectedFirstLive = { t: performance.now(), frame: Number(work.dataset.selectedFrames), progress: Number(work.dataset.selectedProgress), renderedProgress: Number(work.dataset.selectedRenderedProgress), mask: work.dataset.selectedWarmMask, lastDraw: work.dataset.selectedLastDraw ? JSON.parse(work.dataset.selectedLastDraw) : null };
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: attributes });
  try { new PerformanceObserver(list => data.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true }); } catch (_) { /* Unsupported performance entry type is not a test failure. */ }
}
async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 900 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript(probe);
  if (options.saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
  const page = await context.newPage(), requests = [], errors = [], shaders = [];
  page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType(), observedAt: Date.now() }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, requests, errors, shaders };
}
async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-aircraft-hero]'), work = document.querySelector('[data-selected-work]');
    return { scrollY, aircraftTop: root?.getBoundingClientRect().top, viewportHeight: innerHeight, aircraft: { ...root?.dataset }, selected: { ...work?.dataset }, hero: { ...document.querySelector('[data-assembly]')?.dataset }, images: [...document.querySelectorAll('[data-selected-image]')].map(image => ({ src: image.currentSrc || image.src, decoded: image.dataset.imageDecoded, complete: image.complete, width: image.naturalWidth, loading: image.loading, priority: image.fetchPriority })), probe: window.__v2BackgroundProbe, resources: performance.getEntriesByType('resource').filter(entry => /\/assets\//.test(entry.name)).map(entry => ({ name: entry.name, initiatorType: entry.initiatorType, start: entry.startTime, duration: entry.duration, responseEnd: entry.responseEnd, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })) };
  });
}
async function decodedImages(page) {
  await page.waitForFunction(() => {
    const work = document.querySelector('[data-selected-work]'), images = [...document.querySelectorAll('[data-selected-image]')];
    return work?.dataset.selectedReady === 'true' && images.length === 6 && images.every(image => image.dataset.imageDecoded === 'true' && image.complete && image.naturalWidth > 0);
  }, null, { timeout });
}
async function warmed(page) {
  await page.locator('[data-aircraft-background-ready="true"][data-aircraft-telemetry-ready="true"][data-aircraft-warm-frames="2"]').waitFor({ timeout });
}
async function selectedWarmed(page) {
  await page.locator('[data-selected-models-ready="6"][data-selected-background-ready="true"][data-selected-warm-frames="2"]').waitFor({ timeout });
}
function selectedPreparation(state) {
  assert.equal(state.selectedPreparationFrames,'6','Six individual models are submitted once before full composition warming');
  assert.deepEqual((state.selectedPreparedModels||'').split(',').sort(),['dual','esp32','logic','metro','pi','tramtrace'],'All six per-model GPU stages actually complete');
  assert.equal(state.selectedWarmPosesCompleted,'2','Both full-composition GPU poses have completed');
  assert.equal(state.selectedGPUPending,'false','No Selected-context preparation fence is pending at background readiness');
  assert.equal(state.selectedGPUCompletion,'complete','WebGL2 background readiness follows actual own-context completion');
  const measurements=JSON.parse(state.selectedPreparationMeasurements||'[]');
  assert.equal(measurements.length,8,'Uninterrupted preparation is finite: six model draws and two composition draws');
  assert.ok(measurements.every(item=>item.completed&&item.gpu?.state==='complete'),'Every declared completed stage has its real completion result');
  return{preparationFrames:6,warmPosesCompleted:2,measurements};
}
async function stableHidden(page) {
  const before = await page.locator(aircraft).evaluate(root => ({ live: Number(root.dataset.aircraftFrames || 0), warm: Number(root.dataset.aircraftWarmFrames || 0), landing: Number(root.dataset.aircraftLanding || 0) }));
  await page.waitForTimeout(1000);
  const after = await page.locator(aircraft).evaluate(root => ({ live: Number(root.dataset.aircraftFrames || 0), warm: Number(root.dataset.aircraftWarmFrames || 0), landing: Number(root.dataset.aircraftLanding || 0) }));
  assert.deepEqual(after, before, 'Background preparation has no hidden continuous rendering or landing progress');
  return after;
}
async function save(run, name, details = {}) {
  assert.deepEqual(run.errors, [], 'No unhandled browser errors'); assert.deepEqual(run.shaders, [], 'No shader errors');
  const state = await snapshot(run.page);
  fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify({ ...details, state, requests: run.requests }, null, 2) + '\n');
  evidence.push({ name, ...details }); console.log('PASS ' + name);
}
async function diagnostic(run, name, error) {
  const report = { error: error.stack, requests: run.requests };
  try { report.state = await snapshot(run.page); } catch (failure) { report.collectionError = failure.message; }
  fs.writeFileSync(path.join(output, name + '-failure.json'), JSON.stringify(report, null, 2) + '\n');
  await run.page.screenshot({ path: path.join(output, name + '-failure.png'), timeout: 30000, animations: 'disabled' }).catch(() => {});
}
function assertCPUGate(state) {
  // The accepted 420px entry observer may initialize just before the exact
  // visibility observer fires. Record that real geometry/promotion reason,
  // while genuinely distant no-scroll initialization retains both gates.
  for (const context of state.probe.contexts.filter(context => !context.visible && !context.near && !context.promoted)) {
    if (context.modelsSettled !== '3' && context.heroState !== 'unavailable') assert.ok(context.cpuGateStart !== null && context.t - context.cpuGateStart >= 11900, 'Offscreen renderer/CPU initialization waits for foreground settling or the 12s fallback');
    if (expectSelectedCAD && context.selectedReady !== 'true' && !['static', 'unavailable'].includes(context.selectedState)) assert.ok(context.selectedGateStart !== null && context.t - context.selectedGateStart >= 17900, 'Offscreen aircraft CPU waits for Selected Work preparation or its bounded 18s fallback');
  }
}
async function initialViewport(browser) {
  const run = await open(browser), { page } = run, started = Date.now();
  try {
    await page.goto(base + '/v2/?v=background-initial', { waitUntil: 'domcontentloaded' });
    await decodedImages(page); const imageReadyMs = Date.now() - started;
    assert.equal(await page.evaluate(() => scrollY), 0, 'All selected images decode without any scroll');
    await selectedWarmed(page); await warmed(page); const backgroundReadyMs = Date.now() - started;
    const state = await snapshot(page); assertCPUGate(state);
    assert.ok(state.probe.contexts.length > 0, 'Background readiness includes an actual renderer context');
    assert.equal(state.scrollY, 0); assert.ok(state.aircraftTop > state.viewportHeight + 420, 'Aircraft is still well below the initial viewport');
    assert.ok(state.probe.scrolls.every(sample => sample.y === 0), 'Readiness proof does not scroll and return to the top');
    assert.equal(state.aircraft.aircraftBackgroundState, 'ready');
    assert.equal(Number(state.aircraft.aircraftFrames || 0), 0, 'Warm draws are separate from live animation frames');
    assert.equal(Number(state.aircraft.aircraftLanding || 0), 0, 'The unseen landing has not advanced');
    assert.equal(state.aircraft.aircraftWarmFrames, '2');
    assert.equal(state.selected.selectedModelsReady, '6', 'All six actual Selected Work assemblies prepare without scrolling');
    assert.equal(state.selected.selectedWarmFrames, '2', 'Both Selected Work GPU poses are warmed once');
    selectedPreparation(state.selected);
    assert.equal(Number(state.selected.selectedFrames || 0), 0, 'Selected warm draws never count as live frames');
    assert.ok(run.requests.some(request => airframeBytes.test(request.url)), 'Aircraft bytes were requested from the initial viewport');
    assert.equal(run.requests.filter(request => telemetryBytes.test(request.url)).length, 1, 'Background aircraft and foreground hero share telemetry transport');
    assert.ok(state.images.every(image => image.loading === 'eager' && image.priority === 'low'), 'Decoded selected images retain eager, low-priority loading');
    assert.ok(state.probe.changes.filter(change => change.attribute === 'data-aircraft-frames').every(change => Number(change.value) === 0), 'No live frames were hidden during warmup');
    const hidden = await stableHidden(page); assert.deepEqual(hidden, { live: 0, warm: 2, landing: 0 });
    assert.equal(await page.locator(selected).evaluate(root => root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Selected Work has no offscreen infinite animation');
    await page.screenshot({ path: path.join(output, 'initial-viewport.png'), timeout: 30000, animations: 'disabled' });
    await save(run, 'no-scroll-background-ready', { imageReadyMs, backgroundReadyMs, hidden, timingEnvironment: 'Chromium software WebGL; not a real-device benchmark' });

    await page.locator(selected).evaluate(root => {
      const stage = root.querySelector('.v2-selected-stage'), track = root.querySelector('.v2-selected-track');
      scrollTo({ top: scrollY + track.getBoundingClientRect().top - (parseFloat(getComputedStyle(stage).top) || 0), behavior: 'instant' });
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-selected-work]');
      return root.dataset.selectedState === 'ready' && root.dataset.selectedWarmMask === 'false' && Number(root.dataset.selectedFrames) > 0;
    });
    const selectedFrames = Number(await page.locator(selected).getAttribute('data-selected-frames'));
    await page.waitForTimeout(700);
    assert.equal(Number(await page.locator(selected).getAttribute('data-selected-frames')), selectedFrames, 'Selected Work settles without an idle animation loop');
    assert.equal(await page.locator('canvas[data-selected-canvas]').count(), 1, 'One shared 3D canvas replaces the image-grid animation');
    await page.screenshot({ path: path.join(output, 'selected-work-ready.png'), timeout: 30000, animations: 'disabled' });
    const entry = Date.now();
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout });
    const landing = Number(await page.locator(aircraft).getAttribute('data-aircraft-landing'));
    assert.ok(landing < .7, 'First visible entry starts the preserved landing instead of skipping it');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames'), '2', 'Entry does not repeat the warm draw sequence');
    await save(run, 'prepared-entry-and-finite-selected-scene', { firstVisibleResponseMs: Date.now() - entry, landing, selectedFrames, selectedFirstLive: (await snapshot(page)).probe.selectedFirstLive });
  } catch (error) { await diagnostic(run, 'initial-viewport', error); throw error; } finally { await run.context.close(); }
}
async function heldTransport(browser) {
  const run = await open(browser, { viewport: { width: 390, height: 844 } }), { page, context } = run;
  const pending = { lead: [], aircraft: [] }, enteredResolvers = {};
  const entered = Object.fromEntries(['lead', 'aircraft'].map(kind => [kind, new Promise(resolve => { enteredResolvers[kind] = resolve; })]));
  const hold = kind => route => new Promise(resolve => {
    pending[kind].push(async () => { try { await route.continue(); } finally { resolve(); } });
    // request events can arrive before Playwright enters this route handler.
    // Confirm interception itself before asserting that bytes remain held.
    enteredResolvers[kind]();
  });
  await context.route(leadBytes, hold('lead')); await context.route(airframeBytes, hold('aircraft'));
  const release = async kind => { await Promise.all(pending[kind].splice(0).map(resume => resume())); };
  try {
    const navigationStarted = Date.now();
    const observedLead = page.waitForRequest(leadBytes), observedAircraft = page.waitForRequest(airframeBytes);
    const observedScene = page.waitForRequest(/\/assets\/v3-aircraft-scene\.js/), observedDecoder = page.waitForRequest(/\/assets\/vendor\/meshopt_decoder\.js/);
    await page.goto(base + '/v2/?v=background-held-transport', { waitUntil: 'domcontentloaded' });
    await Promise.all([observedLead, observedScene, observedDecoder]); await decodedImages(page);
    // Scripts, decoder and images are independent of foreground model bytes.
    // The bounded 4.5s policy may defer the large airframe transfer, but a
    // stalled lead cannot postpone it indefinitely or require user scrolling.
    await observedAircraft; await Promise.all([entered.lead, entered.aircraft]);
    const firstAirframe = run.requests.find(request => airframeBytes.test(request.url));
    const sceneRequest = run.requests.find(request => /\/assets\/v3-aircraft-scene\.js/.test(request.url));
    const decoderRequest = run.requests.find(request => /\/assets\/vendor\/meshopt_decoder\.js/.test(request.url));
    assert.ok(sceneRequest.observedAt <= firstAirframe.observedAt && decoderRequest.observedAt <= firstAirframe.observedAt, 'Scene code and decoder prepare before the large gated transfer');
    const airframeStartMs = firstAirframe.observedAt - navigationStarted;
    const gateState = await snapshot(page), fetch = gateState.probe.fetches[0], gate = gateState.probe.transportGates[0];
    assert.ok(gate && fetch && fetch.t - gate.t >= 4400, 'Held foreground bytes keep the large airframe transfer behind its 4.5s fallback gate');
    assertCPUGate(gateState);
    assert.ok(pending.lead.length > 0 && pending.aircraft.length > 0, 'Foreground and background model requests overlap while both transports are held');
    assert.equal(await page.evaluate(() => scrollY), 0, 'Simultaneous requests and image decoding need no viewport entry');
    assert.ok(Number(await page.locator('[data-assembly]').getAttribute('data-assembly-models-ready')) < 3, 'Held lead bytes keep the foreground model set genuinely incomplete');
    const menuStart = Date.now();
    await page.locator('[data-v2-menu]').click(); assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'), 'false');
    const menuRoundTripMs = Date.now() - menuStart;
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => scrollY > 50 && Number(document.querySelector('[data-assembly]').dataset.assemblyFrames) > 1);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), 0, 'Foreground keyboard scrolling does not animate the hidden aircraft');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-landing')), 0);
    await release('lead');
    // Go straight to telemetry before the aircraft bytes arrive. The late
    // background queue must not restore landing0 over this visible destination.
    await page.locator('[data-aircraft-go="1"]').click();
    await page.waitForFunction(() => location.hash === '#skylabs-telemetry' && Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) > .99);
    await page.waitForFunction(() => { const image = document.querySelector('[data-aircraft-poster]'); return image.complete && image.naturalWidth > 0; });
    assert.equal(await page.locator('[data-aircraft-poster]').evaluate(image => getComputedStyle(image).visibility), 'visible', 'Pending transport retains its poster');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-background-state'), 'promoted', 'Visible destination promotes pending background work');
    await release('aircraft');
    await page.waitForFunction(() => { const root = document.querySelector('[data-aircraft-hero]'); return root.dataset.aircraftTelemetryReady === 'true' && root.dataset.aircraftState === 'ready' && root.dataset.aircraftChapter === '1' && Number(root.dataset.aircraftRenderedProgress) === 1; }, null, { timeout });
    await page.waitForTimeout(800);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-rendered-progress')), 1, 'Late preparation cannot overwrite the requested endpoint');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-phase'), 'telemetry');
    assertCPUGate(await snapshot(page));
    await save(run, 'simultaneous-transport-foreground-input-and-early-promotion', { menuRoundTripMs, airframeStartMs, gatedDelayMs: fetch.t - gate.t, genuineHeldRequests: true, policy: 'All hero bytes or 4.5s fallback; observed timings include software-renderer blocking' });
  } catch (error) { await diagnostic(run, 'held-transport', error); throw error; } finally {
    await release('lead').catch(() => {}); await release('aircraft').catch(() => {}); await context.close();
  }
}
async function interruptedInitialization(browser) {
  const run = await open(browser), { page, context } = run;
  const pending = []; let enteredResolve, released = false;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  await context.route(airframeBytes, route => released ? route.continue() : new Promise(resolve => {
    pending.push(async () => { try { await route.continue(); } finally { resolve(); } });
    enteredResolve();
  }));
  const release = async () => { released = true; await Promise.all(pending.splice(0).map(resume => resume())); };
  try {
    await page.goto(base + '/v2/?v=background-interrupted-initialization', { waitUntil: 'domcontentloaded' });
    await entered;
    // Hold inside the background initialize() await, rather than merely during
    // its source or foreground gate, to reproduce the busy-generation race.
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftBackgroundState === 'warming' && root.dataset.aircraftState === 'loading' && window.__v2BackgroundProbe.contexts.some(context => !context.visible);
    }, null, { timeout });
    assert.ok(pending.length > 0, 'Aircraft initialization is genuinely held awaiting model bytes');
    const held = await snapshot(page); assertCPUGate(held);
    assert.equal(held.scrollY, 0); assert.equal(Number(held.aircraft.aircraftWarmFrames || 0), 0);
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.locator('[data-aircraft-background-state="promoted"]').waitFor();
    const visibilityCountAtEntry = await page.evaluate(() => window.__v2BackgroundProbe.visibility.length);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(count => {
      const samples = window.__v2BackgroundProbe.visibility;
      return scrollY === 0 && document.querySelector('[data-aircraft-hero]').getBoundingClientRect().top > innerHeight + 420 && samples.length > count && samples.at(-1).visible === false;
    }, visibilityCountAtEntry);
    const returned = await snapshot(page);
    assert.notEqual(returned.aircraft.aircraftBackgroundReady, 'true', 'The interrupted generation has not completed while its transport is held');
    const scrollCountAtReturn = returned.probe.scrolls.length;
    await release();
    // No further scroll, resize, visibility event, or capture API is triggered.
    // The canceled generation must re-arm itself when its pending work ends.
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftBackgroundReady === 'true' && root.dataset.aircraftTelemetryReady === 'true';
    }, null, { timeout });
    const recovered = await snapshot(page), warm = Number(recovered.aircraft.aircraftWarmFrames || 0);
    assert.equal(recovered.scrollY, 0);
    assert.equal(recovered.probe.scrolls.length, scrollCountAtReturn, 'Background recovery does not require another scroll event');
    assert.equal(recovered.aircraft.aircraftBackgroundState, 'ready');
    assert.ok(warm >= 2 && warm <= 4, 'Interrupted preparation completes with a finite two to four warm draws');
    const hidden = await stableHidden(page);
    assert.deepEqual(hidden, { live: 0, warm, landing: 0 }, 'Unloaded rapid entry does not start live playback after returning to the top');
    await save(run, 'rapid-enter-exit-background-recovery', { heldInitialization: true, actualVisibilityExitObserved: true, warmDraws: warm, scrollCountAtReturn, hidden });
  } catch (error) { await diagnostic(run, 'interrupted-initialization', error); throw error; } finally {
    await release().catch(() => {}); await context.close();
  }
}
async function liveWarmMask(browser) {
  const run = await open(browser), { page, context } = run;
  await context.addInitScript(() => {
    const idle = window.requestIdleCallback.bind(window), raf = window.requestAnimationFrame.bind(window);
    const cancelIdle = window.cancelIdleCallback.bind(window), cancelRAF = window.cancelAnimationFrame.bind(window);
    const idleQueue = new Map(), liveQueue = new Map(); let next = -1, idleDispatched = 0;
    const samples = [], control = window.__v2WarmMaskControl = { holdLive: false };
    const aircraftCall = () => /v3-aircraft-hero\.js/.test(new Error().stack);
    const read = label => {
      const root = document.querySelector('[data-aircraft-hero]'), canvas = root?.querySelector('canvas'), poster = root?.querySelector('[data-aircraft-poster]');
      if (!root || !canvas || !poster) return { label };
      return { label, t: performance.now(), y: scrollY, live: Number(root.dataset.aircraftFrames || 0), warm: Number(root.dataset.aircraftWarmFrames || 0), mask: root.dataset.aircraftWarmMask, readyClass: root.classList.contains('is-ready'), canvasVisibility: getComputedStyle(canvas).visibility, canvasOpacity: Number(getComputedStyle(canvas).opacity), posterVisibility: getComputedStyle(poster).visibility, progress: Number(root.dataset.aircraftRenderedProgress || 0), chapter: root.dataset.aircraftChapter, phase: root.dataset.aircraftPhase };
    };
    window.requestIdleCallback = (callback, options) => {
      if (!aircraftCall()) return idle(callback, options);
      const id = next--; idleQueue.set(id, () => idle(deadline => { callback(deadline); idleDispatched++; }, options)); return id;
    };
    window.cancelIdleCallback = id => { if (!idleQueue.delete(id)) cancelIdle(id); };
    window.requestAnimationFrame = callback => {
      if (callback.name !== 'render' || !aircraftCall()) return raf(callback);
      const observed = time => { samples.push(read('before-live')); callback(time); samples.push(read('after-live')); };
      if (!control.holdLive) return raf(observed);
      const id = next--; liveQueue.set(id, observed); return id;
    };
    window.cancelAnimationFrame = id => { if (!liveQueue.delete(id)) cancelRAF(id); };
    control.releaseIdle = () => {
      const nextEntry = idleQueue.entries().next().value;
      if (!nextEntry) return false;
      idleQueue.delete(nextEntry[0]); nextEntry[1](); return true;
    };
    control.releaseLive = () => {
      control.holdLive = false;
      for (const callback of liveQueue.values()) raf(callback);
      liveQueue.clear();
    };
    control.state = () => ({ ...read('snapshot'), idlePending: idleQueue.size, idleDispatched, livePending: liveQueue.size, samples });
    new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'data-aircraft-warm-mask')) samples.push(read('mask-change'));
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-aircraft-warm-mask'] });
  });
  const state = () => page.evaluate(() => window.__v2WarmMaskControl.state());
  const releaseIdle = async () => {
    await page.waitForFunction(() => window.__v2WarmMaskControl.state().idlePending > 0);
    const dispatched = await page.evaluate(() => window.__v2WarmMaskControl.state().idleDispatched);
    assert.equal(await page.evaluate(() => window.__v2WarmMaskControl.releaseIdle()), true);
    await page.waitForFunction(previous => window.__v2WarmMaskControl.state().idleDispatched > previous, dispatched);
  };
  const assertMasked = (sample, message) => {
    assert.equal(sample.mask, 'true', message); assert.equal(sample.readyClass, false, message);
    assert.equal(sample.canvasVisibility, 'hidden', message); assert.equal(sample.posterVisibility, 'visible', message);
  };
  try {
    await page.goto(base + '/v2/?v=background-live-warm-mask', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__v2WarmMaskControl.state().idlePending > 0);
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.waitForFunction(() => {
      const sample = window.__v2WarmMaskControl.state(), root = document.querySelector('[data-aircraft-hero]');
      return sample.live > 0 && sample.canvasOpacity >= .99 && sample.mask === 'false' && root.dataset.aircraftTelemetryReady === 'true';
    }, null, { timeout });
    const firstLive = await state();
    assert.equal(firstLive.warm, 0, 'A real visible frame precedes any completed background warm draw');
    assert.equal(firstLive.canvasVisibility, 'visible');
    const visibilityCount = await page.evaluate(() => window.__v2BackgroundProbe.visibility.length);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(count => {
      const samples = window.__v2BackgroundProbe.visibility;
      return scrollY === 0 && samples.length > count && samples.at(-1).visible === false;
    }, visibilityCount);
    // Release the old generation only after the actual exit callback. Its
    // finally must resume preparation while the previous live canvas is opaque.
    await releaseIdle();
    await page.waitForFunction(() => {
      const sample = window.__v2WarmMaskControl.state();
      return sample.mask === 'true' && sample.idlePending > 0;
    });
    const remasked = await state(); assertMasked(remasked, 'Resumed warming immediately masks the previously visible canvas');
    const duringFade = remasked.samples.find(sample => sample.label === 'mask-change' && sample.live > 0 && sample.mask === 'true');
    assert.ok(duringFade && duringFade.canvasOpacity > 0, 'The test observes the former live canvas during its opacity fade');
    assertMasked(duringFade, 'Visibility masking covers the entire opacity fade and shows the poster immediately');
    await releaseIdle(); // resumed initialize/telemetry phase
    await releaseIdle(); // first offscreen warm pose: telemetry progress 1
    await page.waitForFunction(() => { const sample = window.__v2WarmMaskControl.state(); return sample.warm === 1 && sample.idlePending > 0; });
    const warmedTelemetry = await state(); assertMasked(warmedTelemetry, 'The temporary telemetry warm pose stays hidden');
    assert.equal(warmedTelemetry.live, remasked.live, 'Warm drawing never increments the live-frame counter');
    // Hold only the controller's real render callback. Native scroll and both
    // production IntersectionObservers continue, exposing the pre-draw interval.
    await page.evaluate(() => { window.__v2WarmMaskControl.holdLive = true; });
    await page.locator(aircraft).evaluate(root => {
      const stage = root.querySelector('[data-aircraft-stage]'), track = root.querySelector('.v3-aircraft-track');
      const distance = parseFloat(track.style.height) - stage.clientHeight;
      scrollTo({ top: scrollY + root.getBoundingClientRect().top + distance * .3, behavior: 'instant' });
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]');
      return root.dataset.aircraftBackgroundState === 'promoted' && Math.abs(Number(root.dataset.aircraftProgress) - .3) < .002 && window.__v2WarmMaskControl.state().livePending > 0;
    });
    assertMasked(await state(), 'Rapid re-entry remains masked until a current live draw completes');
    await releaseIdle(); // cancel the old landing-restoration continuation
    await page.waitForFunction(() => window.__v2WarmMaskControl.state().idlePending === 0);
    const canceled = await state(); assertMasked(canceled, 'Canceled warm completion cannot unmask the temporary pose');
    assert.equal(canceled.warm, 1, 'Canceled restoration does not draw landing zero over the new destination');
    assert.equal(canceled.live, warmedTelemetry.live);
    // The .3 jump from top exceeds the production .18 discontinuity threshold,
    // so its first live pose must already equal the native target (no easing).
    const target = Number(await page.locator(aircraft).getAttribute('data-aircraft-progress'));
    await page.evaluate(() => window.__v2WarmMaskControl.releaseLive());
    await page.waitForFunction(({ previous, target }) => {
      const sample = window.__v2WarmMaskControl.state();
      return sample.live > previous && sample.mask === 'false' && Math.abs(sample.progress - target) < .00001;
    }, { previous: canceled.live, target });
    const final = await state();
    assert.equal(final.canvasVisibility, 'visible'); assert.equal(final.posterVisibility, 'hidden'); assert.equal(final.readyClass, true);
    assert.equal(final.chapter, '0'); assert.notEqual(final.phase, 'telemetry'); assert.equal(final.warm, 1);
    const firstUnmasked = final.samples.find(sample => sample.label === 'after-live' && sample.live > canceled.live);
    assert.ok(firstUnmasked && firstUnmasked.mask === 'false' && Math.abs(firstUnmasked.progress - target) < .00001, 'The first unmasked live frame represents the current scroll pose, not a stale warm endpoint');
    await save(run, 'live-frame-resumed-warm-mask-and-rapid-reentry', { firstLive, duringFade, remasked, warmedTelemetry, canceled, final, target, schedulingControl: 'Only production aircraft idle callbacks and its live render RAF are temporarily held; native scroll and visibility observers run normally' });
  } catch (error) { await diagnostic(run, 'live-warm-mask', error); throw error; } finally { await context.close(); }
}
async function throttledWarmTrace(browser) {
  const run = await open(browser), { page, context } = run;
  const network = { latency: 40, downloadThroughput: 10_000_000 / 8, uploadThroughput: 10_000_000 / 8, connectionType: 'wifi' };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });
  try {
    const started = Date.now();
    await page.goto(base + '/v2/?v=background-throttled-full-warm', { waitUntil: 'domcontentloaded' });
    await decodedImages(page); const imageReadyMs = Date.now() - started;
    if (expectSelectedCAD) await selectedWarmed(page);
    await warmed(page); await page.locator('[data-assembly-models-ready="3"]').waitFor({ timeout }); const backgroundReadyMs = Date.now() - started;
    const selectedBefore = await page.locator(selected).evaluate(root => ({ live: root.dataset.selectedFrames, warm: root.dataset.selectedWarmFrames, preparation:root.dataset.selectedPreparationFrames, completed:root.dataset.selectedWarmPosesCompleted }));
    const hidden = await stableHidden(page), state = await snapshot(page); assertCPUGate(state);
    if (expectSelectedCAD) {
      assert.deepEqual({ live: state.selected.selectedFrames, warm: state.selected.selectedWarmFrames, preparation:state.selected.selectedPreparationFrames, completed:state.selected.selectedWarmPosesCompleted }, selectedBefore, 'Selected Work is also stable during the measured hidden idle interval');
      assert.equal(Number(state.selected.selectedFrames || 0), 0); assert.equal(state.selected.selectedWarmFrames, '2');
    } else {
      assert.equal(await page.locator('canvas[data-selected-canvas]').count(), 0, 'The declared baseline genuinely has no Selected CAD renderer');
      assert.notEqual(state.selected.selectedSceneReady, 'true'); assert.notEqual(state.selected.selectedBackgroundReady, 'true');
      assert.equal(state.resources.filter(resource => /\/assets\/models\/selected\//.test(resource.name)).length, 0, 'Image-only baseline has no Selected geometry transport');
    }
    assert.equal(state.hero.assemblyModelsReady, '3', 'Measurement continues through all three actual hero assemblies');
    assert.equal(state.scrollY, 0); assert.ok(state.aircraftTop > state.viewportHeight + 420);
    assert.ok(state.probe.scrolls.every(sample => sample.y === 0), 'The complete throttled trace stays in the initial viewport');
    assert.equal(state.aircraft.aircraftBackgroundState, 'ready');
    assert.deepEqual(hidden, { live: 0, warm: 2, landing: 0 });
    assert.equal(state.images.length, 6); assert.ok(state.images.every(image => image.decoded === 'true' && image.complete && image.width > 0));
    assert.ok(state.probe.contexts.length > 0, 'The measured horizon includes construction and both GPU warm draws');
    const resourceBytes = Object.fromEntries(['transferSize', 'encodedBodySize', 'decodedBodySize'].map(key => [key, state.resources.reduce((sum, resource) => sum + resource[key], 0)]));
    const longTasks = state.probe.longTasks;
    const firstChange = (attribute, value) => state.probe.changes.find(change => change.attribute === attribute && change.value === value)?.t ?? null;
    const milestones = { imagesDecodedMs: firstChange('data-selected-ready', 'true'), allHeroReadyMs: firstChange('data-assembly-models-ready', '3'), allSelectedModelsReadyMs: expectSelectedCAD ? firstChange('data-selected-models-ready', '6') : null, selectedGPUWarmMs: expectSelectedCAD ? Number(state.selected.selectedBackgroundReadyMs) : null, aircraftGPUWarmMs: Number(state.aircraft.aircraftBackgroundReadyMs) };
    const resourcesByKind = Object.fromEntries(Object.entries({ images: /\.(?:webp|png|jpe?g|svg)(?:\?|$)/i, selectedPacks: /\/models\/selected\//, heroPacks: /\/models\/hero\/.*\.(?:gz|bin)(?:\?|$)/, aircraftPacks: /\/models\/aircraft\// }).map(([kind, pattern]) => [kind, state.resources.filter(resource => pattern.test(resource.name))]));
    await save(run, 'cold-10mbps-through-gpu-warm', {
      network, cacheDisabled: true, imageReadyMs, backgroundReadyMs, hidden, resourceBytes,
      milestones, resourcesByKind,
      selectedCAD: expectSelectedCAD ? { present: true, modelsReady: 6, warmFrames: 2, gpuReady: true, ...selectedPreparation(state.selected), lastDraw: state.selected.selectedLastDraw ? JSON.parse(state.selected.selectedLastDraw) : null } : { present: false, modelsReady: null, warmFrames: null, gpuReady: null, note: 'This baseline has image-only Selected Work. CAD readiness is inapplicable, not a measured success.' },
      resourceCount: state.resources.length,
      longTaskSummary: { count: longTasks.length, totalMs: longTasks.reduce((sum, task) => sum + task.duration, 0), longestMs: Math.max(0, ...longTasks.map(task => task.duration)) },
      measurementHorizon: expectSelectedCAD ? 'Initial navigation through six decoded Selected Work images and six actual CAD models, both Selected GPU warm poses, aircraft telemetry attachment, both aircraft GPU warm draws, and one second of hidden idle' : 'Image-only baseline: initial navigation through six decoded Selected Work images, all three hero models, aircraft telemetry attachment, both aircraft GPU warm draws, and one second of hidden idle. Selected CAD does not exist in this baseline.',
      fixture: 'Standard Python HTTP server: uncompressed HTTP responses, unlike the hero gzip-response profiling fixture; precompressed asset files retain their own format',
      timingEnvironment: 'Single cold Chromium software-WebGL trace at 10 Mbps / 40 ms; not a real-device benchmark or a gzip-fixture comparison'
    });
  } catch (error) { await diagnostic(run, 'throttled-full-warm', error); throw error; } finally { await context.close(); }
}
async function deepLink(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v2/?v=background-direct-link#skylabs-telemetry', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const root = document.querySelector('[data-aircraft-hero]'); return root.dataset.aircraftTelemetryReady === 'true' && root.dataset.aircraftChapter === '1' && root.dataset.aircraftState === 'ready' && Number(root.dataset.aircraftRenderedProgress) === 1; }, null, { timeout });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => location.hash), '#skylabs-telemetry');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-rendered-progress')), 1);
    assert.equal(await page.locator('#copy-skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    await save(run, 'initial-deep-link-promotes-without-warm-pose-reset');
  } catch (error) { await diagnostic(run, 'deep-link', error); throw error; } finally { await run.context.close(); }
}
async function failedTransport(browser) {
  const run = await open(browser), { page, context } = run;
  await context.route(airframeBytes, route => route.abort());
  try {
    await page.goto(base + '/v2/?v=background-failed-transport', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-state="unavailable"]').waitFor({ timeout }); await decodedImages(page);
    assert.equal(await page.locator(aircraft + '.is-story').count(), 0, 'Failed background transport restores readable static content');
    assert.equal(await page.locator('article[data-aircraft-chapter]').count(), 2);
    for (const id of ['skylabs-aircraft', 'skylabs-telemetry']) {
      assert.equal(await page.locator('#' + id).isVisible(), true); assert.equal(await page.locator('#' + id).getAttribute('aria-hidden'), null);
    }
    assert.notEqual(await page.locator(aircraft).getAttribute('data-aircraft-background-ready'), 'true', 'Failure never claims successful background preparation');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-background-state'), 'unavailable');
    assert.equal(await page.locator('#skylabs-telemetry a').first().getAttribute('href'), '/v2/projects/skylabs/boards/telemetry/');
    await save(run, 'failed-background-transport-readable-fallback');
  } catch (error) { await diagnostic(run, 'failed-transport', error); throw error; } finally { await context.close(); }
}
async function selectedGate(browser, mode) {
  const run = await open(browser), { page, context } = run;
  const heldPack = /\/assets\/models\/selected\/esp32\.idx\.bin\.gz(?:\?|$)/;
  let released = false; const pending = [];
  await context.route(heldPack, route => {
    if (mode === 'failure') return route.abort();
    if (released) return route.continue();
    return new Promise(resolve => pending.push(async () => { try { await route.continue(); } finally { resolve(); } }));
  });
  const release = async () => { released = true; await Promise.all(pending.splice(0).map(resume => resume())); };
  const name = 'selected-gate-' + mode;
  try {
    const requested = page.waitForRequest(heldPack);
    await page.goto(base + '/v2/?v=' + name, { waitUntil: 'domcontentloaded' }); await requested;
    if (mode === 'failure') {
      await page.locator('[data-selected-state="unavailable"]').waitFor({ timeout });
      await page.locator('[data-aircraft-selected-gate="unavailable"]').waitFor({ timeout });
      await warmed(page); await decodedImages(page);
      const state = await snapshot(page); assertCPUGate(state);
      assert.equal(state.scrollY, 0); assert.equal(state.aircraft.aircraftSelectedGate, 'unavailable', 'A failed Selected pack promptly resolves the dependency instead of waiting for timeout');
      assert.ok(state.probe.contexts.length > 0 && state.probe.contexts.every(sample => sample.selectedState === 'unavailable' && sample.selectedGate === 'unavailable'), 'Actual aircraft initialization observes the failed dependency result');
      assert.equal(await page.locator(selected + '.is-scene').count(), 0);
      assert.equal(await page.locator(selected + ' [data-selected-chapter]').count(), 2);
      for (const image of await page.locator('[data-selected-image]').all()) assert.equal(await image.isVisible(), true, 'Failed Selected geometry retains its image fallback');
      assert.equal(await page.locator(selected + ' [data-selected-chapter] a[href]').count(), 6);
      await save(run, name, { dependencyFailure: true, fallbackImages: 6, fallbackLinks: 6 });
      return;
    }
    await page.locator('[data-aircraft-selected-gate="waiting"]').waitFor({ timeout });
    assert.ok(pending.length > 0, 'A real Selected geometry response remains held');
    const waiting = await snapshot(page);
    assert.equal(waiting.scrollY, 0); assert.equal(waiting.probe.contexts.length, 0, 'Distant aircraft has not allocated a context while the Selected dependency is pending');
    assert.notEqual(waiting.selected.selectedBackgroundReady, 'true');
    if (mode === 'timeout') {
      await page.locator('[data-aircraft-selected-gate="timeout"]').waitFor({ timeout }); await warmed(page);
      const timedOut = await snapshot(page); assertCPUGate(timedOut);
      assert.equal(timedOut.scrollY, 0); assert.ok(pending.length > 0, 'Selected remains genuinely blocked when the bounded aircraft fallback completes');
      assert.ok(timedOut.probe.scrolls.every(sample => sample.y === 0), 'The bounded fallback requires no user entry');
      assert.ok(timedOut.probe.contexts.length > 0 && timedOut.probe.contexts.every(sample => !sample.visible && !sample.near && !sample.promoted && sample.selectedGate === 'timeout' && sample.t - sample.selectedGateStart >= 17900), 'Distant aircraft initialization occurs only after its 18s deadline');
      assert.equal(Number(timedOut.aircraft.aircraftFrames || 0), 0); assert.equal(timedOut.aircraft.aircraftWarmFrames, '2');
      await release(); await selectedWarmed(page); await stableHidden(page);
      await save(run, name, { waiting, timedOut, boundedFallbackMs: 18000 });
    } else {
      assert.equal(mode, 'direct-entry');
      await page.locator(aircraft).evaluate(root => {
        const stage = root.querySelector('[data-aircraft-stage]'), track = root.querySelector('.v3-aircraft-track');
        const distance = parseFloat(track.style.height) - stage.clientHeight;
        scrollTo({ top: scrollY + root.getBoundingClientRect().top + distance + 1, behavior: 'instant' });
      });
      await page.waitForFunction(() => { const root = document.querySelector('[data-aircraft-hero]'); return root.dataset.aircraftTelemetryReady === 'true' && root.dataset.aircraftChapter === '1' && Number(root.dataset.aircraftRenderedProgress) === 1; }, null, { timeout });
      const entered = await snapshot(page); assertCPUGate(entered);
      assert.ok(pending.length > 0, 'Direct entry completes while Selected geometry is still blocked');
      assert.notEqual(entered.selected.selectedBackgroundReady, 'true');
      assert.ok(entered.probe.contexts.some(sample => (sample.visible || sample.near || sample.promoted) && sample.t - sample.selectedGateStart < 17900), 'Actual entry bypasses the pending 18s dependency gate');
      assert.equal(Number(entered.aircraft.aircraftWarmFrames || 0), 0, 'Direct entry uses live rendering without offscreen warm poses');
      await release(); await selectedWarmed(page); await page.waitForTimeout(700);
      assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-rendered-progress')), 1, 'Late Selected completion cannot replace the chosen aircraft destination');
      await save(run, name, { waiting, entered, bypassReason: 'Actual native scroll enters the aircraft visibility/420px preparation region' });
    }
  } catch (error) { await diagnostic(run, name, error); throw error; } finally { await release().catch(() => {}); await context.close(); }
}
async function guard(browser, name, options) {
  const run = await open(browser, options), { page } = run;
  try {
    await page.goto(base + '/v2/?v=background-' + name, { waitUntil: 'domcontentloaded' }); await decodedImages(page);
    await page.waitForTimeout(800);
    assert.equal(run.requests.filter(request => aircraftDependency.test(request.url)).length, 0, 'Preference guard skips background aircraft transport and scene dependencies');
    assert.equal(await page.locator(aircraft + '.is-story').count(), 0, 'Preference guard keeps compact readable aircraft content');
    assert.notEqual(await page.locator(aircraft).getAttribute('data-aircraft-background-ready'), 'true');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames')), 0);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await save(run, name + '-background-guard');
  } catch (error) { await diagnostic(run, name, error); throw error; } finally { await run.context.close(); }
}
async function v3Deferred(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v3/?v=background-isolation', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hardware-portfolio][data-model="ready"]').waitFor({ timeout }); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-background'), null);
    const distance = await page.locator(aircraft).evaluate(root => root.getBoundingClientRect().top - innerHeight);
    // v3's 900px cover naturally puts the story inside its original 420px
    // preload margin. That proximity loading is not v2 background warming.
    if (distance > 420) assert.equal(run.requests.filter(request => aircraftDependency.test(request.url)).length, 0, 'v3 does not fetch aircraft outside its accepted preload margin');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames')), 0, 'v3 has no offscreen warm draws');
    assert.notEqual(await page.locator(aircraft).getAttribute('data-aircraft-background-ready'), 'true');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), 0);
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-landing')), 0, 'v3 does not autoplay before visible entry');
    await save(run, 'v3-retains-proximity-deferred-loading', { distanceFromViewport: distance, preloadMargin: 420 });
  } catch (error) { await diagnostic(run, 'v3-isolation', error); throw error; } finally { await run.context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); sourceContract();
  if (process.argv.includes('--source-only')) return;
  assert.ok(expectSelectedCAD || process.argv.includes('--profile-only'), 'V2_BACKGROUND_EXPECT_SELECTED_CAD=0 is reserved for the explicit --profile-only baseline comparison');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (process.argv.includes('--profile-only')) { await throttledWarmTrace(browser); return; }
    await guard(browser, 'reduced-motion', { reduced: true });
    await guard(browser, 'save-data', { saveData: true });
    await guard(browser, 'short-viewport', { viewport: { width: 1440, height: 550 } });
    if (!process.argv.includes('--static-only')) {
      await initialViewport(browser); await heldTransport(browser); await interruptedInitialization(browser); await liveWarmMask(browser); await selectedGate(browser, 'timeout'); await selectedGate(browser, 'direct-entry'); await selectedGate(browser, 'failure'); await throttledWarmTrace(browser); await deepLink(browser); await failedTransport(browser); await v3Deferred(browser);
    }
    console.log(`${evidence.length} v2 background preparation groups passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); evidence.push({ name: 'failure', error: error.stack }); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
});

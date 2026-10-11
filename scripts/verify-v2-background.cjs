/* v2-only background preparation acceptance. Run against a repository-root
 * HTTP server with Playwright installed. No test calls image.decode(), enables
 * capture controls, or scrolls before the initial readiness proof.
 * Software-WebGL durations are evidence, not real-device performance claims.
 * --source-only needs no browser; --static-only runs preference guards only. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_BACKGROUND_OUT || '.codex-temp/v2-background';
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
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
  const data = window.__v2BackgroundProbe = { scrolls: [], changes: [], longTasks: [] };
  addEventListener('scroll', () => data.scrolls.push({ t: performance.now(), y: scrollY }), { passive: true });
  const attributes = ['data-aircraft-transport-state', 'data-aircraft-background-state', 'data-aircraft-background-ready', 'data-aircraft-warm-frames', 'data-aircraft-frames', 'data-aircraft-landing', 'data-aircraft-telemetry-ready', 'data-assembly-models-ready', 'data-assembly-models-settled', 'data-image-decoded', 'data-selected-ready'];
  new MutationObserver(records => {
    for (const record of records) if (data.changes.length < 2000) data.changes.push({ t: performance.now(), attribute: record.attributeName, value: record.target.getAttribute(record.attributeName), tag: record.target.tagName, scrollY });
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
    return { scrollY, aircraftTop: root?.getBoundingClientRect().top, viewportHeight: innerHeight, aircraft: { ...root?.dataset }, selected: { ...work?.dataset }, images: [...document.querySelectorAll('[data-selected-image]')].map(image => ({ src: image.currentSrc || image.src, decoded: image.dataset.imageDecoded, complete: image.complete, width: image.naturalWidth, loading: image.loading, priority: image.fetchPriority })), probe: window.__v2BackgroundProbe, resources: performance.getEntriesByType('resource').filter(entry => /\/assets\/(?:models\/aircraft\/|images\/|models\/hero\/)/.test(entry.name)).map(entry => ({ name: entry.name, start: entry.startTime, duration: entry.duration, transferSize: entry.transferSize })) };
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
async function initialViewport(browser) {
  const run = await open(browser), { page } = run, started = Date.now();
  try {
    await page.goto(base + '/v2/?v=background-initial', { waitUntil: 'domcontentloaded' });
    await decodedImages(page); const imageReadyMs = Date.now() - started;
    assert.equal(await page.evaluate(() => scrollY), 0, 'All selected images decode without any scroll');
    await warmed(page); const backgroundReadyMs = Date.now() - started;
    const state = await snapshot(page);
    assert.equal(state.scrollY, 0); assert.ok(state.aircraftTop > state.viewportHeight + 420, 'Aircraft is still well below the initial viewport');
    assert.ok(state.probe.scrolls.every(sample => sample.y === 0), 'Readiness proof does not scroll and return to the top');
    assert.equal(state.aircraft.aircraftBackgroundState, 'ready');
    assert.equal(Number(state.aircraft.aircraftFrames || 0), 0, 'Warm draws are separate from live animation frames');
    assert.equal(Number(state.aircraft.aircraftLanding || 0), 0, 'The unseen landing has not advanced');
    assert.equal(state.aircraft.aircraftWarmFrames, '2');
    assert.ok(run.requests.some(request => airframeBytes.test(request.url)), 'Aircraft bytes were requested from the initial viewport');
    assert.equal(run.requests.filter(request => telemetryBytes.test(request.url)).length, 1, 'Background aircraft and foreground hero share telemetry transport');
    assert.ok(state.images.every(image => image.loading === 'eager' && image.priority === 'low'), 'Decoded selected images retain eager, low-priority loading');
    assert.ok(state.probe.changes.filter(change => change.attribute === 'data-aircraft-frames').every(change => Number(change.value) === 0), 'No live frames were hidden during warmup');
    const hidden = await stableHidden(page); assert.deepEqual(hidden, { live: 0, warm: 2, landing: 0 });
    assert.equal(await page.locator(selected).evaluate(root => root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'Selected Work has no offscreen infinite animation');
    await page.screenshot({ path: path.join(output, 'initial-viewport.png'), timeout: 30000, animations: 'disabled' });
    await save(run, 'no-scroll-background-ready', { imageReadyMs, backgroundReadyMs, hidden, timingEnvironment: 'Chromium software WebGL; not a real-device benchmark' });

    await page.locator('#work').evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().top - 90, behavior: 'instant' }));
    await page.waitForFunction(() => ['running', 'complete'].includes(document.querySelector('[data-framework-collection]')?.dataset.frameworkMotion));
    await page.waitForFunction(() => document.querySelector('[data-framework-collection]')?.dataset.frameworkMotion === 'complete');
    await page.waitForFunction(() => document.querySelector('[data-selected-work]').getAnimations({ subtree: true }).every(animation => !['running', 'pending'].includes(animation.playState)));
    await page.screenshot({ path: path.join(output, 'selected-work-ready.png'), timeout: 30000, animations: 'disabled' });
    const entry = Date.now();
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.locator('[data-aircraft-state="landing"]').waitFor({ timeout });
    const landing = Number(await page.locator(aircraft).getAttribute('data-aircraft-landing'));
    assert.ok(landing < .7, 'First visible entry starts the preserved landing instead of skipping it');
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-warm-frames'), '2', 'Entry does not repeat the warm draw sequence');
    await save(run, 'prepared-entry-and-finite-selected-motion', { firstVisibleResponseMs: Date.now() - entry, landing });
  } catch (error) { await diagnostic(run, 'initial-viewport', error); throw error; } finally { await run.context.close(); }
}
async function heldTransport(browser) {
  const run = await open(browser, { viewport: { width: 390, height: 844 } }), { page, context } = run;
  const pending = { lead: [], aircraft: [] };
  const hold = kind => route => new Promise(resolve => pending[kind].push(async () => { try { await route.continue(); } finally { resolve(); } }));
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
    await observedAircraft;
    const firstAirframe = run.requests.find(request => airframeBytes.test(request.url));
    const sceneRequest = run.requests.find(request => /\/assets\/v3-aircraft-scene\.js/.test(request.url));
    const decoderRequest = run.requests.find(request => /\/assets\/vendor\/meshopt_decoder\.js/.test(request.url));
    assert.ok(sceneRequest.observedAt <= firstAirframe.observedAt && decoderRequest.observedAt <= firstAirframe.observedAt, 'Scene code and decoder prepare before the large gated transfer');
    const airframeStartMs = firstAirframe.observedAt - navigationStarted;
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
    await save(run, 'simultaneous-transport-foreground-input-and-early-promotion', { menuRoundTripMs, airframeStartMs, genuineHeldRequests: true, policy: 'All hero bytes or 4.5s fallback; observed timings include software-renderer blocking' });
  } catch (error) { await diagnostic(run, 'held-transport', error); throw error; } finally {
    await release('lead').catch(() => {}); await release('aircraft').catch(() => {}); await context.close();
  }
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
    assert.equal(run.requests.filter(request => aircraftDependency.test(request.url)).length, 0, 'v3 aircraft retains its accepted deferred loading');
    assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), 0);
    await save(run, 'v3-remains-deferred');
  } catch (error) { await diagnostic(run, 'v3-isolation', error); throw error; } finally { await run.context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true }); sourceContract();
  if (process.argv.includes('--source-only')) return;
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await guard(browser, 'reduced-motion', { reduced: true });
    await guard(browser, 'save-data', { saveData: true });
    await guard(browser, 'short-viewport', { viewport: { width: 1440, height: 550 } });
    if (!process.argv.includes('--static-only')) {
      await initialViewport(browser); await heldTransport(browser); await deepLink(browser); await failedTransport(browser); await v3Deferred(browser);
    }
    console.log(`${evidence.length} v2 background preparation groups passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); evidence.push({ name: 'failure', error: error.stack }); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
});

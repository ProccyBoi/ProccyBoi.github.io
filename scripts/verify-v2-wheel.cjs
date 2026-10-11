/* Real input acceptance, separate from deterministic easing math.
 * Run against a repository-root HTTP server with Playwright installed.
 * Wheel events come from Playwright/CDP; touch events use the CDP input stack.
 * No application wheel/touch event is synthesized and native scroll is never
 * prevented by this test. JSON preserves raw/rendered progress and RAF timing.
 * Software WebGL frame rates are reported, not passed off as device benchmarks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_WHEEL_OUT || '.codex-temp/v2-wheel';
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const evidence = [], aircraft = '[data-aircraft-hero]';
const telemetryRequest = /\/assets\/models\/hero\/telemetry\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
const tolerance = .000012;
function instrument() {
  const originalRaf = window.requestAnimationFrame.bind(window), originalCancel = window.cancelAnimationFrame.bind(window);
  const probe = window.__v2WheelProbe = { enabled: false, samples: [], raf: [], events: [], prevention: [], frame: 0, last: {}, label: '' };
  const sample = (kind, t) => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    if (!root) return;
    const frame = Number(root.dataset[kind === 'aircraft' ? 'aircraftFrames' : 'assemblyFrames'] || 0);
    if (probe.last[kind] === frame) return;
    probe.last[kind] = frame;
    const stage = root.querySelector(kind === 'aircraft' ? '[data-aircraft-stage]' : '.v2-assembly-sticky');
    const distance = kind === 'aircraft' ? parseFloat(root.querySelector('.v3-aircraft-track')?.style.height || '0') - (stage?.clientHeight || 0) : root.offsetHeight - (stage?.clientHeight || 0);
    const geometric = Math.max(0, Math.min(1, -root.getBoundingClientRect().top / Math.max(1, distance)));
    const progressBar = root.querySelector(kind === 'aircraft' ? '[data-aircraft-progress]' : '[data-assembly-progress]');
    const bar = Number(progressBar?.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] || 0);
    probe.samples.push({ kind, t, frame, scrollY, bar, raw: kind === 'aircraft' ? Number(root.dataset.aircraftProgress || 0) : geometric, geometric, rendered: Number(root.dataset[kind === 'aircraft' ? 'aircraftRenderedProgress' : 'assemblyProgress'] || 0), telemetryReady: root.dataset.aircraftTelemetryReady === 'true' });
  };
  window.requestAnimationFrame = callback => originalRaf(time => { callback(time); if (probe.enabled) { sample('aircraft', time); sample('assembly', time); } });
  const rafSample = time => {
    if (!probe.enabled) return;
    probe.raf.push({ t: time, scrollY });
    probe.frame = originalRaf(rafSample);
  };
  probe.begin = label => {
    if (probe.frame) originalCancel(probe.frame);
    Object.assign(probe, { enabled: true, samples: [], raf: [], events: [], prevention: [], last: {}, label });
    sample('aircraft', performance.now()); sample('assembly', performance.now());
    probe.frame = originalRaf(rafSample);
  };
  probe.end = () => { probe.enabled = false; originalCancel(probe.frame); probe.frame = 0; return { label: probe.label, samples: probe.samples, raf: probe.raf, events: probe.events, prevention: probe.prevention }; };
  for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) addEventListener(type, event => {
    if (!probe.enabled) return;
    const record = { type, t: performance.now(), trusted: event.isTrusted, deltaY: event.deltaY ?? null, scrollY, prevented: event.defaultPrevented };
    probe.events.push(record); queueMicrotask(() => { record.prevented = event.defaultPrevented; });
  }, { capture: true, passive: true });
  const prevent = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (probe.enabled && ['wheel', 'touchstart', 'touchmove', 'touchend'].includes(this.type)) probe.prevention.push({ type: this.type, t: performance.now() });
    return prevent.call(this);
  };
}
async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.touch ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: !!options.touch, isMobile: !!options.touch, reducedMotion: 'no-preference' });
  await context.addInitScript(instrument);
  const page = await context.newPage(), errors = [], shaders = [];
  page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  return { context, page, errors, shaders };
}
async function state(page, kind = 'aircraft') {
  return page.evaluate(kind => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    const stage = root.querySelector(kind === 'aircraft' ? '[data-aircraft-stage]' : '.v2-assembly-sticky');
    const distance = kind === 'aircraft' ? parseFloat(root.querySelector('.v3-aircraft-track').style.height) - stage.clientHeight : root.offsetHeight - stage.clientHeight;
    return { scrollY, raw: kind === 'aircraft' ? Number(root.dataset.aircraftProgress) : Math.max(0, Math.min(1, -root.getBoundingClientRect().top / distance)), rendered: Number(root.dataset[kind === 'aircraft' ? 'aircraftRenderedProgress' : 'assemblyProgress']), frame: Number(root.dataset[kind === 'aircraft' ? 'aircraftFrames' : 'assemblyFrames']), distance };
  }, kind);
}
async function waitSettled(page, kind = 'aircraft') {
  await page.waitForFunction(kind => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    const stage = root.querySelector(kind === 'aircraft' ? '[data-aircraft-stage]' : '.v2-assembly-sticky');
    const raw = kind === 'aircraft' ? Number(root.dataset.aircraftProgress) : Math.max(0, Math.min(1, -root.getBoundingClientRect().top / (root.offsetHeight - stage.clientHeight)));
    const rendered = Number(root.dataset[kind === 'aircraft' ? 'aircraftRenderedProgress' : 'assemblyProgress']);
    return Math.abs(raw - rendered) < (kind === 'aircraft' ? .000002 : .000006);
  }, kind, { timeout });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function jump(page, amount, kind = 'aircraft') {
  await page.evaluate(({ amount, kind }) => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    const stage = root.querySelector(kind === 'aircraft' ? '[data-aircraft-stage]' : '.v2-assembly-sticky');
    const distance = kind === 'aircraft' ? parseFloat(root.querySelector('.v3-aircraft-track').style.height) - stage.clientHeight : root.offsetHeight - stage.clientHeight;
    scrollTo({ top: scrollY + root.getBoundingClientRect().top + distance * amount + (amount === 1 ? 1 : amount === 0 ? -1 : 0), behavior: 'instant' });
  }, { amount, kind });
  await page.waitForFunction(({ amount, kind }) => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    const value = Number(root.dataset[kind === 'aircraft' ? 'aircraftProgress' : 'assemblyProgress']);
    return Math.abs(value - amount) < .001;
  }, { amount, kind });
  await waitSettled(page, kind); return state(page, kind);
}
async function begin(page, label) { await page.evaluate(label => window.__v2WheelProbe.begin(label), label); }
async function end(page) { return page.evaluate(() => window.__v2WheelProbe.end()); }
function timing(trace, kind = 'aircraft') {
  const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
  const intervals = trace.raf.slice(1).map((sample, index) => sample.t - trace.raf[index].t).filter(value => value > 0);
  const frames = trace.samples.filter(sample => sample.kind === kind);
  const renderIntervals = frames.slice(1).map((sample, index) => sample.t - frames[index].t).filter(value => value > 0);
  return { rafSamples: trace.raf.length, rafMedianMs: percentile(intervals, .5), rafP95Ms: percentile(intervals, .95), rafMaxMs: intervals.length ? Math.max(...intervals) : null, renderedFrames: frames.length, renderMedianMs: percentile(renderIntervals, .5), renderP95Ms: percentile(renderIntervals, .95), maxObservedLag: frames.length ? Math.max(...frames.map(sample => Math.abs(sample.raw - sample.rendered))) : 0 };
}
function noPrevention(trace) {
  assert.deepEqual(trace.prevention, [], 'Production never calls preventDefault for wheel or touch');
  assert.ok(trace.events.length > 0 && trace.events.every(event => event.trusted), 'Input originated from the browser input stack');
  assert.ok(trace.events.every(event => !event.prevented), 'Native scrolling is not canceled');
}
function smoothTrace(trace, before, after, kind = 'aircraft') {
  const frames = trace.samples.filter(sample => sample.kind === kind), direction = Math.sign(after.raw - before.raw);
  assert.ok(frames.length >= 2, 'Raw target and rendered convergence are sampled on actual renderer frames');
  assert.ok(frames.some(sample => Math.abs(sample.raw - sample.rendered) > .00008), 'A coarse detent is visually interpolated instead of rendered as a step');
  const low = Math.min(before.rendered, after.raw) - tolerance, high = Math.max(before.rendered, after.raw) + tolerance;
  let previous = before.rendered;
  for (const sample of frames) {
    assert.ok(Number.isFinite(sample.raw) && Number.isFinite(sample.rendered), 'Progress stays finite');
    assert.ok(Math.abs(sample.bar - sample.rendered) <= tolerance, 'Progress indicator follows the rendered pose');
    assert.ok(sample.rendered >= low && sample.rendered <= high, 'No overshoot outside the scroll segment');
    assert.ok((sample.rendered - previous) * direction >= -tolerance, 'Each one-direction segment remains monotonic');
    previous = sample.rendered;
  }
  assert.ok(Math.abs(after.raw - after.rendered) <= tolerance, 'Rendered progress converges to the native target');
}
function save(name, details, run, trace) {
  assert.deepEqual(run.errors, [], 'No unhandled browser exceptions'); assert.deepEqual(run.shaders, [], 'No shader errors');
  if (trace) fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(trace, null, 2) + '\n');
  evidence.push({ name, ...details, ...(trace ? { timing: timing(trace, details.kind) } : {}) }); console.log('PASS ' + name);
}
async function diagnostics(run, name, error) {
  const diagnostic = { error: error.stack };
  try { diagnostic.url = run.page.url(); diagnostic.trace = await end(run.page); diagnostic.state = await run.page.evaluate(() => ({ scrollY, aircraft: { ...document.querySelector('[data-aircraft-hero]')?.dataset }, assembly: { ...document.querySelector('[data-assembly]')?.dataset } })); } catch (unavailable) { diagnostic.collectionError = unavailable.message; }
  fs.writeFileSync(path.join(output, name + '-failure.json'), JSON.stringify(diagnostic, null, 2) + '\n');
  await run.page.screenshot({ path: path.join(output, name + '-failure.png'), timeout: 15000 }).catch(() => {});
}
async function detents(run, name, kind, start, deltas) {
  const { page } = run;
  await jump(page, start, kind); await page.mouse.move(195, 450);
  const before = await state(page, kind); await begin(page, name);
  for (const delta of deltas) {
    const previous = await state(page, kind); await page.mouse.wheel(0, delta);
    await page.waitForFunction(({ scroll, direction }) => (scrollY - scroll) * direction > 40, { scroll: previous.scrollY, direction: Math.sign(delta) });
    // Deliberately send further coarse detents while interpolation is active.
    await page.waitForTimeout(35);
  }
  await waitSettled(page, kind); const after = await state(page, kind), trace = await end(page);
  noPrevention(trace); smoothTrace(trace, before, after, kind);
  const expected = deltas.reduce((sum, delta) => sum + delta, 0);
  assert.ok(Math.abs(after.scrollY - before.scrollY - expected) < 3, 'Native document receives the complete wheel distance');
  assert.ok(trace.events.filter(event => event.type === 'wheel').every(event => Math.abs(event.deltaY) === 120), 'Evidence contains actual coarse +/-120 wheel detents');
  save(name, { kind, before, after, deltas }, run, trace);
}
async function stopped(page, kind, message) {
  await waitSettled(page, kind);
  const before = await state(page, kind); await page.waitForTimeout(900); const after = await state(page, kind);
  assert.equal(after.frame, before.frame, message);
}
async function wheelDesktop(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(base + '/v2/?v=wheel-integration', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-assembly-models-ready="3"]').waitFor({ timeout });
    await detents(run, 'hero-coarse-forward', 'assembly', .15, [120, 120, 120, 120]);
    await detents(run, 'hero-coarse-reverse', 'assembly', .4, [-120, -120, -120, -120]);
    await stopped(page, 'assembly', 'Opening hero does not retain an idle render loop');
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    await jump(page, .2);
    await detents(run, 'aircraft-coarse-forward', 'aircraft', .15, [120, 120, 120, 120, 120, 120]);
    await detents(run, 'aircraft-coarse-reverse', 'aircraft', .65, [-120, -120, -120, -120, -120, -120]);
    // Reverse before the first detent settles; the second detent must head back
    // immediately instead of preserving old forward velocity or oscillating.
    const before = await jump(page, .35); await begin(page, 'aircraft-active-reversal');
    await page.mouse.wheel(0, 120);
    const reversing = await page.waitForFunction(raw => {
      const root = document.querySelector('[data-aircraft-hero]'), target = Number(root.dataset.aircraftProgress), rendered = Number(root.dataset.aircraftRenderedProgress);
      return target > raw + .02 && target - rendered > .00008 ? { raw: target, rendered, scrollY, frame: Number(root.dataset.aircraftFrames) } : false;
    }, before.raw, { polling: 10, timeout });
    // Send the reversal before another protocol round trip to read state.
    await page.mouse.wheel(0, -120);
    const reversal = await reversing.jsonValue(); await reversing.dispose();
    assert.ok(reversal.raw - reversal.rendered > .00008, 'Reversal starts before the forward detent settles');
    await page.waitForFunction(raw => Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) < raw - .02, reversal.raw);
    await waitSettled(page); const after = await state(page), trace = await end(page);
    noPrevention(trace);
    const frames = trace.samples.filter(sample => sample.kind === 'aircraft');
    const reverseIndex = frames.findIndex((sample, index) => index > 0 && sample.raw < frames[index - 1].raw - .02);
    assert.ok(reverseIndex > 0, 'Renderer observes the input reversal');
    assert.ok(frames[reverseIndex].rendered <= frames[reverseIndex - 1].rendered + tolerance, 'Reversal responds on the first rendered frame with the reverse target');
    for (const sample of frames) assert.ok(sample.rendered >= before.raw - tolerance && sample.rendered <= reversal.raw + tolerance, 'Reversal remains inside native scroll extrema');
    assert.ok(Math.abs(after.scrollY - before.scrollY) < 2 && Math.abs(after.rendered - before.raw) < tolerance, 'A forward/reverse detent pair returns to its exact native position');
    save('aircraft-active-reversal', { before, reversal, after }, run, trace);
    await stopped(page, 'aircraft', 'Aircraft settles without a residual RAF loop');
    // Large discontinuities and exact clamped endpoints should snap rather
    // than animate through unrelated intermediate chapters.
    for (const [from, to] of [[.15, .85], [.85, .1], [.1, 1], [1, 0]]) {
      await jump(page, from); await begin(page, `aircraft-large-${from}-${to}`);
      const afterJump = await jump(page, to), jumpTrace = await end(page);
      const changed = jumpTrace.samples.filter(sample => sample.kind === 'aircraft' && Math.abs(sample.raw - from) > .18);
      assert.ok(changed.length > 0 && changed.every(sample => Math.abs(sample.raw - sample.rendered) <= .000002), 'A large native discontinuity snaps to the new pose');
      if (to === 0 || to === 1) { assert.equal(afterJump.raw, to); assert.equal(afterJump.rendered, to); }
      save(`aircraft-large-${from}-${to}`, { from, to, after: afterJump }, run, jumpTrace);
    }
    await jump(page, .4); await stopped(page, 'aircraft', 'Aircraft idle stops');
    await page.locator('.v2-about-preview').evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().top + 120, behavior: 'instant' }));
    await page.waitForTimeout(250); const offscreen = Number(await page.locator(aircraft).getAttribute('data-aircraft-frames'));
    await page.waitForTimeout(900); assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), offscreen, 'Offscreen story stops rendering');
    await jump(page, .4); await stopped(page, 'aircraft', 'Returning to the story resumes and then settles');
    // Exercise the browser's page lifecycle without changing any user settings.
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    const hidden = Number(await page.locator(aircraft).getAttribute('data-aircraft-frames'));
    await page.waitForTimeout(500); assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), hidden, 'Pagehide suspends rendering');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await waitSettled(page); await stopped(page, 'aircraft', 'Pageshow re-entry does not leave a render loop');
    await page.screenshot({ path: path.join(output, 'desktop-wheel-settled.png') });
    save('aircraft-idle-offscreen-lifecycle', { offscreenFrames: offscreen, pagehideFrames: hidden }, run);
  } catch (error) { await diagnostics(run, 'desktop-wheel', error); throw error; } finally { await run.context.close(); }
}
async function pendingTelemetry(browser) {
  const run = await open(browser), { page, context } = run, releases = [];
  await context.route(telemetryRequest, route => new Promise(resolve => releases.push(async () => { try { await route.continue(); } finally { resolve(); } })));
  try {
    await page.goto(base + '/v2/?v=pending-telemetry#skylabs-telemetry', { waitUntil: 'domcontentloaded' });
    await begin(page, 'pending-telemetry');
    await page.waitForFunction(() => { const root = document.querySelector('[data-aircraft-hero]'); return root.dataset.aircraftState === 'ready' && Number(root.dataset.aircraftProgress) > .99 && Math.abs(Number(root.dataset.aircraftRenderedProgress) - .61) < .000002 && root.dataset.aircraftTelemetryReady !== 'true'; }, null, { timeout });
    assert.ok(releases.length > 0, 'Telemetry transport is actually held');
    // Repeat a jump while the board is unavailable: no single stale pose may
    // render beyond the availability cap before easing back to it.
    await page.evaluate(() => { const root = document.querySelector('[data-aircraft-hero]'), distance = parseFloat(root.querySelector('.v3-aircraft-track').style.height) - root.querySelector('[data-aircraft-stage]').clientHeight; scrollTo({ top: scrollY + root.getBoundingClientRect().top + .1 * distance, behavior: 'instant' }); });
    await page.waitForFunction(() => Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftRenderedProgress) < .11);
    await page.evaluate(() => document.getElementById('skylabs-telemetry').scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftRenderedProgress) - .61) < .000002);
    await Promise.all(releases.splice(0).map(release => release()));
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    await waitSettled(page); const trace = await end(page);
    const pending = trace.samples.filter(sample => sample.kind === 'aircraft' && !sample.telemetryReady);
    assert.ok(pending.length >= 2 && pending.every(sample => sample.rendered <= .610002), 'Every pending-board rendered frame respects the .61 availability cap');
    const final = await state(page); assert.equal(final.raw, 1); assert.equal(final.rendered, 1);
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-chapter'), '1', 'Telemetry release reaches its destination');
    save('pending-telemetry-availability', { heldFrames: pending.length, final }, run, trace);
  } catch (error) { await diagnostics(run, 'pending-telemetry', error); throw error; } finally { await Promise.all(releases.splice(0).map(release => release().catch(() => {}))); await context.close(); }
}
async function touch(browser) {
  const run = await open(browser, { touch: true }), { page, context } = run;
  try {
    await page.goto(base + '/v2/?v=touch-input#skylabs-aircraft', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    const before = await jump(page, .2), cdp = await context.newCDPSession(page);
    await begin(page, 'aircraft-native-touch');
    const point = y => [{ x: 195, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(650) });
    for (const y of [625, 600, 575, 550, 525, 500, 475, 450]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y) });
      await page.waitForTimeout(65);
    }
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(value => scrollY > value + 80, before.scrollY); await waitSettled(page);
    const after = await state(page), trace = await end(page); noPrevention(trace);
    assert.ok(trace.events.some(event => event.type === 'touchmove'), 'CDP produced real touchmove events');
    const frames = trace.samples.filter(sample => sample.kind === 'aircraft');
    assert.ok(frames.length >= 2 && frames.every(sample => Math.abs(sample.raw - sample.rendered) <= .000002), 'Touch-driven poses track native scroll directly without a second easing tail');
    assert.ok(after.scrollY > before.scrollY + 80, 'Native touch actually scrolls the document');
    save('aircraft-native-touch', { before, after }, run, trace);
    // A later wheel event must reset touch directness and restore interpolation.
    await detents(run, 'aircraft-wheel-after-touch', 'aircraft', .35, [120, 120]);
    await stopped(page, 'aircraft', 'Touch and wheel resume settle without an idle loop');
    await page.screenshot({ path: path.join(output, 'mobile-touch-settled.png') });
  } catch (error) { await diagnostics(run, 'native-touch', error); throw error; } finally { await context.close(); }
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await wheelDesktop(browser); await pendingTelemetry(browser); await touch(browser);
    console.log(`${evidence.length} real-input v2 wheel and lifecycle groups passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); evidence.push({ name: 'failure', error: error.stack }); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
});

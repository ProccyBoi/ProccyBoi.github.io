/* Real input acceptance, separate from deterministic easing math.
 * Run against a repository-root HTTP server with Playwright installed.
 * Wheel events come from Playwright/CDP; touch events use the CDP input stack.
 * No application wheel/touch event is synthesized and native scroll is never
 * prevented by this test. JSON preserves raw/rendered progress and RAF timing.
 * Software WebGL frame rates are reported, not passed off as device benchmarks.
 * Optional V2_WHEEL_BASELINE_URL points to a separately served old v2 checkout
 * for matched input traces without imposing new-story assertions on it. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_WHEEL_OUT || '.codex-temp/v2-wheel';
const baselineURL = process.env.V2_WHEEL_BASELINE_URL?.replace(/\/$/, '').replace(/\/v2$/, '');
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const evidence = [], aircraft = '[data-aircraft-hero]';
const telemetryRequest = /\/assets\/models\/hero\/telemetry\.(?:idx\.bin\.gz|bin)(?:\?|$)/;
const tolerance = .000012;
function instrument() {
  const originalRaf = window.requestAnimationFrame.bind(window), originalCancel = window.cancelAnimationFrame.bind(window);
  const probe = window.__v2WheelProbe = { enabled: false, samples: [], raf: [], events: [], prevention: [], frameRecords: [], frame: 0, last: {}, label: '' };
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
    probe.samples.push({ kind, t, observedAt: performance.now(), frame, scrollY, bar, raw: kind === 'aircraft' ? Number(root.dataset.aircraftProgress || 0) : geometric, geometric, rendered: Number((kind === 'aircraft' ? root.dataset.aircraftRenderedProgress ?? root.dataset.aircraftProgress : root.dataset.assemblyProgress) || 0), renderedSource: kind === 'aircraft' && !('aircraftRenderedProgress' in root.dataset) ? 'legacy-raw-progress' : 'rendered-progress', telemetryReady: root.dataset.aircraftTelemetryReady === 'true' });
  };
  window.requestAnimationFrame = callback => originalRaf(time => { callback(time); if (probe.enabled) { sample('aircraft', time); sample('assembly', time); } });
  new MutationObserver(records => {
    if (!probe.enabled) return;
    if (records.some(record => record.attributeName === 'data-aircraft-frames')) sample('aircraft', performance.now());
    if (records.some(record => record.attributeName === 'data-assembly-frames')) sample('assembly', performance.now());
    if (records.some(record => record.attributeName === 'data-aircraft-last-frame')) {
      const value = JSON.parse(document.querySelector('[data-aircraft-hero]').dataset.aircraftLastFrame || 'null');
      if (value && value.sequence !== probe.frameRecords.at(-1)?.sequence) probe.frameRecords.push(value);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-aircraft-frames', 'data-assembly-frames', 'data-aircraft-last-frame'] });
  const rafSample = time => {
    if (!probe.enabled) return;
    probe.raf.push({ t: time, scrollY });
    probe.frame = originalRaf(rafSample);
  };
  probe.begin = label => {
    if (probe.frame) originalCancel(probe.frame);
    Object.assign(probe, { enabled: true, samples: [], raf: [], events: [], prevention: [], frameRecords: [], last: {}, label });
    sample('aircraft', performance.now()); sample('assembly', performance.now());
    probe.frame = originalRaf(rafSample);
  };
  probe.end = () => { probe.enabled = false; originalCancel(probe.frame); probe.frame = 0; return { label: probe.label, samples: probe.samples, raf: probe.raf, events: probe.events, prevention: probe.prevention, frameRecords: probe.frameRecords }; };
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
    return { scrollY, raw: kind === 'aircraft' ? Number(root.dataset.aircraftProgress) : Math.max(0, Math.min(1, -root.getBoundingClientRect().top / distance)), rendered: Number(kind === 'aircraft' ? root.dataset.aircraftRenderedProgress ?? root.dataset.aircraftProgress : root.dataset.assemblyProgress), frame: Number(root.dataset[kind === 'aircraft' ? 'aircraftFrames' : 'assemblyFrames']), distance, submitted: Number(root.dataset.aircraftSubmittedFrames), completed: Number(root.dataset.aircraftCompletedFrames), gpuPending: root.dataset.aircraftGPUPending, mask: root.dataset.aircraftWarmMask, lastFrame: root.dataset.aircraftLastFrame ? JSON.parse(root.dataset.aircraftLastFrame) : null };
  }, kind);
}
async function waitSettled(page, kind = 'aircraft') {
  await page.waitForFunction(kind => {
    const root = document.querySelector(kind === 'aircraft' ? '[data-aircraft-hero]' : '[data-assembly]');
    const stage = root.querySelector(kind === 'aircraft' ? '[data-aircraft-stage]' : '.v2-assembly-sticky');
    const raw = kind === 'aircraft' ? Number(root.dataset.aircraftProgress) : Math.max(0, Math.min(1, -root.getBoundingClientRect().top / (root.offsetHeight - stage.clientHeight)));
    const rendered = Number(kind === 'aircraft' ? root.dataset.aircraftRenderedProgress ?? root.dataset.aircraftProgress : root.dataset.assemblyProgress);
    const paced = kind === 'aircraft' && root.dataset.aircraftSubmittedFrames !== undefined;
    return Math.abs(raw - rendered) < (kind === 'aircraft' ? .000002 : .000006) && (!paced || (root.dataset.aircraftGPUPending === 'false' && root.dataset.aircraftWarmMask === 'false' && root.dataset.aircraftState === 'ready'));
  }, kind, { timeout });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function waitNativeStable(page, expected) {
  await page.evaluate(() => { window.__v2NativeWheelStable = null; });
  await page.waitForFunction(expected => {
    const now = performance.now();
    if (Math.abs(scrollY - expected) > 1) { window.__v2NativeWheelStable = null; return false; }
    const sample = window.__v2NativeWheelStable;
    if (!sample || Math.abs(sample.y - scrollY) > .1) { window.__v2NativeWheelStable = { y: scrollY, since: now }; return false; }
    return now - sample.since >= 160;
  }, expected, { polling: 25, timeout });
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
  const rawSteps = frames.slice(1).map((sample, index) => Math.abs(sample.raw - frames[index].raw));
  const renderedSteps = frames.slice(1).map((sample, index) => Math.abs(sample.rendered - frames[index].rendered));
  const lastWheel = trace.events.filter(event => event.type === 'wheel').at(-1)?.t;
  const finalRaw = frames.at(-1)?.raw;
  const settled = lastWheel === undefined ? null : frames.find(sample => sample.observedAt >= lastWheel && Math.abs(sample.raw - finalRaw) <= tolerance && Math.abs(sample.raw - sample.rendered) <= tolerance);
  return { lastWheelToSettledMs: settled ? settled.observedAt - lastWheel : null, maxRawStep: rawSteps.length ? Math.max(...rawSteps) : 0, maxRenderedStep: renderedSteps.length ? Math.max(...renderedSteps) : 0, rafSamples: trace.raf.length, rafMedianMs: percentile(intervals, .5), rafP95Ms: percentile(intervals, .95), rafMaxMs: intervals.length ? Math.max(...intervals) : null, renderedFrames: Math.max(0, frames.length - 1), renderMedianMs: percentile(renderIntervals, .5), renderP95Ms: percentile(renderIntervals, .95), maxObservedLag: frames.length ? Math.max(...frames.map(sample => Math.abs(sample.raw - sample.rendered))) : 0 };
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
function actualSubmissions(trace, before, after, { directRequired = false } = {}) {
  const records = trace.frameRecords, completed = records.filter(record => record.gpu?.state === 'complete');
  assert.ok(Number.isFinite(before.submitted) && Number.isFinite(after.submitted), 'Current aircraft exposes real submission and completion counters');
  assert.equal(records.length, after.submitted - before.submitted, 'Every actual live draw has a terminal record, including canceled and stale draws');
  assert.equal(completed.length, after.completed - before.completed, 'Completed stale draws remain counted as actual GPU work');
  assert.equal(records.filter(record => record.published).length, after.frame - before.frame, 'UI publication is distinguished from actual GPU completion');
  if (directRequired) assert.ok(records.some(record => record.direct), 'The trace contains actual direct-touch submissions');
  for (const [index, record] of records.entries()) {
    assert.ok(Number.isFinite(record.submittedMs) && record.observedMs >= record.submittedMs, 'Submission and terminal observation have honest ordered timestamps');
    assert.equal(typeof record.published, 'boolean');
    if (index) assert.ok(record.submittedMs >= records[index - 1].observedMs - .02, 'One live draw is in flight at a time');
    if (record.gpu.state === 'complete') assert.ok(Number.isFinite(record.completedMs) && record.completedMs >= record.submittedMs, 'GPU completion is observed after its real submission');
    else assert.equal(record.completedMs, null, 'Canceled or unsupported work does not fabricate a GPU completion time');
    if (record.direct) assert.ok(Math.abs(record.value - record.rawAtSubmit) <= .000002, 'Direct-touch draws use the native target at submission without easing');
  }
  assert.ok(Math.abs(after.raw - after.rendered) <= tolerance, 'The terminal published pose converges to the latest native target');
  assert.equal(after.gpuPending, 'false'); assert.equal(after.mask, 'false');
  return { submitted: records.length, completed: completed.length, published: after.frame - before.frame, staleCompleted: completed.filter(record => !record.published).length, maxInputChangeWhilePending: Math.max(0, ...records.map(record => Math.abs(record.rawAtComplete - record.rawAtSubmit))), maxGPUWaitMs: Math.max(0, ...records.map(record => record.gpu.waitMs || 0)) };
}
function save(name, details, run, trace) {
  assert.deepEqual(run.errors, [], 'No unhandled browser exceptions'); assert.deepEqual(run.shaders, [], 'No shader errors');
  if (trace) fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(trace, null, 2) + '\n');
  evidence.push({ name, ...details, ...(trace ? { timing: timing(trace, details.kind) } : {}) }); console.log('PASS ' + name);
}
async function diagnostics(run, name, error) {
  const diagnostic = { error: error.stack };
  try { diagnostic.url = run.page.url(); diagnostic.trace = await end(run.page); diagnostic.state = await run.page.evaluate(() => ({ scrollY, aircraft: { ...document.querySelector('[data-aircraft-hero]')?.dataset }, selected: { ...document.querySelector('[data-selected-work]')?.dataset }, assembly: { ...document.querySelector('[data-assembly]')?.dataset } })); } catch (unavailable) { diagnostic.collectionError = unavailable.message; }
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
  await waitNativeStable(page, before.scrollY + deltas.reduce((sum, delta) => sum + delta, 0));
  await waitSettled(page, kind); const after = await state(page, kind), trace = await end(page);
  noPrevention(trace); smoothTrace(trace, before, after, kind);
  const expected = deltas.reduce((sum, delta) => sum + delta, 0);
  assert.ok(Math.abs(after.scrollY - before.scrollY - expected) < 3, 'Native document receives the complete wheel distance');
  assert.ok(trace.events.filter(event => event.type === 'wheel').every(event => Math.abs(event.deltaY) === 120), 'Evidence contains actual coarse +/-120 wheel detents');
  const completionEvidence = kind === 'aircraft' ? actualSubmissions(trace, before, after) : null;
  save(name, { kind, before, after, deltas, completionEvidence }, run, trace);
}
async function stopped(page, kind, message) {
  await waitSettled(page, kind);
  const before = await state(page, kind); await page.waitForTimeout(900); const after = await state(page, kind);
  assert.equal(after.frame, before.frame, message);
  if (kind === 'aircraft') { assert.equal(after.submitted, before.submitted, 'Idle aircraft does not silently submit unpublished GPU work'); assert.equal(after.gpuPending, 'false'); }
}
async function baselineWheel(browser) {
  const run = await open(browser), { page } = run;
  try {
    await page.goto(baselineURL + '/v2/?v=wheel-baseline', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-assembly-models-ready="3"]').waitFor({ timeout });
    await page.locator(aircraft).evaluate(root => scrollTo({ top: scrollY + root.getBoundingClientRect().top, behavior: 'instant' }));
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    for (const [label, start, deltas] of [['forward', .15, [120, 120, 120, 120, 120, 120]], ['reverse', .65, [-120, -120, -120, -120, -120, -120]]]) {
      const before = await jump(page, start); await page.mouse.move(195, 450);
      await begin(page, 'baseline-aircraft-coarse-' + label);
      for (const delta of deltas) {
        const previous = await state(page); await page.mouse.wheel(0, delta);
        await page.waitForFunction(({ scroll, direction }) => (scrollY - scroll) * direction > 40, { scroll: previous.scrollY, direction: Math.sign(delta) });
        await page.waitForTimeout(35);
      }
      await waitNativeStable(page, before.scrollY + deltas.reduce((sum, delta) => sum + delta, 0));
      await waitSettled(page); const after = await state(page), trace = await end(page);
      noPrevention(trace);
      assert.ok(Math.abs(after.scrollY - before.scrollY - deltas.reduce((sum, delta) => sum + delta, 0)) < 3, 'Baseline preserves native wheel distance');
      assert.ok(trace.samples.some(sample => sample.kind === 'aircraft' && sample.renderedSource === 'legacy-raw-progress'), 'Baseline measures the old unfiltered scroll controller');
      save('baseline-aircraft-coarse-' + label, { baselineURL, kind: 'aircraft', before, after, deltas }, run, trace);
    }
    await page.screenshot({ path: path.join(output, 'baseline-wheel-settled.png') });
  } catch (error) { await diagnostics(run, 'baseline-wheel', error); throw error; } finally { await run.context.close(); }
}
function compareBaseline() {
  if (!baselineURL) return;
  const comparisons = ['forward', 'reverse'].map(direction => {
    const baseline = evidence.find(item => item.name === 'baseline-aircraft-coarse-' + direction);
    const final = evidence.find(item => item.name === 'aircraft-coarse-' + direction);
    assert.ok(baseline && final, 'Same real wheel sequence was measured on baseline and final');
    return { direction, input: final.deltas, baseline: baseline.timing, final: final.timing };
  });
  // CPU software-WebGL FPS varies with the accepted added detail. Report
  // observed timing honestly; interpolation and native input have their own
  // assertions, independent of a noisy cross-page performance threshold.
  fs.writeFileSync(path.join(output, 'baseline-comparison.json'), JSON.stringify({ baselineURL, finalURL: base, renderer: 'Chromium software WebGL', comparisons }, null, 2) + '\n');
  evidence.push({ name: 'baseline-versus-final-wheel-measurements', comparisons });
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
    const reversing = await page.waitForFunction(before => {
      const root = document.querySelector('[data-aircraft-hero]'), target = Number(root.dataset.aircraftProgress), rendered = Number(root.dataset.aircraftRenderedProgress);
      const submission = root.dataset.aircraftLastSubmission ? JSON.parse(root.dataset.aircraftLastSubmission) : null;
      return target > before.raw + .02 && target - rendered > .00008 && Number(root.dataset.aircraftSubmittedFrames) > before.submitted && submission?.rawAtSubmit > before.raw + .02 ? { raw: target, rendered, scrollY, frame: Number(root.dataset.aircraftFrames), submission } : false;
    }, before, { polling: 10, timeout });
    // Send the reversal before another protocol round trip to read state.
    await page.mouse.wheel(0, -120);
    const reversal = await reversing.jsonValue(); await reversing.dispose();
    assert.ok(reversal.raw - reversal.rendered > .00008, 'Reversal starts before the forward detent settles');
    await page.waitForFunction(raw => Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftProgress) < raw - .02, reversal.raw);
    await waitSettled(page); const after = await state(page), trace = await end(page);
    noPrevention(trace);
    const frames = trace.samples.filter(sample => sample.kind === 'aircraft');
    const records = trace.frameRecords, reverseEvent = trace.events.find(event => event.type === 'wheel' && event.deltaY < 0);
    const reverseIndex = records.findIndex((record, index) => index > 0 && record.rawAtSubmit < records[index - 1].rawAtSubmit - .02);
    assert.ok(reverseIndex > 0, 'An actual new submission observes the reversed native target');
    for (let index = reverseIndex; index < records.length; index++) {
      assert.ok(records[index].value <= records[index - 1].value + tolerance, 'The first and every subsequent submission seeing reversal head back immediately');
      assert.ok(records[index].rawAtSubmit <= records[index - 1].rawAtSubmit + tolerance, 'No newer submission replays the previous forward target');
    }
    const alreadyInFlight = records.filter(record => record.submittedMs < reverseEvent.t && record.observedMs >= reverseEvent.t);
    assert.ok(alreadyInFlight.length <= 1, 'At most one honestly recorded earlier draw can complete after native reversal');
    for (const record of records) assert.ok(record.value >= before.raw - tolerance && record.value <= reversal.raw + tolerance, 'All submitted poses remain inside native reversal extrema');
    for (const sample of frames) assert.ok(sample.rendered >= before.raw - tolerance && sample.rendered <= reversal.raw + tolerance, 'Reversal remains inside native scroll extrema');
    assert.ok(Math.abs(after.scrollY - before.scrollY) < 2 && Math.abs(after.rendered - before.raw) < tolerance, 'A forward/reverse detent pair returns to its exact native position');
    save('aircraft-active-reversal', { before, reversal, after, reverseIndex, alreadyInFlight, completionEvidence: actualSubmissions(trace, before, after) }, run, trace);
    await stopped(page, 'aircraft', 'Aircraft settles without a residual RAF loop');
    // Large discontinuities and exact clamped endpoints should snap rather
    // than animate through unrelated intermediate chapters.
    for (const [from, to] of [[.15, .85], [.85, .1], [.1, 1], [1, 0]]) {
      const beforeJump = await jump(page, from); await begin(page, `aircraft-large-${from}-${to}`);
      const afterJump = await jump(page, to), jumpTrace = await end(page);
      const changed = jumpTrace.samples.filter(sample => sample.kind === 'aircraft' && Math.abs(sample.raw - from) > .18);
      assert.ok(changed.length > 0 && changed.every(sample => Math.abs(sample.raw - sample.rendered) <= .000002), 'A large native discontinuity snaps to the new pose');
      if (to === 0 || to === 1) { assert.equal(afterJump.raw, to); assert.equal(afterJump.rendered, to); }
      save(`aircraft-large-${from}-${to}`, { from, to, after: afterJump, completionEvidence: actualSubmissions(jumpTrace, beforeJump, afterJump) }, run, jumpTrace);
    }
    await jump(page, .4); await stopped(page, 'aircraft', 'Aircraft idle stops');
    await page.locator('.v2-about-preview').evaluate(element => scrollTo({ top: scrollY + element.getBoundingClientRect().top + 120, behavior: 'instant' }));
    await page.waitForTimeout(250); const offscreenState = await state(page), offscreen = offscreenState.frame;
    await page.waitForTimeout(900); const offscreenAfter = await state(page);
    assert.equal(offscreenAfter.frame, offscreen, 'Offscreen story stops rendering');
    assert.equal(offscreenAfter.submitted, offscreenState.submitted, 'Offscreen aircraft submits no new hidden live draws');
    await jump(page, .4); await stopped(page, 'aircraft', 'Returning to the story resumes and then settles');
    // Synthetic events verify the application handlers, not real background-tab
    // visibility or browser BFCache. Interrupt an active interpolation so this
    // check cannot pass merely because the scene was already idle.
    await page.mouse.wheel(0, 120);
    const suspension = await page.waitForFunction(() => {
      const root = document.querySelector('[data-aircraft-hero]'), raw = Number(root.dataset.aircraftProgress), rendered = Number(root.dataset.aircraftRenderedProgress);
      if (Math.abs(raw - rendered) <= .00008) return false;
      dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return { frame: Number(root.dataset.aircraftFrames), raw, rendered };
    }, null, { polling: 10, timeout });
    const suspended = await suspension.jsonValue(); await suspension.dispose();
    await page.waitForTimeout(500); assert.equal(Number(await page.locator(aircraft).getAttribute('data-aircraft-frames')), suspended.frame, 'Synthetic pagehide handler suspends active rendering');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForFunction(frame => Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftFrames) > frame, suspended.frame);
    await waitSettled(page); await stopped(page, 'aircraft', 'Synthetic pageshow handler resumes, converges and stops');
    await page.screenshot({ path: path.join(output, 'desktop-wheel-settled.png') });
    save('aircraft-idle-offscreen-synthetic-lifecycle-handlers', { offscreenFrames: offscreen, offscreenState, offscreenAfter, syntheticPagehide: suspended, actualBackgroundVisibilityTested: false }, run);
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
    const releaseMs = await page.evaluate(() => performance.now());
    await Promise.all(releases.splice(0).map(release => release()));
    await page.locator('[data-aircraft-telemetry-ready="true"]').waitFor({ timeout });
    await waitSettled(page); const trace = await end(page);
    // The legacy baseline adapter can record raw progress before frame one.
    // Only actual renderer output is a pose; the loading poster is not.
    const pending = trace.samples.filter(sample => sample.kind === 'aircraft' && sample.frame > 0 && sample.renderedSource === 'rendered-progress' && !sample.telemetryReady);
    assert.ok(pending.length >= 2 && pending.every(sample => sample.rendered <= .610002), 'Every pending-board rendered frame respects the .61 availability cap');
    const heldSubmissions = trace.frameRecords.filter(record => record.submittedMs < releaseMs);
    assert.ok(heldSubmissions.length >= 2 && heldSubmissions.every(record => record.value <= .610002), 'Every actual pending-board GPU submission respects the availability cap, including superseded draws');
    const final = await state(page); assert.equal(final.raw, 1); assert.equal(final.rendered, 1);
    assert.equal(await page.locator(aircraft).getAttribute('data-aircraft-chapter'), '1', 'Telemetry release reaches its destination');
    save('pending-telemetry-availability', { heldFrames: pending.length, heldSubmissions: heldSubmissions.length, releaseMs, final }, run, trace);
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
    assert.ok(frames.length >= 2 && frames.every(sample => Math.abs(sample.bar - sample.rendered) <= tolerance), 'Completed touch poses keep the progress bar and published metadata in agreement');
    const completionEvidence = actualSubmissions(trace, before, after, { directRequired: true });
    assert.ok(after.scrollY > before.scrollY + 80, 'Native touch actually scrolls the document');
    save('aircraft-native-touch', { before, after, completionEvidence }, run, trace);
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
    if (baselineURL) await baselineWheel(browser);
    await wheelDesktop(browser); await pendingTelemetry(browser); await touch(browser); compareBaseline();
    console.log(`${evidence.length} real-input v2 wheel and lifecycle groups passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); evidence.push({ name: 'failure', error: error.stack }); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
});

/* Decorative homepage lifecycle acceptance. Requires official Playwright 1.57.x.
 * V2_BASE_URL=http://127.0.0.1:8080 V2_NAV_OUT=/tmp/v2-navigation \
 *   node scripts/verify-v2-navigation-lifecycle.cjs --group=selected
 * Groups: hero | selected | aircraft | hashes | reflow | all (default).
 * Each invocation has a 350s wall-clock budget; CI should run groups in parallel.
 * No capture/seek hooks, mocked scene/controller, gl.finish, or fake GPU success.
 * Real own-context WebGLSync results are delayed for at most 6s, below the
 * production 12s timeout. Native nonblocking polls still run on every attempt.
 * A completed fence proves commands completed, not display/compositor latency.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const group = (process.argv.find(x => x.startsWith('--group=')) || '--group=all').slice(8);
assert.ok(['hero', 'selected', 'aircraft', 'hashes', 'reflow', 'all'].includes(group), 'Unknown --group');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const out = path.join(process.env.V2_NAV_OUT || '/tmp/v2-navigation', 'lifecycle-' + group);
const report = { group, scope: 'Native navigation, genuine scene calls, native WebGL2 syncs and controller scheduling. No display-latency claim.', results: [] };
fs.mkdirSync(out, { recursive: true });
const definitions = {
  hero: { root: '[data-assembly]', prefix: 'assembly', hash: '', stage: '.v2-assembly-sticky', canvas: '[data-assembly-canvas]' },
  selected: { root: '[data-selected-work]', prefix: 'selected', hash: '#work-framework', stage: '.v2-selected-stage', canvas: '[data-selected-canvas]' },
  aircraft: { root: '[data-aircraft-hero]', prefix: 'aircraft', hash: '#skylabs-aircraft', stage: '[data-aircraft-stage]', canvas: '[data-aircraft-canvas]' }
};
let browser, activePage, watchdog, failing = false;

// This only observes native calls and withholds selected completion results.
// Scene wrappers delegate their exact arguments/return values unchanged, letting
// actual frame() / setProgress() values be paired with the real draw and fence.
function installProbe({ initialHold }) {
  const defs = {
    hero: { root: '[data-assembly]', prefix: 'assembly', stage: '.v2-assembly-sticky', canvas: '[data-assembly-canvas]' },
    selected: { root: '[data-selected-work]', prefix: 'selected', stage: '.v2-selected-stage', canvas: '[data-selected-canvas]' },
    aircraft: { root: '[data-aircraft-hero]', prefix: 'aircraft', stage: '[data-aircraft-stage]', canvas: '[data-aircraft-canvas]' }
  };
  const probe = window.__navigationLifecycle = {
    contexts: [], fences: [], holds: {}, violations: [], inputs: [], changes: [], poses: {}, allocations: [],
    scheduled: {}, completedCallbacks: { hero: 0, selected: 0, aircraft: 0 }, scheduleSequence: 0
  };
  const root = name => document.querySelector(defs[name].root);
  const append = (list, entry, limit = 3000) => { list.push(entry); if (list.length > limit) list.shift(); };
  const classify = canvas => canvas.hasAttribute('data-assembly-canvas') ? 'hero' : canvas.hasAttribute('data-selected-canvas') ? 'selected' : canvas.hasAttribute('data-aircraft-canvas') ? 'aircraft' : null;
  let callbackOwner = null;
  const owner = () => {
    const stack = new Error().stack || '';
    const match = stack.match(/\/assets\/(v2-assembly|v2-selected-work|v3-aircraft-hero)\.js/);
    return match ? { 'v2-assembly': 'hero', 'v2-selected-work': 'selected', 'v3-aircraft-hero': 'aircraft' }[match[1]] : callbackOwner;
  };
  // Carry attribution through helper timer callbacks. Pending handles and fired
  // callbacks are both checked: stable frame counters alone can hide a RAF loop.
  for (const [scheduleName, cancelName, repeating] of [['requestAnimationFrame', 'cancelAnimationFrame', false], ['setTimeout', 'clearTimeout', false], ['setInterval', 'clearInterval', true], ['requestIdleCallback', 'cancelIdleCallback', false]]) {
    if (!window[scheduleName]) continue;
    const schedule = window[scheduleName].bind(window), cancel = window[cancelName].bind(window), handles = new Map();
    window[scheduleName] = (fn, ...args) => {
      const name = owner();
      if (!name || typeof fn !== 'function') return schedule(fn, ...args);
      const key = ++probe.scheduleSequence;
      const handle = schedule((...values) => {
        if (!repeating) { delete probe.scheduled[key]; handles.delete(handle); }
        probe.completedCallbacks[name]++;
        const previous = callbackOwner; callbackOwner = name;
        try { return fn(...values); } finally { callbackOwner = previous; }
      }, ...args);
      handles.set(handle, key); probe.scheduled[key] = { name, kind: scheduleName, at: performance.now(), delay: args[0] || 0 };
      return handle;
    };
    window[cancelName] = handle => { const key = handles.get(handle); if (key !== undefined) { delete probe.scheduled[key]; handles.delete(handle); } return cancel(handle); };
  }
  function observeFactory(globalName, name, methods) {
    let library;
    Object.defineProperty(window, globalName, { configurable: true, get: () => library, set(value) {
      library = { ...value, create(...args) {
        const instance = value.create(...args);
        for (const [method, argument] of Object.entries(methods)) {
          const original = instance[method];
          instance[method] = function (...values) {
            const result = original.apply(this, values);
            probe.poses[name] = { kind: method, value: values[argument], at: performance.now() };
            return result;
          };
        }
        return instance;
      } };
    } });
  }
  observeFactory('V2SelectedScene', 'selected', { frame: 1 });
  observeFactory('V3AircraftScene', 'aircraft', { setProgress: 0, setLanding: 0 });
  probe.arm = (name, phases = ['frame', 'drain']) => {
    const after = probe.fences.length;
    probe.holds[name] = { after, through: after, phases, until: null };
    return after;
  };
  probe.releaseExisting = name => { const hold = probe.holds[name]; if (hold) hold.through = probe.fences.length; return probe.fences.length; };
  probe.release = name => { delete probe.holds[name]; };
  if (initialHold) probe.arm(initialHold, ['frame']);
  const getContext = HTMLCanvasElement.prototype.getContext, seen = new WeakMap(), canvasContexts = new WeakMap();
  for (const property of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
    Object.defineProperty(HTMLCanvasElement.prototype, property, { ...descriptor, set(value) {
      const record = canvasContexts.get(this);
      if (record) append(probe.allocations, { name: record.name, property, value, at: performance.now(), pending: record.pending, holdActive: Boolean(probe.holds[record.name]), completed: record.lastDelivered || 0 });
      return descriptor.set.call(this, value);
    } });
  }
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = getContext.call(this, type, ...args), name = classify(this);
    if (!gl || !name || !/webgl/.test(type) || seen.has(gl)) return gl;
    const record = { id: probe.contexts.length + 1, name, at: performance.now(), webgl2: Boolean(gl.fenceSync), draws: 0, pending: 0, maxPending: 0, lastSequence: 0, lastFenceDraws: 0 };
    seen.set(gl, record); canvasContexts.set(this, record); probe.contexts.push(record);
    const owned = new Map();
    for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      if (!gl[method]) continue;
      const draw = gl[method].bind(gl);
      gl[method] = (...values) => {
        if (record.pending) append(probe.violations, { kind: 'draw-behind-owned-fence', name, pending: record.pending, at: performance.now() });
        record.draws++; record.lastDrawPose = probe.poses[name] ? { ...probe.poses[name] } : null;
        return draw(...values);
      };
    }
    if (gl.finish) gl.finish = () => { append(probe.violations, { kind: 'gl.finish', name }); throw new Error('Forbidden blocking gl.finish'); };
    if (!gl.fenceSync) return gl;
    const create = gl.fenceSync.bind(gl), poll = gl.clientWaitSync.bind(gl), remove = gl.deleteSync.bind(gl);
    gl.fenceSync = (...values) => {
      const sync = create(...values);
      if (sync) {
        const node = root(name), prefix = defs[name].prefix, sequence = Number(node?.dataset[prefix + 'SubmittedFrames'] || 0);
        const phase = sequence > record.lastSequence ? 'frame' : record.draws > record.lastFenceDraws ? 'preparation' : 'drain';
        const fence = { id: probe.fences.length + 1, context: record.id, name, phase, sequence, at: performance.now(), deleted: 0, polls: 0, heldPolls: 0, nativeSignaled: false, deliveredSignaled: false, pose: record.lastDrawPose, draws: record.draws, width: this.width, height: this.height };
        owned.set(sync, fence); probe.fences.push(fence); record.pending++; record.maxPending = Math.max(record.maxPending, record.pending);
        record.lastSequence = sequence; record.lastFenceDraws = record.draws;
      }
      return sync;
    };
    gl.clientWaitSync = (sync, flags, timeout) => {
      const fence = owned.get(sync);
      if (timeout !== 0 || flags !== 0) append(probe.violations, { kind: 'blocking-poll', name, flags, timeout });
      if (!fence || fence.deleted) append(probe.violations, { kind: 'wrong-fence-owner', name });
      const status = poll(sync, flags, timeout); // Always native and nonblocking.
      if (!fence) return status;
      fence.polls++; fence.nativeStatus = status;
      const signaled = status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
      if (signaled) fence.nativeSignaled = true;
      const hold = probe.holds[name];
      if (hold && fence.id > hold.through && hold.phases.includes(fence.phase) && status !== gl.WAIT_FAILED) {
        hold.until ??= performance.now() + 6000;
        if (performance.now() < hold.until) { fence.heldPolls++; return gl.TIMEOUT_EXPIRED; }
        append(probe.violations, { kind: 'hold-safety-deadline', name }); delete probe.holds[name];
      }
      if (signaled) { fence.deliveredSignaled = true; record.lastDelivered = fence.id; }
      return status;
    };
    gl.deleteSync = sync => {
      const fence = owned.get(sync);
      if (!fence || fence.deleted) append(probe.violations, { kind: 'double-or-foreign-delete', name });
      if (fence) { fence.deleted++; fence.end = performance.now(); record.pending--; }
      return remove(sync);
    };
    return gl;
  };
  const preventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (['wheel', 'touchstart', 'touchmove'].includes(this.type)) append(probe.violations, { kind: 'prevented-native-input', type: this.type, trusted: this.isTrusted });
    return preventDefault.call(this);
  };
  for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend', 'scroll']) addEventListener(type, event => {
    if (event.isTrusted) append(probe.inputs, { type, at: performance.now(), y: scrollY, defaultPrevented: event.defaultPrevented });
  }, { passive: true });
  const rect = node => { if (!node) return null; const b = node.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
  probe.scene = name => {
    const def = defs[name], node = root(name), stage = node?.querySelector(def.stage), canvas = node?.querySelector(def.canvas), b = rect(stage), header = document.querySelector('.v2-header')?.getBoundingClientRect().bottom || 0;
    let geometry = null;
    const clamp = value => Math.min(1, Math.max(0, value));
    if (node && stage) {
      if (name === 'hero') geometry = { expected: clamp(-node.getBoundingClientRect().top / Math.max(1, stage.clientHeight)) };
      if (name === 'selected') { const content = node.querySelector('.v2-selected-content'); if (content) { const origin = rect(content), distance = Math.max(1, content.offsetHeight - stage.clientHeight), pinned = parseFloat(getComputedStyle(stage).top) || 0; geometry = { expected: clamp((-origin.top + pinned) / distance), origin, distance, pinned }; } }
      if (name === 'aircraft') { const anchors = [...node.querySelectorAll('[data-aircraft-chapter]')].map(rect), padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0; if (anchors.length >= 2) geometry = { expected: clamp((-anchors[0].top + padding) / Math.max(1, anchors[anchors.length - 1].top - anchors[0].top)), anchors, padding }; }
    }
    return { dataset: { ...node?.dataset }, root: rect(node), stage: b, geometry, readable: Boolean(b && b.width > 0 && b.height > 0 && b.right > 0 && b.left < innerWidth && b.bottom > Math.max(0, header) && b.top < innerHeight), canvas: canvas ? { width: canvas.width, height: canvas.height, visibility: getComputedStyle(canvas).visibility, opacity: getComputedStyle(canvas).opacity, display: getComputedStyle(canvas).display } : null };
  };
  probe.snapshot = () => ({ y: scrollY, viewport: { width: innerWidth, height: innerHeight }, hash: location.hash, header: rect(document.querySelector('.v2-header')), scenes: Object.fromEntries(Object.keys(defs).map(name => [name, probe.scene(name)])), contexts: probe.contexts, fences: probe.fences, allocations: probe.allocations, violations: probe.violations, inputs: probe.inputs, changes: probe.changes, poses: probe.poses, scheduled: probe.scheduled, completedCallbacks: probe.completedCallbacks });
  new MutationObserver(records => {
    const changed = new Set();
    for (const mutation of records) for (const name of Object.keys(defs)) if (mutation.target === root(name)) changed.add(name);
    for (const name of changed) {
      const d = root(name).dataset, prefix = defs[name].prefix;
      append(probe.changes, { name, at: performance.now(), submitted: d[prefix + 'SubmittedFrames'], completed: d[prefix + 'CompletedFrames'], presented: d[prefix + 'Frames'], mask: d[prefix + 'WarmMask'], rendered: d[prefix + 'RenderedProgress'], progress: d[prefix + 'Progress'], lastFrame: d[prefix + 'LastFrame'] ? JSON.parse(d[prefix + 'LastFrame']) : null });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-assembly-completed-frames', 'data-selected-frames', 'data-selected-warm-mask', 'data-selected-last-frame', 'data-aircraft-frames', 'data-aircraft-warm-mask', 'data-aircraft-last-frame'] });
}
const near = (actual, expected, message, tolerance = .000003) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const dataset = (s, name) => s.scenes[name].dataset;
const count = (s, name, suffix) => Number(dataset(s, name)[definitions[name].prefix + suffix] || 0);
const contextFor = (s, name) => s.contexts.find(c => c.name === name);
const snap = page => page.evaluate(() => window.__navigationLifecycle.snapshot());
const frameRecord = (s, name) => JSON.parse(dataset(s, name)[definitions[name].prefix + 'LastFrame'] || 'null');
async function evidence(name, page, extra = {}) { const state = await snap(page); report.results.push({ name, ...extra, state }); writeReport(); return state; }
function writeReport() { fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(report, null, 2)); }
async function failure(error) {
  if (failing) return; failing = true;
  report.failure = { message: String(error), stack: error?.stack };
  if (activePage && !activePage.isClosed()) {
    report.failure.state = await snap(activePage).catch(() => null);
    await activePage.screenshot({ path: path.join(out, 'failure.png'), timeout: 10000 }).catch(() => {});
  }
  writeReport();
}
async function newPage(initialHold, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'no-preference', ...options });
  await context.addInitScript(installProbe, { initialHold });
  const page = await context.newPage(); activePage = page; page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(45000);
  page._errors = []; page.on('pageerror', error => page._errors.push(String(error)));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) page._errors.push(message.text()); });
  return { context, page };
}
async function open(page, hash = '') { await page.goto(base + '/v2/' + hash, { waitUntil: 'domcontentloaded' }); }
async function held(page, name, after = 0, phase = 'frame') {
  await page.waitForFunction(({ name, after, phase }) => window.__navigationLifecycle.fences.some(f => f.name === name && f.id > after && !f.deleted && f.heldPolls > 0 && f.phase === phase), { name, after, phase });
  const s = await snap(page), fence = s.fences.find(f => f.name === name && f.id > after && !f.deleted && f.heldPolls > 0 && f.phase === phase);
  assert.ok(fence, 'A real owned sync is held'); return { s, fence };
}
const arm = (p, name, phases) => p.evaluate(({ name, phases }) => window.__navigationLifecycle.arm(name, phases), { name, phases });
const release = (p, name) => p.evaluate(name => window.__navigationLifecycle.release(name), name);
const releaseExisting = (p, name) => p.evaluate(name => window.__navigationLifecycle.releaseExisting(name), name);
async function settle(page, name, geometry = true) {
  await page.waitForFunction(({ name, def, geometry }) => {
    const probe = window.__navigationLifecycle, scene = probe.scene(name), d = scene.dataset, prefix = def.prefix;
    if (d[prefix + 'State'] === 'unavailable') throw new Error(name + ' became unavailable: ' + (d[prefix + 'Error'] || 'check console'));
    if (!scene.readable || d[prefix + 'GPUPending'] === 'true') return false;
    const expected = scene.geometry?.expected;
    if (name === 'hero') { const last = JSON.parse(d.assemblyLastSubmission || 'null'); return d.assemblyModelsReady === '3' && d.assemblyForegroundSettled === 'true' && (!geometry || (last && Math.abs(last.raw - expected) < .000003)); }
    if (geometry && Math.abs(Number(d[prefix + 'Progress']) - expected) >= .000003) return false;
    const last = JSON.parse(d[prefix + 'LastFrame'] || 'null');
    return last?.published === true && last.gpu?.state === 'complete' && d[prefix + 'WarmMask'] === 'false' && d[prefix + 'State'] === 'ready' && Math.abs(Number(d[prefix + 'Progress']) - Number(d[prefix + 'RenderedProgress'])) < .000003;
  }, { name, def: definitions[name], geometry });
}
async function scrollPose(page, name, progress) {
  return page.evaluate(({ name, progress }) => {
    const clamp = value => Math.min(1, Math.max(0, value));
    let top, distance;
    if (name === 'hero') { const root = document.querySelector('[data-assembly]'); top = scrollY + root.getBoundingClientRect().top; distance = root.querySelector('.v2-assembly-sticky').clientHeight; }
    if (name === 'selected') { const root = document.querySelector('[data-selected-work]'), stage = root.querySelector('.v2-selected-stage'), content = root.querySelector('.v2-selected-content'); top = scrollY + content.getBoundingClientRect().top - (parseFloat(getComputedStyle(stage).top) || 0); distance = Math.max(1, content.offsetHeight - stage.clientHeight); }
    if (name === 'aircraft') { const articles = document.querySelector('[data-aircraft-hero]').querySelectorAll('[data-aircraft-chapter]'), first = articles[0].getBoundingClientRect(), last = articles[articles.length - 1].getBoundingClientRect(); top = scrollY + first.top - (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0); distance = Math.max(1, last.top - first.top); }
    scrollTo({ top: top + clamp(progress) * distance, behavior: 'instant' });
    return { top, distance };
  }, { name, progress });
}
async function wheel(page, delta) {
  await page.mouse.move(1050, 520); const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, delta);
  await page.waitForFunction(({ before, delta }) => delta > 0 ? scrollY > before + 1 : scrollY < before - 1, { before, delta }, { timeout: 4000 });
}
async function touch(page, context) {
  const session = await context.newCDPSession(page), before = await page.evaluate(() => scrollY);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1020, y: 660 }] });
    for (const y of [635, 610, 585]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1020, y }] });
    // Stop at the final point before lifting: exercise native scrolling without
    // letting inertial movement race the later explicit viewport/pose assertions.
    await page.waitForTimeout(140);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1020, y: 585 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(before => scrollY > before + 1, before, { timeout: 4000 });
  } finally { await session.detach(); }
}
function assertMasked(s, name, reason) { assert.equal(dataset(s, name)[definitions[name].prefix + 'WarmMask'], 'true', reason); assert.equal(s.scenes[name].canvas.visibility, 'hidden', reason); }
function assertHealthy(page, s) {
  assert.deepEqual(page._errors, [], 'No browser/shader errors'); assert.deepEqual(s.violations, [], 'Native ownership/input/scheduling probe violations');
  assert.ok(s.contexts.length <= 3, 'At most the original three scene contexts');
  for (const name of Object.keys(definitions)) assert.ok(s.contexts.filter(c => c.name === name).length <= 1, name + ' reuses its context');
  assert.ok(s.contexts.every(c => c.webgl2 && c.maxPending <= 1 && c.pending >= 0), 'One owned real WebGL2 sync per renderer');
  assert.ok(s.fences.every(f => f.deleted === 0 || f.deleted === 1), 'Each owned sync is released once');
}
function assertLatest(s, name) {
  const def = definitions[name], d = dataset(s, name), scene = s.scenes[name]; assert.equal(scene.readable, true, 'Canvas has actual readable bounds');
  if (name === 'hero') { const submission = JSON.parse(d.assemblyLastSubmission); near(submission.value, submission.raw, 'Hero actual submitted pose reaches native target'); return; }
  const last = frameRecord(s, name); assert.equal(last?.published, true); near(last.value, Number(d[def.prefix + 'Progress']), 'Published frame reaches latest native target');
  const fence = [...s.fences].reverse().find(f => f.name === name && f.phase === 'frame' && f.sequence === last.sequence);
  assert.ok(fence?.nativeSignaled && fence.deliveredSignaled && fence.deleted === 1, 'Published frame has its own native-completed and released sync');
  near(fence.pose?.value, last.value, 'Actual scene pose at real draw matches publication');
  assert.equal(fence.pose.kind, name === 'selected' ? 'frame' : 'setProgress');
  assert.equal(scene.canvas.width, fence.width); assert.equal(scene.canvas.height, fence.height); assert.equal(scene.canvas.visibility, 'visible');
  assert.ok(scene.canvas.width >= scene.stage.width - 1 && scene.canvas.height >= scene.stage.height - 1, 'Live buffer has current full-size pixels');
}
async function idle(page, name, reason, duration = 700) {
  await page.waitForTimeout(250); const first = await snap(page); await page.waitForTimeout(duration); const last = await snap(page);
  assert.equal(count(last, name, 'SubmittedFrames'), count(first, name, 'SubmittedFrames'), reason + ': no submissions');
  assert.equal(contextFor(last, name)?.draws, contextFor(first, name)?.draws, reason + ': no actual GL draws');
  assert.equal(last.completedCallbacks[name], first.completedCallbacks[name], reason + ': no hidden RAF/timer callbacks');
  assert.equal(Object.values(last.scheduled).filter(x => x.name === name).length, 0, reason + ': no pending controller loop');
  assert.equal(contextFor(last, name)?.pending || 0, 0, reason + ': no owned GPU poll');
  return { first, last };
}
async function checkFirstMask(page, name) {
  const first = await held(page, name); assertMasked(first.s, name, 'Cold first frame stays masked'); assert.equal(count(first.s, name, 'Frames'), 0);
  // Native hash offsets include scroll-margin + scroll-padding. Cross that
  // real leading gap before expecting the first composition target to change.
  const lead = Math.max(0, first.s.scenes[name].stage.top - first.s.header.bottom);
  await wheel(page, lead + 45); const changed = await snap(page); assertMasked(changed, name, 'Input during the first held frame keeps poster');
  assert.ok(Number(dataset(changed, name)[definitions[name].prefix + 'Progress']) > Number(dataset(first.s, name)[definitions[name].prefix + 'Progress']) + .000003, 'Native input actually changed the held first-frame target');
  assert.equal(contextFor(changed, name).draws, contextFor(first.s, name).draws, 'A held first frame does not queue obsolete input draws');
  const after = await releaseExisting(page, name), next = await held(page, name, after);
  const old = frameRecord(next.s, name); assert.equal(old?.published, false, 'Obsolete FIRST masked pose cannot be revealed');
  assert.equal(count(next.s, name, 'Frames'), 0); assertMasked(next.s, name, 'Latest initial pose still needs its own completion');
  near(next.fence.pose.value, Number(dataset(next.s, name)[definitions[name].prefix + 'Progress']), 'Replacement samples current actual scene pose');
  await release(page, name); await settle(page, name); const shown = await evidence(name + '-first-masked-reveal', page, { first: first.s, changed, latestHeld: next.s }); assertLatest(shown, name);
}
async function checkLiveOldPose(page, name) {
  await scrollPose(page, name, .32); await settle(page, name); await arm(page, name, ['frame']);
  await wheel(page, 28); const first = await held(page, name); await wheel(page, -16); const changed = await snap(page);
  assert.equal(count(changed, name, 'SubmittedFrames'), count(first.s, name, 'SubmittedFrames'), 'Wheel reversal coalesces behind one real frame');
  if (name !== 'hero') assert.equal(dataset(changed, name)[definitions[name].prefix + 'WarmMask'], 'false', 'Small wheel changes keep already-live artwork visible');
  const after = await releaseExisting(page, name), next = await held(page, name, after);
  if (name !== 'hero') {
    const old = frameRecord(next.s, name); assert.equal(old?.published, true, 'An already-live older completed wheel pose is honestly publishable');
    assert.ok(Math.abs(old.value - old.rawAtComplete) > .000003, 'The publication really is an older pose, not a first-mask false positive');
    near(old.value, first.fence.pose.value, 'Published old pose matches its actual completed draw');
  }
  await release(page, name); await settle(page, name); const shown = await evidence(name + '-honest-already-live-wheel-reversal', page, { held: first.s, changed, next: next.s }); assertLatest(shown, name);
}
async function capture(page, name, filename) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img').evaluateAll(images => Promise.all(images.filter(image => { const b = image.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; }).map(image => image.decode().catch(() => {}))));
  await page.waitForTimeout(300); await settle(page, name);
  await page.screenshot({ path: path.join(out, filename + '.png') });
}
async function checkResizeAndTouch(page, context, name) {
  await scrollPose(page, name, .32); await settle(page, name); await arm(page, name);
  await wheel(page, 35); const first = await held(page, name);
  await wheel(page, -20); await touch(page, context);
  await page.setViewportSize({ width: 1280, height: 920 });
  await scrollPose(page, name, .68); await page.waitForTimeout(100); const changed = await snap(page);
  assert.equal(contextFor(changed, name).draws, contextFor(first.s, name).draws, 'Native input, jump and resize do not queue another real draw behind held completion/drain');
  if (name !== 'hero') assertMasked(changed, name, 'Resize covers stale-size artwork');
  // Canceled ownership is distinct from GPU completion. Selected historically
  // mutates a masked buffer at layout time; allocations are diagnostic evidence,
  // not a new invariant. Current pose/full-size reveal below is the acceptance.
  const after = await releaseExisting(page, name), next = await held(page, name, after);
  if (name !== 'hero') { assertMasked(next.s, name, 'Replacement stays masked until its own completion'); near(next.fence.pose.value, Number(dataset(next.s, name)[definitions[name].prefix + 'Progress']), 'Replacement actual scene pose is current after native touch and resize'); }
  await release(page, name); await settle(page, name); const shown = await evidence(name + '-native-touch-reverse-resize', page, { first: first.s, changed, replacement: next.s }); assertLatest(shown, name);
  assert.ok(shown.inputs.some(e => e.type === 'wheel') && shown.inputs.some(e => e.type === 'touchmove'), 'Trusted wheel and touch were delivered');
  await capture(page, name, name + '-current-reveal');
}
async function checkPreferenceFocus(page, name) {
  const selector = name === 'hero' ? '[data-assembly-intro] a' : name === 'selected' ? '#work-framework a' : '#skylabs-aircraft a';
  const link = page.locator(selector).first(); assert.equal(await link.count(), 1, 'Stable foreground link exists');
  await link.evaluate(node => node.focus({ preventScroll: true }));
  await page.evaluate(() => { window.__focusedNavigationLink = document.activeElement; });
  const before = await snap(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.activeElement === window.__focusedNavigationLink && document.activeElement.isConnected && !document.activeElement.closest('[inert],[aria-hidden="true"]')), true, 'Reducing motion preserves exact focused foreground link');
  const reduced = await idle(page, name, 'Reduced-motion idle');
  assert.equal(reduced.last.contexts.length, before.contexts.length, 'Reducing motion allocates no context');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await scrollPose(page, name, .38); await settle(page, name);
  const restored = await snap(page); assert.equal(await page.evaluate(() => document.activeElement === window.__focusedNavigationLink), true, 'Restoring decorative graphics preserves exact link focus');
  assert.equal(contextFor(restored, name).id, contextFor(before, name).id, 'Restoring motion reuses this scene’s existing context');
  for (const prior of before.contexts) assert.equal(restored.contexts.filter(c => c.name === prior.name).length, 1, 'No previously initialized scene allocates a replacement context');
  await evidence(name + '-preference-focus-context-reuse', page, { reduced: reduced.last });
}
async function checkExitAndReuse(page, name) {
  await scrollPose(page, name, .38); await settle(page, name); const before = await snap(page);
  if (name === 'hero') await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  else await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(name => !window.__navigationLifecycle.scene(name).readable, name);
  const exited = await idle(page, name, 'Far native exit');
  assert.equal(exited.last.scenes[name].readable, false, 'Exit uses actual stage bounds, not delayed IO flags');
  await scrollPose(page, name, .61); await settle(page, name); const returned = await snap(page);
  assert.equal(contextFor(returned, name).id, contextFor(before, name).id, 'Visible return reuses completed renderer work');
  for (const counter of name === 'hero' ? ['ModelsReady'] : name === 'selected' ? ['PreparationFrames', 'WarmFrames', 'ModelsReady'] : ['WarmFrames', 'WarmPosesCompleted']) assert.equal(count(returned, name, counter), count(before, name, counter), 'Visible return does not redo completed ' + counter);
  assertLatest(returned, name); const settledIdle = await idle(page, name, 'Settled visible idle');
  await evidence(name + '-far-exit-and-completed-reuse', page, { before, exited: exited.last, returned, visibleIdle: settledIdle.last });
}
async function sceneJourney(name) {
  const { context, page } = await newPage(name === 'hero' ? null : name);
  try {
    await open(page, definitions[name].hash);
    if (name === 'hero') await settle(page, name); else await checkFirstMask(page, name);
    // Optional telemetry installation is independent of first aircraft reveal.
    // Finish it before assessing steady-state idleness and context reuse.
    if (name === 'aircraft') { await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').dataset.aircraftTelemetryReady === 'true'); await settle(page, name); }
    await checkLiveOldPose(page, name);
    await checkResizeAndTouch(page, context, name);
    await checkPreferenceFocus(page, name);
    await checkExitAndReuse(page, name);
    assertHealthy(page, await snap(page)); console.log('PASS decorative lifecycle ' + name);
  } catch (error) { await failure(error); throw error; } finally { await context.close(); }
}
async function coldHashes() {
  for (const id of ['work-framework', 'work-transit', 'skylabs-aircraft', 'skylabs-telemetry']) {
    const name = id.startsWith('work-') ? 'selected' : 'aircraft';
    const { context, page } = await newPage();
    try {
      await open(page, '#' + id); await page.evaluate(() => document.fonts.ready); await settle(page, name);
      const anchor = await page.evaluate(id => {
        const node = document.getElementById(id), b = node.getBoundingClientRect(), heading = node.querySelector('h2,h3')?.getBoundingClientRect(), header = document.querySelector('.v2-header').getBoundingClientRect();
        return { id: node.id, tag: node.tagName, count: document.querySelectorAll('[id="' + id + '"]').length, top: b.top, bottom: b.bottom, heading: heading ? { top: heading.top, bottom: heading.bottom } : null, headerBottom: header.bottom, viewport: innerHeight, inert: Boolean(node.closest('[inert]')), hidden: Boolean(node.closest('[aria-hidden="true"]')), hash: location.hash };
      }, id);
      assert.equal(anchor.count, 1); assert.ok(['SECTION', 'ARTICLE'].includes(anchor.tag)); assert.equal(anchor.hash, '#' + id); assert.equal(anchor.inert || anchor.hidden, false);
      assert.ok(anchor.heading && anchor.heading.top >= anchor.headerBottom - 2 && anchor.heading.bottom <= anchor.viewport, 'Cold legacy hash exposes its real content heading below the fixed header');
      const state = await evidence('cold-hash-' + id, page, { anchor }); assertLatest(state, name); assertHealthy(page, state);
      await capture(page, name, 'cold-' + id); console.log('PASS cold hash ' + id);
    } catch (error) { await failure(error); throw error; } finally { await context.close(); }
  }
}
async function aircraftAfterUpstreamReflow() {
  const { context, page } = await newPage(null, { viewport: { width: 390, height: 900 }, isMobile: true });
  try {
    await open(page, '#skylabs-aircraft'); await page.evaluate(() => document.fonts.ready); await settle(page, 'aircraft');
    await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').dataset.aircraftTelemetryReady === 'true');
    await scrollPose(page, 'aircraft', .4); await settle(page, 'aircraft'); const initialized = await snap(page);
    await scrollPose(page, 'selected', 0); await settle(page, 'selected');
    await page.evaluate(() => { window.__upstreamResizeEvents = 0; addEventListener('resize', () => window.__upstreamResizeEvents++); });
    const before = await snap(page);
    await page.addStyleTag({ content: '[data-selected-background-scene] :is(h3,h4,p) { font-size:30px!important; line-height:1.7!important; }' });
    await page.waitForTimeout(250); const enlarged = await snap(page);
    const beforeOrigin = before.y + before.scenes.aircraft.geometry.anchors[0].top;
    const enlargedOrigin = enlarged.y + enlarged.scenes.aircraft.geometry.anchors[0].top;
    assert.ok(enlargedOrigin > beforeOrigin + 80, 'Upstream text reflow actually moves the initialized aircraft origin');
    await page.locator('#skylabs-aircraft').evaluate(node => {
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      // Floor avoids rounding just past the zero-pose anchor in CSS pixels.
      scrollTo({ top: Math.floor(scrollY + node.getBoundingClientRect().top - padding), behavior: 'instant' });
    });
    await settle(page, 'aircraft', false); await page.waitForTimeout(300);
    const returned = await evidence('aircraft-entry-after-upstream-text-reflow', page, { initialized, before, enlarged, beforeOrigin, enlargedOrigin, resizeEvents: await page.evaluate(() => window.__upstreamResizeEvents) });
    await page.screenshot({ path: path.join(out, 'aircraft-after-upstream-reflow.png') });
    assert.equal(await page.evaluate(() => window.__upstreamResizeEvents), 0, 'Upstream content moves without any window resize');
    near(returned.scenes.aircraft.geometry.expected, 0, 'Native real first-article entry is the start pose');
    near(Number(dataset(returned, 'aircraft').aircraftProgress), 0, 'Aircraft refreshes origin after upstream reflow');
    near(frameRecord(returned, 'aircraft').value, 0, 'The actual revealed aircraft frame is the start pose');
    assert.equal(contextFor(returned, 'aircraft').id, contextFor(initialized, 'aircraft').id, 'Upstream reflow reuses the initialized aircraft context');
    assertLatest(returned, 'aircraft'); assertHealthy(page, returned);
    await scrollPose(page, 'aircraft', .75); await settle(page, 'aircraft');
    await scrollPose(page, 'aircraft', .10); await settle(page, 'aircraft');
    const reversed = await evidence('aircraft-reverse-after-upstream-text-reflow', page);
    near(Number(dataset(reversed, 'aircraft').aircraftProgress), reversed.scenes.aircraft.geometry.expected, 'Reverse native scroll follows the moved article bounds');
    assertLatest(reversed, 'aircraft'); assertHealthy(page, reversed); console.log('PASS aircraft origin after upstream text reflow');
  } catch (error) { await failure(error); throw error; } finally { await context.close(); }
}
async function textReflow() {
  for (const width of [320, 390]) {
    const { context, page } = await newPage(null, { viewport: { width, height: 900 }, isMobile: true });
    try {
      await open(page, '#work-framework'); await settle(page, 'selected'); await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.__lifecycleResizeEvents = 0; addEventListener('resize', () => window.__lifecycleResizeEvents++); });
      const measure = () => page.evaluate(() => {
        const root = document.querySelector('[data-selected-work]'), content = root.querySelector('.v2-selected-content'), stage = root.querySelector('.v2-selected-stage'), b = content.getBoundingClientRect(), pinned = parseFloat(getComputedStyle(stage).top) || 0;
        const distance = Math.max(1, content.offsetHeight - stage.clientHeight), expected = Math.min(1, Math.max(0, (scrollY - (scrollY + b.top) + pinned) / distance));
        const rect = box => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height });
        const describe = node => node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + [...node.classList].map(value => '.' + value).join('');
        const overflow = [], documentWidth = document.documentElement.clientWidth;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim() || !node.parentElement.closest('h2,h3,h4,p')) continue;
          const parent = node.parentElement, css = getComputedStyle(parent);
          if (css.visibility === 'hidden' || css.display === 'none') continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const card = parent.closest('.v2-framework-card,.v2-transport-card'), owner = card || root, bounds = owner.getBoundingClientRect();
          for (const box of range.getClientRects()) {
            if (!box.width || !box.height) continue;
            if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.left < -1 || box.right > documentWidth + 1) overflow.push({ text: node.textContent.trim(), element: describe(parent), owner: describe(owner), textBounds: rect(box), ownerBounds: rect(bounds), documentWidth });
          }
        }
        return { viewport: { width: innerWidth, height: innerHeight }, layoutViewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }, visualViewport: window.visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null, documentScrollWidth: document.documentElement.scrollWidth, overflow, scrollY, contentTop: scrollY + b.top, contentHeight: content.offsetHeight, stageHeight: stage.clientHeight, distance, expected, actual: Number(root.dataset.selectedProgress), rendered: Number(root.dataset.selectedRenderedProgress), sections: [...root.querySelectorAll('[data-selected-chapter]')].map(node => ({ id: node.id, top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })), resizeEvents: window.__lifecycleResizeEvents };
      });
      const before = await measure();
      // Keep the broad accessibility case. It must wrap inside each project
      // card, not merely avoid growing the document after text clips/overlaps.
      const broadStyle = await page.addStyleTag({ content: '[data-selected-background-scene] :is(h3,h4,p) { font-size:30px!important; line-height:1.7!important; }' });
      await page.waitForTimeout(250); const enlarged = await measure();
      await scrollPose(page, 'selected', .42); await settle(page, 'selected', false); const broad = await measure();
      await evidence('selected-text-reflow-' + width, page, { before, enlarged, after: broad });
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'selected-text-reflow-' + width + '.png') });
      // Independently isolate content-height observation using full-width copy.
      // No overflow workaround is inserted: the broad no-overlap case above
      // still fails acceptance if the production layout cannot wrap its text.
      await broadStyle.evaluate(node => node.remove()); await scrollPose(page, 'selected', 0); await settle(page, 'selected');
      const reset = await measure();
      await page.addStyleTag({ content: '[data-selected-background-scene] .v2-selected-heading > p { font-size:30px!important; line-height:1.7!important; }' });
      await page.waitForTimeout(250); const constrainedEnlarged = await measure();
      await scrollPose(page, 'selected', .42); await settle(page, 'selected', false); const constrained = await measure();
      await evidence('selected-constrained-text-reflow-' + width, page, { before: reset, enlarged: constrainedEnlarged, after: constrained });
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'selected-constrained-reflow-' + width + '.png') });
      // Collect both diagnostic stages before gating, so an overflow failure
      // never conceals a second, independent stale scroll-mapping regression.
      for (const [label, baseline, changed] of [['broad text zoom', before, broad], ['full-width copy reflow', reset, constrained]]) {
        assert.ok(changed.contentHeight > baseline.contentHeight + 80, label + ': normal-flow content really grew');
        assert.equal(changed.resizeEvents, 0, label + ': no window resize event');
        assert.equal(changed.documentScrollWidth <= changed.layoutViewport.width, true, label + ': no horizontal document overflow');
        assert.deepEqual(changed.overflow, [], label + ': text remains inside its own project card');
        assert.deepEqual(changed.viewport, baseline.viewport, label + ': mobile visual viewport is not expanded by overflow');
        near(changed.actual, changed.expected, label + ': scroll maps to CURRENT two-section bounds', .002);
        near(changed.rendered, changed.expected, label + ': revealed scene follows current content extent', .002);
      }
      assertHealthy(page, await snap(page)); console.log('PASS selected text reflow ' + width);
    } catch (error) { await failure(error); throw error; } finally { await context.close(); }
  }
}
(async () => {
  const version = require('playwright/package.json').version;
  assert.match(version, /^1\.57\./, 'Use official Playwright 1.57.x for reproducible browser evidence'); report.playwright = version;
  browser = await require('playwright').chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  watchdog = setTimeout(async () => { const error = new Error('Lifecycle group exceeded 350 seconds; run independent --group subsets'); await failure(error); await browser.close().catch(() => {}); console.error(error); process.exitCode = 1; }, 350000);
  try {
    if (group === 'all') { for (const name of ['hero', 'selected', 'aircraft']) await sceneJourney(name); await coldHashes(); await textReflow(); await aircraftAfterUpstreamReflow(); }
    else if (group === 'hashes') await coldHashes(); else if (group === 'reflow') { await textReflow(); await aircraftAfterUpstreamReflow(); } else await sceneJourney(group);
    report.passed = true; writeReport(); console.log('PASS lifecycle group ' + group + '; evidence: ' + out);
  } finally { clearTimeout(watchdog); await browser.close(); }
})().catch(async error => { await failure(error); console.error(error); process.exitCode = 1; });

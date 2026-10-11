/* v2 LIVE aircraft GPU backpressure acceptance.
 * --source-only executes production controller functions with deterministic
 * scheduling/GL doubles; it is not real-driver or rendered-pixel evidence.
 * --browser-only uses the real Three renderer, models, shared GPU helper and
 * allocated WebGL2 syncs. Only aircraft-context completion results are held.
 * Deliberate holds prove queue bounds and lifecycle ordering, not device FPS.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'assets/v3-aircraft-hero.js'), 'utf8');
const gpuSource = fs.readFileSync(path.join(repo, 'assets/v2-gpu-preparation.js'), 'utf8');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.V2_AIRCRAFT_PACING_OUT || path.join(process.env.V2_AIRCRAFT_OUT || '.codex-temp/v2-aircraft', 'pacing');
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const near = (actual, expected, label, epsilon = .000002) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} vs ${expected}`);

// Functions are extracted unchanged from production. These focused doubles
// replace drawing/DOM only; the production pacing and GPU-wait implementations
// execute together, including their actual cancel and finally paths.
function productionFunction(name) {
  const value = source.match(new RegExp('^  (?:async )?function ' + name + '\\([\\s\\S]*?^  \\}', 'm'))?.[0];
  assert.ok(value, 'Production function is present: ' + name); return value;
}
function sourceHarness() {
  let now = 100, sequence = 0, hold = false, allowedThrough = 0;
  const raf = new Map(), timers = new Map(), fences = [], draws = [], allocations = [], failures = [], listeners = new Map();
  const events = { addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } };
  const classes = new Set();
  const root = { dataset: { aircraftWarmMask: 'true', aircraftFrames: '0', aircraftSubmittedFrames: '0', aircraftCompletedFrames: '0', aircraftPoseRevision: '0', aircraftLayoutRevision: '0' },
    style: { setProperty() {} }, classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
  const canvas = { width: 1, height: 1, style: { visibility: 'hidden' } }, stage = { clientWidth: 1440, clientHeight: 900 };
  const track = { style: { height: '3690px' }, children: [] };
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, TIMEOUT_EXPIRED: 4, WAIT_FAILED: 5,
    fenceSync() { const record = { id: fences.length + 1, phase: root.dataset.aircraftGPUPhase, created: now, deleted: 0, polls: 0 }; fences.push(record); assert.equal(fences.filter(item => !item.deleted).length, 1, 'Only one real-helper sync may be owned'); return record; },
    clientWaitSync(record, flags, timeout) { assert.equal(flags, 0); assert.equal(timeout, 0); assert.equal(record.deleted, 0); record.polls++; return hold && record.id > allowedThrough ? this.TIMEOUT_EXPIRED : this.CONDITION_SATISFIED; },
    flush() {}, deleteSync(record) { assert.equal(record.deleted, 0); record.deleted++; }, isContextLost: () => false,
    finish() { throw Error('Blocking GL completion is forbidden'); } };
  let ratio = 1, rendererWidth = 1, rendererHeight = 1;
  const renderer = { capabilities: { isWebGL2: true }, getContext: () => gl,
    setPixelRatio(value) { ratio = value; canvas.width = Math.floor(rendererWidth * ratio); canvas.height = Math.floor(rendererHeight * ratio); allocations.push({ at: now, ratio }); },
    setSize(width, height) { rendererWidth = width; rendererHeight = height; canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio); allocations.push({ at: now, width, height }); } };
  const document = { ...events, hidden: false, activeElement: null, documentElement: {} };
  const context = vm.createContext({ window: {}, document, renderer, root, stage, canvas, track, ...events,
    background: true, deferred: true, detailed: true, visible: true, activePage: true, failed: false, ready: true, backgroundBusy: false, backgroundDone: true,
    frame: 0, frameCount: 0, liveBusy: false, liveAbort: undefined, liveGeneration: 0, gpuAbort: undefined, needsDrain: true,
    poseRevision: 0, presentedRevision: -1, layoutRevision: 0, submittedFrames: 0, completedFrames: 0,
    desiredRatio: 1, bufferWidth: 0, bufferHeight: 0, bufferRatio: 0,
    width: 1440, height: 900, rootTop: 1000, distance: 2790, progress: 0, lastScroll: 1000, scrollY: 1000, innerHeight: 900, devicePixelRatio: 1,
    landingDone: false, landingElapsed: 0, previousTime: 0, landingEntered: true, landingClockStarted: false, capturePose: undefined,
    renderedProgress: 0, scrubTime: 0, directScrub: false, scrub: require('../assets/v2-scroll-smoothing.js'),
    clamp: value => Math.max(0, Math.min(1, value)), allowed: () => true,
    skip: { hidden: true }, links: [{ focus() {} }], bar: { style: {} },
    flight: { telemetryReady: true, setLanding(value) { return { landing: Math.max(0, Math.min(1, value)), progress: 0, phase: value >= 1 ? 'stopped' : 'approach', separated: false }; }, setProgress(value) { return { landing: 1, progress: value, phase: value === 0 ? 'stopped' : 'progress', separated: value > .62 }; }, assemblyError: () => 0 },
    chapter(index) { root.dataset.aircraftChapter = String(index); },
    drawPose(pose) { assert.equal(fences.filter(record => !record.deleted).length, 0, 'No render occurs while earlier aircraft GPU commands remain pending'); draws.push({ at: now, ...pose, width: canvas.width, height: canvas.height }); return 1 - pose.progress; },
    publishAircraftPriority() {}, interruptBackground() {}, wakeBackground() {}, prepareInBackground() {}, initialize() {}, idleTurn: async () => {},
    fail(error) { failures.push(error); context.failed = true; context.root.dataset.aircraftState = 'unavailable'; context.liveAbort?.abort(); },
    getComputedStyle: () => ({ top: `${context.pinnedTop || 0}px`, scrollPaddingTop: '0px', getPropertyValue: () => '34' }),
    performance: { now: () => now }, AbortController, console, Math,
    requestAnimationFrame(callback) { const id = ++sequence; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; }, clearTimeout(id) { timers.delete(id); },
  });
  root.getBoundingClientRect = () => ({ top: 1000 - context.scrollY, bottom: 1000 + parseFloat(track.style.height) - context.scrollY });
  stage.getBoundingClientRect = () => ({ top: Math.max(0, 1000 - context.scrollY), bottom: Math.max(0, 1000 - context.scrollY) + stage.clientHeight });
  const names = ['maskCanvas', 'revisePose', 'pauseLandingClock', 'interruptLive', 'pixelRatio', 'endLanding', 'updateScroll', 'layout', 'render', 'gpuSucceeded', 'renderPaced', 'gpuComplete'];
  const declarations = ['request', 'chapterAt', 'aircraftVisible'].map(name => { const line = source.match(new RegExp('^  const ' + name + ' = .+$', 'm'))?.[0]; assert.ok(line); return line; });
  const lifecycleStart = source.indexOf("  document.addEventListener('visibilitychange',"), lifecycleEnd = source.indexOf('  const storyLead', lifecycleStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart);
  vm.runInContext(gpuSource, context, { filename: 'v2-gpu-preparation.js' });
  vm.runInContext(names.map(productionFunction).join('\n') + '\n' + declarations.join('\n') + '\n' + source.slice(lifecycleStart, lifecycleEnd), context, { filename: 'v3-aircraft-hero.extracted.js' });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const advance = async elapsed => {
    const until = now + elapsed; let count = 0;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break; assert.ok(++count < 4000, 'Bounded polling');
      const [id, timer] = pending; timers.delete(id); now = timer.at; timer.callback(); await flush();
    }
    now = until; await flush();
  };
  const frame = async (elapsed = 1000 / 60) => { await advance(elapsed); const pending = [...raf.values()]; raf.clear(); for (const callback of pending) callback(now); await flush(); };
  const request = () => vm.runInContext('request()', context);
  const scroll = value => { context.scrollY = 1000 + context.distance * value; context.updateScroll(); };
  const emit = type => { for (const callback of listeners.get(type) || []) callback({ type }); };
  const snapshot = () => ({ ...root.dataset, submission: JSON.parse(root.dataset.aircraftLastSubmission || 'null'), lastFrame: JSON.parse(root.dataset.aircraftLastFrame || 'null') });
  const settle = async () => { for (let i = 0; i < 500 && (raf.size || timers.size); i++) await frame(); assert.equal(raf.size + timers.size, 0, 'The settled live controller stops scheduling work'); assert.deepEqual(failures, []); };
  return { context, root, canvas, stage, fences, draws, allocations, failures, raf, timers, request, scroll, emit, snapshot, flush, advance, frame, settle,
    hold(value = true) { hold = value; }, releaseExisting() { return allowedThrough = fences.length; }, now: () => now };
}
async function sourceTests() {
  const reports = [];
  assert.match(productionFunction('render'), /if \(background\) \{ renderPaced\(time\); return; \}/, 'Only the background opt-in uses the new live pacing path');
  assert.match(productionFunction('gpuComplete'), /window\.V2GPUPreparation\.wait\(renderer/, 'Actual shared helper provides aircraft completion');
  {
    const h = sourceHarness(); h.request(); await h.frame(); // Initial drain and first real draw complete.
    assert.equal(h.snapshot().aircraftFrames, '1'); assert.equal(h.snapshot().aircraftWarmMask, 'false');
    h.hold(); await h.frame(); const before = h.snapshot(), draws = h.draws.length;
    await h.advance(5600); for (let i = 0; i < 20; i++) { h.request(); await h.frame(0); }
    assert.equal(h.draws.length, draws, 'A 5600ms GPU hold cannot queue landing draws'); assert.equal(h.raf.size, 0);
    h.releaseExisting(); await h.advance(4); await h.frame(); const next = h.snapshot();
    assert.equal(next.submission.sequence, before.submission.sequence + 1); near(next.submission.landing, 1, 'Landing catches up using full wall time', 1e-12);
    h.hold(false); await h.advance(4); await h.settle(); assert.equal(h.snapshot().aircraftState, 'ready');
    reports.push({ name: 'one-pending-live-frame-and-full-visible-landing-clock', holdMs: 5600, queuedDraws: 0, nextLanding: next.submission.landing });
  }
  {
    const h = sourceHarness(); h.context.needsDrain = false; h.hold(); h.request(); await h.frame();
    const first = h.snapshot(), allocations = h.allocations.length;
    await h.advance(3000); assert.equal(h.context.landingClockStarted, false); assert.equal(h.context.landingElapsed, 0, 'Initial unseen upload does not consume autoplay');
    h.context.directScrub = true;
    for (let i = 0; i < 24; i++) { h.scroll(i % 2 ? .86 : .21); await h.frame(); }
    h.stage.clientWidth = 1100; h.stage.clientHeight = 780; h.context.layout(); h.scroll(.86); await h.flush(); await h.frame();
    assert.equal(h.draws.length, 1); assert.equal(h.allocations.length, allocations, 'Resize never clears an in-flight buffer');
    assert.equal(h.snapshot().aircraftGPUPhase, 'live-drain'); assert.equal(h.snapshot().aircraftWarmMask, 'true');
    h.releaseExisting(); await h.advance(4); const next = h.snapshot();
    assert.equal(next.submission.sequence, first.submission.sequence + 1); near(next.submission.value, .86, 'Latest direct target replaces queued inputs', 1e-12);
    assert.equal(next.submission.layoutRevision, h.context.layoutRevision); assert.equal(next.submission.revision, h.context.poseRevision);
    assert.equal(h.canvas.width, 1100); assert.equal(h.canvas.height, 780); assert.equal(h.snapshot().aircraftFrames, '0');
    assert.equal(h.snapshot().aircraftWarmMask, 'true', 'Current-size submitted pixels cannot reveal before completion');
    h.hold(false); await h.advance(4); await h.settle(); assert.equal(h.snapshot().aircraftFrames, '1'); assert.equal(h.snapshot().aircraftWarmMask, 'false');
    assert.ok(h.fences.every(record => record.deleted === 1));
    reports.push({ name: 'initial-mask-latest-input-and-viewport-revision', discardedInputs: 24, latest: next.submission });
  }
  {
    const h = sourceHarness(); h.context.landingDone = true; h.scroll(.4); await h.frame(); await h.settle();
    h.hold(); h.scroll(.49); await h.frame(); const first = h.snapshot().submission, draws = h.draws.length;
    assert.ok(first.value > .4 && first.value < .49, 'Small wheel-style changes retain continuous smoothing');
    await h.advance(240); assert.equal(h.draws.length, draws); h.releaseExisting(); await h.advance(4); await h.frame();
    const next = h.snapshot().submission, elapsed = next.submittedMs - first.submittedMs;
    near(next.value, .49 - (.49 - first.value) * Math.exp(-elapsed / 70), 'Live controller feeds the full GPU-delayed interval into actual easing', 1e-12);
    h.hold(false); await h.advance(4); await h.settle(); near(h.snapshot().submission.value, .49, 'Smoothing settles to exact target', 1e-12);
    reports.push({ name: 'full-elapsed-live-scroll-integration', elapsed, first: first.value, next: next.value });
  }
  {
    const h = sourceHarness(); h.context.landingDone = true; h.context.needsDrain = false; h.hold(); h.scroll(.4); await h.frame();
    h.context.capturePose = { type: 'progress', value: .2 }; h.context.revisePose(true); h.request();
    h.context.capturePose = { type: 'progress', value: .91 }; h.context.revisePose(true); h.request();
    assert.equal(h.draws.length, 1); h.releaseExisting(); await h.advance(4); await h.frame();
    const next = h.snapshot().submission;
    assert.equal(next.kind, 'progress'); assert.equal(next.value, .91); assert.equal(h.snapshot().aircraftFrames, '0', 'Old in-flight pose cannot publish after newer capture seeks');
    h.hold(false); await h.advance(4); await h.settle(); assert.equal(h.snapshot().lastFrame.value, .91); assert.equal(h.snapshot().aircraftFrames, '1');
    reports.push({ name: 'latest-capture-seek-supersedes-held-pose', latest: next.value });
  }
  {
    const h = sourceHarness(); h.context.landingDone = true; h.scroll(.4); await h.frame(); await h.settle();
    h.hold(); h.scroll(.49); await h.frame(); const first = h.snapshot(); assert.equal(first.submission.masked, false);
    h.scroll(.86); assert.equal(h.snapshot().aircraftWarmMask, 'true'); h.releaseExisting(); await h.advance(4);
    assert.equal(h.snapshot().aircraftFrames, first.aircraftFrames, 'An already-live old wheel frame cannot reveal a later large-jump mask');
    assert.equal(h.snapshot().lastFrame.published, false); assert.equal(h.snapshot().aircraftWarmMask, 'true');
    await h.frame(); const latest = h.snapshot(); near(latest.submission.value, .86, 'Next frame adopts current large jump', 1e-12);
    assert.equal(latest.submission.masked, true); assert.equal(latest.aircraftFrames, first.aircraftFrames);
    h.hold(false); await h.advance(4); await h.settle(); assert.equal(h.snapshot().aircraftWarmMask, 'false');
    reports.push({ name: 'new-large-jump-mask-survives-older-unmasked-completion', latest: latest.submission.value });
  }
  for (const reason of ['hidden', 'pagehide', 'offscreen']) {
    const h = sourceHarness(); h.context.landingDone = true; h.scroll(.3); await h.frame(); await h.settle();
    h.hold(); h.scroll(.65); await h.frame(); const before = h.snapshot(), draws = h.draws.length, allocations = h.allocations.length;
    if (reason === 'hidden') { h.context.document.hidden = true; h.emit('visibilitychange'); }
    else if (reason === 'pagehide') h.emit('pagehide');
    else { h.context.scrollY = 9000; h.context.updateScroll(); }
    await h.flush(); assert.equal(h.snapshot().aircraftGPUCompletion, 'canceled'); assert.equal(h.raf.size + h.timers.size, 0);
    assert.ok(h.fences.every(record => record.deleted === 1));
    h.stage.clientWidth = 1024; h.stage.clientHeight = 768; h.context.layout(); await h.advance(500);
    assert.equal(h.draws.length, draws); assert.equal(h.allocations.length, allocations);
    if (reason !== 'offscreen') h.scroll(.7);
    if (reason === 'hidden') { h.context.document.hidden = false; h.emit('visibilitychange'); }
    else if (reason === 'pagehide') h.emit('pageshow');
    else h.scroll(.7);
    await h.frame(); assert.equal(h.snapshot().aircraftGPUPhase, 'live-drain'); assert.equal(h.draws.length, draws); assert.equal(h.allocations.length, allocations);
    h.releaseExisting(); await h.advance(4); assert.equal(h.snapshot().aircraftGPUPhase, 'live-frame');
    assert.equal(h.snapshot().submission.sequence, before.submission.sequence + 1); near(h.snapshot().submission.value, .7, 'Resume uses latest exact target', 1e-12);
    h.hold(false); await h.advance(4); await h.settle(); assert.ok(h.fences.every(record => record.deleted === 1));
    reports.push({ name: reason + '-cancels-owned-sync-then-drains-before-resize', completed: h.snapshot().aircraftCompletedFrames });
  }
  {
    const h = sourceHarness(); h.context.landingDone = true; h.scroll(.4); await h.frame(); await h.settle();
    const draws = h.draws.length, allocations = h.allocations.length; await h.advance(2000);
    assert.equal(h.draws.length, draws); assert.equal(h.raf.size + h.timers.size, 0);
    h.context.layout(); await h.frame(); await h.settle(); assert.equal(h.allocations.length, allocations, 'Unchanged layout does not reallocate the canvas');
    h.context.scrollY = 9000; h.context.updateScroll(); await h.flush(); const offscreen = h.draws.length;
    for (let i = 0; i < 30; i++) { h.request(); await h.frame(); } assert.equal(h.draws.length, offscreen); assert.equal(h.raf.size + h.timers.size, 0);
    reports.push({ name: 'finite-idle-unchanged-buffer-and-offscreen-no-live-work', offscreenDraws: 0 });
  }
  {
    const h = sourceHarness(); h.context.landingDone = true; h.context.pinnedTop = 76;
    h.scroll(.4); await h.frame(); await h.settle(); const draws = h.draws.length;
    // At maximum page scroll a short footer can leave the root's final pixels
    // behind the opaque fixed header. Window intersection is not readable area.
    h.context.scrollY = 1000 + parseFloat(h.context.track.style.height) - 46.65;
    h.context.updateScroll(); await h.flush(); assert.equal(h.context.visible, false);
    const box = h.root.getBoundingClientRect(); assert.ok(box.bottom > 0 && box.bottom < h.context.pinnedTop);
    for (let i = 0; i < 12; i++) { h.request(); await h.frame(); }
    assert.equal(h.draws.length, draws); assert.equal(h.raf.size + h.timers.size, 0);
    reports.push({ name: 'fixed-header-covered-root-has-no-readable-aircraft-or-live-work', rootBottom: box.bottom, pinnedTop: h.context.pinnedTop });
  }
  for (const report of reports) console.log('PASS ' + report.name);
  return { scope: 'Unchanged production pacing/lifecycle/layout functions and shared completion helper, with renderer/DOM doubles. Real browser acceptance is a separate required stage.', reports };
}


function browserProbe() {
  const control = window.__aircraftPacing = { hold: false, allowedThrough: 0, phases: ['live-frame'], fences: [], inputs: [], changes: [], draws: 0, drawsWhilePending: [], opportunities: 0, webgl2: false };
  const root = () => document.querySelector('[data-aircraft-hero]');
  const pending = () => control.fences.filter(record => record.deleted === undefined);
  control.snapshot = () => {
    const node = root(), canvas = node?.querySelector('[data-aircraft-canvas]'), stage = node?.querySelector('[data-aircraft-stage]'), poster = node?.querySelector('[data-aircraft-poster]'), box = node?.getBoundingClientRect();
    const pinnedTop = stage ? parseFloat(getComputedStyle(stage).top) || 0 : 0;
    return { at: performance.now(), scrollY, viewport: { width: innerWidth, height: innerHeight }, dataset: { ...node?.dataset },
      bounds: box ? { top: box.top, bottom: box.bottom, height: box.height } : null, pinnedTop, maximumScrollY: document.documentElement.scrollHeight - innerHeight,
      visible: Boolean(box && box.top < innerHeight && box.bottom > 0), readableVisible: Boolean(box && box.top < innerHeight && box.bottom > pinnedTop),
      webgl2: control.webgl2, draws: control.draws, pending: pending().length,
      submission: node?.dataset.aircraftLastSubmission ? JSON.parse(node.dataset.aircraftLastSubmission) : null,
      lastFrame: node?.dataset.aircraftLastFrame ? JSON.parse(node.dataset.aircraftLastFrame) : null,
      canvas: canvas ? { width: canvas.width, height: canvas.height, visibility: getComputedStyle(canvas).visibility, opacity: getComputedStyle(canvas).opacity } : null,
      stage: stage ? { width: stage.clientWidth, height: stage.clientHeight } : null,
      poster: poster ? { decoded: poster.complete && poster.naturalWidth > 0, visibility: getComputedStyle(poster).visibility, opacity: getComputedStyle(poster).opacity } : null,
      fences: control.fences.map(record => ({ ...record })), inputs: [...control.inputs], opportunities: control.opportunities,
      drawsWhilePending: [...control.drawsWhilePending], changes: [...control.changes],
    };
  };
  control.setHidden = hidden => {
    // Explicitly simulated visibility lifecycle. Native wheel/touch input is
    // checked separately; this does not claim real OS background-tab behavior.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  for (const type of ['wheel', 'touchmove']) document.addEventListener(type, event => {
    if (event.target.closest?.('[data-aircraft-hero]')) control.inputs.push({ type, trusted: event.isTrusted, at: performance.now() });
  }, { passive: true, capture: true });
  const native = HTMLCanvasElement.prototype.getContext, seen = new WeakSet(), owned = new Map();
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const gl = native.call(this, type, ...args);
    if (!gl || !this.matches('[data-aircraft-canvas]') || seen.has(gl)) return gl;
    seen.add(gl); control.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') return gl;
    const create = gl.fenceSync.bind(gl), poll = gl.clientWaitSync.bind(gl), remove = gl.deleteSync.bind(gl);
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = gl[name]?.bind(gl); if (!draw) continue;
      gl[name] = (...values) => {
        control.draws++;
        if (pending().length) control.drawsWhilePending.push({ at: performance.now(), name, phase: root()?.dataset.aircraftGPUPhase, outstanding: pending().map(record => record.id) });
        return draw(...values);
      };
    }
    gl.fenceSync = (...values) => {
      const sync = create(...values);
      if (sync) {
        const record = { id: control.fences.length + 1, created: performance.now(), phase: root()?.dataset.aircraftGPUPhase,
          width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, drawsAtCreate: control.draws,
          heldPolls: 0, polls: 0, maxTimeout: 0, outstandingAtCreate: pending().length + 1 };
        owned.set(sync, record); control.fences.push(record);
      }
      return sync;
    };
    gl.clientWaitSync = (sync, flags, wait) => {
      const status = poll(sync, flags, wait), record = owned.get(sync);
      if (record) { record.polls++; record.maxTimeout = Math.max(record.maxTimeout, wait); record.nativeStatus = status; record.lastPoll = performance.now(); }
      if (control.hold && record && record.id > control.allowedThrough && control.phases.includes(record.phase) && status !== gl.WAIT_FAILED) { record.heldPolls++; return gl.TIMEOUT_EXPIRED; }
      return status;
    };
    gl.deleteSync = sync => { const record = owned.get(sync); if (record) { record.deleted = performance.now(); record.deleteCalls = (record.deleteCalls || 0) + 1; } return remove(sync); };
    return gl;
  };
  new MutationObserver(records => {
    if (!records.some(record => record.target === root()) || control.changes.length >= 2000) return;
    const node = root(), canvas = node?.querySelector('canvas');
    control.changes.push({ at: performance.now(), submitted: Number(node?.dataset.aircraftSubmittedFrames || 0), completed: Number(node?.dataset.aircraftCompletedFrames || 0),
      presented: Number(node?.dataset.aircraftFrames || 0), revision: node?.dataset.aircraftPoseRevision, presentedRevision: node?.dataset.aircraftPresentedRevision,
      mask: node?.dataset.aircraftWarmMask, visibility: canvas ? getComputedStyle(canvas).visibility : null,
      width: canvas?.width, height: canvas?.height, phase: node?.dataset.aircraftGPUPhase, completion: node?.dataset.aircraftGPUCompletion });
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-aircraft-submitted-frames', 'data-aircraft-completed-frames', 'data-aircraft-frames', 'data-aircraft-warm-mask', 'data-aircraft-presented-revision'] });
}

async function browserTests() {
  const { chromium } = require('playwright');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'no-preference' });
  await context.addInitScript(browserProbe);
  const page = await context.newPage(), errors = [], shaders = [], evidence = [];
  page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text()); });
  const snapshot = () => page.evaluate(() => window.__aircraftPacing.snapshot());
  const arm = phases => page.evaluate(phases => { const control = window.__aircraftPacing; control.hold = true; control.allowedThrough = control.fences.length; control.phases = phases; }, phases || ['live-frame', 'live-drain']);
  const held = (phase, after = 0) => page.waitForFunction(({ phase, after }) => window.__aircraftPacing.fences.some(record => record.id > after && record.deleted === undefined && record.heldPolls > 0 && (!phase || record.phase === phase)), { phase, after });
  const releaseExisting = () => page.evaluate(() => { const control = window.__aircraftPacing; return control.allowedThrough = control.fences.length; });
  const releaseAll = () => page.evaluate(() => { window.__aircraftPacing.hold = false; });
  const scroll = value => page.evaluate(value => {
    const root = document.querySelector('[data-aircraft-hero]'), stage = root.querySelector('[data-aircraft-stage]'), track = root.querySelector('.v3-aircraft-track');
    scrollTo({ top: scrollY + root.getBoundingClientRect().top + (parseFloat(track.style.height) - stage.clientHeight) * value, behavior: 'instant' });
  }, value);
  const opportunities = count => page.evaluate(async count => { for (let i = 0; i < count; i++) { await new Promise(resolve => requestAnimationFrame(resolve)); window.__aircraftPacing.opportunities++; } }, count);
  const settled = () => page.waitForFunction(() => {
    const root = document.querySelector('[data-aircraft-hero]'), data = root.dataset, last = JSON.parse(data.aircraftLastFrame || 'null');
    return data.aircraftGPUPending === 'false' && data.aircraftGPUCompletion === 'complete' && data.aircraftWarmMask === 'false' && last?.published === true &&
      data.aircraftState === 'ready' && Math.abs(Number(data.aircraftRenderedProgress) - Number(data.aircraftProgress)) < .000002;
  });
  const assertMasked = (state, reason) => { assert.equal(state.dataset.aircraftWarmMask, 'true', reason); assert.equal(state.canvas.visibility, 'hidden', reason); assert.equal(state.poster.visibility, 'visible', reason); assert.ok(state.poster.decoded, 'The real decoded aircraft photograph covers incomplete rendering'); };
  const assertFullSize = state => { const ratio = Number(state.dataset.aircraftLivePixelRatio); assert.equal(state.canvas.width, Math.floor(state.stage.width * ratio)); assert.equal(state.canvas.height, Math.floor(state.stage.height * ratio)); };
  const assertNoNewDraw = (before, after, reason) => { assert.equal(after.dataset.aircraftSubmittedFrames, before.dataset.aircraftSubmittedFrames, reason); assert.equal(after.draws, before.draws, reason); assert.deepEqual(after.drawsWhilePending, [], 'No actual aircraft WebGL draw call may run behind an owned completion fence'); };
  try {
    await page.goto(base + '/v2/?v=live-aircraft-pacing', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const data = document.querySelector('[data-aircraft-hero]').dataset; return data.aircraftBackgroundReady === 'true' && data.aircraftTelemetryReady === 'true' && data.aircraftGPUPending === 'false'; });
    const prepared = await snapshot();
    assert.equal(prepared.webgl2, true, 'This acceptance requires a real WebGL2 aircraft context');
    assert.equal(Number(prepared.dataset.aircraftSubmittedFrames || 0), 0, 'Offscreen preparation does not submit live aircraft frames');
    assert.equal(prepared.dataset.aircraftWarmFrames, '2');
    assert.ok(prepared.fences.length >= 3 && prepared.fences.every(record => record.deleteCalls === 1), 'Real warm-context GPU fences complete before live entry');
    await arm(['live-frame']); await scroll(0); await held('live-frame');
    const first = await snapshot(); assert.equal(first.pending, 1); assertMasked(first, 'First full-size frame stays behind the poster until its own completion'); assertFullSize(first);
    await opportunities(12); const firstHeld = await snapshot(); assertNoNewDraw(first, firstHeld, 'Initial pending live frame never queues obsolete landing draws');
    await held('live-frame', await releaseExisting());
    const second = await snapshot();
    assert.equal(Number(second.dataset.aircraftCompletedFrames), 1); assert.equal(Number(second.dataset.aircraftFrames), 1);
    assert.equal(second.dataset.aircraftWarmMask, 'false', 'First current completed frame starts the visible landing');
    assert.ok(second.submission.sequence > first.submission.sequence);
    // Hold only after the first current full-size frame has actually published.
    // Initial poster-covered preparation deliberately does not consume autoplay.
    await page.waitForTimeout(5600); await opportunities(4);
    const delayed = await snapshot(); assertNoNewDraw(second, delayed, 'Five seconds of landing opportunities cannot become a GPU command queue'); assert.equal(delayed.pending, 1);
    await held('live-frame', await releaseExisting()); const caughtUp = await snapshot();
    assert.equal(caughtUp.submission.sequence, second.submission.sequence + 1, 'The next single frame replaces every missed landing opportunity');
    assert.ok(caughtUp.submission.submittedMs - second.submission.submittedMs >= 5400, 'The clock really advanced while the aircraft fence was held');
    near(caughtUp.submission.landing, 1, 'Visible landing uses full elapsed time after GPU delay');
    evidence.push({ name: 'real-webgl-one-pending-frame-and-wall-clock-landing', prepared, first, firstHeld, second, delayed, caughtUp });
    await releaseAll(); await settled();

    await arm(); await scroll(.09); await held('live-frame'); const beforeJump = await snapshot();
    assert.equal(beforeJump.submission.masked, false, 'Small wheel-style input starts from an already visible canvas');
    await scroll(.78); await opportunities(12); const jumpMasked = await snapshot();
    assertNoNewDraw(beforeJump, jumpMasked, 'Large jump does not queue behind a prior already-live draw');
    assertMasked(jumpMasked, 'Large native scrollbar jump covers the obsolete live pose');
    await held('live-frame', await releaseExisting()); const jumpLatest = await snapshot();
    assert.equal(jumpLatest.submission.sequence, beforeJump.submission.sequence + 1);
    assert.equal(jumpLatest.dataset.aircraftFrames, beforeJump.dataset.aircraftFrames, 'The older unmasked submission cannot remove a newer jump mask');
    near(jumpLatest.submission.value, Number(jumpMasked.dataset.aircraftProgress), 'First replacement frame goes directly to the current jump');
    assertMasked(jumpLatest, 'Latest jump stays masked until its own real fence completes');
    await releaseAll(); await settled(); const jumpComplete = await snapshot();
    evidence.push({ name: 'already-live-old-frame-cannot-unmask-new-jump', beforeJump, jumpMasked, jumpLatest, jumpComplete });

    await arm(); await scroll(.32); await held('live-frame'); const inputStart = await snapshot();
    await page.mouse.move(1100, 430); await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => window.__aircraftPacing.inputs.some(input => input.type === 'wheel' && input.trusted));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1150, y: 610 }] });
    for (const y of [580, 545, 500]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1150, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => window.__aircraftPacing.inputs.some(input => input.type === 'touchmove' && input.trusted));
    await page.evaluate(async () => {
      const root = document.querySelector('[data-aircraft-hero]');
      for (let i = 0; i < 20; i++) {
        const distance = parseFloat(root.querySelector('.v3-aircraft-track').style.height) - root.querySelector('[data-aircraft-stage]').clientHeight;
        scrollTo({ top: scrollY + root.getBoundingClientRect().top + distance * (i % 2 ? .86 : .21), behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(resolve)); window.__aircraftPacing.opportunities++;
      }
    });
    await page.setViewportSize({ width: 1100, height: 780 }); await scroll(.86); await opportunities(8); await held();
    const superseded = await snapshot(); assertNoNewDraw(inputStart, superseded, 'Trusted input, twenty jumps and resize are coalesced while GPU completion is held');
    assert.equal(superseded.canvas.width, inputStart.canvas.width); assert.equal(superseded.canvas.height, inputStart.canvas.height);
    assertMasked(superseded, 'Resize invalidates old-size pixels and retains the real photograph');
    const expected = Number(superseded.dataset.aircraftProgress), presentedBefore = Number(superseded.dataset.aircraftFrames);
    await held('live-frame', await releaseExisting()); const latest = await snapshot();
    assert.equal(latest.submission.sequence, inputStart.submission.sequence + 1);
    near(latest.submission.rawAtSubmit, expected, 'Next frame reads the final native scrollbar target');
    near(latest.submission.value, expected, 'Trusted touch keeps the latest pose direct rather than replaying a smoothing queue');
    assert.equal(latest.submission.direct, true); assertFullSize(latest); assertMasked(latest, 'New full-size frame is still masked until that exact frame completes');
    assert.equal(Number(latest.dataset.aircraftFrames), presentedBefore, 'Old completion cannot publish the superseded viewport');
    assert.equal(String(latest.submission.revision), latest.dataset.aircraftPoseRevision);
    await page.screenshot({ path: path.join(output, 'latest-fullsize-still-masked.png'), animations: 'disabled' });
    await releaseAll(); await settled(); const revealed = await snapshot();
    assertFullSize(revealed); assert.equal(revealed.canvas.visibility, 'visible');
    near(revealed.lastFrame.value, expected, 'Revealed frame is the current requested pose');
    assert.equal(String(revealed.lastFrame.revision), revealed.dataset.aircraftPresentedRevision);
    evidence.push({ name: 'trusted-wheel-touch-jumps-and-viewport-revision', inputStart, superseded, latest, revealed });
    await page.screenshot({ path: path.join(output, 'latest-fullsize-complete.png'), animations: 'disabled' });

    for (const reason of ['hidden', 'pagehide', 'offscreen']) {
      await arm(); await scroll(.35); await held('live-frame'); const before = await snapshot();
      if (reason === 'hidden') await page.evaluate(() => window.__aircraftPacing.setHidden(true));
      else if (reason === 'pagehide') await page.evaluate(() => dispatchEvent(new Event('pagehide')));
      else await page.locator('.v2-about-preview').evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top + 120, behavior: 'instant' }));
      await page.waitForFunction(() => { const data = document.querySelector('[data-aircraft-hero]').dataset; return data.aircraftGPUCompletion === 'canceled' && !window.__aircraftPacing.fences.some(record => record.deleted === undefined); });
      const canceled = await snapshot(); assert.equal(canceled.pending, 0);
      if (reason === 'offscreen') {
        assert.equal(canceled.readableVisible, false, 'Leaving below the aircraft removes it from the readable viewport');
        assert.ok(canceled.bounds.bottom <= canceled.pinnedTop, 'Any remaining aircraft root pixels are covered by the opaque fixed header');
      }
      assert.equal(canceled.fences.at(-1).deleteCalls, 1, `${reason} deletes its real pending sync exactly once`);
      await page.setViewportSize({ width: reason === 'pagehide' ? 1180 : 1080, height: reason === 'pagehide' ? 820 : 800 });
      if (reason !== 'offscreen') await scroll(.68);
      await page.waitForTimeout(180); await opportunities(8); const paused = await snapshot();
      assertNoNewDraw(before, paused, `${reason} suspends live rendering and physical buffer changes`);
      assert.equal(paused.canvas.width, before.canvas.width); assert.equal(paused.canvas.height, before.canvas.height);
      assert.equal(paused.fences.reduce((sum, record) => sum + record.polls, 0), canceled.fences.reduce((sum, record) => sum + record.polls, 0), 'Cancellation stops timer polling until resume');
      if (reason === 'hidden') await page.evaluate(() => window.__aircraftPacing.setHidden(false));
      else if (reason === 'pagehide') await page.evaluate(() => dispatchEvent(new Event('pageshow')));
      else await scroll(.68);
      await held('live-drain'); const drain = await snapshot(); assert.equal(drain.pending, 1);
      assertNoNewDraw(before, drain, `${reason} resume drains old commands before any new live draw`);
      assert.equal(drain.canvas.width, before.canvas.width); assert.equal(drain.canvas.height, before.canvas.height);
      await held('live-frame', await releaseExisting()); const resumed = await snapshot();
      assert.equal(resumed.submission.sequence, before.submission.sequence + 1); assertFullSize(resumed);
      near(resumed.submission.rawAtSubmit, Number(resumed.dataset.aircraftProgress), 'Resumed frame uses the current scroll position');
      near(resumed.submission.value, resumed.submission.rawAtSubmit, 'Lifecycle resume adopts the latest exact pose');
      assertMasked(resumed, 'A resumed current-size frame remains covered until completion');
      await releaseAll(); await settled(); const complete = await snapshot();
      evidence.push({ name: reason + '-cancellation-delete-drain-resize-resume', before, canceled, paused, drain, resumed, complete });
    }
    // The bottom-of-document scroll used above may leave the root's last few
    // pixels behind the fixed header. Use the document top for the independent
    // fully-outside-window idle proof, and verify geometry before measuring.
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('[data-aircraft-hero]').getBoundingClientRect().top >= innerHeight);
    await opportunities(8); const offscreen = await snapshot(); await page.waitForTimeout(700); const idle = await snapshot();
    assert.equal(idle.visible, false); assert.equal(idle.readableVisible, false); assert.ok(idle.bounds.top >= idle.viewport.height);
    assertNoNewDraw(offscreen, idle, 'Offscreen aircraft has no new live-frame submissions');
    assert.equal(idle.pending, 0); assert.equal(idle.dataset.aircraftWarmFrames, '2');
    assert.ok(idle.fences.every(record => record.deleteCalls === 1 && record.outstandingAtCreate === 1 && record.maxTimeout === 0), 'Every real sync is uniquely owned, nonblocking and deleted exactly once');
    assert.deepEqual(errors, [], 'No uncaught browser errors'); assert.deepEqual(shaders, [], 'No shader failures');
    evidence.push({ name: 'finite-offscreen-idle-and-owned-real-syncs', offscreen, idle });
    const report = { passed: true, scope: 'Real software-WebGL2 controller and GPU helper with scoped completion holds; trusted native wheel and touch. Visibility/pagehide events are explicitly simulated. This establishes scheduling/coverage ordering, not hardware FPS or compositor presentation.', evidence };
    fs.writeFileSync(path.join(output, 'aircraft-pacing.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS real aircraft GPU backpressure, elapsed landing, latest trusted input/resize, current-frame mask, cancellation/drain and offscreen idle');
    return report;
  } catch (error) {
    fs.writeFileSync(path.join(output, 'aircraft-pacing-failure.json'), JSON.stringify({ error: error.stack, errors, shaders, evidence, state: await snapshot().catch(() => null) }, null, 2) + '\n');
    await page.screenshot({ path: path.join(output, 'aircraft-pacing-failure.png'), animations: 'disabled', timeout: 30000 }).catch(() => {});
    throw error;
  } finally { await context.close(); await browser.close(); }
}

(async () => {
  if (!process.argv.includes('--browser-only')) console.log(JSON.stringify({ source: await sourceTests() }, null, 2));
  if (!process.argv.includes('--source-only')) await browserTests();
})().catch(error => { console.error(error); process.exitCode = 1; });

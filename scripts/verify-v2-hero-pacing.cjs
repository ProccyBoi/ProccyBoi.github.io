/* Hero GPU backpressure acceptance.
 * --source-only runs the complete controller with deterministic DOM/Three/GL
 * doubles. This proves scheduling, not real-driver performance or pixels.
 * --browser-only uses actual Three, CAD and real WebGLSync objects. It delays
 * genuine model delivery and only holds hero-context clientWaitSync results.
 * The controller and shared GPU helper are never replaced in browser tests.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'assets/v2-assembly.js'), 'utf8');
const gpuSource = fs.readFileSync(path.join(repo, 'assets/v2-gpu-preparation.js'), 'utf8');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = process.env.HERO_PACING_OUT || path.join(process.env.HERO_STARTUP_OUT || '.codex-temp/hero-startup', 'pacing');
const timeout = Number(process.env.V2_BROWSER_TIMEOUT || 120000);
const tests = [];
const test = (name, run) => tests.push({ name, run });
const near = (actual, expected, label, epsilon = 1e-11) => assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} vs ${expected}`);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness({ unsupported = false } = {}) {
  let now = 100, sequence = 0, top = 0, held = false, lost = false;
  const raf = new Map(), timers = new Map(), draws = [], compiles = [], resizes = [], fences = [], warnings = [];
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
      dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); },
    };
  };
  const node = () => {
    const values = new Map(), classes = new Set(), attributes = new Map();
    return { ...events(), dataset: {}, style: {
      setProperty(key, value) { values.set(key, value); }, getPropertyValue(key) { return values.get(key) || ''; }, removeProperty(key) { values.delete(key); },
    }, classList: {
      add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); }, contains(name) { return classes.has(name); },
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    }, setAttribute(key, value) { attributes.set(key, value); }, removeAttribute(key) { attributes.delete(key); if (key === 'style') values.clear(); } };
  };
  const root = node(), stage = node(), canvas = node(), header = node(), posters = Array.from({ length: 3 }, node), selectors = Array.from({ length: 3 }, node);
  stage.clientWidth = 1440; stage.clientHeight = 900; root.offsetHeight = 3420;
  header.clientHeight = 76;
  const rectangle = (top, width, height) => ({ top, bottom: top + height, left: 0, right: width, width, height });
  root.getBoundingClientRect = () => rectangle(top, stage.clientWidth, root.offsetHeight);
  // Match the actual top:0 sticky stage: its parent pushes it up at the end
  // of the section. The section itself can still intersect with no readable
  // stage pixels because the opaque fixed header covers its positive tail.
  stage.getBoundingClientRect = () => rectangle(Math.min(Math.max(top, 0), top + root.offsetHeight - stage.clientHeight), stage.clientWidth, stage.clientHeight);
  canvas.getBoundingClientRect = stage.getBoundingClientRect;
  header.getBoundingClientRect = () => rectangle(0, stage.clientWidth, header.clientHeight);
  const nodes = new Map([['[data-assembly-canvas]', canvas], ['.v2-assembly-sticky', stage]]);
  root.querySelector = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  root.querySelectorAll = key => key === '[data-assembly-select]' ? selectors : posters;
  const document = { ...events(), hidden: false, querySelector: selector => selector === '.v2-header' ? header : root, head: { append() { throw new Error('Unexpected script transport'); } }, createElement(name) {
    assert.equal(name, 'canvas'); return { getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) };
  } };
  class Vector {
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    setScalar(s) { return this.set(s, s, s); } copy(value) { return Object.assign(this, value); }
    clone() { return new Vector().copy(this); } normalize() { return this; } addScaledVector() { return this; } applyMatrix4() { return this; }
  }
  class Object3D {
    constructor() { this.position = new Vector(); this.rotation = new Vector(); this.scale = new Vector(); this.children = []; this.visible = true; this.userData = {}; }
    add(...children) { this.children.push(...children); } remove(child) { this.children = this.children.filter(value => value !== child); }
    traverse(callback) { callback(this); this.children.forEach(child => child.traverse?.(callback)); } lookAt() {} updateMatrixWorld() {} updateProjectionMatrix() {}
  }
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2, CONDITION_SATISFIED: 3, TIMEOUT_EXPIRED: 4, WAIT_FAILED: 5,
    fenceSync() { const sync = { id: fences.length + 1, created: now, deleted: 0 }; fences.push(sync); assert.equal(fences.filter(f => !f.deleted).length, 1, 'Only one owned GPU sync can be live'); return sync; },
    clientWaitSync(sync, flags, wait) { assert.equal(flags, 0); assert.equal(wait, 0); assert.equal(sync.deleted, 0); return held ? this.TIMEOUT_EXPIRED : this.CONDITION_SATISFIED; },
    flush() {}, deleteSync(sync) { assert.equal(sync.deleted, 0); sync.deleted++; }, isContextLost: () => lost,
    finish() { throw new Error('Synchronous GPU finish is forbidden'); },
  };
  let renderer;
  class Renderer {
    constructor() { renderer = this; this.shadowMap = {}; this.capabilities = { isWebGL2: !unsupported }; this.info = { render: { calls: 3 } }; }
    getContext() { return gl; } setPixelRatio(value) { resizes.push({ ratio: value, at: now }); } setSize(width, height) { resizes.push({ width, height, at: now }); }
    compile(scene) {
      assert.equal(fences.filter(fence => !fence.deleted).length, 0, 'Compile cannot bypass an owned pending GPU batch');
      const models = scene.children.filter(child => child.modelName);
      assert.ok(models.every(model => model.visible), 'Overview compilation never traverses a hidden installed model');
      compiles.push({ at: now, names: models.map(model => model.modelName) });
    }
    render(scene) { draws.push({ at: now, names: scene.children.filter(child => child.modelName).map(child => child.modelName) }); }
    dispose() { this.disposed = true; }
  }
  class Material { constructor(values) { Object.assign(this, values); } dispose() {} }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class Light extends Object3D { constructor() { super(); this.target = new Object3D(); this.shadow = { camera: new Object3D(), mapSize: { set() {} } }; } }
  const THREE = { WebGLRenderer: Renderer, Scene: Object3D, OrthographicCamera: Object3D, HemisphereLight: Light, DirectionalLight: Light,
    Vector3: Vector, Box3: class { makeEmpty() {} expandByObject() {} isEmpty() { return true; } }, Mesh, MeshBasicMaterial: Material,
    PlaneGeometry: class { dispose() {} }, CanvasTexture: class {}, GLTFLoader: class {},
  };
  const gates = Object.fromEntries(['tramtrace', 'telemetry', 'pi'].map(name => [name, deferred()]));
  const model = name => { const group = new Object3D(); group.modelName = name; return { group, parts: [] }; };
  const loaderReady = [], loaderFailed = [];
  const reduced = { ...events(), matches: false };
  let intersection;
  const window = { ...events(), THREE, V2HeroAssets: { prefetch: async () => {}, load: name => gates[name].promise },
    V2HeroEnvironment: { prefetch: async () => {}, load: async () => ({ dispose() {} }) },
    V2HeroMotion: { apply() {}, prepare() {} }, V2HeroLoading: { create: () => ({ setPose() {}, modelReady(index) { loaderReady.push(index); }, modelFailed(index) { loaderFailed.push(index); }, suspend() {} }) },
  };
  const context = vm.createContext({ window, document, navigator: {}, matchMedia: () => reduced, performance: { now: () => now },
    AbortController, Map, console: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
    innerWidth: stage.clientWidth, innerHeight: stage.clientHeight, devicePixelRatio: 1, scrollY: 0, scrollTo() {}, CustomEvent: class { constructor(type, options) { Object.assign(this, { type }, options); } },
    addEventListener: window.addEventListener, requestAnimationFrame(callback) { const id = ++sequence; raf.set(id, callback); return id; }, cancelAnimationFrame(id) { raf.delete(id); },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; }, clearTimeout(id) { timers.delete(id); },
    ResizeObserver: class { observe() {} }, IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
  });
  vm.runInContext(gpuSource, context, { filename: 'v2-gpu-preparation.js' });
  vm.runInContext(source, context, { filename: 'v2-assembly.js' });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const advance = async duration => {
    const until = now + duration; let polls = 0;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      assert.ok(++polls <= 4000, 'GPU polling must remain finite');
      const [id, timer] = pending; timers.delete(id); now = timer.at; timer.callback(); await flush();
    }
    now = until; await flush();
  };
  const frame = async (elapsed = 1000 / 60) => { await advance(elapsed); const pending = [...raf.values()]; raf.clear(); pending.forEach(callback => callback(now)); await flush(); await advance(0); };
  const settle = async () => { for (let i = 0; i < 240 && (raf.size || timers.size); i++) await frame(); assert.equal(raf.size + timers.size, 0, 'Settled hero must stop RAF and timer work'); };
  const release = async name => { gates[name].resolve(model(name)); await flush(); };
  const scrollPixels = (value, notify = true) => { top = -value; context.scrollY = value; if (notify) window.dispatchEvent({ type: 'scroll' }); };
  const scroll = value => scrollPixels(value * (root.offsetHeight - stage.clientHeight));
  const boundary = (bottom, notify = true) => scrollPixels(root.offsetHeight - bottom, notify);
  const snapshot = () => ({ ...root.dataset, submission: root.dataset.assemblyLastSubmission ? JSON.parse(root.dataset.assemblyLastSubmission) : null });
  return { root, stage, header, posters, raf, timers, draws, compiles, resizes, fences, loaderReady, loaderFailed, warnings, reduced, document, gl, context,
    renderer: () => renderer, now: () => now, flush, advance, frame, settle, release, scroll, boundary, snapshot,
    hold(value = true) { held = value; }, lose() { lost = true; }, emit(type) { window.dispatchEvent({ type }); },
    intersect(visible) { intersection([{ isIntersecting: visible, boundingClientRect: root.getBoundingClientRect() }]); },
    hidden(value) { document.hidden = value; document.dispatchEvent({ type: 'visibilitychange' }); },
  };
}

async function loaded(options) {
  const h = harness(options); await h.flush(); await h.frame();
  for (const name of ['tramtrace', 'telemetry', 'pi']) await h.release(name);
  await h.settle(); return h;
}

test('overview prepares unchanged programs only once per newly installed model set', async () => {
  const h = harness(); await h.flush(); await h.frame();
  await h.release('tramtrace'); h.hold(); await h.frame();
  assert.equal(h.compiles.length, 1); assert.deepEqual(h.compiles[0].names, ['tramtrace']);
  await h.release('telemetry'); await h.release('pi'); await h.frame();
  assert.equal(h.compiles.length, 1, 'Late installation cannot compile behind the pending lead frame');
  h.hold(false); await h.advance(4); await h.settle();
  assert.equal(h.compiles.length, 2); assert.deepEqual(h.compiles[1].names, ['tramtrace', 'telemetry', 'pi']);
  assert.equal(h.snapshot().assemblyProgramPreparations, '2');
  assert.ok(h.snapshot().submission.cpuMs >= h.snapshot().submission.programPreparationMs, 'Submission CPU accounting includes compilation');
  for (const target of [.265, .565, .88, 0]) { h.scroll(target); await h.settle(); }
  assert.equal(h.compiles.length, 2, 'Scroll/reverse/reassembly never recompiles the same installed objects');
  return { preparations: h.compiles, pendingCompilation: 0, repeatedCompilation: 0 };
});

test('cold chapter entry skips hidden model compilation and overview return prepares once', async () => {
  const h = harness(); await h.flush(); await h.frame(); h.scroll(.565);
  for (const name of ['tramtrace', 'telemetry', 'pi']) await h.release(name);
  await h.settle(); assert.equal(h.compiles.length, 0);
  assert.equal(h.snapshot().submission.value, .565);
  h.scroll(0); await h.settle(); assert.equal(h.compiles.length, 1);
  assert.equal(h.snapshot().submission.value, 0);
  return { coldChapterCompiles: 0, overviewCompiles: 1 };
});

test('offscreen installation stays uncompiled until a visible owned draw', async () => {
  const h = harness(); await h.flush(); await h.frame(); h.boundary(-1); h.intersect(false);
  for (const name of ['tramtrace', 'telemetry', 'pi']) await h.release(name);
  await h.frame(); assert.equal(h.compiles.length, 0); assert.equal(h.draws.length, 0);
  h.scroll(0); h.intersect(true); await h.settle(); assert.equal(h.compiles.length, 1);
  return { offscreenCompiles: 0, returnCompiles: 1 };
});

test('program preparation failure uses the existing finite renderer fallback', async () => {
  const h = harness(); await h.flush(); await h.frame();
  h.renderer().compile = () => { throw new Error('test program preparation failure'); };
  await h.release('tramtrace'); await h.frame(); await h.settle();
  assert.equal(h.snapshot().assemblyState, 'unavailable'); assert.equal(h.snapshot().assemblyModelsReady, '0');
  assert.equal(h.draws.length, 0); assert.equal(h.fences.length, 0); assert.equal(h.raf.size + h.timers.size, 0);
  assert.ok(h.posters.every(poster => poster.dataset.assemblyModelState === 'unavailable'));
  return { posterFallback: true, pendingWork: 0 };
});

test('one in-flight frame coalesces rapid input and protects late-model posters', async () => {
  const h = harness(); await h.flush(); await h.frame(); h.hold(); await h.release('tramtrace'); await h.frame();
  assert.equal(h.draws.length, 1); assert.equal(h.snapshot().assemblyGPUPending, 'true');
  await h.release('telemetry'); await h.release('pi');
  for (let i = 0; i < 36; i++) { h.scroll(i % 2 ? .88 : .565); await h.frame(); }
  assert.equal(h.draws.length, 1, '36 animation opportunities must not queue 36 obsolete GPU draws');
  assert.equal(h.raf.size, 0, 'Scroll does not spin RAF while GPU completion is pending');
  assert.deepEqual(h.loaderReady, [], 'No poster hands off before GPU completion');
  assert.equal(h.posters[1].style.getPropertyValue('--assembly-poster-opacity'), '1');
  h.scroll(.565); h.hold(false); await h.advance(4);
  assert.deepEqual(h.loaderReady, [0], 'An old frame cannot certify models installed while its fence was held');
  assert.notEqual(h.posters[1].dataset.assemblyModelState, 'ready');
  h.hold(); await h.frame();
  const submitted = h.snapshot().submission;
  assert.equal(submitted.raw, .565, 'The next draw reads the latest target, not the first queued input');
  assert.deepEqual(h.draws[1].names, ['tramtrace', 'telemetry', 'pi']);
  assert.equal(h.posters[1].style.getPropertyValue('--assembly-poster-opacity'), '1', 'Telemetry remains covered until its own draw completes');
  assert.equal(h.snapshot().assemblyCompletedFrames, '1');
  h.hold(false); await h.advance(4); await h.settle();
  assert.deepEqual(h.loaderReady, [0, 1], 'An offscreen model is not falsely certified as painted');
  h.scroll(.88); await h.settle();
  assert.deepEqual(h.loaderReady, [0, 1, 2]); assert.equal(h.snapshot().assemblyModelsReady, '3');
  assert.equal(h.snapshot().assemblySubmittedFrames, h.snapshot().assemblyCompletedFrames);
  assert.ok(h.fences.every(fence => fence.deleted === 1));
  return { heldAnimationOpportunities: 36, heldSubmissions: 1, nextTarget: submitted.raw, completedModels: 3 };
});

test('elapsed easing preserves .19 at 60Hz and catches up after slow GPU frames', async () => {
  const results = [];
  for (const schedule of [Array(12).fill(1000 / 60), Array(6).fill(1000 / 30), Array(24).fill(1000 / 120), [200], [7, 13, 45, 5, 30, 40, 60]]) {
    const h = await loaded(); h.scroll(.8); await h.frame();
    for (const dt of schedule) await h.frame(dt);
    const value = h.snapshot().submission.value, elapsed = schedule.reduce((sum, value) => sum + value, 0);
    near(value, .8 * (1 - Math.pow(.81, 1 + elapsed / (1000 / 60))), 'Equal elapsed time has equal smoothing after the fixed first step');
    results.push({ schedule, value });
  }
  const h = await loaded(); h.scroll(.8); await h.frame(); near(h.snapshot().submission.value, .8 * .19, 'Exact original 60Hz gain');
  h.hold(); await h.frame(); const before = h.snapshot().submission.value;
  await h.advance(200); h.hold(false); await h.advance(4); await h.frame();
  near(h.snapshot().submission.value, .8 - (.8 - before) * Math.pow(.81, (204 + 1000 / 60) / (1000 / 60)), 'GPU wait time is included without a capped easing tail');
  h.scroll(.1); await h.frame(); assert.ok(h.snapshot().submission.value < .8); await h.settle();
  assert.equal(h.snapshot().submission.value, .1, 'Reverse scroll reaches the exact target in finite time');
  return results;
});

for (const reason of ['offscreen', 'hidden', 'pagehide']) test(`${reason} cancels polling and resumes by draining before resize or draw`, async () => {
  const h = await loaded(); h.hold(); h.scroll(.4); await h.frame();
  const draws = h.draws.length, sizes = h.resizes.length;
  if (reason === 'offscreen') { h.boundary(-1); h.intersect(false); } else if (reason === 'hidden') h.hidden(true); else h.emit('pagehide');
  await h.flush(); assert.equal(h.snapshot().assemblyGPUCompletion, 'canceled');
  assert.equal(h.timers.size + h.raf.size, 0); assert.ok(h.fences.every(fence => fence.deleted === 1));
  h.stage.clientWidth = 1024; h.stage.clientHeight = 768; h.emit('resize'); if (reason !== 'offscreen') h.scroll(.7); await h.advance(300);
  assert.equal(h.draws.length, draws); assert.equal(h.resizes.length, sizes, 'Do not mutate the drawing buffer over an uncompleted frame');
  if (reason === 'offscreen') { h.scroll(.7); h.intersect(true); } else if (reason === 'hidden') h.hidden(false); else h.emit('pageshow');
  await h.frame(); assert.equal(h.snapshot().assemblyGPUPhase, 'drain'); assert.equal(h.draws.length, draws);
  await h.advance(100); assert.equal(h.draws.length, draws, 'A resumed controller cannot submit while old commands remain pending');
  h.hold(false); await h.advance(4); await h.settle();
  assert.equal(h.snapshot().submission.raw, .7); assert.equal(h.snapshot().submission.value, .7);
  assert.ok(h.resizes.some(size => size.width === 1024 && size.height === 768));
  assert.ok(h.fences.every(fence => fence.deleted === 1));
  return { interruption: reason, canceledFrames: Number(h.snapshot().assemblySubmittedFrames) - Number(h.snapshot().assemblyCompletedFrames), drainBeforeResize: true };
});

test('edge adjacency and a positive header-covered tail never submit a hero frame', async () => {
  const h = await loaded(), draws = h.draws.length, frames = h.snapshot().assemblyFrames;
  const evidence = [];
  for (const bottom of [0, 1, 38, 76]) {
    h.boundary(bottom);
    // Native IO is allowed to report true both at edge adjacency and while
    // the root's remaining pixels are completely covered by the header.
    h.intersect(true);
    for (let index = 0; index < 12; index++) { h.emit('scroll'); await h.frame(); }
    await h.advance(500);
    assert.equal(h.root.getBoundingClientRect().bottom, bottom);
    assert.equal(h.stage.getBoundingClientRect().bottom, bottom);
    assert.equal(h.draws.length, draws, `No draw with stage bottom ${bottom} and header bottom 76`);
    assert.equal(h.snapshot().assemblyFrames, frames, 'No offscreen pose/render loop');
    assert.equal(h.raf.size + h.timers.size, 0, 'Boundary exit leaves finite idle work');
    evidence.push({ stageBottom: bottom, headerBottom: h.header.clientHeight, addedDraws: 0 });
  }
  // A stale IO false must not suppress a truly visible sliver. This uses the
  // same sticky-stage geometry, rather than a test-only visibility override.
  h.boundary(h.header.clientHeight + 3); h.intersect(false); await h.settle();
  assert.ok(h.draws.length > draws, 'Three readable pixels resume real controller submissions');
  assert.equal(h.snapshot().submission.raw, 1); assert.equal(h.snapshot().submission.value, 1);
  assert.equal(h.snapshot().assemblyGPUCompletion, 'complete');
  assert.equal(h.snapshot().assemblySubmittedFrames, h.snapshot().assemblyCompletedFrames);
  return { boundaries: evidence, visibleReturnPixels: 3, completedReturn: true };
});

for (const bottom of [0, 38, 76]) test(`stage bottom ${bottom} cancels a pending frame and drains before a three-pixel return`, async () => {
  const h = await loaded(); h.hold(); h.scroll(.4); await h.frame();
  const draws = h.draws.length, sizes = h.resizes.length;
  h.boundary(bottom); h.intersect(true); await h.flush();
  assert.equal(h.snapshot().assemblyGPUCompletion, 'canceled');
  assert.equal(h.raf.size + h.timers.size, 0); assert.ok(h.fences.every(fence => fence.deleted === 1));
  h.stage.clientWidth = 1024; h.emit('resize'); await h.advance(500);
  assert.equal(h.draws.length, draws); assert.equal(h.resizes.length, sizes);
  h.boundary(h.header.clientHeight + 3); await h.frame();
  assert.equal(h.snapshot().assemblyGPUPhase, 'drain');
  await h.advance(200);
  assert.equal(h.draws.length, draws, 'Visible return cannot bypass the old GPU command drain');
  assert.equal(h.resizes.length, sizes, 'Buffer allocation is still behind the drain');
  h.hold(false); await h.advance(4); await h.settle();
  assert.ok(h.draws.length > draws); assert.equal(h.snapshot().assemblyGPUCompletion, 'complete');
  assert.equal(h.snapshot().submission.raw, 1); assert.equal(h.snapshot().submission.value, 1);
  assert.ok(h.resizes.some(size => size.width === 1024));
  assert.ok(h.fences.every(fence => fence.deleted === 1)); assert.equal(h.raf.size + h.timers.size, 0);
  return { stageBottom: bottom, canceled: true, returnPixels: 3, drainBeforeResizeAndDraw: true };
});

test('layout and the draw boundary recheck geometry without waiting for an IO callback', async () => {
  const h = await loaded(), draws = h.draws.length;
  h.scroll(.4); assert.equal(h.raf.size, 1);
  h.boundary(0, false); await h.frame();
  assert.equal(h.draws.length, draws, 'A scheduled draw reads the new physical rectangle before submission');
  h.hold(); h.scroll(.4); await h.frame(); const pendingDraws = h.draws.length;
  h.boundary(38, false); h.emit('resize'); await h.flush();
  assert.equal(h.snapshot().assemblyGPUCompletion, 'canceled', 'Layout discovers a header-covered stage');
  h.boundary(79); await h.frame(); assert.equal(h.snapshot().assemblyGPUPhase, 'drain');
  h.boundary(38, false); h.hold(false); await h.advance(4); await h.settle();
  assert.equal(h.draws.length, pendingDraws, 'Visibility is checked again after an asynchronous drain');
  assert.equal(h.raf.size + h.timers.size, 0);
  h.boundary(79); await h.settle(); assert.ok(h.draws.length > pendingDraws);
  return { checkedBeforeDraw: true, checkedOnLayout: true, checkedAfterDrain: true };
});

test('a settled hero remains idle and unchanged resize does not resubmit buffer allocation', async () => {
  const h = await loaded(), draws = h.draws.length, sizes = h.resizes.length;
  await h.advance(2000); assert.equal(h.draws.length, draws); assert.equal(h.raf.size, 0);
  h.emit('resize'); await h.frame(); await h.settle();
  assert.equal(h.resizes.length, sizes); assert.equal(h.raf.size + h.timers.size, 0);
  return { idleDraws: 0, unchangedSizeAllocations: 0 };
});

test('visible resize cannot hand off posters for the superseded drawing buffer', async () => {
  const h = harness(); await h.flush(); await h.frame(); h.hold();
  for (const name of ['tramtrace', 'telemetry', 'pi']) await h.release(name);
  await h.frame(); const allocations = h.resizes.length;
  assert.equal(h.snapshot().assemblyModelsInstalled, '3', 'CPU installation is distinct from completed GPU readiness');
  assert.equal(h.snapshot().assemblyModelsSettled, '3'); assert.deepEqual(h.loaderReady, []);
  h.stage.clientWidth = 1024; h.stage.clientHeight = 768; h.emit('resize'); await h.frame();
  assert.equal(h.draws.length, 1); assert.equal(h.resizes.length, allocations);
  h.hold(false); await h.advance(4); assert.deepEqual(h.loaderReady, [], 'Old-size GPU completion cannot retire fallback posters');
  h.hold(); await h.frame(); assert.equal(h.draws.length, 2);
  assert.ok(h.resizes.some(size => size.width === 1024 && size.height === 768));
  assert.ok(h.posters.every(poster => poster.style.getPropertyValue('--assembly-poster-opacity') === '1'));
  h.hold(false); await h.advance(4); await h.settle(); assert.deepEqual(h.loaderReady, [0, 1, 2]);
  return { installedBeforeReady: 3, staleSizeHandoffs: 0, completedSizeHandoffs: 3 };
});

test('switching to reduced motion cancels an in-flight frame and resumes through a drain', async () => {
  const h = await loaded(); h.hold(); h.scroll(.4); await h.frame(); const draws = h.draws.length;
  h.reduced.matches = true; h.reduced.dispatchEvent({ type: 'change' }); await h.flush();
  assert.equal(h.snapshot().assemblyGPUCompletion, 'canceled'); assert.equal(h.raf.size + h.timers.size, 0);
  assert.equal(h.root.classList.contains('is-static'), true);
  h.reduced.matches = false; h.reduced.dispatchEvent({ type: 'change' }); await h.frame();
  assert.equal(h.snapshot().assemblyGPUPhase, 'drain'); assert.equal(h.draws.length, draws);
  h.hold(false); await h.advance(4); await h.settle();
  assert.equal(h.root.classList.contains('is-enhanced'), true); assert.ok(h.draws.length > draws);
  return { staticPendingWork: 0, resumesAfterDrain: true };
});

test('GPU timeout rolls back live rendering to finite poster fallback', async () => {
  const h = await loaded(); h.hold(); h.scroll(.565); await h.frame(); const draws = h.draws.length;
  await h.advance(12004); await h.settle();
  assert.equal(h.snapshot().assemblyGPUCompletion, 'timeout'); assert.equal(h.snapshot().assemblyState, 'unavailable');
  assert.equal(h.root.classList.contains('is-loaded'), false); assert.equal(h.renderer().disposed, true);
  assert.equal(h.snapshot().assemblyModelsReady, '0'); assert.equal(h.draws.length, draws);
  assert.equal(h.posters[1].style.getPropertyValue('--assembly-poster-opacity'), '1');
  assert.ok(h.fences.every(fence => fence.deleted === 1)); assert.equal(h.raf.size + h.timers.size, 0);
  return { fallback: 'poster', disposed: true, pendingWork: 0 };
});

test('unsupported fence capability uses explicitly labelled finite compatibility mode', async () => {
  const h = await loaded({ unsupported: true });
  assert.equal(h.snapshot().assemblyGPUCompletion, 'unsupported'); assert.equal(h.snapshot().assemblyGPUCompletionEvidence, 'unsupported');
  assert.equal(h.snapshot().assemblyModelsReady, '3'); assert.equal(h.fences.length, 0);
  assert.equal(h.raf.size + h.timers.size, 0);
  return { evidence: 'unsupported', allocatedFences: 0 };
});

async function sourceTests() {
  const evidence = [];
  for (const { name, run } of tests) { const result = await run(); evidence.push({ name, result }); console.log('PASS ' + name); }
  return evidence;
}

// Browser instrumentation affects scheduling only, and is scoped to the hero
// canvas. The helper still allocates/deletes actual WebGLSync objects.
function browserProbe() {
  const control = window.__heroPacing = { hold: false, allowedThrough: 0, prepared: {}, released: {}, fences: [], samples: [], opportunities: 0 };
  const gates = {}, release = {};
  for (const name of ['tramtrace', 'telemetry', 'pi']) gates[name] = new Promise(resolve => { release[name] = resolve; });
  control.releaseModel = name => { control.released[name] = true; release[name](); };
  let assets;
  Object.defineProperty(window, 'V2HeroAssets', { configurable: true, get: () => assets, set(value) {
    assets = { ...value, async load(name) { const model = await value.load(name); control.prepared[name] = true; await gates[name]; return model; } };
  } });
  control.snapshot = () => {
    const root = document.querySelector('[data-assembly]');
    return { at: performance.now(), dataset: { ...root?.dataset }, scrollY, opportunities: control.opportunities,
      submission: root?.dataset.assemblyLastSubmission ? JSON.parse(root.dataset.assemblyLastSubmission) : null,
      canvas: root ? { width: root.querySelector('canvas').width, height: root.querySelector('canvas').height, opacity: getComputedStyle(root.querySelector('canvas')).opacity } : null,
      posters: [...document.querySelectorAll('[data-assembly-posters] img')].map(node => ({ state: node.dataset.assemblyModelState, declaredOpacity: node.style.getPropertyValue('--assembly-poster-opacity'), opacity: Number(getComputedStyle(node).opacity), visibility: getComputedStyle(node).visibility, decoded: node.complete && node.naturalWidth > 0 })),
      fences: control.fences.map(record => ({ ...record })), pending: control.fences.filter(record => record.deleted === undefined).length,
    };
  };
  const native = HTMLCanvasElement.prototype.getContext, seen = new WeakSet(), owned = new Map();
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = native.call(this, type, ...args);
    if (!gl || !this.matches('[data-assembly-canvas]') || seen.has(gl) || typeof gl.fenceSync !== 'function') return gl;
    seen.add(gl);
    const create = gl.fenceSync.bind(gl), poll = gl.clientWaitSync.bind(gl), remove = gl.deleteSync.bind(gl);
    gl.fenceSync = (...args) => {
      const sync = create(...args);
      if (sync) { const record = { id: control.fences.length + 1, created: performance.now(), phase: document.querySelector('[data-assembly]').dataset.assemblyGPUPhase, heldPolls: 0, maxTimeout: 0, outstandingAtCreate: control.fences.filter(item => item.deleted === undefined).length + 1 }; owned.set(sync, record); control.fences.push(record); }
      return sync;
    };
    gl.clientWaitSync = (sync, flags, timeout) => {
      const status = poll(sync, flags, timeout), record = owned.get(sync);
      if (record) { record.maxTimeout = Math.max(record.maxTimeout, timeout); record.nativeStatus = status; }
      if (control.hold && record && record.id > control.allowedThrough && status !== gl.WAIT_FAILED) { record.heldPolls++; return gl.TIMEOUT_EXPIRED; }
      return status;
    };
    gl.deleteSync = sync => { const record = owned.get(sync); if (record) { record.deleted = performance.now(); record.deleteCalls = (record.deleteCalls || 0) + 1; } return remove(sync); };
    return gl;
  };
  new MutationObserver(records => {
    if (control.samples.length < 1000 && records.some(record => record.target.matches?.('[data-assembly]'))) control.samples.push(control.snapshot());
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-assembly-submitted-frames', 'data-assembly-completed-frames', 'data-assembly-models-ready', 'data-assembly-g-p-u-completion'] });
}

async function browserTests() {
  const { chromium } = require('playwright');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await context.addInitScript(browserProbe);
  const page = await context.newPage(), errors = [], evidence = [];
  page.setDefaultTimeout(timeout); page.on('pageerror', error => errors.push(error.message));
  const snapshot = () => page.evaluate(() => window.__heroPacing.snapshot());
  const held = () => page.waitForFunction(() => window.__heroPacing.fences.some(fence => fence.deleted === undefined && fence.heldPolls > 0));
  const scroll = value => page.evaluate(value => {
    const root = document.querySelector('[data-assembly]'); scrollTo({ top: scrollY + root.getBoundingClientRect().top + value * (root.offsetHeight - root.querySelector('.v2-assembly-sticky').clientHeight), behavior: 'instant' });
  }, value);
  const completed = () => page.waitForFunction(() => {
    const data = document.querySelector('[data-assembly]').dataset;
    return data.assemblyModelsReady === '3' && data.assemblyGPUPending === 'false' && data.assemblyGPUCompletion === 'complete';
  });
  const settled = () => page.waitForFunction(() => {
    const data = document.querySelector('[data-assembly]').dataset, last = JSON.parse(data.assemblyLastSubmission || 'null');
    return data.assemblyGPUPending === 'false' && last && Math.abs(last.value - last.raw) < 1e-12;
  });
  try {
    await page.goto(base + '/v2/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => ['tramtrace', 'telemetry', 'pi'].every(name => window.__heroPacing.prepared[name]));
    await page.evaluate(() => { window.__heroPacing.hold = true; window.__heroPacing.releaseModel('tramtrace'); });
    await held(); const first = await snapshot();
    assert.equal(first.dataset.assemblySubmittedFrames, '1'); assert.equal(first.pending, 1);
    await page.evaluate(() => { window.__heroPacing.releaseModel('telemetry'); window.__heroPacing.releaseModel('pi'); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const late = await snapshot();
    assert.equal(late.dataset.assemblyModelsInstalled, '3', 'All genuine models are installed while the first draw remains pending');
    assert.notEqual(late.posters[1].state, 'ready'); assert.notEqual(late.posters[2].state, 'ready');
    assert.equal(late.posters[1].declaredOpacity, '1'); assert.equal(late.posters[2].declaredOpacity, '1');
    assert.ok(late.posters.slice(1).every(poster => poster.decoded && poster.opacity > .95 && poster.visibility === 'visible'), 'Genuine decoded supporting posters cover the held first draw');
    await page.screenshot({ path: path.join(output, 'late-models-before-own-draw.png'), animations: 'disabled' });
    await page.evaluate(() => { window.__heroPacing.allowedThrough = 1; });
    await page.waitForFunction(() => Number(document.querySelector('[data-assembly]').dataset.assemblySubmittedFrames) === 2 && window.__heroPacing.fences.some(fence => fence.id === 2 && fence.heldPolls > 0));
    const second = await snapshot();
    assert.equal(second.dataset.assemblyCompletedFrames, '1'); assert.equal(second.dataset.assemblyModelsReady, '1');
    assert.equal(second.posters[1].declaredOpacity, '1'); assert.equal(second.posters[2].declaredOpacity, '1');
    assert.ok(second.posters.slice(1).every(poster => poster.opacity > .95 && poster.visibility === 'visible'), 'Older draw completion must not expose a blank supporting model');
    await page.evaluate(async () => {
      const root = document.querySelector('[data-assembly]'), top = scrollY + root.getBoundingClientRect().top;
      for (let i = 0; i < 24; i++) {
        const value = i === 23 ? .565 : i % 2 ? .88 : .265;
        scrollTo({ top: top + value * (root.offsetHeight - root.querySelector('.v2-assembly-sticky').clientHeight), behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(resolve)); window.__heroPacing.opportunities++;
      }
    });
    const coalesced = await snapshot();
    assert.equal(coalesced.dataset.assemblySubmittedFrames, '2', '24 rapid native scrolls do not queue additional hero draws');
    assert.equal(coalesced.dataset.assemblyCompletedFrames, '1'); assert.equal(coalesced.pending, 1);
    await page.evaluate(() => { window.__heroPacing.allowedThrough = 2; });
    await page.waitForFunction(() => Number(document.querySelector('[data-assembly]').dataset.assemblySubmittedFrames) === 3 && window.__heroPacing.fences.some(fence => fence.id === 3 && fence.heldPolls > 0));
    const latest = await snapshot(); near(latest.submission.raw, .565, 'Next real draw targets final rapid scroll', .001);
    assert.equal(latest.dataset.assemblyModelsReady, '3');
    evidence.push({ name: 'one-in-flight-and-late-handoff', first, late, second, coalesced, latest, observations: '24 real animation opportunities with native scroll updates produced zero additional submissions while the prior real hero fence was held.' });
    await page.evaluate(() => { window.__heroPacing.hold = false; }); await completed();
    await settled();

    // Page lifecycle cancellation must delete the held sync. Resumption first
    // creates a new drain fence, with no render or drawing-buffer resize.
    await page.evaluate(() => { window.__heroPacing.hold = true; }); await scroll(.7); await held();
    const beforeHide = await snapshot(); await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => document.querySelector('[data-assembly]').dataset.assemblyGPUCompletion === 'canceled');
    await page.setViewportSize({ width: 1100, height: 780 });
    const canceled = await snapshot(); assert.equal(canceled.pending, 0);
    assert.equal(canceled.canvas.width, beforeHide.canvas.width); assert.equal(canceled.canvas.height, beforeHide.canvas.height);
    await page.evaluate(() => dispatchEvent(new Event('pageshow'))); await held();
    const draining = await snapshot(); assert.equal(draining.dataset.assemblyGPUPhase, 'drain');
    assert.equal(draining.dataset.assemblySubmittedFrames, beforeHide.dataset.assemblySubmittedFrames);
    assert.equal(draining.canvas.width, beforeHide.canvas.width); assert.equal(draining.canvas.height, beforeHide.canvas.height);
    await page.evaluate(() => { window.__heroPacing.hold = false; }); await completed();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-assembly]'), stage = root.querySelector('.v2-assembly-sticky'), canvas = root.querySelector('canvas');
      return canvas.width === stage.clientWidth && canvas.height === stage.clientHeight;
    });
    await scroll(.565); await page.waitForFunction(() => Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress) - .565) < .0002); await completed(); await settled();
    const settledState = await snapshot(); await page.waitForTimeout(650); const idle = await snapshot();
    assert.equal(idle.dataset.assemblySubmittedFrames, settledState.dataset.assemblySubmittedFrames, 'Settled hero has no idle draw loop');
    assert.equal(idle.pending, 0); assert.ok(idle.fences.every(fence => fence.deleteCalls === 1 && fence.outstandingAtCreate === 1 && fence.maxTimeout === 0));
    evidence.push({ name: 'pagehide-drain-resize-and-finite-idle', beforeHide, canceled, draining, settled: settledState, idle });
    await page.screenshot({ path: path.join(output, 'resumed-latest-telemetry.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    const report = { passed: true, evidence, scope: 'Real software-WebGL scheduling and rendered fallback coverage. Deliberate completion holds are not a real-device FPS or wall-time performance claim.' };
    fs.writeFileSync(path.join(output, 'hero-pacing.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS real hero GPU backpressure, late-model handoff, latest scroll, lifecycle drain, resize and idle');
    return report;
  } catch (error) {
    fs.writeFileSync(path.join(output, 'hero-pacing-failure.json'), JSON.stringify({ error: error.stack, errors, evidence, state: await snapshot().catch(() => null) }, null, 2) + '\n');
    await page.screenshot({ path: path.join(output, 'hero-pacing-failure.png'), animations: 'disabled', timeout: 30000 }).catch(() => {});
    throw error;
  } finally { await context.close(); await browser.close(); }
}

(async () => {
  if (!process.argv.includes('--browser-only')) console.log(JSON.stringify({ source: await sourceTests() }, null, 2));
  if (!process.argv.includes('--source-only')) await browserTests();
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Decorative hero source-only acceptance. Uses deterministic DOM/Three/GL
 * doubles to verify control absence, stable copy, natural scroll mapping,
 * finite work and genuine installed-snapshot foreground ownership.
 * This is a scheduling contract, not real-browser or visual validation.
 * Run: node scripts/verify-v2-decorative-hero.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'assets/v2-assembly.js'), 'utf8');
const gpuSource = fs.readFileSync(path.join(repo, 'assets/v2-gpu-preparation.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness({ unsupported = false } = {}) {
  let now = 100, sequence = 0, top = 0, held = false, lost = false;
  const raf = new Map(), timers = new Map(), draws = [], resizes = [], fences = [], warnings = [];
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
  stage.clientWidth = 1440; stage.clientHeight = 900; root.offsetHeight = 900; root.dataset.assemblyBackground='';
  header.clientHeight = 76;
  const rectangle = (top, width, height) => ({ top, bottom: top + height, left: 0, right: width, width, height });
  root.getBoundingClientRect = () => rectangle(top, stage.clientWidth, root.offsetHeight);
  // The decorative stage leaves in ordinary document flow. A positive tail
  // under the opaque fixed header still has no readable canvas pixels.
  stage.getBoundingClientRect = () => rectangle(top, stage.clientWidth, stage.clientHeight);
  canvas.getBoundingClientRect = stage.getBoundingClientRect;
  header.getBoundingClientRect = () => rectangle(0, stage.clientWidth, header.clientHeight);
  const nodes = new Map([['[data-assembly-canvas]', canvas], ['.v2-assembly-sticky', stage]]);
  root.querySelector = key => { if (['[data-assembly-caption]','[data-assembly-link]','[data-assembly-explore]','[data-assembly-choices]','[data-assembly-progress]','.v2-assembly-jump'].includes(key)) return null; if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  root.querySelectorAll = key => key === '[data-assembly-select]' ? [] : posters;
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
  const scroll = value => scrollPixels(value * stage.clientHeight);
  const boundary = (bottom, notify = true) => scrollPixels(root.offsetHeight - bottom, notify);
  const snapshot = () => ({ ...root.dataset, submission: root.dataset.assemblyLastSubmission ? JSON.parse(root.dataset.assemblyLastSubmission) : null });
  return { root, stage, header, posters, raf, timers, draws, resizes, fences, loaderReady, loaderFailed, warnings, reduced, document, gl, context,
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


(async()=>{
  const h=harness(); await h.flush(); await h.frame();
  const foreground=[];
  h.context.window.addEventListener('v2:hero-foreground',event=>foreground.push(event.detail));
  assert.equal(h.snapshot().assemblyReadableVisible,'true');
  assert.equal(h.snapshot().assemblyForegroundSettled,'false');
  h.hold(); await h.release('tramtrace'); await h.frame();
  await h.release('telemetry'); await h.release('pi');
  assert.equal(h.snapshot().assemblyModelsInstalled,'3');
  await h.advance(1500);
  assert.equal(h.snapshot().assemblyForegroundSettled,'false','CPU installation + long elapsed time never certifies a held initial frame');
  h.hold(false); await h.advance(4);
  assert.equal(h.snapshot().assemblyForegroundSettled,'false','Lead-only completed snapshot never certifies later installations');
  await h.settle();
  assert.equal(h.snapshot().assemblyForegroundSettled,'true');
  assert.equal(h.snapshot().assemblyModelsReady,'3');
  assert.deepEqual(JSON.parse(h.snapshot().assemblyCompletedSnapshot).models,[true,true,true]);
  assert.equal(h.root.querySelector('[data-assembly-intro]').style.opacity,undefined);
  assert.notEqual(h.root.querySelector('[data-assembly-intro]').inert,true);
  h.scroll(.4); assert.equal(h.snapshot().assemblyForegroundSettled,'false'); await h.settle();
  assert.equal(h.snapshot().assemblyProgress,'0.40000');
  assert.equal(h.snapshot().assemblyForegroundSettled,'true');
  assert.equal(h.snapshot().assemblyActive,'overview');
  assert.equal(h.root.querySelector('[data-assembly-intro]').style.opacity,undefined);
  assert.notEqual(h.root.querySelector('[data-assembly-intro]').inert,true);
  const frames=h.draws.length; await h.advance(5000); assert.equal(h.draws.length,frames);
  h.hold();h.scroll(.45);await h.frame();h.boundary(76);await h.flush();
  assert.equal(h.snapshot().assemblyReadableVisible,'false');
  assert.equal(h.raf.size+h.timers.size,0);
  assert.equal(foreground.at(-1).visible,false);
  h.scroll(.3);await h.frame();assert.equal(h.snapshot().assemblyGPUPhase,'drain');
  h.hold(false);await h.advance(4);await h.settle();
  assert.equal(h.snapshot().assemblyForegroundSettled,'true');
  h.reduced.matches=true;h.reduced.dispatchEvent({type:'change'});await h.flush();
  assert.equal(h.snapshot().assemblyForegroundSettled,'true');
  assert.equal(h.raf.size+h.timers.size,0);
  assert.equal(h.warnings.length,0);
  const unsupported=await loaded({unsupported:true});
  assert.equal(unsupported.snapshot().assemblyForegroundSettled,'false','Unsupported compatibility frame is never presented as own-context completed evidence');
  unsupported.boundary(76);
  assert.equal(unsupported.snapshot().assemblyReadableVisible,'false');
  console.log('PASS decorative hero: absent controls, stable intro, natural scroll, exact all-model fence, finite idle, readable exit event, drain/reentry, reduced motion, unsupported compatibility');
})().catch(error=>{console.error(error);process.exitCode=1;});

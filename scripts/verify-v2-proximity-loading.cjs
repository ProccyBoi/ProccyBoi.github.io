/* Run with Node. These scheduling scenarios execute production gates with
 * controlled viewport/dependency changes; they do not measure browser speed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const between = (source, from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Production boundary: ${from}`);
  return source.slice(start, end);
};

function hero({ direct = false, top = 0, hidden = false, compact = false, includeBackdrop = false, saveData = false, failPhoto = false, narrow = false } = {}) {
  const events = new Map(), requests = [], binaries = [], models = [], environment = [];
  const state = { top, hidden, fragmentRestores: 0, ready: false, backdropTop: top, saveData, idle: [], photos: [], appended: [] };
  const root = { contains: () => false, getBoundingClientRect: () => ({ top: state.top, bottom: state.top + 2000 }) };
  const on = (name, callback) => { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); };
  const compactMedia = { matches: compact, addEventListener: on };
  const backdrop = includeBackdrop ? {
    dataset: { assemblyBackdrop: 'workbench.webp' }, getBoundingClientRect: () => ({ top: state.backdropTop, bottom: state.backdropTop + 900 }),
    append: photo => state.appended.push(photo),
  } : null;
  const window = { requestIdleCallback: fn => state.idle.push(fn),
    V2HeroAssets: { prefetch: async name => models.push(name) }, V2HeroEnvironment: { prefetch: async () => environment.push(true) } };
  const context = {
    window, location: { hash: direct ? '#overview' : '' }, innerHeight: 900,
    fetch: url => { binaries.push(url); return new Promise(() => {}); },
    navigator: { connection: { get saveData() { return state.saveData; } } },
    Image: function (width, height) {
      this.naturalWidth = width; this.naturalHeight = height;
      Object.defineProperty(this, 'src', { set: src => state.photos.push({ src, priority: this.fetchPriority, decoding: this.decoding }) });
      this.decode = async () => { if (failPhoto) throw new Error('Failed image'); };
    },
    matchMedia: query => query.includes('max-height') ? compactMedia : { matches: query.includes('600px') && narrow }, addEventListener: on,
    requestAnimationFrame: callback => callback(),
    document: { get hidden() { return state.hidden; }, get readyState() { return state.ready ? 'complete' : 'interactive'; },
      querySelector: selector => selector === '[data-assembly-backdrop]' ? backdrop : root, getElementById: () => ({ scrollIntoView(options) {
        assert.equal(options.behavior, 'instant'); state.fragmentRestores++; state.top = -1900; state.backdropTop = -800;
      } }), addEventListener: on,
      createElement: () => ({}), head: { append: script => requests.push(script) } },
  };
  vm.runInNewContext(read('assets/v2-hero-startup.js'), context);
  return { state, window, requests, binaries, models, environment, compactMedia,
    event: name => { for (const callback of events.get(name) || []) callback(); },
    loaded: async () => { requests.forEach(script => script.onload()); await flush(); } };
}

const aircraftSource = read('assets/v3-aircraft-hero.js');
const sourceEligibility = aircraftSource.match(/^  const sourceEligible = .+$/m)?.[0];
assert.ok(sourceEligibility, 'Production aircraft eligibility gate exists');
const aircraftFunctions = between(aircraftSource, '  function prepareAirframe(', '  async function initialize(')
  + between(aircraftSource, '  let fallbackImagesStarted', '  const idleTurn');
function aircraft({ eligible = false, background = true, near = eligible, dependencies, heroStarted = false, heroPresent = true } = {}) {
  const state = { eligible, hidden: false, near, scripts: [], transport: [], telemetry: [], heroRequests: [], images: 0, decoded: 0, environment: 0 };
  const image = () => ({ dataset: { approach: 'approach.webp', stopped: 'stopped.webp' }, decode: async () => state.decoded++ });
  const window = { V2HeroStartup: { models: ['tramtrace', 'dash', 'pi'], hasStarted: () => heroStarted },
    V2HeroAssets: { whenTransferSettled: async name => state.heroRequests.push(name), prefetch: async name => state.telemetry.push(name) } };
  const context = vm.createContext({
    window, background, detailed: true, failed: false, activePage: true,
    preparationEligible: () => state.eligible, allowed: () => true, nearStory: () => state.near,
    document: { get hidden() { return state.hidden; }, querySelector: () => heroPresent ? {} : null }, matchMedia: () => ({ matches: true }),
    root: { dataset: {}, querySelectorAll: () => [image()] }, posterSources: [], poster: image(),
    showPoster: () => {}, Image: function () { state.images++; return image(); },
    setTimeout: () => 1, clearTimeout: () => {},
    script: async url => {
      state.scripts.push(url); if (dependencies) await dependencies.promise;
      if (url.includes('three.min')) window.THREE = {};
      if (url.includes('GLTFLoader')) window.THREE.GLTFLoader = {};
      if (url.includes('aircraft-scene')) window.V3AircraftScene = { prefetch: async () => state.transport.push('airframe') };
      if (url.includes('meshopt_decoder')) window.MeshoptDecoder = {};
      if (url.includes('hero-environment')) window.V2HeroEnvironment = { prefetch: async () => state.environment++ };
    },
  });
  vm.runInContext(`let airframeTransport, transportGate, releaseTransport, sourcePreparation;
    ${sourceEligibility}
    ${aircraftFunctions}
    globalThis.prepare = prepareSources; globalThis.transport = prepareAirframe;`, context);
  return { state, context };
}

(async () => {
  const homepage = read('v2/index.html');
  assert.doesNotMatch(homepage, /v2-hero-loading\.(?:js|css)/, 'Normal homepage uses posters, without the decorative loading canvas');
  const backdropTag = homepage.match(/<div[^>]+data-assembly-backdrop[^>]+>/)?.[0];
  assert.ok(backdropTag?.includes('aria-hidden="true"') && !/\ssrc=/.test(backdropTag), 'The backdrop is decorative and has no parser-started transfer');
  assert.ok(!/<link[^>]+hero-workbench.webp/.test(homepage), 'No workbench preload');
  const crop = homepage.match(/data:image\/webp;base64,([a-zA-Z0-9+/=]+).+154px 103px/)?.[1];
  assert.ok(crop && crop.length <= 1500, 'Narrow layout keeps the final real texture in less than 1.5 KB inline');
  assert.equal(Buffer.from(crop, 'base64').subarray(8, 12).toString(), 'WEBP', 'The embedded crop is a WebP');
  assert.ok(fs.statSync(path.join(repo, 'assets/images/v2/hero-workbench.webp')).size <= 24000, 'Optional photo stays under 24 KB');
  const startupTag = homepage.match(/<script\b[^>]*v2-hero-startup\.js[^>]*>/)?.[0];
  assert.ok(startupTag && /\bdefer\b/.test(startupTag) && !/\basync\b/.test(startupTag), 'Startup gate precedes assembly without an async race');
  assert.ok(homepage.indexOf(startupTag) < homepage.indexOf('<script src="/assets/v2-assembly.js'), 'Eligibility is installed before assembly controller');
  const heroBudget = ['tramtrace.idx.bin.gz', 'dash.idx.bin.gz', 'pi.idx.bin.gz', 'environment.bin.gz']
    .reduce((total, file) => total + fs.statSync(path.join(repo, 'assets/models/hero', file)).size, 0);
  assert.ok(heroBudget <= 2200000, `Hero geometry + environment exceeds the 2.2 MB explicit gzip budget: ${heroBudget}`);
  let h = hero();
  assert.equal(h.requests.length, 4, 'Visible hero starts its four shared helpers');
  assert.equal(h.binaries.length, 4, 'Visible hero starts exact full-detail transfers before helpers finish');
  await h.loaded();
  assert.deepEqual(h.models, ['tramtrace', 'dash', 'pi'], 'Hero loads full Dash and never telemetry');
  h.event('scroll'); assert.equal(h.requests.length, 4, 'Revisiting does not duplicate helpers');

  h = hero({ direct: true });
  let released = false; h.window.V2HeroStartup.whenEligible().then(() => { released = true; });
  assert.equal(h.requests.length, 0, 'Direct overview link does not load pre-scroll hero');
  assert.equal(h.binaries.length, 0, 'Direct overview link has no speculative CAD transfers');
  h.event('load'); await flush();
  assert.equal(h.state.fragmentRestores, 1, 'Fresh navigation restores its destination before opening the loading gate');
  assert.equal(h.state.top, -1900);
  assert.equal(h.requests.length, 0); assert.equal(released, false);
  h.state.top = -1800; h.event('scroll'); await flush();
  assert.equal(h.requests.length, 0, 'A thin hero tail beneath the header does not wake CAD');
  assert.equal(h.binaries.length, 0, 'A thin hero tail cannot bypass the early-transfer gate');
  h.state.top = -1700; h.event('scroll'); await flush();
  assert.equal(released, true, 'Returning to an appreciable hero viewport releases assembly controller');
  assert.equal(h.requests.length, 4);

  h = hero(); h.state.top = -3000; await h.loaded();
  assert.equal(h.models.length, 0, 'Leaving while helpers load does not start CAD decode');
  assert.equal(h.binaries.length, 4, 'Only previously eligible transfers remain in flight after leaving');
  assert.equal(h.environment.length, 0, 'Leaving while helpers load does not inflate environment');
  h = hero({ hidden: true }); assert.equal(h.requests.length, 0);
  h.state.hidden = false; h.event('visibilitychange'); assert.equal(h.requests.length, 4);
  h = hero({ compact: true }); assert.equal(h.requests.length, 0); assert.equal(h.window.V2HeroStartup.hasStarted(), false);
  h.compactMedia.matches = false; h.event('change'); assert.equal(h.requests.length, 4, 'Resizing out of compact mode enables the nearby hero');

  h = hero({ includeBackdrop: true });
  assert.equal(h.state.idle.length, 0, 'Backdrop cannot compete with initial posters');
  h.state.ready = true; h.event('load');
  assert.equal(h.state.photos.length, 0, 'Window load schedules the backdrop without fetching it synchronously');
  h.state.backdropTop = -800; h.state.idle.shift()();
  assert.equal(h.state.photos.length, 0, 'An idle callback rechecks visibility after fast navigation');
  h.state.backdropTop = 0; h.event('scroll'); h.event('resize');
  assert.equal(h.state.idle.length, 1, 'The optional photo only schedules once per eligible window');
  h.state.idle.shift()(); await flush();
  assert.deepEqual(h.state.photos, [{ src: 'workbench.webp', priority: 'low', decoding: 'async' }]);
  assert.equal(h.state.appended.length, 1, 'Successful decode replaces the painted surface without a layout gate');
  h.event('scroll');
  assert.equal(h.state.idle.length, 0, 'Returning never refetches the loaded photo');

  h = hero({ includeBackdrop: true, direct: true });
  h.state.ready = true; h.event('load');
  assert.equal(h.state.idle.length, 0, 'Direct links never load an offscreen backdrop');
  h = hero({ includeBackdrop: true, saveData: true });
  h.state.ready = true; h.event('load');
  assert.equal(h.state.idle.length, 0, 'Save Data skips optional surface texture');
  h = hero({ includeBackdrop: true, narrow: true });
  h.state.ready = true; h.event('load');
  assert.equal(h.state.idle.length, 0, 'Narrow screens never upgrade the complete inline surface');
  h = hero({ includeBackdrop: true, failPhoto: true });
  h.state.ready = true; h.event('load'); h.state.idle.shift()(); await flush();
  assert.equal(h.state.appended.length, 0, 'Failed photo preserves painted fallback');

  let a = aircraft(); await a.context.prepare(); await a.context.transport();
  assert.equal(a.state.scripts.length, 0, 'Far aircraft loads no helper scripts');
  assert.equal(a.state.transport.length, 0, 'Far aircraft loads no geometry');
  assert.equal(a.state.images, 0, 'Far aircraft requests no alternate posters');
  assert.equal(a.state.decoded, 0, 'Far aircraft performs no image decode');
  a.state.eligible = true; a.state.near = true; await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe']);
  assert.deepEqual(a.state.telemetry, ['telemetry'], 'Detailed telemetry starts with source preparation, before the flight scene exists');
  a = aircraft({ eligible: true, near: false, heroPresent: false, heroStarted: true }); await a.context.prepare(); await flush();
  assert.equal(a.state.heroRequests.length, 0, 'Projects aircraft never asks for absent homepage hero models');
  assert.deepEqual(a.state.transport, ['airframe']);
  assert.equal(a.state.images, 2); assert.equal(a.state.decoded, 3);
  assert.equal(a.state.heroRequests.length, 0, 'Aircraft direct visit does not wake unrelated hero models');
  await a.context.prepare(); await flush();
  assert.equal(a.state.transport.length, 1); assert.equal(a.state.images, 2, 'Warm requests are deduplicated');

  const gate = deferred(); a = aircraft({ eligible: true, dependencies: gate });
  const pending = a.context.prepare(); a.state.eligible = false; gate.resolve(); await pending; await flush();
  assert.equal(a.state.transport.length, 0, 'Leaving during helper transport prevents airframe download');
  assert.equal(a.state.environment, 0);
  assert.equal(a.state.scripts.some(url => /GLTFLoader/.test(url)), false, 'No second-wave renderer dependencies after leaving');
  assert.ok(a.state.scripts.some(url => /meshopt_decoder/.test(url)), 'The independent decoder begins in the initial eligible helper wave');
  a.state.eligible = true; a.state.near = true; await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe'], 'Return resumes incomplete source preparation');

  a = aircraft({ eligible: true }); a.state.hidden = true; await a.context.prepare();
  assert.equal(a.state.scripts.length, 0, 'Hidden tab defers aircraft work');
  a = aircraft({ eligible: false, background: false }); await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe'], 'v3 top-fold aircraft still prepares immediately');
  assert.equal(a.state.telemetry.length, 0, 'v3 retains its existing telemetry scheduling');
  a = aircraft({ eligible: true, near: false }); await a.context.prepare(); await flush();
  assert.equal(a.state.heroRequests.length, 0, 'Explicit aircraft intent skips a hero that never started');
  assert.deepEqual(a.state.transport, ['airframe']);

  const selected = read('assets/v2-selected-work.js');
  const imageFunction = between(selected, '  let imagesStarted', '\n  let settleBackground');
  let eligible = false, decodes = 0;
  const images = [{ dataset: {}, naturalWidth: 100, decode: async () => decodes++ }];
  const imageContext = vm.createContext({ images, document: { hidden: false }, activePage: true,
    preparationEligible: () => eligible, root: { dataset: {} } });
  vm.runInContext(`${imageFunction};globalThis.warm=warmImages;`, imageContext);
  imageContext.warm(); assert.equal(decodes, 0, 'Far Framework leaves native lazy image loading alone');
  eligible = true; imageContext.warm(); await flush(); imageContext.warm();
  assert.equal(decodes, 1, 'Near Framework decodes each poster once');
  console.log(`PASS: no decorative loading assets; hero gzip budget ${heroBudget}/2200000 B; fragment navigation, return, dependency exit, hidden tab; inline phone surface, optional low-priority desktop texture and fallbacks; aircraft no offscreen requests, near start, exit/return, intent, v3 startup; Framework image proximity. Source scheduling only.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

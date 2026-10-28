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

function hero({ direct = false, top = 0, hidden = false, compact = false } = {}) {
  const events = new Map(), requests = [], models = [], environment = [];
  const state = { top, hidden, fragmentRestores: 0 };
  const root = { contains: () => false, getBoundingClientRect: () => ({ top: state.top, bottom: state.top + 2000 }) };
  const on = (name, callback) => { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); };
  const compactMedia = { matches: compact, addEventListener: on };
  const window = { V2HeroAssets: { prefetch: async name => models.push(name) }, V2HeroEnvironment: { prefetch: async () => environment.push(true) } };
  const context = {
    window, location: { hash: direct ? '#overview' : '' }, innerHeight: 900,
    navigator: {}, matchMedia: query => query.includes('max-height') ? compactMedia : { matches: false }, addEventListener: on,
    requestAnimationFrame: callback => callback(),
    document: { get hidden() { return state.hidden; }, readyState: 'interactive',
      querySelector: () => root, getElementById: () => ({ scrollIntoView(options) {
        assert.equal(options.behavior, 'instant'); state.fragmentRestores++; state.top = -1900;
      } }), addEventListener: on,
      createElement: () => ({}), head: { append: script => requests.push(script) } },
  };
  vm.runInNewContext(read('assets/v2-hero-startup.js'), context);
  return { state, window, requests, models, environment, compactMedia,
    event: name => { for (const callback of events.get(name) || []) callback(); },
    loaded: async () => { requests.forEach(script => script.onload()); await flush(); } };
}

const aircraftSource = read('assets/v3-aircraft-hero.js');
const sourceEligibility = aircraftSource.match(/^  const sourceEligible = .+$/m)?.[0];
assert.ok(sourceEligibility, 'Production aircraft eligibility gate exists');
const aircraftFunctions = between(aircraftSource, '  function prepareAirframe(', '  async function initialize(')
  + between(aircraftSource, '  let fallbackImagesStarted', '  const idleTurn');
function aircraft({ eligible = false, background = true, near = eligible, dependencies, heroStarted = false, heroPresent = true } = {}) {
  const state = { eligible, hidden: false, near, scripts: [], transport: [], heroRequests: [], images: 0, decoded: 0, environment: 0 };
  const image = () => ({ dataset: { approach: 'approach.webp', stopped: 'stopped.webp' }, decode: async () => state.decoded++ });
  const window = { V2HeroStartup: { models: ['tramtrace', 'dash', 'pi'], hasStarted: () => heroStarted },
    V2HeroAssets: { whenTransferSettled: async name => state.heroRequests.push(name) } };
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
  const startupTag = homepage.match(/<script\b[^>]*v2-hero-startup\.js[^>]*>/)?.[0];
  assert.ok(startupTag && /\bdefer\b/.test(startupTag) && !/\basync\b/.test(startupTag), 'Startup gate precedes assembly without an async race');
  assert.ok(homepage.indexOf(startupTag) < homepage.indexOf('<script src="/assets/v2-assembly.js'), 'Eligibility is installed before assembly controller');
  const heroBudget = ['tramtrace.idx.bin.gz', 'dash.idx.bin.gz', 'pi.idx.bin.gz', 'environment.bin.gz']
    .reduce((total, file) => total + fs.statSync(path.join(repo, 'assets/models/hero', file)).size, 0);
  assert.ok(heroBudget <= 2200000, `Hero geometry + environment exceeds the 2.2 MB explicit gzip budget: ${heroBudget}`);
  let h = hero();
  assert.equal(h.requests.length, 4, 'Visible hero starts its four shared helpers');
  await h.loaded();
  assert.deepEqual(h.models, ['tramtrace', 'dash', 'pi'], 'Hero loads full Dash and never telemetry');
  h.event('scroll'); assert.equal(h.requests.length, 4, 'Revisiting does not duplicate helpers');

  h = hero({ direct: true });
  let released = false; h.window.V2HeroStartup.whenEligible().then(() => { released = true; });
  assert.equal(h.requests.length, 0, 'Direct overview link does not load pre-scroll hero');
  h.event('load'); await flush();
  assert.equal(h.state.fragmentRestores, 1, 'Fresh navigation restores its destination before opening the loading gate');
  assert.equal(h.state.top, -1900);
  assert.equal(h.requests.length, 0); assert.equal(released, false);
  h.state.top = -1800; h.event('scroll'); await flush();
  assert.equal(h.requests.length, 0, 'A thin hero tail beneath the header does not wake CAD');
  h.state.top = -1700; h.event('scroll'); await flush();
  assert.equal(released, true, 'Returning to an appreciable hero viewport releases assembly controller');
  assert.equal(h.requests.length, 4);

  h = hero(); h.state.top = -3000; await h.loaded();
  assert.equal(h.models.length, 0, 'Leaving while helpers load does not start CAD transfer');
  assert.equal(h.environment.length, 0, 'Leaving while helpers load does not inflate environment');
  h = hero({ hidden: true }); assert.equal(h.requests.length, 0);
  h.state.hidden = false; h.event('visibilitychange'); assert.equal(h.requests.length, 4);
  h = hero({ compact: true }); assert.equal(h.requests.length, 0); assert.equal(h.window.V2HeroStartup.hasStarted(), false);
  h.compactMedia.matches = false; h.event('change'); assert.equal(h.requests.length, 4, 'Resizing out of compact mode enables the nearby hero');

  let a = aircraft(); await a.context.prepare(); await a.context.transport();
  assert.equal(a.state.scripts.length, 0, 'Far aircraft loads no helper scripts');
  assert.equal(a.state.transport.length, 0, 'Far aircraft loads no geometry');
  assert.equal(a.state.images, 0, 'Far aircraft requests no alternate posters');
  assert.equal(a.state.decoded, 0, 'Far aircraft performs no image decode');
  a.state.eligible = true; a.state.near = true; await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe']);
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
  assert.equal(a.state.scripts.some(url => /GLTFLoader|meshopt_decoder/.test(url)), false, 'No second-wave dependencies after leaving');
  a.state.eligible = true; a.state.near = true; await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe'], 'Return resumes incomplete source preparation');

  a = aircraft({ eligible: true }); a.state.hidden = true; await a.context.prepare();
  assert.equal(a.state.scripts.length, 0, 'Hidden tab defers aircraft work');
  a = aircraft({ eligible: false, background: false }); await a.context.prepare(); await flush();
  assert.deepEqual(a.state.transport, ['airframe'], 'v3 top-fold aircraft still prepares immediately');
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
  console.log(`PASS: no decorative loading assets; hero gzip budget ${heroBudget}/2200000 B; fragment navigation, return, dependency exit, hidden tab; aircraft no offscreen requests, near start, exit/return, intent, v3 startup; Framework image proximity. Source scheduling only.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

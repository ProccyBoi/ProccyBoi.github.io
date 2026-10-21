#!/usr/bin/env node
// Deterministic entry lifecycle regression using the real loader. Only dynamic
// import and browser interfaces are controlled; this is not GPU/browser evidence.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sourcePath = path.join(__dirname, '../../v3/assets/v3-aircraft-hero.js');
const actualImport = "import('./webgpu/aircraft-controller.js?v=20261019')";
const original = fs.readFileSync(sourcePath, 'utf8');
assert.ok(original.includes(actualImport));
const source = original.replace(actualImport, '__loadModule()');
const flush = () => new Promise(setImmediate);
async function test(preference, interruptedAt) {
  let bounds = { top: 5000, bottom: 6000 };
  let resolveModule, resolveDevice, mountCalls = 0, destroyedDevices = 0;
  const media = new Map();
  for (const query of ['(prefers-reduced-motion: reduce)', '(max-height:600px)']) {
    media.set(query, { matches: false, callbacks: [], addEventListener(type, callback) { this.callbacks.push(callback); } });
  }
  const connection = { saveData: false, callbacks: [], addEventListener(type, callback) { this.callbacks.push(callback); } };
  const root = { dataset: {}, getBoundingClientRect: () => bounds };
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const device = { destroy() { destroyedDevices++; } };
  const adapter = { info: {}, features: [], requestDevice: () => interruptedAt === 'device' ? new Promise(resolve => { resolveDevice = resolve; }) : Promise.resolve(device) };
  const window = { IntersectionObserver: Observer };
  const context = {
    window, document: { querySelector: () => root }, location: { search: '?renderer=webgpu', hash: '' },
    matchMedia: query => media.get(query), URLSearchParams, innerHeight: 900, isSecureContext: true,
    navigator: { connection, gpu: { requestAdapter: async () => adapter } },
    IntersectionObserver: Observer, addEventListener() {},
    __loadModule: () => new Promise(resolve => { resolveModule = resolve; }),
  };
  vm.runInNewContext(source, context);
  const setPreference = value => {
    const selected = preference === 'saveData' ? connection : media.get(preference);
    selected[preference === 'saveData' ? 'saveData' : 'matches'] = value;
    selected.callbacks.forEach(callback => callback());
  };
  const module = { mount() { mountCalls++; } };
  assert.equal(observers.filter(observer => observer.active).length, 1);
  bounds = { top: 1000, bottom: 2000 };
  observers[0].callback([{ isIntersecting: true }]);
  await flush();
  assert.equal(window.V3WebGPU.state, 'loading-module');
  if (interruptedAt === 'device') { resolveModule(module); await flush(); }
  setPreference(true);
  if (interruptedAt === 'device') resolveDevice(device);
  else resolveModule(module);
  await flush();
  assert.equal(mountCalls, 0, 'Disallowing preferences before startup completes must prevent mount');
  assert.equal(window.V3WebGPU.state, 'static-preferences');
  assert.equal(destroyedDevices, interruptedAt === 'device' ? 1 : 0, 'Cancelled acquired devices must be released');
  bounds = { top: 5000, bottom: 6000 };
  setPreference(false);
  assert.equal(observers.filter(observer => observer.active).length, 1, 'Reenable away from section must rearm proximity observer');
  bounds = { top: 100, bottom: 1100 };
  for (const observer of observers.filter(observer => observer.active)) observer.callback([{ isIntersecting: true }]);
  await flush();
  resolveModule(module);
  await flush();
  if (interruptedAt === 'device') { resolveDevice(device); await flush(); }
  assert.equal(mountCalls, 1, 'Revisiting section after interrupted startup must mount exactly once');
  assert.equal(observers.filter(observer => observer.active).length, 0, 'Mounted startup releases proximity observation');
  console.log(`PASS interrupted ${interruptedAt}, restore away, proximity restart: ${preference}`);
}
async function softwareSelection(requested, info, expectedFallback, isFallbackAdapter = false) {
  let mounted = 0, devices = 0, imports = 0, scripts = 0;
  const root = { dataset: {}, classList: { remove() {} }, getBoundingClientRect: () => ({ top: 0, bottom: 900 }), querySelector: () => ({ cloneNode: () => ({ style: {} }), replaceWith() {} }) };
  const window = {};
  const adapter = { info, isFallbackAdapter, features: [], requestDevice: async () => { devices++; return { destroy() {} }; } };
  const context = { window, document: { querySelector: () => root, createElement: () => ({}), head: { append: () => { scripts++; } } },
    location: { search: requested ? `?renderer=${requested}` : '', hash: '#skylabs-aircraft' },
    matchMedia: () => ({ matches: false, addEventListener() {} }), URLSearchParams, innerHeight: 900, isSecureContext: true,
    navigator: { connection: { addEventListener() {} }, gpu: { requestAdapter: async () => adapter } },
    MutationObserver: class { observe() {} }, addEventListener() {}, __loadModule: async () => { imports++; return { mount() { mounted++; } }; } };
  vm.runInNewContext(source, context); await flush();
  assert.equal(scripts, expectedFallback ? 1 : 0);
  assert.equal(imports, expectedFallback ? 0 : 1, 'Default aircraft selection must avoid modern renderer download');
  assert.equal(devices, expectedFallback ? 0 : 1, 'Default aircraft selection must avoid device allocation');
  assert.equal(mounted, expectedFallback ? 0 : 1);
  console.log(`PASS adapter selection: ${requested || 'auto'} / ${JSON.stringify(info)} / fallback=${isFallbackAdapter}`);
}
async function mountedPreference(preference) {
  let bounds = {top:100, bottom:1000};
  let mounted = 0, imports = 0, deviceRequests = 0, adapterRequests = 0, destroyed = 0;
  let controllerPoll;
  const calls = [], mediaQueries = ['(prefers-reduced-motion: reduce)', '(max-height:600px)'];
  const values = new Map(mediaQueries.map(query => [query, false]));
  const media = [];
  // Blink's matches() updates an individual query's last match. Reading a
  // subscribed query before MediaFeaturesChanged can consume its transition.
  // This is a deterministic model of that ordering, not native-browser proof.
  const matchMedia = query => {
    const item = {query, previous:values.get(query), callbacks:[],
      get matches() {this.previous = values.get(query); return this.previous;},
      addEventListener(type, callback) {assert.equal(type, 'change'); this.callbacks.push(callback);}};
    media.push(item); return item;
  };
  const connection = {saveData:false, callbacks:[], addEventListener(type, callback) {assert.equal(type, 'change'); this.callbacks.push(callback);}};
  const root = {dataset:{}, getBoundingClientRect:() => bounds};
  const window = {};
  const device = {destroy() {destroyed++;}};
  const adapter = {info:{vendor:'test-hardware'}, features:[], requestDevice:async () => {deviceRequests++; return device;}};
  const module = {mount(options) {
    mounted++;
    // Support the old shared-query mount in this double so the regression
    // fails specifically when polling consumes its only change notification.
    const reduced = options.preferences?.reduced || matchMedia(mediaQueries[0]);
    const short = options.preferences?.short || matchMedia(mediaQueries[1]);
    controllerPoll = () => !reduced.matches && !short.matches && !connection.saveData;
    options.diagnostic.ready = true; options.diagnostic.state = 'ready'; options.diagnostic.backend = 'webgpu';
    return {updatePreferences() {
      const enabled = controllerPoll(); calls.push(enabled);
      root.dataset.aircraftState = enabled ? 'waiting-for-current-frame' : 'static';
      if (!enabled) options.diagnostic.ready = false;
      else {
        // Model a completed current frame only after the controller received
        // the notification. The production renderer must provide real proof.
        options.diagnostic.ready = true; options.diagnostic.state = 'ready'; options.diagnostic.backend = 'webgpu';
      }
    }};
  }};
  const context = {window, document:{querySelector:() => root}, location:{search:'?renderer=webgpu', hash:'#skylabs-aircraft'},
    matchMedia, URLSearchParams, innerHeight:900, isSecureContext:true,
    navigator:{connection, gpu:{requestAdapter:async () => {adapterRequests++; return adapter;}}},
    addEventListener() {}, __loadModule:async () => {imports++; return module;}};
  vm.runInNewContext(source, context); await flush();
  assert.equal(mounted, 1, 'Initial authorized startup mounts once');
  const setPreference = value => {
    if (preference === 'saveData') connection.saveData = value;
    else values.set(preference, value);
    // A GPU completion/input/layout guard sees the new value before native
    // media-feature change delivery. It must not consume the loader's event.
    assert.equal(controllerPoll(), !value);
    if (preference === 'saveData') connection.callbacks.forEach(callback => callback({type:'change'}));
    else {
      const pending = [];
      for (const item of media) {
        const next = values.get(item.query);
        if (next === item.previous) continue;
        item.previous = next;
        for (const callback of item.callbacks) pending.push(() => callback({type:'change', matches:next, media:item.query}));
      }
      pending.forEach(callback => callback());
    }
  };
  setPreference(true); await flush();
  assert.deepEqual(calls, [false], 'Render polling must not consume the loader disable event');
  assert.equal(root.dataset.aircraftState, 'static');
  assert.equal(window.V3WebGPU.state, 'static-preferences');
  assert.equal(window.V3WebGPU.backend, 'static');
  assert.equal(window.V3WebGPU.ready, false);
  bounds = {top:5000, bottom:6000}; context.location.hash = '';
  setPreference(false); await flush();
  assert.deepEqual(calls, [false, true], 'Mounted controller is reenabled offscreen despite started=true');
  setPreference(true); await flush(); setPreference(false); await flush();
  assert.deepEqual(calls, [false, true, false, true]);
  assert.deepEqual([mounted, imports, deviceRequests, adapterRequests, destroyed], [1,1,1,1,0], 'Preference cycles reuse the mounted device/controller');
  console.log(`PASS independent event queries survive controller polling and repeated offscreen preference cycles: ${preference}`);
}

(async () => {
  for (const preference of ['(prefers-reduced-motion: reduce)', '(max-height:600px)', 'saveData']) {
    for (const stage of ['module', 'device']) await test(preference, stage);
    await mountedPreference(preference);
  }
  await softwareSelection('', { vendor: 'google', architecture: 'swiftshader' }, true);
  await softwareSelection('', {}, true, true);
  await softwareSelection('webgpu', { vendor: 'google', architecture: 'swiftshader' }, false);
  await softwareSelection('', { vendor: 'test-hardware' }, true);
  await softwareSelection('webgpu', { vendor: 'test-hardware' }, false);
  await softwareSelection('', {}, true);
  await softwareSelection('webgpu', {}, false);
  await softwareSelection('invalid', { vendor: 'test-hardware' }, true);
  await softwareSelection('webgl', { vendor: 'test-hardware' }, true);
})().catch(error => { console.error(error); process.exitCode = 1; });

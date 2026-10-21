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
    window, document: { querySelector: () => root }, location: { search: '', hash: '' },
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
(async () => {
  for (const preference of ['(prefers-reduced-motion: reduce)', '(max-height:600px)', 'saveData']) {
    for (const stage of ['module', 'device']) await test(preference, stage);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

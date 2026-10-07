/* Checks startup ordering without a GPU: original silk images must start while
 * geometry is still in flight, and static modes must fetch no 3D dependencies.
 * The texture list is checked against the committed lossless pack headers. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scripts = ['assets/v2-hero-assets.js', 'assets/v2-hero-environment.js'];
const startup = 'assets/v2-hero-startup.js';
const names = ['tramtrace', 'telemetry', 'pi'];
const packTextures = Object.fromEntries(names.map(name => {
  const bytes = fs.readFileSync(path.join(root, 'assets/models/hero', name + '.bin'));
  const data = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(8)).toString());
  return [name, data.textures.map(item => item.url)];
}));
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return {promise, release}; };
const flush = () => new Promise(resolve => setImmediate(resolve));

function context({reduced = false, saveData = false, failHelpers = false} = {}) {
  const requests = [], images = [], downloads = new Map(), scriptRequests = [];
  const sandbox = {
    TextDecoder, DataView, Uint8Array, performance, setTimeout,
    navigator:{connection:{saveData}},
    matchMedia:() => ({matches:reduced}),
    document:{
      createElement:() => ({}),
      head:{append:script => {
        scriptRequests.push(script.src);
        queueMicrotask(() => {
          if (failHelpers) { script.onerror(new Error('Network failure')); return; }
          if (/three\.min|v2-hero-motion/.test(script.src)) { script.onload(); return; }
          run(script.src.split('?')[0].slice(1)); script.onload();
        });
      }},
    },
    fetch:url => {
      requests.push(url);
      const download = gate(); downloads.set(url, download);
      return Promise.resolve({ok:true, arrayBuffer:() => download.promise});
    },
    Image:class {
      set src(url) { images.push(url); this.url = url; queueMicrotask(() => this.onload()); }
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const run = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  return {sandbox, requests, images, downloads, scriptRequests, run};
}

function smallPack(textures) {
  const json = Buffer.from(JSON.stringify({version:1, geometries:[], textures:textures.map(url => ({url}))}));
  const start = Math.ceil((16 + json.length) / 4) * 4;
  const bytes = Buffer.alloc(start); bytes.write('V2HERO1'); bytes.writeUInt32LE(json.length, 8); bytes.writeUInt32LE(start, 12); json.copy(bytes, 16);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

(async () => {
  const observed = context(); observed.run(scripts[0]); observed.run(scripts[1]);
  assert.equal(observed.requests.length, 0, 'Loading a helper dynamically must not trigger unrelated models');
  assert.equal(observed.images.length, 0);
  for (const name of names) {
    const before = observed.images.length;
    const first = observed.sandbox.V2HeroAssets.prefetch(name);
    const second = observed.sandbox.V2HeroAssets.prefetch(name);
    assert.strictEqual(first, second, 'Concurrent scene/early prefetch must share the same geometry promise');
    assert.deepEqual(observed.images.slice(before), packTextures[name], name + ' must start each original silk image before geometry finishes, once');
    const request = observed.requests.find(url => url.includes('/' + name + '.'));
    assert.ok(request);
    observed.downloads.get(request).release(smallPack(packTextures[name]));
    await first;
    assert.deepEqual(observed.images.slice(before), packTextures[name], 'Pack loading must reuse the prefetched Image objects');
  }
  const original = observed.sandbox.V2HeroEnvironment.prefetch();
  assert.strictEqual(original, observed.sandbox.V2HeroEnvironment.prefetch(), 'Lighting prefetch must share its download');
  observed.downloads.get('/assets/models/hero/environment.bin').release(new ArrayBuffer(0)); await original;
  await assert.rejects(observed.sandbox.V2HeroAssets.prefetch('unknown'), /Unknown hero assembly/);

  const early = context(); early.run(startup); early.run(startup); await flush();
  assert.equal(early.scriptRequests.length, 4, 'Concurrent startup calls must share runtime and helper requests');
  assert.ok(early.scriptRequests[0].includes('three.min.js'), 'Request the renderer before geometry and images compete for the connection');
  assert.equal(early.requests.length, 4, 'The opted-in page starts three geometry files and one prepared environment');
  assert.deepEqual(early.images, Object.values(packTextures).flat(), 'Early startup must request only the full-quality pack textures');
  assert.equal(early.sandbox.THREE, undefined, 'Early preparation must not create or depend on a renderer instance');
  for (const mode of [{reduced:true}, {saveData:true}, {reduced:true, saveData:true}]) {
    const staticPage = context(mode); staticPage.run(startup); await flush();
    assert.deepEqual(staticPage.scriptRequests, [], 'Static preferences must not request extra CAD helpers');
    assert.deepEqual(staticPage.requests, [], 'Static preferences must not download any model or lighting');
    assert.deepEqual(staticPage.images, [], 'Static preferences must not download hidden CAD textures');
  }
  const unavailable = context({failHelpers:true}); unavailable.run(startup); await flush();
  assert.equal(unavailable.sandbox.V2HeroScripts.size, 0, 'Failed early helpers must be retryable by scene initialization');
  assert.deepEqual(unavailable.requests, []);
  console.log('PASS: original texture parity, overlap, deduplication, opt-in startup, reduced-motion and Save Data guards.');
})().catch(error => { console.error(error); process.exitCode = 1; });

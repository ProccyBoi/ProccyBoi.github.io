#!/usr/bin/env node
/* Source-only regression for Selected's exact translation batch kernel.
 * Uses the real vendored THREE and committed compressed CAD; no Playwright,
 * browser, network, rendering or timing assertions. Decoded images are stubbed.
 * Run: node scripts/verify-v2-selected-translation.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const T = require(path.join(root, 'assets/vendor/three.min.js'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const source = read('assets/v2-selected-assets.js');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'Unique production anchor: ' + before);
  return text.replace(before, after);
}
// Reference execution disables only the fast-path gate. It exercises the
// original Vector3.applyMatrix4/applyMatrix3 kernel, not another scalar copy.
const referenceSource = replaceOnce(source, 'const translationOnly=', 'const translationOnly=false&&');
const probeAnchor = 'normalElements.every((value,index)=>Object.is(value,index%4===0?1:0));';
function instrument(text) {
  return replaceOnce(text, probeAnchor, probeAnchor + '\n        window.__translationProbe[translationOnly?"fast":"generic"]++;');
}
// Reuse the build's exact geometry/material/texture/hierarchy/parts serializer
// without importing its executable entry point or requiring Playwright.
const builder = read('scripts/build-v2-hero-assets.cjs');
const captureStart = builder.indexOf('function captureAssembly(');
const captureEnd = builder.indexOf('\nfunction expandGeometry(', captureStart);
assert.ok(captureStart >= 0 && captureEnd > captureStart, 'Existing source-build serializer boundaries');
const captureSource = builder.slice(captureStart, captureEnd);

function environment(selectedSource) {
  class LocalImage {
    set src(url) { this._src = url; queueMicrotask(() => this.onload?.()); }
    get src() { return this._src; }
  }
  const window = {THREE:T, DecompressionStream, __translationProbe:{fast:0, generic:0}};
  for (const name of ['Float32Array', 'Float64Array', 'Uint32Array', 'Uint16Array', 'Uint8Array', 'Int32Array', 'Int16Array', 'Int8Array']) window[name] = global[name];
  const context = vm.createContext({window, Image:LocalImage, TextDecoder, DataView, Uint8Array, Blob, Response,
    DecompressionStream, performance, setTimeout, console, btoa, URL,
    location:{href:'https://example.test/v2/', origin:'https://example.test'},
    fetch:async url => {
      const filename = url.split('?')[0];
      assert.match(filename, /^\/assets\/models\/(?:hero|selected)\/[a-z0-9-]+\.(?:idx\.bin\.gz|bin)$/);
      return new Response(fs.readFileSync(path.join(root, filename.slice(1))));
    }
  });
  for (const file of ['v2-hero-assets.js', 'v2-hero-environment.js']) vm.runInContext(read('assets/' + file), context, {filename:file});
  vm.runInContext(instrument(selectedSource), context, {filename:'v2-selected-assets.js'});
  vm.runInContext(captureSource + '\nwindow.captureAssembly=captureAssembly;', context);
  return window;
}
function captured(window, assembly) {
  // Runtime timing and generated UUIDs in the diagnostic report are checked
  // separately. All actual output geometry bytes and render state are included.
  return JSON.stringify(window.captureAssembly({...assembly, staticBatches:undefined}));
}
function stableReport(assembly) {
  const result = JSON.parse(JSON.stringify(assembly.staticBatches));
  for (const key of ['durationMs', 'workMs', 'maxWorkSliceMs', 'yields']) delete result[key];
  for (const batch of result.batches) for (const member of batch.members) delete member.sourceGeometry;
  return result;
}
function prepare(window, name, change) {
  return assembly => {
    if (name === 'tramtrace') window.V2ProductStudio.applyMaterials(assembly, name);
    change?.(assembly);
  };
}
function nodeAt(assembly, index) {
  const nodes = []; assembly.group.traverse(node => nodes.push(node));
  assert.ok(nodes[index]?.isMesh, 'Known real eligible source mesh');
  return nodes[index];
}
function dispose(assembly) { assembly?.group.traverse(node => node.geometry?.dispose()); }
function equalBounds(actual, expected) {
  const actualNodes = [], expectedNodes = [];
  actual.group.traverse(node => actualNodes.push(node)); expected.group.traverse(node => expectedNodes.push(node));
  assert.equal(actualNodes.length, expectedNodes.length);
  actualNodes.forEach((node, index) => {
    if (!node.geometry) return;
    const a = node.geometry, b = expectedNodes[index].geometry;
    assert.deepEqual(a.boundingBox?.min.toArray(), b.boundingBox?.min.toArray());
    assert.deepEqual(a.boundingBox?.max.toArray(), b.boundingBox?.max.toArray());
    assert.deepEqual(a.boundingSphere?.center.toArray(), b.boundingSphere?.center.toArray());
    assert.equal(a.boundingSphere?.radius, b.boundingSphere?.radius);
  });
}
function independentBatchArrays(actual, expected) {
  for (const batch of actual.staticBatches.batches) {
    const a = actual.group.getObjectByName(batch.name).geometry;
    const b = expected.group.getObjectByName(batch.name).geometry;
    assert.notEqual(a, b, 'Per-load editable batch geometry ownership');
    for (const key of Object.keys(a.attributes)) {
      assert.notEqual(a.attributes[key], b.attributes[key]);
      assert.notEqual(a.attributes[key].array.buffer, b.attributes[key].array.buffer, 'Per-load editable attribute ownership');
    }
    assert.notEqual(a.index.array.buffer, b.index.array.buffer, 'Per-load editable index ownership');
  }
}

async function main() {
  const reference = environment(referenceSource), actual = environment(source), evidence = [];
  await Promise.all(['metro', 'tramtrace'].flatMap(name => [reference.V2SelectedAssets.prefetch(name), actual.V2SelectedAssets.prefetch(name)]));
  for (const name of ['metro', 'tramtrace']) {
    const originalReference = await reference.V2SelectedAssets.load(name);
    const originalActual = await actual.V2SelectedAssets.load(name);
    const referenceBefore = captured(reference, originalReference), actualBefore = captured(actual, originalActual);
    assert.equal(actualBefore, referenceBefore, 'Identical independent original source loads');
    let selectedNode;
    for (const mode of ['default', 'mirrored', 'nontranslation', 'signed-zero-normal']) {
      const change = mode === 'default' ? undefined : assembly => {
        const node = nodeAt(assembly, selectedNode);
        if (mode === 'mirrored') node.scale.x *= -1;
        if (mode === 'nontranslation') { node.scale.set(1.2, .8, 1.1); node.rotation.set(.13, .27, .31); }
        if (mode === 'signed-zero-normal') {
          // Clone before editing: never modify the cached source pack buffer.
          node.geometry = node.geometry.clone();
          const normal = node.geometry.attributes.normal;
          assert.ok(normal.count >= 8);
          for (let i = 0; i < 8; i++) for (let axis = 0; axis < 3; axis++) normal.array[i * 3 + axis] = i & (1 << axis) ? -0 : 0;
        }
      };
      reference.__translationProbe = {fast:0, generic:0}; actual.__translationProbe = {fast:0, generic:0};
      const expected = await reference.V2SelectedAssets.loadStatic(name, prepare(reference, name, change));
      const result = await actual.V2SelectedAssets.loadStatic(name, prepare(actual, name, change));
      if (mode === 'default') selectedNode = expected.staticBatches.batches[0].members[0].sourceNode;
      const expectedCapture = captured(reference, expected), actualCapture = captured(actual, result);
      assert.equal(actualCapture, expectedCapture, name + '/' + mode + ': exact attributes, indices, materials, textures, hierarchy, flags, parts and metadata');
      assert.deepEqual(stableReport(result), stableReport(expected), 'Exact batch membership and rounding checks');
      equalBounds(result, expected); independentBatchArrays(result, expected);
      assert.equal(reference.__translationProbe.fast, 0, 'Reference uses only the original generic kernel');
      assert.ok(actual.__translationProbe.fast > 0, 'Production actually exercises its fast path');
      if (mode === 'mirrored' || mode === 'nontranslation') assert.ok(actual.__translationProbe.generic > 0, 'Adversarial source really exercises the generic fallback');
      evidence.push({name, mode, sha256:hash(actualCapture), probe:{...actual.__translationProbe}});
      dispose(expected); dispose(result);
    }
    // Two loads through the same production cache must still own independent
    // editable batch arrays. Mutating one must not change the other or sources.
    const first = await actual.V2SelectedAssets.loadStatic(name, prepare(actual, name));
    const second = await actual.V2SelectedAssets.loadStatic(name, prepare(actual, name));
    independentBatchArrays(first, second);
    const secondBefore = captured(actual, second), batch = first.group.getObjectByName(first.staticBatches.batches[0].name);
    batch.geometry.attributes.position.array[0] += .01;
    batch.geometry.index.array[0] = (batch.geometry.index.array[0] + 1) % batch.geometry.attributes.position.count;
    assert.equal(captured(actual, second), secondBefore, 'Editing one batch leaves its independently loaded peer unchanged');
    dispose(first); dispose(second);

    for (const [label, window] of [['generic', reference], ['production', actual]]) {
      let checks = 0, staged, before;
      const canceled = await window.V2SelectedAssets.loadStatic(name, assembly => {
        prepare(window, name)(assembly); staged = assembly; before = captured(window, assembly);
      }, {shouldContinue:() => ++checks < 4});
      assert.equal(canceled, null, 'Cooperative cancellation returns no partial assembly');
      assert.equal(checks, 4); assert.equal(captured(window, staged), before, 'Canceled work commits no source change');
      assert.equal(staged.staticBatches, undefined); dispose(staged);
      for (const invalid of [NaN, Infinity]) {
        await assert.rejects(() => window.V2SelectedAssets.loadStatic(name, prepare(window, name, assembly => {
          const node = nodeAt(assembly, selectedNode); node.geometry = node.geometry.clone(); node.geometry.attributes.normal.array[0] = invalid;
        })), /non-finite transformed attribute/, label + ': finite-attribute rejection retained');
      }
    }
    assert.equal(captured(reference, originalReference), referenceBefore);
    assert.equal(captured(actual, originalActual), actualBefore);
    for (const [window, before] of [[reference, referenceBefore], [actual, actualBefore]]) {
      const reloaded = await window.V2SelectedAssets.load(name);
      assert.equal(captured(window, reloaded), before, 'Cached original attribute and index bytes remain unchanged'); dispose(reloaded);
    }
    dispose(originalReference); dispose(originalActual);
  }
  // Exhaust zero signs using the actual production scalar statements and
  // vendored THREE reference, including both signs of zero translations.
  const scalarStart = source.indexOf('let tx=x+0*y+0*z,ty=0*x+y+0*z,tz=0*x+0*y+z;');
  const scalarEnd = source.indexOf('\n              if(!Number.isFinite(tx)', scalarStart);
  assert.ok(scalarStart >= 0 && scalarEnd > scalarStart, 'Production scalar kernel is located exactly');
  const scalar = new Function('x', 'y', 'z', 'elements', 'positions', source.slice(scalarStart, scalarEnd) + '\nreturn [tx,ty,tz];');
  let scalarCases = 0;
  for (let signs = 0; signs < 8; signs++) for (const translation of [0, -0, 1, -1]) {
    const input = [0, 1, 2].map(index => signs & (1 << index) ? -0 : 0);
    const matrix = new T.Matrix4().makeTranslation(translation, translation, translation);
    const normal = new T.Matrix3().getNormalMatrix(matrix);
    for (const positions of [false, true]) {
      const expected = new T.Vector3(...input);
      if (positions) expected.applyMatrix4(matrix); else expected.applyMatrix3(normal);
      scalar(...input, matrix.elements, positions).forEach((value, axis) => assert.ok(Object.is(value, expected.getComponent(axis)), 'Exact IEEE-754 signed-zero behavior'));
      scalarCases++;
    }
  }
  console.log(JSON.stringify({passed:true, scope:'Source-only exact translation/generic parity; no browser or performance claim', models:evidence,
    scalarCases, cancellation:true, nonFiniteRejection:true, sourceImmutability:true, editableBatchOwnership:true}, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

/* The photographic finish may change light response, never source CAD or maps.
 * Loads the actual prepared assemblies without starting a browser or GPU. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const T = require('../assets/vendor/three.min.js');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/hero/manifest.json')));
const sandbox = {
  THREE:T, TextDecoder, DataView, Uint8Array, Uint16Array, Uint32Array, Int8Array,
  Int16Array, Int32Array, Float32Array, Float64Array, performance, setTimeout,
  fetch:async url => {
    const bytes = fs.readFileSync(path.join(root, url.split('?')[0]));
    return {ok:true, arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  },
  Image:class {set src(url) {this.url = url; queueMicrotask(() => this.onload());}}
};
sandbox.window = sandbox; vm.createContext(sandbox);
for (const file of ['v2-hero-assets.js', 'v2-hero-environment.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets', file), 'utf8'), sandbox);
function geometryHash(group) {
  const digest = crypto.createHash('sha256');
  group.traverse(object => {
    const geometry = object.geometry;
    if (!geometry) return;
    for (const attribute of [geometry.index, ...Object.values(geometry.attributes)]) {
      if (attribute) digest.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
  });
  return digest.digest('hex');
}
(async () => {
  const report = [];
  for (const name of ['tramtrace', 'telemetry', 'pi']) {
    const maskName = {tramtrace:'mat_30', telemetry:'mat_48', pi:'mat_20'}[name];
    assert.equal(hash(fs.readFileSync(path.join(root, manifest.models[name].url))), manifest.models[name].sha256, 'The prepared CAD pack remains byte-identical');
    const model = await sandbox.V2HeroAssets.load(name), before = geometryHash(model.group), nodes = [];
    model.group.traverse(object => nodes.push({object, geometry:object.geometry,
      transform:JSON.stringify([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray(), object.matrix.elements]),
      flags:[object.visible, object.castShadow, object.receiveShadow],
      materials:(Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).map(material => ({map:material.map,
        color:material.color.toArray(), opacity:material.opacity, transparent:material.transparent, alphaTest:material.alphaTest, side:material.side}))
    }));
    const refs = model.parts.map(part => part.object);
    sandbox.V2ProductStudio.applyMaterials(model, name, T);
    assert.equal(geometryHash(model.group), before, 'All vertex/index bytes survive the finish');
    assert.deepEqual(model.parts.map(part => part.object), refs, 'Physical component identity remains intact');
    for (const node of nodes) {
      const object = node.object;
      assert.strictEqual(object.geometry, node.geometry);
      assert.equal(JSON.stringify([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray(), object.matrix.elements]), node.transform, 'Every source transform remains exact');
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
      const coating = materials.length && materials.every(material => material.name === maskName);
      assert.deepEqual([object.visible, object.castShadow, object.receiveShadow], [node.flags[0], coating ? false : node.flags[1], node.flags[2]], 'Only the coplanar coating stops casting; all original component/core shadows remain');
      materials.forEach((material, index) => {
        const original = node.materials[index];
        assert.strictEqual(material.map, original.map, 'Use the same original silk texture');
        assert.deepEqual(material.color.toArray(), original.color, 'Retain the source soldermask/component colours');
        for (const key of ['opacity', 'transparent', 'alphaTest', 'side']) assert.equal(material[key], original[key], 'Preserve CAD surface visibility');
        if (material.isMeshPhysicalMaterial) assert.ok(Object.hasOwn(material.defines, 'PHYSICAL'), 'Physical finishes must compile their actual clearcoat shader');
      });
    }
    const materials = nodes.filter(node => node.object.isMesh).map(node => node.object.material);
    sandbox.V2ProductStudio.applyMaterials(model, name, T);
    assert.deepEqual(nodes.filter(node => node.object.isMesh).map(node => node.object.material), materials, 'Applying the shared finish twice is idempotent');
    if (name === 'pi') {
      assert.equal(nodes.filter(node => node.object.name.startsWith('M2-')).length, 2);
      assert.ok(model.group.getObjectByName('Enclosure').material.isMeshPhysicalMaterial, 'The original clear housing receives a physical finish');
    }
    report.push({name, meshes:nodes.filter(node => node.object.isMesh).length, triangles:nodes.reduce((sum, node) => sum + (node.geometry ? node.geometry.index.count / 3 : 0), 0)});
  }
  const scene = new T.Scene(), {key} = sandbox.V2ProductStudio.createLights(T, scene);
  assert.equal(scene.children.filter(object => object.isLight && object.castShadow).length, 1, 'A single shadow map serves the hero');
  assert.ok(key.intensity > 0, 'Overview lighting retains contact/self shadows');
  console.log('PASS: unchanged CAD bytes, transforms, source colours, maps, housing/screws, idempotent finishes; ' + JSON.stringify(report));
})().catch(error => {console.error(error); process.exitCode = 1;});

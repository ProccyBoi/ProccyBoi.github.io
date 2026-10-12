#!/usr/bin/env node
/* v3-only studio presentation source/unit contracts. This does not claim
 * browser rendering, pixel appearance or device-GPU performance. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const original = read('assets/v3-aircraft-hero.js');
const clone = read('assets/v3-product-aircraft.js');
const expected = original.replaceAll('window.V3AircraftAtmosphere', 'window.V3ProductAtmosphere')
  .replace('/assets/v3-aircraft-atmosphere.js?v=aircraft-refine-20261010', '/assets/v3-product-atmosphere.js?v=white-20261012')
  .replaceAll("new T.Color('#101210')", "new T.Color('#f5f5f7')")
  .replaceAll("new T.Color('#18232b')", "new T.Color('#f5f5f7')")
  .replaceAll("new T.Color('#25323e')", "new T.Color('#f5f5f7')")
  .replace('new T.ShadowMaterial({ color: 0x000000, opacity: .35, transparent: true, depthWrite: false })', 'new T.ShadowMaterial({ color: 0x000000, opacity: .13, transparent: true, depthWrite: false })');
assert.equal(clone, expected, 'Aircraft clone changes only backdrop namespace/URL, surface palette and reviewed contact-shadow opacity; full controller, GPU queues, shadow map quality, timing, materials, geometry and lighting stay exact');
for (const file of ['assets/v3-aircraft-hero.js', 'assets/v3-aircraft-atmosphere.js', 'assets/v3-aircraft-scene.js', 'assets/v3-aircraft-electronics.js', 'assets/v2-selected-scene.js', 'assets/v2-hero-environment.js']) {
  assert.equal(read(file), execFileSync('git', ['show', '45c386e:' + file], {cwd:root, encoding:'utf8'}), 'Frozen shared source: ' + file);
}
// Every permitted display-palette delta is spelled out. No unreviewed shader,
// landing-clock, geometry, uniforms or render ownership change can pass.
const palette = [
  [
    "vec3(.215, .258, .262)",
    "vec3(.800, .820, .835)"
  ],
  [
    "vec3(.258, .294, .293)",
    "vec3(.870, .880, .890)"
  ],
  [
    "vec3(.160, .199, .208) + ribs * .009",
    "vec3(.770, .790, .810) + ribs * .004"
  ],
  [
    "vec3(16.0, 18.0, 16.0) / 255.0",
    "vec3(245.0, 245.0, 247.0) / 255.0"
  ],
  [
    "mix(vec3(0.32, 0.385, 0.42), vec3(0.080, 0.125, 0.155), skyHeight)",
    "mix(vec3(0.91, 0.935, 0.96), vec3(0.970, 0.975, 0.985), skyHeight)"
  ],
  [
    "vec3(0.105, 0.107, 0.10) * horizonLight",
    "vec3(0.025, 0.023, 0.020) * horizonLight"
  ],
  [
    "vec3(.040, .030, .016) * eveningLight",
    "vec3(.012, .010, .006) * eveningLight"
  ],
  [
    "vec3(.025, .027, .026) * highWisp",
    "vec3(.008, .009, .010) * highWisp"
  ],
  [
    "mix(vec3(0.255, 0.315, 0.35), vec3(0.49, 0.54, 0.56),",
    "mix(vec3(0.875, 0.895, 0.915), vec3(0.970, 0.975, 0.985),"
  ],
  [
    "mix(vec3(0.215, 0.28, 0.325), vec3(0.66, 0.69, 0.70), light)",
    "mix(vec3(0.820, 0.855, 0.890), vec3(0.980, 0.985, 0.990), light)"
  ],
  [
    "vec3(0.075, 0.070, 0.058) * softRim",
    "vec3(0.015, 0.014, 0.012) * softRim"
  ],
  [
    "vec3(.278, .332, .340)",
    "vec3(.830, .860, .890)"
  ],
  [
    "vec3(.184, .246, .253)",
    "vec3(.820, .850, .865)"
  ],
  [
    "vec3(.122, .187, .192)",
    "vec3(.770, .805, .810)"
  ],
  [
    "vec3(.294, .335, .338)",
    "vec3(.920, .930, .935)"
  ],
  [
    "vec3(0.17, 0.195, 0.19)",
    "vec3(0.920, 0.925, 0.928)"
  ],
  [
    "vec3(0.018, 0.020, 0.019) * apron",
    "vec3(0.006, 0.006, 0.007) * apron"
  ],
  [
    "vec3(.275, .309, .300)",
    "vec3(.780, .800, .805)"
  ],
  [
    "mix(vec3(.385, .285, .215), vec3(.47, .455, .393),",
    "mix(vec3(.805, .725, .660), vec3(.92, .905, .880),"
  ],
  [
    "          // A display-channel ceiling of .24 bounds text-zone relative\n          // luminance below .047, keeping the existing muted body copy clear.\n          vec3 copySafe = colour * min(1.0, 0.24 / max(0.001, max(colour.r, max(colour.g, colour.b))));",
    "          // A quiet near-white copy zone matches the v3 ink-on-paper page.\n          // This is a backdrop-only palette, never a filter over the aircraft.\n          vec3 copySafe = mix(colour, page, .94);"
  ],
  [
    "          colour *= 1.0 - edge;",
    "          colour = mix(colour, page, edge);"
  ],
  [
    "gl_FragColor = vec4(mix(page, colour, uStrength), 1.0);",
    "gl_FragColor = vec4(mix(page, colour, uStrength * (1.0 - smoothstep(.80, 1.0, abs(uv.x - .5) * 2.0)) * (1.0 - smoothstep(.88, 1.0, uv.y))), 1.0);"
  ],
  [
    "grain * .12 * detailFade + wear * .16",
    "grain * .012 * detailFade + wear * .016"
  ],
  [
    "surface * vec3(.86, 1.07, .84)",
    "surface * vec3(.990, .998, .987)"
  ],
  [
    "sin(field.x * 2.8 + .4) * .024",
    "sin(field.x * 2.8 + .4) * .004"
  ],
  [
    "joint * .09 * detailFade",
    "joint * .025 * detailFade"
  ],
  [
    "surface * 1.65 + vec3(.0060, .0059, .0045)",
    "surface * 1.025 + vec3(.0020, .0020, .0020)"
  ],
  [
    "tyre * .075 * detailFade",
    "tyre * .012 * detailFade"
  ],
  [
    "window.V3AircraftAtmosphere",
    "window.V3ProductAtmosphere"
  ]
];
let expectedAtmosphere = read('assets/v3-aircraft-atmosphere.js');
for (const [before, after] of palette) {
  assert.equal(expectedAtmosphere.split(before).length - 1, 1, 'Unique presentation substitution: ' + before);
  expectedAtmosphere = expectedAtmosphere.replace(before, after);
}
assert.equal(read('assets/v3-product-atmosphere.js'), expectedAtmosphere, 'Only the enumerated backdrop and floor appearance changes are allowed');
const T = require(path.join(root, 'assets/vendor/three.min.js'));
function load(file, name) {
  const sandbox = {window:{}};
  vm.runInNewContext(read(file), sandbox, {filename:file});
  return sandbox.window[name];
}
const sourceAtmosphere = load('assets/v3-aircraft-atmosphere.js', 'V3AircraftAtmosphere');
const lightAtmosphere = load('assets/v3-product-atmosphere.js', 'V3ProductAtmosphere');
for (const detailed of [false, true]) {
  const before = sourceAtmosphere.create(T, {detailed});
  const after = lightAtmosphere.create(T, {detailed});
  assert.equal(after.scene.children.length, 1, 'Same single existing backdrop draw');
  const originalMesh = before.scene.children[0], lightMesh = after.scene.children[0];
  assert.deepEqual(lightMesh.geometry.attributes.position.array, originalMesh.geometry.attributes.position.array);
  assert.deepEqual(lightMesh.geometry.index.array, originalMesh.geometry.index.array);
  assert.deepEqual({...lightMesh.material.defines}, {...originalMesh.material.defines});
  assert.equal(lightMesh.material.vertexShader, originalMesh.material.vertexShader, 'No geometric presentation change');
  for (const landing of [0, .25, .5, .75, 1]) for (const progress of [0, .06, .20, .38, .61, .76, 1]) for (const [width,height] of [[1600,1000],[390,768],[1024,640]]) {
    const input = {landing, progress, width, height};
    assert.equal(after.update(input), before.update(input), 'Atmosphere fade timing retained');
    for (const name of Object.keys(originalMesh.material.uniforms)) assert.equal(lightMesh.material.uniforms[name].value, originalMesh.material.uniforms[name].value, 'Uniform sampling retained: ' + name);
  }
  assert.equal(after.opacity, 0, 'Telemetry returns to the continuous light studio');
  before.dispose(); after.dispose();
}
const home = read('v3/index.html');
assert.match(home, /src="\/assets\/v3-product-aircraft\.js\?/);
assert.doesNotMatch(home, /src="\/assets\/v3-aircraft-hero\.js\?/);
assert.match(read('v2/index.html'), /src="\/assets\/v3-aircraft-hero\.js\?/);
console.log('PASS v3 light surfaces: exact controller/geometry/material/light/shadow-map/GPU/timing preservation; explicit neutral surface palette; 210 original update samples; v3-only imports.');

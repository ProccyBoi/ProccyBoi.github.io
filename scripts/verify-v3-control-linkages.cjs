/* Offline source-CAD mount and pushrod regression. No browser or DOM needed.
 * node scripts/verify-v3-control-linkages.cjs */
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
global.window = global; global.self = global;
global.THREE = require(root + '/assets/vendor/three.min.js');
for (const script of ['assets/vendor/GLTFLoader.js', 'assets/v3-aircraft-electronics.js', 'assets/v3-aircraft-scene.js']) vm.runInThisContext(fs.readFileSync(root + '/' + script, 'utf8'));
const vector = values => new THREE.Vector3(...values);
const near = (actual, expected, label, tolerance = 1e-10) => assert.ok(actual.distanceTo(expected) < tolerance, label + ': ' + actual.toArray() + ' vs ' + expected.toArray());
(async () => {
  const bytes = fs.readFileSync(root + '/assets/models/aircraft/skylabs-trainer/airframe.glb');
  const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  const metadata = JSON.parse(fs.readFileSync(root + '/assets/models/aircraft/skylabs-trainer/manifest.json', 'utf8'));
  const sourceObjects = [], sourceBuffers = [];
  gltf.scene.traverse(object => {
    sourceObjects.push(object);
    if (object.isMesh) for (const attribute of Object.values(object.geometry.attributes)) sourceBuffers.push({ attribute, array: attribute.array, bytes: Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength).toString('base64') });
  });
  const flight = V3AircraftScene.create(THREE, { group: gltf.scene, metadata }, null, { detailed: true });
  const electronics = flight.electronics;
  assert.equal(electronics.statistics.servos, 4); assert.equal(electronics.statistics.pushrods, 4);
  flight.setProgress(0);
  const fitted = electronics.inspect().controls;
  assert.deepEqual(fitted.map(control => control.fixed), ['horizontal-tail-right', 'vertical-tail', 'wing-left', 'wing-right']);
  const inverse = electronics.group.matrixWorld.clone().invert();
  for (const control of fitted) {
    assert.ok(control.boundFixed && control.boundControl, 'Fixed and moving sources bound for ' + control.servo);
    const servo = electronics.group.getObjectByName(control.servo), fixed = flight.carrier.getObjectByName(control.boundFixed), moving = flight.carrier.getObjectByName(control.boundControl);
    assert.ok(moving !== fixed && moving.parent, 'Moving surface is distinct from fixed structure');
    const casing = servo.children.find(child => child.isMesh && child.material.name === 'Electronics blue servo casing');
    assert.ok(casing, 'Batched servo housing available');
    const housingBounds = casing.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, casing.matrixWorld));
    assert.ok(housingBounds.min.x > control.hingeX + .009, 'Complete housing and lugs remain ahead of the hinge: ' + control.servo);
    assert.ok(control.installedSurface[0] < control.hingeX - .012, 'Surface horn mounted aft of the hinge');
    const structureBounds = new THREE.Box3().setFromObject(fixed).applyMatrix4(inverse);
    // Inverse-transforming an axis-aligned world box is conservative but confirms
    // correct aircraft assembly and catches old fuselage-mounted tail servos.
    assert.ok(structureBounds.containsBox(housingBounds), 'Housing lies inside its fixed wing/tail envelope: ' + control.servo);
    if (control.fixed.startsWith('wing')) {
      assert.ok(Math.abs(control.fitted[2]) > .40 && Math.abs(control.fitted[2]) < .535, 'Wing servo between source rib stations');
      assert.ok(Math.abs(control.installedSurface[2]) > .38 && Math.abs(control.installedSurface[2]) < .75, 'Horn inside aileron span');
    }
    near(vector(control.surface), vector(control.installedSurface), 'Horn starts exactly at its installed source point');
    assert.ok(control.pushrodLength > .04 && control.pushrodLength < .11, 'Plausible installed pushrod length');
  }
  // During the first structural separation, servos and surface horns must move
  // exactly with their own source assemblies, before extraction starts.
  const restSource = new Map(fitted.map(control => [control.fixed, new THREE.Matrix4().multiplyMatrices(inverse, flight.carrier.getObjectByName(control.boundFixed).matrixWorld).invert()]));
  flight.setProgress(.43);
  const inverseMoved = electronics.group.matrixWorld.clone().invert();
  for (const control of electronics.inspect().controls) {
    const source = flight.carrier.getObjectByName(control.boundFixed);
    const delta = new THREE.Matrix4().multiplyMatrices(inverseMoved, source.matrixWorld).multiply(restSource.get(control.fixed));
    const expected = vector(control.fitted).applyMatrix4(delta), servo = electronics.group.getObjectByName(control.servo);
    near(servo.position, expected, 'Servo follows separated fixed structure');
  }
  // A moving-control-only transform, even at unchanged progress, must move the
  // surface end of its linkage without taking the installed servo with it.
  flight.setProgress(.30);
  const beforeDeflect = electronics.inspect().controls;
  for (const control of beforeDeflect) {
    const source = flight.carrier.getObjectByName(control.boundControl), servo = electronics.group.getObjectByName(control.servo), oldServo = servo.position.clone();
    const original = source.quaternion.clone(), sourcePosition = source.position.clone();
    const oldInverse = new THREE.Matrix4().multiplyMatrices(electronics.group.matrixWorld.clone().invert(), source.matrixWorld).invert();
    source.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .08));
    source.updateWorldMatrix(true, true);
    const delta = new THREE.Matrix4().multiplyMatrices(electronics.group.matrixWorld.clone().invert(), source.matrixWorld).multiply(oldInverse);
    electronics.setProgress(.30);
    const changed = electronics.inspect().controls.find(value => value.servo === control.servo);
    near(servo.position, oldServo, 'Moving control does not carry servo');
    near(vector(changed.surface), vector(control.surface).applyMatrix4(delta), 'Surface horn follows actual control transform');
    assert.ok(vector(changed.controlPin).distanceTo(vector(control.controlPin)) > 1e-6, 'Control-side pushrod endpoint moves');
    source.quaternion.copy(original); source.position.copy(sourcePosition); source.updateWorldMatrix(true, true); electronics.setProgress(.30);
  }
  let maxRodLength = 0, maxEndpointError = 0;
  const electronicsObjects = [], buffers = [];
  electronics.group.traverse(object => { electronicsObjects.push(object); if (object.isMesh) for (const attribute of Object.values(object.geometry.attributes)) buffers.push({ attribute, array: attribute.array }); });
  for (let step = 0; step <= 100; step++) {
    flight.setProgress(step / 100);
    for (const control of electronics.inspect().controls) {
      maxRodLength = Math.max(maxRodLength, control.pushrodLength);
      assert.ok(control.pushrodLength > .035 && control.pushrodLength < .115, 'No stretched rod during extraction at ' + step / 100);
      const rod = electronics.group.getObjectByName(control.servo + ' steel pushrod');
      const low = new THREE.Vector3(0, -.5, 0).applyMatrix4(rod.matrix), high = new THREE.Vector3(0, .5, 0).applyMatrix4(rod.matrix);
      const error = Math.max(low.distanceTo(vector(control.outputPin)), high.distanceTo(vector(control.controlPin)));
      maxEndpointError = Math.max(maxEndpointError, error);
      assert.ok(error < 1e-10, 'Pushrod stays pinned to horn endpoints');
    }
  }
  flight.setProgress(.65);
  const matrices = electronicsObjects.map(object => object.matrixWorld.elements.slice());
  const linkageState = electronics.inspect().controls;
  for (const progress of [0, 1, .43, .7, .15, .92, .52, 0, .65]) flight.setProgress(progress);
  electronicsObjects.forEach((object, index) => assert.deepEqual(object.matrixWorld.elements, matrices[index], 'Exact reversible electronics transforms'));
  assert.deepEqual(electronics.inspect().controls, linkageState, 'Exact reversible linkage diagnostics');
  buffers.forEach(({ attribute, array }) => { assert.equal(attribute.array, array, 'Retain preallocated geometry buffers'); for (const value of array) assert.ok(Number.isFinite(value), 'Finite control geometry'); });
  sourceBuffers.forEach(({ attribute, array, bytes }) => {
    assert.equal(attribute.array, array, 'Source CAD buffers retained');
    assert.equal(Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64'), bytes, 'Source CAD byte-identical');
  });
  flight.setProgress(0); assert.ok(electronics.assemblyError() < 1e-12, 'All servos return to fitted positions and orientations');
  const report = { result: 'PASS', sourceObjects: sourceObjects.length, controls: fitted, maxRodLength, maxEndpointError, preservedSourceBuffers: sourceBuffers.length, fixedElectronicsBuffers: buffers.length };
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

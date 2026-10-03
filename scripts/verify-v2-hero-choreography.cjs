/* Hero choreography preserves CAD and framing while remaining reversible. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../assets/vendor/three.min.js');
const window = { THREE: T };
for (const file of ['v2-assembly-models.js', 'v2-hero-motion.js']) {
  vm.runInNewContext(fs.readFileSync(require.resolve(`../assets/${file}`), 'utf8'), { window });
}
const refs = ['P1', 'J1', 'U1', 'U5', 'Q1', 'SW1', 'R1', 'R2', 'C1', 'C2', 'C3', 'LED bank LED1', 'LED bank LED70', 'Back passives R20'];
const geometry = new T.BoxGeometry(.06, .035, .04);
const material = new T.MeshStandardMaterial({ color: 0x202525 });
function makeParts(order = refs) {
  return order.map(ref => {
    const index = refs.indexOf(ref);
    const object = new T.Group(); object.name = ref;
    object.add(new T.Mesh(geometry, material));
    if (/bank|passives/.test(ref)) object.userData.componentRefs = ['C10', 'C11'];
    const base = new T.Vector3((index % 4 - 1.5) * .20, ref.startsWith('Back') ? -.035 : .014, (Math.floor(index / 4) - 1.5) * .23);
    object.position.copy(base);
    object.quaternion.setFromEuler(new T.Euler(.02, index * .11, -.03));
    return { ref, object, base, offset: new T.Vector3(ref === 'P1' ? 0 : .02, ref.startsWith('Back') ? -.13 : /^U/.test(ref) ? .24 : .13, ref === 'P1' ? -.25 : .016) };
  });
}
const parts = makeParts();
const pose = list => list.map(part => [...part.object.position.toArray(), ...part.object.quaternion.toArray()]);
const initial = pose(parts);
const vertices = [...geometry.attributes.position.array];
window.V2CadGeometry.prepareMotion(parts);
const standaloneMotion = parts.map(part => part.motion);
const standaloneSerialized = JSON.stringify(standaloneMotion);
window.V2HeroMotion.prepare(parts, { name: 'verification' });
const descriptors = parts.map(part => part.heroMotion);
window.V2HeroMotion.prepare(parts);
assert.ok(parts.every((part, index) => part.heroMotion === descriptors[index]), 'Preparing twice must preserve original poses');

let observedClearance = false, observedCurve = false, maximumExtra = 0;
const starts = new Map();
const previous = new Map();
for (let sample = 0; sample <= 1000; sample++) {
  const phase = sample / 1000;
  window.V2HeroMotion.apply(parts, phase);
  for (const part of parts) {
    const movement = part.object.position.clone().sub(part.base);
    const target = part.motion.offset;
    if (movement.length() > 1e-6 && !starts.has(part.ref)) starts.set(part.ref, phase);
    assert.ok([...part.object.position.toArray(), ...part.object.quaternion.toArray()].every(Number.isFinite), 'Every sampled transform must stay finite');
    assert.ok(movement.y * target.y >= 0, 'Top and underside components must clear their own board face');
    assert.ok(Math.abs(movement.y) <= Math.abs(target.y) + 1e-12, 'Vertical clearance must remain inside the existing camera envelope');
    const extra = Math.max(Math.abs(movement.x) - Math.abs(target.x), Math.abs(movement.z) - Math.abs(target.z), 0);
    maximumExtra = Math.max(maximumExtra, extra);
    assert.ok(extra <= .012 + 1e-12, 'The curved path must add no more than 1.2% of the board span');
    if (Math.abs(movement.y) > .001 && Math.hypot(movement.x, movement.z) < 1e-12) {
      observedClearance = true;
      assert.ok(part.object.quaternion.angleTo(part.motion.baseQuaternion) < 1e-7, 'Parts must clear the board before they rotate');
    }
    if (Math.abs(movement.x * target.z - movement.z * target.x) > .00005) observedCurve = true;
    assert.ok(part.object.quaternion.angleTo(part.motion.baseQuaternion) < .23, 'Tilts must keep the hardware recognizable');
    const prior = previous.get(part.ref);
    if (prior) {
      assert.ok(part.object.position.distanceTo(prior.position) < .003, 'Clearance, drift and settle boundaries must be continuous');
      assert.ok(part.object.quaternion.angleTo(prior.quaternion) < .003, 'Orientation must not snap between phases');
    }
    previous.set(part.ref, { position: part.object.position.clone(), quaternion: part.object.quaternion.clone() });
  }
}
assert.ok(observedClearance, 'There must be a distinct normal-clearance phase');
assert.ok(observedCurve, 'Intermediate travel must have a curved path rather than a uniform straight lift');
assert.ok(starts.get('P1') < starts.get('LED bank LED1'), 'Connector clearance must lead the small-component wave');
assert.ok(new Set(['C1', 'C2', 'C3'].map(ref => starts.get(ref))).size === 3, 'Same-family parts must have independently timed starts');

window.V2HeroMotion.apply(parts, 1);
const exploded = pose(parts);
for (const part of parts) {
  assert.ok(part.object.position.distanceTo(part.base.clone().add(part.motion.offset)) < 1e-14, 'The exploded endpoint must preserve established framing');
}
window.V2HeroMotion.apply(parts, 1.5);
assert.deepEqual(pose(parts), exploded, 'The final pose must settle and clamp instead of drifting');
const checkpoints = [.071, .193, .348, .513, .779, .953].map(phase => {
  window.V2HeroMotion.apply(parts, phase);
  return [phase, pose(parts)];
});
for (const [phase, expected] of checkpoints.reverse()) {
  window.V2HeroMotion.apply(parts, phase);
  assert.deepEqual(pose(parts), expected, 'Reverse scrubbing must reconstruct the exact sampled pose');
}
for (let cycle = 0; cycle < 30; cycle++) {
  for (const phase of [0, .82, .27, 1, .63, .04]) window.V2HeroMotion.apply(parts, phase);
}
window.V2HeroMotion.apply(parts, 0);
assert.deepEqual(pose(parts), initial, 'Repeated assembly must recover exact positions and orientations');
window.V2HeroMotion.apply(parts, NaN);
assert.deepEqual(pose(parts), initial, 'An invalid phase must never contaminate model transforms');
assert.ok(parts.every((part, index) => part.motion === standaloneMotion[index]), 'Standalone descriptors must not be replaced');
assert.equal(JSON.stringify(standaloneMotion), standaloneSerialized, 'Standalone motion must not be changed');
assert.deepEqual([...geometry.attributes.position.array], vertices, 'CAD vertex detail must remain intact');
assert.ok(parts.every(part => part.object.children[0].geometry === geometry && part.object.children[0].material === material), 'Geometry and materials must not be swapped');

const reordered = makeParts([...refs].reverse());
window.V2CadGeometry.prepareMotion(reordered);
window.V2HeroMotion.prepare(reordered);
window.V2HeroMotion.apply(parts, .57);
window.V2HeroMotion.apply(reordered, .57);
const byRef = new Map(parts.map(part => [part.ref, pose([part])[0]]));
for (const part of reordered) assert.deepEqual(pose([part])[0], byRef.get(part.ref), 'Reference timing must be independent of loading or array order');

console.log(`PASS hero clearance, family stagger, curved paths, restrained settling, exact reverse poses, unchanged CAD and standalone motion; maximum sampled extra lateral travel ${maximumExtra.toFixed(6)} board spans, zero endpoint displacement change`);

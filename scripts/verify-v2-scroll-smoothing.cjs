/* Renderer-free tests of the actual shared easing function.
 * Browser input/lifecycle evidence lives in verify-v2-wheel.cjs. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const easing = require('../assets/v2-scroll-smoothing.js');
const near = (actual, expected, message, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
assert.equal(easing.epsilon, .00008);
assert.equal(easing.jump, .18);
assert.equal(easing.step(.3, .7, 0), .3, 'No time produces no motion');
assert.equal(easing.step(.3, .7, -1), .3, 'Negative elapsed time cannot reverse motion');
assert.equal(easing.step(.3, .7, 1000), .7, 'Long visible frames catch up without inventing a capped-time tail');
assert.equal(easing.step(.7, .3, 3000), .3, 'A multi-second visible frame remains bounded and settles exactly');
assert.equal(easing.step(.7, .7, 16), .7, 'A settled value remains exactly settled');
const reports = [];
for (const hz of [30, 60, 120]) {
  const dt = 1000 / hz;
  let current = .2;
  for (let index = 0; index < hz / 5; index++) {
    const previous = current;
    current = easing.step(current, .8, dt);
    assert.ok(current > previous && current < .8, `Forward easing is bounded at ${hz} Hz`);
  }
  const after200ms = current;
  near(current, .8 - .6 * Math.exp(-200 / 70), `Equal elapsed time has equal displacement at ${hz} Hz`);
  const beforeReversal = current;
  current = easing.step(current, .1, dt);
  assert.ok(current < beforeReversal && current > .1, `A reversal responds on its first frame at ${hz} Hz`);
  let settlingMs = dt;
  while (current !== .1 && settlingMs < 2000) { current = easing.step(current, .1, dt); settlingMs += dt; }
  assert.equal(current, .1, `Reverse motion settles to the exact target at ${hz} Hz`);
  assert.ok(settlingMs < 800, `No long easing tail at ${hz} Hz`);
  for (const target of [1, 0, 1, 0]) {
    for (let index = 0; current !== target && index < hz * 2; index++) {
      const previous = current; current = easing.step(current, target, dt);
      assert.ok(current >= Math.min(previous, target) && current <= Math.max(previous, target), 'Repeated endpoints never overshoot');
    }
    assert.equal(current, target, `Endpoint ${target} is exact at ${hz} Hz`);
  }
  reports.push({ hz, after200ms, reversalSettlingMs: settlingMs });
}
for (let index = 1; index < reports.length; index++) near(reports[index].after200ms, reports[0].after200ms, 'Refresh-rate independence');
// Different legal frame schedules with the same elapsed duration must agree.
let irregular = .13;
for (const dt of [7, 13, 45, 5, 30, 40, 60]) irregular = easing.step(irregular, .91, dt);
near(irregular, .91 - .78 * Math.exp(-200 / 70), 'Variable frame intervals use elapsed time');
// Slow visible rendering must retain the same time constant instead of adding
// another long easing tail when a software WebGL frame takes 150-250ms.
for (const schedule of [[150], [200], [250], [150, 50], [200, 50], [125, 125]]) {
  let value = .2;
  for (const elapsed of schedule) value = easing.step(value, .8, elapsed);
  near(value, .8 - .6 * Math.exp(-schedule.reduce((sum, elapsed) => sum + elapsed, 0) / 70), 'Slow visible frame schedule ' + schedule.join('+') + 'ms');
}
assert.ok((easing.step(0, 1, 200) - 0) > .94, 'A 200ms visible frame advances over 94% of the remaining distance');
// Verify the same browser global API, not a separate test-only implementation.
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/v2-scroll-smoothing.js'), 'utf8'), context);
for (const dt of [0, 8.3333, 16.6667, 33.3333, 100, 150, 200, 250]) near(context.window.V2ScrollSmoothing.step(.2, .9, dt), easing.step(.2, .9, dt), 'Browser and CommonJS exports agree');
const v2 = fs.readFileSync(path.join(root, 'v2/index.html'), 'utf8');
const v3 = fs.readFileSync(path.join(root, 'v3/index.html'), 'utf8');
assert.match(v2, /data-aircraft-hero[^>]*data-aircraft-smooth/);
assert.ok(v2.indexOf('/assets/v2-scroll-smoothing.js') < v2.indexOf('/assets/v3-aircraft-hero.js'), 'Easing loads before its opted-in controller');
assert.doesNotMatch(v3, /data-aircraft-smooth|v2-scroll-smoothing\.js/, 'Accepted v3 does not opt into v2 easing');
console.log('PASS time-based easing at 30/60/120 Hz, irregular/150-250ms frames, reversals, exact endpoints, bounded resume and v2-only opt-in.');
console.log(JSON.stringify({ passed: true, reports }, null, 2));

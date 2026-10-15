/* Node-only WebAssembly checks; no browser automation is used here. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const filename = path.join(__dirname, '../../assets/kiku/firmware-ui.wasm');
(async () => {
  const {instance} = await WebAssembly.instantiate(fs.readFileSync(filename));
  const api = instance.exports;
  const value = field => api.sim_value(field);
  const frame = () => Buffer.from(new Uint8Array(api.memory.buffer, api.sim_pixels(), 320 * 240 * 2));
  const digest = () => crypto.createHash('sha256').update(frame()).digest('hex');
  const act = (action, delta = 0) => api.sim_event(action, delta);
  api.sim_init();
  assert.equal(value(0), 0); assert.equal(value(1), 0);
  const hashes = new Set();
  for (let theme = 0; theme < 10; ++theme) {
    api.sim_theme(theme); hashes.add(digest());
    assert.equal(value(1), theme);
    const text = new Uint8Array(api.memory.buffer, api.sim_text(0), 5);
    assert.equal(Buffer.from(text).toString(), 'Home.');
  }
  assert.equal(hashes.size, 10, 'Each Home look must produce a distinct frame');
  api.sim_theme(999); assert.equal(value(1), 9, 'Reject invalid themes');
  api.sim_init(); act(1); assert.equal(value(0), 2); assert.equal(value(4), 1);
  act(1); assert.equal(value(4), 0); act(4); assert.equal(value(12), 1); assert.equal(value(4), 1);
  act(0, 100); assert.equal(value(3), 100); act(0, -100); assert.equal(value(3), 0);
  act(5); assert.equal(value(0), 0); act(0, 1); act(1); assert.equal(value(0), 4); assert.equal(value(7), 1);
  const beforeTune = value(6); act(0, 1); assert.equal(value(6), beforeTune + 10);
  act(1); assert.equal(value(7), 0); act(0, 1); assert.equal(value(3), 2);
  act(4); assert.equal(value(6), 10610); act(5); assert.equal(value(2), 1);
  act(0, 1); act(1); assert.equal(value(0), 5); assert.equal(value(9), 0);
  act(6); assert.equal(value(9), 0, 'Pairing request must not invent a real connection');
  api.sim_phone(1); assert.equal(value(9), 1); act(4); assert.equal(value(12), 2);
  act(5); assert.equal(value(2), 2); act(0, 1); act(1); assert.equal(value(0), 6);
  act(0, -1); assert.equal(value(8), 3, 'Output applies on encoder rotation');
  act(3); act(0, 2); act(1); assert.equal(value(0), 7);
  act(1); assert.equal(value(11), 1); act(0, 2); act(1); assert.equal(value(1), 1);
  act(0, -1); act(1); assert.equal(value(0), 8); act(3); assert.equal(value(0), 7); assert.equal(value(2), 1);
  act(2); assert.equal(value(10), 1); act(1); assert.equal(value(10), 1); act(2); assert.equal(value(10), 0);
  // Exercise every accessible destination for every palette. Unchanged state
  // must preserve the frame, including after partial redraws.
  for (let theme = 0; theme < 10; ++theme) {
    for (let destination = 0; destination < 5; ++destination) {
      api.sim_init(); api.sim_theme(theme); act(0, destination); act(1);
      const before = digest(); api.sim_theme(theme); assert.equal(digest(), before);
      assert.notEqual(frame().findIndex(byte => byte !== 0), -1);
    }
  }
  console.log('PASS: actual renderer, 10 looks, source/menu controls, FM tuning, simulated Bluetooth events, routing and soft power.');
})().catch(error => { console.error(error); process.exitCode = 1; });

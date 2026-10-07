/* Verify the deployed transport using only Node and the deployed decoder.
 * No encoder, CAD tools, npm installation or WebGL context is required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'assets/models/aircraft/skylabs-trainer');
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
const decoder = require(path.join(root, manifest.transport.decoder));
function readGLB(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  assert.equal(bytes.toString('ascii', 24 + length, 28 + length), 'BIN\0');
  return { json: JSON.parse(bytes.subarray(20, 20 + length)), binary: bytes.subarray(28 + length) };
}
(async () => {
  await decoder.ready;
  const original = readGLB(fs.readFileSync(path.join(folder, manifest.model)));
  const packed = readGLB(zlib.gunzipSync(fs.readFileSync(path.join(folder, manifest.transport.compressedModel))));
  for (const key of ['nodes', 'meshes', 'materials', 'accessors', 'scenes', 'scene']) {
    // JSON serialization normalizes -0 in scalar metadata. Geometry buffers
    // are checked byte-for-byte below, including any signed zero components.
    const canonical = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
    assert.deepEqual(canonical(packed.json[key]), canonical(original.json[key]), `Preserved ${key}`);
  }
  assert.equal(packed.json.bufferViews.length, original.json.bufferViews.length);
  let verifiedBytes = 0;
  original.json.bufferViews.forEach((view, index) => {
    const compressed = packed.json.bufferViews[index].extensions.EXT_meshopt_compression;
    assert.equal(compressed.buffer, 0);
    assert.equal(compressed.filter, 'NONE');
    assert.ok(['ATTRIBUTES', 'INDICES'].includes(compressed.mode));
    const encoded = packed.binary.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
    const decoded = new Uint8Array(compressed.count * compressed.byteStride);
    decoder.decodeGltfBuffer(decoded, compressed.count, compressed.byteStride, encoded, compressed.mode, compressed.filter);
    assert.equal(decoded.byteLength, view.byteLength);
    const source = original.binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    assert.ok(Buffer.from(decoded).equals(source), `Exact source bytes in buffer ${index}`);
    verifiedBytes += source.byteLength;
  });
  console.log(`Aircraft transport passed: ${original.json.bufferViews.length} buffers, ${verifiedBytes} decoded bytes identical; scene hierarchy, materials and transforms preserved.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

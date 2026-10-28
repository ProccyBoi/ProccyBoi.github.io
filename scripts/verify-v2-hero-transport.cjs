/* Lossless binary transport tests. No browser/GPU or timing claims: these run
 * production decoders against every committed pack, split network streams,
 * shared index ranges, original-file fallback and actual decompression errors. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const repo = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(repo, file), 'utf8');
const bufferOf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function runtime({response, file = 'assets/v2-hero-assets.js', native = true, Decoder = DecompressionStream} = {}) {
  const requests = [], settled = [];
  const context = {TextDecoder, DataView, Uint8Array, performance, setTimeout, ReadableStream, Response, Blob,
    Image: class {set src(value) {queueMicrotask(() => this.onload());}},
    V2TransportPriority: {wait: () => undefined, settle: (name, error) => settled.push({name, error})},
    fetch: url => {requests.push(url); return Promise.resolve(response);}};
  if (native) context.DecompressionStream = Decoder;
  context.window = context;
  let code = source(file);
  if (file.endsWith('assets.js')) {
    const exportLine = 'window.V2HeroAssets = Object.freeze({prefetch, load, whenTransferSettled});';
    assert.ok(code.includes(exportLine));
    // Expose the production functions only in this isolated test context.
    code = code.replace(exportLine, exportLine + '\nglobalThis.inspectTransport=transport; globalThis.inspectHeader=header;');
  }
  vm.runInNewContext(code, context);
  return {context, requests, settled};
}
function fixture() {
  const data = {version:1, textures:[], extra:{value:{$negativeZero:true}}, geometries:[
    {index:{arrayType:'Uint16Array',byteOffset:0,byteLength:8}},
    {index:{arrayType:'Uint16Array',byteOffset:0,byteLength:8}},
    {index:{arrayType:'Uint32Array',byteOffset:8,byteLength:12}}]};
  const json = Buffer.from(JSON.stringify(data)), start = Math.ceil((16+json.length)/4)*4;
  const raw = Buffer.alloc(start+20); raw.write('V2HERO1'); raw.writeUInt32LE(json.length,8); raw.writeUInt32LE(start,12); json.copy(raw,16);
  [0,1,257,65535].forEach((value,i) => raw.writeUInt16LE(value,start+i*2));
  [1,70000,0xffffffff].forEach((value,i) => raw.writeUInt32LE(value,start+8+i*4));
  const packed = Buffer.alloc(raw.length+16); packed.write('V2HIDX1'); packed.writeUInt32LE(raw.length,8); raw.copy(packed,16);
  for (const [offset,count,width] of [[0,4,2],[8,3,4]]) for (let i=0;i<count;i++) for (let byte=0;byte<width;byte++) {
    packed[16+start+offset+byte*count+i] = raw[start+offset+i*width+byte];
  }
  return {raw, packed};
}
(async () => {
  const inspector = runtime().context;
  let originalBytes = 0, indexCopyBytes = 0;
  for (const name of ['tramtrace','dash','pi','telemetry']) {
    const directory = path.join(repo,'assets/models/hero');
    const original = fs.readFileSync(path.join(directory,name+'.bin'));
    const packed = bufferOf(zlib.gunzipSync(fs.readFileSync(path.join(directory,name+'.idx.bin.gz'))));
    const restored = await inspector.inspectTransport(packed);
    assert.strictEqual(restored.buffer, packed, name+' must not copy the full inflated pack');
    assert.deepEqual(Buffer.from(restored.buffer,16), original, name+' must restore every original byte exactly');
    assert.equal(restored.dataStart, original.readUInt32LE(12)+16);
    const seen = new Set();
    for (const {index} of restored.data.geometries) if (!seen.has(index.byteOffset)) {seen.add(index.byteOffset);indexCopyBytes+=index.byteLength;}
    originalBytes += original.length;
    const plain = bufferOf(original);
    assert.strictEqual((await inspector.inspectTransport(plain)).buffer, plain, 'Original .bin fallback stays zero-copy');
  }
  const {raw,packed} = fixture(), restored = await inspector.inspectTransport(bufferOf(packed));
  assert.deepEqual(Buffer.from(restored.buffer,16),raw,'Shared index bytes restore exactly once, for 16- and 32-bit ranges');
  assert.ok(Object.is(restored.data.extra.value,-0),'Tagged negative zero retains its exact numeric value');

  for (const file of ['assets/v2-hero-assets.js','assets/v2-hero-environment.js']) {
    const isModel = file.includes('assets.js'), bytes = isModel ? raw : Buffer.from('environment transport parity');
    const compressed = zlib.gzipSync(bytes), decoding = deferred();
    let feed;
    const body = new ReadableStream({start(controller) {feed=controller;controller.enqueue(compressed.subarray(0,1));}});
    class ObservedDecoder extends DecompressionStream {constructor(format) {super(format);decoding.resolve();}}
    const live = runtime({file,Decoder:ObservedDecoder,response:{ok:true,body,arrayBuffer() {throw new Error('Must stream the body');}}});
    const ready = isModel ? live.context.V2HeroAssets.prefetch('telemetry') : live.context.V2HeroEnvironment.prefetch();
    feed.enqueue(compressed.subarray(1,Math.max(2,compressed.length>>1)));
    await decoding.promise;
    assert.equal(live.settled.length,0,'Native inflation starts before the last network chunk arrives');
    feed.enqueue(compressed.subarray(Math.max(2,compressed.length>>1)));feed.close();
    assert.deepEqual(Buffer.from(await ready),bytes);
    assert.equal(live.settled.length,1,'Raw transfer completion is reported once');
    assert.equal(live.settled[0].error,undefined);

    for (const native of [true,false]) {
      // HTTP may already decompress .gz. Native support must never cause a
      // second decompression pass; older browsers receive the original file.
      const plain = runtime({file,native,response:new Response(bytes)});
      const loaded = isModel ? plain.context.V2HeroAssets.prefetch('tramtrace') : plain.context.V2HeroEnvironment.prefetch();
      assert.deepEqual(Buffer.from(await loaded),bytes);
      assert.equal(plain.requests[0].includes('.gz'),native);
    }
    const broken = runtime({file,response:new Response(compressed.subarray(0,compressed.length>>1))});
    await assert.rejects(isModel ? broken.context.V2HeroAssets.prefetch('telemetry') : broken.context.V2HeroEnvironment.prefetch(),undefined,'Truncated gzip must remain an error, not partial CAD');
    assert.ok(broken.settled.length,'Transfer failure cannot starve other resources');
    const unavailable = runtime({file,response:new Response(null,{status:404})});
    await assert.rejects(isModel ? unavailable.context.V2HeroAssets.prefetch('telemetry') : unavailable.context.V2HeroEnvironment.prefetch(),/unavailable/);
  }
  console.log(`PASS: all 4 packs byte-identical; full-pack copies avoided (${originalBytes} B vs ${indexCopyBytes} B index copies); duplicate ranges, exact -0, streaming before EOF, decoded HTTP, native fallback and errors.`);
})().catch(error => {console.error(error);process.exitCode=1;});

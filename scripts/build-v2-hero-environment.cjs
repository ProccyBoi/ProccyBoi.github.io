/* Bake the hero's current PMREM studio environment in its native RGBE bytes.
 * No texture resizing, encoding conversion, or quantization occurs.
 * --verify compares committed bytes and actual CAD renders with a fresh PMREM.
 * Requires the local site on V2_BASE_URL (default http://127.0.0.1:8080).
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets/models/hero');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const verify = process.argv.includes('--verify');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHash = file => hash(Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));

// Keep this physical light setup identical to the recovery path in v2-assembly.
function createSourceEnvironment(T, renderer) {
  const room = new T.Scene(); room.background = new T.Color(0xb6c0c2);
  [[0xffffff, 4, [-7, 5, 1], [0, Math.PI/2, 0]], [0xffffff, 3, [0, 8, 0], [Math.PI/2, 0, 0]], [0xd9e6f3, 2, [7, 0, 0], [0, -Math.PI/2, 0]]].forEach(([color, power, position, rotation]) => {
    const material = new T.MeshBasicMaterial({color, side:T.DoubleSide}); material.color.multiplyScalar(power);
    const panel = new T.Mesh(new T.PlaneGeometry(8, 12), material); panel.position.set(...position); panel.rotation.set(...rotation); room.add(panel);
  });
  const pmrem = new T.PMREMGenerator(renderer), environment = pmrem.fromScene(room, .06);
  pmrem.dispose(); room.traverse(object => {object.geometry?.dispose(); object.material?.dispose();});
  return environment;
}

function encode(capture) {
  const pixels = Buffer.from(capture.pixels, 'base64');
  const header = Buffer.from(JSON.stringify({...capture, pixels:undefined}));
  const padded = Buffer.alloc(Math.ceil(header.length / 4) * 4); header.copy(padded);
  const prefix = Buffer.alloc(16); prefix.write('V2HENV1'); prefix.writeUInt32LE(header.length, 8); prefix.writeUInt32LE(16 + padded.length, 12);
  return Buffer.concat([prefix, padded, pixels]);
}

async function main() {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:960, height:720}});
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {if (message.type() === 'error') failures.push(message.text());});
    await page.route(base + '/v2/environment-build/', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Hero environment build</title>'}));
    await page.goto(base + '/v2/environment-build/', {waitUntil:'domcontentloaded'});
    for (const url of ['/assets/vendor/three.min.js', '/assets/v2-hero-assets.js', '/assets/v2-hero-motion.js', '/assets/v2-hero-environment.js']) await page.addScriptTag({url:base + url});
    await page.evaluate('window.__createSourceEnvironment = ' + createSourceEnvironment.toString());
    const capture = await page.evaluate(() => {
      const T = THREE, renderer = window.__renderer = new T.WebGLRenderer({antialias:true, alpha:true});
      renderer.setSize(960, 720); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .98;
      const source = window.__sourceEnvironment = window.__createSourceEnvironment(T, renderer), texture = source.texture;
      if (texture.type !== T.UnsignedByteType || texture.format !== T.RGBAFormat || texture.encoding !== T.RGBEEncoding) throw new Error('Source texture type changed; update the lossless baker');
      const data = new Uint8Array(source.width * source.height * 4);
      renderer.readRenderTargetPixels(source, 0, 0, source.width, source.height, data);
      if (renderer.getContext().getError()) throw new Error('Environment texel readback failed');
      let binary = ''; for (let i = 0; i < data.length; i += 16384) binary += String.fromCharCode(...data.subarray(i, i + 16384));
      return {version:1, threeRevision:T.REVISION, width:source.width, height:source.height, arrayType:'Uint8Array',
        ...Object.fromEntries(['type', 'format', 'encoding', 'mapping', 'minFilter', 'magFilter', 'wrapS', 'wrapT', 'generateMipmaps'].map(key => [key, texture[key]])), pixels:btoa(binary)};
    });
    const bytes = encode(capture), filepath = path.join(out, 'environment.bin');
    if (!verify) {fs.writeFileSync(filepath, bytes); fs.writeFileSync(filepath + '.gz', zlib.gzipSync(bytes, {level:9}));}
    assert.deepEqual(fs.readFileSync(filepath), bytes, 'Committed environment must preserve every original PMREM texel byte');
    assert.deepEqual(zlib.gunzipSync(fs.readFileSync(filepath + '.gz')), bytes, 'Compressed environment must reconstruct identical bytes');
    const result = await page.evaluate(async () => {
      const T = THREE, renderer = window.__renderer, restored = await V2HeroEnvironment.load(T);
      const scene = new T.Scene(), camera = new T.OrthographicCamera(-1.25, 1.25, .94, -.94, .1, 20); camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
      scene.add(new T.HemisphereLight(0xffffff, 0xc4cfce, .6));
      [[0xfff8ed, 1.4, -4, 8, 12], [0xd3e5ff, .9, 8, 3, 5], [0xffffff, .5, -8, -4, 6]].forEach(([color, intensity, x, y, z]) => {const lamp = new T.DirectionalLight(color, intensity); lamp.position.set(x, y, z); scene.add(lamp);});
      const target = new T.WebGLRenderTarget(960, 720), original = new Uint8Array(960 * 720 * 4), copied = new Uint8Array(original.length), models = [];
      // Compare each complete CAD assembly, assembled and exploded, using both
      // environments in the same renderer to isolate texture equivalence.
      for (const name of ['tramtrace', 'telemetry', 'pi']) {
        const model = await V2HeroAssets.load(name); V2HeroMotion.prepare(model.parts); model.group.rotation.set(.88, -.18, -.2); scene.add(model.group);
        for (const phase of [0, 1]) {
          V2HeroMotion.apply(model.parts, phase);
          scene.environment = window.__sourceEnvironment.texture; renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 960, 720, original);
          scene.environment = restored; renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 960, 720, copied);
          let changed = 0, maximum = 0, colored = 0;
          for (let i = 0; i < original.length; i++) {const difference = Math.abs(original[i] - copied[i]); if (difference) changed++; maximum = Math.max(maximum, difference); if (i % 4 === 3 && original[i]) colored++;}
          models.push({name, phase, changedChannels:changed, maximumChannelDifference:maximum, renderedPixels:colored});
        }
        scene.remove(model.group); model.group.traverse(object => {object.geometry?.dispose();});
      }
      target.dispose(); restored.dispose(); window.__sourceEnvironment.dispose(); renderer.dispose();
      return {renders:models};
    });
    for (const render of result.renders) {
      assert(render.renderedPixels > 1000, render.name + ' must render actual CAD');
      assert.equal(render.changedChannels, 0, render.name + ' environment must produce identical rendered channels');
    }
    assert.deepEqual(failures, [], 'Environment bake must not emit browser errors');
    const report = {format:1, sourceHashNormalization:'utf8-lf', preservation:'Every native RGBE PMREM texel byte; identical CAD render pixels before and after baking',
      url:'/assets/models/hero/environment.bin', compressedUrl:'/assets/models/hero/environment.bin.gz', bytes:bytes.length, gzipBytes:fs.statSync(filepath + '.gz').size,
      sha256:hash(bytes), sourceBuilderSha256:hash(Buffer.from(createSourceEnvironment.toString().replace(/\r\n/g, '\n'))),
      builderFileSha256:sourceHash(__filename), threeSha256:sourceHash(path.join(root, 'assets/vendor/three.min.js')),
      width:capture.width, height:capture.height, type:'UnsignedByteType', encoding:'RGBEEncoding', mapping:'CubeUVReflectionMapping', ...result};
    if (!verify) fs.writeFileSync(path.join(out, 'environment.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});

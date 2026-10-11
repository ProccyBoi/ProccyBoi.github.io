#!/usr/bin/env node
/* Render the existing Dual USB-C assembly without changing its source geometry,
 * materials, enclosure or screws. Requires Playwright 1.57 and Python/Pillow.
 * Candidates only: this script never writes to production assets or HTML.
 * Serve the repository on V2_BASE_URL (default http://127.0.0.1:8080).
 * Run --check to validate the capture fixture without launching a browser. */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..');
const output = path.resolve(process.env.FRAMEWORK_COLLECTION_OUT || '/tmp/framework-collection');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const width = 1600;
const height = 1200;
const basename = 'framework-dual-usb-cad';
const sourcePaths = [
  'v2/projects/framework-dual-usb/index.html',
  'assets/framework-dual-usb-3d.js',
  'assets/explorer-runtime.js',
  'assets/vendor/three.min.js',
  'assets/vendor/GLTFLoader.js',
  'assets/models/framework-dual-usb/framework-dual-usb-silk.svg',
  'assets/models/framework-esp32/framework-usbc.glb',
  'assets/models/framework-esp32/framework-enclosure.stl'
];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sources = () => sourcePaths.map(file => {
  const bytes = fs.readFileSync(path.join(repository, file));
  assert.ok(bytes.length > 0, `Missing capture source: ${file}`);
  return { path: file, bytes: bytes.length, sha256: digest(bytes) };
});
const sourceHashes = sources();
const sourcePage = fs.readFileSync(path.join(repository, sourcePaths[0]), 'utf8');
const inspector = sourcePage.match(/<section\b[^>]*\bdata-dual-usb-inspector[^>]*>[\s\S]*?<\/section>/)?.[0];
assert.ok(inspector, 'The existing Dual USB-C inspector section must be present.');
for (const attribute of ['data-dual-usb-stage', 'data-dual-usb-canvas', 'data-dual-usb-status']) {
  assert.ok(inspector.includes(attribute), `Capture fixture is missing ${attribute}`);
}
const modelSource = fs.readFileSync(path.join(repository, sourcePaths[1]), 'utf8');
for (const file of sourcePaths.slice(5)) assert.ok(modelSource.includes(file), `Model no longer references ${file}`);
assert.ok(modelSource.includes('P1_Molex_105444_exact'), 'The source connector readiness contract changed.');
assert.ok(modelSource.includes('mechanicalRole'), 'The source mounting-hardware contract changed.');

// Reuse the actual case-study markup, isolated from page UI and page animation.
// The hook is installed before the first WebGL context is created. It captures
// references only; the production model file is loaded byte-for-byte unchanged.
const fixture = `<!doctype html><html><head><meta charset="utf-8"><base href="/">
<title>Framework Dual USB-C source CAD poster</title><link rel="icon" href="data:,">
<style>*{box-sizing:border-box}html,body,section,div{margin:0;padding:0;background:transparent}
[data-dual-usb-stage],canvas{display:block;width:${width}px;height:${height}px}
header,button,dl,p,aside{display:none!important}</style></head><body class="v2">${inspector}
<script src="/assets/vendor/three.min.js"></script>
<script src="/assets/vendor/GLTFLoader.js"></script>
<script src="/assets/explorer-runtime.js"></script>
<script>
window.__dualPoster = { frames: 0 };
const originalCreateRenderer = PortfolioExplorer.createRenderer;
PortfolioExplorer.createRenderer = function (THREE, options) {
  const renderer = originalCreateRenderer.call(this, THREE, {...options, preserveDrawingBuffer: true});
  if (!renderer) throw new Error('Transparent source CAD capture requires WebGL.');
  renderer.setClearColor(0x000000, 0);
  window.__dualPoster.renderer = renderer;
  const originalRender = renderer.render.bind(renderer);
  renderer.render = function (scene, camera) {
    window.__dualPoster.scene = scene;
    window.__dualPoster.camera = camera;
    window.__dualPoster.frames++;
    return originalRender(scene, camera);
  };
  return renderer;
};
</script><script src="/assets/framework-dual-usb-3d.js"></script></body></html>`;

// Encoding is deterministic conversion of the rendered RGBA pixels, not image
// synthesis, background removal, retouching or geometry substitution.
const encodeAndVerify = String.raw`
import hashlib, json, sys
from pathlib import Path
from PIL import Image, features

directory, basename = Path(sys.argv[1]), sys.argv[2]
assert features.check('webp'), 'Pillow requires WebP support'
png = directory / (basename + '.png')
with Image.open(png) as source:
    assert source.mode == 'RGBA', 'Capture must be RGBA'
    assert source.size == (1600, 1200), 'Unexpected poster dimensions'
    image = source.copy()
alpha = image.getchannel('A')
assert alpha.getextrema() == (0, 255), 'Capture must contain transparent background and opaque CAD'
bounds = alpha.getbbox()
assert bounds and bounds[0] >= 40 and bounds[1] >= 40 and bounds[2] <= 1560 and bounds[3] <= 1160, 'CAD is clipped or insufficiently padded'
histogram = alpha.histogram()
pixels = 1600 * 1200
visible = pixels - histogram[0]
assert 0.10 < visible / pixels < 0.80, 'Unexpected visible CAD occupancy'
assert histogram[255] / pixels > 0.05, 'Opaque PCB or components are missing'
assert sum(histogram[1:255]) > 100, 'Transparent enclosure and antialiased edges are missing'
assert bounds[2] - bounds[0] > 600 and bounds[3] - bounds[1] > 600, 'CAD capture is too small'
border = [alpha.crop((0,0,1600,1)), alpha.crop((0,1199,1600,1200)), alpha.crop((0,0,1,1200)), alpha.crop((1599,0,1600,1200))]
assert all(edge.getextrema() == (0,0) for edge in border), 'Canvas border must be completely transparent'
files = []
for suffix, options in [('.webp', {'quality': 90, 'method': 6}), ('.lossless.webp', {'lossless': True, 'method': 6, 'exact': True})]:
    candidate = directory / (basename + suffix)
    image.save(candidate, 'WEBP', **options)
    with Image.open(candidate) as encoded:
        encoded.load()
        assert encoded.mode == 'RGBA' and encoded.size == image.size
        assert encoded.getchannel('A').tobytes() == alpha.tobytes(), 'Encoding changed the exact CAD/enclosure alpha'
        if options.get('lossless'):
            # Encoders may discard invisible RGB at alpha=0; all visible source
            # pixels, including the translucent shell, must remain exact.
            original, result = image.tobytes(), encoded.tobytes()
            assert all(original[i:i+4] == result[i:i+4] for i in range(0,len(original),4) if original[i+3]), 'Lossless WebP changed visible CAD pixels'
    files.append({'file': candidate.name, 'bytes': candidate.stat().st_size, 'sha256': hashlib.sha256(candidate.read_bytes()).hexdigest(), 'encoding': options, 'alphaExact': True})
files.insert(0, {'file': png.name, 'bytes': png.stat().st_size, 'sha256': hashlib.sha256(png.read_bytes()).hexdigest(), 'encoding': 'original canvas RGBA PNG'})
print(json.dumps({'width':1600, 'height':1200, 'mode':'RGBA', 'alphaExtrema':[0,255], 'visibleBounds':list(bounds), 'visiblePixels':visible, 'visibleFraction':visible/pixels, 'opaquePixels':histogram[255], 'translucentPixels':sum(histogram[1:255]), 'transparentBorder':True, 'files':files}))
`;

async function main() {
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ checked: 'source files and unchanged-model fixture', sources: sourceHashes }, null, 2));
    return;
  }
  fs.mkdirSync(output, { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const errors = [];
    const failedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
    page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
    await page.route('**/__framework_dual_poster__', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto(new URL('/__framework_dual_poster__', base).href, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const scene = window.__dualPoster?.scene;
      if (!scene || !scene.getObjectByName('P1_Molex_105444_exact')) return false;
      let enclosure = false, silk = false, screwHeads = 0;
      scene.traverseVisible(object => {
        if (object.userData.partRef === 'Enclosure' && object.children.some(child => child.isMesh)) enclosure = true;
        if (object.isMesh && object.material?.map?.image?.src?.includes('framework-dual-usb-silk.svg')) silk = true;
        if (object.userData.mechanicalRole === 'screw-head') screwHeads++;
      });
      const root = document.querySelector('[data-dual-usb-inspector]');
      return enclosure && silk && screwHeads === 2 && root.dataset.explorerMotion === 'idle' && Number(root.dataset.explorerProgress) === 0;
    }, null, { timeout: 90000 });
    assert.deepEqual(errors, [], 'Source model raised browser errors.');
    assert.deepEqual(failedRequests, [], 'All source model assets must load successfully.');

    const capture = await page.evaluate(({ width, height }) => {
      const { renderer, scene } = window.__dualPoster;
      const T = window.THREE;
      const assembly = scene.children.find(object => object.isGroup);
      if (!assembly) throw new Error('Source assembly is missing.');
      assembly.updateMatrixWorld(true);
      const bounds = new T.Box3();
      const points = [];
      const refs = new Set();
      let meshes = 0, triangles = 0;
      assembly.traverseVisible(object => {
        if (object.userData.partRef) refs.add(object.userData.partRef);
        if (!object.isMesh) return;
        meshes++;
        const geometry = object.geometry;
        triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        for (let corner = 0; corner < 8; corner++) {
          const box = geometry.boundingBox;
          const point = new T.Vector3(corner & 1 ? box.max.x : box.min.x, corner & 2 ? box.max.y : box.min.y, corner & 4 ? box.max.z : box.min.z).applyMatrix4(object.matrixWorld);
          points.push(point);
          bounds.expandByPoint(point);
        }
      });
      // A fixed elevated three-quarter view makes the two downstream ports,
      // populated PCB and original transparent housing readable as one object.
      // Fit only the camera; the production assembly is never transformed.
      const yaw = T.MathUtils.degToRad(-27);
      const pitch = T.MathUtils.degToRad(58);
      const centre = bounds.getCenter(new T.Vector3());
      const direction = new T.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
      camera.position.copy(centre).addScaledVector(direction, 150);
      camera.lookAt(centre);
      camera.rotateZ(T.MathUtils.degToRad(-8));
      camera.updateMatrixWorld(true);
      const viewBounds = new T.Box3();
      points.forEach(point => viewBounds.expandByPoint(point.clone().applyMatrix4(camera.matrixWorldInverse)));
      const halfHeight = Math.max((viewBounds.max.y - viewBounds.min.y) / 2, (viewBounds.max.x - viewBounds.min.x) / 2 / (width / height)) * 1.12;
      const viewCentre = viewBounds.getCenter(new T.Vector3());
      camera.left = viewCentre.x - halfHeight * width / height;
      camera.right = viewCentre.x + halfHeight * width / height;
      camera.top = viewCentre.y + halfHeight;
      camera.bottom = viewCentre.y - halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      // Capture synchronously after a complete explicit frame, never from a
      // discarded browser framebuffer or a partially loaded demand-render frame.
      renderer.render(scene, camera);
      const png = renderer.domElement.toDataURL('image/png');
      const second = renderer.domElement.toDataURL('image/png');
      if (png !== second) throw new Error('Framebuffer changed during capture.');
      return {
        png,
        model: { meshes, triangles, parts: [...refs].sort(), assembledProgress: document.querySelector('[data-dual-usb-inspector]').dataset.explorerProgress, worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } },
        camera: { projection: 'orthographic', yawDegrees: -27, pitchDegrees: 58, rollDegrees: -8, fitPadding: 1.12, position: camera.position.toArray(), target: centre.toArray(), frustum: [camera.left, camera.right, camera.top, camera.bottom] },
        render: { threeRevision: T.REVISION, draws: renderer.info.render.calls, triangles: renderer.info.render.triangles, alpha: renderer.getContext().getContextAttributes().alpha, preserveDrawingBuffer: renderer.getContext().getContextAttributes().preserveDrawingBuffer, outputEncoding: renderer.outputEncoding, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure }
      };
    }, { width, height });
    assert.ok(capture.model.meshes > 100 && capture.model.triangles > 10000, 'Source assembly is incomplete.');
    for (const part of ['BOARD', 'P1', 'J1', 'J2', 'U3', 'Enclosure', 'M2-1', 'M2-2']) assert.ok(capture.model.parts.includes(part), `Missing source part ${part}`);
    assert.equal(capture.render.alpha, true);
    assert.equal(capture.render.preserveDrawingBuffer, true);
    assert.ok(capture.png.startsWith('data:image/png;base64,'));
    fs.writeFileSync(path.join(output, basename + '.png'), Buffer.from(capture.png.split(',')[1], 'base64'));
    delete capture.png;
    const pixels = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', encodeAndVerify, output, basename], { encoding: 'utf8' }));
    assert.deepEqual(sources(), sourceHashes, 'A source model or case-study file changed during capture.');
    const manifest = {
      schema: 1,
      subject: 'Framework Dual USB-C expansion card',
      method: 'Unchanged production viewer model in isolated source-markup fixture; direct transparent WebGL canvas export',
      geometry: 'Original KiCad-derived board and component layout, original source Molex GLB, original enclosure STL and original viewer mounting screws',
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
      renderer: { browser: browser.version(), playwright: require('playwright/package.json').version, backend: 'Chromium SwiftShader', script: 'scripts/render-framework-dual-poster.cjs', scriptSha256: digest(fs.readFileSync(__filename)) },
      sources: sourceHashes,
      sourceFilesUnchanged: true,
      ...capture,
      pixels,
      browserErrors: errors,
      failedRequests
    };
    fs.writeFileSync(path.join(output, basename + '.provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(manifest, null, 2));
    console.log(`Verified PNG and WebP candidates: ${output}`);
  } finally {
    await browser.close();
    assert.deepEqual(sources(), sourceHashes, 'Source files changed during capture.');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

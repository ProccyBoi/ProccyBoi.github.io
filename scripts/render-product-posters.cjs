/* Render the hero's real CAD with the same studio used by the interactive scene.
 * Source geometry is unchanged. The transparent WebP posters also serve reduced
 * motion and WebGL-failure visitors, so their finish must match the live models.
 * PRODUCT_POSTER_QUALITY defaults to 88; PRODUCT_POSTER_SCALE=2 optionally
 * supersamples offline. Native PNGs accompany WebP candidates for inspection.
 * Requires Playwright and sharp. Production images are never replaced here. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const sharp = require('sharp');
const base = process.env.V2_BASE_URL || 'http://127.0.0.1:8080';
const output = process.env.PRODUCT_POSTER_OUT || '.codex-temp/product-posters';
const quality = Number(process.env.PRODUCT_POSTER_QUALITY || 88);
const scale = Number(process.env.PRODUCT_POSTER_SCALE || 1);
assert.ok(quality >= 1 && quality <= 100 && Number.isInteger(quality));
assert.ok([1, 2].includes(scale), 'Use native size or 2x supersampling');
const targets = [
  ['tramtrace', 'tramtrace-cad.webp', [1.04, -.12, -.2]],
  ['telemetry', 'skylabs-telemetry.webp', [1.08, .28, -.24]],
  ['pi', 'framework-pi-cad.webp', [1.05, .22, .24]]
];
(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE, args:['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1200}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__product_posters', route => route.fulfill({contentType:'text/html', body:'<!doctype html><title>Product poster studio</title><body></body>'}));
    await page.goto(base + '/__product_posters');
    for (const file of ['vendor/three.min.js', 'v2-hero-assets.js', 'v2-hero-environment.js']) await page.addScriptTag({url:base + '/assets/' + file});
    const report = [];
    for (const [name, file, rotation] of targets) {
      const result = await page.evaluate(async ({name, rotation, scale}) => {
        const T = window.THREE, studio = window.V2ProductStudio;
        const renderer = new T.WebGLRenderer({alpha:true, antialias:scale===1, preserveDrawingBuffer:true});
        renderer.setSize(1600*scale,1200*scale); renderer.setPixelRatio(1); renderer.setClearColor(0x000000,0);
        studio.configureRenderer(renderer,T); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
        const scene = new T.Scene(), camera = new T.OrthographicCamera(-4,4,3,-3,.1,100);
        const {key} = studio.createLights(T,scene);
        scene.environment = await window.V2HeroEnvironment.load(T);
        const model = await window.V2HeroAssets.load(name); studio.applyMaterials(model,name,T);
        model.group.rotation.set(...rotation); model.group.scale.setScalar(6); scene.add(model.group);
        model.group.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(model.group), centre = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
        const halfHeight = Math.max(size.y/2,size.x/2/(4/3)) * 1.12;
        camera.left = -halfHeight*4/3; camera.right = halfHeight*4/3; camera.top = halfHeight; camera.bottom = -halfHeight;
        camera.position.copy(centre).add(new T.Vector3(0,0,20)); camera.lookAt(centre); camera.updateProjectionMatrix();
        key.target.position.copy(centre); key.position.copy(centre).addScaledVector(key.userData.direction,25);
        key.target.updateMatrixWorld(); key.updateMatrixWorld();
        const shadow = key.shadow.camera;
        shadow.position.copy(key.position); shadow.lookAt(centre); shadow.updateMatrixWorld();
        const lightBounds = new T.Box3();
        for (let i=0;i<8;i++) lightBounds.expandByPoint(new T.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(shadow.matrixWorldInverse));
        shadow.left=lightBounds.min.x-.18; shadow.right=lightBounds.max.x+.18;
        shadow.bottom=lightBounds.min.y-.18; shadow.top=lightBounds.max.y+.18;
        shadow.near=Math.max(.1,-lightBounds.max.z-.18); shadow.far=-lightBounds.min.z+.18; shadow.updateProjectionMatrix();
        renderer.render(scene,camera);
        const data = renderer.domElement.toDataURL('image/png');
        const draws = renderer.info.render.calls;
        const geometries = new Set(), materials = new Set();
        scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>materials.add(material));});
        geometries.forEach(geometry=>geometry.dispose()); materials.forEach(material=>material.dispose());
        scene.environment.dispose(); key.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss();
        return {data,draws};
      }, {name,rotation,scale});
      assert.ok(result.data.startsWith('data:image/png;base64,'));
      const source = Buffer.from(result.data.split(',')[1],'base64');
      const png = await sharp(source).resize(1600,1200,{kernel:'lanczos3'}).png().toBuffer();
      fs.writeFileSync(path.join(output,file.replace('.webp','.png')),png);
      const bytes = await sharp(png).webp({quality,alphaQuality:100,effort:6}).toBuffer();
      const alpha = await sharp(png).extractChannel('alpha').raw().toBuffer();
      const encodedAlpha = await sharp(bytes).extractChannel('alpha').raw().toBuffer();
      assert.deepEqual(encodedAlpha,alpha,'WebP must preserve the exact CAD silhouette and translucent housing alpha');
      fs.writeFileSync(path.join(output,file),bytes);
      report.push({name,file,width:1600,height:1200,bytes:bytes.length,pngBytes:png.length,quality,scale,alphaVerified:true,draws:result.draws});
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'capture.json'),JSON.stringify({renderer:'V2ProductStudio',models:'original prepared CAD',report},null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

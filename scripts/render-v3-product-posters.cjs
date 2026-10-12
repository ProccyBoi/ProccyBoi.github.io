#!/usr/bin/env node
/* Render v3-only light fallback assets from the unchanged production aircraft
 * and telemetry geometry. This capture task deliberately uses the existing
 * ?capture pose API. It is asset generation, not native-interaction acceptance.
 * Readback occurs immediately after the existing renderer's final scene draw;
 * files are saved only after that exact sequence is published by its GPU fence.
 * No extra renderer, altered light/material/geometry, timing or shadow quality.
 *
 * V3_PRODUCT_BASE_URL=http://127.0.0.1:8080
 * V3_PRODUCT_OUT=.codex-temp/v3-product-posters  (screenshots + manifest)
 * CHROMIUM_EXECUTABLE                         (optional)
 * Requires only Playwright Chromium. WebP encoding is native to the browser.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const base = (process.env.V3_PRODUCT_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const output = path.join(root, 'assets/images/v3-product');
const evidence = path.resolve(process.env.V3_PRODUCT_OUT || '.codex-temp/v3-product-posters');
const timeout = Number(process.env.V3_PRODUCT_TIMEOUT || 240000);
const manifest = {purpose:'Original production aircraft rendered on the v3 light surface', files:[], frames:[]};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const poses = [
  {name:'approach', type:'landing', value:0, poster:true},
  {name:'stopped', type:'progress', value:0, poster:true},
  {name:'unwrapping', type:'progress', value:.20},
  {name:'open', type:'progress', value:.43},
  {name:'telemetry', type:'progress', value:1}
];
async function anchor(page) {
  await page.evaluate(() => document.getElementById('skylabs-aircraft')?.scrollIntoView({behavior:'instant', block:'start'}));
}
async function settle(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-aircraft-hero]');
    return root.getAnimations({subtree:true}).every(animation => animation.effect?.getComputedTiming().iterations === Infinity || !['running','pending'].includes(animation.playState));
  }, null, {timeout});
}
async function capture(page, pose, suffix) {
  const before = await page.evaluate(pose => {
    const root = document.querySelector('[data-aircraft-hero]');
    const sequence = Number(root.dataset.aircraftSubmittedFrames || 0);
    window.__v3ProductPoster.request = pose.name;
    window.__v3ProductPoster.last = null;
    window.__v3Aircraft[pose.type === 'landing' ? 'seekLanding' : 'seekProgress'](pose.value);
    return sequence;
  }, pose);
  await page.waitForFunction(({pose,before}) => {
    const root = document.querySelector('[data-aircraft-hero]');
    const frame = JSON.parse(root.dataset.aircraftLastFrame || 'null');
    const capture = window.__v3ProductPoster.last;
    const matches = frame && frame.kind === pose.type && Math.abs((pose.type === 'landing' ? frame.landing : frame.value) - pose.value) < .000001;
    return matches && frame.sequence > before && frame.published && frame.gpu?.state === 'complete' && Number.isFinite(frame.completedMs) && frame.completedMs >= frame.submittedMs &&
      frame.revision === Number(root.dataset.aircraftPoseRevision) && frame.revision === Number(root.dataset.aircraftPresentedRevision) &&
      root.dataset.aircraftWarmMask === 'false' && root.dataset.aircraftGPUPending !== 'true' &&
      capture && capture.sequence === frame.sequence && capture.revision === frame.revision && capture.name === pose.name;
  }, {pose,before}, {timeout, polling:40});
  await settle(page);
  const record = await page.evaluate(() => {
    const root = document.querySelector('[data-aircraft-hero]');
    return {...window.__v3ProductPoster.last, frame:JSON.parse(root.dataset.aircraftLastFrame), dataset:{...root.dataset}, floor:window.__v3Aircraft.scene.fog.color.getHexString()};
  });
  const dimensions = suffix ? [390,768] : [1600,1000];
  assert.deepEqual([record.width,record.height], dimensions, 'Retain original responsive poster dimensions');
  assert.equal(record.floor, 'f5f5f7', 'Current scene uses the v3 light studio field');
  if (pose.poster) {
    assert.ok(record.url.startsWith('data:image/webp;base64,'), 'Native browser WebP encoder');
    const bytes = Buffer.from(record.url.split(',')[1], 'base64');
    const file = `skylabs-${pose.name}${suffix}.webp`;
    fs.writeFileSync(path.join(output, file), bytes);
    manifest.files.push({file:'assets/images/v3-product/' + file,width:record.width,height:record.height,bytes:bytes.length,sha256:sha256(bytes),quality:.93,pose:{type:pose.type,value:pose.value},gpu:record.frame.gpu.state,sequence:record.frame.sequence});
    console.log(`${file}: ${record.width} × ${record.height}; ${bytes.length} bytes; published GPU sequence ${record.frame.sequence}`);
  }
  delete record.url;
  manifest.frames.push({name:pose.name + suffix,...record});
  await page.screenshot({path:path.join(evidence,pose.name + suffix + '.png'),timeout:60000});
}
(async () => {
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  try {
    for (const [suffix,viewport,targetHeight] of [['',{width:1600,height:1076},1000],['-mobile',{width:390,height:834},768]]) {
      const context = await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
      // Posters must not contact a booking provider or any third-party origin.
      await context.route('**/*', async route => {
        const request = route.request(),url = new URL(request.url());
        if (request.method() !== 'GET' || url.origin !== new URL(base).origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage(),errors = [],shaders = [];
      page.on('pageerror',error => errors.push(error.message));
      page.on('console',message => {if (/Shader Error|VALIDATE_STATUS|Error compiling shader|THREE.WebGLProgram/.test(message.text())) shaders.push(message.text());});
      page.setDefaultTimeout(timeout);
      await page.goto(base + '/v3/?capture=product-posters#skylabs-aircraft',{waitUntil:'domcontentloaded'});
      await anchor(page);
      await page.waitForFunction(() => !!window.__v3Aircraft && window.__v3Aircraft.flight.telemetryReady, null, {timeout});
      // Preserve the existing asset dimensions while respecting the actual
      // header/stage layout; this adjusts the capture viewport, never camera.
      for (let attempt=0;attempt<3;attempt++) {
        const actual = await page.locator('[data-aircraft-stage]').evaluate(stage => stage.clientHeight);
        if (actual === targetHeight) break;
        const current = page.viewportSize();
        await page.setViewportSize({width:current.width,height:current.height + targetHeight - actual});
        await anchor(page);
      }
      await page.evaluate(() => {
        const {renderer,scene} = window.__v3Aircraft;
        const nativeRender = renderer.render;
        const capture = window.__v3ProductPoster = {request:null,last:null};
        renderer.render = function(drawnScene,camera,...args) {
          const result = nativeRender.call(this,drawnScene,camera,...args);
          if (drawnScene === scene && capture.request) {
            const root = document.querySelector('[data-aircraft-hero]');
            capture.last = {name:capture.request,sequence:Number(root.dataset.aircraftSubmittedFrames || 0) + 1,revision:Number(root.dataset.aircraftPoseRevision),width:this.domElement.width,height:this.domElement.height,url:this.domElement.toDataURL('image/webp',.93)};
          }
          return result;
        };
      });
      for (const pose of poses) await capture(page,pose,suffix);
      assert.deepEqual(errors,[],'No browser exceptions');
      assert.deepEqual(shaders,[],'No shader compilation errors');
      await context.close();
    }
    assert.equal(manifest.files.length,4);
    fs.writeFileSync(path.join(evidence,'posters.json'),JSON.stringify(manifest,null,2)+'\n');
  } finally {await browser.close();}
})().catch(error => {fs.writeFileSync(path.join(evidence,'posters-partial.json'),JSON.stringify({...manifest,error:String(error)},null,2)+'\n');console.error(error);process.exitCode=1;});

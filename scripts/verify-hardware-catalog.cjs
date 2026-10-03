/* Physical source-CAD views: simple UI, picking, varied motion and lifecycle. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const {captureModels,settled,simpleUI,partPoint,hoverPart,assertFramed}=require('./hardware-viewer-test-helpers.cjs');
const catalog=require('./content/hardware-catalog.json');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=path.resolve(__dirname,'../.codex-temp/hardware-qa');
let targets=catalog.projects.flatMap(project=>(project.models||[{slug:project.model}]).map(model=>({route:project.slug,slug:model.slug,manifest:model.manifest||`/assets/models/hardware/${model.slug}/assembly.json`})));
targets.push(...catalog.assemblies.map(item=>({route:item.route,slug:item.model,manifest:`/assets/models/hardware/${item.model}/assembly.json`})));
if(process.argv.length>2)targets=targets.filter(target=>process.argv.slice(2).includes(target.slug));
(async()=>{
 await fs.mkdir(shots,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 const errors=[],failed=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},hasTouch:true,reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failed.push(response.status()+' '+response.url());});
  await captureModels(page);
  for(const target of targets){
   await page.goto(`${base}/v2/projects/${target.route}/`,{waitUntil:'domcontentloaded'});
   const root=page.locator(`[data-hardware="${target.manifest}"]`);
   await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
   await root.locator('[data-hardware-poster]').evaluate(img=>img.decode());
   await page.locator(`[data-hardware="${target.manifest}"][data-hardware-state="ready"]`).waitFor({timeout:90000});
   await settled(root);await simpleUI(root);await assertFramed(root);
   const initial=await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>({ref:part.ref,position:part.object.position.toArray(),quaternion:part.object.quaternion.toArray()})),target.manifest);
   const count=Number(await root.getAttribute('data-hardware-components'));
   assert.equal(count,initial.length);
   const draws=Number(await root.getAttribute('data-hardware-draws'));assert.ok(draws>0&&draws<900,`${target.slug}: excessive draws ${draws}`);
   if(!initial.length)assert.equal(await root.locator('[data-hardware-explode]').isDisabled(),true);
   else{
    await root.locator('[data-hardware-explode]').click();await settled(root);
    assert.equal(await root.locator('[data-hardware-explode]').textContent(),'Assemble');
    assert.equal(await root.getAttribute('data-hardware-progress'),'1.0000');await assertFramed(root);
    const moved=await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>({ref:part.ref,distance:part.object.position.distanceTo(part.base),position:part.object.position.toArray(),delta:part.object.position.clone().sub(part.base).toArray().map(value=>value.toFixed(3))})),target.manifest);
    assert.ok(moved.some(part=>part.distance>.08),'Physical parts visibly separate');
    assert.ok(moved.every(part=>part.position.every(Number.isFinite)),'Finite physical transforms');
    if(count>4)assert.ok(new Set(moved.map(part=>part.delta.join(','))).size>3,'Parts take different trajectories');
    const point=await hoverPart(root);await settled(root);
    await root.screenshot({path:path.join(shots,target.slug+'-exploded.png')});
    // Keep the mouse still as components move beneath it. The readout must
    // reflect the part currently under the pointer, never the old hit.
    await root.locator('[data-hardware-explode]').evaluate(button=>button.click());await settled(root);
    const expected=await partPoint(root,point);
    assert.equal(await root.getAttribute('data-hardware-selection'),expected?.ref||'','Hover follows moving geometry');
    assert.equal(await root.getAttribute('data-hardware-progress'),'0.0000');
    assert.deepEqual(await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>({ref:part.ref,position:part.object.position.toArray(),quaternion:part.object.quaternion.toArray()})),target.manifest),initial,'Exact assembly reversal');
    await page.mouse.move(0,0);assert.equal(await root.locator('[data-hardware-part]').isVisible(),false,'Pointer exit clears identity');
   }
   await root.locator('canvas').press('ArrowRight');await settled(root);
   await root.locator('canvas').press('Home');await settled(root);
   if(count){await root.locator('canvas').press(']');assert.equal(await root.locator('[data-hardware-part]').isVisible(),true);await root.locator('canvas').press('Escape');assert.equal(await root.locator('[data-hardware-part]').isVisible(),false);}
   await root.screenshot({path:path.join(shots,target.slug+'-assembled.png')});
   await page.setViewportSize({width:390,height:844});await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await settled(root);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,target.slug+' mobile overflow');await assertFramed(root);
   if(count){
    const point=await partPoint(root);assert.ok(point,'Mobile has a visible component');
    await page.touchscreen.tap(point.x,point.y);await settled(root);
    assert.equal(await root.getAttribute('data-hardware-selection'),point.ref,'Touch identifies the physical component');
    const readout=await root.locator('[data-hardware-part]').boundingBox(),stage=await root.locator('[data-hardware-stage]').boundingBox();
    assert.ok(readout.y-stage.y<20&&stage.x+stage.width-readout.x-readout.width<20,'Identity appears at top right');
    await root.screenshot({path:path.join(shots,target.slug+'-mobile.png')});
    await page.touchscreen.tap(point.x,point.y);await settled(root);assert.equal(await root.locator('[data-hardware-part]').isVisible(),false,'A second tap dismisses identity');
    await root.locator('[data-hardware-explode]').click();await settled(root);await assertFramed(root);
    await root.screenshot({path:path.join(shots,target.slug+'-mobile-exploded.png')});
   }else await root.screenshot({path:path.join(shots,target.slug+'-mobile.png')});
   await page.setViewportSize({width:1440,height:1050});
   console.log(`PASS ${target.slug}: ${count} groups, ${draws} draws; single action, hover/touch, varied motion, exact reversal and mobile`);
  }
  await page.goto(base+'/v2/projects/framework-logic-analyser/');
  const root=page.locator('[data-hardware]');await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await page.emulateMedia({reducedMotion:'reduce'});await root.locator('[data-hardware-explode]').click();await settled(root);
  assert.equal(await root.getAttribute('data-hardware-progress'),'1.0000');
  await page.emulateMedia({reducedMotion:'no-preference'});await root.locator('canvas').press('Home');await settled(root);
  await page.evaluate(()=>{const extra=document.createElement('div');extra.style.height='1800px';document.body.append(extra);scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});});
  await page.waitForTimeout(300);const frame=await root.getAttribute('data-hardware-frames');await page.waitForTimeout(350);assert.equal(await root.getAttribute('data-hardware-frames'),frame,'Offscreen renderer stops');
  await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await settled(root);
  await root.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});
  await page.locator('[data-hardware-state="unavailable"]').waitFor();assert.equal(await root.locator('[data-hardware-poster]').isVisible(),true);await page.close();
  const fail=await browser.newPage();
  const blocked='**/hardware/framework-logic-analyser/board.glb';
  await fail.route(blocked,route=>route.abort());await fail.goto(base+'/v2/projects/framework-logic-analyser/');await fail.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
  await fail.locator('[data-hardware-state="unavailable"]').waitFor();assert.equal(await fail.locator('[data-hardware-poster]').isVisible(),true);
  await fail.unroute(blocked);await fail.locator('[data-hardware-start]').click();await fail.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});await simpleUI(fail.locator('[data-hardware]'));await fail.close();
  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await noJS.goto(base+'/v2/projects/framework-logic-analyser/');assert.equal(await noJS.locator('[data-hardware-start]').first().isVisible(),false);assert.equal(await noJS.locator('[data-hardware-explode]').isVisible(),false);assert.equal(await noJS.locator('[data-hardware-poster]').count(),1);await noJS.close();
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(failed,[],'HTTP failures');
  console.log('PASS shared reduced-motion, offscreen, context-loss, failed-model retry and no-JavaScript behaviour');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

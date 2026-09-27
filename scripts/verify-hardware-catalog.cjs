/* End-to-end acceptance for source hardware views. Start a static server first.
   Optional: V2_BASE_URL and CHROMIUM_EXECUTABLE. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const catalog=require('./content/hardware-catalog.json');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=path.resolve(__dirname,'../.codex-temp/hardware-qa');
let targets=catalog.projects.flatMap(project=>(project.models||[{slug:project.model}]).map(model=>({route:project.slug,slug:model.slug,manifest:model.manifest||`/assets/models/hardware/${model.slug}/assembly.json`})));
targets.push(...catalog.assemblies.map(item=>({route:item.route,slug:item.model,manifest:`/assets/models/hardware/${item.model}/assembly.json`})));
if(process.argv.length>2)targets=targets.filter(target=>process.argv.slice(2).includes(target.slug));
async function settled(root){
 const selector=await root.getAttribute('data-hardware').then(url=>`[data-hardware="${url}"]`);
 await root.page().waitForFunction(selector=>{
  const node=document.querySelector(selector),now=performance.now();
  if(!node||node.dataset.hardwareMotion!=='idle'){window.__idleProbe=null;return false;}
  const key=selector+':'+node.dataset.hardwareFrames;
  if(window.__idleProbe?.key!==key){window.__idleProbe={key,time:now};return false;}
  return now-window.__idleProbe.time>700;
 },selector,{timeout:60000});
 const before=await root.getAttribute('data-hardware-frames');await root.page().waitForTimeout(350);
 assert.equal(await root.getAttribute('data-hardware-frames'),before,'Idle renderer must stop');
}
(async()=>{
 await fs.mkdir(shots,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 const errors=[],failed=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failed.push(response.status()+' '+response.url());});
  await page.addInitScript(()=>{
   let factory;window.__hardwareModels={};
   Object.defineProperty(window,'V2HardwareModels',{configurable:true,get:()=>factory,set:value=>{factory={load:async url=>{const model=await value.load(url);window.__hardwareModels[url]=model;return model;}};}});
  });
  for(const target of targets){
   await page.goto(`${base}/v2/projects/${target.route}/`,{waitUntil:'domcontentloaded'});
   const root=page.locator(`[data-hardware="${target.manifest}"]`);
   assert.equal(await root.getAttribute('data-hardware-state'),'poster');
   await root.scrollIntoViewIfNeeded();
   await root.locator('[data-hardware-poster]').evaluate(img=>img.decode());
   await root.locator('[data-hardware-start]').click();
   await root.locator('..').locator(`[data-hardware="${target.manifest}"][data-hardware-state="ready"]`).waitFor({timeout:90000});
   await settled(root);
   const initial=await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>({ref:part.ref,position:part.object.position.toArray(),offset:part.offset.toArray()})),target.manifest);
   const count=Number(await root.getAttribute('data-hardware-components'));
   assert.equal(count,initial.length);
   const draws=Number(await root.getAttribute('data-hardware-draws'));assert.ok(draws>0&&draws<650,`${target.slug}: excessive draws ${draws}`);
   if(!initial.length){assert.equal(await root.locator('[data-hardware-explode]').isDisabled(),true);}
   else{
    await root.locator('[data-hardware-explode]').click();await settled(root);
    assert.equal(await root.getAttribute('data-hardware-progress'),'1.0000');
    const moved=await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>({ref:part.ref,distance:part.object.position.distanceTo(part.base),position:part.object.position.toArray()})),target.manifest);
    assert.ok(moved.some(part=>part.distance>.08),'Physical parts must visibly separate');
    assert.ok(moved.every(part=>part.position.every(Number.isFinite)),'Finite physical transforms');
    const selection=initial.find(part=>/^U\d/.test(part.ref))||initial[0];
    await root.locator('[data-hardware-selection]').selectOption(selection.ref);
    assert.equal(await root.getAttribute('data-hardware-selection'),selection.ref);
    assert.equal(await root.locator('[data-hardware-part]').isVisible(),true);
    await root.screenshot({path:path.join(shots,target.slug+'-exploded.png')});
    await root.locator('[data-hardware-explode]').click();await settled(root);
    assert.equal(await root.getAttribute('data-hardware-progress'),'0.0000');
    assert.deepEqual(await page.evaluate(url=>window.__hardwareModels[url].parts.map(part=>part.object.position.toArray()),target.manifest),initial.map(part=>part.position),'Exact assembly reversal');
   }
   await root.locator('[data-hardware-view="bottom"]').click();await settled(root);
   assert.equal(await root.locator('[data-hardware-view="bottom"]').getAttribute('aria-pressed'),'true');
   await root.locator('canvas').press('ArrowRight');await settled(root);
   await root.locator('canvas').press('Home');await settled(root);
   assert.equal(await root.locator('[data-hardware-view="iso"]').getAttribute('aria-pressed'),'true');
   await root.screenshot({path:path.join(shots,target.slug+'-assembled.png')});
   await page.setViewportSize({width:390,height:844});await root.scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,target.slug+' mobile overflow');
   await root.screenshot({path:path.join(shots,target.slug+'-mobile.png')});
   await page.setViewportSize({width:1440,height:1050});
   console.log(`PASS ${target.slug}: ${count} groups, ${draws} draws; models, controls, keyboard, exact reversal and mobile`);
  }
  // Lifecycle and accessible fallback are shared by every instance.
  await page.goto(base+'/v2/projects/framework-logic-analyser/');
  const root=page.locator('[data-hardware]');await root.locator('[data-hardware-start]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await page.emulateMedia({reducedMotion:'reduce'});await root.locator('[data-hardware-explode]').click();await settled(root);
  assert.equal(await root.getAttribute('data-hardware-progress'),'1.0000');assert.equal(await root.locator('[data-hardware-scroll]').isVisible(),false);
  await page.emulateMedia({reducedMotion:'no-preference'});await root.locator('[data-hardware-reset]').click();await settled(root);
  await page.evaluate(()=>{const extra=document.createElement('div');extra.style.height='1800px';document.body.append(extra);scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});});
  await page.waitForTimeout(300);const frame=await root.getAttribute('data-hardware-frames');await page.waitForTimeout(400);assert.equal(await root.getAttribute('data-hardware-frames'),frame,'Offscreen renderer stops');
  await root.scrollIntoViewIfNeeded();await settled(root);
  await root.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});
  await page.locator('[data-hardware-state="unavailable"]').waitFor();assert.equal(await root.locator('[data-hardware-poster]').isVisible(),true);
  await page.close();
  const fail=await browser.newPage();await fail.route('**/hardware/usense/board.glb',route=>route.abort());await fail.goto(base+'/v2/projects/usense/');await fail.locator('[data-hardware-start]').click();await fail.locator('[data-hardware-state="unavailable"]').waitFor();assert.equal(await fail.locator('[data-hardware-poster]').isVisible(),true);await fail.close();
  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await noJS.goto(base+'/v2/projects/kiku/');assert.equal(await noJS.locator('[data-hardware-start]').first().isVisible(),false);assert.equal(await noJS.locator('[data-hardware-poster]').count(),2);await noJS.close();
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(failed,[],'HTTP failures');
  console.log('PASS shared reduced-motion, offscreen, context-loss, failed-model and no-JavaScript behaviour');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

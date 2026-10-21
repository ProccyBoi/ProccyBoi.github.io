#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PNG}=require('pngjs');
const playwright=require('playwright');
const {chromiumConfig}=require('../v3-webgpu/browser-config.cjs');
const engine=process.argv.includes('--webkit')?'webkit':'chromium';
const requireGPU=process.argv.includes('--require-webgpu');
const base=process.env.V3_BASE_URL||'http://127.0.0.1:8080';
const out=process.env.V3_ORBITAL_OUT||'/tmp/v3-orbital-evidence';
fs.mkdirSync(out,{recursive:true});
const report={engine,requireGPU,tests:[],errors:[],limits:['Software WebGPU proves correctness, not physical-device speed.','All external requests are blocked; no booking or external communication is submitted.']};
async function capture(page,options){
 const before=await page.evaluate(()=>({x:scrollX,y:scrollY}));
 for(const image of await page.locator('img').all()){
  if(!await image.isVisible())continue;
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async image=>{image.loading='eager';await image.decode();if(!image.naturalWidth)throw new Error('Image failed to decode: '+image.src);});
 }
 await page.evaluate(p=>scrollTo({left:p.x,top:p.y,behavior:'instant'}),before);
 await page.waitForTimeout(100);
 return page.screenshot(options);
}
const save=()=>fs.writeFileSync(path.join(out,`${engine}-report.json`),JSON.stringify(report,null,2));
function observer(){
 const state=window.__nativeGPU={devices:0,configured:0,submits:0,completed:0,draws:0,errors:[],losses:[]};
 const wrap=(proto,key,after)=>{if(!proto?.[key])return;const original=proto[key];proto[key]=function(...args){const result=Reflect.apply(original,this,args);after(this,args,result);return result;};};
 wrap(window.GPUAdapter?.prototype,'requestDevice',(_,args,result)=>result.then(device=>{state.devices++;window.__testDevice=device;device.addEventListener('uncapturederror',event=>state.errors.push(event.error.message));device.lost.then(info=>state.losses.push(info.reason));}));
 wrap(window.GPUCanvasContext?.prototype,'configure',()=>state.configured++);
 wrap(window.GPUQueue?.prototype,'submit',()=>state.submits++);
 wrap(window.GPUQueue?.prototype,'onSubmittedWorkDone',(_,args,result)=>result.then(()=>state.completed++));
 wrap(window.GPURenderPassEncoder?.prototype,'draw',()=>state.draws++);
}
(async()=>{
 let browser;
 try{
  browser=await playwright[engine].launch(engine==='chromium'?chromiumConfig():{headless:true});
  const test=async(name,fn)=>{try{const evidence=await fn();report.tests.push({name,passed:true,...evidence});save();console.log('PASS',name);}catch(error){report.tests.push({name,passed:false,error:String(error.stack||error)});report.errors.push(`${name}: ${error.message}`);save();console.error('FAIL',name,error);}};
  const context=async(options={})=>{
   const c=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,...options});
   await c.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
   return c;
  };
  for(const [name,width,height] of [['desktop',1440,1000],['laptop',1280,720],['tablet',768,1024],['phone',390,844],['narrow',320,568]]){
   await test(`fallback layout ${name}`,async()=>{
    const c=await context({viewport:{width,height}});await c.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));const page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/v3/`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.OrbitalWorkshop?.getState().backend==='canvas2d');
    await capture(page,{path:path.join(out,`${engine}-${name}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
    assert.equal(await page.locator('h1').count(),1);assert.match(await page.locator('h1').innerText(),/Andrew\s*Chung/);
    assert.equal(await page.locator('.scene-choice').count(),4);
    for(let i=0;i<4;i++){await page.locator(`[data-scene="${i}"]`).click();await page.waitForTimeout(80);assert.equal(await page.locator(`[data-scene="${i}"]`).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.scene-choice[aria-pressed=true]').count(),1);const href=await page.locator('[data-brief-link]').getAttribute('href');assert.equal((await page.request.get(`${base}${href}`)).status(),200);}
    await page.locator('[data-scene="0"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-scene="0"]').getAttribute('aria-pressed'),'true');
    const state=await page.evaluate(()=>window.OrbitalWorkshop.getState());assert.equal(state.submittedFrames,0,'Fallback must not fabricate GPU submissions');assert.deepEqual(errors,[]);
    await c.close();return {width,height,state};
   });
  }
  await test('no JavaScript retains identity, project routes and designed schematic',async()=>{
   const c=await context({javaScriptEnabled:false});const page=await c.newPage();await page.goto(`${base}/v3/`);assert.equal(await page.locator('.scene-static').isVisible(),true);assert.equal(await page.locator('.text-link[href^="/v3/projects/"]').count(),3);await capture(page,{path:path.join(out,`${engine}-no-js.png`),fullPage:true});await c.close();return {};
  });
  await test('reduced motion retains usable content',async()=>{
   const c=await context({reducedMotion:'reduce'});await c.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));const page=await c.newPage();await page.goto(`${base}/v3/`);await page.waitForFunction(()=>window.OrbitalWorkshop?.getState().backend==='canvas2d');const first=await page.evaluate(()=>window.OrbitalWorkshop.getState());await page.waitForTimeout(250);const second=await page.evaluate(()=>window.OrbitalWorkshop.getState());assert.equal(first.renderedFrames,second.renderedFrames,'Static fallback is idle');assert.equal(second.reducedMotion,true);await page.locator('[data-scene="2"]').click();await page.waitForTimeout(80);assert.equal(await page.locator('[data-brief-link]').getAttribute('href'),'/v3/projects/tramtrace/');await capture(page,{path:path.join(out,`${engine}-reduced.png`),fullPage:true});await c.close();return {state:second};
  });
  await test('save data avoids GPU initialization',async()=>{
   const c=await context();await c.addInitScript(()=>{Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true});window.__adapterRequests=0;if(navigator.gpu)navigator.gpu.requestAdapter=async()=>{window.__adapterRequests++;return null;};});const page=await c.newPage();await page.goto(`${base}/v3/`);await page.waitForFunction(()=>window.OrbitalWorkshop?.getState().backend==='canvas2d');assert.equal(await page.evaluate(()=>window.__adapterRequests),0);assert.equal(await page.evaluate(()=>window.OrbitalWorkshop.getState().reason),'save-data');await c.close();return {};
  });
  await test('all local homepage routes resolve and key interiors stay functional',async()=>{
   const c=await context();const page=await c.newPage();await page.goto(`${base}/v3/`);const links=await page.locator('a[href]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('href')).filter(h=>h.startsWith('/')))]);for(const href of links)assert.equal((await page.request.get(`${base}${href}`)).status(),200,href);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   for(const route of ['/v3/projects/','/v3/about/','/v3/projects/skylabs/','/v3/projects/framework-expansion-card/','/v3/projects/tramtrace/','/v3/projects/kiku/']){await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(150);assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route);}
   await page.goto(`${base}/v3/projects/`);const search=page.locator('input[type=search]');if(await search.count()){await search.fill('Framework');assert.ok(await page.locator('[data-v2-project]:visible').count()>=4);}
   await capture(page,{path:path.join(out,`${engine}-projects.png`),fullPage:true});assert.deepEqual(errors,[]);await c.close();return {localLinks:links.length};
  });
  await test('interior mobile navigation opens and closes accessibly',async()=>{
   const c=await context({viewport:{width:390,height:844}});const page=await c.newPage();await page.goto(`${base}/v3/about/`);const menu=page.locator('[data-v2-menu]');await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await capture(page,{path:path.join(out,`${engine}-mobile-interior-menu.png`)});await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');await c.close();return {};
  });
  if(requireGPU){
   await test('native WebGPU renders real geometry and lifecycle survives changes',async()=>{
    const c=await context();await c.addInitScript(observer);const page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/v3/?gpu=force`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.OrbitalWorkshop?.getState().backend==='webgpu'&&window.OrbitalWorkshop.getState().completedFrames>0,null,{timeout:120000});
    const native=await page.evaluate(()=>window.__nativeGPU);assert.ok(native.devices>0&&native.configured>0&&native.submits>0&&native.completed>0&&native.draws>0,'Actual WebGPU native calls required');assert.deepEqual(native.errors,[]);
    await page.locator('[data-motion-toggle]').click();await page.waitForTimeout(200);let first=await page.evaluate(()=>window.OrbitalWorkshop.getState());await page.waitForTimeout(300);let second=await page.evaluate(()=>window.OrbitalWorkshop.getState());assert.equal(first.submittedFrames,second.submittedFrames,'Paused scene must be idle');
    const box=await page.locator('[data-orbital-canvas]').boundingBox();const viewport=page.viewportSize();const image=await page.screenshot({path:path.join(out,'chromium-gpu-instrument.png'),clip:{x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,viewport.width-Math.max(0,box.x)),height:Math.min(box.height,viewport.height-Math.max(0,box.y))}});const png=PNG.sync.read(image);let blue=0,dark=0;for(let i=0;i<png.data.length;i+=4){const[r,g,b,a]=png.data.subarray(i,i+4);if(a>0&&b>r*1.4&&b>g*1.25&&b>70)blue++;if(a>0&&r<80&&g<80&&b<100)dark++;}assert.ok(blue>png.width*png.height*.015,`Visible cobalt geometry required, got ${blue}`);assert.ok(dark>png.width*png.height*.001,`Visible dark structure required, got ${dark}`);
    await capture(page,{path:path.join(out,'chromium-gpu-desktop.png'),fullPage:true});
    for(let i=1;i<4;i++){await page.locator(`[data-scene="${i}"]`).click();await page.waitForTimeout(150);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1000);assert.equal(await page.locator(`[data-scene="${i}"]`).getAttribute('aria-pressed'),'true');await capture(page,{path:path.join(out,`chromium-gpu-scene-${i}.png`)});}
    await page.locator('[data-motion-toggle]').click();
    // Exercise real animated interruption, not only static mode replacement.
    await page.evaluate(()=>{document.querySelector('[data-scene=\"0\"]').click();setTimeout(()=>document.querySelector('[data-scene=\"2\"]').click(),80);setTimeout(()=>document.querySelector('[data-scene=\"1\"]').click(),160);});
    await page.waitForFunction(()=>{const s=window.OrbitalWorkshop.getState();return s.scene===1&&s.displayedMode===2&&!s.transitioning;},null,{timeout:15000});await capture(page,{path:path.join(out,'chromium-gpu-reversed-transition.png')});
    await page.waitForTimeout(250);await page.locator('#contact').scrollIntoViewIfNeeded();await page.waitForTimeout(200);first=await page.evaluate(()=>window.OrbitalWorkshop.getState());await page.waitForTimeout(300);second=await page.evaluate(()=>window.OrbitalWorkshop.getState());assert.equal(first.submittedFrames,second.submittedFrames,'Offscreen GPU must be idle');
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(250);assert.ok((await page.evaluate(()=>window.OrbitalWorkshop.getState())).submittedFrames>second.submittedFrames);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);first=await page.evaluate(()=>window.OrbitalWorkshop.getState());await page.waitForTimeout(300);second=await page.evaluate(()=>window.OrbitalWorkshop.getState());assert.equal(first.submittedFrames,second.submittedFrames,'Live reduced motion must stop animation');
    await page.evaluate(()=>window.__testDevice.destroy());await page.waitForFunction(()=>window.OrbitalWorkshop.getState().backend==='canvas2d');await capture(page,{path:path.join(out,'chromium-device-loss.png')});assert.deepEqual(errors,[]);const final=await page.evaluate(()=>({native:window.__nativeGPU,state:window.OrbitalWorkshop.getState()}));assert.deepEqual(final.native.errors,[]);await c.close();return {native,first,second,final,visiblePixels:{blue,dark}};
   });
   await test('mobile native GPU renders and recovers from viewport changes',async()=>{
    const c=await context({viewport:{width:390,height:844}});const page=await c.newPage();await page.goto(`${base}/v3/?gpu=force`);await page.waitForFunction(()=>window.OrbitalWorkshop?.getState().completedFrames>0,null,{timeout:120000});await page.locator('[data-motion-toggle]').click();await capture(page,{path:path.join(out,'chromium-gpu-phone.png'),fullPage:true});await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);await capture(page,{path:path.join(out,'chromium-gpu-narrow.png'),fullPage:true});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>window.OrbitalWorkshop.getState().backend),'webgpu');await c.close();return {};
   });
  }
 }catch(error){report.errors.push(String(error.stack||error));}
 finally{await browser?.close();save();console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;}
})();

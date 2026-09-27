/* Shared Skylabs inspector: board navigation, curated parts, pending-load races,
   responsive layout, reduced motion and static fallback. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=path.resolve(__dirname,'../.codex-temp/skylabs-unified');
const route='/v2/projects/skylabs/';
const variants=[['telemetry',11,'U14'],['ground-station',8,'U3']];
async function renderedBoardColours(page,label){
 const canvas=page.locator('[data-hardware-canvas]');
 await canvas.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-hardware]').dataset.hardwareMotion==='idle');
 const bytes=await canvas.screenshot();
 const sample=await page.evaluate(async encoded=>{
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  const surface=document.createElement('canvas');surface.width=image.width;surface.height=image.height;
  const context=surface.getContext('2d');context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,surface.width,surface.height).data,colours=new Set();let boardPixels=0;
  for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.slice(i,i+3);if(g>r+5&&g>b+5){boardPixels++;colours.add([r>>4,g>>4,b>>4].join(','));}}
  return {boardPixels,colours:colours.size};
 },bytes.toString('base64'));
 // Both source PCBs have a green solder mask; the blue stage is excluded.
 // This catches an all-white render even when geometry/state checks pass.
 assert.ok(sample.boardPixels>300&&sample.colours>3,`${label}: PCB materials lost (${JSON.stringify(sample)})`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];
 await fs.mkdir(shots,{recursive:true});
 const observe=page=>page.on('pageerror',error=>errors.push(error.message));
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});observe(page);
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto(base+route,{waitUntil:'networkidle'});
  const root=page.locator('[data-hardware]');
  assert.equal(await root.count(),1);assert.equal(await page.locator('[data-object-inspector]').count(),0);
  assert.equal(requests.some(url=>/skylabs-object|skylabs-.*-turn-|\.glb(?:\?|$)/.test(url)),false,'Static first view has no legacy turntable or CAD downloads');
  const protection=page.locator('[data-hardware-components="telemetry"] [data-hardware-refs="U2 U5"]');
  await protection.locator('summary').click();assert.equal(await protection.getAttribute('open'),'');
  assert.match(await protection.locator('p').textContent(),/DW01A.*8205A/);
  assert.equal(await root.getAttribute('data-hardware-state'),'poster','Component details work before model activation');
  await page.locator('[data-hardware-board="ground"]').click();
  assert.equal(new URL(page.url()).pathname,route);assert.equal(new URL(page.url()).searchParams.get('board'),'ground');
  assert.equal(await page.locator('[data-hardware-components="ground"]').isVisible(),true);
  assert.equal(await page.locator('[data-hardware-components="telemetry"]').isVisible(),false);
  await page.reload();assert.equal(await root.getAttribute('data-hardware-board-key'),'ground','Board query survives reload');
  await page.locator('[data-hardware-components="ground"] [data-hardware-refs="U3"] summary').click();
  await root.locator('[data-hardware-start]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  assert.equal(await root.getAttribute('data-hardware-selection'),'U3','Pre-load component selection applies after activation');
  await root.locator('select[data-hardware-selection]').selectOption('U3');assert.match(await root.locator('[data-hardware-part]').textContent(),/ESP32.*field dashboard/);
  await renderedBoardColours(page,'Ground station first render');
  await page.locator('[data-hardware-board="telemetry"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Telemetry after switch');
  await page.locator('[data-hardware-board="ground"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Ground station after return');
  await page.locator('[data-hardware-board="telemetry"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Telemetry after return');
  assert.equal(await root.getAttribute('data-hardware-board-key'),'telemetry');
  assert.equal(await root.getAttribute('data-hardware-selection'),'');
  await protection.locator('summary').click();assert.equal(await root.getAttribute('data-hardware-selection'),'U2 U5','Curated circuit groups select both physical parts');
  await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'main-1440.png')});
  await page.setViewportSize({width:390,height:844});await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(shots,'main-390.png')});
  console.log('PASS main: one inspector, board links/query, lazy loading and grouped component descriptions');
  for(const [slug,count,ref]of variants){
   await page.goto(base+route+'boards/'+slug+'/#assembly',{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-hardware]').count(),1);assert.equal(await page.locator('#explore #assembly').count(),1);
   assert.equal(await page.locator('[data-hardware-component]').count(),count);
   assert.equal(await page.locator('[data-object-inspector]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('[data-hardware-component]').first().locator('summary').click();
   await page.locator('#explore').screenshot({path:path.join(shots,slug+'-390.png')});
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('[data-hardware-start]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
   await page.locator('select[data-hardware-selection]').selectOption(ref);assert.match(await page.locator('[data-hardware-part]').textContent(),new RegExp(ref));
   await page.locator('[data-hardware-view="bottom"]').click();assert.equal(await page.locator('[data-hardware-view="bottom"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-hardware-reset]').click();
   await page.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,slug+'-1440.png')});
   await page.setViewportSize({width:390,height:844});
  }
  await page.close();console.log('PASS nested boards: single inspector, old assembly anchor, component content and responsive controls');

  const race=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});observe(race);
  await race.addInitScript(()=>{
   let factory;window.__heldModels=[];
   Object.defineProperty(window,'V2HardwareModels',{configurable:true,get:()=>factory,set:value=>{factory={load:async url=>{
    const model=await value.load(url);return new Promise(resolve=>window.__heldModels.push({url,release:()=>resolve(model)}));
   }};}});
  });
  await race.goto(base+route);await race.locator('[data-hardware-start]').click();
  await race.waitForFunction(()=>window.__heldModels.length===1,null,{timeout:90000});
  await race.locator('[data-hardware-board="ground"]').click();
  await race.waitForFunction(()=>window.__heldModels.length===2,null,{timeout:90000});
  await race.locator('[data-hardware-board="telemetry"]').click();
  await race.waitForFunction(()=>window.__heldModels.length===3,null,{timeout:90000});
  await race.evaluate(()=>window.__heldModels[0].release());await race.waitForTimeout(100);
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-state'),'loading','Stale load cannot complete newer load');
  assert.equal(await race.locator('[data-hardware-start]').isDisabled(),true);
  await race.evaluate(()=>window.__heldModels[2].release());await race.locator('[data-hardware-state="ready"]').waitFor();
  await race.locator('select[data-hardware-selection]').selectOption('U14');
  await race.evaluate(()=>window.__heldModels[1].release());await race.waitForTimeout(150);
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-selection'),'U14','Stale promise cannot clear current selection');
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-board-key'),'telemetry');
  assert.equal(await race.locator('[data-hardware-selection] option[value="U14"]').count(),1,'No stale options appended');
  await race.locator('[data-hardware-canvas]').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});
  await race.locator('[data-hardware-state="unavailable"]').waitFor();
  assert.equal(await race.locator('[data-hardware-poster]').isVisible(),true);
  await race.locator('[data-hardware-board="ground"]').click();await race.waitForURL('**/boards/ground-station/');
  await race.close();console.log('PASS rapid pending board switches, stale promise isolation, context loss and fallback navigation');

  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});observe(noJS);
  await noJS.goto(base+route);assert.equal(await noJS.locator('[data-hardware-poster]').count(),1);
  assert.equal(await noJS.locator('[data-hardware-component]').count(),19);
  await noJS.locator('[data-hardware-board="ground"]').click();await noJS.waitForURL('**/boards/ground-station/');
  await noJS.locator('[data-hardware-component]').first().locator('summary').click();assert.equal(await noJS.locator('[data-hardware-component][open]').count(),1);
  assert.equal(await noJS.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await noJS.close();
  assert.deepEqual(errors,[]);console.log('PASS no-JavaScript board navigation and readable component details; no page errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

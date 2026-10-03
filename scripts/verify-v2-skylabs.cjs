/* Shared Skylabs inspector: board navigation, physical picking, pending-load races,
   responsive layout, reduced motion and static fallback. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const {captureModels,settled,simpleUI,hoverPart}=require('./hardware-viewer-test-helpers.cjs');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const shots=path.resolve(__dirname,'../.codex-temp/skylabs-unified');
const route='/v2/projects/skylabs/';
const variants=[['telemetry',153],['ground-station',43]];
async function renderedBoardColours(page,label){
 const canvas=page.locator('[data-hardware-canvas]');
 await canvas.scrollIntoViewIfNeeded();
 await page.mouse.move(0,0);
 await page.waitForFunction(()=>document.querySelector('[data-hardware]').dataset.hardwareMotion==='idle');
 // Neutralise the CSS stage while sampling, so its blue gradient cannot pass
 // the soldermask assertion for a white, green or missing board.
 const stage=page.locator('[data-hardware-stage]');
 const originalBackground=await stage.evaluate(node=>{const value=node.style.background;node.style.background='#121212';return value;});
 let bytes;
 try{bytes=await canvas.screenshot();}finally{await stage.evaluate((node,value)=>{node.style.background=value;},originalBackground);}
 const sample=await page.evaluate(async encoded=>{
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  const surface=document.createElement('canvas');surface.width=image.width;surface.height=image.height;
  const context=surface.getContext('2d');context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,surface.width,surface.height).data,colours=new Set();let boardPixels=0;
  for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.slice(i,i+3);if(b>g+15&&b>r+25&&g>r+10){boardPixels++;colours.add([r>>4,g>>4,b>>4].join(','));}}
  return {boardPixels,colours:colours.size};
 },bytes.toString('base64'));
 // Both manufactured PCBs use blue soldermask; component colours stay intact.
 // This catches an all-white render even when geometry/state checks pass.
 assert.ok(sample.boardPixels>300&&sample.colours>3,`${label}: PCB materials lost (${JSON.stringify(sample)})`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];
 await fs.mkdir(shots,{recursive:true});
 const observe=page=>page.on('pageerror',error=>errors.push(error.message));
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});observe(page);await captureModels(page);
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto(base+route,{waitUntil:'networkidle'});
  const root=page.locator('[data-hardware]');
  assert.equal(await root.count(),1);assert.equal(await page.locator('[data-object-inspector]').count(),0);
  assert.equal(requests.some(url=>/skylabs-object|skylabs-.*-turn-/.test(url)),false,'Shared inspector does not load the legacy turntable');
  assert.equal(await root.locator('[data-hardware-start]').isVisible(),false,'Healthy inspector needs no activation button');
  await page.locator('[data-hardware-board="ground"]').click();
  assert.equal(new URL(page.url()).pathname,route);assert.equal(new URL(page.url()).searchParams.get('board'),'ground');
  await page.reload();assert.equal(await root.getAttribute('data-hardware-board-key'),'ground','Board query survives reload');
  await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await settled(root);await simpleUI(root);await hoverPart(root);
  assert.equal(await root.locator('[data-hardware-component]').count(),0,'No duplicated component menu');
  await renderedBoardColours(page,'Ground station first render');
  await page.locator('[data-hardware-board="telemetry"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Telemetry after switch');
  await page.locator('[data-hardware-board="ground"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Ground station after return');
  await page.locator('[data-hardware-board="telemetry"]').click();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
  await renderedBoardColours(page,'Telemetry after return');
  assert.equal(await root.getAttribute('data-hardware-board-key'),'telemetry');
  assert.equal(await root.getAttribute('data-hardware-selection'),'');
  const hovered=await hoverPart(root);
  const expectedLabel=await root.locator('[data-hardware-labels]').evaluate((node,ref)=>JSON.parse(node.textContent).telemetry[ref],hovered.ref);
  if(expectedLabel)assert.match(await root.locator('[data-hardware-part]').textContent(),new RegExp(expectedLabel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'Curated name appears for actual physical hit');
  await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'main-1440.png')});
  await page.setViewportSize({width:390,height:844});await root.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(shots,'main-390.png')});
  console.log('PASS main: one action, board links/query, automatic loading and component hover names');
  for(const [slug,count]of variants){
   await page.goto(base+route+'boards/'+slug+'/#assembly',{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-hardware]').count(),1);assert.equal(await page.locator('#explore #assembly').count(),1);
   assert.equal(await page.locator('[data-hardware-component]').count(),0);
   assert.equal(await page.locator('[data-object-inspector]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
   await settled(page.locator('[data-hardware]'));await simpleUI(page.locator('[data-hardware]'));
   assert.equal(Number(await page.locator('[data-hardware]').getAttribute('data-hardware-components')),count);
   await hoverPart(page.locator('[data-hardware]'));await page.locator('#explore').screenshot({path:path.join(shots,slug+'-390.png')});
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('[data-hardware]').scrollIntoViewIfNeeded();await page.locator('[data-hardware-state="ready"]').waitFor({timeout:90000});
   await page.locator('[data-hardware-explode]').click();await settled(page.locator('[data-hardware]'));
   assert.equal(await page.locator('[data-hardware]').getAttribute('data-hardware-progress'),'1.0000');
   await renderedBoardColours(page,slug+' disassembled');await hoverPart(page.locator('[data-hardware]'));
   await page.locator('[data-hardware-stage]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,slug+'-1440.png')});
   await page.setViewportSize({width:390,height:844});
  }
  await page.close();console.log('PASS nested boards: automatic loading, single action, old assembly anchor, hover and responsive layout');

  const race=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});observe(race);
  await race.addInitScript(()=>{
   let factory;window.__heldModels=[];window.__hardwareModels={};
   Object.defineProperty(window,'V2HardwareModels',{configurable:true,get:()=>factory,set:value=>{factory={load:async url=>{
    const model=await value.load(url);window.__hardwareModels[url]=model;return new Promise(resolve=>window.__heldModels.push({url,release:()=>resolve(model)}));
   }};}});
  });
  await race.goto(base+route);await race.locator('[data-hardware]').scrollIntoViewIfNeeded();
  await race.waitForFunction(()=>window.__heldModels.length===1,null,{timeout:90000});
  await race.locator('[data-hardware-board="ground"]').click();
  await race.waitForFunction(()=>window.__heldModels.length===2,null,{timeout:90000});
  await race.locator('[data-hardware-board="telemetry"]').click();
  await race.waitForFunction(()=>window.__heldModels.length===3,null,{timeout:90000});
  await race.evaluate(()=>window.__heldModels[0].release());await race.waitForTimeout(100);
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-state'),'loading','Stale load cannot complete newer load');
  assert.equal(await race.locator('[data-hardware-start]').isDisabled(),true);
  await race.evaluate(()=>window.__heldModels[2].release());await race.locator('[data-hardware-state="ready"]').waitFor();
  await settled(race.locator('[data-hardware]'));const currentHit=await hoverPart(race.locator('[data-hardware]'));
  await race.evaluate(()=>window.__heldModels[1].release());await race.waitForTimeout(150);
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-selection'),currentHit.ref,'Stale promise cannot clear current identity');
  assert.equal(await race.locator('[data-hardware]').getAttribute('data-hardware-board-key'),'telemetry');
  assert.equal(await race.locator('select,input').count(),0,'No stale selection UI appended');
  await race.locator('[data-hardware-canvas]').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();});
  await race.locator('[data-hardware-state="unavailable"]').waitFor();
  assert.equal(await race.locator('[data-hardware-poster]').isVisible(),true);
  await race.locator('[data-hardware-board="ground"]').click();await race.waitForURL('**/boards/ground-station/');
  await race.close();console.log('PASS rapid pending board switches, stale promise isolation, context loss and fallback navigation');

  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});observe(noJS);
  await noJS.goto(base+route);assert.equal(await noJS.locator('[data-hardware-poster]').count(),1);
  assert.equal(await noJS.locator('[data-hardware-explode]').isVisible(),false);
  await noJS.locator('[data-hardware-board="ground"]').click();await noJS.waitForURL('**/boards/ground-station/');
  assert.equal(await noJS.locator('[data-hardware-poster]').isVisible(),true);
  assert.equal(await noJS.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await noJS.close();
  assert.deepEqual(errors,[]);console.log('PASS no-JavaScript board navigation and preview; no page errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

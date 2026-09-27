/* Home-page product choreography, lazy loading and accessible fallbacks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const manifest='/assets/models/kiku-p2/assembly.json';
(async()=>{
 await fs.mkdir('.codex-temp/hardware-qa',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>requests.push(request.url()));
   await page.goto(base+'/v2/',{waitUntil:'networkidle'});
   const root=page.locator('[data-hardware-auto]');
   assert.equal(await root.getAttribute('data-hardware-state'),'poster');
   assert.equal(requests.some(url=>url.includes(manifest)),false,'Product loads only near viewport');
   const seek=async phase=>{
    await root.locator('[data-hardware-stage]').evaluate((stage,phase)=>{
     const y=stage.getBoundingClientRect().top+scrollY-innerHeight+phase*(innerHeight+stage.clientHeight);
     scrollTo({top:y,behavior:'instant'});
    },phase);
    await page.locator('[data-hardware-auto][data-hardware-state="ready"]').waitFor({timeout:120000});
    await page.waitForFunction(expected=>{const node=document.querySelector('[data-hardware-auto]');return node.dataset.hardwareMotion==='idle'&&Math.abs(Number(node.dataset.hardwareProgress)-expected)<.001;},Math.sin(phase*Math.PI)**2,{timeout:60000});
    return Number(await root.getAttribute('data-hardware-progress'));
   };
   const early=await seek(.22),open=await seek(.5);
   assert.ok(early>.25&&early<.6,'Early scroll pose');assert.ok(open>.99,'Centered product separates');
   assert.equal(await root.getAttribute('data-hardware-components'),'14');
   assert.ok(Number(await root.getAttribute('data-hardware-draws'))<100,'Product material batching');
   await root.screenshot({path:`.codex-temp/hardware-qa/home-kiku-${width}.png`});
   const reverse=await seek(.22);assert.ok(Math.abs(reverse-early)<.001,'Reverse scroll restores pose');
   assert.equal(await root.locator('canvas').evaluate(canvas=>getComputedStyle(canvas).touchAction),'pan-y pinch-zoom');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const y=await page.evaluate(()=>scrollY);await page.mouse.move(width/2,400);await page.mouse.wheel(0,180);await page.waitForTimeout(500);
   assert.ok(await page.evaluate(()=>scrollY)>y,'Native wheel scroll remains available');
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS home Kiku ${width}px: lazy loading, 14 groups, reversible scroll, native scrolling and fit`);
  }
  for(const preference of ['reduced','save-data']){
   const page=await browser.newPage({reducedMotion:preference==='reduced'?'reduce':'no-preference'}),requests=[];
   if(preference==='save-data')await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
   page.on('request',request=>requests.push(request.url()));
   await page.goto(base+'/v2/',{waitUntil:'networkidle'});const root=page.locator('[data-hardware-auto]');await root.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
   assert.equal(await root.getAttribute('data-hardware-state'),'poster');assert.equal(requests.some(url=>url.includes(manifest)),false);assert.equal(await root.locator('[data-hardware-start]').isVisible(),true);
   await page.close();console.log(`PASS ${preference}: explicit product opt-in`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

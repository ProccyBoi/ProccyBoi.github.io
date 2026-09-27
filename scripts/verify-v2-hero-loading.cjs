/* Progressive hero loading acceptance. Real models/rendering are retained;
 * routes only delay one dependency/model or fail one supporting model.
 * Requires Playwright and a static server. Optional V2_BASE_URL,
 * CHROMIUM_EXECUTABLE. --fault-only runs just render rollback and print. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const root='[data-assembly]';
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};};
async function phase(page,value){
  await page.evaluate(progress=>{
    const node=document.querySelector('[data-assembly]');
    scrollTo({top:scrollY+node.getBoundingClientRect().top+progress*(node.offsetHeight-node.querySelector('.v2-assembly-sticky').clientHeight),behavior:'instant'});
  },value);
  await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-progress)<.0002,value,{timeout:15000});
}
async function posterVisible(page,index){
  await page.waitForFunction(i=>{
    const node=document.querySelectorAll('[data-assembly-posters] img')[i];
    const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
    return node.naturalWidth>0&&style.visibility==='visible'&&Number(style.opacity)>.95&&bounds.width>0&&bounds.right>0&&bounds.left<innerWidth;
  },index,{timeout:15000});
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];
  try{
    if(!process.argv.includes('--fault-only')){
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    page.on('pageerror',error=>errors.push(error.message));
    const dependency=gate(),pi=gate();
    await page.route('**/three.min.js',async route=>{await dependency.promise;await route.continue();});
    await page.route('**/framework-pi-board.glb',async route=>{await pi.promise;await route.continue();});
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Number(document.querySelector('[data-assembly]').dataset.assemblyFrames)>0,null,{timeout:10000});
    const posterFrameMs=await page.evaluate(()=>performance.now());
    assert.equal(await page.evaluate(()=>Boolean(window.THREE)),false,'Scroll posters must render before Three.js downloads');
    await phase(page,.565);await posterVisible(page,1);
    assert.equal(await page.locator('[data-assembly-title]').textContent(),'Telemetry');
    assert.equal(await page.locator('[data-assembly-link]').getAttribute('href'),'/v2/projects/skylabs/boards/telemetry/');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.v2-assembly-sticky')).position!=='sticky');
    assert.equal(await page.locator('[data-assembly-posters] img').evaluateAll(images=>images.every(image=>getComputedStyle(image).visibility==='visible'&&getComputedStyle(image).opacity==='1')),true,'Changing motion preference mid-load must restore all compact posters even before the media-query callback');
    assert.equal(await page.locator('[data-assembly-canvas]').evaluate(canvas=>getComputedStyle(canvas).opacity),'0');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.v2-assembly-sticky')).position==='sticky');
    await phase(page,.565);await posterVisible(page,1);
    await phase(page,0);
    dependency.release();
    await page.waitForFunction(()=>Number(document.querySelector('[data-assembly]').dataset.assemblyModelsReady)===2,null,{timeout:60000});
    const firstReady=await page.locator(root).evaluate(node=>({firstModel:node.dataset.assemblyFirstModel,firstModelMs:Number(node.dataset.assemblyFirstModelMs),state:node.dataset.assemblyState,modelsReady:Number(node.dataset.assemblyModelsReady)}));
    assert.equal(firstReady.state,'ready');
    assert.equal(await page.locator('[data-assembly-posters] img').nth(2).getAttribute('data-assembly-model-state'),'loading');
    assert.equal(await page.locator(root).evaluate(node=>node.classList.contains('is-loaded')),true,'Other models must reach the canvas while Pi is delayed');
    await phase(page,.88);await posterVisible(page,2);
    assert.equal(await page.locator('[data-assembly-title]').textContent(),'Raspberry Pi');
    pi.release();
    await page.waitForFunction(()=>document.querySelector('[data-assembly]').dataset.assemblyModelsSettled==='3',null,{timeout:60000});
    await page.waitForFunction(()=>Number(getComputedStyle(document.querySelectorAll('[data-assembly-posters] img')[2]).opacity)<.05);
    assert.ok(Number(await page.locator(root).getAttribute('data-assembly-draws'))>0,'Late Pi must render at its current chapter');
    console.log(JSON.stringify({case:'delayed Pi and dependency',posterFrameMs:Math.round(posterFrameMs),...firstReady}));
    await page.close();

    const partial=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
    partial.on('pageerror',error=>errors.push(error.message));
    await partial.route('**/hardware/skylabs-telemetry/board.glb',route=>route.abort('failed'));
    await partial.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    await partial.waitForFunction(()=>document.querySelector('[data-assembly]').dataset.assemblyModelsSettled==='3',null,{timeout:60000});
    assert.equal(await partial.locator(root).getAttribute('data-assembly-state'),'ready');
    assert.equal(await partial.locator(root).getAttribute('data-assembly-models-ready'),'2');
    assert.equal(await partial.locator('[data-assembly-posters] img').nth(1).getAttribute('data-assembly-model-state'),'unavailable');
    await phase(partial,.565);await posterVisible(partial,1);
    assert.equal(await partial.locator('[data-assembly-title]').textContent(),'Telemetry');
    assert.equal(await partial.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Fallback must not widen the mobile page');
    await partial.locator('[data-assembly-canvas]').evaluate(node=>node.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await phase(partial,.88);await posterVisible(partial,2);
    assert.equal(await partial.locator(root).getAttribute('data-assembly-state'),'unavailable');
    console.log('PASS: supporting-model failure retains other CAD and animated mobile poster; context loss restores all posters');
    await partial.close();
    }

    // A small deterministic assembly isolates failure after a model has been
    // installed, rather than repeating expensive source-CAD parsing.
    const fault=await browser.newPage({viewport:{width:1280,height:900}});
    fault.on('pageerror',error=>errors.push(error.message));
    await fault.addInitScript(()=>{
      window.V2AssemblyModels={load:async name=>{
        const T=window.THREE,group=new T.Group();
        const object=new T.Mesh(new T.BoxGeometry(1,.1,1),new T.MeshBasicMaterial({color:0x174faa}));
        group.add(object);
        if(name==='telemetry') object.position.copy=()=>{throw new Error('Intentional first-render failure');};
        return {group,parts:[{object,base:new T.Vector3(),offset:new T.Vector3(0,1,0)}]};
      }};
    });
    await fault.goto(base+'/v2/',{waitUntil:'domcontentloaded'});
    await fault.waitForFunction(()=>document.querySelector('[data-assembly]').dataset.assemblyModelsSettled==='3',null,{timeout:30000});
    assert.equal(await fault.locator(root).getAttribute('data-assembly-models-ready'),'2','A partially installed failed model must be removed from its slot');
    assert.equal(await fault.locator('[data-assembly-posters] img').nth(1).getAttribute('data-assembly-model-state'),'unavailable');
    await phase(fault,.565);await posterVisible(fault,1);
    console.log('PASS: first-render failure rolls back the model slot and restores its chapter poster');
    await phase(fault,.88);
    await fault.emulateMedia({media:'print'});
    assert.equal(await fault.locator('[data-assembly-posters] img').evaluateAll(images=>images.every(image=>{
      const style=getComputedStyle(image),bounds=image.getBoundingClientRect(),stage=image.parentElement.getBoundingClientRect();
      const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;
      return style.visibility==='visible'&&style.opacity==='1'&&x>=stage.left&&x<=stage.right&&y>=stage.top&&y<=stage.bottom;
    })),true,'Print must restore all three visible posters inside the compact composition');
    assert.equal(await fault.locator('[data-assembly-canvas]').evaluate(canvas=>getComputedStyle(canvas).display),'none');
    console.log('PASS: print restores the compact poster composition after scrolling and CAD loading');
    assert.deepEqual(errors,[],'No uncaught browser errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

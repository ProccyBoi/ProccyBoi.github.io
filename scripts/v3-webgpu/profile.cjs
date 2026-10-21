#!/usr/bin/env node
/* Same-runner observations, deliberately without the correctness GPU wrappers.
 * Local HTTP removes internet latency. SwiftShader is SOFTWARE rendering.
 * Results are not evidence for user-device speedups or battery consumption. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const base=(process.env.V3_BASE_URL||'http://127.0.0.1:8080').replace(/\/$/,''),out=process.env.V3_PROFILE_OUT||'/tmp/v3-webgpu-profile';
fs.mkdirSync(out,{recursive:true});
const report={started:new Date().toISOString(),viewport:{width:1440,height:900},deviceScaleFactor:1,adapter:'SwiftShader software requested; inspect run diagnostics',method:'Same runner, direct aircraft anchor, uninstrumented native rendering, cold browser-context cache plus warm reload; deterministic completed-pose response timings.',limits:['Loopback HTTP is not a real network benchmark.','Software GPU numbers do not predict physical devices.','Lighting and material pipelines differ in the new renderer; this is not a pixel-identical performance comparison.','Pose response latency includes requestAnimationFrame scheduling, renderer work and asynchronous queue/fence completion; it is not an isolated GPU timer.'],runs:[],failures:[]};
const save=()=>fs.writeFileSync(path.join(out,'profile.json'),JSON.stringify(report,null,2)+'\n');
const percentile=(values,p)=>{const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*p))]??null;};
async function run(browser,variant,round){
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});
 const page=await context.newPage();page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 const record={variant:variant.name,round,cold:null,warm:null,errors};
 try{
  for(const cache of ['cold','warm']){
   const started=Date.now();
   const url=base+variant.route+'?capture&'+variant.query+'#skylabs-aircraft';
   if(cache==='cold')await page.goto(url,{waitUntil:'domcontentloaded'});else await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>Number(document.querySelector('[data-aircraft-hero]')?.dataset.aircraftFrames||0)>0,null,{timeout:180000});
   const usable=await page.evaluate(()=>({at:performance.now(),firstLive:Number(document.querySelector('[data-aircraft-hero]').dataset.aircraftFirstLiveMs||0),state:{...document.querySelector('[data-aircraft-hero]').dataset},diagnostic:window.V3WebGPU?.snapshot?.()||null,resources:performance.getEntriesByType('resource').filter(x=>/script|fetch|xmlhttprequest/.test(x.initiatorType)).map(x=>({name:new URL(x.name).pathname,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,duration:x.duration})),navigation:performance.getEntriesByType('navigation').map(x=>({domContentLoaded:x.domContentLoadedEventEnd,load:x.loadEventEnd}))}));
   if(variant.name==='v3-webgpu'){assert.equal(usable.diagnostic?.backend,'webgpu','WebGPU profile may not silently measure fallback');assert.equal(usable.diagnostic?.ready,true);assert.ok(usable.diagnostic?.completedFrames>0);}
   await page.waitForFunction(()=>window.__v3Aircraft?.flight?.telemetryReady,null,{timeout:180000});
   const samples=[];
   for(const progress of [.08,.18,.30,.42,.54,.64,.74,.84,.94,.84,.70,.54,.38,.22,.08]){
    const start=await page.evaluate(value=>{const r=document.querySelector('[data-aircraft-hero]');const frames=Number(r.dataset.aircraftFrames||0),at=performance.now();window.__v3Aircraft.seekProgress(value);return{at,frames};},progress);
    await page.waitForFunction(({frames,value})=>{const r=document.querySelector('[data-aircraft-hero]');return Number(r.dataset.aircraftFrames||0)>frames&&Math.abs(Number(r.dataset.aircraftRenderedProgress)-value)<.0001;},{frames:start.frames,value:progress},{timeout:120000});
    samples.push(await page.evaluate(({at,value})=>({progress:value,completedPoseMs:performance.now()-at,frame:JSON.parse(document.querySelector('[data-aircraft-hero]').dataset.aircraftLastFrame||'null')}),{at:start.at,value:progress}));
   }
   record[cache]={wallMs:Date.now()-started,firstUsableMs:usable.firstLive||usable.at,usable,poses:samples,medianPoseMs:percentile(samples.map(x=>x.completedPoseMs),.5),p95PoseMs:percentile(samples.map(x=>x.completedPoseMs),.95)};
   await page.screenshot({path:path.join(out,`${variant.name}-${round}-${cache}.png`),timeout:30000});
   assert.deepEqual(errors,[],'No page errors allowed in a valid profile');
   save();
  }
 }catch(error){record.error=String(error.stack||error);report.failures.push({variant:variant.name,round,error:record.error});}
 finally{report.runs.push(record);save();await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu']});report.browserVersion=browser.version();
 const variants=[{name:'v2-webgl',route:'/v2/',query:''},{name:'v3-webgl',route:'/v3/',query:'renderer=webgl'},{name:'v3-webgpu',route:'/v3/',query:'renderer=webgpu'}];
 try{for(let round=0;round<2;round++)for(const variant of round?[...variants].reverse():variants)await run(browser,variant,round+1);}finally{await browser.close();report.finished=new Date().toISOString();report.passed=report.failures.length===0;save();}
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
})().catch(error=>{report.failures.push(String(error.stack||error));save();console.error(error);process.exitCode=1;});

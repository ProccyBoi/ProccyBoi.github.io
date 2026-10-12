/* Test-only matched navigation profile. No production changes or forced scene state.
 * V2_NAV_BASELINE_ROOT=/tmp/v2-navigation-baseline V2_NAV_ROOT=$PWD \
 *   V2_NAV_OUT=/tmp/v2-navigation/profile.json node scripts/profile-v2-navigation.cjs
 * node scripts/profile-v2-navigation.cjs --source-only
 * Official Playwright 1.57; two cold 15 s top pairs in AB/BA order, desktop
 * 1440x1000 DPR 1, 10 Mbps / 40 ms. Pair 1 continues to separately delimited
 * native-wheel Selected / aircraft phases. Actual mobile menu clicks are a
 * separate matched 390x844 sidecar, never part of the desktop top comparison.
 * Uses profile-v2-load.cjs's verified gzip/cache fixture and passive trace
 * exports unchanged. Browser/OS/GPU caches outside contexts are not reset.
 * One nine-minute global deadline bounds failures and preserves partial JSON.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {prepareFixture,responseFor,browserProbe,summary,classifyRequests}=require('./profile-v2-load.cjs');
const repo=path.resolve(__dirname,'..'),horizonMs=15000;
const network={offline:false,latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
const viewport={width:1440,height:1000};
const modelURL=url=>/\.(?:glb|gltf|stl|bin)(?:\.gz)?(?:\?|$)|\/models\/.*\.json(?:\?|$)/i.test(url);
const round=n=>Number.isFinite(n)?Math.round(n*100)/100:null;

// Read-only observers plus wrappers that return every original result. No
// scheduling, fence result, model, visibility or renderer-quality overrides.
function navigationProbe(){
 const p=window.__v2NavProbe={phase:'untouched-top',contexts:[],fences:[],maxConcurrentFences:0,drawsWhilePending:[],events:[],timeline:[],factoryGeometry:[],posters:[],milestones:{},errors:[]};
 const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
 const selectors={hero:'[data-assembly]',selected:'[data-selected-work]',aircraft:'[data-aircraft-hero]'};
 const now=()=>performance.now();
 const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
 const area=(r,top)=>r?Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(top,r.top)):0;
 const painted=node=>{for(let n=node;n instanceof Element;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return !!node;};
 function geometry(owner){
  const root=document.querySelector(selectors[owner]),canvas=root?.querySelector('canvas');
  const stage=root?.querySelector(owner==='hero'?'.v2-assembly-stage':owner==='selected'?'.v2-selected-stage':'[data-aircraft-stage]');
  const headerBottom=Math.max(0,document.querySelector('.v2-header')?.getBoundingClientRect().bottom||0);
  const rb=box(root),sb=box(stage),cb=box(canvas),hero=document.querySelector(selectors.hero)?.dataset;
  return{atMs:now(),scrollY,root:rb,stage:sb,canvas:cb,headerBottom,stageArea:area(sb,headerBottom),canvasArea:area(cb,headerBottom),canvasPainted:painted(canvas),
   firstHeroFenceMs:Number(hero?.assemblyFirstModelMs)||null,heroModelsReady:Number(hero?.assemblyModelsReady||0),heroForegroundSettled:hero?.assemblyForegroundSettled||null,heroReadableVisible:hero?.assemblyReadableVisible||null};
 }
 const once=(key,value)=>{if(p.milestones[key]===undefined&&Number.isFinite(value))p.milestones[key]=value;};
 function snapshot(){return{atMs:now(),phase:p.phase,scrollY,documentHeight:document.documentElement.scrollHeight,scenes:Object.fromEntries(Object.entries(selectors).map(([owner,selector])=>{
  const root=document.querySelector(selector);return[owner,{geometry:geometry(owner),dataset:{...root?.dataset},canvas:{width:root?.querySelector('canvas')?.width,height:root?.querySelector('canvas')?.height}}];})),contexts:p.contexts.map(c=>({...c}))};}
 function currentFrame(owner){
  const root=document.querySelector(selectors[owner]),d=root?.dataset,k=owner==='selected'?'selected':'aircraft',canvas=root?.querySelector('canvas'),frame=parse(d?.[k+'LastFrame']),g=geometry(owner);
  const current=!!(frame?.published&&frame.gpu?.state==='complete'&&frame.completedMs&&d[k+'GPUPending']!=='true'&&d[k+'WarmMask']==='false'&&
   !frame.measurement.warm&&frame.measurement.width===canvas?.width&&frame.measurement.height===canvas?.height&&frame.measurement.pixelRatio===Number(d[k+'LivePixelRatio'])&&
   frame.revision===Number(d[k+'PoseRevision'])&&(owner==='selected'||frame.layoutRevision===Number(d.aircraftLayoutRevision))&&g.canvasArea>0&&g.canvasPainted);
  return{current,frame,geometry:g};
 }
 function inspect(){
  const d=document.querySelector(selectors.hero)?.dataset,g=geometry('hero');
  if(d?.assemblyGPUCompletionEvidence==='own-context-fence'&&g.canvasArea>0&&g.canvasPainted){
   if(Number(d.assemblyModelsReady)>0)once('heroFirstVisibleFencedMs',Number(d.assemblyFirstModelMs));
   if(d.assemblyModelsReady==='3')once('heroFullVisibleFencedMs',Number(d.assemblyLastCompletedMs));
   if(d.assemblyForegroundSettled==='true')once('heroForegroundSettledMs',now());
  }
  for(const owner of ['selected','aircraft']){const state=currentFrame(owner);if(state.current)once(owner+'CurrentVisibleFencedMs',state.frame.completedMs);}
 }
 p.snapshot=snapshot;p.currentFrame=currentFrame;p.inspect=inspect;p.geometry=geometry;
 const getContext=HTMLCanvasElement.prototype.getContext,seen=new WeakMap();
 HTMLCanvasElement.prototype.getContext=function(type,...args){const gl=getContext.call(this,type,...args);if(gl&&/webgl/.test(type)&&!seen.has(gl)){
  const owner=this.matches('[data-assembly-canvas]')?'hero':this.matches('[data-selected-canvas]')?'selected':this.matches('[data-aircraft-canvas]')?'aircraft':'other';
  const record={owner,atMs:now(),phase:p.phase,pending:0,maxPending:0,drawCalls:0,geometry:owner==='other'?null:geometry(owner)};seen.set(gl,record);p.contexts.push(record);
  if(gl.fenceSync){const held=new Map(),make=gl.fenceSync.bind(gl),poll=gl.clientWaitSync.bind(gl),drop=gl.deleteSync.bind(gl);
   gl.fenceSync=(...a)=>{const sync=make(...a);if(sync){const r={owner,startMs:now(),phase:p.phase,polls:0,geometry:owner==='other'?null:geometry(owner)};held.set(sync,r);p.fences.push(r);record.pending++;record.maxPending=Math.max(record.maxPending,record.pending);r.concurrentFences=p.contexts.reduce((n,c)=>n+c.pending,0);p.maxConcurrentFences=Math.max(p.maxConcurrentFences,r.concurrentFences);}return sync;};
   gl.clientWaitSync=(sync,flags,timeout)=>{const status=poll(sync,flags,timeout),r=held.get(sync);if(timeout!==0)p.errors.push('Blocking native fence wait');if(r){r.polls++;if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)r.completedMs=now();}return status;};
   gl.deleteSync=sync=>{const r=held.get(sync);if(r){r.deletedMs=now();record.pending--;held.delete(sync);}return drop(sync);};
  }
  for(const method of ['drawElements','drawArrays']){const draw=gl[method].bind(gl);gl[method]=(...a)=>{record.drawCalls++;record.firstDraw||={atMs:now(),phase:p.phase,geometry:owner==='other'?null:geometry(owner)};if(record.pending)p.drawsWhilePending.push({owner,atMs:now(),pending:record.pending});return draw(...a);};}
 }return gl;};
 // Enrich factory entry with geometry by composing the existing passive
 // probe's property setter, rather than replacing production factory logic.
 for(const [key,owner] of [['V2SelectedAssets','selected'],['V3AircraftScene','aircraft']]){
  const descriptor=Object.getOwnPropertyDescriptor(window,key);
  Object.defineProperty(window,key,{configurable:true,get:descriptor.get,set(original){const wrapped={...original};for(const method of ['load','loadStatic'])if(typeof original[method]==='function')wrapped[method]=function(...args){p.factoryGeometry.push({owner,method,name:typeof args[0]==='string'?args[0]:'airframe',atMs:now(),phase:p.phase,geometry:geometry(owner)});return original[method].apply(this,args);};descriptor.set(wrapped);}});
 }
 for(const type of ['keydown','click','wheel'])addEventListener(type,event=>{
  const menu=!!event.target.closest?.('[data-v2-menu]');
  if((type==='keydown'&&['F8','Escape'].includes(event.key))||menu||type==='wheel')p.events.push({type,key:event.key||null,menu,trusted:event.isTrusted,atMs:now(),eventMs:event.timeStamp,delayMs:Math.max(0,now()-event.timeStamp),phase:p.phase,scrollY});
 },{capture:true,passive:true});
 addEventListener('DOMContentLoaded',()=>{
  const images=[...document.querySelectorAll('[data-assembly-posters] img,[data-selected-image],[data-aircraft-poster]')];
  for(const img of images){const record={src:img.currentSrc||img.src,owner:img.closest('[data-assembly]')?'hero':img.closest('[data-selected-work]')?'selected':'aircraft'};p.posters.push(record);
   const loaded=()=>{record.loadedMs=now();record.naturalWidth=img.naturalWidth;};if(img.complete&&img.naturalWidth)loaded();else img.addEventListener('load',loaded,{once:true});
   // Do not call decode() or change image loading priority from the profiler.
  }
  new MutationObserver(()=>{inspect();}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-assembly-models-ready','data-assembly-foreground-settled','data-selected-last-frame','data-aircraft-last-frame']});
  inspect();p.timeline.push(snapshot());
 });
 const interval=setInterval(()=>{inspect();p.timeline.push(snapshot());},250);
 setTimeout(()=>{inspect();p.topObservedSnapshot=snapshot();p.topObservedSnapshot.requestedHorizonMs=15000;},Math.max(0,15000-now()));
 p.stop=()=>{clearInterval(interval);inspect();};
}

function windowSummary(sample,startMs,endMs){
 const tasks=sample.metrics.longTasks.filter(x=>x.startMs<endMs&&x.startMs+x.durationMs>startMs);
 const events=sample.nav.events.filter(x=>x.atMs>=startMs&&x.atMs<=endMs),requests=sample.requests.filter(x=>x.startMs<=endMs&&x.endMs>=startMs);
 const finished=requests.filter(x=>x.finished&&x.endMs<=endMs);
 const within=value=>Number.isFinite(value)&&value<=endMs&&value>=startMs?round(value):null;
 return{startMs,endMs,durationMs:endMs-startMs,
  milestones:Object.fromEntries(Object.entries(sample.nav.milestones).map(([key,value])=>[key,within(value)])),
  posters:sample.nav.posters.map(p=>({...p,loadedByHorizon:Number.isFinite(p.loadedMs)&&p.loadedMs<=endMs})),
  longTasks:{count:tasks.length,totalFullDurationMs:round(tasks.reduce((n,x)=>n+x.durationMs,0)),maxMs:round(Math.max(0,...tasks.map(x=>x.durationMs))),clippedOccupancyMs:round(tasks.reduce((n,x)=>n+Math.max(0,Math.min(endMs,x.startMs+x.durationMs)-Math.max(startMs,x.startMs)),0))},
  trustedKeyDelayMs:summary(events.filter(x=>x.type==='keydown'&&x.key==='F8'&&x.trusted).map(x=>x.delayMs)),
  trustedMenuDelayMs:summary(events.filter(x=>x.menu&&x.type==='click'&&x.trusted).map(x=>x.delayMs)),
  keyDelivery:{sent:sample.inputs.filter(x=>x.sentPageMs>=startMs&&x.sentPageMs<=endMs).length,received:events.filter(x=>x.key==='F8'&&x.trusted).length},
  gpuWaits:sample.metrics.gpu.filter(x=>x.startMs>=startMs&&x.startMs<=endMs),
  modelConstruction:sample.nav.factoryGeometry.filter(x=>x.atMs>=startMs&&x.atMs<=endMs),
  contextCountByHorizon:sample.nav.contexts.filter(x=>x.atMs<=endMs).length,
  contextFirstDraws:sample.nav.contexts.filter(x=>x.firstDraw?.atMs<=endMs).map(x=>({owner:x.owner,...x.firstDraw})),
  maxConcurrentFences:Math.max(0,...sample.nav.fences.filter(x=>x.startMs>=startMs&&x.startMs<=endMs).map(x=>x.concurrentFences||0)),
  transport:{completedResponseWireBytes:finished.reduce((n,x)=>n+(x.wireBytes||0),0),completedModelWireBytes:finished.filter(x=>modelURL(x.url)).reduce((n,x)=>n+(x.wireBytes||0),0),
   modelRequests:requests.filter(x=>modelURL(x.url)).map(x=>({path:x.path,startMs:x.startMs,endMs:x.endMs,wireBytes:x.wireBytes,finishedByHorizon:x.finished&&x.endMs<=endMs})),
   inFlightAtHorizon:sample.requests.filter(x=>x.startMs<=endMs&&(!x.finished||x.endMs>endMs)).map(x=>({path:x.path,startMs:x.startMs,receivedBodyBytes:(x.dataReceipts||[]).filter(c=>c.atMs<=endMs).reduce((n,c)=>n+c.bytes,0)}))}};
}
function validate(sample){
 assert.deepEqual(sample.errors,[],'No uncaught browser errors');assert.deepEqual(sample.nav.errors,[],'No blocking fence waits');
 assert.ok(sample.metrics.observerSupport.longtask,'Long-task observer available');
 assert.ok(sample.nav.contexts.every(c=>c.maxPending<=1),'At most one outstanding native fence per context');
 assert.deepEqual(sample.nav.drawsWhilePending,[],'No draw while its own native fence remains pending');
 assert.ok(sample.nav.contexts.length<=3,'At most the three existing WebGL contexts');
 assert.ok(sample.nav.events.some(x=>x.trusted),'Trusted native inputs were delivered');
 assert.equal(sample.requests.some(x=>x.fromServiceWorker),false,'No service-worker response');
 assert.deepEqual(sample.requests.filter(x=>x.error&&!/ERR_ABORTED/.test(x.error)),[],'No failed non-aborted requests');
 if(sample.scenario==='menu'){assert.equal(sample.menuChecks.length,3);assert.ok(sample.nav.events.filter(x=>x.menu&&x.type==='click'&&x.trusted).length>=3);return;}
 assert.ok(sample.nav.topObservedSnapshot,'Observed the 15 s cutoff');
 assert.ok(sample.nav.timeline.filter(x=>x.atMs<=horizonMs).every(x=>x.scrollY===0),'Untouched top has no scroll');
 assert.ok(sample.top.trustedKeyDelayMs.count>0,'Trusted key delivery within fixed top horizon');
 assert.equal(sample.requests.filter(x=>modelURL(x.url)).some(x=>x.fromDiskCache||x.servedFromCache),false,'Cold context must not reuse browser model cache');
 if(sample.phase==='candidate'){
  const starts=[...sample.nav.fences.filter(x=>x.owner!=='hero'&&x.startMs<=horizonMs),...sample.nav.contexts.filter(x=>x.owner!=='hero'&&x.firstDraw?.atMs<=horizonMs).map(x=>x.firstDraw)];
  for(const start of starts)if(start.geometry?.stageArea===0)assert.ok(start.geometry.firstHeroFenceMs>0&&start.geometry.heroForegroundSettled==='true','Offscreen secondary GPU waits for fenced settled foreground hero');
 }
 if(sample.journey){
  assert.ok(sample.nav.milestones.heroFullVisibleFencedMs>0,'Full hero fenced before native journey');
  assert.ok(sample.journey.selected.current&&sample.journey.aircraft.current&&sample.journey.telemetry.current,'Current-size published native-fenced visible frames');
  const stages=JSON.parse(sample.journey.selectedState.selectedPreparationMeasurements||'[]');
  const complete=new Set(stages.filter(s=>s.completed&&s.gpu?.state==='complete').map(s=>s.kind+':'+s.name));
  assert.ok(['model:esp32','model:dual','model:pi','model:logic','model:metro','model:tramtrace','composition:0','composition:1'].every(k=>complete.has(k)),'All eight Selected warm stages fenced');
  assert.equal(sample.journey.telemetryState.aircraftTelemetryReady,'true','Real aircraft telemetry loaded');
  for(const owner of ['hero','selected','aircraft']){
   const window=sample.journey.inactiveWindows[owner],before=window.before.scenes[owner],after=window.after.scenes[owner],prefix=owner==='hero'?'assembly':owner;
   assert.equal(before.geometry.canvasArea,0,owner+' is geometrically inactive');assert.equal(after.geometry.canvasArea,0);
   assert.equal(before.dataset[prefix+'SubmittedFrames'],after.dataset[prefix+'SubmittedFrames'],owner+' has stable inactive submitted-frame count');
  }
 }
}
async function nativeApproach(page,selector,timeout){
 const started=Date.now();await page.mouse.move(1400,880);
 while(Date.now()-started<timeout){const delta=await page.evaluate(selector=>{const n=document.querySelector(selector);if(!n)throw Error('Missing native destination '+selector);return n.getBoundingClientRect().top-Math.max(0,document.querySelector('.v2-header').getBoundingClientRect().bottom)-16;},selector);
  if(Math.abs(delta)<5)return;
  await page.mouse.wheel(0,Math.sign(delta)*Math.min(720,Math.abs(delta)));await page.waitForTimeout(100);
 }
 throw Error('Native wheel did not reach '+selector);
}
async function measure(browser,base,spec,budget){
 const context=await browser.newContext({viewport:spec.scenario==='menu'?{width:390,height:844}:viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
 const page=await context.newPage(),cdp=await context.newCDPSession(page),records=new Map(),errors=[],inputs=[],menuChecks=[];
 let navigationTimestamp,timer,stop=false,pending=[],failure,journey;
 await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',network);
 cdp.on('Network.requestWillBeSent',e=>{if(e.type==='Document'&&new URL(e.request.url).pathname==='/v2/')navigationTimestamp=e.timestamp;records.set(e.requestId,{url:e.request.url,type:e.type,start:e.timestamp,servedFromCache:false});});
 cdp.on('Network.requestServedFromCache',e=>{const r=records.get(e.requestId);if(r)r.servedFromCache=true;});
 cdp.on('Network.responseReceived',e=>{const r=records.get(e.requestId);if(r)Object.assign(r,{response:e.timestamp,status:e.response.status,fromDiskCache:!!e.response.fromDiskCache,fromServiceWorker:!!e.response.fromServiceWorker});});
 cdp.on('Network.dataReceived',e=>{const r=records.get(e.requestId);if(r)(r.dataReceipts||=[]).push({at:e.timestamp,bytes:e.encodedDataLength});});
 cdp.on('Network.loadingFinished',e=>{const r=records.get(e.requestId);if(r)Object.assign(r,{end:e.timestamp,finished:true,wireBytes:e.encodedDataLength});});
 cdp.on('Network.loadingFailed',e=>{const r=records.get(e.requestId);if(r)Object.assign(r,{end:e.timestamp,error:e.errorText});});
 // Multiple init-script ordering is not a Playwright contract. One script
 // guarantees that our compositional factory wrappers see the passive probe.
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript({content:'('+browserProbe.toString()+')();('+navigationProbe.toString()+')();'});
 let captured;
 try{
  await page.goto(base+'/v2/',{waitUntil:'commit',timeout:budget(20000)});
  // Schedule independently of renderer acknowledgement, and derive page time
  // after capture. An early CPU stall must not postpone sending the probes.
  const pulse=()=>{if(stop)return;const sent=Date.now(),record={sentEpochMs:sent};inputs.push(record);const promise=cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119,timestamp:sent/1000}).then(()=>cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119,timestamp:Date.now()/1000})).then(()=>{record.ackMs=Date.now()-sent;},e=>{record.error=String(e);});pending.push(promise);};
  pulse();timer=setInterval(pulse,1000);
  if(spec.scenario==='menu'){
   await page.evaluate(()=>{window.__v2NavProbe.phase='mobile-menu';window.__v2LoadProbe.phase='mobile-menu';});
   for(let i=0;i<3;i++){await page.locator('[data-v2-menu]').click({timeout:budget(15000)});assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');menuChecks.push({iteration:i+1,opened:true,escaped:true});await page.waitForTimeout(250);}
  }else{
   await page.waitForFunction(()=>!!window.__v2NavProbe?.topObservedSnapshot,null,{timeout:budget(22000)});
   // Save the fixed window before awaiting any later milestone. A late hero is
   // censored in top metrics, not silently given a longer measurement window.
   if(spec.pair===1){
    await page.evaluate(()=>{window.__v2NavProbe.phase='post-top-hero';window.__v2LoadProbe.phase='post-top-hero';});
    await page.waitForFunction(()=>Number.isFinite(window.__v2NavProbe?.milestones.heroFullVisibleFencedMs),null,{timeout:budget(40000)});
    journey={inactiveWindows:{}};
    for(const [name,selector,owner] of [['selected','[data-selected-work]','selected'],['aircraft','[data-aircraft-hero]','aircraft'],['telemetry','#skylabs-telemetry','aircraft']]){
     journey[name+'StartMs']=await page.evaluate(name=>{window.__v2NavProbe.phase=name;window.__v2LoadProbe.phase=name;return performance.now();},name);
     await nativeApproach(page,selector,budget(12000));
     await page.waitForFunction(({owner,name})=>{const p=window.__v2NavProbe,s=p.currentFrame(owner),d=document.querySelector(owner==='selected'?'[data-selected-work]':'[data-aircraft-hero]').dataset;return s.current&&(owner!=='selected'||d.selectedBackgroundReady==='true')&&(name!=='telemetry'||(d.aircraftTelemetryReady==='true'&&d.aircraftChapter==='1'&&s.frame.kind==='progress'));},{owner,name},{timeout:budget(50000)});
     const state=await page.evaluate(owner=>({ready:window.__v2NavProbe.currentFrame(owner),dataset:{...document.querySelector(owner==='selected'?'[data-selected-work]':'[data-aircraft-hero]').dataset},atMs:performance.now()}),owner);
     journey[name]=state.ready;journey[name+'State']=state.dataset;journey[name+'ReadyMs']=state.atMs;
    }
    await page.evaluate(()=>{window.__v2NavProbe.phase='inactive-upper-scenes';window.__v2LoadProbe.phase='inactive-upper-scenes';});
    // While aircraft is visible, hero and Selected must stop. Home then makes
    // aircraft inactive. Do not assume the footer is taller than a viewport.
    await page.waitForTimeout(750);let before=await page.evaluate(()=>window.__v2NavProbe.snapshot());await page.waitForTimeout(1200);let after=await page.evaluate(()=>window.__v2NavProbe.snapshot());
    journey.inactiveWindows.hero={before,after};journey.inactiveWindows.selected={before,after};
    await page.keyboard.press('Home');await page.waitForTimeout(750);
    await page.evaluate(()=>{window.__v2NavProbe.phase='inactive-aircraft';window.__v2LoadProbe.phase='inactive-aircraft';});
    before=await page.evaluate(()=>window.__v2NavProbe.snapshot());await page.waitForTimeout(1200);after=await page.evaluate(()=>window.__v2NavProbe.snapshot());
    journey.inactiveWindows.aircraft={before,after};
   }
  }
 }catch(error){failure=String(error);}
 finally{
  stop=true;clearInterval(timer);await Promise.allSettled(pending);
  try{captured=await page.evaluate(()=>{window.__v2NavProbe?.stop();return{nav:JSON.parse(JSON.stringify(window.__v2NavProbe)),metrics:JSON.parse(JSON.stringify(window.__v2LoadProbe)),resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),paints:performance.getEntriesByType('paint').map(e=>e.toJSON()),capturedMs:performance.now(),timeOrigin:performance.timeOrigin};});}catch(error){failure||=String(error);captured={resources:[]};}
  await context.close();
 }
 for(const input of inputs)input.sentPageMs=input.sentEpochMs-captured.timeOrigin;
 const sample={...spec,...captured,inputs,menuChecks,journey,errors,requests:classifyRequests(records,captured.resources,navigationTimestamp),failure,valid:false};
 if(sample.nav&&sample.metrics){sample.top=spec.scenario==='top'?windowSummary(sample,0,horizonMs):null;sample.lastObservedTopState=sample.nav.timeline.filter(x=>x.atMs<=horizonMs).at(-1)||null;
  if(journey)sample.journeyWindows=Object.fromEntries(['selected','aircraft','telemetry'].filter(name=>journey[name+'ReadyMs']).map(name=>[name,windowSummary(sample,journey[name+'StartMs'],journey[name+'ReadyMs'])]));
  if(spec.scenario==='menu')sample.menu=windowSummary(sample,0,sample.capturedMs);
  try{if(failure)throw Error(failure);validate(sample);sample.valid=true;}catch(error){sample.failure=String(error);}
 }
 return sample;
}
function comparison(samples){
 const keys=['milestones.heroFirstVisibleFencedMs','milestones.heroFullVisibleFencedMs','longTasks.totalFullDurationMs','longTasks.maxMs','trustedKeyDelayMs.p95','transport.completedModelWireBytes','transport.completedResponseWireBytes','contextCountByHorizon'];
 const get=(o,key)=>key.split('.').reduce((v,k)=>v?.[k],o);
 return Object.fromEntries(keys.map(key=>{const group=phase=>samples.filter(s=>s.scenario==='top'&&s.phase===phase);return[key,{baseline:summary(group('baseline').map(s=>get(s.top,key))),candidate:summary(group('candidate').map(s=>get(s.top,key))),pairedCandidateMinusBaseline:summary(group('candidate').map(c=>{const b=group('baseline').find(b=>b.pair===c.pair),before=get(b?.top,key),after=get(c.top,key);return Number.isFinite(before)&&Number.isFinite(after)?after-before:NaN;}))}];}));
}
function sourceTests(){
 new vm.Script('('+navigationProbe.toString()+')()');
 assert.equal(horizonMs,15000);assert.deepEqual(viewport,{width:1440,height:1000});assert.equal(network.downloadThroughput,1250000);
 for(const fn of [prepareFixture,responseFor,browserProbe,classifyRequests])assert.equal(typeof fn,'function');
 const synthetic={nav:{milestones:{heroFirstVisibleFencedMs:14000,heroFullVisibleFencedMs:16000},posters:[],events:[{type:'keydown',key:'F8',trusted:true,atMs:14999,delayMs:3},{type:'keydown',key:'F8',trusted:true,atMs:15001,delayMs:999}],factoryGeometry:[],contexts:[],fences:[]},metrics:{longTasks:[{startMs:14950,durationMs:200},{startMs:15001,durationMs:999}],gpu:[]},requests:[],inputs:[{sentPageMs:14999}]};
 const result=windowSummary(synthetic,0,15000);assert.equal(result.milestones.heroFullVisibleFencedMs,null);assert.equal(result.longTasks.totalFullDurationMs,200);assert.equal(result.longTasks.clippedOccupancyMs,50);assert.equal(result.trustedKeyDelayMs.count,1);
 const empty={...synthetic,nav:{...synthetic.nav,events:[],contexts:[],errors:[],drawsWhilePending:[]},metrics:{...synthetic.metrics,observerSupport:{longtask:true}},errors:[]};
 assert.throws(()=>validate(empty),/Trusted native inputs/);
 assert.throws(()=>validate({...empty,nav:{...empty.nav,contexts:[{maxPending:2}]}}),/outstanding native fence/);
 assert.equal(comparison([{phase:'baseline',scenario:'top',pair:1,top:{milestones:{heroFullVisibleFencedMs:null}}},{phase:'candidate',scenario:'top',pair:1,top:{milestones:{heroFullVisibleFencedMs:9000}}}])['milestones.heroFullVisibleFencedMs'].pairedCandidateMinusBaseline.count,0,'Censored readiness must never be coerced to zero');
 console.log('PASS navigation-profile source: syntax, reused fixture exports, 15 s censoring, task clipping, trusted event guard, one-fence guard, no censored zero deltas. Browser/GPU run not claimed.');
}
async function main(){
 if(process.argv.includes('--source-only'))return sourceTests();
 assert.ok(process.env.V2_NAV_BASELINE_ROOT,'Set V2_NAV_BASELINE_ROOT to baseline 649bc32');
 const roots={baseline:path.resolve(process.env.V2_NAV_BASELINE_ROOT),candidate:path.resolve(process.env.V2_NAV_ROOT||repo)};assert.notEqual(roots.baseline,roots.candidate);
 const git=(root,...args)=>execFileSync('git',['-c','safe.directory='+root,...args],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(git(roots.baseline,'rev-parse','HEAD'),'649bc32ccbabf1c67cbf19628da42b6dbd836be1','Pinned navigation baseline');
 assert.equal(git(roots.baseline,'status','--porcelain','--untracked-files=no'),'','Baseline tracked sources are immutable');
 const out=path.resolve(process.env.V2_NAV_OUT||'.codex-temp/v2-navigation/profile.json');fs.mkdirSync(path.dirname(out),{recursive:true});
 const report={capturedAt:new Date().toISOString(),valid:false,horizonMs,network,viewport,deviceScaleFactor:1,order:['baseline','candidate','candidate','baseline'],
  contract:{top:'Two fresh-context cold pairs; AB then BA; exactly [0,15000] ms since navigation. Neutral F8 inputs only. Late readiness is null/censored, never zero.',journey:'Pair 1 only, separate post-top phases. Native wheel to Selected, aircraft, telemetry; native Home for the aircraft-inactive check. Hero/Selected inactive checks happen while aircraft is visible. New shorter content and legacy scroll runway differ, so journey elapsed times are descriptive rather than a same-scroll-distance speed claim.',menu:'Separate cold 390x844 menu sidecars; trusted clicks and Escape; desktop menu is hidden and is not force-clicked.',fixture:'Unmodified exported profile-v2-load gzip/max-age=600 fixture and source trace markers; no model/GPU/pacing overrides.',limits:['Software WebGL timings are runner-specific, not universal speed results. Host OS and GPU caches are not cold-reset.','Input creation-to-handler queue delay and CDP acknowledgement are not INP or compositor presentation latency.','The 15 s state timer can run late; its actual observation time and the last sampled state at/before cutoff are retained. Timing summaries use the fixed cutoff.','Long-task full durations include straddling tasks; clipped occupancy is separate. Finished-response bytes exclude unfinished transfers, listed separately.','Positive stage intersection distinguishes actual on-screen geometry from proximity; a masked canvas does not make a geometrically on-screen stage offscreen.','Native fences prove own-context GPU completion, not compositor presentation. Read-only instrumentation adds overhead to both phases.']},samples:[]};
 const save=()=>{report.comparison=comparison(report.samples);fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
 let browser,server,active;
 const deadline=Date.now()+540000,budget=ms=>{const left=deadline-Date.now();assert.ok(left>0,'Nine-minute profile deadline');return Math.max(1,Math.min(ms,left));};
 const watchdog=setTimeout(()=>{report.failure='Nine-minute hard deadline reached';save();browser?.close().catch(()=>{});server?.closeAllConnections();server?.close();},540000);
 try{
  const fixtures=Object.fromEntries(Object.entries(roots).map(([phase,root])=>[phase,prepareFixture(root)]));active=fixtures.baseline;
  report.sources=Object.fromEntries(Object.entries(fixtures).map(([phase,f])=>[phase,{root:f.root,revision:git(f.root,'rev-parse','HEAD'),trackedChanges:git(f.root,'status','--porcelain','--untracked-files=no'),traceSources:f.traces}]));
  server=http.createServer((req,res)=>{const r=responseFor(active,new URL(req.url,'http://localhost').pathname,req.headers);res.writeHead(r.status,r.headers);res.end(req.method==='HEAD'?undefined:r.body);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base='http://127.0.0.1:'+server.address().port;
  assert.match(require('playwright/package.json').version,/^1\.57\./,'Use official Playwright 1.57');
  browser=await require('playwright').chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browserVersion=browser.version();save();
  for(const [pair,order] of [[1,['baseline','candidate']],[2,['candidate','baseline']]])for(const phase of order){active=fixtures[phase];const sample=await measure(browser,base,{pair,phase,scenario:'top'},budget);report.samples.push(sample);save();console.log(JSON.stringify({pair,phase,scenario:'top',valid:sample.valid,failure:sample.failure,top:sample.top?{milestones:sample.top.milestones,longTasks:sample.top.longTasks,keys:sample.top.trustedKeyDelayMs,contextCount:sample.top.contextCountByHorizon}:null}));}
  for(const phase of ['baseline','candidate']){active=fixtures[phase];const sample=await measure(browser,base,{pair:1,phase,scenario:'menu'},budget);report.samples.push(sample);save();console.log(JSON.stringify({phase,scenario:'menu',valid:sample.valid,failure:sample.failure,latency:sample.menu?.trustedMenuDelayMs}));}
  report.valid=report.samples.length===6&&report.samples.every(s=>s.valid);save();assert.ok(report.valid,'One or more samples failed; inspect '+out);console.log('PASS matched navigation profile: '+out);
 }catch(error){report.failure=String(error);save();throw error;}
 finally{clearTimeout(watchdog);if(browser)await browser.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={navigationProbe,windowSummary,validate,comparison};

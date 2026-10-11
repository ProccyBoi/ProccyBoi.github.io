/* Matched HTTP-cold / browser-cache-return profiling, with strict native GPU
 * completion. Test-only: no production files, renderer settings or policy edits.
 *
 * V2_LOAD_BASELINE_ROOT=/tmp/baseline V2_LOAD_ROOT=$PWD \
 *   V2_LOAD_OUT=/tmp/v2-load.json node scripts/profile-v2-load.cjs
 * node scripts/profile-v2-load.cjs --source-only
 *
 * Defaults: three matched pairs per case/phase; 10 Mbps / 40 ms; 1440x1000,
 * DPR 1. V2_LOAD_RUNS must be >=3 (or >=1 with --baseline-only attribution).
 * Optional V2_LOAD_TIMEOUT (ms),
 * V2_LOAD_CASES=journey,direct-telemetry, CHROMIUM_EXECUTABLE,
 * V2_LOAD_BROWSER_ARGS (JSON array; default SwiftShader), V2_LOAD_PORT (0).
 *
 * Each pair owns a fresh browser context. Its second visit is a NEW page in
 * that context after the first page closes, so HTTP/application storage can
 * persist but JS model objects, BFCache and renderer state cannot. Cache is
 * never disabled; no Playwright route interception is used. A repeat visit is
 * not called a cache hit unless CDP/Resource Timing establish one. GPU-driver
 * and host OS caches are NOT cold-reset; baseline/candidate order alternates.
 *
 * Fixture matches verified Pages policy (max-age=600, Vary: Accept-Encoding,
 * gzip text; explicit .gz stays an application/gzip body). Text is prepared
 * before the measured visits. Content hashes stand in for CDN ETags. CDN wire
 * compression is approximate; this is same-runner comparison, not live TTFB.
 * Fixture-only trace points in loaders and Selected's EXISTING yield function
 * measure decode/reconstruction and yield spans. They add timing overhead and
 * some promise observation; they never remove a yield or change GPU pacing.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const network = {offline:false, latency:40, downloadThroughput:10_000_000/8, uploadThroughput:10_000_000/8, connectionType:'wifi'};
const viewport = {width:1440, height:1000};
const selectedNames = ['esp32', 'dual', 'pi', 'logic', 'metro', 'tramtrace'];
const modelURL = url => /\.(?:glb|gltf|stl|bin)(?:\.gz)?(?:\?|$)|\/models\/.*\.json(?:\?|$)/i.test(url);
const mimeTypes = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.gz':'application/gzip','.glb':'model/gltf-binary','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const compressible = filename => /\.(?:html|js|css|json|svg|txt|xml|glb)$/.test(filename);
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Trace anchor must occur exactly once: ' + before);
  return source.replace(before, after);
}
function traceSource(filename, source) {
  const mark = (factory, event) => `window.__v2LoadProbe.mark('${factory}',name,'${event}');`;
  if (['assets/v2-hero-assets.js','assets/v2-selected-assets.js'].includes(filename)) {
    const factory = filename.includes('hero-assets') ? 'hero' : 'selected';
    source = replaceOnce(source, 'pending.set(name, transfer.then(bytes => {',
      `pending.set(name, transfer.then(bytes => { ${mark(factory,'decompressionStart')}`);
    source = replaceOnce(source, '}).then(transport).then(({buffer, ...parsed}) => {',
      `}).then(buffer => { ${mark(factory,'decompressionEnd')} ${mark(factory,'indexRestoreStart')} return transport(buffer); }).then(({buffer, ...parsed}) => { ${mark(factory,'indexRestoreEnd')}`);
    source = replaceOnce(source, 'const buffer = await prefetch(name), T = window.THREE;',
      `const buffer = await prefetch(name), T = window.THREE; const __profileModel = window.__v2LoadProbe.beginModel('${factory}', name);`);
    source = replaceOnce(source, 'return {...decode(data.extra), group:nodes[0], parts};',
      `const result = {...decode(data.extra), group:nodes[0], parts}; __profileModel.endMs = performance.now(); return result;`);
  }
  if (filename === 'assets/v2-selected-work.js') {
    const original = `const idleTurn = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(() => {
    if (window.requestIdleCallback) requestIdleCallback(resolve, {timeout:700}); else resolve();
  },0)));`;
    source = replaceOnce(source, original, `const idleTurn = () => new Promise(resolve => {
    const trace = window.__v2LoadProbe.beginYield('selected');
    requestAnimationFrame(() => { trace.rafMs = performance.now(); setTimeout(() => {
      trace.timerMs = performance.now();
      const done = deadline => { trace.endMs = performance.now(); trace.didTimeout = deadline?.didTimeout ?? null; resolve(); };
      if (window.requestIdleCallback) requestIdleCallback(done, {timeout:700}); else done();
    },0); });
  });`);
  }
  if (filename === 'assets/v2-selected-work.js') source = replaceOnce(source, 'root.dataset.selectedLastDraw=JSON.stringify(measurement);', `
    window.__v2LoadProbe.selectedDraws.push({atMs:performance.now(),value,warm,longSide,measurement,
      shadow:{configured:key.shadow.mapSize.toArray(),actual:key.shadow.map?{width:key.shadow.map.width,height:key.shadow.map.height}:null}});
    root.dataset.selectedLastDraw=JSON.stringify(measurement);`);
  return source;
}
const tracedFiles = ['assets/v2-hero-assets.js','assets/v2-selected-assets.js','assets/v2-selected-work.js'];
function prepareFixture(root) {
  const prepared = new Map(), traces = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && compressible(filename)) {
        const relative = path.relative(root, filename).split(path.sep).join('/');
        const original = fs.readFileSync(filename);
        const raw = tracedFiles.includes(relative) ? Buffer.from(traceSource(relative, original.toString('utf8'))) : original;
        const gzip = zlib.gzipSync(raw, {level:6});
        prepared.set(filename, {raw, gzip, etag:hash(raw)});
        if (tracedFiles.includes(relative)) traces.push({path:relative, originalSHA256:hash(original), servedSHA256:hash(raw), overheadBytes:raw.length-original.length});
      }
    }
  };
  visit(path.join(root, 'assets')); visit(path.join(root, 'v2'));
  for (const filename of tracedFiles) assert.ok(traces.some(trace => trace.path === filename), 'Traced source exists: ' + filename);
  return {root, prepared, traces};
}
function responseFor(fixture, pathname, requestHeaders = {}) {
  let filename;
  try { filename = path.resolve(fixture.root, '.' + decodeURIComponent(pathname).replace(/\/$/, '/index.html')); }
  catch { return {status:400, headers:{}, body:Buffer.alloc(0)}; }
  if (!filename.startsWith(fixture.root + path.sep)) return {status:403, headers:{}, body:Buffer.alloc(0)};
  let item = fixture.prepared.get(filename);
  if (!item) {
    try { const raw=fs.readFileSync(filename); item={raw,etag:hash(raw)}; }
    catch { return {status:404, headers:{}, body:Buffer.alloc(0)}; }
  }
  const gzip = Boolean(item.gzip && /(?:^|[,\s])gzip(?:[,\s;]|$)/.test(requestHeaders['accept-encoding'] || ''));
  const etag = `${gzip?'W/':''}"${item.etag}"`;
  const headers = {'Content-Type':mimeTypes[path.extname(filename)] || 'application/octet-stream','Cache-Control':'max-age=600','Vary':'Accept-Encoding','ETag':etag};
  if (gzip) headers['Content-Encoding'] = 'gzip';
  // Weak comparison is the correct If-None-Match comparison for GET/HEAD.
  const matches = value => value.replace(/^W\//, '') === etag.replace(/^W\//, '');
  if ((requestHeaders['if-none-match'] || '').split(',').some(value => matches(value.trim()) || value.trim() === '*'))
    return {status:304, headers, body:Buffer.alloc(0)};
  const body = gzip ? item.gzip : item.raw; headers['Content-Length'] = body.length;
  return {status:200, headers, body};
}

// Executes before production scripts; no fetch, GL or scheduling replacement.
function browserProbe() {
  const now = () => performance.now();
  const metrics = window.__v2LoadProbe = {phase:'navigation', milestones:{}, marks:[], yields:[], gpu:[], factory:[], longTasks:[], inputs:[], eventTiming:[], observerSupport:{}, snapshots:{}, selectedDraws:[], reconstructions:[]};
  metrics.mark = (factory, name, event) => metrics.marks.push({factory,name,event,atMs:now(),phase:metrics.phase});
  metrics.beginModel = (factory, name) => {const record={factory,name,startMs:now(),phase:metrics.phase};metrics.reconstructions.push(record);return record;};
  metrics.beginYield = owner => {
    const data=document.querySelector('[data-selected-work]')?.dataset;
    const record={owner,startMs:now(),phase:metrics.phase,stage:data?.selectedPreparationStage||'construction',modelsReady:Number(data?.selectedModelsReady||0),selectedState:data?.selectedState};
    metrics.yields.push(record);return record;
  };
  for (const [type, target] of [['longtask','longTasks'],['event','eventTiming']]) {
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) metrics[target].push(type === 'longtask' ? {startMs:entry.startTime,durationMs:entry.duration} : {name:entry.name,startMs:entry.startTime,processingStart:entry.processingStart,processingEnd:entry.processingEnd,durationMs:entry.duration,interactionId:entry.interactionId});
      }).observe(type === 'event' ? {type,buffered:true,durationThreshold:16} : {type,buffered:true});
      metrics.observerSupport[type] = true;
    } catch { metrics.observerSupport[type] = false; }
  }
  // F8 has no site action. These are trusted CDP key events, not synthetic DOM
  // dispatch. Event creation-to-handler latency is not standardized INP.
  addEventListener('keydown', event => {
    if (event.key === 'F8') metrics.inputs.push({atMs:now(),eventMs:event.timeStamp,delayMs:Math.max(0,now()-event.timeStamp),trusted:event.isTrusted,phase:metrics.phase});
  }, {capture:true});
  function intercept(key, transform) {
    let value;
    Object.defineProperty(window,key,{configurable:true,get:()=>value,set:next=>{value=transform(next);}});
  }
  for (const key of ['V2HeroAssets','V2SelectedAssets','V2HeroEnvironment','V3AircraftScene','V2AssemblyModels']) {
    intercept(key, original => {
      const wrapped = {...original};
      for (const method of ['load','loadStatic','prefetch']) if (typeof original[method] === 'function') {
        wrapped[method] = function(...args) {
          const name=typeof args[0] === 'string' ? args[0] : key === 'V3AircraftScene' ? 'airframe' : 'environment';
          const record={factory:key,method,name,startMs:now(),phase:metrics.phase}; metrics.factory.push(record);
          let promise;
          try {promise=original[method].apply(this,args);} catch(error) {record.error=String(error);throw error;}
          // Observe the original promise; preserve its identity and do not
          // traverse geometry or add work to the production continuation.
          Promise.resolve(promise).then(model => {
            record.endMs=now();
            if (model?.staticBatches) record.staticBatch={durationMs:model.staticBatches.durationMs,workMs:model.staticBatches.workMs,maxWorkSliceMs:model.staticBatches.maxWorkSliceMs,yields:model.staticBatches.yields};
          },error=>{record.endMs=now();record.error=String(error);});
          return promise;
        };
      }
      return Object.freeze(wrapped);
    });
  }
  intercept('V2GPUPreparation', original => Object.freeze({...original,wait(renderer,options) {
    const canvas=renderer.domElement;
    const owner=canvas?.matches('[data-assembly-canvas]')?'hero':canvas?.matches('[data-selected-canvas]')?'selected':canvas?.matches('[data-aircraft-canvas]')?'aircraft':'unknown';
    const root=canvas?.closest('[data-assembly],[data-selected-work],[data-aircraft-hero]');
    const record={owner,startMs:now(),phase:metrics.phase,pollMs:options?.pollMs,stage:root?.dataset.selectedPreparationStage||root?.dataset.aircraftGPUPhase||root?.dataset.assemblyGPUPhase};
    // Geometry is diagnostic evidence, never an input to production gating.
    // Include strict positive-area intersections so threshold-zero IO's
    // edge-adjacent 'intersecting' state cannot look like visible pixels.
    const observationStarted=now();
    const rectangle=node=>{if(!node)return null;const box=node.getBoundingClientRect();return {x:box.x,y:box.y,top:box.top,right:box.right,bottom:box.bottom,left:box.left,width:box.width,height:box.height};};
    const style=node=>{if(!node)return null;const computed=getComputedStyle(node);return {display:computed.display,visibility:computed.visibility,opacity:computed.opacity,position:computed.position,contentVisibility:computed.contentVisibility};};
    const stage=canvas?.closest('.v2-assembly-stage,.v2-selected-stage,[data-aircraft-stage]');
    const sticky=root?.querySelector('.v2-assembly-sticky'),header=document.querySelector('.v2-header');
    const bounds={root:rectangle(root),stage:rectangle(stage),canvas:rectangle(canvas),sticky:rectangle(sticky),header:rectangle(header)};
    const area=(box,top=0)=>box?Math.max(0,Math.min(innerWidth,box.right)-Math.max(0,box.left))*Math.max(0,Math.min(innerHeight,box.bottom)-Math.max(top,box.top)):0;
    const headerStyle=style(header),headerBottom=['fixed','sticky'].includes(headerStyle?.position)?Math.max(0,bounds.header?.bottom||0):0;
    record.geometry={atMs:now(),scrollX,scrollY,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},documentHidden:document.hidden,bounds,
      computed:{root:style(root),stage:style(stage),canvas:style(canvas),header:headerStyle},
      viewportIntersectionArea:{root:area(bounds.root),stage:area(bounds.stage),canvas:area(bounds.canvas),sticky:area(bounds.sticky)},
      belowHeaderIntersectionArea:{stage:area(bounds.stage,headerBottom),canvas:area(bounds.canvas,headerBottom),sticky:area(bounds.sticky,headerBottom)}};
    record.observationCPUms=now()-observationStarted;
    metrics.gpu.push(record);record.waitCalledMs=now();
    const promise=original.wait.apply(this,arguments);
    promise.then(result=>{record.endMs=now();record.result={...result};},error=>{record.endMs=now();record.error=String(error);});
    return promise;
  }}));
  const once = (key,value) => {if(metrics.milestones[key] === undefined && Number.isFinite(value)) metrics.milestones[key]=value;};
  const parse = value => {try{return JSON.parse(value);}catch{return null;}};
  const visible = canvas => {
    if (!canvas) return false;
    const rect=canvas.getBoundingClientRect(),style=getComputedStyle(canvas);
    return rect.width>0 && rect.height>0 && rect.bottom>0 && rect.top<innerHeight && style.visibility!=='hidden' && style.display!=='none';
  };
  const inspect = () => {
    const hero=document.querySelector('[data-assembly]');
    if (hero) {
      const data=hero.dataset;
      if (Number(data.assemblyModelsSubmitted)>0) once('heroFirstSubmittedMs',now());
      if (data.assemblyModelsSubmitted==='3') once('heroAllSubmittedMs',now());
      if (data.assemblyGPUCompletionEvidence==='own-context-fence') {
        if (Number(data.assemblyModelsReady)>0) once('heroFirstGPUCompletedMs',Number(data.assemblyFirstModelMs));
        if (data.assemblyModelsReady==='3') once('heroAllGPUCompletedMs',Number(data.assemblyLastCompletedMs));
      }
    }
    const selected=document.querySelector('[data-selected-work]');
    if (selected) {
      const data=selected.dataset,frame=parse(data.selectedLastFrame),canvas=selected.querySelector('canvas');
      if (data.selectedModelsReady==='6') once('selectedAllModelsMs',now());
      const preparation=parse(data.selectedPreparationMeasurements)||[];
      const stages=new Set(preparation.filter(stage=>stage.completed && stage.gpu?.state==='complete').map(stage=>stage.kind+':'+stage.name));
      if (['model:esp32','model:dual','model:pi','model:logic','model:metro','model:tramtrace','composition:0','composition:1'].every(key=>stages.has(key))) once('selectedEightGPUStagesMs',Math.max(...preparation.map(stage=>stage.completedMs)));
      if (frame?.published && frame.gpu?.state==='complete' && frame.completedMs && data.selectedWarmMask==='false' && !frame.measurement.warm && frame.measurement.width===canvas?.width && frame.measurement.height===canvas?.height && frame.measurement.pixelRatio===Number(data.selectedLivePixelRatio) && frame.revision===Number(data.selectedPoseRevision) && visible(canvas)) {
        once('selectedCurrentSizeVisibleGPUCompletedMs',frame.completedMs);
        metrics.snapshots.selectedFirstCompleted ||= {frame,dataset:{...data},canvas:{width:canvas.width,height:canvas.height}};
      }
    }
    const aircraft=document.querySelector('[data-aircraft-hero]');
    if (aircraft) {
      const data=aircraft.dataset,frame=parse(data.aircraftLastFrame),canvas=aircraft.querySelector('canvas');
      if (data.aircraftTelemetryReady==='true') once('aircraftTelemetryModelReadyMs',now());
      if (frame?.published && frame.gpu?.state==='complete' && frame.completedMs && data.aircraftLiveCompletionEvidence==='own-context-fence' && data.aircraftWarmMask==='false' && data.aircraftTelemetryReady==='true' && data.aircraftChapter==='1' && frame.kind==='progress' && frame.measurement.width===canvas?.width && frame.measurement.height===canvas?.height && frame.measurement.pixelRatio===Number(data.aircraftLivePixelRatio) && frame.layoutRevision===Number(data.aircraftLayoutRevision) && frame.revision===Number(data.aircraftPoseRevision) && visible(canvas)) {
        once('telemetryCurrentSizeVisibleGPUCompletedMs',frame.completedMs);
        metrics.snapshots.telemetryFirstCompleted ||= {frame,dataset:{...data},canvas:{width:canvas.width,height:canvas.height}};
      }
    }
  };
  new MutationObserver(inspect).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:[
    'data-assembly-models-submitted','data-assembly-models-ready','data-assembly-gpu-completion-evidence',
    'data-selected-models-ready','data-selected-preparation-measurements','data-selected-last-frame',
    'data-aircraft-telemetry-ready','data-aircraft-last-frame'
  ]});
  metrics.inspect=inspect;
}
function summary(values) {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const quantile=q=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]:null;
  return {count:sorted.length,min:round(sorted[0]),median:round(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2),p95:round(quantile(.95)),max:round(sorted.at(-1)),total:round(sorted.reduce((sum,value)=>sum+value,0))};
}
function assertCompletion(sample) {
  const m=sample.metrics.milestones;
  const required=sample.scenario==='journey'?['heroAllSubmittedMs','heroAllGPUCompletedMs','selectedAllModelsMs','selectedEightGPUStagesMs','selectedCurrentSizeVisibleGPUCompletedMs']:['aircraftTelemetryModelReadyMs','telemetryCurrentSizeVisibleGPUCompletedMs'];
  for (const key of required) assert.ok(Number.isFinite(m[key]) && m[key]>0, 'Missing strict completion: '+key);
  if (sample.scenario==='journey') {
    assert.ok(m.heroAllGPUCompletedMs>=m.heroAllSubmittedMs-2, 'Hero completion must follow submission');
    assert.ok(m.selectedCurrentSizeVisibleGPUCompletedMs>=m.selectedEightGPUStagesMs, 'Live Selected must follow eight fenced warm stages');
    const names=new Set(sample.metrics.factory.filter(item=>item.factory==='V2SelectedAssets'&&item.method==='loadStatic'&&item.endMs&&!item.error).map(item=>item.name));
    assert.deepEqual([...names].sort(),selectedNames.slice().sort(),'All six real Selected factories complete');
  }
  assert.deepEqual(sample.errors,[], 'No uncaught production/probe errors');
  assert.equal(sample.metrics.factory.some(item=>item.factory==='V2AssemblyModels'&&item.method==='load'),false,'No original hero factory fallback in packed-load profile');
  if(sample.scenario==='journey') assert.equal(sample.metrics.snapshots.beforeSelected.hero.assemblyEnvironment,'prepared','Use the real prepared lighting without fallback');
  assert.ok(sample.metrics.inputs.some(input=>input.trusted),'At least one trusted input sample');
  assert.ok(sample.metrics.observerSupport.longtask,'Long-task API must be available');
  const failures=sample.requests.filter(request=>request.error&&!/ERR_ABORTED/.test(request.error));
  assert.deepEqual(failures,[], 'No failed network requests');
  assert.equal(sample.requests.some(request=>request.fromServiceWorker),false,'Service workers must not supply the fixture');
  const models=sample.requests.filter(request=>modelURL(request.url)&&request.finished);
  assert.ok(models.length>0, 'Actual model responses must be recorded');
  if (sample.visit==='cold') assert.equal(models.some(request=>request.fromDiskCache||request.servedFromCache),false,'Fresh context must not reuse browser model cache');
  else assert.ok(models.some(request=>request.fromDiskCache||request.servedFromCache||request.resourceTimingCache), 'Repeat visit must establish actual model cache reuse');
}
function classifyRequests(records, resources, navigationTimestamp) {
  const matching=new Map();
  for(const entry of resources){if(!matching.has(entry.name))matching.set(entry.name,[]);matching.get(entry.name).push(entry);}
  return [...records.values()].map(record=>{
    const resource=matching.get(record.url)?.shift();
    const ms=value=>Number.isFinite(value)&&Number.isFinite(navigationTimestamp)?round((value-navigationTimestamp)*1000):null;
    const pathname=new URL(record.url).pathname;
    return {...record,path:pathname,startMs:ms(record.start),responseMs:ms(record.response),endMs:ms(record.end),
      dataReceipts:(record.dataReceipts||[]).map(chunk=>({atMs:ms(chunk.at),bytes:chunk.bytes})),resourceTiming:resource||null,resourceTimingCache:Boolean(resource&&resource.transferSize===0&&resource.decodedBodySize>0),
      cacheEvidence:[record.servedFromCache?'CDP requestServedFromCache':null,record.fromDiskCache?'CDP fromDiskCache':null,resource?.transferSize===0&&resource?.decodedBodySize>0?'ResourceTiming zero transfer/nonzero body':null].filter(Boolean)};
  });
}
function summarizeSample(sample) {
  const m=sample.metrics.milestones;
  const horizon=sample.scenario==='journey'?m.selectedCurrentSizeVisibleGPUCompletedMs:m.telemetryCurrentSizeVisibleGPUCompletedMs;
  const tasks=sample.metrics.longTasks.filter(task=>task.startMs<horizon);
  const clippedTaskOccupancyMs=tasks.reduce((sum,task)=>sum+Math.min(task.durationMs,horizon-task.startMs),0);
  const requests=sample.requests.filter(request=>request.finished&&request.endMs<=horizon);
  const modelRequests=requests.filter(request=>modelURL(request.url));
  const input=sample.metrics.inputs.filter(item=>item.atMs<=horizon);
  const yields=sample.metrics.yields.filter(item=>item.endMs<=horizon);
  const cacheCount=requests.filter(request=>request.cacheEvidence.length).length;
  const packPhases={};
  for(const mark of sample.metrics.marks) {
    const key=mark.factory+'/'+mark.name;packPhases[key] ||= {};packPhases[key][mark.event+'Ms']=mark.atMs;
  }
  for(const value of Object.values(packPhases)) {
    value.decompressionWallMs=round(value.decompressionEndMs-value.decompressionStartMs);
    value.indexRestoreWallMs=round(value.indexRestoreEndMs-value.indexRestoreStartMs);
  }
  const reconstructionWallMs=sample.metrics.reconstructions.map(item=>({...item,durationMs:round(item.endMs-item.startMs)}));
  return {milestones:m,packPhases,reconstructionWallMs,selectedFromTriggerMs:sample.scenario==='journey'?round(m.selectedCurrentSizeVisibleGPUCompletedMs-m.selectedTriggerMs):null,
    longTasks:{count:tasks.length,totalMs:round(tasks.reduce((sum,task)=>sum+task.durationMs,0)),maxMs:round(Math.max(0,...tasks.map(task=>task.durationMs))),clippedWindowOccupancyMs:round(clippedTaskOccupancyMs),totalBlockingMs:round(tasks.reduce((sum,task)=>sum+Math.max(0,task.durationMs-50),0))},
    trustedInputDelayMs:summary(input.filter(item=>item.trusted).map(item=>item.delayMs)),
    selectedYieldMs:{total:summary(yields.map(item=>item.endMs-item.startMs)),raf:summary(yields.map(item=>item.rafMs-item.startMs)),timer:summary(yields.map(item=>item.timerMs-item.rafMs)),idleCallback:summary(yields.map(item=>item.endMs-item.timerMs))},
    gpuWaitMs:Object.fromEntries(['hero','selected','aircraft'].map(owner=>[owner,summary(sample.metrics.gpu.filter(item=>item.owner===owner&&item.endMs<=horizon).map(item=>item.endMs-item.startMs))])),
    transport:{horizonMs:horizon,finishedRequests:requests.length,cacheEvidencedRequests:cacheCount,completedResourceWireBytesByReadiness:requests.reduce((sum,request)=>sum+(request.wireBytes||0),0),completedModelWireBytesByReadiness:modelRequests.reduce((sum,request)=>sum+(request.wireBytes||0),0),inFlightAtReadiness:sample.requests.filter(request=>request.startMs<=horizon&&(!request.finished||request.endMs>horizon)).map(request=>({url:request.url,startMs:request.startMs,bodyBytesReceivedByReadiness:(request.dataReceipts||[]).filter(chunk=>chunk.atMs<=horizon).reduce((sum,chunk)=>sum+chunk.bytes,0)})),modelCacheEvidencedRequests:modelRequests.filter(request=>request.cacheEvidence.length).length},
  };
}
async function measureVisit(context, base, specification, options) {
  const page=await context.newPage(), cdp=await context.newCDPSession(page), records=new Map(), errors=[], warnings=[];
  let navigationTimestamp, stopInput=false, pendingInput=Promise.resolve();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',network);
  cdp.on('Network.requestWillBeSent',event=>{
    if(event.type==='Document'&&new URL(event.request.url).pathname==='/v2/')navigationTimestamp=event.timestamp;
    records.set(event.requestId,{url:event.request.url,type:event.type,start:event.timestamp,servedFromCache:false});
  });
  cdp.on('Network.requestServedFromCache',event=>{const record=records.get(event.requestId);if(record)record.servedFromCache=true;});
  cdp.on('Network.responseReceived',event=>{
    const record=records.get(event.requestId);if(!record)return;
    const headers=Object.fromEntries(Object.entries(event.response.headers).map(([name,value])=>[name.toLowerCase(),value]));
    Object.assign(record,{response:event.timestamp,status:event.response.status,fromDiskCache:Boolean(event.response.fromDiskCache),fromServiceWorker:Boolean(event.response.fromServiceWorker),headers});
  });
  cdp.on('Network.dataReceived',event=>{const record=records.get(event.requestId);if(record)(record.dataReceipts ||= []).push({at:event.timestamp,bytes:event.encodedDataLength});});
  cdp.on('Network.loadingFinished',event=>{const record=records.get(event.requestId);if(record)Object.assign(record,{end:event.timestamp,finished:true,wireBytes:event.encodedDataLength});});
  cdp.on('Network.loadingFailed',event=>{const record=records.get(event.requestId);if(record)Object.assign(record,{end:event.timestamp,error:event.errorText});});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push(message.text());});
  await page.addInitScript(browserProbe);
  let timer;
  const input=async()=>{
    if(stopInput)return;
    try {
      await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119,nativeVirtualKeyCode:119,timestamp:Date.now()/1000});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119,nativeVirtualKeyCode:119,timestamp:Date.now()/1000});
    } catch(error) {if(!stopInput)warnings.push('Input probe: '+String(error));}
    if(!stopInput)timer=setTimeout(()=>{pendingInput=input();},125);
  };
  let failure;
  try {
    const suffix=specification.scenario==='direct-telemetry'?'#skylabs-telemetry':'';
    const navigation=page.goto(base+'/v2/'+suffix,{waitUntil:'domcontentloaded',timeout:options.timeout});
    pendingInput=input();
    await navigation;
    if(specification.scenario==='journey') {
      await page.waitForFunction(()=>Number.isFinite(window.__v2LoadProbe?.milestones.heroAllGPUCompletedMs),null,{timeout:options.timeout});
      await page.evaluate(()=>{
        const metrics=window.__v2LoadProbe,root=document.querySelector('[data-selected-work]');
        metrics.snapshots.beforeSelected={hero:{...document.querySelector('[data-assembly]').dataset},selected:{...root.dataset},scrollY};
        metrics.phase='selected';metrics.milestones.selectedTriggerMs=performance.now();
        // Ordinary scroll exercises the unmodified proximity gate. No capture
        // query, prewarming API, ready flag or visibility override is used.
        scrollTo({top:scrollY+root.getBoundingClientRect().top,behavior:'instant'});
      });
      await page.waitForFunction(()=>Number.isFinite(window.__v2LoadProbe?.milestones.selectedCurrentSizeVisibleGPUCompletedMs),null,{timeout:options.timeout});
    } else {
      await page.evaluate(()=>{window.__v2LoadProbe.phase='direct-telemetry';});
      await page.waitForFunction(()=>Number.isFinite(window.__v2LoadProbe?.milestones.telemetryCurrentSizeVisibleGPUCompletedMs),null,{timeout:options.timeout});
    }
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0))));
  } catch(error) { failure=String(error); }
  stopInput=true;clearTimeout(timer);await pendingInput;
  let captured;
  try {
    captured=await page.evaluate(()=>{
      const metrics=window.__v2LoadProbe;metrics?.inspect();
      return {metrics:metrics?JSON.parse(JSON.stringify(metrics)):null,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON()),paints:performance.getEntriesByType('paint').map(entry=>entry.toJSON()),userAgent:navigator.userAgent,states:Object.fromEntries(['assembly','selected-work','aircraft-hero'].map(name=>[name,{...document.querySelector('[data-'+name+']')?.dataset}]))};
    });
  } catch(error) {failure ||= String(error);captured={metrics:null,resources:[]};}
  const sample={...specification,...captured,requests:classifyRequests(records,captured.resources,navigationTimestamp),errors,warnings:[...new Set(warnings)],failure};
  try {if(failure)throw Error(failure);assertCompletion(sample);sample.summary=summarizeSample(sample);sample.valid=true;}
  catch(error){sample.failure=String(error);sample.valid=false;}
  await page.close();
  return sample;
}
function comparison(samples) {
  const output={};
  const paths=['milestones.heroAllSubmittedMs','milestones.heroAllGPUCompletedMs','milestones.selectedAllModelsMs','milestones.selectedEightGPUStagesMs','milestones.selectedCurrentSizeVisibleGPUCompletedMs','milestones.telemetryCurrentSizeVisibleGPUCompletedMs','selectedFromTriggerMs','longTasks.totalMs','longTasks.maxMs','trustedInputDelayMs.p95','transport.completedModelWireBytesByReadiness','transport.completedResourceWireBytesByReadiness'];
  const get=(object,key)=>key.split('.').reduce((value,part)=>value?.[part],object);
  for(const scenario of [...new Set(samples.map(sample=>sample.scenario))])for(const visit of ['cold','repeat']) {
    const group=samples.filter(sample=>sample.valid&&sample.scenario===scenario&&sample.visit===visit);
    output[scenario+'/'+visit]=Object.fromEntries(paths.map(key=>{
      const baseline=group.filter(sample=>sample.phase==='baseline'),candidate=group.filter(sample=>sample.phase==='candidate');
      const deltas=candidate.map(sample=>{const match=baseline.find(before=>before.pair===sample.pair);return match?get(sample.summary,key)-get(match.summary,key):NaN;});
      return [key,{baseline:summary(baseline.map(sample=>get(sample.summary,key))),candidate:summary(candidate.map(sample=>get(sample.summary,key))),pairedCandidateMinusBaseline:summary(deltas)}];
    }));
  }
  return output;
}
async function sourceTests() {
  for(const filename of tracedFiles) {
    const original=fs.readFileSync(path.join(repo,filename),'utf8'),instrumented=traceSource(filename,original);
    new vm.Script(instrumented,{filename});assert.notEqual(instrumented,original);
  }
  new vm.Script('('+browserProbe.toString()+')()');
  const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'v2-load-fixture-'));
  try {
    fs.mkdirSync(path.join(root,'assets'),{recursive:true});fs.mkdirSync(path.join(root,'v2'));
    for(const filename of tracedFiles)fs.copyFileSync(path.join(repo,filename),path.join(root,filename));
    fs.writeFileSync(path.join(root,'v2/index.html'),'<h1>Cache test</h1>');
    fs.writeFileSync(path.join(root,'assets/model.bin.gz'),zlib.gzipSync('test bytes'));
    const fixture=prepareFixture(root),gzip=responseFor(fixture,'/v2/',{'accept-encoding':'gzip, deflate, br'});
    assert.equal(gzip.headers['Cache-Control'],'max-age=600');assert.equal(gzip.headers['Vary'],'Accept-Encoding');assert.equal(gzip.headers['Content-Encoding'],'gzip');
    assert.equal(zlib.gunzipSync(gzip.body).toString(),'<h1>Cache test</h1>');
    assert.equal(responseFor(fixture,'/v2/',{'accept-encoding':'gzip','if-none-match':gzip.headers.ETag}).status,304);
    const raw=responseFor(fixture,'/assets/model.bin.gz',{'accept-encoding':'gzip'});assert.equal(raw.headers['Content-Encoding'],undefined);assert.equal(raw.headers['Content-Type'],'application/gzip');
    assert.equal(responseFor(fixture,'/../outside').status,403);assert.equal(responseFor(fixture,'/%E0%A4%A').status,400);
    assert.deepEqual(summary([4,1,2,3]),{count:4,min:1,median:2.5,p95:4,max:4,total:10});
    const requests=classifyRequests(new Map([['1',{url:'http://localhost/model.bin.gz',start:1,end:2,finished:true,wireBytes:0,servedFromCache:true}]]),[{name:'http://localhost/model.bin.gz',transferSize:0,decodedBodySize:100}],1);
    assert.equal(requests[0].endMs,1000);assert.equal(requests[0].resourceTimingCache,true);assert.equal(requests[0].cacheEvidence.length,2);
    assert.throws(()=>assertCompletion({scenario:'direct-telemetry',metrics:{milestones:{}}}),/strict completion/);
    console.log('PASS source-only: trace anchors/syntax, cacheable gzip and explicit-gzip parity, ETag revalidation, path safety, cache evidence, strict missing-completion rejection. No browser/GPU performance claimed.');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
async function main() {
  if(process.argv.includes('--source-only'))return sourceTests();
  const baselineOnly=process.argv.includes('--baseline-only');
  const pairs=Number(process.env.V2_LOAD_RUNS||3);assert.ok(Number.isInteger(pairs)&&pairs>=(baselineOnly?1:3),'V2_LOAD_RUNS must be an integer >=3 (>=1 for --baseline-only attribution)');
  const timeout=Number(process.env.V2_LOAD_TIMEOUT||180000);assert.ok(Number.isFinite(timeout)&&timeout>=1000);
  const scenarios=(process.env.V2_LOAD_CASES||'journey,direct-telemetry').split(',');
  assert.ok(scenarios.length&&scenarios.every(value=>['journey','direct-telemetry'].includes(value)));
  assert.ok(process.env.V2_LOAD_BASELINE_ROOT,'Set V2_LOAD_BASELINE_ROOT to the immutable baseline checkout');
  const roots={baseline:path.resolve(process.env.V2_LOAD_BASELINE_ROOT)};
  if(!baselineOnly) { roots.candidate=path.resolve(process.env.V2_LOAD_ROOT||process.env.V2_LOAD_CANDIDATE_ROOT||repo);assert.notEqual(roots.baseline,roots.candidate,'Baseline and candidate roots must be distinct'); }
  const fixtures=Object.fromEntries(Object.entries(roots).map(([phase,root])=>[phase,prepareFixture(root)]));
  const revision=root=>{try{return execFileSync('git',['-c','safe.directory='+root,'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return 'unknown';}};
  const out=path.resolve(process.env.V2_LOAD_OUT||'.codex-temp/v2-load/profile.json');
  const browserArgs=JSON.parse(process.env.V2_LOAD_BROWSER_ARGS||'["--use-angle=swiftshader","--enable-unsafe-swiftshader"]');
  const report={capturedAt:new Date().toISOString(),valid:false,network,viewport,deviceScaleFactor:1,pairs,scenarios,browserArgs,mode:baselineOnly?'baseline-only-attribution':'matched-comparison',
    phases:Object.fromEntries(Object.entries(fixtures).map(([phase,fixture])=>[phase,{root:fixture.root,revision:revision(fixture.root),traceSources:fixture.traces}])),
    contract:{cache:'HTTP-cold fresh browser context, then new page in the same context; normal cache semantics in both visits',server:'Cache-Control max-age=600; Vary Accept-Encoding; gzip text; explicit .gz is not HTTP-decoded; content SHA256 ETags',completion:'Native own-context GPU complete + published current-size visible frame, never submitted/ready alone',inputs:'Trusted neutral F8 creation-to-handler queue delay, not INP',instrumentation:'Fixture-only trace markers; no application files, model quality, draw settings, proximity or pacing edits',caveats:['Software WebGL is machine-specific. The same browser/runner serves both phases. GPU-driver and OS caches are not reset.','Tracing adds small CPU/microtask overhead; byte totals include trace source bytes. Compare both phases instrumented identically.','Factory load spans include texture waits/static batching; explicit reconstruction markers include texture waits but exclude pack waiting.','Decode spans are elapsed wall time including scheduling, not CPU-only decompression. Index restoration is measured separately.','GPU wait spans include asynchronous polling and scheduler latency, not GPU execution-only durations.','A fenced published canvas is not an assertion of compositor presentation.',
      'Long-task total/max/TBT retain full task duration for tasks beginning before readiness; clipped occupancy is a separate metric.',
      'Wire totals by readiness include only completed responses and are not whole-site payload totals; in-flight paths and received-body bytes are reported separately.','Zero wire bytes alone is not assumed to mean a cache hit; CDP and Resource Timing evidence are retained.','Cached browser resource loading may escape CDP throughput throttling; this is expected for a return visit.']},samples:[]};
  const save=()=>{report.comparison=comparison(report.samples);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
  let active=fixtures.baseline,browser;
  const server=http.createServer((request,response)=>{
    const result=responseFor(active,new URL(request.url,'http://localhost').pathname,request.headers);
    response.writeHead(result.status,result.headers);response.end(request.method==='HEAD'?undefined:result.body);
  });
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.V2_LOAD_PORT||0),'127.0.0.1',resolve);});
    const base='http://127.0.0.1:'+server.address().port;report.baseURL=base;
    const {chromium}=require('playwright');
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:browserArgs});
    report.browserVersion=browser.version();save();
    for(let pair=1;pair<=pairs;pair++)for(const scenario of scenarios)for(const phase of baselineOnly?['baseline']:pair%2?['baseline','candidate']:['candidate','baseline']) {
      active=fixtures[phase];
      const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
      try {
        for(const visit of ['cold','repeat']) {
          const sample=await measureVisit(context,base,{pair,phase,scenario,visit},{timeout});report.samples.push(sample);save();
          console.log(JSON.stringify({pair,phase,scenario,visit,valid:sample.valid,summary:sample.summary,failure:sample.failure}));
          assert.ok(sample.valid,`${phase}/${scenario}/${pair}/${visit}: ${sample.failure}`);
        }
      } finally {await context.close();}
    }
    report.valid=true;save();console.log('Completed matched report: '+out);
  } catch(error) {report.failure=String(error);save();throw error;}
  finally {if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={traceSource,prepareFixture,responseFor,browserProbe,summary,assertCompletion,classifyRequests,summarizeSample,comparison};

/* Test-only, bounded first-use attribution on immutable live 5a50d2f sources.
 * node scripts/profile-v2-hero-first-use.cjs --source-only
 * V2_HERO_FIRST_USE_ROOT=/tmp/live-5a50 V2_HERO_FIRST_USE_OUT=/tmp/hero/profile.json \
 *   node scripts/profile-v2-hero-first-use.cjs
 *
 * Three rotated matched groups, each baseline/debug-off/parallel-install with
 * cold then cached NEW pages: 18 visits on one browser/runner. No production
 * source changes, compile warmup, gl.finish, forced readiness, route interception,
 * or disabled HTTP cache. Existing production own-context fences are observed.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const shared = require('./profile-v2-load.cjs');
const repo = path.resolve(__dirname, '..');
const revision = '5a50d2f336accccaf1577ad43f1465506bdbeb5c';
const assemblyHash = '170880ccd680a7acfcc4b5f0c8f64a30c70c7df6482218492b56b989a1f4aeaa';
const modes = ['baseline', 'debug-off', 'parallel-install'];
const viewport = {width:1440, height:1000};
const network = {offline:false, latency:40, downloadThroughput:10_000_000/8, uploadThroughput:10_000_000/8, connectionType:'wifi'};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const round = value => Number.isFinite(value) ? Math.round(value*100)/100 : null;
const modelURL = url => /\/models\/|\.(?:glb|gltf|stl|bin)(?:\.gz)?(?:\?|$)/i.test(url);
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Exact, unique fixture anchor: '+before);
  return source.replace(before, after);
}
function assemblySource(original, mode) {
  assert.ok(modes.includes(mode));
  assert.equal(hash(original), assemblyHash, 'Only exact live 5a50 assembly source is eligible');
  let source=original;
  const constructor="renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});";
  source=replaceOnce(source, constructor, constructor+`\n      window.__heroFirstUse.attach(renderer);`);
  source=replaceOnce(source, '      fitShadows();', '      window.__heroFirstUse.fitStart();\n      fitShadows();\n      window.__heroFirstUse.fitEnd();');
  source=replaceOnce(source, "      root.dataset.assemblyState='ready';", `      root.dataset.assemblyState='ready';
      window.__heroFirstUse.completed({root,renderer,keyLight,drawnModels:drawnModels.filter(Boolean).length,
        installedModels:models.filter(Boolean).length,drawnWidth,drawnHeight,drawnRatio,drawnRevision,currentRevision:revision});`);
  if(mode==='debug-off') source=replaceOnce(source, 'window.__heroFirstUse.attach(renderer);',
    'window.__heroFirstUse.attach(renderer);\n      renderer.debug.checkShaderErrors=false;');
  if(mode==='parallel-install') source=replaceOnce(source,
    '      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));\n      const supporting=',
    '      /* Fixture-only: start supporting installation without the intervening frame/timer. */\n      const supporting=');
  return source;
}
function prepare(root, mode) {
  const fixture=shared.prepareFixture(root), filename=path.join(root,'assets/v2-assembly.js');
  const original=fs.readFileSync(filename,'utf8'), raw=Buffer.from(assemblySource(original,mode));
  fixture.prepared.set(filename,{raw,gzip:zlib.gzipSync(raw,{level:6}),etag:hash(raw)});
  fixture.traces.push({path:'assets/v2-assembly.js',originalSHA256:hash(original),servedSHA256:hash(raw),overheadBytes:raw.length-Buffer.byteLength(original)});
  return fixture;
}

// All instrumentation runs in the page and records only this hero GL context.
// Timing a GL entrypoint measures calling-thread wall time, NOT execution time
// on the GPU. Synchronous calls can include driver waits. Shadow/render spans
// contain their nested GL calls and must never be added to those call totals.
function heroProbe() {
  const now=()=>performance.now();
  const metrics=window.__heroFirstUse={frames:[],calls:[],programs:[],shaders:[],stopped:false,fit:[],violations:[]};
  const programs=new WeakMap(),shaders=new WeakMap();
  let renderer,activeFrame=null,shadowDepth=0,fitStarted=null;
  const programID=value=>value ? programs.get(value)?.id||null : null;
  const shaderID=value=>value ? shaders.get(value)?.id||null : null;
  const phase=()=>shadowDepth?'shadow':activeFrame?'main':'outside-render';
  const aggregate=(group,name,duration)=>{
    const entry=group[name] ||= {count:0,totalMs:0,maxMs:0};
    entry.count++;entry.totalMs+=duration;entry.maxMs=Math.max(entry.maxMs,duration);
  };
  const enumNames={0x8B80:'DELETE_STATUS',0x8B81:'COMPILE_STATUS',0x8B82:'LINK_STATUS',0x8B83:'VALIDATE_STATUS',0x8B84:'INFO_LOG_LENGTH',0x8B85:'ATTACHED_SHADERS',0x8B86:'ACTIVE_UNIFORMS',0x8B89:'ACTIVE_ATTRIBUTES',0x8B4F:'SHADER_TYPE',0x91B1:'MAX_SERVER_WAIT_TIMEOUT',0x91B5:'SYNC_STATUS',0x91B9:'CONDITION_SATISFIED',0x9117:'SYNC_GPU_COMMANDS_COMPLETE',0x911A:'ALREADY_SIGNALED',0x911B:'TIMEOUT_EXPIRED',0x911C:'CONDITION_SATISFIED',0x911D:'WAIT_FAILED'};
  const syncMethods=new Set(['getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog','getUniformLocation','getActiveUniform','getActiveAttrib','getAttribLocation','getUniformBlockIndex','getActiveUniformBlockParameter','getActiveUniformBlockName','getActiveUniforms','getUniformIndices','getParameter','getError','checkFramebufferStatus','clientWaitSync','getSyncParameter']);
  const uploadMethods=new Set(['bufferData','bufferSubData','texImage2D','texSubImage2D','texImage3D','texSubImage3D','compressedTexImage2D','compressedTexSubImage2D','texStorage2D','texStorage3D','generateMipmap']);
  const drawMethods=new Set(['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']);
  const detail=(name,args,result)=>{
    if(name==='createProgram') {
      const entry={id:metrics.programs.length+1,createdMs:now(),shaders:[]};
      if(result){programs.set(result,entry);metrics.programs.push(entry);}return {program:entry.id};
    }
    if(name==='createShader') {
      const entry={id:metrics.shaders.length+1,type:args[0],createdMs:now()};
      if(result){shaders.set(result,entry);metrics.shaders.push(entry);}return {shader:entry.id,type:entry.type};
    }
    const data={};
    if(/Program|Uniform|Attrib|attachShader|linkProgram|useProgram/.test(name))data.program=programID(args[0]);
    if(/Shader|shaderSource/.test(name)&&name!=='attachShader')data.shader=shaderID(args[0]);
    if(name==='attachShader') {
      data.shader=shaderID(args[1]);const entry=programs.get(args[0]);
      if(entry)entry.shaders.push(data.shader);
    }
    if(name==='shaderSource') {
      data.sourceCharacters=args[1]?.length;const entry=shaders.get(args[0]);
      if(entry)entry.sourceCharacters=data.sourceCharacters;
    }
    if(name==='getProgramParameter'||name==='getShaderParameter'||name==='getSyncParameter') {
      data.pname=args[1];data.parameter=enumNames[args[1]]||String(args[1]);
    }
    if(/get(?:UniformLocation|AttribLocation|UniformBlockIndex)$/.test(name))data.lookupName=args[1];
    if(name==='getActiveUniform'||name==='getActiveAttrib') {data.index=args[1];data.active=result?{name:result.name,size:result.size,type:result.type}:null;}
    if(name==='getProgramInfoLog'||name==='getShaderInfoLog')data.log=result||'';
    if(typeof result==='number'||typeof result==='boolean'||result===null)data.result=result;
    if(uploadMethods.has(name)) {
      data.target=args[0];
      if(name==='bufferData'||name==='bufferSubData') {
        const value=args[name==='bufferData'?1:2];data.bytes=typeof value==='number'?value:value?.byteLength??null;
      } else {
        data.arguments=args.map(value=>typeof value==='number'||typeof value==='string'?value:null);
        const input=args.find(value=>value&&typeof value==='object'&&('byteLength' in value||'width' in value));
        if(input)data.source={bytes:input.byteLength??null,width:input.width??null,height:input.height??null};
      }
    }
    if(name==='clientWaitSync') {data.flags=args[1];data.timeout=args[2];}
    return data;
  };
  metrics.fitStart=()=>{if(!metrics.stopped)fitStarted=now();};
  metrics.fitEnd=()=>{if(!metrics.stopped&&fitStarted!==null){metrics.fit.push({startMs:fitStarted,durationMs:now()-fitStarted});fitStarted=null;}};
  metrics.attach=value=>{
    if(renderer)throw Error('Only one hero renderer expected');renderer=value;
    const gl=renderer.getContext();
    metrics.capabilities={isWebGL2:renderer.capabilities.isWebGL2,contextAttributes:gl.getContextAttributes(),initialCheckShaderErrors:renderer.debug.checkShaderErrors};
    metrics.wrapped=[];
    const names=[...syncMethods,...uploadMethods,...drawMethods,'createShader','createProgram','shaderSource','attachShader','compileShader','linkProgram','useProgram','fenceSync','flush','deleteSync','finish'];
    for(const name of names) {
      const original=gl[name];if(typeof original!=='function')continue;
      gl[name]=function(...args) {
        if(metrics.stopped)return original.apply(this,args);
        const startMs=now(),callPhase=phase(),frame=activeFrame;
        let result,error;
        try {result=original.apply(this,args);return result;}
        catch(thrown){error=String(thrown);throw thrown;}
        finally {
          const endMs=now(),durationMs=endMs-startMs;
          if(frame)aggregate(frame.gl[callPhase],name,durationMs);
          if(drawMethods.has(name)) {
            if(frame) {
              const count=args[name.startsWith('drawArrays')?2:1],instances=name.endsWith('Instanced')?args.at(-1):1;
              const draws=frame.draws[callPhase];draws.calls++;draws.instances+=instances;
              draws.vertices+=count*instances;
              if(args[0]===gl.TRIANGLES)draws.triangles+=count*instances/3;
              draws.cpuMs+=durationMs;draws.maxCallMs=Math.max(draws.maxCallMs,durationMs);
            }
          } else {
            const record={name,startMs,endMs,durationMs,phase:callPhase,frame:frame?.id??null,
              category:syncMethods.has(name)?'sync-query':uploadMethods.has(name)?'upload':/compileShader|linkProgram/.test(name)?'compile-link':'other',...detail(name,args,result)};
            if(error)record.error=error;metrics.calls.push(record);
          }
          if(name==='finish')metrics.violations.push('gl.finish was called');
          if(name==='clientWaitSync'&&args[2]!==0)metrics.violations.push('Nonzero clientWaitSync timeout');
        }
      };
      metrics.wrapped.push(name);
    }
    const render=renderer.render,shadowRender=renderer.shadowMap.render;
    renderer.shadowMap.render=function(...args) {
      if(metrics.stopped)return shadowRender.apply(this,args);
      const startMs=now();shadowDepth++;
      try{return shadowRender.apply(this,args);}
      finally{shadowDepth--;if(activeFrame)activeFrame.shadowSpans.push({startMs,endMs:now(),durationMs:now()-startMs});}
    };
    renderer.render=function(...args) {
      if(metrics.stopped)return render.apply(this,args);
      const empty=()=>({calls:0,instances:0,vertices:0,triangles:0,cpuMs:0,maxCallMs:0});
      const frame={id:metrics.frames.length+1,startMs:now(),draws:{main:empty(),shadow:empty()},gl:{main:{},shadow:{}},shadowSpans:[],
        width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),checkShaderErrors:renderer.debug.checkShaderErrors};
      metrics.frames.push(frame);activeFrame=frame;
      try{return render.apply(this,args);}
      catch(error){frame.error=String(error);throw error;}
      finally {
        frame.endMs=now();frame.cpuMs=frame.endMs-frame.startMs;
        frame.rendererInfo={...renderer.info.render};frame.programCount=renderer.info.programs?.length;
        activeFrame=null;
      }
    };
  };
  // The callable is separate from the serializable terminal evidence.
  metrics.completed=function(evidence) {
    if(metrics.stopped)return;
    const {root,keyLight,...dimensions}=evidence,frame=metrics.frames.at(-1);
    const fence=window.__v2LoadProbe.gpu.filter(item=>item.owner==='hero'&&item.stage==='frame').at(-1);
    if(!frame)return;
    frame.completion={atMs:now(),...Object.fromEntries(Object.entries(dimensions).filter(([key])=>key!=='renderer')),
      readyModels:Number(root.dataset.assemblyModelsReady),submission:JSON.parse(root.dataset.assemblyLastSubmission||'null'),
      fence:fence?{startMs:fence.startMs,endMs:fence.endMs,result:fence.result}:null,
      shadow:{enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,autoUpdate:renderer.shadowMap.autoUpdate,
        configured:keyLight.shadow.mapSize.toArray(),actual:keyLight.shadow.map?{width:keyLight.shadow.map.width,height:keyLight.shadow.map.height}:null}};
    if(root.dataset.assemblyModelsReady!=='3'||evidence.drawnModels!==3||evidence.installedModels!==3||fence?.result?.state!=='complete')return;
    const rect=renderer.domElement.getBoundingClientRect(),style=getComputedStyle(renderer.domElement),header=document.querySelector('.v2-header')?.getBoundingClientRect();
    const visibleArea=Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,header?.bottom||0,rect.top));
    if(visibleArea<=0||style.visibility==='hidden'||style.display==='none'||document.hidden)return;
    if(frame.width!==renderer.domElement.width||frame.height!==renderer.domElement.height||frame.pixelRatio!==evidence.drawnRatio||evidence.drawnRevision!==evidence.currentRevision)return;
    metrics.ready={atMs:now(),gpuCompletedMs:fence.endMs,frameID:frame.id,visibleArea,canvas:{width:renderer.domElement.width,height:renderer.domElement.height},dataset:{...root.dataset},completion:frame.completion};
    metrics.stopped=true;
  };
}

function summarize(sample) {
  const h=sample.hero, horizon=h.ready.atMs, frames=h.frames.filter(item=>item.startMs<horizon),calls=h.calls.filter(item=>item.startMs<horizon);
  const tasks=sample.metrics.longTasks.filter(item=>item.startMs<horizon);
  const queryByProgram={};
  for(const call of calls.filter(item=>item.category==='sync-query')) {
    const group=queryByProgram[call.program??'no-program'] ||= {};
    const value=group[call.name] ||= {count:0,totalMs:0,maxMs:0};
    value.count++;value.totalMs+=call.durationMs;value.maxMs=Math.max(value.maxMs,call.durationMs);
  }
  const glByMethod={};
  for(const name of [...new Set(calls.map(item=>item.name))])glByMethod[name]=shared.summary(calls.filter(item=>item.name===name).map(item=>item.durationMs));
  const finished=sample.requests.filter(item=>item.finished&&item.endMs<=horizon),models=finished.filter(item=>modelURL(item.url));
  return {firstGPUCompletedMs:sample.metrics.milestones.heroFirstGPUCompletedMs,allModelsSubmittedMs:sample.metrics.milestones.heroAllSubmittedMs,
    allModelsGPUCompletedMs:h.ready.gpuCompletedMs,completeReadyMs:horizon,
    rendererCPUms:shared.summary(frames.map(item=>item.cpuMs)),shadowCPUms:shared.summary(frames.flatMap(item=>item.shadowSpans.map(span=>span.durationMs))),
    shadowFitCPUms:shared.summary(h.fit.map(item=>item.durationMs)),
    nativeGPUFenceWaitMs:shared.summary(sample.metrics.gpu.filter(item=>item.owner==='hero'&&item.endMs<=horizon).map(item=>item.endMs-item.waitCalledMs)),
    glSyncQueryCPUms:shared.summary(calls.filter(item=>item.category==='sync-query').map(item=>item.durationMs)),
    compileLinkCPUms:shared.summary(calls.filter(item=>item.category==='compile-link').map(item=>item.durationMs)),
    uploadCPUms:shared.summary(calls.filter(item=>item.category==='upload').map(item=>item.durationMs)),glByMethod,queryByProgram,
    frames:frames.map(item=>({id:item.id,startMs:round(item.startMs),rendererCPUms:round(item.cpuMs),shadowCPUms:round(item.shadowSpans.reduce((sum,span)=>sum+span.durationMs,0)),draws:item.draws,width:item.width,height:item.height,pixelRatio:item.pixelRatio,shadow:item.completion?.shadow,fence:item.completion?.fence})),
    longTasks:{count:tasks.length,totalMs:round(tasks.reduce((sum,item)=>sum+item.durationMs,0)),maxMs:round(Math.max(0,...tasks.map(item=>item.durationMs))),totalBlockingMs:round(tasks.reduce((sum,item)=>sum+Math.max(0,item.durationMs-50),0))},
    trustedInputDelayMs:shared.summary(sample.metrics.inputs.filter(item=>item.trusted&&item.atMs<=horizon).map(item=>item.delayMs)),
    transport:{completedResourceWireBytes:finished.reduce((sum,item)=>sum+(item.wireBytes||0),0),completedModelWireBytes:models.reduce((sum,item)=>sum+(item.wireBytes||0),0),cacheEvidencedModels:models.filter(item=>item.cacheEvidence.length).length},
    factory:sample.metrics.factory.filter(item=>item.factory==='V2HeroAssets'&&item.method==='load'),reconstruction:sample.metrics.reconstructions.filter(item=>item.factory==='hero')};
}
function assertSample(sample) {
  assert.deepEqual(sample.errors,[],'No uncaught errors');
  assert.ok(sample.hero?.ready,'All three current models must complete an existing own-context fence');
  assert.deepEqual(sample.hero.violations,[],'No blocking completion instrumentation');
  const ready=sample.hero.ready,frame=sample.hero.frames.find(item=>item.id===ready.frameID),completion=frame.completion;
  assert.equal(completion.fence.result.state,'complete');assert.ok(completion.fence.startMs>=frame.endMs);
  assert.ok(completion.fence.endMs>=completion.fence.startMs);assert.ok(ready.atMs>=completion.fence.endMs);
  assert.equal(completion.readyModels,3);assert.equal(completion.drawnModels,3);assert.equal(completion.installedModels,3);
  assert.equal(ready.dataset.assemblyEnvironment,'prepared');assert.equal(ready.dataset.assemblyGPUCompletionEvidence,'own-context-fence');
  assert.equal(frame.width,Math.floor(completion.drawnWidth*completion.drawnRatio));assert.equal(frame.height,Math.floor(completion.drawnHeight*completion.drawnRatio));
  for(const rendered of sample.hero.frames) {
    assert.equal(rendered.checkShaderErrors,sample.mode!=='debug-off');
    if(!rendered.completion)continue;
    assert.equal(rendered.completion.shadow.enabled,true);
    assert.deepEqual(rendered.completion.shadow.configured,[2048,2048]);
    assert.deepEqual(rendered.completion.shadow.actual,{width:2048,height:2048});
  }
  assert.ok(frame.draws.main.calls>0&&frame.draws.shadow.calls>0,'Actual main and shadow draws recorded');
  assert.ok(sample.hero.wrapped.includes('getUniformLocation')&&sample.hero.wrapped.includes('getActiveUniform'));
  assert.ok(sample.metrics.inputs.some(item=>item.trusted),'Trusted input probe must run');
  assert.ok(sample.metrics.observerSupport.longtask,'Long-task API supported');
  assert.equal(sample.metrics.factory.some(item=>item.factory==='V2AssemblyModels'&&item.method==='load'),false,'No geometry fallback');
  assert.deepEqual([...new Set(sample.metrics.factory.filter(item=>item.factory==='V2HeroAssets'&&item.method==='load'&&item.endMs&&!item.error).map(item=>item.name))].sort(),['pi','telemetry','tramtrace']);
  const models=sample.requests.filter(item=>modelURL(item.url)&&item.finished);
  assert.ok(models.length);assert.equal(sample.requests.some(item=>item.fromServiceWorker),false);
  assert.deepEqual(sample.requests.filter(item=>item.error&&!/ERR_ABORTED/.test(item.error)),[],'No network failure');
  if(sample.visit==='cold')assert.equal(models.some(item=>item.fromDiskCache||item.servedFromCache),false,'Fresh HTTP cache');
  else assert.ok(models.some(item=>item.cacheEvidence.length),'Cached return must establish a real cache hit');
}
async function measure(context,base,specification,timeout) {
  const page=await context.newPage(),cdp=await context.newCDPSession(page),records=new Map(),errors=[],warnings=[];
  let navigationTimestamp,stop=false,timer,pending=Promise.resolve();
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',network);
  cdp.on('Network.requestWillBeSent',event=>{
    if(event.type==='Document'&&new URL(event.request.url).pathname==='/v2/')navigationTimestamp=event.timestamp;
    records.set(event.requestId,{url:event.request.url,type:event.type,start:event.timestamp,servedFromCache:false});
  });
  cdp.on('Network.requestServedFromCache',event=>{const item=records.get(event.requestId);if(item)item.servedFromCache=true;});
  cdp.on('Network.responseReceived',event=>{const item=records.get(event.requestId);if(item)Object.assign(item,{response:event.timestamp,status:event.response.status,fromDiskCache:Boolean(event.response.fromDiskCache),fromServiceWorker:Boolean(event.response.fromServiceWorker),headers:event.response.headers});});
  cdp.on('Network.dataReceived',event=>{const item=records.get(event.requestId);if(item)(item.dataReceipts ||= []).push({at:event.timestamp,bytes:event.encodedDataLength});});
  cdp.on('Network.loadingFinished',event=>{const item=records.get(event.requestId);if(item)Object.assign(item,{end:event.timestamp,finished:true,wireBytes:event.encodedDataLength});});
  cdp.on('Network.loadingFailed',event=>{const item=records.get(event.requestId);if(item)Object.assign(item,{end:event.timestamp,error:event.errorText});});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push(message.text());});
  // One init script guarantees loadProbe exists before heroProbe uses it.
  await page.addInitScript({content:`(${shared.browserProbe.toString()})();\n(${heroProbe.toString()})();`});
  const input=async()=>{
    if(stop)return;
    try {
      await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'F8',code:'F8',windowsVirtualKeyCode:119,nativeVirtualKeyCode:119,timestamp:Date.now()/1000});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F8',code:'F8',windowsVirtualKeyCode:119,nativeVirtualKeyCode:119,timestamp:Date.now()/1000});
    } catch(error){if(!stop)warnings.push('Input probe: '+String(error));}
    if(!stop)timer=setTimeout(()=>{pending=input();},125);
  };
  let failure,captured;
  try {
    const navigation=page.goto(base+'/v2/',{waitUntil:'domcontentloaded',timeout});pending=input();await navigation;
    await page.waitForFunction(()=>Boolean(window.__heroFirstUse?.ready),null,{timeout});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0))));
  }catch(error){failure=String(error);}
  stop=true;clearTimeout(timer);await pending;
  try {captured=await page.evaluate(()=>({hero:JSON.parse(JSON.stringify(window.__heroFirstUse)),metrics:JSON.parse(JSON.stringify(window.__v2LoadProbe)),resources:performance.getEntriesByType('resource').map(item=>item.toJSON()),navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),userAgent:navigator.userAgent}));}
  catch(error){failure ||= String(error);captured={resources:[]};}
  const sample={...specification,...captured,requests:shared.classifyRequests(records,captured.resources,navigationTimestamp),errors,warnings:[...new Set(warnings)],failure};
  try {if(failure)throw Error(failure);assertSample(sample);sample.summary=summarize(sample);sample.valid=true;}
  catch(error){sample.valid=false;sample.failure=String(error);}
  await page.close();return sample;
}
function compare(samples) {
  const result={},keys=['completeReadyMs','firstGPUCompletedMs','allModelsGPUCompletedMs','allModelsSubmittedMs','rendererCPUms.total','rendererCPUms.max','shadowCPUms.total','nativeGPUFenceWaitMs.total','glSyncQueryCPUms.total','compileLinkCPUms.total','uploadCPUms.total','longTasks.maxMs','longTasks.totalBlockingMs','trustedInputDelayMs.p95','trustedInputDelayMs.max'];
  const get=(object,key)=>key.split('.').reduce((value,part)=>value?.[part],object);
  for(const visit of ['cold','repeat'])for(const mode of modes.slice(1)) {
    const baseline=samples.filter(item=>item.valid&&item.visit===visit&&item.mode==='baseline'),candidate=samples.filter(item=>item.valid&&item.visit===visit&&item.mode===mode);
    result[mode+'/'+visit]=Object.fromEntries(keys.map(key=>[key,{baseline:shared.summary(baseline.map(item=>get(item.summary,key))),candidate:shared.summary(candidate.map(item=>get(item.summary,key))),pairedCandidateMinusBaseline:shared.summary(candidate.map(item=>{const before=baseline.find(value=>value.pair===item.pair);return before?get(item.summary,key)-get(before.summary,key):NaN;}))}]));
  }
  return result;
}
function instrumentationTest() {
  let time=0;
  const sandbox={window:{__v2LoadProbe:{gpu:[]}},performance:{now:()=>++time},innerWidth:1440,innerHeight:1000,
    document:{hidden:false,querySelector:()=>({getBoundingClientRect:()=>({bottom:76})})},
    getComputedStyle:()=>({visibility:'visible',display:'block'})};
  vm.createContext(sandbox);vm.runInContext(`(${heroProbe.toString()})();`,sandbox);
  const probe=sandbox.window.__heroFirstUse;
  const gl={TRIANGLES:4,getContextAttributes:()=>({antialias:true}),createShader:()=>({}),createProgram:()=>({}),
    shaderSource(){},attachShader(){},compileShader(){},linkProgram(){},getProgramParameter:()=>true,
    getShaderParameter:()=>true,getUniformLocation:()=>({}),getActiveUniform:()=>({name:'colour',size:1,type:1}),
    getActiveAttrib:()=>({name:'position',size:1,type:1}),getAttribLocation:()=>0,bufferData(){},texImage2D(){},drawElements(){},drawArrays(){}};
  const renderer={getContext:()=>gl,capabilities:{isWebGL2:true},debug:{checkShaderErrors:true},
    domElement:{width:1440,height:1000,getBoundingClientRect:()=>({left:0,top:0,right:1440,bottom:1000})},
    getPixelRatio:()=>1,info:{render:{calls:1},programs:[{}]},
    shadowMap:{enabled:true,type:2,autoUpdate:false,render(){gl.drawElements(4,12,0,0);}},
    render(){
      const shader=gl.createShader(1),program=gl.createProgram();gl.shaderSource(shader,'shader');gl.attachShader(program,shader);
      gl.compileShader(shader);gl.linkProgram(program);gl.getProgramParameter(program,0x8B82);gl.getShaderParameter(shader,0x8B81);
      gl.getActiveUniform(program,0);gl.getUniformLocation(program,'colour');gl.getActiveAttrib(program,0);gl.getAttribLocation(program,'position');
      renderer.shadowMap.render();gl.bufferData(0,new Uint8Array(24),0);gl.texImage2D(0,0,0,4,4,0,0,0,null);gl.drawArrays(4,0,6);
    }};
  probe.attach(renderer);probe.fitStart();probe.fitEnd();renderer.render();
  const frame=probe.frames[0],evidence={renderer,root:{dataset:{assemblyModelsReady:'3',assemblyLastSubmission:'{}'}},
    keyLight:{shadow:{mapSize:{toArray:()=>[2048,2048]},map:{width:2048,height:2048}}},
    drawnModels:3,installedModels:3,drawnWidth:1440,drawnHeight:1000,drawnRatio:1,drawnRevision:1,currentRevision:1};
  probe.completed(evidence);assert.equal(probe.ready,undefined,'No fence must never satisfy terminal readiness');
  sandbox.window.__v2LoadProbe.gpu.push({owner:'hero',stage:'frame',startMs:++time,endMs:++time,result:{state:'complete'}});
  probe.completed({...evidence,drawnModels:2});assert.equal(probe.ready,undefined,'Partial frame must never satisfy readiness');
  probe.completed({...evidence,currentRevision:2});assert.equal(probe.ready,undefined,'Stale frame must never satisfy readiness');
  probe.completed(evidence);assert.ok(probe.ready);assert.ok(probe.stopped);
  assert.equal(frame.draws.main.calls,1);assert.equal(frame.draws.shadow.calls,1);
  assert.equal(frame.draws.main.triangles,2);assert.equal(frame.draws.shadow.triangles,4);
  assert.equal(probe.calls.find(item=>item.name==='getUniformLocation').program,1);
  assert.equal(probe.calls.find(item=>item.name==='getProgramParameter').parameter,'LINK_STATUS');
  assert.equal(probe.calls.find(item=>item.name==='bufferData').bytes,24);
  assert.equal(probe.programs[0].shaders[0],1);assert.ok(frame.cpuMs>0&&frame.shadowSpans[0].durationMs>0);
  const count=probe.calls.length;renderer.render();assert.equal(probe.calls.length,count,'Stop instrumentation at terminal readiness');
}
function sourceTests(root) {
  const original=fs.readFileSync(path.join(root,'assets/v2-assembly.js'),'utf8');
  const sources=Object.fromEntries(modes.map(mode=>[mode,assemblySource(original,mode)]));
  for(const [mode,source]of Object.entries(sources))new vm.Script(source,{filename:mode+'.js'});
  new vm.Script(`(${shared.browserProbe.toString()})();(${heroProbe.toString()})();`);
  assert.equal(sources['debug-off'].replace('\n      renderer.debug.checkShaderErrors=false;',''),sources.baseline,'Only debug flag differs');
  assert.equal(sources['parallel-install'].replace('      /* Fixture-only: start supporting installation without the intervening frame/timer. */','      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));'),sources.baseline,'Only the installation yield differs');
  assert.throws(()=>assemblySource(original+'\n','baseline'),/exact live/);
  const fixture=prepare(root,'baseline'),html=shared.responseFor(fixture,'/v2/',{'accept-encoding':'gzip'});
  assert.equal(html.status,200);assert.equal(html.headers['Cache-Control'],'max-age=600');assert.equal(html.headers.Vary,'Accept-Encoding');assert.equal(html.headers['Content-Encoding'],'gzip');
  assert.ok(zlib.gunzipSync(html.body).length);
  assert.equal(shared.responseFor(fixture,'/v2/',{'accept-encoding':'gzip','if-none-match':html.headers.ETag}).status,304);
  assert.equal(shared.responseFor(fixture,'/../outside').status,403);
  const gzipFile=[...fixture.prepared.keys()].find(filename=>filename.endsWith('.bin.gz'));
  // Explicit packs are intentionally not in the precompressed map.
  assert.equal(gzipFile,undefined);
  const pack=execFileSync('find',[path.join(root,'assets'),'-name','*.bin.gz'],{encoding:'utf8'}).trim().split('\n')[0];
  assert.ok(pack);const body=shared.responseFor(fixture,'/'+path.relative(root,pack).split(path.sep).join('/'),{'accept-encoding':'gzip'});
  assert.equal(body.headers['Content-Type'],'application/gzip');assert.equal(body.headers['Content-Encoding'],undefined);
  assert.throws(()=>assertSample({errors:[],hero:{}}),/own-context fence/);
  instrumentationTest();
  console.log('PASS source-only: exact live source, unique fixture anchors, independent single-change variants, script/probe syntax, normal gzip/cache/ETag/explicit-pack policy; mocked main/shadow attribution, per-program queries/uploads, and rejected missing/partial/stale fences. No browser or GPU result claimed.');
}
async function main() {
  const root=path.resolve(process.env.V2_HERO_FIRST_USE_ROOT||repo);
  if(process.argv.includes('--source-only'))return sourceTests(root);
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),revision,'Use exact immutable 5a50 worktree');
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'diff','--name-only','HEAD','--','assets','v2'],{cwd:root,encoding:'utf8'}).trim(),'','Production source must be clean');
  const pairs=3,timeout=120000,fixtures=Object.fromEntries(modes.map(mode=>[mode,prepare(root,mode)]));
  const out=path.resolve(process.env.V2_HERO_FIRST_USE_OUT||'/tmp/v2-hero-first-use/profile.json');
  const browserArgs=['--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  const report={capturedAt:new Date().toISOString(),valid:false,revision,root,network,viewport,deviceScaleFactor:1,pairs,visits:18,modes,browserArgs,
    fixtureSources:Object.fromEntries(modes.map(mode=>[mode,fixtures[mode].traces])),
    contract:{completion:'Existing own-context fence completed for one current-size visible hero frame containing all three installed models; no added GPU drain, gl.finish or renderer.compile.',
      cache:'Fresh context per pair/mode. Cold page closes, then NEW page in same context establishes real HTTP cache evidence. No disabled cache or route interception.',
      instrumentation:'Shared load probe plus identical hero renderer/GL wrappers. Debug-off toggles only hero debug.checkShaderErrors. Parallel-install removes only the single initial rAF/timer yield.',
      caveats:['Same Chromium SwiftShader runner; GPU-driver/OS caches are not cleared. Three modes rotate order by matched group.',
        'Entrypoint, render, and shadow CPU values are calling-thread wall times, potentially containing driver waits, not GPU duration. Nested timings overlap and must not be added.',
        'Native fence spans include polling/scheduling latency. Fenced canvas readiness does not assert compositor presentation.',
        'Trusted F8 queue delay is not INP; full long-task duration is retained for tasks beginning before readiness.',
        'Tracing adds overhead equally to all modes; wrappers record after renderer creation, not constructor context initialization.',
        'Parallel-install explicitly changes only fixture scheduling. Neither alternate mode is a production recommendation without measured quality and latency review.']},samples:[]};
  const save=()=>{report.comparison=compare(report.samples);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
  let active=fixtures.baseline,browser;
  const server=http.createServer((request,response)=>{const result=shared.responseFor(active,new URL(request.url,'http://localhost').pathname,request.headers);response.writeHead(result.status,result.headers);response.end(request.method==='HEAD'?undefined:result.body);});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base='http://127.0.0.1:'+server.address().port;report.baseURL=base;
    const {chromium}=require('playwright');browser=await chromium.launch({headless:true,args:browserArgs});report.browserVersion=browser.version();save();
    for(let pair=1;pair<=pairs;pair++) {
      const order=modes.slice(pair-1).concat(modes.slice(0,pair-1));
      for(const mode of order) {
        active=fixtures[mode];const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
        try {for(const visit of ['cold','repeat']) {
          const sample=await measure(context,base,{pair,mode,visit},timeout);report.samples.push(sample);save();
          console.log(JSON.stringify({pair,mode,visit,valid:sample.valid,summary:sample.summary,failure:sample.failure}));
          assert.ok(sample.valid,`${pair}/${mode}/${visit}: ${sample.failure}`);
        }}finally{await context.close();}
      }
    }
    report.valid=true;save();console.log('Completed 18-visit hero first-use report: '+out);
  }catch(error){report.failure=String(error);save();throw error;}
  finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={assemblySource,heroProbe,prepare,assertSample,summarize,compare};

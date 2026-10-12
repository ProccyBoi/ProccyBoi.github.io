/* Test-only staged real-draw experiment on immutable production 649bc32.
 * node scripts/profile-v2-hero-staged-preparation.cjs --source-only
 * V2_HERO_STAGED_ROOT=/tmp/v2-hero-staged-live V2_HERO_STAGED_OUT=/tmp/staged/profile.json \
 *   node scripts/profile-v2-hero-staged-preparation.cjs
 * Three rotated baseline/staged pairs, cold + cached NEW page = 12 measured
 * visits. A separate untimed held-preparation presentation/cancellation smoke
 * follows. No production edits, compile-only trial, debug changes, install
 * reordering, gl.finish, positive clientWaitSync timeout, or forced readiness.
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
const revision = '649bc32ccbabf1c67cbf19628da42b6dbd836be1';
const assemblyHash = '170880ccd680a7acfcc4b5f0c8f64a30c70c7df6482218492b56b989a1f4aeaa';
const modes = ['baseline', 'staged-real-draw'];
const viewport = {width:1440,height:1000};
const network = {offline:false,latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const round = value => Number.isFinite(value) ? Math.round(value*100)/100 : null;
const modelURL = url => /\/models\/|\.(?:glb|gltf|stl|bin)(?:\.gz)?(?:\?|$)/i.test(url);
function replaceOnce(source,before,after) {
  assert.equal(source.split(before).length,2,'Exact, unique fixture anchor: '+before);
  return source.replace(before,after);
}
function assemblySource(original,mode) {
  assert.ok(modes.includes(mode));
  assert.equal(hash(original),assemblyHash,'Only exact live 649bc assembly source is eligible');
  let source=original;
  const constructor="renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});";
  source=replaceOnce(source,constructor,constructor+'\n      window.__heroStaged.attach(renderer);');
  source=replaceOnce(source,"      if(!await gpuWait(abort,'drain')) return;\n      gpuNeedsDrain=false;",
    "      if(!await gpuWait(abort,'drain')) return;\n      window.__heroStaged.stager.drained();\n      gpuNeedsDrain=false;");
  source=replaceOnce(source,'      fitShadows();\n      const started=performance.now();\n      renderer.render(scene,camera);',`
      const __stagedTarget=target;
      const __stagedContext={renderer,scene,camera,keyLight,models,shadows,drawnModels,fitShadows,
        signal:abort.signal,valid:()=>drawable() && target===__stagedTarget && width===drawnWidth && height===drawnHeight && desiredRatio===drawnRatio,root,projects,paintedModels,
        markPending:()=>{gpuNeedsDrain=true;}};
      window.__heroStaged.beforeDraw(__stagedContext,${mode==='staged-real-draw'});
      if(${mode==='staged-real-draw'} && !await window.__heroStaged.stager.prepare(__stagedContext)) return;
      if(!drawable() || abort.signal.aborted || target!==__stagedTarget || width!==drawnWidth || height!==drawnHeight || desiredRatio!==drawnRatio) return;
      const __restoreArrivals=window.__heroStaged.stager.maskArrivals(__stagedContext);
      let started;
      try {
        window.__heroStaged.fitStart();
        fitShadows();
        window.__heroStaged.fitEnd();
        started=performance.now();
        window.__heroStaged.liveContext(__stagedContext);
        renderer.render(scene,camera);
      } finally { __restoreArrivals(); }
`);
  source=replaceOnce(source,"      root.dataset.assemblyState='ready';",`      root.dataset.assemblyState='ready';
      window.__heroStaged.completed({root,renderer,keyLight,drawnModels:drawnModels.filter(Boolean).length,
        installedModels:models.filter(Boolean).length,drawnWidth,drawnHeight,drawnRatio,drawnRevision,currentRevision:revision});`);
  source=replaceOnce(source, '  function failRenderer(error) {\n    failed=true; interrupt();', '  function failRenderer(error) {\n    failed=true; interrupt();\n    window.__heroStaged.terminalFailure={error:String(error),atMs:performance.now(),deferred:window.__heroStaged.stager.deferredEvidence()};');
  return source;
}
function prepare(root,mode) {
  const fixture=shared.prepareFixture(root),filename=path.join(root,'assets/v2-assembly.js');
  const original=fs.readFileSync(filename,'utf8'),raw=Buffer.from(assemblySource(original,mode));
  fixture.prepared.set(filename,{raw,gzip:zlib.gzipSync(raw,{level:6}),etag:hash(raw)});
  fixture.traces.push({path:'assets/v2-assembly.js',originalSHA256:hash(original),servedSHA256:hash(raw),overheadBytes:raw.length-Buffer.byteLength(original)});
  return fixture;
}

// Serialized into the diagnostic page. Every warm is a real draw in the SAME
// hero context. It changes no model transform/material or installation order.
function stagedRuntime(metrics) {
  const warmed=new WeakSet(),deferred=[];
  const current=context=>!context.signal.aborted&&context.valid();
  const names=context=>context.models.map((model,index)=>model?.group.visible?context.projects[index].name:null).filter(Boolean);
  const dispose=items=>{for(const item of new Set(items.filter(Boolean)))item.dispose();};
  const rememberVisibility=context=>{
    const states=new Map();
    return {
      capture(){for(const model of context.models)if(model&&!states.has(model.group))states.set(model.group,model.group.visible);
        for(const plane of context.shadows)if(plane&&!states.has(plane))states.set(plane,plane.visible);},
      restore(){for(const [object,visible]of states)object.visible=visible;},
      states
    };
  };
  function maskArrivals(context) {
    const states=rememberVisibility(context);states.capture();
    context.models.forEach((model,index)=>{
      if(model&&model!==context.drawnModels[index]){model.group.visible=false;if(context.shadows[index])context.shadows[index].visible=false;}
    });
    return ()=>states.restore();
  }
  async function checkpoint(phase,context,entry) {
    const control=window.__heroStagedControl;
    if(!control||control.finished||!context.paintedModels.some(Boolean)||control.modelID&&control.modelID!==entry.modelID)return;
    control.modelID=entry.modelID;control.phase=phase;control.entryID=entry.id;
    if(phase==='before') {
      const T=window.THREE,index=context.paintedModels.findIndex(Boolean),model=context.paintedModels[index];
      const box=new T.Box3().setFromObject(model.group),rect=context.renderer.domElement.getBoundingClientRect(),points=[];
      for(let corner=0;corner<8;corner++)points.push(new T.Vector3(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).project(context.camera));
      const x=rect.left+(Math.min(...points.map(p=>p.x))+1)*rect.width/2,y=rect.top+(1-Math.max(...points.map(p=>p.y)))*rect.height/2;
      const width=(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))*rect.width/2,height=(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))*rect.height/2;
      control.clip={x:Math.max(0,Math.floor(x+width*.25)),y:Math.max(0,Math.floor(y+height*.25)),width:Math.max(1,Math.floor(width*.5)),height:Math.max(1,Math.floor(height*.5))};
      control.paintedName=context.projects[index].name;
    }
    await new Promise(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;context.signal.removeEventListener('abort',done);control.release=null;resolve();};control.release=done;context.signal.addEventListener('abort',done,{once:true});if(context.signal.aborted)done();});
    if(phase==='held')control.finished=true;
  }
  async function prepare(context) {
    const {renderer,scene,camera,keyLight,drawnModels,signal,valid,root}=context;
    // Freeze eligibility before any await. Later installations never join this
    // transaction and hidden chapter models do not get warmed opportunistically.
    const eligible=drawnModels.map((model,index)=>({model,index})).filter(({model,index})=>model&&model===context.models[index]&&model.group.visible&&!warmed.has(model));
    for(const {model,index}of eligible) {
      if(!current(context))return false;
      if(model!==context.models[index])continue;
      const entry={id:metrics.warms.length+1,modelID:metrics.modelID(model),name:context.projects[index].name,
        requestedModels:drawnModels.map((item,i)=>item?context.projects[i].name:null).filter(Boolean),
        previouslyPainted:context.paintedModels.map((item,i)=>item?context.projects[i].name:null).filter(Boolean),startMs:performance.now()};
      metrics.warms.push(entry);await checkpoint('before',context,entry);
      if(!current(context))return false;
      const shadow=keyLight.shadow,visibility=rememberVisibility(context);
      visibility.capture();
      const saved={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
        viewport:renderer.getViewport(new window.THREE.Vector4()),scissor:renderer.getScissor(new window.THREE.Vector4()),scissorTest:renderer.getScissorTest(),
        map:shadow.map,mapPass:shadow.mapPass,mapSize:shadow.mapSize.clone(),camera:shadow.camera.clone(),matrix:shadow.matrix.clone(),frustum:shadow.getFrustum().clone(),
        position:keyLight.position.clone(),targetPosition:keyLight.target.position.clone(),needsUpdate:shadow.needsUpdate,rendererNeedsUpdate:renderer.shadowMap.needsUpdate};
      const target=new window.THREE.WebGLRenderTarget(64,64);
      target.texture.encoding=renderer.outputEncoding;
      let submitted=false,complete=false,warmMap,warmPass;
      try {
        // Capture and mask again immediately before submission, including any
        // installations that completed while the previous own-context fence ran.
        visibility.capture();
        context.models.forEach((other,i)=>{if(other)other.group.visible=other===model;if(context.shadows[i])context.shadows[i].visible=other===model;});
        shadow.map=null;shadow.mapPass=null;shadow.mapSize.set(64,64);
        renderer.setRenderTarget(target);
        metrics.activeWarm=entry;metrics.drawContext={requestedModels:entry.requestedModels,actualModels:names(context),modelIDs:[entry.modelID]};
        const fitStart=performance.now();context.fitShadows();entry.fitCPUms=performance.now()-fitStart;
        entry.actualModels=names(context);entry.visibleSoftShadows=context.shadows.map((plane,i)=>plane?.visible?context.projects[i].name:null).filter(Boolean);
        entry.outputEncoding=renderer.outputEncoding;entry.targetEncoding=target.texture.encoding;
        entry.canvasBefore={width:renderer.domElement.width,height:renderer.domElement.height};
        context.markPending();submitted=true;
        entry.renderStartMs=performance.now();renderer.render(scene,camera);entry.renderEndMs=performance.now();
        entry.renderCPUms=entry.renderEndMs-entry.renderStartMs;
        warmMap=shadow.map;warmPass=shadow.mapPass;
        entry.shadow={configured:shadow.mapSize.toArray(),actual:warmMap?{width:warmMap.width,height:warmMap.height}:null};
        const oldPhase=root.dataset.assemblyGPUPhase;root.dataset.assemblyGPUPhase='staged-real-draw';
        try {
          entry.fenceStartMs=performance.now();
          entry.fence=await window.V2GPUPreparation.wait(renderer,{signal,valid,pollMs:4});
          entry.fenceEndMs=performance.now();
        } finally {if(oldPhase===undefined)delete root.dataset.assemblyGPUPhase;else root.dataset.assemblyGPUPhase=oldPhase;}
        complete=entry.fence.state==='complete';
        if(complete)warmed.add(model);
        if(entry.fence.state==='timeout'||entry.fence.state==='lost'||entry.fence.state==='unsupported')throw Error('Staged hero GPU '+entry.fence.state);
        if(!complete||!current(context))return false;
        await checkpoint('held',context,entry);
        if(!current(context))return false;
      } catch(error) {entry.error=String(error);throw error;}
      finally {
        metrics.activeWarm=null;warmMap ||= shadow.map;warmPass ||= shadow.mapPass;
        // Restore all scene/shadow/target state even on abort or renderer throw.
        // The original completed 2048 map is retained and never disposed here.
        visibility.capture();visibility.restore();
        shadow.map=saved.map;shadow.mapPass=saved.mapPass;shadow.mapSize.copy(saved.mapSize);
        shadow.camera.copy(saved.camera);shadow.matrix.copy(saved.matrix);shadow.getFrustum().copy(saved.frustum);
        keyLight.position.copy(saved.position);keyLight.target.position.copy(saved.targetPosition);
        keyLight.updateMatrixWorld();keyLight.target.updateMatrixWorld();
        shadow.needsUpdate=saved.needsUpdate;renderer.shadowMap.needsUpdate=saved.rendererNeedsUpdate;
        renderer.setRenderTarget(saved.target,saved.face,saved.mip);renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);
        const resources=[target,warmMap!==saved.map?warmMap:null,warmPass!==saved.mapPass?warmPass:null];
        if(complete||!submitted){dispose(resources);entry.disposal='completed-fence';}
        else {deferred.push({resources,entry});entry.disposal='deferred-to-existing-drain';}
        entry.restored={targetIsOriginal:renderer.getRenderTarget()===saved.target,mapIsOriginal:shadow.map===saved.map,mapPassIsOriginal:shadow.mapPass===saved.mapPass,
          configured:shadow.mapSize.toArray(),actual:shadow.map?{width:shadow.map.width,height:shadow.map.height}:null,
          canvas:{width:renderer.domElement.width,height:renderer.domElement.height},visibleModels:names(context)};
        entry.canceled=signal.aborted || !valid();
        entry.endMs=performance.now();entry.totalCPUAndFenceWallMs=entry.endMs-entry.startMs;
      }
    }
    return current(context);
  }
  return {prepare,maskArrivals,drained(){for(const item of deferred.splice(0)){dispose(item.resources);item.entry.disposal='completed-existing-drain';item.entry.disposedMs=performance.now();}},pendingDisposals:()=>deferred.length,deferredEvidence:()=>deferred.map(item=>({warmID:item.entry.id,name:item.entry.name,resources:item.resources.filter(Boolean).length,disposal:item.entry.disposal}))};
}
// All instrumentation runs in the page and records only this hero GL context.
// Timing a GL entrypoint measures calling-thread wall time, NOT execution time
// on the GPU. Synchronous calls can include driver waits. Shadow/render spans
// contain their nested GL calls and must never be added to those call totals.
function heroProbe(makeStager) {
  const now=()=>performance.now();
  const metrics=window.__heroStaged={frames:[],compiles:[],warms:[],liveMilestones:[],transactions:[],modelSets:[],calls:[],programs:[],shaders:[],stopped:false,fit:[],violations:[]};
  const programs=new WeakMap(),shaders=new WeakMap(),modelIDs=new WeakMap();
  let nextModelID=0;
  metrics.modelID=model=>{if(!modelIDs.has(model))modelIDs.set(model,++nextModelID);return modelIDs.get(model);};
  metrics.stager=makeStager(metrics);
  let renderer,activeFrame=null,activeCompile=null,boundProgramID=null,shadowDepth=0,fitStarted=null,previousModels=[];
  const programID=value=>value ? programs.get(value)?.id||null : null;
  const shaderID=value=>value ? shaders.get(value)?.id||null : null;
  const phase=()=>activeCompile?'compile':shadowDepth?'shadow':activeFrame?'main':'outside-render';
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
    if(name==='useProgram') {
      boundProgramID=data.program;
      if(activeFrame&&data.program&&!activeFrame.programs.includes(data.program))activeFrame.programs.push(data.program);
    }
    if(name==='shaderSource') {
      data.sourceCharacters=args[1]?.length;const entry=shaders.get(args[0]);
      // Retain the existing immutable string reference; serialize/hash only
      // after readiness, never in the measured calling-thread interval.
      if(entry){entry.sourceCharacters=data.sourceCharacters;entry.source=args[1];}
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
  metrics.beforeDraw=(context,staged)=>{
    if(metrics.stopped)return;
    if(context.renderer!==renderer)throw Error('Staging must use the hero renderer');
    const {drawnModels:models,projects}=context;
    const requestedModels=models.map((model,index)=>model?projects[index].name:null).filter(Boolean);
    metrics.transactions.push({id:metrics.transactions.length+1,startMs:now(),requestedModels,
      modelIDs:models.filter(Boolean).map(metrics.modelID),staged});
    if(models.length===previousModels.length&&models.every((model,index)=>model===previousModels[index]))return;
    previousModels=models.slice();
    metrics.modelSets.push({id:metrics.modelSets.length+1,atMs:now(),requestedModels,
      visibleModels:models.map((model,index)=>model?.group.visible?projects[index].name:null).filter(Boolean),staged});
  };
  metrics.liveContext=context=>{
    metrics.drawContext={requestedModels:context.drawnModels.map((model,index)=>model?context.projects[index].name:null).filter(Boolean),
      actualModels:context.models.map((model,index)=>model?.group.visible?context.projects[index].name:null).filter(Boolean),
      modelIDs:context.models.filter(model=>model?.group.visible).map(metrics.modelID)};
  };
  metrics.attach=value=>{
    if(renderer)throw Error('Only one hero renderer expected');renderer=value;
    const gl=renderer.getContext();
    metrics.capabilities={isWebGL2:renderer.capabilities.isWebGL2,contextAttributes:gl.getContextAttributes(),initialCheckShaderErrors:renderer.debug.checkShaderErrors};
    metrics.wrapped=[];
    const methodNames=new Set([...syncMethods,...uploadMethods,...drawMethods,'createShader','createProgram','shaderSource','attachShader','compileShader','linkProgram','useProgram','fenceSync','flush','deleteSync','finish']);
    for(let prototype=gl;prototype&&prototype!==Object.prototype;prototype=Object.getPrototypeOf(prototype)) {
      for(const name of Object.getOwnPropertyNames(prototype)) {
        if(name!=='constructor'&&typeof Object.getOwnPropertyDescriptor(prototype,name)?.value==='function')methodNames.add(name);
      }
    }
    const names=[...methodNames];
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
          if(activeCompile)aggregate(activeCompile.gl,name,durationMs);
          if(drawMethods.has(name)) {
            if(activeCompile)metrics.violations.push('renderer.compile unexpectedly issued a draw');
            if(frame) {
              if(boundProgramID&&!frame.programs.includes(boundProgramID))frame.programs.push(boundProgramID);
              const count=args[name.startsWith('drawArrays')?2:1],instances=name.endsWith('Instanced')?args.at(-1):1;
              const draws=frame.draws[callPhase];draws.calls++;draws.instances+=instances;
              draws.vertices+=count*instances;
              if(args[0]===gl.TRIANGLES)draws.triangles+=count*instances/3;
              draws.cpuMs+=durationMs;draws.maxCallMs=Math.max(draws.maxCallMs,durationMs);
            }
          } else {
            const record={name,startMs,endMs,durationMs,phase:callPhase,kind:frame?.kind??null,frame:frame?.id??activeCompile?.frame??null,compile:activeCompile?.id??null,
              category:syncMethods.has(name)?'sync-query':uploadMethods.has(name)?'upload':/compileShader|linkProgram/.test(name)?'compile-link':'other',...detail(name,args,result)};
            if(error)record.error=error;metrics.calls.push(record);
          }
          if(name==='finish')metrics.violations.push('gl.finish was called');
          if(name==='clientWaitSync'&&args[2]!==0)metrics.violations.push('Nonzero clientWaitSync timeout');
        }
      };
      metrics.wrapped.push(name);
    }
    const render=renderer.render,compile=renderer.compile,shadowRender=renderer.shadowMap.render;
    renderer.compile=function(...args) {
      if(metrics.stopped)return compile.apply(this,args);
      metrics.violations.push('renderer.compile is forbidden in real-draw staging');
      const entry={id:metrics.compiles.length+1,frame:metrics.frames.length+1,modelSet:metrics.modelSets.at(-1)?.id,
        startMs:now(),gl:{},checkShaderErrors:renderer.debug.checkShaderErrors};
      metrics.compiles.push(entry);activeCompile=entry;
      try{return compile.apply(this,args);}
      catch(error){entry.error=String(error);throw error;}
      finally{entry.endMs=now();entry.cpuMs=entry.endMs-entry.startMs;activeCompile=null;}
    };
    renderer.shadowMap.render=function(...args) {
      if(metrics.stopped)return shadowRender.apply(this,args);
      const startMs=now();shadowDepth++;
      try{return shadowRender.apply(this,args);}
      finally{shadowDepth--;if(activeFrame)activeFrame.shadowSpans.push({startMs,endMs:now(),durationMs:now()-startMs});}
    };
    renderer.render=function(...args) {
      if(metrics.stopped)return render.apply(this,args);
      const empty=()=>({calls:0,instances:0,vertices:0,triangles:0,cpuMs:0,maxCallMs:0});
      const target=renderer.getRenderTarget();
      const frame={id:metrics.frames.length+1,kind:metrics.activeWarm?'warm':'live',warmID:metrics.activeWarm?.id??null,programs:[],
        requestedModels:metrics.drawContext?.requestedModels||[],actualModels:metrics.drawContext?.actualModels||[],modelIDs:metrics.drawContext?.modelIDs||[],
        target:target?{width:target.width,height:target.height,encoding:target.texture.encoding}:null,outputEncoding:renderer.outputEncoding,
        startMs:now(),draws:{main:empty(),shadow:empty()},gl:{main:{},shadow:{}},shadowSpans:[],
        width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),checkShaderErrors:renderer.debug.checkShaderErrors};
      metrics.frames.push(frame);activeFrame=frame;
      try{return render.apply(this,args);}
      catch(error){frame.error=String(error);throw error;}
      finally {
        frame.endMs=now();frame.cpuMs=frame.endMs-frame.startMs;
        const preparation=metrics.warms.find(item=>item.id===frame.warmID);
        frame.warmID=preparation?.id??frame.warmID;
        frame.rendererInfo={...renderer.info.render};frame.programCount=renderer.info.programs?.length;
        activeFrame=null;
      }
    };
  };
  // The callable is separate from the serializable terminal evidence.
  metrics.completed=function(evidence) {
    if(metrics.stopped)return;
    const {root,keyLight,...dimensions}=evidence,frame=metrics.frames.filter(item=>item.kind==='live').at(-1);
    const fence=window.__v2LoadProbe.gpu.filter(item=>item.owner==='hero'&&item.stage==='frame').at(-1);
    if(!frame||frame.kind!=='live'||frame.target)return;
    frame.completion={atMs:now(),...Object.fromEntries(Object.entries(dimensions).filter(([key])=>key!=='renderer')),
      readyModels:Number(root.dataset.assemblyModelsReady),submission:JSON.parse(root.dataset.assemblyLastSubmission||'null'),
      fence:fence?{startMs:fence.startMs,endMs:fence.endMs,result:fence.result}:null,
      shadow:{enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,autoUpdate:renderer.shadowMap.autoUpdate,
        configured:keyLight.shadow.mapSize.toArray(),actual:keyLight.shadow.map?{width:keyLight.shadow.map.width,height:keyLight.shadow.map.height}:null}};
    const transaction=metrics.transactions.at(-1);
    if(transaction){transaction.endMs=now();transaction.liveFrameID=frame.id;transaction.totalCPUAndFenceWallMs=transaction.endMs-transaction.startMs;}
    const rect=renderer.domElement.getBoundingClientRect(),style=getComputedStyle(renderer.domElement),header=document.querySelector('.v2-header')?.getBoundingClientRect();
    const visibleArea=Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,header?.bottom||0,rect.top));
    const visibleCurrent=visibleArea>0&&style.visibility!=='hidden'&&style.display!=='none'&&!document.hidden&&
      frame.width===renderer.domElement.width&&frame.height===renderer.domElement.height&&frame.pixelRatio===evidence.drawnRatio;
    if(fence?.result?.state==='complete'&&fence.startMs>=frame.endMs&&evidence.drawnModels>0&&Number(root.dataset.assemblyModelsReady)>0&&visibleCurrent){
      const milestone={atMs:now(),gpuCompletedMs:fence.endMs,frameID:frame.id,actualModels:frame.actualModels,readyModels:Number(root.dataset.assemblyModelsReady),visibleArea};
      metrics.liveMilestones.push(milestone);metrics.firstLive ||= milestone;
    }
    if(root.dataset.assemblyModelsReady!=='3'||evidence.drawnModels!==3||evidence.installedModels!==3||fence?.result?.state!=='complete'||fence.startMs<frame.endMs)return;
    if(!visibleCurrent||evidence.drawnRevision!==evidence.currentRevision)return;
    metrics.ready={atMs:now(),gpuCompletedMs:fence.endMs,frameID:frame.id,visibleArea,canvas:{width:renderer.domElement.width,height:renderer.domElement.height},dataset:{...root.dataset},completion:frame.completion};
    metrics.pendingDisposals=metrics.stager.pendingDisposals();
    metrics.stopped=true;
  };
}

function sourceSignatures(hero,kind) {
  const programIDs=kind?new Set(hero.frames.filter(frame=>frame.kind===kind).flatMap(frame=>frame.programs)):null;
  const programs=hero.programs.filter(program=>!programIDs||programIDs.has(program.id));
  const shaderIDs=new Set(programs.flatMap(program=>program.shaders));
  const shaders=hero.shaders.filter(shader=>shaderIDs.has(shader.id));
  const byType=Object.fromEntries([...new Set(shaders.map(shader=>shader.type))].sort().map(type=>{
    const selected=shaders.filter(shader=>shader.type===type);
    return [type,{count:selected.length,uniqueSHA256:[...new Set(selected.map(shader=>hash(shader.source)))].sort()}];
  }));
  const signatures=programs.map(program=>program.shaders.map(id=>{const shader=hero.shaders.find(value=>value.id===id);return shader.type+':'+hash(shader.source);}).sort().join('|'));
  return {byType,programCount:programs.length,distinctProgramCount:new Set(signatures).size,programSHA256:signatures.map(hash).sort(),uniqueProgramSHA256:[...new Set(signatures.map(hash))].sort()};
}
function summarize(sample) {
  const h=sample.hero,horizon=h.ready.atMs,frames=h.frames.filter(item=>item.startMs<horizon),calls=h.calls.filter(item=>item.startMs<horizon);
  const tasks=sample.metrics.longTasks.filter(item=>item.startMs<horizon);
  const queryByProgram={};
  for(const call of calls.filter(item=>item.category==='sync-query')) {
    const group=queryByProgram[call.program??'no-program'] ||= {},value=group[call.name] ||= {count:0,totalMs:0,maxMs:0};
    value.count++;value.totalMs+=call.durationMs;value.maxMs=Math.max(value.maxMs,call.durationMs);
  }
  const glByPhase={};
  for(const kind of ['warm','live',null])for(const phase of ['main','shadow','outside-render']) {
    const scoped=calls.filter(item=>item.kind===kind&&item.phase===phase);
    glByPhase[(kind||'outside')+'/'+phase]={callingThreadMs:shared.summary(scoped.map(item=>item.durationMs)),
      methods:Object.fromEntries([...new Set(scoped.map(item=>item.name))].map(name=>[name,shared.summary(scoped.filter(item=>item.name===name).map(item=>item.durationMs))]))};
  }
  const finished=sample.requests.filter(item=>item.finished&&item.endMs<=horizon),models=finished.filter(item=>modelURL(item.url));
  return {firstGPUCompletedMs:h.firstLive.gpuCompletedMs,firstGPUCompletedModels:h.firstLive.actualModels,
    allModelsSubmittedMs:sample.metrics.milestones.heroAllSubmittedMs,allModelsGPUCompletedMs:h.ready.gpuCompletedMs,completeReadyMs:horizon,
    rendererCPUms:shared.summary(frames.map(item=>item.cpuMs)),liveRendererCPUms:shared.summary(frames.filter(item=>item.kind==='live').map(item=>item.cpuMs)),
    warmRendererCPUms:shared.summary(h.warms.map(item=>item.renderCPUms)),warmCPUAndFenceWallMs:shared.summary(h.warms.map(item=>item.totalCPUAndFenceWallMs)),
    warmNativeFenceWaitMs:shared.summary(h.warms.map(item=>item.fenceEndMs-item.fenceStartMs)),
    transactionCPUAndFenceWallMs:shared.summary(h.transactions.filter(item=>item.endMs).map(item=>item.totalCPUAndFenceWallMs)),
    shadowCPUms:shared.summary(frames.flatMap(item=>item.shadowSpans.map(span=>span.durationMs))),shadowFitCPUms:shared.summary(h.fit.map(item=>item.durationMs)),
    nativeGPUFenceWaitMs:shared.summary(sample.metrics.gpu.filter(item=>item.owner==='hero'&&item.endMs<=horizon).map(item=>item.endMs-item.waitCalledMs)),
    glSyncQueryCPUms:shared.summary(calls.filter(item=>item.category==='sync-query').map(item=>item.durationMs)),
    compileLinkCPUms:shared.summary(calls.filter(item=>item.category==='compile-link').map(item=>item.durationMs)),
    uploadCPUms:shared.summary(calls.filter(item=>item.category==='upload').map(item=>item.durationMs)),glByPhase,queryByProgram,
    shaderSources:sourceSignatures(h),liveShaderSources:sourceSignatures(h,'live'),warmShaderSources:sourceSignatures(h,'warm'),
    frames:frames.map(item=>({id:item.id,kind:item.kind,startMs:round(item.startMs),rendererCPUms:round(item.cpuMs),actualModels:item.actualModels,requestedModels:item.requestedModels,
      shadowCPUms:round(item.shadowSpans.reduce((sum,span)=>sum+span.durationMs,0)),draws:item.draws,width:item.width,height:item.height,pixelRatio:item.pixelRatio,target:item.target,shadow:item.completion?.shadow,fence:item.completion?.fence})),
    longTasks:{count:tasks.length,totalMs:round(tasks.reduce((sum,item)=>sum+item.durationMs,0)),maxMs:round(Math.max(0,...tasks.map(item=>item.durationMs))),totalBlockingMs:round(tasks.reduce((sum,item)=>sum+Math.max(0,item.durationMs-50),0))},
    trustedInputDelayMs:shared.summary(sample.metrics.inputs.filter(item=>item.trusted&&item.atMs<=horizon).map(item=>item.delayMs)),
    transport:{completedResourceWireBytes:finished.reduce((sum,item)=>sum+(item.wireBytes||0),0),completedModelWireBytes:models.reduce((sum,item)=>sum+(item.wireBytes||0),0),cacheEvidencedModels:models.filter(item=>item.cacheEvidence.length).length},
    factory:sample.metrics.factory.filter(item=>item.factory==='V2HeroAssets'&&item.method==='load'),reconstruction:sample.metrics.reconstructions.filter(item=>item.factory==='hero')};
}
function assertSample(sample) {
  assert.deepEqual(sample.errors,[],'No uncaught errors');
  assert.ok(sample.hero?.ready,'All three current models must complete an existing own-context fence');
  const h=sample.hero,ready=h.ready,frame=h.frames.find(item=>item.id===ready.frameID),completion=frame.completion;
  assert.equal(h.terminalFailure,undefined,'Terminal renderer failure invalidates the diagnostic');
  assert.deepEqual(h.violations,[],'No blocking completion or compile-only work');assert.equal(h.compiles.length,0);
  assert.equal(completion.fence.result.state,'complete');assert.ok(completion.fence.startMs>=frame.endMs);
  assert.ok(ready.atMs>=completion.fence.endMs);assert.equal(frame.kind,'live');assert.equal(frame.target,null);
  assert.equal(completion.readyModels,3);assert.equal(completion.drawnModels,3);assert.equal(completion.installedModels,3);
  assert.equal(ready.dataset.assemblyEnvironment,'prepared');assert.equal(ready.dataset.assemblyGPUCompletionEvidence,'own-context-fence');
  assert.equal(frame.width,Math.floor(completion.drawnWidth*completion.drawnRatio));assert.equal(frame.height,Math.floor(completion.drawnHeight*completion.drawnRatio));
  assert.equal(h.pendingDisposals,0,'Every successful measured warm disposed behind its completed fence');
  assert.equal(h.capabilities.contextAttributes.preserveDrawingBuffer,false,'Preserve the real renderer context attributes');
  for(const rendered of h.frames) {
    assert.equal(rendered.checkShaderErrors,true);assert.ok(rendered.draws.main.calls>0&&rendered.draws.shadow.calls>0,'Real main and shadow draws');
    assert.ok(rendered.actualModels.every(name=>rendered.requestedModels.includes(name)),'A newly arriving model cannot bypass the captured revision');
    if(rendered.kind==='warm'){assert.deepEqual(rendered.target,{width:64,height:64,encoding:rendered.outputEncoding});assert.equal(rendered.actualModels.length,1);}
    else assert.equal(rendered.target,null,'Every live frame uses the default canvas');
    if(!rendered.completion)continue;
    assert.equal(rendered.completion.shadow.enabled,true);assert.deepEqual(rendered.completion.shadow.configured,[2048,2048]);
    assert.deepEqual(rendered.completion.shadow.actual,{width:2048,height:2048});
  }
  assert.ok(h.firstLive&&h.liveMilestones.length,'First CAD milestone requires an actual live fence');
  assert.equal(h.frames.find(item=>item.id===h.firstLive.frameID).kind,'live');
  if(sample.mode==='baseline')assert.equal(h.warms.length,0);
  else {
    assert.equal(h.warms.length,3,'One warm for each actual overview model object');
    assert.equal(new Set(h.warms.map(item=>item.modelID)).size,3);
    for(const warm of h.warms) {
      assert.deepEqual(warm.actualModels,[warm.name]);assert.deepEqual(warm.visibleSoftShadows,[warm.name]);
      assert.equal(warm.outputEncoding,warm.targetEncoding);assert.equal(warm.fence.state,'complete');
      assert.ok(warm.fenceStartMs>=warm.renderEndMs&&warm.fenceEndMs>=warm.fenceStartMs);
      assert.deepEqual(warm.shadow,{configured:[64,64],actual:{width:64,height:64}});
      assert.equal(warm.disposal,'completed-fence');assert.equal(warm.restored.targetIsOriginal,true);
      assert.equal(warm.restored.mapIsOriginal,true);assert.equal(warm.restored.mapPassIsOriginal,true);
      assert.deepEqual(warm.restored.configured,[2048,2048]);assert.deepEqual(warm.restored.canvas,warm.canvasBefore);
      const firstLive=h.frames.find(item=>item.kind==='live'&&item.modelIDs.includes(warm.modelID));
      assert.ok(firstLive&&firstLive.startMs>=warm.fenceEndMs,'Warm fence precedes this object’s first live submission');
    }
  }
  assert.ok(h.shaders.length&&h.shaders.every(item=>typeof item.source==='string'));
  assert.ok(h.wrapped.includes('getUniformLocation')&&h.wrapped.includes('getActiveUniform'));
  assert.ok(sample.metrics.inputs.some(item=>item.trusted));assert.ok(sample.metrics.observerSupport.longtask);
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
  await page.addInitScript({content:`(${shared.browserProbe.toString()})();\n(${heroProbe.toString()})(${stagedRuntime.toString()});`});
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
    await page.waitForFunction(()=>Boolean(window.__heroStaged?.ready||window.__heroStaged?.terminalFailure),null,{timeout});
    const terminal=await page.evaluate(()=>window.__heroStaged?.terminalFailure);if(terminal)throw Error('Terminal hero fixture failure: '+JSON.stringify(terminal));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0))));
  }catch(error){failure=String(error);}
  stop=true;clearTimeout(timer);await pending;
  try {captured=await page.evaluate(()=>({hero:JSON.parse(JSON.stringify({...window.__heroStaged,pendingDisposals:window.__heroStaged?.stager.pendingDisposals()})),metrics:JSON.parse(JSON.stringify(window.__v2LoadProbe)),resources:performance.getEntriesByType('resource').map(item=>item.toJSON()),navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),userAgent:navigator.userAgent}));}
  catch(error){failure ||= String(error);captured={resources:[]};}
  const sample={...specification,...captured,requests:shared.classifyRequests(records,captured.resources,navigationTimestamp),errors,warnings:[...new Set(warnings)],failure};
  try {if(failure)throw Error(failure);assertSample(sample);sample.summary=summarize(sample);sample.valid=true;}
  catch(error){sample.valid=false;sample.failure=String(error);}
  await page.close();return sample;
}
function compare(samples) {
  const result={},keys=['completeReadyMs','firstGPUCompletedMs','allModelsGPUCompletedMs','allModelsSubmittedMs','rendererCPUms.total','rendererCPUms.max','liveRendererCPUms.total','liveRendererCPUms.max','warmRendererCPUms.total','warmCPUAndFenceWallMs.total','warmNativeFenceWaitMs.total','transactionCPUAndFenceWallMs.total','transactionCPUAndFenceWallMs.max','shadowCPUms.total','nativeGPUFenceWaitMs.total','glSyncQueryCPUms.total','compileLinkCPUms.total','uploadCPUms.total','longTasks.maxMs','longTasks.totalBlockingMs','trustedInputDelayMs.p95','trustedInputDelayMs.max'];
  const get=(object,key)=>key.split('.').reduce((value,part)=>value?.[part],object);
  for(const visit of ['cold','repeat']) {
    const baseline=samples.filter(item=>item.valid&&item.visit===visit&&item.mode==='baseline'),candidate=samples.filter(item=>item.valid&&item.visit===visit&&item.mode==='staged-real-draw');
    result[visit]=Object.fromEntries(keys.map(key=>[key,{baseline:shared.summary(baseline.map(item=>get(item.summary,key))),candidate:shared.summary(candidate.map(item=>get(item.summary,key))),
      pairedCandidateMinusBaseline:shared.summary(candidate.map(item=>{const before=baseline.find(value=>value.pair===item.pair);return before?get(item.summary,key)-get(before.summary,key):NaN;}))}]));
  }
  return result;
}
function shaderParity(samples) {
  const output=[];
  for(const candidate of samples.filter(item=>item.valid&&item.mode==='staged-real-draw')) {
    const baseline=samples.find(item=>item.valid&&item.mode==='baseline'&&item.pair===candidate.pair&&item.visit===candidate.visit);
    if(!baseline)continue;
    const before=baseline.summary.shaderSources,after=candidate.summary.shaderSources;
    const compareSets=(a,b)=>({missing:a.filter(value=>!b.includes(value)),extra:b.filter(value=>!a.includes(value))});
    const byType=Object.fromEntries([...new Set([...Object.keys(before.byType),...Object.keys(after.byType)])].sort().map(type=>[type,{
      baselineCount:before.byType[type]?.count||0,candidateCount:after.byType[type]?.count||0,
      ...compareSets(before.byType[type]?.uniqueSHA256||[],after.byType[type]?.uniqueSHA256||[])}]));
    const programs=compareSets(before.uniqueProgramSHA256,after.uniqueProgramSHA256);
    const livePrograms=compareSets(baseline.summary.liveShaderSources.uniqueProgramSHA256,candidate.summary.liveShaderSources.uniqueProgramSHA256);
    output.push({pair:candidate.pair,visit:candidate.visit,identicalUniqueSources:Object.values(byType).every(item=>!item.missing.length&&!item.extra.length),
      identicalDistinctPrograms:!programs.missing.length&&!programs.extra.length,identicalLiveDistinctPrograms:!livePrograms.missing.length&&!livePrograms.extra.length,
      baselineProgramCount:before.programCount,candidateProgramCount:after.programCount,baselineDistinctProgramCount:before.distinctProgramCount,candidateDistinctProgramCount:after.distinctProgramCount,byType,programs,livePrograms});
  }
  return output;
}
function finalQualityParity(samples) {
  const select=sample=>{
    const frame=sample.hero.frames.find(value=>value.id===sample.hero.ready.frameID);
    return {width:frame.width,height:frame.height,pixelRatio:frame.pixelRatio,outputEncoding:frame.outputEncoding,target:frame.target,
      actualModels:frame.actualModels,mainTriangles:frame.draws.main.triangles,shadowTriangles:frame.draws.shadow.triangles,
      shadow:frame.completion.shadow,checkShaderErrors:frame.checkShaderErrors};
  };
  return samples.filter(sample=>sample.valid&&sample.mode==='staged-real-draw').flatMap(candidate=>{
    const baseline=samples.find(sample=>sample.valid&&sample.mode==='baseline'&&sample.pair===candidate.pair&&sample.visit===candidate.visit);
    if(!baseline)return [];
    const before=select(baseline),after=select(candidate);
    return [{pair:candidate.pair,visit:candidate.visit,identical:JSON.stringify(before)===JSON.stringify(after),baseline:before,candidate:after}];
  });
}
function acceptance(report) {
  if(report.samples.length!==12||report.samples.some(sample=>!sample.valid))return {eligible:false,reason:'Incomplete or invalid matched evidence'};
  const delta=(visit,key)=>report.comparison[visit][key].pairedCandidateMinusBaseline;
  const checks={exactFinalDrawing:report.finalQualityParity?.length===6&&report.finalQualityParity.every(value=>value.identical),exactShaders:report.shaderSourceParity.length===6&&report.shaderSourceParity.every(value=>value.identicalUniqueSources&&value.identicalDistinctPrograms&&value.identicalLiveDistinctPrograms),
    presentation:report.untimedSmoke?.valid===true,
    firstCADNotLaterInAnyPair:['cold','repeat'].every(visit=>delta(visit,'firstGPUCompletedMs').max<=0),
    allCADNotLaterMedian:['cold','repeat'].every(visit=>delta(visit,'allModelsGPUCompletedMs').median<=0),
    shorterPeakLongTask:['cold','repeat'].every(visit=>delta(visit,'longTasks.maxMs').median<0),
    lowerBlockingTime:['cold','repeat'].every(visit=>delta(visit,'longTasks.totalBlockingMs').median<0),
    noInputP95Regression:['cold','repeat'].every(visit=>delta(visit,'trustedInputDelayMs.p95').median<=0),
    noCombinedCPUAndFenceRegression:['cold','repeat'].every(visit=>delta(visit,'transactionCPUAndFenceWallMs.total').median<=0)};
  return {eligible:Object.values(checks).every(Boolean),checks,decision:'Diagnostic only. Never retain on shorter submission time alone. Three pairs establish a bounded same-runner signal, not production-device certainty.'};
}
async function runtimeTests(root) {
  const T=require(path.join(root,'assets/vendor/three.min.js'));
  async function runCase(kind) {
    const disposed=[],events=[],model=(visible=true)=>({group:Object.assign(new T.Group(),{visible})});
    let id=0;const ids=new WeakMap(),metrics={warms:[],modelID(value){if(!ids.has(value))ids.set(value,++id);return ids.get(value);}};
    class Target extends T.WebGLRenderTarget {constructor(...args){super(...args);this.addEventListener('dispose',()=>{disposed.push(this);events.push('dispose');});}}
    const models=[model(),model(false),null],shadows=[Object.assign(new T.Group(),{visible:true}),Object.assign(new T.Group(),{visible:false}),null];
    const keyLight=new T.DirectionalLight(),full=new Target(2048,2048),fullPass=new Target(2048,2048);
    keyLight.shadow.map=full;keyLight.shadow.mapPass=fullPass;keyLight.shadow.mapSize.set(2048,2048);
    keyLight.position.set(7,8,9);keyLight.target.position.set(1,2,3);
    const originalCamera=keyLight.shadow.camera.toJSON(),originalMatrix=keyLight.shadow.matrix.toArray(),originalFrustum=keyLight.shadow.getFrustum().clone();
    let liveValid=true,target=null,viewport=new T.Vector4(0,0,1440,1000),scissor=viewport.clone(),scissorTest=false,pending=false,draws=0;
    const renderer={domElement:{width:1440,height:1000},outputEncoding:T.sRGBEncoding,shadowMap:{needsUpdate:false},
      getRenderTarget:()=>target,setRenderTarget(value){target=value;},getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
      getViewport:value=>value.copy(viewport),setViewport:value=>{viewport.copy(value);},getScissor:value=>value.copy(scissor),setScissor:value=>{scissor.copy(value);},getScissorTest:()=>scissorTest,setScissorTest:value=>{scissorTest=value;},
      render(){draws++;events.push('draw');assert.equal(target.width,64);assert.equal(target.texture.encoding,renderer.outputEncoding);
        assert.equal(models.filter(value=>value?.group.visible).length,1);assert.equal(shadows.filter(value=>value?.visible).length,1);
        keyLight.shadow.map=new Target(64,64);keyLight.shadow.mapPass=null;
        if(kind==='throw')throw Error('injected renderer failure');}}
    const abort=new AbortController(),context={renderer,keyLight,models,shadows,drawnModels:models.slice(),scene:{},camera:{},root:{dataset:{}},projects:[{name:'a'},{name:'hidden'},{name:'arrival'}],paintedModels:[null,null,null],signal:abort.signal,valid:()=>liveValid,
      fitShadows(){keyLight.position.set(20,20,20);keyLight.target.position.set(0,0,0);keyLight.shadow.camera.left=-20;keyLight.shadow.matrix.identity();renderer.shadowMap.needsUpdate=true;},markPending:()=>{pending=true;}};
    if(kind==='two'){models[1].group.visible=true;shadows[1].visible=true;}
    const window={THREE:{...T,WebGLRenderTarget:Target},V2GPUPreparation:{async wait(value,options){assert.equal(value,renderer);assert.equal(options.signal,abort.signal);assert.equal(options.pollMs,4);events.push('fence');
      if(kind==='arrival'){models[2]=model();shadows[2]=Object.assign(new T.Group(),{visible:true});}
      if(kind==='cancel'){abort.abort();return {state:'canceled'};}if(kind==='invalidate'){liveValid=false;assert.equal(options.valid(),false);return {state:'canceled'};}return {state:'complete'};}}};
    const sandbox={window,performance,console};vm.createContext(sandbox);
    const factory=vm.runInContext('('+stagedRuntime.toString()+')',sandbox),stager=factory(metrics);
    if(kind==='throw')await assert.rejects(stager.prepare(context),/injected renderer failure/);
    else assert.equal(await stager.prepare(context),!['cancel','invalidate'].includes(kind));
    assert.equal(target,null);assert.equal(keyLight.shadow.map,full);assert.equal(keyLight.shadow.mapPass,fullPass);
    assert.deepEqual(keyLight.shadow.mapSize.toArray(),[2048,2048]);assert.deepEqual(keyLight.position.toArray(),[7,8,9]);assert.deepEqual(keyLight.target.position.toArray(),[1,2,3]);
    assert.deepEqual(keyLight.shadow.camera.toJSON(),originalCamera);assert.deepEqual(keyLight.shadow.matrix.toArray(),originalMatrix);assert.deepEqual(keyLight.shadow.getFrustum(),originalFrustum);
    assert.deepEqual(viewport.toArray(),[0,0,1440,1000]);assert.equal(renderer.shadowMap.needsUpdate,false);assert.equal(models[0].group.visible,true);assert.equal(models[1].group.visible,kind==='two');assert.equal(pending,true);
    assert.equal(disposed.includes(full),false);assert.equal(disposed.includes(fullPass),false);
    if(['cancel','invalidate','throw'].includes(kind)){assert.equal(disposed.length,0,'No disposal before completed own-context drain');assert.equal(stager.pendingDisposals(),1);events.push('existing-drain-complete');stager.drained();assert.equal(stager.pendingDisposals(),0);assert.equal(disposed.length,2);}
    else {assert.equal(stager.pendingDisposals(),0);assert.equal(metrics.warms.length,kind==='two'?2:1);assert.ok(events.indexOf('dispose')>events.indexOf('fence'));}
    if(kind==='cancel'||kind==='invalidate') {
      liveValid=true;context.signal=new AbortController().signal;window.V2GPUPreparation.wait=async()=>({state:'complete'});
      assert.equal(await stager.prepare(context),true);assert.equal(draws,2,'Canceled/ineligible warm does not mark the model prepared');
    }
    if(kind==='arrival') {
      assert.equal(models[2].group.visible,true);assert.equal(shadows[2].visible,true);assert.equal(metrics.warms.length,1,'Arrival is not warmed during the prior snapshot');
      const restore=stager.maskArrivals(context);assert.equal(models[2].group.visible,false);assert.equal(shadows[2].visible,false);restore();assert.equal(models[2].group.visible,true);
    }
    if(kind==='success') {
      await stager.prepare(context);assert.equal(draws,1,'Same actual object warmed once');
      models[0]=model();context.drawnModels=models.slice();await stager.prepare(context);assert.equal(draws,2,'Replacement object receives its own preparation');
      assert.equal(new Set(metrics.warms.map(value=>value.modelID)).size,2);assert.equal(metrics.warms.some(value=>value.name==='hidden'),false);
    }
    return kind;
  }
  for(const kind of ['success','two','arrival','cancel','invalidate','throw'])await runCase(kind);
}
async function instrumentationTest(root) {
  let time=0;
  const sandbox={window:{__v2LoadProbe:{gpu:[]}},performance:{now:()=>++time},innerWidth:1440,innerHeight:1000,
    document:{hidden:false,querySelector:()=>({getBoundingClientRect:()=>({bottom:76})})},getComputedStyle:()=>({visibility:'visible',display:'block'})};
  vm.createContext(sandbox);vm.runInContext(`(${heroProbe.toString()})(${stagedRuntime.toString()});`,sandbox);
  const probe=sandbox.window.__heroStaged;
  const gl={TRIANGLES:4,getContextAttributes:()=>({antialias:true,preserveDrawingBuffer:false}),createShader:()=>({}),createProgram:()=>({}),shaderSource(){},attachShader(){},compileShader(){},linkProgram(){},useProgram(){},getProgramParameter:()=>true,getShaderParameter:()=>true,getUniformLocation:()=>({}),getActiveUniform:()=>({name:'colour',size:1,type:1}),getActiveAttrib:()=>({name:'position',size:1,type:1}),getAttribLocation:()=>0,bindBuffer(){},bufferData(){},texImage2D(){},drawElements(){},drawArrays(){}};
  let target=null;
  const renderer={getContext:()=>gl,getRenderTarget:()=>target,capabilities:{isWebGL2:true},debug:{checkShaderErrors:true},outputEncoding:3001,
    domElement:{width:1440,height:1000,getBoundingClientRect:()=>({left:0,top:0,right:1440,bottom:1000})},getPixelRatio:()=>1,info:{render:{calls:1},programs:[{}]},
    shadowMap:{enabled:true,type:2,autoUpdate:false,render(){gl.drawElements(4,12,0,0);}},compile(){throw Error('No compile allowed');},
    render(){for(const source of ['main shader','distinct shadow shader']){const shader=gl.createShader(35633),program=gl.createProgram();gl.shaderSource(shader,source);gl.attachShader(program,shader);gl.compileShader(shader);gl.linkProgram(program);gl.getProgramParameter(program,0x8B82);gl.useProgram(program);}gl.getUniformLocation({},'colour');renderer.shadowMap.render();gl.bufferData(0,new Uint8Array(24),0);gl.texImage2D(0,0,0,4,4,0,0,0,null);gl.drawArrays(4,0,6);}};
  probe.attach(renderer);const models=[{group:{visible:true}},null,null],context={renderer,drawnModels:models,models,projects:[{name:'a'},{name:'b'},{name:'c'}]};
  probe.beforeDraw(context,false);probe.liveContext(context);renderer.render();
  const evidence={renderer,root:{dataset:{assemblyModelsReady:'3',assemblyLastSubmission:'{}'}},keyLight:{shadow:{mapSize:{toArray:()=>[2048,2048]},map:{width:2048,height:2048}}},drawnModels:3,installedModels:3,drawnWidth:1440,drawnHeight:1000,drawnRatio:1,drawnRevision:1,currentRevision:1};
  probe.completed(evidence);assert.equal(probe.ready,undefined);
  sandbox.window.__v2LoadProbe.gpu.push({owner:'hero',stage:'frame',startMs:++time,endMs:++time,result:{state:'complete'}});
  probe.completed({...evidence,drawnModels:2});assert.equal(probe.ready,undefined);
  probe.completed({...evidence,currentRevision:2});assert.equal(probe.ready,undefined);
  probe.completed(evidence);assert.ok(probe.ready);assert.equal(probe.frames[0].kind,'live');assert.equal(probe.frames[0].programs.length,2);
  const serialized=JSON.parse(JSON.stringify(probe)),signatures=sourceSignatures(serialized);
  assert.equal(signatures.distinctProgramCount,2,'Different sources remain distinct despite identical shader stage/count');
  const count=probe.calls.length;renderer.render();assert.equal(probe.calls.length,count);
  // A warm-only scene and completed warm fence can never create live readiness.
  const fresh={...sandbox,window:{__v2LoadProbe:{gpu:[{owner:'hero',stage:'staged-real-draw',startMs:1,endMs:2,result:{state:'complete'}}]}}};
  vm.createContext(fresh);vm.runInContext(`(${heroProbe.toString()})(${stagedRuntime.toString()});`,fresh);
  const warmProbe=fresh.window.__heroStaged;warmProbe.attach(renderer);warmProbe.activeWarm={id:1};target={width:64,height:64,texture:{encoding:3001}};renderer.render();warmProbe.completed(evidence);assert.equal(warmProbe.ready,undefined);
}
async function sourceTests(root) {
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),revision,'Exact immutable baseline commit');
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'diff','--name-only','HEAD','--','assets','v2'],{cwd:root,encoding:'utf8'}).trim(),'','Source-only checks require unmodified production bytes');
  const original=fs.readFileSync(path.join(root,'assets/v2-assembly.js'),'utf8'),sources=Object.fromEntries(modes.map(mode=>[mode,assemblySource(original,mode)]));
  for(const [mode,source]of Object.entries(sources))new vm.Script(source,{filename:mode+'.js'});
  new vm.Script(`(${shared.browserProbe.toString()})();(${heroProbe.toString()})(${stagedRuntime.toString()});`);
  assert.equal(sources['staged-real-draw'].replace('beforeDraw(__stagedContext,true)','beforeDraw(__stagedContext,false)').replace('if(true && !await','if(false && !await'),sources.baseline,'Only fixture staging switches differ');
  for(const source of Object.values(sources)) {
    assert.ok(source.includes('      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));\n      const supporting='),'Preserve installation yield');
    assert.equal(source.includes('renderer.debug.checkShaderErrors=false'),false);assert.equal(source.includes('renderer.compile('),false);
    assert.ok(source.includes('target!==__stagedTarget || width!==drawnWidth || height!==drawnHeight || desiredRatio!==drawnRatio'),'Stale pose/layout cannot publish after the new await');
    assert.ok(source.includes('const abort=new AbortController(); gpuAbort=abort; gpuBusy=true;'));
    assert.ok(source.includes('valid:()=>drawable() && target===__stagedTarget && width===drawnWidth && height===drawnHeight && desiredRatio===drawnRatio'),'Native warm fence validity excludes stale layout/progress, not model-install revisions');
  }
  assert.throws(()=>assemblySource(original+'\n','baseline'),/exact live/);
  const fixture=prepare(root,'baseline'),html=shared.responseFor(fixture,'/v2/',{'accept-encoding':'gzip'});
  assert.equal(html.status,200);assert.equal(html.headers['Cache-Control'],'max-age=600');assert.equal(html.headers.Vary,'Accept-Encoding');assert.equal(html.headers['Content-Encoding'],'gzip');
  assert.equal(shared.responseFor(fixture,'/v2/',{'accept-encoding':'gzip','if-none-match':html.headers.ETag}).status,304);
  assert.equal(shared.responseFor(fixture,'/../outside').status,403);
  const pack=execFileSync('find',[path.join(root,'assets'),'-name','*.bin.gz'],{encoding:'utf8'}).trim().split('\n')[0];
  const body=shared.responseFor(fixture,'/'+path.relative(root,pack).split(path.sep).join('/'),{'accept-encoding':'gzip'});
  assert.equal(body.headers['Content-Type'],'application/gzip');assert.equal(body.headers['Content-Encoding'],undefined);
  await runtimeTests(root);await instrumentationTest(root);
  console.log('PASS source-only: exact 649bc baseline; only staging fixture switches; preserved installation/debug/runtime sources; real-model-only warm, late-arrival masks, native-fence resource retirement, full shadow/visibility/target restoration after success/throw/cancel, object identity, hidden-model exclusion, distinct shader variants and rejection of warm/partial/stale readiness. No browser/GPU result claimed.');
}
// Decode only Chromium's non-interlaced 8-bit RGB/RGBA screenshots. Comparing
// pixels instead of compressed PNG bytes avoids metadata/compression variance.
function decodeScreenshotPNG(buffer) {
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let width,height,bpp;const chunks=[];
  for(let offset=8;offset<buffer.length;) {
    const size=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8),data=buffer.subarray(offset+8,offset+8+size);offset+=size+12;
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);bpp=data[9]===6?4:data[9]===2?3:0;assert.ok(bpp);assert.equal(data[12],0);}
    if(type==='IDAT')chunks.push(data);
  }
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*bpp,pixels=Buffer.alloc(height*stride);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];assert.ok(filter<=4);
    for(let x=0;x<stride;x++) {
      const left=x>=bpp?pixels[y*stride+x-bpp]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=bpp?pixels[(y-1)*stride+x-bpp]:0;
      pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;
    }
  }
  return {width,height,bpp,pixels};
}
function compareScreenshots(before,after) {
  const a=decodeScreenshotPNG(before),b=decodeScreenshotPNG(after);assert.equal(a.width,b.width);assert.equal(a.height,b.height);assert.equal(a.bpp,b.bpp);
  let changed=0,absoluteError=0;const colours=new Set();
  for(let offset=0;offset<a.pixels.length;offset+=a.bpp) {
    colours.add(a.pixels.subarray(offset,offset+3).toString('hex'));
    const difference=Math.max(...[0,1,2].map(channel=>Math.abs(a.pixels[offset+channel]-b.pixels[offset+channel])));
    if(difference)changed++;absoluteError+=difference;
  }
  return {width:a.width,height:a.height,pixels:a.width*a.height,changedPixels:changed,changedFraction:changed/(a.width*a.height),meanMaxChannelDifference:absoluteError/(a.width*a.height),beforeDistinctColours:colours.size,identical:changed===0};
}
async function untimedSmoke(browser,base,out,timeout) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'}),page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
  const result={valid:false,untimed:true,measuredVisit:false,purpose:'Native compositor screenshot of already-fenced CAD while a later offscreen preparation is held, followed by native viewport/reduced-motion cancellation and recovery.'};
  page.on('pageerror',error=>errors.push(error.message));
  await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',network);
  await page.addInitScript({content:`(${shared.browserProbe.toString()})();(${heroProbe.toString()})(${stagedRuntime.toString()});window.__heroStagedControl={phase:'armed',finished:false};`});
  try {
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded',timeout});
    await page.waitForFunction(()=>window.__heroStagedControl?.phase==='before',null,{timeout});
    // This isolated oracle starts after the real 250ms CAD/poster fade and
    // the loader's 560ms ready-board overlay. Keep all animations enabled and
    // leave every measured visit intact.
    await page.waitForFunction(()=>{
      const root=document.querySelector('[data-assembly]'),canvas=root?.querySelector('[data-assembly-canvas]');
      const index=['tramtrace','telemetry','pi'].indexOf(window.__heroStagedControl?.paintedName);
      const poster=root?.querySelectorAll('[data-assembly-posters] img')[index];
      const firstModelMs=Number(root?.dataset.assemblyFirstModelMs);
      return Boolean(canvas&&poster&&firstModelMs>0&&performance.now()-firstModelMs>=560&&
        Number(getComputedStyle(canvas).opacity)===1&&Number(getComputedStyle(poster).opacity)===0);
    },null,{timeout});
    const before=await page.evaluate(()=>{const h=window.__heroStaged,c=window.__heroStagedControl;return {clip:c.clip,paintedName:c.paintedName,entryID:c.entryID,lastLiveFrameID:h.frames.filter(frame=>frame.kind==='live').at(-1)?.id,firstLive:h.firstLive,contextAttributes:h.capabilities.contextAttributes,readyModels:document.querySelector('[data-assembly]').dataset.assemblyModelsReady};});
    assert.ok(before.firstLive&&Number(before.readyModels)>0,'Hold only after CAD has completed a real live fence');
    assert.equal(before.contextAttributes.preserveDrawingBuffer,false);
    const clip=before.clip;assert.ok(clip.width>20&&clip.height>20&&clip.x+clip.width<=viewport.width&&clip.y+clip.height<=viewport.height,'Visible already-painted CAD crop');
    const beforeFile=path.join(path.dirname(out),'untimed-before-support-warm.png'),heldFile=path.join(path.dirname(out),'untimed-held-support-warm.png');
    const beforePNG=await page.screenshot({path:beforeFile,clip});
    await page.evaluate(()=>window.__heroStagedControl.release());
    await page.waitForFunction(()=>window.__heroStagedControl?.phase==='held',null,{timeout});
    // Several compositor opportunities with the preparation still held. Never
    // redraw the default framebuffer just to make the screenshot check pass.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,100)))));
    const heldPNG=await page.screenshot({path:heldFile,clip});
    const held=await page.evaluate(()=>{const h=window.__heroStaged,c=window.__heroStagedControl;return {entry:JSON.parse(JSON.stringify(h.warms.find(value=>value.id===c.entryID))),lastLiveFrameID:h.frames.filter(frame=>frame.kind==='live').at(-1)?.id,readyModels:document.querySelector('[data-assembly]').dataset.assemblyModelsReady};});
    result.presentation={before,held,pixels:compareScreenshots(beforePNG,heldPNG),screenshots:[path.basename(beforeFile),path.basename(heldFile)]};
    assert.equal(held.lastLiveFrameID,before.lastLiveFrameID,'No live repaint during held offscreen draw');
    assert.equal(held.readyModels,before.readyModels,'Warm cannot hand off a model poster');assert.equal(held.entry.fence.state,'complete');
    assert.ok(result.presentation.pixels.beforeDistinctColours>32,'Already-painted crop contains detailed pixels');
    assert.ok(result.presentation.pixels.identical,'Already-painted CAD must remain pixel-identical through held offscreen preparation');
    // Change actual browser viewport and motion preference while gpuBusy. The
    // production reduced-motion listener aborts this transaction; no synthetic
    // production events, fake native fence completion, or readiness assignment.
    await page.setViewportSize({width:1380,height:960});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>{const h=window.__heroStaged,c=window.__heroStagedControl;return Boolean(h.warms.find(value=>value.id===c.entryID)?.restored);},null,{timeout});
    const canceled=await page.evaluate(()=>{const h=window.__heroStaged,c=window.__heroStagedControl;return {warm:JSON.parse(JSON.stringify(h.warms.find(value=>value.id===c.entryID))),lastLiveFrameID:h.frames.filter(frame=>frame.kind==='live').at(-1)?.id,pendingDisposals:h.stager.pendingDisposals(),dataset:{...document.querySelector('[data-assembly]').dataset}};});
    assert.equal(canceled.lastLiveFrameID,before.lastLiveFrameID,'Canceled/stale preparation cannot submit a live frame');
    assert.equal(canceled.warm.canceled,true,'Native motion/layout change invalidated the held transaction');
    assert.equal(canceled.warm.restored.targetIsOriginal,true);assert.equal(canceled.warm.restored.mapIsOriginal,true);assert.deepEqual(canceled.warm.restored.configured,[2048,2048]);
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>Boolean(window.__heroStaged?.ready),null,{timeout});
    const recovered=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__heroStaged)));
    assert.equal(recovered.ready.completion.fence.result.state,'complete');assert.equal(recovered.pendingDisposals,0);
    assert.deepEqual(recovered.ready.completion.shadow.actual,{width:2048,height:2048});
    assert.equal(recovered.warms.filter(warm=>warm.modelID===held.entry.modelID).length,1,'A legitimately fenced warm is retained after transaction cancellation');
    assert.deepEqual(errors,[]);result.cancellation={canceled,recoveredReady:recovered.ready,warms:recovered.warms};result.valid=true;
  } catch(error) {result.failure=String(error);}
  finally {result.errors=errors;await context.close();}
  return result;
}
async function main() {
  const root=path.resolve(process.env.V2_HERO_STAGED_ROOT||repo);
  if(process.argv.includes('--source-only'))return sourceTests(root);
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),revision,'Use exact immutable 649bc worktree');
  assert.equal(execFileSync('git',['-c','safe.directory='+root,'diff','--name-only','HEAD','--','assets','v2'],{cwd:root,encoding:'utf8'}).trim(),'','Production source must be clean');
  const pairs=3,timeout=120000,fixtures=Object.fromEntries(modes.map(mode=>[mode,prepare(root,mode)]));
  const out=path.resolve(process.env.V2_HERO_STAGED_OUT||'/tmp/v2-hero-staged-preparation/profile.json');
  const browserArgs=['--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  const report={capturedAt:new Date().toISOString(),valid:false,revision,root,network,viewport,deviceScaleFactor:1,pairs,measuredVisits:12,untimedSmokeVisits:1,modes,browserArgs,
    fixtureSources:Object.fromEntries(modes.map(mode=>[mode,fixtures[mode].traces])),
    contract:{completion:'Only the existing full-size default-canvas own-context frame fence can establish first/all CAD readiness. Every warm has its own nonblocking own-context fence; a warm is never a live milestone.',
      cache:'Fresh context per pair/mode. Cold page closes, then NEW page in same context establishes real HTTP cache evidence. No disabled cache or route interception.',
      instrumentation:'Identical hero renderer/GL instrumentation. Staged mode adds a real 64px render target draw per new visible model object. Real materials, textures, lights and matched output encoding. Original completed 2048 shadow target is retained during temporary 64px map use and restored before full-scene fit/draw. Debug checks and download/install/animation ordering remain unchanged.',
      shaderParity:'Exact shader strings retained by reference; Node SHA256 compares every shader stage and complete linked-program source signature, including live-only program sets, distinct variants and duplicate counts.',
      acceptance:'Only consider retaining if real peak task/blocking time improves, first CAD never arrives later in a paired visit, total CPU+fence is not worse, native input p95 does not regress, final sizes/shaders are exact and separate held presentation/cancellation smoke passes.',
      caveats:['One Chromium SwiftShader runner; GPU-driver/OS caches are not cleared. Two modes rotate order by pair.',
        'GL/render/shadow spans measure calling-thread wall time, potentially including driver waits, not GPU duration. Nested spans must not be added. Transaction spans include all warm CPU+fences plus final live CPU+fence; downloads and installation can overlap them.',
        'Native fence spans include polling/scheduling latency. A fence alone cannot prove compositor presentation; the separate untimed native screenshot tests retained partial-CAD presentation.',
        'Trusted F8 queue delay is not standardized INP. Full long-task durations are retained for tasks starting before readiness.',
        'Constructor/context setup precedes GL wrappers. Wrappers add equal overhead to both fixtures. Successful overview timing is not a complete production lifecycle proof.',
        'A canceled incomplete warm defers target disposal until the existing drain. Terminal failure that permanently prevents that drain is reported as a prototype limitation, not production-ready cleanup.',
        'The untimed smoke deliberately holds a supporting preparation after first fenced CAD, captures screenshots, then changes viewport/motion preference and recovers. It is excluded from every performance comparison.']},samples:[]};
  const save=()=>{report.comparison=compare(report.samples);report.shaderSourceParity=shaderParity(report.samples);report.finalQualityParity=finalQualityParity(report.samples);report.acceptance=acceptance(report);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
  let active=fixtures.baseline,browser;
  const server=http.createServer((request,response)=>{const result=shared.responseFor(active,new URL(request.url,'http://localhost').pathname,request.headers);response.writeHead(result.status,result.headers);response.end(request.method==='HEAD'?undefined:result.body);});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base='http://127.0.0.1:'+server.address().port;report.baseURL=base;
    const {chromium}=require('playwright');browser=await chromium.launch({headless:true,args:browserArgs});report.browserVersion=browser.version();save();
    for(let pair=1;pair<=pairs;pair++) {
      const offset=(pair-1)%modes.length,order=modes.slice(offset).concat(modes.slice(0,offset));
      for(const mode of order) {
        active=fixtures[mode];const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
        try {for(const visit of ['cold','repeat']) {
          const sample=await measure(context,base,{pair,mode,visit},timeout);report.samples.push(sample);save();
          console.log(JSON.stringify({pair,mode,visit,valid:sample.valid,summary:sample.summary,failure:sample.failure}));
          assert.ok(sample.valid,`${pair}/${mode}/${visit}: ${sample.failure}`);
        }}finally{await context.close();}
      }
    }
    save();assert.equal(report.shaderSourceParity.length,6,'Six matched cold/cached shader comparisons');
    assert.ok(report.shaderSourceParity.every(item=>item.identicalUniqueSources&&item.identicalDistinctPrograms&&item.identicalLiveDistinctPrograms),'Exact shader and linked-program source parity, including final live variants');
    assert.ok(report.finalQualityParity.every(item=>item.identical),'Final drawing-buffer/shadow/model/triangle quality parity');
    active=fixtures['staged-real-draw'];report.untimedSmoke=await untimedSmoke(browser,base,out,timeout);save();
    assert.ok(report.untimedSmoke.valid,'Separate untimed presentation/cancellation check: '+report.untimedSmoke.failure);
    report.valid=true;save();console.log('Completed 12 measured visits plus separate untimed staged-preparation smoke: '+out);console.log(JSON.stringify(report.acceptance));
  }catch(error){report.failure=String(error);save();throw error;}
  finally{if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={assemblySource,stagedRuntime,heroProbe,prepare,assertSample,summarize,compare,shaderParity,sourceSignatures,finalQualityParity,decodeScreenshotPNG,compareScreenshots};

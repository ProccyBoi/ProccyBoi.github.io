/* Capture-only first-use attribution for the ACTUAL production Selected scene.
 * No application files are modified. Each case gets a fresh browser context.
 * Serve the repository root, then run:
 *   V2_BASE_URL=http://127.0.0.1:8080 node scripts/profile-v2-selected-stall.cjs
 *   node scripts/profile-v2-selected-stall.cjs --source-only
 * Optional: --cases=baseline,precompile,no-shadows; --headed; --no-screenshots.
 * V2_STALL_OUT, V2_STALL_TIMEOUT, V2_STALL_DPR, V2_STALL_WIDTH/HEIGHT,
 * V2_STALL_RUNS, CHROMIUM_EXECUTABLE and V2_STALL_BROWSER_ARGS (JSON array).
 * Default Chromium uses SwiftShader for reproducible CI, not a device benchmark.
 * For a hardware-backed run explicitly set V2_STALL_BROWSER_ARGS='[]'.
 * gl.finish/fences, forced preparation and all ablations are DIAGNOSTIC ONLY.
 * These timings must never be reported as uninstrumented production long tasks.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sourcePath = 'assets/v2-selected-work.js';
const source = fs.readFileSync(path.join(process.env.V2_STALL_SOURCE_ROOT || root, sourcePath), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const base = (process.env.V2_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '').replace(/\/v2$/, '');
const output = path.resolve(process.env.V2_STALL_OUT || '.codex-temp/v2-selected-stall');
const timeout = Number(process.env.V2_STALL_TIMEOUT || 180000);
const definitions = {
  baseline: 'Unchanged rendering and material settings; drain and measure each first warm draw.',
  precompile: 'Identical baseline, with separately fenced renderer.compile before each first warm draw.',
  'no-shadows': 'Disable only renderer.shadowMap.enabled before any Selected draw.',
  'no-environment': 'Remove scene.environment and explicit material.envMap; keep lights and all other fields.',
  'no-physical': 'Remove only the PHYSICAL shader define; retain material objects, maps and numeric fields.',
  'no-transmission': 'Remove only the r128 TRANSMISSION shader define; retain physical clearcoat and other fields.',
  'metro-tiny': 'Only Metro visible, first Transit pose at a 64px long-side buffer, then completed full-scene warm/live draws.',
  'tramtrace-tiny': 'Only Tramtrace visible, first Transit pose at a 64px long-side buffer, then completed full-scene warm/live draws.',
};
const requested = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8).split(',') || Object.keys(definitions);
for (const name of requested) assert.ok(definitions[name], 'Unknown case: ' + name);

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'Production source anchor must occur exactly once: ' + before);
  return text.replace(before, after);
}
function instrumentSource(text) {
  // Install only after the production loaders, static batching, materials,
  // environment, lights, floor and composition have been constructed.
  text = replaceOnce(text, "ready=true;root.dataset.selectedState='prepared';layout();request();",
    `window.__selectedStall.install({renderer,scene,camera,assemblies,composition,canvas,
      prepare(value,warm){const ratio=pixelRatio(warm);const pose=composition.frame(camera,value,width,height);fitLight(pose);return {ratio,pose,width,height};},
      draw:(value,warm)=>draw(value,warm)});
      ready=true;root.dataset.selectedState='prepared';layout();request();`);
  text = replaceOnce(text, 'for(const pose of [0,1])', 'for(const pose of window.__selectedStall.warmPoses)');
  text = replaceOnce(text, 'draw(pose,true);root.dataset.selectedWarmFrames=',
    "await window.__selectedStall.capture({progress:pose,warm:true,label:'first-warm-'+(pose?'transit':'framework')},()=>draw(pose,true));root.dataset.selectedWarmFrames=");
  // After the two production warm poses, explicit replay owns rendering so
  // screenshot scrolling cannot add an unlabelled draw to the experiment.
  text = replaceOnce(text, 'if (!frame && ready && track', 'if (!window.__selectedStall.replay && !frame && ready && track');
  return text;
}

function browserProbe(config) {
  const now = () => performance.now();
  const rounded = value => Math.round(value * 1000) / 1000;
  const records = [], unscoped = [], slowCalls = [], shaderBuilds = [];
  const state = window.__selectedStall = {captureOnly:true, records, unscoped, slowCalls, shaderBuilds,
    warmPoses:config.name.endsWith('-tiny') ? [1] : [0,1], replay:false};
  let api, gl, active, phase = 'outside', programNumber = 0, shaderNumber = 0;
  const programIds = new WeakMap(), shaderIds = new WeakMap(), shaderTypes = new WeakMap();
  const programId = value => {
    if (!value || typeof value !== 'object') return null;
    if (!programIds.has(value)) programIds.set(value, ++programNumber);
    return programIds.get(value);
  };
  const shaderId = value => {
    if (!value || typeof value !== 'object') return null;
    if (!shaderIds.has(value)) shaderIds.set(value, ++shaderNumber);
    return shaderIds.get(value);
  };
  const hashText = text => {let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);};
  const materials = () => {
    const result = new Set(); api.scene.traverse(node => {for(const material of [].concat(node.material || []))result.add(material);});
    return [...result];
  };
  const materialFacts = material => ({id:material.id,name:material.name,type:material.type,
    physical:Boolean(material.isMeshPhysicalMaterial),defines:{...material.defines},
    clearcoat:material.clearcoat,transmission:material.transmission,reflectivity:material.reflectivity,
    roughness:material.roughness,metalness:material.metalness,opacity:material.opacity,
    transparent:material.transparent,side:material.side,depthWrite:material.depthWrite,
    color:material.color?.getHexString(),envMapIntensity:material.envMapIntensity,
    maps:Object.fromEntries(Object.entries(material).filter(([,v])=>v?.isTexture).map(([k,v])=>[k,v.uuid]))});
  const programs = () => ({count:api.renderer.info.programs.length,
    cache:api.renderer.info.programs.map(program=>({id:program.id,glId:programId(program.program),usedTimes:program.usedTimes,cacheKeyHash:hashText(String(program.cacheKey))})),
    materials:materials().map(material=>{const properties=api.renderer.properties.get(material);return {id:material.id,name:material.name,type:material.type,programs:[...(properties.programs?.values()||[])].map(p=>p.id),current:properties.currentProgram?.id};})});
  const geometryFacts = () => {
    const nodes=[]; api.scene.traverse(node=>{if(node.geometry)nodes.push({id:node.id,geometry:node.geometry.uuid,
      indexCount:node.geometry.index?.count||0,attributes:Object.fromEntries(Object.entries(node.geometry.attributes).map(([name,a])=>[name,{count:a.count,itemSize:a.itemSize,version:a.version}]))});});
    return nodes;
  };
  const phaseRun = (label, callback) => {const old=phase;phase=label;try{return callback();}finally{phase=old;}};
  const timed = callback => {const started=now();const value=callback();return {cpuMs:rounded(now()-started),value};};
  const describeCall = (name,args) => {
    if (/Program|UniformLocation|ActiveUniform|ActiveAttrib|AttribLocation|useProgram/.test(name)) return {program:programId(args[0]),argument:typeof args[1]==='string'?args[1]:args[1]};
    if (/Shader/.test(name)) return {shader:shaderId(args[0]),shaderType:shaderTypes.get(args[0]),argument:args[1]};
    if (/^(?:texImage|texSubImage|compressedTexImage)/.test(name)) {
      const pixels=args[args.length-1];return {target:args[0],width:typeof args[3]==='number'&&args.length>=9?args[3]:pixels?.width,
        height:typeof args[4]==='number'&&args.length>=9?args[4]:pixels?.height,source:pixels?.currentSrc||pixels?.src||pixels?.constructor?.name||null,
        bytes:pixels?.byteLength??null};
    }
    if (/^draw/.test(name))return {mode:args[0],count:args[name==='drawArrays'?2:1]};
    return {};
  };
  function wrapGL(name) {
    if(typeof gl[name]!=='function')return;
    const original=gl[name];
    gl[name]=function(...args){
      const started=now();let value;
      try {value=original.apply(this,args);return value;}
      finally {
        const duration=now()-started;
        if(name==='createProgram'&&value)programId(value);
        if(name==='createShader'&&value){shaderId(value);shaderTypes.set(value,args[0]);}
        if(active){
          const label=phase+'/'+name,aggregate=active.gl[label]||={calls:0,cpuMs:0,maxMs:0};
          aggregate.calls++;aggregate.cpuMs+=duration;aggregate.maxMs=Math.max(aggregate.maxMs,duration);
          if(/^(?:texImage|texSubImage|compressedTexImage)/.test(name)&&active.uploads.length<100)
            active.uploads.push({phase,method:name,cpuMs:rounded(duration),...describeCall(name,args)});
          if(duration>=config.slowCallMs){
            const record={draw:active.label,phase,method:name,cpuMs:rounded(duration),...describeCall(name,args)};
            if(slowCalls.length<config.maxSlowCalls){record.stack=(new Error().stack||'').split('\n').slice(2,8);slowCalls.push(record);}
            else if(duration>slowCalls[slowCalls.length-1].cpuMs){record.stack=(new Error().stack||'').split('\n').slice(2,8);slowCalls[slowCalls.length-1]=record;}
            slowCalls.sort((a,b)=>b.cpuMs-a.cpuMs);
          }
        }
      }
    };
  }
  async function fence(label,{finish=false}={}) {
    const started=now(),result={method:typeof gl.fenceSync==='function'?'WebGL2 fenceSync/clientWaitSync':'WebGL1 finish only',finishCpuMs:null,polls:0};
    if(finish)result.finishCpuMs=phaseRun(label+'/finish',()=>timed(()=>gl.finish()).cpuMs);
    const afterFinish=now();
    if(typeof gl.fenceSync==='function'){
      const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw new Error('fenceSync returned null');
      gl.flush();
      try {
        while(true){
          const status=gl.clientWaitSync(sync,0,0);result.polls++;
          if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){result.status=status===gl.ALREADY_SIGNALED?'already-signaled':'condition-satisfied';break;}
          if(status===gl.WAIT_FAILED)throw new Error(label+': clientWaitSync WAIT_FAILED');
          if(now()-started>config.fenceTimeout)throw new Error(label+': GPU completion fence timed out');
          await new Promise(resolve=>setTimeout(resolve,4));
        }
      }finally{gl.deleteSync(sync);}
    }else if(!finish){result.finishCpuMs=phaseRun(label+'/finish',()=>timed(()=>gl.finish()).cpuMs);result.status='finish-returned-no-independent-fence';}
    result.afterFinishFenceWaitMs=rounded(now()-afterFinish);result.totalMs=rounded(now()-started);return result;
  }
  function poseFacts() {
    return {cameraPosition:api.camera.position.toArray(),cameraQuaternion:api.camera.quaternion.toArray(),projection:api.camera.projectionMatrix.toArray(),
      assemblies:Object.fromEntries(Object.entries(api.assemblies).map(([name,assembly])=>[name,{visible:assembly.group.visible,matrixWorld:assembly.group.matrixWorld.toArray()}]))};
  }
  state.install = value => {
    if(api)throw new Error('Selected diagnostic installed twice');api=value;gl=api.renderer.getContext();
    const extension=gl.getExtension('KHR_parallel_shader_compile'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    state.environment={threeRevision:window.THREE.REVISION,webgl2:api.renderer.capabilities.isWebGL2,
      vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
      unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      khrParallelShaderCompile:Boolean(extension),khrCompletionEnum:extension?.COMPLETION_STATUS_KHR??null,
      compileAsync:typeof api.renderer.compileAsync,checkShaderErrors:api.renderer.debug.checkShaderErrors,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},scrollY,contextAttributes:gl.getContextAttributes()};
    if(scrollY!==0)throw new Error('First warm must begin at the untouched no-scroll page top');
    state.geometryBefore=geometryFacts();state.materialsBefore=materials().map(materialFacts);
    state.programsAtInstall=programs();state.shaderAblations=[];
    if(config.name==='no-shadows')api.renderer.shadowMap.enabled=false;
    if(config.name==='no-environment'){api.scene.environment=null;for(const material of materials())if(material.envMap)material.envMap=null;}
    for(const material of materials()){
      if(config.name==='no-physical'&&material.defines&&Object.hasOwn(material.defines,'PHYSICAL')){
        material.defines={...material.defines};delete material.defines.PHYSICAL;material.needsUpdate=true;
        state.shaderAblations.push({id:material.id,name:material.name,removed:'PHYSICAL'});
      }
      const original=material.onBeforeCompile;
      // Preserve the original cache key. Instrumenting onBeforeCompile must
      // not accidentally create/merge baseline programs via its toString().
      const originalKey=material.customProgramCacheKey();
      material.customProgramCacheKey=()=>originalKey+(config.name==='no-transmission'&&material.isMeshPhysicalMaterial?'|diagnostic-no-transmission':'');
      material.onBeforeCompile=function(shader,renderer){
        const start=now();original.call(this,shader,renderer);
        if(config.name==='no-transmission'&&material.isMeshPhysicalMaterial){
          const marker='#define TRANSMISSION';
          if(shader.fragmentShader.split(marker).length!==2)throw new Error('Expected exactly one r128 TRANSMISSION definition');
          shader.fragmentShader=shader.fragmentShader.replace(marker,'// capture-only: TRANSMISSION disabled');
          state.shaderAblations.push({id:material.id,name:material.name,removed:'TRANSMISSION'});
        }
        if(shaderBuilds.length<160)shaderBuilds.push({phase,draw:active?.label??null,materialId:material.id,name:material.name,type:material.type,
          cpuMs:rounded(now()-start),vertexHash:hashText(shader.vertexShader),fragmentHash:hashText(shader.fragmentShader),defines:{...shader.defines}});
      };
    }
    state.materialsAfter=materials().map(materialFacts);
    state.textures=[...new Set([api.scene.environment,...materials().flatMap(material=>Object.values(material).filter(v=>v?.isTexture))].filter(Boolean))]
      .map(texture=>({uuid:texture.uuid,name:texture.name,type:texture.type,format:texture.format,mapping:texture.mapping,encoding:texture.encoding,
        width:texture.image?.width,height:texture.image?.height,source:texture.image?.currentSrc||texture.image?.src||texture.image?.data?.constructor?.name,
        bytes:texture.image?.data?.byteLength,generateMipmaps:texture.generateMipmaps}));
    for(const method of ['createProgram','createShader','compileShader','linkProgram','getProgramInfoLog','getShaderInfoLog','getProgramParameter','getShaderParameter',
      'getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation','useProgram','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced',
      'texImage2D','texSubImage2D','texImage3D','compressedTexImage2D','generateMipmap','bufferData','bufferSubData','finish'])wrapGL(method);
    const originalRender=api.renderer.render,originalShadow=api.renderer.shadowMap.render;
    api.renderer.shadowMap.render=function(...args){
      const before={...api.renderer.info.render};
      const result=phaseRun('shadow',()=>timed(()=>originalShadow.apply(this,args)));
      if(active)active.shadowPasses.push({cpuMs:result.cpuMs,calls:api.renderer.info.render.calls-before.calls,triangles:api.renderer.info.render.triangles-before.triangles});
      return result.value;
    };
    api.renderer.render=function(...args){
      if(active&&config.name.endsWith('-tiny')&&active.label.startsWith('tiny-')){
        // This changes only the render-target resolution and visibility for
        // the expressly labelled isolated first draw, never any geometry.
        const longSide=config.tinyLongSide;api.renderer.setPixelRatio(longSide/Math.max(api.canvas.clientWidth||innerWidth,api.canvas.clientHeight||innerHeight));
      }
      const started=now();const result=phaseRun('main',()=>originalRender.apply(this,args));
      const cpuMs=rounded(now()-started);
      if(active){active.renderCpuMs=cpuMs;active.buffer={width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,pixelRatio:api.renderer.getPixelRatio()};}
      else if(unscoped.length<30)unscoped.push({at:started,cpuMs,programs:api.renderer.info.programs.length,scrollY});
      return result;
    };
    state.snapshot=()=>({environment:state.environment,programs:programs(),geometryUnchanged:JSON.stringify(state.geometryBefore)===JSON.stringify(geometryFacts()),
      scrollY,selected:{...document.querySelector('[data-selected-work]').dataset},pageContexts:[...document.querySelectorAll('canvas')].map(canvas=>({className:canvas.className,width:canvas.width,height:canvas.height})),pose:poseFacts()});
  };
  state.capture = async (spec, callback) => {
    if(active)throw new Error('Overlapping Selected captures');
    const tiny=config.name.endsWith('-tiny')&&records.length===0;
    const originalVisibility=tiny?Object.entries(api.assemblies).map(([name,assembly])=>[name,assembly.group.visible]):[];
    const record={...spec,label:tiny?'tiny-'+config.name:spec.label,startMs:now(),scrollY,gl:{},uploads:[],shadowPasses:[],programsBefore:programs()};
    records.push(record);active=record;
    try{
      record.preDrain=await fence('pre-drain');
      if(tiny){const target=config.name==='metro-tiny'?'metro':'tramtrace';for(const [name,assembly]of Object.entries(api.assemblies))assembly.group.visible=name===target;}
      api.prepare(spec.progress,spec.warm);
      if(config.name==='precompile'&&spec.label.startsWith('first-warm-')){
        const started=now();record.compile=phaseRun('compile',()=>({cpuMs:timed(()=>api.renderer.compile(api.scene,api.camera)).cpuMs}));
        record.compile.completion=await fence('compile-completion',{finish:true});record.compile.totalToFenceMs=rounded(now()-started);record.compile.programsAfter=programs();
      }
      const drawStart=now();record.drawStartMs=drawStart;
      const result=phaseRun('draw',()=>timed(()=>callback?callback():api.draw(spec.progress,spec.warm)));
      record.drawCpuMs=result.cpuMs;record.productionMeasurement=result.value?.measurement||result.value;
      record.drawReturnMs=now();record.programsAfter=programs();record.counters={...api.renderer.info.render};record.pose=poseFacts();
      record.completion=await fence('draw-completion',{finish:true});record.drawStartToFenceMs=rounded(now()-drawStart);
      const frameStarted=now();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      record.postFenceTwoRafMs=rounded(now()-frameStarted);record.drawStartToTwoRafMs=rounded(now()-drawStart);
      record.endMs=now();
      for(const aggregate of Object.values(record.gl)){aggregate.cpuMs=rounded(aggregate.cpuMs);aggregate.maxMs=rounded(aggregate.maxMs);}
      return result.value;
    }catch(error){record.error=String(error);throw error;}
    finally{for(const [name,visible]of originalVisibility)api.assemblies[name].group.visible=visible;active=null;phase='outside';}
  };
}

function sourceChecks() {
  const transformed=instrumentSource(source);new vm.Script(transformed,{filename:sourcePath+' (capture route)'});
  new vm.Script('('+browserProbe.toString()+')');
  const T=require('../assets/vendor/three.min.js');assert.equal(T.REVISION,'128');
  assert.match(T.ShaderLib.physical.fragmentShader,/#ifdef PHYSICAL\s+#define REFLECTIVITY\s+#define CLEARCOAT\s+#define TRANSMISSION/);
  const vendor=fs.readFileSync(path.join(root,'assets/vendor/three.min.js'),'utf8');
  assert.doesNotMatch(vendor,/compileAsync|KHR_parallel_shader_compile|COMPLETION_STATUS_KHR/);
  // Verify the ablation really removes the shader branch, rather than merely
  // setting a uniform to zero while leaving expensive shader code compiled.
  assert.equal(T.ShaderLib.physical.fragmentShader.split('#define TRANSMISSION').length,2);
  const material=new T.MeshPhysicalMaterial({clearcoat:.85,roughness:.22,transmission:0});
  const old=material.onBeforeCompile,key=material.customProgramCacheKey();material.onBeforeCompile=function(shader,renderer){old.call(this,shader,renderer);};material.customProgramCacheKey=()=>key;
  assert.equal(material.customProgramCacheKey(),key,'Wrapper preserves baseline program cache identity');
  const before={...material};material.defines={...material.defines};delete material.defines.PHYSICAL;
  for(const name of ['clearcoat','roughness','transmission','color','normalMap','envMap'])assert.equal(material[name],before[name]);
  return {passed:true,threeRevision:T.REVISION,sourceSha256:hash(source),captureSourceSha256:hash(transformed),
    vendorHasCompileAsync:false,vendorUsesParallelCompileExtension:false,physicalDefinesClearcoatAndTransmission:true,cases:requested};
}

async function runCase(browser,name,iteration) {
  const viewport={width:Number(process.env.V2_STALL_WIDTH||1440),height:Number(process.env.V2_STALL_HEIGHT||900)};
  const context=await browser.newContext({viewport,deviceScaleFactor:Number(process.env.V2_STALL_DPR||2),reducedMotion:'no-preference',serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
  const errors=[],warnings=[],routeErrors=[];let servedSourceHash;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push(message.text());});
  await page.route('**/assets/v2-selected-work.js*',async route=>{
    try{
      const response=await route.fetch();const remote=await response.text();servedSourceHash=hash(remote);
      assert.equal(servedSourceHash,hash(source),'Served production source must equal the inspected worktree source');
      await route.fulfill({response,body:instrumentSource(remote)});
    }catch(error){routeErrors.push(String(error));await route.abort();}
  });
  await page.addInitScript(browserProbe,{name,fenceTimeout:timeout,slowCallMs:5,maxSlowCalls:24,tinyLongSide:64});
  const result={case:name,iteration,description:definitions[name],captureOnly:true,viewport,errors,warnings,routeErrors,screenshots:[]};
  const stem=name+'-'+iteration;
  try{
    await page.goto(base+'/v2/?selectedCapture=1&selectedStall='+encodeURIComponent(stem),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-selected-work]')?.dataset.selectedBackgroundReady==='true'||document.querySelector('[data-selected-work]')?.dataset.selectedError,null,{timeout});
    const initial=await page.evaluate(()=>window.__selectedStall.snapshot?.());
    assert.ok(initial,'Diagnostic installation must finish');
    assert.equal(initial.selected.selectedError,undefined,'Selected production initialization must succeed');
    assert.equal(initial.selected.selectedModelsReady,'6');assert.equal(initial.scrollY,0,'No earlier scroll/live pose may contaminate the first warm');
    result.afterFirstWarm=initial;
    await page.evaluate(()=>{window.__selectedStall.replay=true;});
    // Let the real page finish its independent aircraft preparation before
    // controlled repeats; do not compare a repeated draw amid that startup.
    await page.waitForFunction(()=>{const root=document.querySelector('[data-aircraft-hero]');return !root||root.dataset.aircraftBackgroundReady==='true'||root.dataset.aircraftState==='unavailable';},null,{timeout});
    result.beforeReplay=await page.evaluate(()=>window.__selectedStall.snapshot());
    const sequence=name.endsWith('-tiny')?
      [{label:'full-scene-transit-warm-after-tiny',progress:1,warm:true},{label:'repeat-full-scene-transit-warm',progress:1,warm:true}]:
      [{label:'repeat-framework-warm',progress:0,warm:true},{label:'repeat-transit-warm',progress:1,warm:true}];
    sequence.push({label:'first-full-size-framework',progress:0,warm:false},{label:'first-full-size-transit',progress:1,warm:false},{label:'repeat-full-size-transit',progress:1,warm:false});
    for(const spec of sequence)await page.evaluate(spec=>window.__selectedStall.capture(spec),spec);
    if(!process.argv.includes('--no-screenshots')){
      await page.evaluate(()=>{const root=document.querySelector('[data-selected-work]');window.scrollTo({top:scrollY+root.getBoundingClientRect().top,behavior:'instant'});});
      for(const progress of [0,1]){
        await page.evaluate(progress=>window.__selectedStall.capture({label:'screenshot-'+(progress?'transit':'framework'),progress,warm:false},()=>window.__v2Selected.seekProgress(progress)),progress);
        const filename=stem+'-'+(progress?'transit':'framework')+'.png';
        await page.screenshot({path:path.join(output,filename),animations:'disabled'});result.screenshots.push(filename);
      }
    }
    result.final=await page.evaluate(()=>window.__selectedStall.snapshot());assert.ok(result.final.geometryUnchanged,'Diagnostic must not alter any geometry');
    assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);
  }catch(error){result.error=error.stack;process.exitCode=1;}
  finally{
    result.servedSourceSha256=servedSourceHash;
    result.probe=await page.evaluate(()=>{const s=window.__selectedStall;return s?{environment:s.environment,records:s.records,unscoped:s.unscoped,slowCalls:s.slowCalls,shaderBuilds:s.shaderBuilds,programsAtInstall:s.programsAtInstall,materialsBefore:s.materialsBefore,materialsAfter:s.materialsAfter,shaderAblations:s.shaderAblations,textures:s.textures}:null;}).catch(error=>({readError:String(error)}));
    fs.writeFileSync(path.join(output,stem+'.json'),JSON.stringify(result,null,2)+'\n');await context.close();
  }
  console.log(JSON.stringify({case:name,iteration,error:result.error,draws:result.probe?.records?.map(draw=>({label:draw.label,cpuMs:draw.drawCpuMs,renderCpuMs:draw.renderCpuMs,finishMs:draw.completion?.finishCpuMs,fenceMs:draw.completion?.afterFinishFenceWaitMs,totalMs:draw.drawStartToFenceMs,programsBefore:draw.programsBefore.count,programsAfter:draw.programsAfter?.count,calls:draw.counters?.calls,triangles:draw.counters?.triangles}))}));
  return result;
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});const checks=sourceChecks();
  fs.writeFileSync(path.join(output,'source-checks.json'),JSON.stringify(checks,null,2)+'\n');
  if(process.argv.includes('--source-only')){console.log(JSON.stringify(checks,null,2));return;}
  const args=JSON.parse(process.env.V2_STALL_BROWSER_ARGS||'["--use-angle=swiftshader","--enable-unsafe-swiftshader"]');assert.ok(Array.isArray(args));
  const {chromium}=require('playwright');const browser=await chromium.launch({headless:!process.argv.includes('--headed'),executablePath:process.env.CHROMIUM_EXECUTABLE,args});
  const report={captureOnly:true,startedAt:new Date().toISOString(),base,checks,browserVersion:browser.version(),browserArgs:args,
    commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    method:{scope:'Real production page, six original model loads, original geometry/static batching and exact production camera/light preparation. One fresh browser context per case.',
      timing:'drawCpuMs and renderCpuMs are CPU wall time including GL-driver blocking and probe overhead. finishCpuMs is an explicit diagnostic gl.finish call. WebGL2 completion is independently checked by a flushed fence and polled clientWaitSync. Two-rAF is only an event-loop/frame opportunity, not proof of display presentation.',
      contamination:'First warm begins at scrollY=0 before any capture replay. Each draw is explicitly drained and fenced, which changes scheduling. Never combine these timings with production long-task measurements. Other page WebGL contexts remain present.',
      shaderCache:'Fresh browser contexts guarantee new WebGL contexts and material/program caches, not a cold process/driver shader cache. Cases run sequentially on the same browser. Use repeated/reversed --cases order to check shader-cache order effects.',
      tiny:'Isolated Metro/Tramtrace first-use cases use original geometry, material, light and shadow resolution with a 64px long-side color buffer, then restore all visibility and test the full scene.',
      noPhysical:'Only PHYSICAL define removed: this collectively removes r128 physical reflectivity, clearcoat and transmission code. no-transmission isolates the transmission branch while preserving the other physical code.',
      quality:'Screenshots use identical requested poses and viewport; material/light ablations are diagnostic quality comparisons, not proposed production changes.'},results:[]};
  try{for(let iteration=1;iteration<=Math.max(1,Number(process.env.V2_STALL_RUNS)||1);iteration++)for(const name of requested){report.results.push(await runCase(browser,name,iteration));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}}
  finally{await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
})().catch(error=>{console.error(error);process.exitCode=1;});

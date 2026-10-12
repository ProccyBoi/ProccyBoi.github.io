#!/usr/bin/env node
/* Same-runner hero pixel acceptance against the fixed 5a50d2f baseline.
 * Serve two unmodified repository roots, then run:
 *   V2_BASE_URL=http://127.0.0.1:8080 V2_BASELINE_URL=http://127.0.0.1:8081 \
 *     V2_HERO_VISUAL_OUT=/tmp/v2-hero-visual node scripts/verify-v2-hero-visual-parity.cjs
 *   node scripts/verify-v2-hero-visual-parity.cjs --self-test
 * Optional CHROMIUM_EXECUTABLE, V2_HERO_VISUAL_TIMEOUT, and
 * V2_HERO_VISUAL_BROWSER_ARGS (JSON array). Defaults: CI SwiftShader, DPR 1.
 *
 * No production edits, routed source, capture API, clock freezing, direct scene
 * rendering, or runtime quality changes. A transparent constructor observer
 * wraps only the actual hero renderer.render, calling the original unchanged.
 * After normal startup and the real 1250ms entrance, native scrolling settles
 * at each reachable CSS-pixel pose. A small native-scroll excursion returns to
 * that same pose. The observer takes ONE raw RGBA readback only when the actual
 * production draw exactly matches the saved settled camera/model transforms,
 * native scroll position, current dimensions and completed prior GPU state.
 * It never reads pixels on unarmed or intermediate frames. An own-context real
 * WebGL2 fence after each readback and the production frame fence must complete.
 * All three real models/parts and actual 2048-square PCFSoft shadow allocation
 * are checked. Each pose is repeated independently. Native clocks and easing
 * run normally, including UI fades. PNGs contain the exact raw framebuffer bytes
 * (GL row flip only), with no color conversion or alpha unpremultiplication.
 *
 * Viewport screenshots provide UI evidence, not the pixel-difference oracle.
 * This proves the listed hero poses only. Readback visits are never benchmarks.
 * Browser-blocked environments should run --self-test/--source-only and arrange
 * the actual browser comparison elsewhere; self-tests do not prove GPU parity.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baselineCommit = '5a50d2f336accccaf1577ad43f1465506bdbeb5c';
const output = path.resolve(process.env.V2_HERO_VISUAL_OUT || '.codex-temp/v2-hero-visual');
const timeout = Number(process.env.V2_HERO_VISUAL_TIMEOUT || 180000);
const entranceMs = 1250;
const devices = [
  {name:'desktop1440', width:1440, height:900, touch:false},
  {name:'mobile390', width:390, height:844, touch:true},
  {name:'mobile320', width:320, height:740, touch:true},
];
const poses = [
  {name:'overview', progress:0, visible:['tramtrace','telemetry','pi']},
  {name:'tramtrace-exploded', progress:.265, visible:['tramtrace']},
  {name:'telemetry-exploded', progress:.565, visible:['telemetry']},
  {name:'pi-exploded', progress:.88, visible:['pi']},
];
const names = ['tramtrace','telemetry','pi'];
// Manifest triangles count unique geometries; Pi has two mesh instances of a
// shared 5716-triangle screw. Preserve both metrics instead of conflating them.
const expectedCounts = {tramtrace:{parts:31,meshes:104,geometries:104,triangles:96514,instanceTriangles:96514},
  telemetry:{parts:54,meshes:166,geometries:166,triangles:224256,instanceTriangles:224256},
  pi:{parts:36,meshes:90,geometries:89,triangles:59762,instanceTriangles:65478}};
// Exactly the Selected parity gate: no masking, registration, crop, blur,
// antialias exclusion, or adjustable threshold. Exact RGBA is reported apart.
const tolerance = Object.freeze({maxChannelDelta:2, changedPixelFraction:.001, meanAbsoluteChannelDelta:.001});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file,value) => fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
const repositoryBytes = (file,variant) => variant==='baseline'
  ? execFileSync('git',['show',baselineCommit+':'+file],{cwd:root,maxBuffer:32*1024*1024})
  : fs.readFileSync(path.join(root,file));

function comparePixels(before, after, width, height) {
  assert.equal(before.length, width * height * 4, 'Baseline has complete RGBA pixels');
  assert.equal(after.length, before.length, 'Candidate has the same pixel dimensions');
  let changedPixels=0, changedChannels=0, totalDelta=0, maxChannelDelta=0;
  let left=width, top=height, right=-1, bottom=-1;
  const histogram = Array(256).fill(0), difference=Buffer.alloc(before.length);
  for (let pixel=0; pixel<width*height; pixel++) {
    let changed=false;
    for (let channel=0; channel<4; channel++) {
      const offset=pixel*4+channel, delta=Math.abs(before[offset]-after[offset]);
      histogram[delta]++;totalDelta+=delta;maxChannelDelta=Math.max(maxChannelDelta,delta);
      if(delta){changed=true;changedChannels++;}
      if(channel<3)difference[offset]=Math.min(255,delta*32);
    }
    difference[pixel*4+3]=255;
    if(changed){
      changedPixels++;const x=pixel%width,y=Math.floor(pixel/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      // Alpha-only differences must also be visible in the review heatmap.
      const alphaDelta=Math.abs(before[pixel*4+3]-after[pixel*4+3]);
      difference[pixel*4]=Math.max(difference[pixel*4],Math.min(255,alphaDelta*32));
    }
  }
  const changedPixelFraction=changedPixels/(width*height),meanAbsoluteChannelDelta=totalDelta/before.length;
  return {pass:maxChannelDelta<=tolerance.maxChannelDelta && changedPixelFraction<=tolerance.changedPixelFraction && meanAbsoluteChannelDelta<=tolerance.meanAbsoluteChannelDelta,
    exact:changedPixels===0,width,height,changedPixels,changedChannels,changedPixelFraction,meanAbsoluteChannelDelta,maxChannelDelta,
    changedBounds:changedPixels?{left,top,right,bottom}:null,channelDeltaHistogram:histogram,
    baselineSHA256:sha(before),candidateSHA256:sha(after),difference};
}

// Dependency-free lossless PNG writer, so only Playwright must be installed.
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function pngChunk(type, data) {
  const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,checksum]);
}
function pngRGBA(width, height, pixels) {
  assert.equal(pixels.length,width*height*4);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))]);
}
function topDown(pixels, width, height) {
  const result=Buffer.alloc(pixels.length),stride=width*4;
  for(let y=0;y<height;y++)pixels.copy(result,y*stride,(height-y-1)*stride,(height-y)*stride);
  return result;
}
function baseURL(value, label) {
  assert.ok(value,`${label} is required; serve the candidate and fixed baseline separately`);
  const url=new URL(value);assert.ok(['http:','https:'].includes(url.protocol));
  url.search='';url.hash='';url.pathname=url.pathname.replace(/\/$/,'').replace(/\/v2$/,'')+'/';
  return url.href;
}
// Identify actual scene parts by their baseline tree paths, without wrapping
// model factories, motion preparation, GPU helpers, or any asset-load promise.
function modelSpecs() {
  const manifest=JSON.parse(repositoryBytes('assets/models/hero/manifest.json','baseline'));
  return names.map(name=>{
    const bytes=repositoryBytes(`assets/models/hero/${name}.bin`,'baseline');
    assert.equal(bytes.toString('ascii',0,7),'V2HERO1');
    const pack=JSON.parse(bytes.toString('utf8',16,16+bytes.readUInt32LE(8)));
    const paths=new Map();
    const visit=(index,indices)=>{assert.ok(!paths.has(index),'Model tree has no duplicate node');paths.set(index,indices);pack.nodes[index].children.forEach((child,i)=>visit(child,[...indices,i]));};
    visit(0,[]);assert.equal(paths.size,pack.nodes.length);
    const counts=expectedCounts[name],entry=manifest.models[name];
    for(const key of ['parts','meshes','triangles'])assert.equal(entry[key],counts[key],`${name}: accepted ${key} count`);
    assert.equal(pack.parts.length,counts.parts);
    assert.equal(pack.geometries.length,counts.geometries);
    const triangles=geometry=>geometry.index.byteLength/(geometry.index.arrayType==='Uint16Array'?2:4)/3;
    assert.equal(pack.geometries.reduce((sum,geometry)=>sum+triangles(geometry),0),counts.triangles);
    assert.equal(pack.nodes.filter(node=>node.type==='Mesh').reduce((sum,node)=>sum+triangles(pack.geometries[node.geometry]),0),counts.instanceTriangles);
    assert.equal(pack.nodes[0].name,name);
    return{name,...counts,nodes:pack.nodes.length,parts:pack.parts.map(part=>({path:paths.get(part.object),name:pack.nodes[part.object].name,ref:pack.nodes[part.object].userData.partRef||null}))};
  });
}
async function verifyServedSources(base,variant) {
  const manifest=JSON.parse(repositoryBytes('assets/models/hero/manifest.json',variant));
  const files=[...new Set(['v2/index.html','assets/v2.js','assets/v2.css','assets/v2-assembly.js','assets/v2-assembly.css',
    'assets/v2-hero-startup.js','assets/v2-hero-loading.js','assets/v2-hero-loading.css','assets/v2-hero-motion.js',
    'assets/v2-hero-assets.js','assets/v2-hero-environment.js','assets/v2-gpu-preparation.js','assets/v2-scroll-smoothing.js',
    'assets/vendor/three.min.js','assets/models/hero/manifest.json','assets/models/hero/environment.bin',
    'assets/models/hero/environment.bin.gz',...names.flatMap(name=>[
      `assets/models/hero/${name}.bin`,`assets/models/hero/${name}.idx.bin.gz`,...manifest.models[name].textures.map(url=>url.replace(/^\//,''))])])];
  const records=[];
  for(const file of files){
    const expected=repositoryBytes(file,variant),response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(timeout)});
    assert.ok(response.ok,`${variant}: ${file} unavailable (${response.status})`);
    const actual=Buffer.from(await response.arrayBuffer()),record={file,expectedSHA256:sha(expected),servedSHA256:sha(actual)};
    records.push(record);assert.equal(record.servedSHA256,record.expectedSHA256,`${variant} must serve its intended unmodified ${file}`);
  }
  return records;
}

// Serialized as an init script. This observer never calls render itself and
// never sets a renderer, camera, scene, model, shadow, material, or clock value.
function browserProbe({specs,budget}) {
  let renderer,scene,camera,armed=null,result=null,pending=null,error=null,draws=0,readbacks=0;
  const required=(condition,message)=>{if(!condition)throw Error(message);};
  const hero=()=>document.querySelector('[data-assembly]');
  const rect=node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
  const nativePose=()=>{
    const root=hero(),stage=root.querySelector('.v2-assembly-sticky'),span=Math.max(1,root.offsetHeight-stage.clientHeight);
    return{scrollY,sectionTop:scrollY+root.getBoundingClientRect().top,span,progress:Math.min(1,Math.max(0,-root.getBoundingClientRect().top/span))};
  };
  const nodePose=node=>({name:node.name,type:node.type,visible:node.visible,position:node.position.toArray(),quaternion:node.quaternion.toArray(),scale:node.scale.toArray(),matrix:node.matrix.toArray(),matrixWorld:node.matrixWorld.toArray()});
  const scenePose=()=>({camera:{...nodePose(camera),projection:camera.projectionMatrix.toArray()},
    models:specs.map(spec=>{
      const group=scene.children.find(node=>node.name===spec.name);
      required(group,`Missing real model ${spec.name}`);
      const nodes=[];group.traverse(node=>nodes.push(nodePose(node)));
      return{name:spec.name,nodes};
    })});
  const production=()=>{
    const d=hero().dataset,last=JSON.parse(d.assemblyLastSubmission||'null');
    return{state:d.assemblyState,installed:Number(d.assemblyModelsInstalled),ready:Number(d.assemblyModelsReady),settled:Number(d.assemblyModelsSettled),
      pending:d.assemblyGPUPending,completion:d.assemblyGPUCompletion,evidence:d.assemblyGPUCompletionEvidence,
      submitted:Number(d.assemblySubmittedFrames),completed:Number(d.assemblyCompletedFrames),progress:d.assemblyProgress,
      environment:d.assemblyEnvironment,last};
  };
  const assertIdle=()=>{
    const state=production(),actual=nativePose();
    required(state.state==='ready'&&state.installed===3&&state.ready===3&&state.settled===3,'All three production models must be installed and ready');
    required(state.pending==='false'&&state.completion==='complete'&&state.evidence==='own-context-fence','No pending production GPU state and a completed own-context fence are required');
    required(state.submitted===state.completed,'Every submitted production frame must have completed');
    required(state.last?.value===actual.progress&&state.last?.raw===actual.progress,'Production must be exactly at the native-scroll pose');
    required(state.progress===actual.progress.toFixed(5),'Published progress must match the exact native pose');
    return state;
  };
  const fence=async()=>{
    const gl=renderer.getContext();
    required(renderer.capabilities.isWebGL2&&typeof gl.fenceSync==='function','Real WebGL2 fences are required');
    required(!gl.isContextLost(),'Hero WebGL context is lost');
    const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),start=performance.now();let polls=0;
    required(sync,'fenceSync returned null');
    try{
      gl.flush();
      while(performance.now()-start<budget){
        const status=gl.clientWaitSync(sync,0,0);polls++;
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return{state:'complete',polls,waitMs:performance.now()-start};
        required(status===gl.TIMEOUT_EXPIRED&&!gl.isContextLost(),'Own-context capture fence failed');
        await new Promise(resolve=>setTimeout(resolve,4));
      }
      throw Error('Own-context capture fence timed out');
    }finally{gl.deleteSync(sync);}
  };
  const facts=(pose,native)=>{
    const gl=renderer.getContext(),canvas=renderer.domElement,root=hero(),shadows=[];
    scene.traverse(node=>{
      if(node.isLight&&node.castShadow)shadows.push({type:node.type,mapSize:node.shadow.mapSize.toArray(),actualWidth:node.shadow.map?.width,actualHeight:node.shadow.map?.height,
        bias:node.shadow.bias,normalBias:node.shadow.normalBias,radius:node.shadow.radius,
        position:node.position.toArray(),target:node.target.position.toArray(),camera:{...nodePose(node.shadow.camera),projection:node.shadow.camera.projectionMatrix.toArray()}});
    });
    const statistics=specs.map(spec=>{
      const group=scene.children.find(node=>node.name===spec.name),geometries=new Set();let nodes=0,meshes=0,triangles=0,instanceTriangles=0;
      group.traverse(node=>{
        nodes++;if(!node.isMesh)return;
        required(node.geometry?.attributes.position,'Actual mesh geometry required');meshes++;
        const count=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;instanceTriangles+=count;
        if(!geometries.has(node.geometry)){geometries.add(node.geometry);triangles+=count;}
      });
      const parts=spec.parts.map(part=>{
        const node=part.path.reduce((parent,index)=>parent?.children[index],group);
        required(node&&node.name===part.name&&(node.userData.partRef||null)===part.ref,`Missing/mismatched ${spec.name} part ${part.name}`);
        return{name:node.name,ref:node.userData.partRef||null,path:part.path};
      });
      required(nodes===spec.nodes,`${spec.name}: actual complete model node tree`);
      return{name:spec.name,visible:group.visible,nodes,meshes,geometries:geometries.size,triangles,instanceTriangles,partCount:parts.length,parts};
    });
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return{native,pose,statistics,dimensions:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},pixelRatio:renderer.getPixelRatio(),
      canvas:{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight},
      layout:{hero:rect(root),stage:rect(root.querySelector('.v2-assembly-sticky')),canvas:rect(canvas)},
      shadowEnabled:renderer.shadowMap.enabled,shadowType:renderer.shadowMap.type,expectedPCFSoftType:window.THREE.PCFSoftShadowMap,shadows,
      quality:{toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure,outputEncoding:renderer.outputEncoding,physicallyCorrectLights:renderer.physicallyCorrectLights},
      draw:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},
      environment:{three:window.THREE.REVISION,vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
        unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,contextAttributes:gl.getContextAttributes()},
      beforeReadback:production(),drawSequence:Number(root.dataset.assemblySubmittedFrames)+1};
  };
  const instrument=instance=>{
    if(!instance.domElement.matches('[data-assembly-canvas]'))return;
    required(!renderer,'One hero renderer is expected');renderer=instance;
    const render=instance.render;
    instance.render=function(actualScene,actualCamera,...args){
      // Preserve the original call, receiver, arguments, result and exceptions.
      const returned=render.call(this,actualScene,actualCamera,...args);
      scene=actualScene;camera=actualCamera;draws++;
      if(!armed)return returned;
      try{
        const native=nativePose();
        if(JSON.stringify(native)!==JSON.stringify(armed.native))return returned;
        const pose=scenePose();
        if(JSON.stringify(pose)!==armed.signature)return returned;
        const gl=renderer.getContext(),state=production();
        required(state.pending==='false'&&state.completion==='complete'&&state.evidence==='own-context-fence','No prior production GPU work may be pending at capture');
        required(state.submitted===state.completed,'No unfinished previous production frame at capture');
        required(renderer.getRenderTarget()===null&&gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,'Read the real default framebuffer only');
        required(renderer.getPixelRatio()===1&&gl.drawingBufferWidth===renderer.domElement.clientWidth&&gl.drawingBufferHeight===renderer.domElement.clientHeight,'Only actual full current-size DPR 1 frames are eligible');
        required(gl.getError()===gl.NO_ERROR,'No pre-existing WebGL error is allowed');
        // No await/task boundary between the successful production draw and
        // readback: preserveDrawingBuffer=false cannot clear this frame first.
        const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);readbacks++;
        required(gl.getError()===gl.NO_ERROR,'WebGL error during raw readback');
        const completion=fence(),captured=facts(pose,native),token=armed.token,preDrain=armed.preDrain;
        armed=null;
        pending=completion.then(done=>{result={token,pixels,facts:{...captured,preDrain,completion:done}};},failure=>{error=String(failure.stack||failure);});
      }catch(failure){armed=null;error=String(failure.stack||failure);}
      return returned;
    };
  };
  // Three r128 first assigns THREE={}, then exports WebGLRenderer. Observe that
  // export, preserving the real constructor/options and all other exports.
  let three;
  Object.defineProperty(window,'THREE',{configurable:true,get:()=>three,set(value){
    three=value;let constructor=value.WebGLRenderer;
    const observe=Original=>new Proxy(Original,{construct(Target,args,NewTarget){const instance=Reflect.construct(Target,args,NewTarget);instrument(instance);return instance;}});
    if(constructor)constructor=observe(constructor);
    Object.defineProperty(value,'WebGLRenderer',{configurable:true,enumerable:true,get:()=>constructor,set(Original){constructor=observe(Original);}});
  }});
  window.__heroVisual={
    snapshot(){return{native:nativePose(),pose:scenePose(),production:assertIdle()};},
    async arm({target,token}){
      required(!armed&&!pending&&!result&&!error,'A previous capture must be consumed before arming');
      assertIdle();const preDrain=await fence();assertIdle();
      armed={native:target.native,signature:JSON.stringify(target.pose),token,preDrain};
    },
    status(){return{draws,readbacks,armed:Boolean(armed),captured:Boolean(pending),ready:Boolean(result),error};},
    diagnostic(){return{native:nativePose(),actualPose:scene&&camera?scenePose():null,armedTarget:armed?{native:armed.native,pose:JSON.parse(armed.signature)}:null};},
    async take(){
      if(pending)await pending;
      required(!error,error);required(result,'No completed capture');
      const {pixels,...capture}=result,chunks=[];
      for(let i=0;i<pixels.length;i+=32768)chunks.push(String.fromCharCode(...pixels.subarray(i,i+32768)));
      result=null;pending=null;
      return{...capture,pixelData:btoa(chunks.join(''))};
    },
  };
}

async function waitForSettled(page) {
  await page.waitForFunction(()=>{
    const root=document.querySelector('[data-assembly]'),d=root?.dataset,probe=window.__heroVisual;
    if(!root||!probe)return false;
    if(['static','unavailable'].includes(d.assemblyState))throw Error('Hero unavailable: '+JSON.stringify({...d}));
    if(probe.status().error)throw Error(probe.status().error);
    const stage=root.querySelector('.v2-assembly-sticky'),span=Math.max(1,root.offsetHeight-stage.clientHeight),actual=Math.min(1,Math.max(0,-root.getBoundingClientRect().top/span));
    const last=JSON.parse(d.assemblyLastSubmission||'null'),stamp=[scrollY,d.assemblySubmittedFrames,d.assemblyCompletedFrames,d.assemblyGPUPending].join('/');
    if(stamp!==probe.idleStamp){probe.idleStamp=stamp;probe.idleSince=performance.now();}
    return d.assemblyModelsInstalled==='3'&&d.assemblyModelsReady==='3'&&d.assemblyModelsSettled==='3'&&d.assemblyState==='ready'&&
      d.assemblyGPUPending==='false'&&d.assemblyGPUCompletion==='complete'&&d.assemblyGPUCompletionEvidence==='own-context-fence'&&
      d.assemblySubmittedFrames===d.assemblyCompletedFrames&&last?.value===actual&&last?.raw===actual&&d.assemblyProgress===actual.toFixed(5)&&
      performance.now()-probe.idleSince>=700;
  },null,{timeout});
}
async function settleUI(page) {
  await page.evaluate(async budget=>{
    await document.fonts.ready;
    const root=document.querySelector('[data-assembly]');
    for(const image of root.querySelectorAll('img[src]')){await image.decode();if(!image.complete||!image.naturalWidth)throw Error('Undecoded hero image: '+image.currentSrc);}
    const start=performance.now();let previous='',stableSince=start;
    while(performance.now()-start<budget){
      const nodes=[root,root.querySelector('.v2-assembly-sticky'),...root.querySelectorAll('canvas,[data-assembly-intro],[data-assembly-caption],[data-assembly-posters] img')];
      const sample=JSON.stringify({scrollY,fontStatus:document.fonts.status,nodes:nodes.map(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node);return[b.x,b.y,b.width,b.height,s.opacity,s.visibility,s.transform];})});
      const moving=root.getAnimations({subtree:true}).some(animation=>['running','pending'].includes(animation.playState)&&Number.isFinite(animation.effect?.getComputedTiming().endTime));
      if(sample!==previous||moving){previous=sample;stableSince=performance.now();}
      if(performance.now()-stableSince>=300)return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('Hero layout or finite UI animations did not settle');
  },Math.min(timeout,15000));
}
async function nativeScroll(page,progress) {
  const target=await page.evaluate(value=>{
    const root=document.querySelector('[data-assembly]'),stage=root.querySelector('.v2-assembly-sticky'),span=root.offsetHeight-stage.clientHeight;
    const sectionTop=scrollY+root.getBoundingClientRect().top,requestedScrollY=Math.round(sectionTop+span*value);
    scrollTo({top:requestedScrollY,behavior:'instant'});
    return{requestedScrollY,sectionTop,span,requestedProgress:value};
  },progress);
  await waitForSettled(page);await settleUI(page);
  const actual=await page.evaluate(()=>window.__heroVisual.snapshot());
  assert.equal(actual.native.scrollY,target.requestedScrollY,'Native scroll uses the requested integral CSS pixel');
  assert.equal(actual.native.sectionTop,target.sectionTop,'Native section position is stable');
  assert.equal(actual.native.span,target.span,'Native scroll range is stable');
  assert.ok(Math.abs(actual.native.progress-progress)<=.5/target.span+Number.EPSILON,'Only native CSS-pixel rounding is allowed');
  return{...actual,requested:target};
}
function assertFullQuality(facts,label,pose) {
  assert.equal(facts.preDrain.state,'complete',label+': pre-arm own-context fence');
  assert.equal(facts.completion.state,'complete',label+': post-readback own-context fence');
  assert.equal(facts.beforeReadback.pending,'false',label+': no pending previous GPU state');
  assert.equal(facts.beforeReadback.submitted,facts.beforeReadback.completed,label+': no unfinished previous draw');
  assert.equal(facts.beforeReadback.environment,'prepared',label+': real prepared lighting');
  for(const key of ['installed','ready','settled'])assert.equal(facts.beforeReadback[key],3,label+': all models '+key);
  assert.equal(facts.shadowEnabled,true,label+': shadows enabled');
  assert.equal(facts.shadowType,facts.expectedPCFSoftType,label+': PCFSoft shadow filtering');
  assert.equal(facts.shadows.length,1,label+': real shadow-casting key light');
  for(const shadow of facts.shadows){
    assert.deepEqual(shadow.mapSize,[2048,2048],label+': requested shadow dimensions');
    assert.equal(shadow.actualWidth,2048,label+': actual allocated shadow width');
    assert.equal(shadow.actualHeight,2048,label+': actual allocated shadow height');
  }
  assert.equal(facts.pixelRatio,1,label+': full DPR 1');
  assert.deepEqual(facts.dimensions,{width:facts.canvas.clientWidth,height:facts.canvas.clientHeight},label+': full current-size framebuffer');
  assert.equal(facts.canvas.width,facts.dimensions.width);assert.equal(facts.canvas.height,facts.dimensions.height);
  assert.deepEqual(facts.statistics.map(model=>model.name),names,label+': all three real models');
  for(const model of facts.statistics){
    for(const key of ['meshes','geometries','triangles','instanceTriangles'])assert.equal(model[key],expectedCounts[model.name][key],`${label}: ${model.name} ${key}`);
    assert.equal(model.partCount,expectedCounts[model.name].parts,`${label}: ${model.name} physical part count`);
    assert.equal(model.parts.length,model.partCount);
  }
  assert.deepEqual(facts.statistics.filter(model=>model.visible).map(model=>model.name),pose.visible,label+': exact chapter visibility');
  assert.ok(facts.draw.calls>0&&facts.draw.triangles>1000,label+': actual production geometry drawn');
}

async function captureVariant(browser,base,variant,device,specs) {
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1,isMobile:device.touch,
    hasTouch:device.touch,reducedMotion:'no-preference',colorScheme:'light',locale:'en-GB',timezoneId:'UTC',serviceWorkers:'block'});
  await context.addInitScript(browserProbe,{specs,budget:timeout});
  const page=await context.newPage(),errors=[],shaderErrors=[],prefix=device.name+'-'+variant;
  const record={variant,device:device.name,base,errors,shaderErrors,captures:[]};
  page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/Shader Error|Error compiling shader|THREE.WebGLProgram/.test(message.text()))shaderErrors.push(message.text());});
  try{
    const url=new URL('v2/',base);record.url=url.href;
    await page.goto(url.href,{waitUntil:'load'});await waitForSettled(page);
    // Conservative real-time wait after all three models are naturally ready.
    // Entrance began earlier, so every captured pose is beyond its 1250ms end.
    await page.waitForTimeout(entranceMs);await waitForSettled(page);await settleUI(page);
    record.startup=await page.evaluate(()=>window.__heroVisual.snapshot());
    assert.equal(record.startup.native.progress,0,'A fresh visit starts in the real overview');
    record.startup.entranceWaitMs=entranceMs;
    record.startup.screenshot=prefix+'-startup-final-ready-viewport.png';
    await page.screenshot({path:path.join(output,record.startup.screenshot),timeout});
    for(const pose of poses){
      const target=await nativeScroll(page,pose.progress),samples=[];
      if(pose.progress===0)assert.deepEqual(target.pose,record.startup.pose,'Overview capture uses the naturally ready startup pose');
      for(let repeat=0;repeat<2;repeat++){
        // Native 2px excursion ensures a real scroll event and production draw
        // on return. No synthetic scroll event or manual render request exists.
        const excursionY=target.native.scrollY+2;
        await page.evaluate(top=>scrollTo({top,behavior:'instant'}),excursionY);
        await waitForSettled(page);await settleUI(page);
        const excursion=await page.evaluate(()=>window.__heroVisual.snapshot());
        assert.equal(excursion.native.scrollY,excursionY,'Excursion must be a real native scroll');
        assert.notEqual(excursion.native.progress,target.native.progress,'Excursion must leave the selected pose');
        const token=`${prefix}-${pose.name}-${repeat}`;
        await page.evaluate(async({target,token})=>{
          await window.__heroVisual.arm({target,token});
          scrollTo({top:target.native.scrollY,behavior:'instant'});
        },{target,token});
        await page.waitForFunction(()=>{const state=window.__heroVisual.status();if(state.error)throw Error(state.error);return state.ready;},null,{timeout});
        await waitForSettled(page);await settleUI(page);
        const post=await page.evaluate(()=>window.__heroVisual.snapshot()),result=await page.evaluate(()=>window.__heroVisual.take());
        assert.equal(result.token,token,'Capture token matches its single armed pose');
        assert.deepEqual(result.facts.native,target.native,'Readback is at the exact reachable native-scroll pixel');
        assert.deepEqual(result.facts.pose,target.pose,'Readback is the exact settled camera and physical part pose');
        assert.deepEqual(post.native,target.native,'Native pose remains unchanged after the capture fences');
        assert.deepEqual(post.pose,target.pose,'Camera and physical part pose remain unchanged after the capture fences');
        assert.equal(post.production.last.sequence,result.facts.drawSequence,'Readback belongs to the current final production draw');
        assert.equal(post.production.last.value,target.native.progress,'Captured production submission has exact settled progress');
        assert.equal(post.production.last.raw,target.native.progress,'Captured production target has exact native progress');
        assertFullQuality(result.facts,token,pose);
        const {width,height}=result.facts.dimensions,pixels=topDown(Buffer.from(result.pixelData,'base64'),width,height);
        let visiblePixels=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visiblePixels++;
        assert.ok(visiblePixels>width*height*.01,'Capture contains real geometry rather than a cleared/transparent buffer');
        const file=`${prefix}-${pose.name}${repeat?'-repeat':''}-canvas.png`;
        fs.writeFileSync(path.join(output,file),pngRGBA(width,height,pixels));
        samples.push({facts:result.facts,productionAfterCapture:post.production,pixels,file,visiblePixels,sha256:sha(pixels)});
      }
      const {width,height}=samples[0].facts.dimensions,{difference,...stability}=comparePixels(samples[0].pixels,samples[1].pixels,width,height);
      // Repeats must also have exact metadata, not merely near-identical pixels.
      for(const field of parityFields)assert.deepEqual(samples[1].facts[field],samples[0].facts[field],`${prefix}/${pose.name}: repeat ${field}`);
      if(!stability.pass)fs.writeFileSync(path.join(output,`${prefix}-${pose.name}-instability-x32.png`),pngRGBA(width,height,difference));
      const screenshot=`${prefix}-${pose.name}-viewport.png`;
      await page.screenshot({path:path.join(output,screenshot),timeout});
      record.captures.push({pose,target,screenshot,samples,stability});
      console.log(`CAPTURE ${prefix} ${pose.name}: ${width}x${height}, native ${target.native.progress}, repeat ${stability.exact?'exact RGBA':stability.pass?'within fixed tolerance':'FAILED'}`);
    }
    record.observer=await page.evaluate(()=>window.__heroVisual.status());
    assert.equal(record.observer.readbacks,poses.length*2,'Exactly one readPixels call per armed pose, with no continuous frame readback');
    assert.equal(record.observer.armed,false);assert.equal(record.observer.ready,false);assert.equal(record.observer.error,null);
    assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(shaderErrors,[],'No shader errors');
    return record;
  }catch(error){
    record.failure=error.stack;
    record.diagnostic=await page.evaluate(()=>({url:location.href,scrollY,hero:{...document.querySelector('[data-assembly]')?.dataset},observer:window.__heroVisual?.status(),pose:window.__heroVisual?.diagnostic()})).catch(()=>null);
    await page.screenshot({path:path.join(output,prefix+'-failure.png'),timeout:15000}).catch(()=>{});
    throw Object.assign(error,{partialRecord:record});
  }finally{json(prefix+'.json',serializableRecord(record));await context.close();}
}
const parityFields=['native','dimensions','pixelRatio','shadows','shadowEnabled','shadowType','quality','pose','environment','canvas','layout','statistics','draw'];
function serializableRecord(record) {
  return{...record,captures:record.captures.map(capture=>({...capture,samples:capture.samples.map(({pixels,...sample})=>sample)}))};
}

async function selfTest() {
  const exact=Buffer.alloc(40000,128);assert.equal(comparePixels(exact,exact,100,100).pass,true);
  const tiny=Buffer.from(exact);tiny[0]++;assert.equal(comparePixels(exact,tiny,100,100).pass,true);
  const large=Buffer.from(exact);large[0]+=3;assert.equal(comparePixels(exact,large,100,100).pass,false,'Any >2/255 channel difference fails');
  const broad=Buffer.from(exact);for(let i=0;i<100;i++)broad[i*4]++;assert.equal(comparePixels(exact,broad,100,100).pass,false,'Broad 1/255 changes fail');
  const alpha=Buffer.from(exact);alpha[3]+=3;const delta=comparePixels(exact,alpha,100,100);assert.equal(delta.pass,false);assert.equal(delta.difference[0],96);
  assert.deepEqual(topDown(Buffer.from([1,2,3,4,5,6,7,8]),1,2),Buffer.from([5,6,7,8,1,2,3,4]));
  const png=pngRGBA(1,2,Buffer.from([1,2,3,4,5,6,7,8]));let offset=8;const blocks=[];
  while(offset<png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);assert.equal(png.readUInt32BE(offset+8+size),crc32(png.subarray(offset+4,offset+8+size)));if(type==='IDAT')blocks.push(data);offset+=12+size;}
  assert.deepEqual(zlib.inflateSync(Buffer.concat(blocks)),Buffer.from([0,1,2,3,4,0,5,6,7,8]));
  assert.equal(baseURL('http://localhost:8080/v2/','test'),'http://localhost:8080/');
  const specs=modelSpecs();for(const spec of specs)assert.equal(spec.parts.length,expectedCounts[spec.name].parts);
  assert.deepEqual(poses.map(p=>p.progress),[0,.265,.565,.88]);assert.equal(devices.length*poses.length,12);
  const source=fs.readFileSync(__filename,'utf8'),probe=browserProbe.toString();
  assert.equal((probe.match(/gl\.readPixels\(/g)||[]).length,1,'One armed-only readback site');
  assert.ok(!/\.set(?:PixelRatio|Size|RenderTarget)|\.render\(scene|\.finish\(|Date\.now\s*=|performance\.now\s*=/.test(probe),'Observer cannot change quality, manually render or freeze clocks');
  assert.ok(!/page\.route\(|animations:\s*['"]disabled|dispatchEvent\(/.test(source),'Harness must keep production sources, UI clocks and native scrolling');
  qualitySelfTest();
  await probeSelfTest();
  console.log('PASS: strict RGBA/alpha comparator, lossless PNG encoding, fixed baseline part paths, 12-pose matrix, and armed-only production-render observer. No browser/GPU result claimed.');
}

function qualitySelfTest() {
  const nominal={preDrain:{state:'complete'},completion:{state:'complete'},
    beforeReadback:{pending:'false',submitted:1,completed:1,environment:'prepared',installed:3,ready:3,settled:3},
    shadowEnabled:true,shadowType:2,expectedPCFSoftType:2,shadows:[{mapSize:[2048,2048],actualWidth:2048,actualHeight:2048}],
    pixelRatio:1,dimensions:{width:320,height:740},canvas:{width:320,height:740,clientWidth:320,clientHeight:740},
    statistics:names.map(name=>({name,...expectedCounts[name],visible:true,partCount:expectedCounts[name].parts,parts:Array(expectedCounts[name].parts).fill({})})),
    draw:{calls:360,triangles:386248}};
  assertFullQuality(nominal,'valid quality double',poses[0]);
  for(const [label,mutate]of[
    ['undersized actual shadow',facts=>{facts.shadows[0].actualWidth=1024;}],
    ['non-PCFSoft filtering',facts=>{facts.shadowType=1;}],
    ['lower resolution',facts=>{facts.dimensions.width=160;}],
    ['incomplete production fence',facts=>{facts.beforeReadback.pending='true';}],
    ['missing CAD part',facts=>{facts.statistics[2].partCount--;}],
    ['wrong Pi shared-instance count',facts=>{facts.statistics[2].instanceTriangles=59762;}],
    ['missing chapter model',facts=>{facts.statistics[0].visible=false;}],
  ]){
    const facts=JSON.parse(JSON.stringify(nominal));mutate(facts);
    assert.throws(()=>assertFullQuality(facts,label,poses[0]),undefined,`${label} must fail`);
  }
}

// Exercise the real serialized observer with deliberately tiny doubles. These
// tests prove capture eligibility and scheduling only, never real-driver pixels.
async function probeSelfTest() {
  let now=5000,reads=0,originalCalls=0,fenceCreates=0,fenceDeletes=0,drawThrows=false,readError=false,fenceStatus=2;
  const vec=(...values)=>({toArray:()=>values});
  const makeNode=(name,type='Group')=>({name,type,visible:true,position:vec(0,0,0),quaternion:vec(0,0,0,1),scale:vec(1,1,1),matrix:vec(1,0,0,1),matrixWorld:vec(1,0,0,1),children:[],userData:{},
    traverse(callback){callback(this);this.children.forEach(child=>child.traverse(callback));}});
  const model=makeNode('test'),part=makeNode('part','Mesh');part.isMesh=true;part.userData.partRef='P1';part.geometry={attributes:{position:{count:3}},index:{count:3}};model.children.push(part);
  const scene=makeNode('scene','Scene');scene.children.push(model);const camera=makeNode('camera','OrthographicCamera');camera.projectionMatrix=vec(1,0,0,1);
  const canvas={width:2,height:2,clientWidth:2,clientHeight:2,matches:selector=>selector==='[data-assembly-canvas]',getBoundingClientRect:()=>({x:0,y:0,width:2,height:2})};
  const stage={clientHeight:2,getBoundingClientRect:canvas.getBoundingClientRect};
  const dataset={assemblyState:'ready',assemblyModelsInstalled:'3',assemblyModelsReady:'3',assemblyModelsSettled:'3',assemblyGPUPending:'false',assemblyGPUCompletion:'complete',assemblyGPUCompletionEvidence:'own-context-fence',assemblySubmittedFrames:'1',assemblyCompletedFrames:'1',assemblyProgress:'0.00000',assemblyEnvironment:'prepared',assemblyLastSubmission:JSON.stringify({sequence:1,value:0,raw:0})};
  const rootNode={dataset,offsetHeight:102,querySelector:()=>stage,getBoundingClientRect:()=>({x:0,y:-context.scrollY,top:-context.scrollY,width:2,height:102})};
  const gl={drawingBufferWidth:2,drawingBufferHeight:2,NO_ERROR:0,FRAMEBUFFER_BINDING:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,SYNC_GPU_COMMANDS_COMPLETE:5,
    RGBA:6,UNSIGNED_BYTE:7,VENDOR:8,RENDERER:9,VERSION:10,isContextLost:()=>false,getParameter:key=>key===1?null:'mock',getExtension:()=>null,
    getContextAttributes:()=>({premultipliedAlpha:true,preserveDrawingBuffer:false}),getError:()=>readError&&reads?99:0,
    readPixels(x,y,width,height,format,type,pixels){assert.equal(originalCalls>0,true,'Original render happens before readPixels');reads++;pixels.fill(73);},
    fenceSync(){fenceCreates++;return{};},flush(){},clientWaitSync(){return fenceStatus;},deleteSync(){fenceDeletes++;}};
  class Renderer {
    constructor(options){this.options=options;this.domElement=options.canvas;this.capabilities={isWebGL2:true};this.shadowMap={enabled:true,type:2};this.info={render:{calls:1,triangles:1}};}
    render(...args){originalCalls++;assert.equal(this instanceof Renderer,true);assert.equal(args[0],scene);if(drawThrows)throw Error('original render error');return 123;}
    getContext(){return gl;}getPixelRatio(){return 1;}getRenderTarget(){return null;}
  }
  const context=vm.createContext({window:{},document:{querySelector:()=>rootNode},scrollY:0,performance:{now:()=>now++},setTimeout,Uint8Array,Proxy,Reflect,Map,JSON,Error,String,
    btoa:text=>Buffer.from(text,'binary').toString('base64')});
  vm.runInContext(`(${browserProbe.toString()})(${JSON.stringify({specs:[{name:'test',nodes:2,parts:[{path:[0],name:'part',ref:'P1'}]}],budget:1000})})`,context);
  context.window.THREE={};context.window.THREE.REVISION='test';context.window.THREE.PCFSoftShadowMap=2;context.window.THREE.WebGLRenderer=Renderer;
  const options={canvas,alpha:true,antialias:true},renderer=new context.window.THREE.WebGLRenderer(options),probe=context.window.__heroVisual;
  assert.equal(renderer.options,options,'Constructor options are passed unchanged');
  assert.equal(renderer.render(scene,camera,'extra'),123,'Original renderer return value is unchanged');
  renderer.render(scene,camera);assert.equal(reads,0,'Unarmed renders never read pixels');
  const target=probe.snapshot();await probe.arm({target,token:'exact'});
  context.scrollY=1;renderer.render(scene,camera);assert.equal(reads,0,'Wrong native position cannot capture');context.scrollY=0;
  part.position=vec(1,0,0);renderer.render(scene,camera);assert.equal(reads,0,'Intermediate physical part pose cannot capture');part.position=vec(0,0,0);
  renderer.render(scene,camera);await Promise.resolve();
  const result=await probe.take();assert.equal(result.token,'exact');assert.equal(Buffer.from(result.pixelData,'base64').length,16);assert.equal(reads,1);
  renderer.render(scene,camera);assert.equal(reads,1,'An armed capture is consumed exactly once');
  await probe.arm({target,token:'error'});dataset.assemblyGPUPending='true';renderer.render(scene,camera);
  assert.ok(probe.status().error.includes('No prior production GPU work'),'Pending production GPU state is rejected');assert.equal(reads,1);
  drawThrows=true;assert.throws(()=>renderer.render(scene,camera),/original render error/,'Production exceptions remain unchanged');
  assert.equal(fenceCreates,fenceDeletes,'Every own-context fence is cleaned up');
}

async function main() {
  if(process.argv.includes('--self-test')||process.argv.includes('--source-only'))return selfTest();
  fs.mkdirSync(output,{recursive:true});
  const report={baselineCommit,startedAt:new Date().toISOString(),status:'running',devices,poses,tolerance,entranceMs,
    method:'Native-scroll exact settled production hero poses; normal 1250ms entrance and clocks; three real models/part counts; actual 2048x2048 PCFSoft shadows; armed-only immediate current full-size default-framebuffer raw RGBA; real WebGL2 pre-drain/readback/production fences; repeated-pose stability. No quality/source/clock mutations.',
    limits:'Listed hero poses only. Raw framebuffer PNGs are the pixel oracle; viewport screenshots provide UI context. Readback runs and SwiftShader are not hardware performance benchmarks.',runs:[],comparisons:[],failures:[]};
  let browser;
  try{
    assert.ok(Number.isFinite(timeout)&&timeout>=1000,'Timeout must be finite and >=1000ms');
    const bases={candidate:baseURL(process.env.V2_BASE_URL,'V2_BASE_URL'),baseline:baseURL(process.env.V2_BASELINE_URL,'V2_BASELINE_URL')};
    assert.notEqual(bases.candidate,bases.baseline,'Baseline and candidate must be served independently');report.bases=bases;
    report.sources={baseline:await verifyServedSources(bases.baseline,'baseline'),candidate:await verifyServedSources(bases.candidate,'candidate')};
    const specs=modelSpecs();report.modelSpecs=specs;
    const args=process.env.V2_HERO_VISUAL_BROWSER_ARGS?JSON.parse(process.env.V2_HERO_VISUAL_BROWSER_ARGS):['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'];
    assert.ok(Array.isArray(args)&&args.every(arg=>typeof arg==='string'),'Browser args must be a JSON string array');report.browserArgs=args;
    const {chromium}=require('playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args});report.browserVersion=browser.version();
    for(const [index,device] of devices.entries()){
      const matched={};
      for(const variant of index%2?['candidate','baseline']:['baseline','candidate']){
        try{matched[variant]=await captureVariant(browser,bases[variant],variant,device,specs);report.runs.push(serializableRecord(matched[variant]));}
        catch(error){if(error.partialRecord)report.runs.push(serializableRecord(error.partialRecord));report.failures.push({device:device.name,variant,error:error.stack});}
        json('report.json',report);
      }
      if(!matched.baseline||!matched.candidate)continue;
      for(let p=0;p<poses.length;p++){
        const before=matched.baseline.captures[p],after=matched.candidate.captures[p],a=before.samples[0],b=after.samples[0];
        const comparison={device:device.name,pose:poses[p],baselineFile:a.file,candidateFile:b.file,baselineStable:before.stability.pass,candidateStable:after.stability.pass,metadataEqual:true};
        try{
          assert.deepEqual(after.target.requested,before.target.requested,'Identical native target pixel rounding');
          assert.deepEqual(b.facts.dimensions,a.facts.dimensions,'Identical actual drawing-buffer dimensions');
          const {width,height}=a.facts.dimensions,{difference,...metrics}=comparePixels(a.pixels,b.pixels,width,height);Object.assign(comparison,metrics);
          comparison.differenceFile=`${device.name}-${poses[p].name}-difference-x32.png`;
          fs.writeFileSync(path.join(output,comparison.differenceFile),pngRGBA(width,height,difference));
          for(const field of parityFields)assert.deepEqual(b.facts[field],a.facts[field],`Baseline/candidate exact ${field} parity`);
          comparison.pass=metrics.pass&&comparison.baselineStable&&comparison.candidateStable;
        }catch(error){comparison.metadataEqual=false;comparison.pass=false;comparison.error=error.stack;}
        report.comparisons.push(comparison);
        if(!comparison.pass)report.failures.push({device:device.name,pose:poses[p].name,error:comparison.error||'Raw pixel differences or repeat instability exceed the fixed strict tolerance'});
        console.log(`${comparison.pass?'PASS':'FAIL'} ${device.name} ${poses[p].name}: ${comparison.exact?'exact RGBA':JSON.stringify({changedPixels:comparison.changedPixels,maxDelta:comparison.maxChannelDelta,meanDelta:comparison.meanAbsoluteChannelDelta})}`);
      }
      json('report.json',report);
    }
    assert.equal(report.comparisons.length,devices.length*poses.length,'All twelve baseline/candidate pose comparisons must run');
    assert.deepEqual(report.failures,[],'Every hero pose, metadata/quality check and repeat must pass');report.status='passed';
  }catch(error){report.status='failed';report.fatal=error.stack;process.exitCode=1;console.error(error.stack);}
  finally{await browser?.close();report.finishedAt=new Date().toISOString();json('report.json',report);console.log(`Hero visual parity ${report.status}; evidence: ${output}`);}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

/* Same-runner visual acceptance against the accepted 5a50d2f baseline.
 * Serve two UNMODIFIED repository roots, then run:
 *   V2_BASE_URL=http://127.0.0.1:8080 V2_BASELINE_URL=http://127.0.0.1:8081 \
 *     V2_LOAD_VISUAL_OUT=/tmp/v2-load-visual node scripts/verify-v2-load-visual-parity.cjs
 *   node scripts/verify-v2-load-visual-parity.cjs --self-test
 * Requires Playwright; optional CHROMIUM_EXECUTABLE, V2_LOAD_VISUAL_TIMEOUT,
 * V2_LOAD_VISUAL_BROWSER_ARGS (JSON array). Default is CI SwiftShader, DPR 1.
 * No routing, source injection, material mutations, quality overrides, clock
 * freezing, or production edits. Only the existing opted-in selectedCapture
 * API is used to replay exact poses. Normal preparation must first finish all
 * six model and both composition fences. Full composition warm replays then
 * independently verify actual shadow allocation, including on the baseline
 * whose older preparation measurements do not expose shadow dimensions.
 *
 * Pixel evidence is raw RGBA gl.readPixels immediately after the full-quality
 * production draw in the SAME browser task. This avoids preserveDrawingBuffer
 * false clearing the buffer between draw and readback. readPixels waits for
 * those pixels; an additional real WebGL2 fence must complete after readback.
 * Each pose is captured twice to detect unstable output. PNGs preserve those
 * exact bytes (bottom-up GL rows flipped only); viewport screenshots provide
 * UI context but are not the pixel-difference oracle. Raw RGBA is premultiplied
 * when the production context reports premultipliedAlpha; no color conversion
 * or alpha unpremultiplication is used in the comparison.
 * This proves only the listed Selected poses, not whole-site visual parity or
 * hardware performance. Browser-blocked environments should run --self-test
 * and execute the actual browser comparison in Actions; never report it run.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baselineCommit = '5a50d2f336accccaf1577ad43f1465506bdbeb5c';
const output = path.resolve(process.env.V2_LOAD_VISUAL_OUT || '.codex-temp/v2-load-visual');
const timeout = Number(process.env.V2_LOAD_VISUAL_TIMEOUT || 180000);
const devices = [
  {name:'desktop1440', width:1440, height:900, touch:false},
  {name:'mobile390', width:390, height:844, touch:true},
  {name:'mobile320', width:320, height:740, touch:true},
];
const poses = [
  {name:'framework-exploded', progress:0},
  {name:'framework-assembled', progress:.311},
  {name:'transit-endpoint', progress:1},
];
const names = ['esp32','dual','pi','logic','metro','tramtrace'];
// Fixed, deliberately tight allowance: no pixel can differ by >2/255 in any
// channel, at most 0.1% of pixels may differ at all, and channel MAE <=0.001/255.
// No antialias exclusion, image registration, crop, blur, perceptual masking,
// or configurable threshold that can silently bless a quality regression.
const tolerance = Object.freeze({maxChannelDelta:2, changedPixelFraction:.001, meanAbsoluteChannelDelta:.001});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file, value) => fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n');

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
async function verifyServedSources(base, variant) {
  const files=['v2/index.html','assets/v2-selected-work.js','assets/v2-selected-scene.js',
    'assets/v2-selected-assets.js','assets/v2-hero-assets.js','assets/v2-hero-environment.js',
    'assets/v2-assembly.js','assets/v2-selected-work.css','assets/models/selected/manifest.json'];
  const records=[];
  for(const file of files){
    const expected=variant==='baseline'?execFileSync('git',['show',baselineCommit+':'+file],{cwd:root,maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,file));
    const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(timeout)});
    assert.ok(response.ok,`${variant} source unavailable: ${file} (${response.status})`);
    const actual=Buffer.from(await response.arrayBuffer()),record={file,expectedSHA256:sha(expected),servedSHA256:sha(actual)};
    records.push(record);assert.equal(record.servedSHA256,record.expectedSHA256,`${variant} server must serve the intended unmodified ${file}`);
  }
  return records;
}

async function waitForLive(page) {
  await page.waitForFunction(()=>{
    const root=document.querySelector('[data-selected-work]'),d=root?.dataset;
    if(d?.selectedError||['static','unavailable'].includes(d?.selectedState))throw Error('Selected unavailable: '+JSON.stringify({...d}));
    return window.__v2Selected && d?.selectedBackgroundReady==='true' && d.selectedState==='ready' &&
      d.selectedWarmMask==='false' && d.selectedGPUPending==='false' && !window.V2SelectedWork.isPreparing() &&
      Number(d.selectedFrames)>0 && Math.abs(Number(d.selectedProgress)-Number(d.selectedRenderedProgress))<.000003 &&
      JSON.parse(d.selectedInspectionWeights||'[]').length===4 && JSON.parse(d.selectedInspectionWeights).every(n=>n===0);
  },null,{timeout});
}
async function settleUI(page) {
  await page.evaluate(async budget=>{
    await document.fonts.ready;
    const selected=document.querySelector('[data-selected-work]');
    const images=[...document.images].filter(image=>{
      const b=image.getBoundingClientRect(),style=getComputedStyle(image);
      return image.hasAttribute('src')&&(selected.contains(image)||(b.width&&b.height&&b.bottom>0&&b.top<innerHeight&&style.visibility!=='hidden'));
    });
    for(const image of images){await image.decode();if(!image.complete||!image.naturalWidth)throw Error('Unsettled image: '+image.currentSrc);}
    const started=performance.now();let previous='',stableSince=performance.now();
    while(performance.now()-started<budget){
      const nodes=[selected,selected.querySelector('.v2-selected-stage'),selected.querySelector('[data-selected-canvas]')];
      const sample=JSON.stringify({scrollY,fontStatus:document.fonts.status,rects:nodes.map(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node);return[b.x,b.y,b.width,b.height,s.opacity,s.visibility];})});
      const moving=selected.getAnimations({subtree:true}).some(animation=>['running','pending'].includes(animation.playState)&&Number.isFinite(animation.effect?.getComputedTiming().endTime));
      if(sample!==previous||moving){previous=sample;stableSince=performance.now();}
      if(performance.now()-stableSince>=300)return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw Error('Selected layout or finite UI animations did not settle');
  },Math.min(timeout,15000));
}
async function preparationFacts(page) {
  const facts=await page.evaluate(()=>{
    const d=document.querySelector('[data-selected-work]').dataset;
    return{state:d.selectedBackgroundState,initialDrain:d.selectedInitialDrainState,
      models:(d.selectedPreparedModels||'').split(','),warmPoses:Number(d.selectedWarmPosesCompleted),
      records:JSON.parse(d.selectedPreparationMeasurements||'[]')};
  });
  assert.equal(facts.state,'ready','Natural preparation reached ready');
  assert.equal(facts.initialDrain,'complete','Natural initial GPU drain completed with a real fence');
  assert.deepEqual([...facts.models].sort(),[...names].sort(),'All six production model warm stages completed');
  assert.equal(facts.warmPoses,2,'Both production composition warm stages completed');
  for(const [kind,expected]of[['model',names],['composition',['0','1']]])for(const name of expected){
    const completed=facts.records.filter(record=>record.kind===kind&&record.name===name&&record.completed);
    assert.ok(completed.length>0,`Production ${kind}/${name} completed`);
    for(const record of completed)assert.equal(record.gpu?.state,'complete',`Production ${kind}/${name} had a real completion fence`);
  }
  return facts;
}

// This function is serialized by Playwright. It observes existing scene state;
// it never wraps production functions, changes renderer settings or makes its
// own scene. Production drawProgress/seekProgress choose the render settings.
async function browserDraw({progress,warm,readPixels,budget}) {
  const api=window.__v2Selected,renderer=api.renderer,gl=renderer.getContext();
  if(!renderer.capabilities.isWebGL2||typeof gl.fenceSync!=='function')throw Error('Real WebGL2 completion fences are required');
  if(gl.isContextLost())throw Error('Selected context is lost');
  async function fence(){
    const start=performance.now(),sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);let polls=0;
    if(!sync)throw Error('fenceSync returned null');gl.flush();
    try{
      while(performance.now()-start<budget){
        const status=gl.clientWaitSync(sync,0,0);polls++;
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return{state:'complete',polls,waitMs:performance.now()-start};
        if(status===gl.WAIT_FAILED||gl.isContextLost())throw Error('GPU completion failed');
        await new Promise(resolve=>setTimeout(resolve,4));
      }
      throw Error('GPU completion fence timed out');
    }finally{gl.deleteSync(sync);}
  }
  const preDrain=await fence();
  if(warm)api.drawProgress(progress,{warm:true});else api.seekProgress(progress);
  const dimensions={width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
  if(renderer.getRenderTarget()!==null||gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null)throw Error('Capture must read the production default framebuffer');
  let pixelData;
  if(readPixels){
    const rgba=new Uint8Array(dimensions.width*dimensions.height*4);
    gl.readPixels(0,0,dimensions.width,dimensions.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
    if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error during raw pixel readback');
    // Chunked conversion avoids argument-stack limits for megapixel buffers.
    const chunks=[];for(let i=0;i<rgba.length;i+=32768)chunks.push(String.fromCharCode(...rgba.subarray(i,i+32768)));
    pixelData=btoa(chunks.join(''));
  }
  const shadows=[];
  api.scene.traverse(node=>{if(node.isLight&&node.castShadow)shadows.push({type:node.type,mapSize:node.shadow.mapSize.toArray(),actualWidth:node.shadow.map?.width,actualHeight:node.shadow.map?.height,bias:node.shadow.bias,normalBias:node.shadow.normalBias,radius:node.shadow.radius});});
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),d=document.querySelector('[data-selected-work]').dataset;
  const facts={progress,warm,preDrain,dimensions,pixelRatio:renderer.getPixelRatio(),
    shadowEnabled:renderer.shadowMap.enabled,shadowType:renderer.shadowMap.type,expectedPCFSoftType:window.THREE.PCFSoftShadowMap,shadows,
    quality:{toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure,outputEncoding:renderer.outputEncoding,physicallyCorrectLights:renderer.physicallyCorrectLights},
    measurement:JSON.parse(d.selectedLastDraw),
    pose:{cameraPosition:api.camera.position.toArray(),cameraQuaternion:api.camera.quaternion.toArray(),projection:api.camera.projectionMatrix.toArray(),
      models:[...api.composition.objects].map(([name,entry])=>({name,visible:entry.wrapper.visible,matrix:entry.wrapper.matrixWorld.toArray()}))},
    environment:{three:window.THREE.REVISION,vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),
      unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
      contextAttributes:gl.getContextAttributes()},
    canvas:{width:renderer.domElement.width,height:renderer.domElement.height,clientWidth:renderer.domElement.clientWidth,clientHeight:renderer.domElement.clientHeight},
    inspectionWeights:JSON.parse(d.selectedInspectionWeights||'[]'),statistics:api.composition.stats()};
  facts.completion=await fence();
  return{facts,pixelData};
}
function assertFullQuality(facts,label) {
  assert.equal(facts.completion.state,'complete',label+': capture completion fence');
  assert.equal(facts.shadowEnabled,true,label+': shadows remain enabled');
  assert.equal(facts.shadowType,facts.expectedPCFSoftType,label+': PCFSoft filtering remains enabled');
  assert.ok(facts.shadows.length>0,label+': actual shadow-casting light exists');
  for(const shadow of facts.shadows){
    assert.deepEqual(shadow.mapSize,[1536,1536],label+': requested shadow size');
    assert.equal(shadow.actualWidth,1536,label+': actual allocated shadow width');
    assert.equal(shadow.actualHeight,1536,label+': actual allocated shadow height');
  }
  if(!facts.warm){
    assert.equal(facts.pixelRatio,1,label+': full DPR 1 rendering');
    assert.deepEqual(facts.dimensions,{width:facts.canvas.clientWidth,height:facts.canvas.clientHeight},label+': full-sized drawing buffer');
    assert.deepEqual(facts.inspectionWeights,[0,0,0,0],label+': exact uninspected overview pose');
  }
  assert.ok(facts.measurement.triangles>1000,label+': real scene geometry rendered');
}

async function captureVariant(browser,base,variant,device) {
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1,
    isMobile:device.touch,hasTouch:device.touch,reducedMotion:'no-preference',colorScheme:'light',locale:'en-GB',timezoneId:'UTC'});
  const page=await context.newPage(),errors=[],shaderErrors=[],record={variant,device:device.name,base,errors,shaderErrors,captures:[]};
  page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/Shader Error|Error compiling shader|THREE.WebGLProgram/.test(message.text()))shaderErrors.push(message.text());});
  const prefix=device.name+'-'+variant;
  try{
    const url=new URL('v2/?selectedCapture=1#work-framework',base);record.url=url.href;
    await page.goto(url.href,{waitUntil:'load'});await waitForLive(page);await settleUI(page);
    record.preparation=await preparationFacts(page);record.fullWarmReplays=[];
    for(const progress of [0,1]){
      const {facts}=await page.evaluate(browserDraw,{progress,warm:true,readPixels:false,budget:timeout});
      record.fullWarmReplays.push(facts);assertFullQuality(facts,`${prefix} full warm ${progress}`);
    }
    for(const pose of poses){
      await page.evaluate(progress=>{
        window.__v2Selected.resume();
        const stage=document.querySelector('.v2-selected-stage'),track=document.querySelector('.v2-selected-track');
        const top=parseFloat(getComputedStyle(stage).top)||0,distance=parseFloat(track.style.height)-stage.clientHeight;
        scrollTo({top:scrollY+track.getBoundingClientRect().top-top+distance*progress+(progress===0?-1:progress===1?1:0),behavior:'instant'});
      },pose.progress);
      await waitForLive(page);await settleUI(page);
      const samples=[];
      for(let repeat=0;repeat<2;repeat++){
        const result=await page.evaluate(browserDraw,{progress:pose.progress,warm:false,readPixels:true,budget:timeout});
        assertFullQuality(result.facts,`${prefix} ${pose.name}/${repeat}`);
        const {width,height}=result.facts.dimensions,pixels=topDown(Buffer.from(result.pixelData,'base64'),width,height);
        let visiblePixels=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visiblePixels++;
        assert.ok(visiblePixels>width*height*.01,'Capture must contain visible geometry, not a cleared/transparent framebuffer');
        const file=`${prefix}-${pose.name}${repeat?'-repeat':''}-canvas.png`;
        fs.writeFileSync(path.join(output,file),pngRGBA(width,height,pixels));
        samples.push({facts:result.facts,pixels,file,visiblePixels,sha256:sha(pixels)});
        if(!repeat)await settleUI(page);
      }
      const stability=comparePixels(samples[0].pixels,samples[1].pixels,samples[0].facts.dimensions.width,samples[0].facts.dimensions.height);
      const {difference,...stabilityMetrics}=stability;
      if(!stability.pass)fs.writeFileSync(path.join(output,`${prefix}-${pose.name}-instability.png`),pngRGBA(stability.width,stability.height,difference));
      const screenshot=`${prefix}-${pose.name}-viewport.png`;
      await page.screenshot({path:path.join(output,screenshot),timeout});
      record.captures.push({pose,screenshot,samples,stability:stabilityMetrics});
      console.log(`CAPTURE ${prefix} ${pose.name}: ${samples[0].facts.dimensions.width}x${samples[0].facts.dimensions.height}, repeat ${stability.exact?'exact':stability.pass?'within fixed tolerance':'FAILED'}`);
    }
    assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(shaderErrors,[],'No shader compilation errors');
    return record;
  }catch(error){
    record.failure=error.stack;
    record.diagnostic=await page.evaluate(()=>({url:location.href,scrollY,selected:{...document.querySelector('[data-selected-work]')?.dataset}})).catch(()=>null);
    await page.screenshot({path:path.join(output,prefix+'-failure.png'),timeout:15000}).catch(()=>{});
    throw Object.assign(error,{partialRecord:record});
  }finally{
    // Raw pixels are kept only in memory/PNG, never expanded into the JSON.
    json(prefix+'.json',serializableRecord(record));await context.close();
  }
}
function serializableRecord(record) {
  return{...record,captures:record.captures.map(capture=>({...capture,samples:capture.samples.map(({pixels,...sample})=>sample)}))};
}

function selfTest() {
  const exact=Buffer.alloc(40000,128);assert.equal(comparePixels(exact,exact,100,100).pass,true);
  const tiny=Buffer.from(exact);tiny[0]++;assert.equal(comparePixels(exact,tiny,100,100).pass,true);
  const large=Buffer.from(exact);large[0]+=3;assert.equal(comparePixels(exact,large,100,100).pass,false,'A >2/255 pixel is never ignored');
  const broad=Buffer.from(exact);for(let i=0;i<100;i++)broad[i*4]++;assert.equal(comparePixels(exact,broad,100,100).pass,false,'Broad 1/255 changes fail');
  const alpha=Buffer.from(exact);alpha[3]+=3;const delta=comparePixels(exact,alpha,100,100);assert.equal(delta.pass,false);assert.equal(delta.difference[0],96,'Alpha-only changes are visible');
  assert.deepEqual(topDown(Buffer.from([1,2,3,4,5,6,7,8]),1,2),Buffer.from([5,6,7,8,1,2,3,4]));
  const png=pngRGBA(1,2,Buffer.from([1,2,3,4,5,6,7,8]));let offset=8;const blocks=[];
  while(offset<png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);assert.equal(png.readUInt32BE(offset+8+size),crc32(png.subarray(offset+4,offset+8+size)));if(type==='IDAT')blocks.push(data);offset+=12+size;}
  assert.deepEqual(zlib.inflateSync(Buffer.concat(blocks)),Buffer.from([0,1,2,3,4,0,5,6,7,8]));
  assert.equal(baseURL('http://localhost:8080/v2/','test'),'http://localhost:8080/');
  console.log('PASS: strict RGBA comparator, alpha differences, row order and lossless PNG encoding. No browser/GPU result claimed.');
}
async function main() {
  if(process.argv.includes('--self-test'))return selfTest();
  fs.mkdirSync(output,{recursive:true});
  const report={baselineCommit,startedAt:new Date().toISOString(),status:'running',devices,poses,tolerance,
    method:'Matched same-browser-runner contexts; completed production preparation, actual 1536x1536 PCFSoft allocations, exact capture API poses, immediate raw default-framebuffer RGBA, real WebGL2 completion fences, repeated-pose stability; no source or quality patches.',
    limits:'Selected Work only. PNGs are raw framebuffer RGBA; viewport screenshots are context evidence, not a screenshot-difference gate. SwiftShader is not a hardware performance benchmark.',runs:[],comparisons:[],failures:[]};
  let browser;
  try{
    assert.ok(Number.isFinite(timeout)&&timeout>=1000,'Timeout must be finite and at least 1000ms');
    const bases={candidate:baseURL(process.env.V2_BASE_URL,'V2_BASE_URL'),baseline:baseURL(process.env.V2_BASELINE_URL,'V2_BASELINE_URL')};
    assert.notEqual(bases.candidate,bases.baseline,'Candidate and baseline must be served independently');report.bases=bases;
    report.sources={baseline:await verifyServedSources(bases.baseline,'baseline'),candidate:await verifyServedSources(bases.candidate,'candidate')};
    const args=process.env.V2_LOAD_VISUAL_BROWSER_ARGS?JSON.parse(process.env.V2_LOAD_VISUAL_BROWSER_ARGS):['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'];
    assert.ok(Array.isArray(args)&&args.every(arg=>typeof arg==='string'),'Browser args must be a JSON string array');report.browserArgs=args;
    const {chromium}=require('playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args});report.browserVersion=browser.version();
    for(const [index,device]of devices.entries()){
      const matched={};
      // Alternate pair order; each visit still owns a fresh isolated context.
      for(const variant of index%2?['candidate','baseline']:['baseline','candidate']){
        try{matched[variant]=await captureVariant(browser,bases[variant],variant,device);report.runs.push(serializableRecord(matched[variant]));}
        catch(error){if(error.partialRecord)report.runs.push(serializableRecord(error.partialRecord));report.failures.push({device:device.name,variant,error:error.stack});}
        json('report.json',report);
      }
      if(!matched.baseline||!matched.candidate)continue;
      for(let p=0;p<poses.length;p++){
        const before=matched.baseline.captures[p],after=matched.candidate.captures[p],a=before.samples[0],b=after.samples[0];
        const comparison={device:device.name,pose:poses[p],baselineFile:a.file,candidateFile:b.file,baselineStable:before.stability.pass,candidateStable:after.stability.pass,metadataEqual:true};
        try{
          assert.deepEqual(b.facts.dimensions,a.facts.dimensions,'Baseline/candidate drawing-buffer dimensions');
          const {width,height}=a.facts.dimensions,{difference,...metrics}=comparePixels(a.pixels,b.pixels,width,height);
          Object.assign(comparison,metrics);
          comparison.differenceFile=`${device.name}-${poses[p].name}-difference-x32.png`;
          fs.writeFileSync(path.join(output,comparison.differenceFile),pngRGBA(width,height,difference));
          for(const field of ['pixelRatio','shadows','shadowEnabled','shadowType','quality','pose','environment','canvas','statistics'])assert.deepEqual(b.facts[field],a.facts[field],`Baseline/candidate ${field} parity`);
          comparison.pass=metrics.pass&&comparison.baselineStable&&comparison.candidateStable;
        }catch(error){comparison.metadataEqual=false;comparison.pass=false;comparison.error=error.stack;}
        report.comparisons.push(comparison);
        if(!comparison.pass)report.failures.push({device:device.name,pose:poses[p].name,error:comparison.error||'Raw pixel difference or repeat instability exceeds fixed tolerance'});
        console.log(`${comparison.pass?'PASS':'FAIL'} ${device.name} ${poses[p].name}: ${comparison.exact?'exact RGBA':JSON.stringify({changedPixels:comparison.changedPixels,maxDelta:comparison.maxChannelDelta,meanDelta:comparison.meanAbsoluteChannelDelta})}`);
      }
      json('report.json',report);
    }
    assert.equal(report.comparisons.length,devices.length*poses.length,'All nine baseline/candidate pose comparisons must run');
    assert.deepEqual(report.failures,[],'Visual parity must pass every pose, quality check and repeated capture');
    report.status='passed';
  }catch(error){report.status='failed';report.fatal=error.stack;process.exitCode=1;console.error(error.stack);}
  finally{await browser?.close();report.finishedAt=new Date().toISOString();json('report.json',report);console.log(`Visual parity ${report.status}; evidence: ${output}`);}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

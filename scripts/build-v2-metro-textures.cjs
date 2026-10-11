#!/usr/bin/env node
/* One controlled Selected-only texture attribution: unchanged native SVG raster
 * -> lossless PNG, then direct initTexture timing on the same Chromium runner.
 * No original SVG, model pack, factory, runtime or project file is rewritten.
 * --check validates sources without Playwright. Actual production scene warm
 * draws are measured separately by the paired browser acceptance workflow.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=(process.env.V2_BASE_URL||'http://127.0.0.1:8080').replace(/\/$/,''),output=path.resolve(process.env.V2_METRO_TEXTURE_OUT||'/tmp/v2-metro-textures');
const width=2010,height=2048,hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const variants=['front','back'].map(side=>({side,source:'/assets/models/hardware/metroboard/silk-'+side+'.svg',url:'/assets/models/selected/metro-silk-'+side+'.png',file:'selected/metro-silk-'+side+'.png'}));
const inputs=['scripts/build-v2-metro-textures.cjs','assets/vendor/three.min.js','assets/models/selected/metro.idx.bin.gz',...variants.map(item=>item.source.slice(1))];
const sourceHashes=()=>Object.fromEntries(inputs.map(file=>{const bytes=fs.readFileSync(path.join(root,file));return[file,{bytes:bytes.length,sha256:hash(bytes)}];}));
function sourceChecks(){
  assert(!output.startsWith(path.join(root,'assets')+path.sep),'Artifact output must not be production assets');
  for(const item of variants){const svg=fs.readFileSync(path.join(root,item.source),'utf8');assert.match(svg,/<svg[\s\S]*?\bwidth="2010"\s+height="2048"/,'Original SVG natural dimensions must remain2010x2048');}
  const transported=zlib.gunzipSync(fs.readFileSync(path.join(root,'assets/models/selected/metro.idx.bin.gz'))),pack=transported.toString('ascii',0,7)==='V2HIDX1'?transported.subarray(16):transported;
  assert.equal(pack.toString('ascii',0,7),'V2HERO1');const header=JSON.parse(pack.subarray(16,16+pack.readUInt32LE(8)).toString());
  for(const item of variants){const texture=header.textures.find(texture=>texture.url===item.source);assert(texture,'Original packed texture metadata: '+item.side);assert.equal(texture.width,width);assert.equal(texture.height,height);item.properties=texture.properties;}
  sourceHashes();
}
function rasterize(items){
  return Promise.all(items.map(async item=>{
    const source=new Image();source.crossOrigin='anonymous';const loaded=new Promise((resolve,reject)=>{source.onload=resolve;source.onerror=reject;});source.src=item.source;await loaded;await source.decode();
    if(source.naturalWidth!==2010||source.naturalHeight!==2048)throw new Error('Unexpected source natural dimensions');
    const canvas=document.createElement('canvas');canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});const started=performance.now();context.drawImage(source,0,0);const rasterMs=performance.now()-started;
    const original=context.getImageData(0,0,canvas.width,canvas.height).data,png=canvas.toDataURL('image/png'),decoded=new Image();
    const ready=new Promise((resolve,reject)=>{decoded.onload=resolve;decoded.onerror=reject;});decoded.src=png;await ready;await decoded.decode();
    if(decoded.naturalWidth!==source.naturalWidth||decoded.naturalHeight!==source.naturalHeight)throw new Error('PNG natural dimensions changed');
    context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(decoded,0,0);const restored=context.getImageData(0,0,canvas.width,canvas.height).data;
    let differingRGBComponents=0,differingAlphaPixels=0,maxRGBError=0,maxAlphaError=0,visiblePixels=0;
    for(let i=0;i<original.length;i++){const error=Math.abs(original[i]-restored[i]);if(i%4===3){if(original[i])visiblePixels++;if(error)differingAlphaPixels++;maxAlphaError=Math.max(maxAlphaError,error);}else{if(error)differingRGBComponents++;maxRGBError=Math.max(maxRGBError,error);}}
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return {...item,png,width:canvas.width,height:canvas.height,rasterMs,pixelParity:{rgbaBytes:original.byteLength,sourceRgbaSha256:await digest(original),pngRgbaSha256:await digest(restored),differingRGBComponents,differingAlphaPixels,maxRGBError,maxAlphaError,visiblePixels}};
  }));
}
function installHelpers(){
  const T=window.THREE;
  window.__decodeTextureProperty=value=>{
    if(value===null||typeof value!=='object')return value;
    if(value.$type==='Number')return Number(value.value);
    if(value.$type)return new T[value.$type]().fromArray(value.value);
    if(Array.isArray(value))return value.map(window.__decodeTextureProperty);
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,window.__decodeTextureProperty(item)]));
  };
  window.__uploadTexture=(renderer,texture)=>{
    const gl=renderer.getContext();gl.finish();
    const start=performance.now();renderer.initTexture(texture);const submitted=performance.now();gl.finish();const completed=performance.now();
    return {submissionMs:submitted-start,gpuCompletedMs:completed-start,finishWaitMs:completed-submitted};
  };
}
async function createPage(browser,format){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  for(const item of variants)await page.route(base+item.url,route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(output,item.file))}));
  await page.route(base+'/__v2_metro_texture_build__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><base href="/"><link rel="icon" href="data:,"><title>Metro original texture attribution</title>'}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.goto(base+'/__v2_metro_texture_build__',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:base+'/assets/vendor/three.min.js'});await page.evaluate(installHelpers);
  return {context,page,errors,format};
}
async function uploadSample(browser,format,iteration){
  const run=await createPage(browser,format);
  try{
    const sample=await run.page.evaluate(async ({items,format,iteration})=>{
      const T=window.THREE,renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setSize(8,8,false);
      if(typeof renderer.initTexture!=='function')throw new Error('Official Three renderer.initTexture is required');
      const textures=[],decode=[];
      for(const item of items){const bitmap=new Image();bitmap.crossOrigin='anonymous';const start=performance.now(),ready=new Promise((resolve,reject)=>{bitmap.onload=resolve;bitmap.onerror=reject;});bitmap.src=format==='svg'?item.source:item.url;await ready;const loaded=performance.now();await bitmap.decode();decode.push({side:item.side,loadMs:loaded-start,decodeMs:performance.now()-loaded,naturalWidth:bitmap.naturalWidth,naturalHeight:bitmap.naturalHeight});
        const texture=new T.Texture(bitmap);Object.assign(texture,window.__decodeTextureProperty(item.properties));texture.needsUpdate=true;textures.push({side:item.side,texture});}
      const first=textures.map(({side,texture})=>({side,...window.__uploadTexture(renderer,texture)}));
      const cached=textures.map(({side,texture})=>({side,...window.__uploadTexture(renderer,texture)}));
      const result={format,iteration,decode,first,cached,firstGpuCompletedTotalMs:first.reduce((sum,item)=>sum+item.gpuCompletedMs,0),webgl2:renderer.capabilities.isWebGL2,threeRevision:T.REVISION,context:renderer.getContext().getContextAttributes()};
      textures.forEach(({texture})=>texture.dispose());renderer.dispose();renderer.forceContextLoss();return result;
    },{items:variants,format,iteration});
    assert.deepEqual(run.errors,[],'Upload-only fixture errors');for(const image of sample.decode){assert.equal(image.naturalWidth,width);assert.equal(image.naturalHeight,height);}return sample;
  }finally{await run.context.close();}
}
async function main(){
  sourceChecks();if(process.argv.includes('--check')){console.log(JSON.stringify({checked:'Original native SVG dimensions, exact packed texture properties and source files',width,height,sources:sourceHashes()},null,2));return;}
  const sources=sourceHashes();fs.mkdirSync(path.join(output,'selected'),{recursive:true});const {chromium}=require('playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext(),page=await context.newPage();
    // Isolate rasterization from all production startup, controllers and CAD.
    await page.route(base+'/__v2_metro_raster__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><base href="/"><link rel="icon" href="data:"><title>Native Metro raster proof</title>'}));await page.goto(base+'/__v2_metro_raster__',{waitUntil:'domcontentloaded'});
    const raster=await page.evaluate(rasterize,variants),textures=[];
    for(const item of raster){
      assert.equal(item.width,width);assert.equal(item.height,height);assert.equal(item.pixelParity.maxRGBError,0,'Every PNG RGB component equals original SVG native raster');assert.equal(item.pixelParity.maxAlphaError,0,'Every PNG alpha equals original SVG native raster');assert.equal(item.pixelParity.sourceRgbaSha256,item.pixelParity.pngRgbaSha256);
      const bytes=Buffer.from(item.png.split(',')[1],'base64');fs.writeFileSync(path.join(output,item.file),bytes);const source=fs.readFileSync(path.join(root,item.source));const {png,...metadata}=item;textures.push({...metadata,bytes:bytes.length,gzipBytes:zlib.gzipSync(bytes,{level:9}).length,sha256:hash(bytes),sourceBytes:source.length,sourceGzipBytes:zlib.gzipSync(source,{level:9}).length,sourceSha256:hash(source)});
    }
    await context.close();
    const manifest={format:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),browser:browser.version(),playwright:require('playwright/package.json').version,renderer:'Chromium SwiftShader',method:'Original SVG drawImage at native2010x2048 to browser PNG; zero RGBA differences after PNG decode',sources,textures,sourceFilesUnchanged:true};
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    const samples=[];for(let iteration=0;iteration<3;iteration++)for(const format of iteration%2?['png','svg']:['svg','png']){console.log('Direct GPU-completed texture upload:',format,iteration);samples.push(await uploadSample(browser,format,iteration));}
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],svgMedian=median(samples.filter(sample=>sample.format==='svg').map(sample=>sample.firstGpuCompletedTotalMs)),pngMedian=median(samples.filter(sample=>sample.format==='png').map(sample=>sample.firstGpuCompletedTotalMs));
    const benchmark={method:'Fresh isolated browser context+WebGL renderer per sample; original packed texture properties; image load/decode separated; initTexture submission and GPU-completed gl.finish timings; repeated call measures already-resident path. No mesh draw or shader compilation in upload-only samples.',caveat:'Software renderer attribution on this runner, not a real-device performance claim.',samples,summary:{svgMedianFirstGpuCompletedMs:svgMedian,pngMedianFirstGpuCompletedMs:pngMedian,speedup:svgMedian/pngMedian,pngReductionFraction:1-pngMedian/svgMedian}};
    assert.deepEqual(sourceHashes(),sources,'All originals remain unchanged');fs.writeFileSync(path.join(output,'texture-upload-benchmark.json'),JSON.stringify(benchmark,null,2)+'\n');console.log(JSON.stringify({output,textures:textures.map(({side,bytes,gzipBytes,pixelParity})=>({side,bytes,gzipBytes,pixelParity})),uploadSummary:benchmark.summary},null,2));
  }finally{await browser.close();assert.deepEqual(sourceHashes(),sources,'No source files changed');}
}
module.exports={sourceChecks};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

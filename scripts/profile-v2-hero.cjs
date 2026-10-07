/* Cold-cache hero timing with a controlled 10 Mbps / 40 ms connection.
 * Run with the static site at V2_BASE_URL (default http://127.0.0.1:8080),
 * CHROMIUM_EXECUTABLE, and optional HERO_PROFILE_OUT / HERO_PROFILE_RUNS.
 * HERO_PROFILE_GZIP=1 serves an isolated compressed fixture on port 8188;
 * use it for fair before/after comparison. HERO_PROFILE_ROOT can point to an
 * immutable baseline snapshot. HERO_EXPECT_PACKS=1 rejects source fallback
 * and verifies the prepared environment; leave it unset for old baselines.
 * SwiftShader makes GPU/compile durations machine-specific; compare runs on
 * the same host. Readiness is observed after the first successful CAD render,
 * not merely after download. Long-task timing includes parsing and rendering. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const http=require('node:http');
const zlib=require('node:zlib');
const {chromium}=require('playwright');

const gzipFixture=process.env.HERO_PROFILE_GZIP==='1';
const fixtureRoot=path.resolve(process.env.HERO_PROFILE_ROOT||process.cwd());
const base=gzipFixture?'http://127.0.0.1:8188':process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const out=process.env.HERO_PROFILE_OUT||'.codex-temp/hero-performance/profile.json';
const runs=Math.max(1,Number(process.env.HERO_PROFILE_RUNS)||1);
const network={latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
const isModel=url=>/\.(?:glb|gltf|stl|bin)(?:\.gz)?(?:\?|$)/i.test(url)||/\/models\/.*\.json(?:\?|$)/i.test(url);
const round=n=>Math.round(n*10)/10;

async function profile(browser,index){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[],warnings=[],requests=new Map();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,...network});
  let navigationTimestamp;
  cdp.on('Network.requestWillBeSent',event=>{
    if(event.type==='Document'&&event.request.url.includes('/v2/')) navigationTimestamp=event.timestamp;
    requests.set(event.requestId,{url:event.request.url,type:event.type,start:event.timestamp});
  });
  cdp.on('Network.responseReceived',event=>{
    const record=requests.get(event.requestId);
    if(record) Object.assign(record,{status:event.response.status,cache:Boolean(event.response.fromDiskCache||event.response.fromServiceWorker),response:event.timestamp,encoding:Object.entries(event.response.headers).find(([name])=>name.toLowerCase()==='content-encoding')?.[1]||'identity'});
  });
  cdp.on('Network.loadingFinished',event=>{
    const record=requests.get(event.requestId);
    if(record) Object.assign(record,{end:event.timestamp,bytes:event.encodedDataLength});
  });
  cdp.on('Network.loadingFailed',event=>{
    const record=requests.get(event.requestId);
    if(record) Object.assign(record,{error:event.errorText,end:event.timestamp});
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='warning'||message.type()==='error') warnings.push(message.text());});
  await page.addInitScript(()=>{
    const metrics=window.__heroProfile={posterMs:null,posterFramesMs:null,loadingAnimationMs:null,firstCadMs:null,leadCadMs:null,allCadMs:null,models:{},loads:[],longTasks:[],maxDraws:0};
    new PerformanceObserver(list=>{for(const entry of list.getEntries()) metrics.longTasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});
    for(const key of ['V2AssemblyModels','V2HeroAssets']) {
    let factory;
    Object.defineProperty(window,key,{configurable:true,get:()=>factory,set:value=>{
      const original=value.load;
      const load=async function(name,...args){
        const record={factory:key,startMs:performance.now()};
        metrics.loads.push({name,...record});
        try{
          const model=await original.call(this,name,...args);
          Object.assign(record,{factoryReadyMs:performance.now(),parts:model.parts.length,meshes:0,triangles:0,vertices:0});
          model.group.traverse(object=>{
            if(!object.isMesh||!object.geometry?.attributes.position) return;
            record.meshes++;
            record.vertices+=object.geometry.attributes.position.count;
            record.triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;
          });
          metrics.models[name]=record;
          return model;
        }catch(error){record.error=String(error);throw error;}
      };
      factory={...value,load};
    }});
    }
    let root;
    const inspect=()=>{
      root ||= document.querySelector('[data-assembly]');
      if(!root) return;
      const now=performance.now();
      if(metrics.posterFramesMs===null&&Number(root.dataset.assemblyFrames)>0) metrics.posterFramesMs=now;
      if(metrics.loadingAnimationMs===null&&Number(root.dataset.heroLoadingFrames)>0) metrics.loadingAnimationMs=now;
      if(metrics.firstCadMs===null&&Number(root.dataset.assemblyModelsReady)>0){metrics.firstCadMs=now;metrics.firstModel=root.dataset.assemblyFirstModel;metrics.firstCadDraws=Number(root.dataset.assemblyDraws);}
      if(metrics.leadCadMs===null&&document.querySelector('[data-assembly-posters] img')?.dataset.assemblyModelState==='ready') metrics.leadCadMs=now;
      if(metrics.allCadMs===null&&Number(root.dataset.assemblyModelsReady)===3) metrics.allCadMs=now;
      metrics.maxDraws=Math.max(metrics.maxDraws,Number(root.dataset.assemblyDraws)||0);
    };
    new MutationObserver(inspect).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-assembly-models-ready','data-assembly-model-state','data-assembly-frames','data-hero-loading-frames']});
    const posterPaint=()=>{
      const poster=document.querySelector('[data-assembly-posters] img');
      if(poster?.naturalWidth){
        const style=getComputedStyle(poster),box=poster.getBoundingClientRect();
        if(style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.5&&box.bottom>0&&box.top<innerHeight){metrics.posterMs=performance.now();return;}
      }
      requestAnimationFrame(posterPaint);
    };
    requestAnimationFrame(posterPaint);
  });
  try{
    await page.goto(base+'/v2/',{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>document.querySelector('[data-assembly]')?.dataset.assemblyModelsSettled==='3',null,{timeout:180000});
    await page.waitForFunction(()=>window.__heroProfile.allCadMs!==null,null,{timeout:15000});
    // Read at a stable frame, allowing the long-task observer to deliver the
    // final render task. This does not add to recorded readiness times.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const measured=await page.evaluate(()=>({
      ...window.__heroProfile,
      navigation:performance.getEntriesByType('navigation')[0].toJSON(),
      paints:performance.getEntriesByType('paint').map(entry=>({name:entry.name,ms:entry.startTime})),
      resources:performance.getEntriesByType('resource').map(entry=>({url:entry.name,encodedBodyBytes:entry.encodedBodySize,decodedBodyBytes:entry.decodedBodySize})),
      state:document.querySelector('[data-assembly]').dataset.assemblyState,
      environment:document.querySelector('[data-assembly]').dataset.assemblyEnvironment,
      draws:Number(document.querySelector('[data-assembly]').dataset.assemblyDraws),
      renderer:navigator.userAgent,
    }));
    const decodedGzipSizes=new Map();
    // Resource Timing only decodes HTTP Content-Encoding, while the packed
    // hero intentionally downloads an explicit .gz file then decompresses it.
    // Gzip's ISIZE footer gives that payload size without timing a second
    // decompression or confusing compressed file bytes with CAD bytes.
    for(const [requestId,record] of requests){
      if(!/\.bin\.gz(?:\?|$)/.test(record.url)||record.status!==200) continue;
      const response=await cdp.send('Network.getResponseBody',{requestId});
      const body=Buffer.from(response.body,response.base64Encoded?'base64':'utf8');
      if(body.length>=18&&body[0]===31&&body[1]===139) decodedGzipSizes.set(record.url,body.readUInt32LE(body.length-4));
    }
    const transferred=[...requests.values()].filter(record=>record.end&&record.bytes).map(record=>({
      url:new URL(record.url).pathname,type:record.type,status:record.status,cache:record.cache,encoding:record.encoding,
      startMs:round((record.start-navigationTimestamp)*1000),responseMs:round((record.response-navigationTimestamp)*1000),endMs:round((record.end-navigationTimestamp)*1000),bytes:record.bytes,
      encodedBodyBytes:measured.resources.find(resource=>resource.url===record.url)?.encodedBodyBytes||0,
      decodedBodyBytes:measured.resources.find(resource=>resource.url===record.url)?.decodedBodyBytes||0,
      decodedPayloadBytes:decodedGzipSizes.get(record.url)||measured.resources.find(resource=>resource.url===record.url)?.decodedBodyBytes||0,
    }));
    const modelRequests=transferred.filter(record=>isModel(record.url));
    const firstCadLongTasks=measured.longTasks.filter(task=>task.start<measured.firstCadMs);
    const result={run:index,...measured,errors,warnings:[...new Set(warnings)],transfer:{
      totalBytes:transferred.reduce((sum,record)=>sum+record.bytes,0),
      modelBytes:modelRequests.reduce((sum,record)=>sum+record.bytes,0),
      modelDecodedBytes:modelRequests.reduce((sum,record)=>sum+record.decodedPayloadBytes,0),
      modelHttpDecodedBytes:modelRequests.reduce((sum,record)=>sum+record.decodedBodyBytes,0),
      modelBytesBeforeFirstCad:modelRequests.filter(record=>record.endMs<=measured.firstCadMs).reduce((sum,record)=>sum+record.bytes,0),
      modelRequests,scriptRequests:transferred.filter(record=>/\.js$/.test(record.url)),
      textureRequests:transferred.filter(record=>/silk(?:-front|-back)?\.svg$/.test(record.url)),
    },blocking:{
      longTaskCount:measured.longTasks.length,
      longTaskTotalMs:round(measured.longTasks.reduce((sum,task)=>sum+task.duration,0)),
      maxLongTaskMs:round(Math.max(0,...measured.longTasks.map(task=>task.duration))),
      totalBlockingTimeBeforeFirstCadMs:round(firstCadLongTasks.reduce((sum,task)=>sum+Math.max(0,Math.min(task.duration,measured.firstCadMs-task.start)-50),0)),
    }};
    assert.deepEqual(errors,[],'Hero must not produce uncaught JavaScript errors');
    assert.equal(measured.state,'ready');
    assert.ok(measured.posterMs!==null&&measured.firstCadMs!==null&&measured.leadCadMs!==null&&measured.allCadMs!==null,'Poster, lead CAD, and all CAD must become visible');
    assert.ok(modelRequests.every(record=>!record.cache),'Profile must not use cached model responses');
    if(process.env.HERO_EXPECT_PACKS==='1'){
      assert.equal(Object.keys(measured.models).length,3,'All three packed models must load');
      assert.ok(Object.values(measured.models).every(model=>model.factory==='V2HeroAssets'),'Measurements must use ready packs rather than silently falling back to original source parsing');
      assert.equal(measured.environment,'prepared','Measurements must use the identical prepared lighting instead of silently rebuilding it');
      assert.ok(measured.loadingAnimationMs>0&&measured.loadingAnimationMs<measured.firstCadMs,'The interactive loading animation must start before CAD is ready');
    }
    return result;
  }finally{await context.close();}
}

(async()=>{
  // Optional fixture uses the same compression path for both baseline and new
  // assets. This avoids overstating savings against Python's uncompressed HTTP.
  const fixture=gzipFixture?http.createServer((request,response)=>{
    const filename=path.resolve(fixtureRoot,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if(!filename.startsWith(fixtureRoot+path.sep)){response.writeHead(403);response.end();return;}
    fs.readFile(filename,(error,body)=>{
      if(error){response.writeHead(404);response.end();return;}
      const ext=path.extname(filename).toLowerCase();
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'}[ext]||'application/octet-stream';
      const headers={'Content-Type':mime,'Cache-Control':'no-store'};
      if(/\.(?:html|js|css|json|glb|gltf|stl|bin|svg)$/.test(filename)){body=zlib.gzipSync(body);headers['Content-Encoding']='gzip';}
      headers['Content-Length']=body.length;response.writeHead(200,headers);response.end(body);
    });
  }):null;
  if(fixture) await new Promise(resolve=>fixture.listen(8188,'127.0.0.1',resolve));
  let browser;
  const results=[];
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for(let index=1;index<=runs;index++) results.push(await profile(browser,index));
  }finally{if(browser) await browser.close();if(fixture) await new Promise(resolve=>fixture.close(resolve));}
  let revision='unknown';
  try{revision=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
  if(process.env.HERO_PROFILE_REVISION) revision=process.env.HERO_PROFILE_REVISION;
  const data={capturedAt:new Date().toISOString(),revision,url:base+'/v2/',viewport:{width:1440,height:1000},network,cache:'disabled',gzipFixture,renderer:'Chromium SwiftShader software WebGL',caveats:[
    'Readiness is the first successful physical CAD render observed through DOM attributes; posterMs is the first decoded lead poster eligible for paint observed at requestAnimationFrame. First-contentful-paint is reported separately; compositor presentation can occur later.',
    'Software WebGL makes absolute compile/render timings host-specific. Compare cold runs on the same machine and avoid other rendering jobs.',
    'Encoded bytes include response headers. Use HERO_PROFILE_GZIP=1 for the identical compressed local fixture on both baseline and after; CDN gzip may differ slightly.',
    'Model transfer totals include geometry, prepared lighting and model manifests; source posters and JavaScript are separate from model bytes.',
    'Explicit .bin.gz payloads use the gzip ISIZE footer for modelDecodedBytes; modelHttpDecodedBytes is the Resource Timing size before application-level decompression.',
  ],runs:results};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({output:out,runs:results.map(r=>({run:r.run,posterMs:round(r.posterMs),loadingAnimationMs:r.loadingAnimationMs===null?null:round(r.loadingAnimationMs),environment:r.environment,firstContentfulPaintMs:r.paints.find(paint=>paint.name==='first-contentful-paint')?.ms,firstModel:r.firstModel,firstCadMs:round(r.firstCadMs),leadCadMs:round(r.leadCadMs),allCadMs:round(r.allCadMs),modelBytes:r.transfer.modelBytes,modelDecodedBytes:r.transfer.modelDecodedBytes,draws:r.draws,maxDraws:r.maxDraws,blocking:r.blocking,models:r.models}))},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});

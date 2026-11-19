'use strict';
const {chromium}=require('playwright'), fs=require('node:fs'), path=require('node:path'), http=require('node:http'), zlib=require('node:zlib'), assert=require('node:assert/strict');
const [base,candidate,out,widthArg]=process.argv.slice(2);
if(!base||!candidate||!out||!widthArg)throw new Error('Usage: node fleet-cold.cjs BASE_DIR CANDIDATE_DIR OUT_DIR WIDTH');
const width=Number(widthArg),height=width===390?844:900, route='/v2/projects/skylabs/?fleet-capture';
const repeat=Number(process.env.FLEET_RUNS||3), settle=1500, throttle={offline:false,latency:40,downloadThroughput:10e6/8,uploadThroughput:10e6/8,connectionType:'wifi'};
const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.gz':'application/octet-stream','.bin':'application/octet-stream','.glb':'model/gltf-binary'};
async function host(dir){
 const root=path.resolve(dir), files=new Map();
 const s=http.createServer((req,res)=>{
  try{
   let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
   if(p!==root&&!p.startsWith(root+path.sep))return res.writeHead(403).end();
   if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');
   if(!files.has(p)){
    const ext=path.extname(p), b=fs.readFileSync(p), compressed=/^\.(html|js|css|json|svg)$/.test(ext);
    files.set(p,[compressed?zlib.gzipSync(b):b,ext,compressed]);
   }
   const [body,ext,gzip]=files.get(p);res.writeHead(200,{'Content-Type':type[ext]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(body);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>s.listen(0,'127.0.0.1',r));return {s,url:'http://127.0.0.1:'+s.address().port};
}
function init(mode){
 if(mode==='save-data')Object.defineProperty(navigator,'connection',{value:Object.assign(new EventTarget(),{saveData:true})});
 if(mode==='no-gl'){const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:fn.call(this,kind,...args);};}
 const state=window.__fleetBench={paint:[],lcp:[],target:null,scrollMs:null,first:null,aimMs:null,gpuMs:null,visibleMs:null};
 for(const [type,key] of [['paint','paint'],['largest-contentful-paint','lcp']]){
  new PerformanceObserver(l=>{for(const e of l.getEntries())state[key].push({ms:e.startTime,name:e.name,url:e.url||null,tag:e.element?.tagName||null});}).observe({type,buffered:true});
 }
 const observe=()=>{
  const fleet=document.querySelector('[data-skylabs-fleet]');
  if(!fleet)return;
  const inspect=()=>{
   if(state.first||state.scrollMs===null||state.target===null)return;
   const api=window.__skylabsFleet,r=api?.renderer,p=Number(fleet.dataset.fleetProgress);
   if(!r||!Number.isFinite(p)||Math.abs(p-state.target)>.025||r.info.render.calls<1||
       !r.info.render.triangles||!r.info.render.frame)return;
   const g=r.getContext(),camera=api.camera,names=['fleet-trainer','fleet-competition'];
   if(!g||g.isContextLost())return;
   const vectors=names.map(name=>{
    const o=api.scene.getObjectByName(name);
    if(!o?.visible)return null;
    const v=camera.position.clone();o.getWorldPosition(v);v.project(camera);
    return [v.x,v.y,v.z];
   });
   if(vectors.some(v=>!v||!v.every(Number.isFinite)||Math.abs(v[0])>.98||Math.abs(v[1])>.98)||
      Math.hypot(vectors[0][0]-vectors[1][0],vectors[0][1]-vectors[1][1])<.15)return;
   const viewport=fleet.querySelector('.fleet-stage').getBoundingClientRect();
   if(viewport.top>innerHeight||viewport.bottom<0)return;
   state.first={ms:performance.now(),p,drawCalls:r.info.render.calls,triangles:r.info.render.triangles,renderFrame:r.info.render.frame,vectors};
   // One fence following the known formation submission. Never block with finish or readPixels.
   if(typeof g.fenceSync!=='function'){state.gpuStatus='fence unavailable';return;}
   const fence=g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE,0);
   if(!fence){state.gpuStatus='fence unavailable';return;}
   g.flush();
   const check=()=>{
    const v=g.clientWaitSync(fence,0,0);
    if(v===g.ALREADY_SIGNALED||v===g.CONDITION_SATISFIED){
     g.deleteSync(fence);state.gpuMs=performance.now();state.gpuStatus='signaled';
     const visible=()=>{const canvas=fleet.querySelector('canvas'),s=getComputedStyle(canvas);
      if(Number(s.opacity)>=.95&&s.visibility==='visible'&&s.display!=='none')state.visibleMs=performance.now();
      else requestAnimationFrame(visible);
     };requestAnimationFrame(visible);
    }else if(v===g.WAIT_FAILED){g.deleteSync(fence);state.gpuStatus='wait failed';}
    else requestAnimationFrame(check);
   };requestAnimationFrame(check);
  };
  function react(){
   if(state.scrollMs!==null&&state.target===null&&fleet.dataset.fleetState==='ready'){
    // Aim on the same main-thread turn that the sticky track enters ready layout.
    // This is a layout policy, never an assertion of rendering.
    const t=fleet.querySelector('.fleet-track'),s=fleet.querySelector('.fleet-stage');
    state.target=.245;
    state.aimMs=performance.now();
    scrollTo({top:scrollY+t.getBoundingClientRect().top-110+state.target*(t.offsetHeight-s.offsetHeight),behavior:'instant'});
   }
   inspect();
  }
  state.onNavigation=react;
  new MutationObserver(react).observe(fleet,{attributes:true,attributeFilter:['data-fleet-progress','data-fleet-state']});
 };
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',observe,{once:true});else observe();
}
const fleetWire=u=>/\/assets\/(?:models\/aircraft\/|models\/hero\/(?:environment|telemetry)|.*skylabs-(?:fleet|systems|film)|v2-hero-(?:environment|assets)|v3-aircraft-(?:scene|electronics)|vendor\/(?:three\.|GLTFLoader))/.test(u);
const cad=u=>/\/assets\/models\/aircraft\/.*(?:\.glb|\.gltf|\.bin|solarfilm|\/livery\/|manifest\.json)|\/assets\/models\/hero\/(?:telemetry|environment)/i.test(u);
function delta(t,anchor){return t==null||anchor==null?null:Math.round((t-anchor)*10)/10;}
async function visit(browser,server,tag,mode){
 const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:mode==='reduced'?'reduce':'no-preference',serviceWorkers:'block',javaScriptEnabled:mode!=='no-js'});
 const p=await c.newPage(), cd=await c.newCDPSession(p),logs=[],ws=new Map();
 let nav;
 const filename=path.join(out,tag);
 try{
  await cd.send('Network.enable');await cd.send('Network.setCacheDisabled',{cacheDisabled:true});await cd.send('Network.emulateNetworkConditions',throttle);
  cd.on('Network.requestWillBeSent',e=>{if(e.type==='Document'&&nav==null)nav=e.timestamp;ws.set(e.requestId,{path:new URL(e.request.url).pathname,url:e.request.url,kind:e.type,t:e.timestamp,initialPriority:e.request.initialPriority,priorityChanges:[]});});
  cd.on('Network.resourceChangedPriority',e=>{ws.get(e.requestId)?.priorityChanges.push({priority:e.newPriority,at:e.timestamp});});
  cd.on('Network.responseReceived',e=>Object.assign(ws.get(e.requestId)||{},{status:e.response.status,response:e.timestamp,cache:Boolean(e.response.fromDiskCache||e.response.fromServiceWorker),encoding:Object.entries(e.response.headers).find(([n])=>n.toLowerCase()==='content-encoding')?.[1]||'identity',contentLength:Number(Object.entries(e.response.headers).find(([n])=>n.toLowerCase()==='content-length')?.[1]??0)}));
  cd.on('Network.dataReceived',e=>{const r=ws.get(e.requestId);if(r)r.chunkBytes=(r.chunkBytes||0)+e.encodedDataLength;});
  cd.on('Network.loadingFinished',e=>Object.assign(ws.get(e.requestId)||{},{end:e.timestamp,bytes:e.encodedDataLength}));
  cd.on('Network.loadingFailed',e=>Object.assign(ws.get(e.requestId)||{},{end:e.timestamp,error:e.errorText}));
  p.on('pageerror',e=>logs.push(e.message));
  if(mode!=='no-js')await p.addInitScript(init,mode);
  await p.goto(server.url+route,{waitUntil:'domcontentloaded',timeout:45000});
  if(mode==='normal')await p.waitForFunction(()=>performance.now()>=1500&&__fleetBench.paint.some(x=>x.name==='first-contentful-paint'),null,{timeout:20000});
  const top=mode!=='no-js'?await p.evaluate(()=>({cutoff:performance.now(),paint:__fleetBench.paint,lcp:__fleetBench.lcp.at(-1),fcp:__fleetBench.paint.find(x=>x.name==='first-contentful-paint')?.ms, y:scrollY})):null;
  if(top?.y)throw new Error('Route top measurement was not taken at top');
  if(mode==='normal'){
   await p.evaluate(()=>{const b=__fleetBench;b.scrollMs=performance.now();const t=document.querySelector('.fleet-track');scrollTo({top:scrollY+t.getBoundingClientRect().top-110,behavior:'instant'});b.onNavigation?.();});
   await p.waitForFunction(()=>__fleetBench.visibleMs!=null,null,{timeout:90000});
   await p.screenshot({path:filename+'-formation.png',animations:'allow'});
  }else{
   await p.locator('.fleet-stage').scrollIntoViewIfNeeded();
   if(mode==='no-gl')await p.waitForFunction(()=>document.querySelector('[data-skylabs-fleet]').dataset.fleetState==='failed',null,{timeout:30000});
   const poster=p.locator('.fleet-poster');
   let shown=false; for(let attempt=0;attempt<40&&!shown;attempt++){
    shown=await poster.evaluate(n=>n.complete&&n.naturalWidth&&getComputedStyle(n).visibility==='visible');
    if(!shown)await new Promise(r=>setTimeout(r,200));
   } assert.ok(shown,mode+' has a decoded and visible fallback poster');
   await p.waitForTimeout(750);
   await p.screenshot({path:filename+'-fallback.png',animations:'allow'});
  }
  const state=mode!=='no-js'?await p.evaluate(()=>(({onNavigation,...b})=>({...b,fleetState:document.querySelector('[data-skylabs-fleet]').dataset.fleetState}))(__fleetBench)):null;
  const timing=await p.evaluate(()=>performance.getEntriesByType('resource').map(e=>({url:e.name,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,responseEnd:e.responseEnd})));
  const all=[...ws.values()].map(e=>({path:e.path,url:e.url,kind:e.kind,startMs:delta(e.t*1000,nav*1000),responseMs:e.response?delta(e.response*1000,nav*1000):null,endMs:e.end?delta(e.end*1000,nav*1000):null,status:e.status,bytes:e.bytes??null,encodedBodyChunks:e.chunkBytes??null,contentLength:e.contentLength??null,encoding:e.encoding,cache:e.cache,initialPriority:e.initialPriority,priorityChanges:e.priorityChanges.map(x=>[x.priority,delta(x.at*1000,nav*1000)]),error:e.error}));
  const fleet=all.filter(x=>fleetWire(x.path)), cadLoads=fleet.filter(x=>cad(x.path)), cutoff=state?.visibleMs??Infinity;
  const bytes=l=>l.reduce((s,r)=>s+(r.contentLength||0),0), measuredWire=l=>l.reduce((s,r)=>s+(r.bytes||0),0);
  const record={tag,mode,top,state,logs,formationFromScrollMs:state?.scrollMs==null?null:{submitted:delta(state.first?.ms,state.scrollMs),gpuSignaled:delta(state.gpuMs,state.scrollMs),visible:delta(state.visibleMs,state.scrollMs)},cadRequests:cadLoads.length,formationBytes:{allCompleted:bytes(all.filter(x=>x.endMs!=null&&x.endMs<=cutoff)),fleetCompleted:bytes(fleet.filter(x=>x.endMs!=null&&x.endMs<=cutoff)),cadCompleted:bytes(cadLoads.filter(x=>x.endMs!=null&&x.endMs<=cutoff))},fleetMeasuredCdpBytes:measuredWire(fleet.filter(x=>x.endMs!=null&&x.endMs<=cutoff)),timing,waterfall:all};
  fs.writeFileSync(filename+'.json',JSON.stringify(record,null,2));
  assert.deepEqual(logs,[]);
  if(mode==='normal')assert.ok(state.first&&state.gpuMs>=state.first.ms&&state.visibleMs>=state.gpuMs&&state.first.ms>=state.scrollMs);
  else assert.equal(cadLoads.length,0,mode+' requested CAD payload');
  if(mode==='normal'&&tag.endsWith('-1')){
   await p.evaluate(()=>{const t=document.querySelector('.fleet-track'),s=document.querySelector('.fleet-stage');scrollTo({top:scrollY+t.getBoundingClientRect().top-110+(t.offsetHeight-s.offsetHeight)+1,behavior:'instant'});});
   await p.waitForFunction(()=>Number(document.querySelector('[data-skylabs-fleet]').dataset.fleetProgress)>=.995,null,{timeout:15000});
   await p.screenshot({path:filename+'-deployed.png',animations:'allow'});
  }
  console.log(tag,{fcp:top?.fcp,lcp:top?.lcp?.ms,formationFromScrollMs:record.formationFromScrollMs,cad:cadLoads.length,bytes:record.formationBytes});
  return record;
 }catch(e){await p.screenshot({path:filename+'-error.png'}).catch(()=>{});fs.writeFileSync(filename+'-error.json',JSON.stringify({error:String(e),logs,network:[...ws.values()]},null,2));throw e;}finally{await c.close();}
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const targets={before:await host(base),after:await host(candidate)};
 let b;const rows=[],errors=[];
 try{
  b=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  async function sample(variant,tag,mode){try{rows.push(await visit(b,targets[variant],tag,mode));}catch(e){errors.push([tag,String(e)]);console.error(tag,e);}}
  for(let j=1;j<=repeat;j++)for(const v of j%2?['before','after']:['after','before'])await sample(v,v+'-'+j,'normal');
  for(const mode of ['reduced','save-data','no-gl','no-js'])for(const v of ['before','after'])await sample(v,v+'-'+mode,mode);
  const median=arr=>{let a=arr.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null;};
  const comparison={};
  for(const variant of ['before','after']){
   const visits=rows.filter(x=>x.mode==='normal'&&x.tag.startsWith(variant));
   comparison[variant]={runs:visits.length,fcp:median(visits.map(x=>x.top?.fcp)),lcp:median(visits.map(x=>x.top?.lcp?.ms)),gpuFormation:median(visits.map(x=>x.formationFromScrollMs.gpuSignaled)),visibleFormation:median(visits.map(x=>x.formationFromScrollMs.visible)),fleetBytes:median(visits.map(x=>x.formationBytes.fleetCompleted))};
  }
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({width,height,browser:b.version(),network:throttle,settle,repeat,comparison,errors},null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));
 }finally{await b?.close();for(const v of Object.values(targets))v.s.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

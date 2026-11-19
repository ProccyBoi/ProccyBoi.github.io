'use strict';
// Standalone independent QA: runs off-repo, no source changes or external writes.
// BEFORE_BASE and AFTER_BASE must be the two actual builds (default before=live).
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const out=process.env.OUTPUT_DIR||'/tmp/tucson-render-evidence',after=process.env.AFTER_BASE,before=process.env.BEFORE_BASE||'https://proccyboi.github.io';
if(!after) throw Error('Set AFTER_BASE to the verified local/preview candidate URL');
fs.mkdirSync(out,{recursive:true});
const geom=process.env.ENV_OBJECT_RE||'sonoran|tucson|saguaro|cholla|foothill|ridge|mountain|bajada|arroyo|wash|desert|terrain|creosote|palo.?verde|mesquite|ocotillo|groundcover';
const shots=[['landing',0],['landing',.18],['landing',.72],['landing',1],['progress',0],['progress',.17],['progress',.48],['progress',.17],['progress',0]];
const cases=(process.env.SCENARIOS||'normal,reduced,save,nogl,collection').split(',');
const widths=(process.env.WIDTHS||'1440,390').split(',').map(Number);
const tags=(process.env.REVISIONS||'before,after').split(',');
const all=[],errors=[];
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({all,errors},null,2));
async function run(browser,base,tag,width,mode){
 const id=[tag,width,mode].join('-'),row={id,tag,base,width,mode,frames:[],network:{},pageErrors:[]};all.push(row);save();
 const ctx=await browser.newContext({viewport:{width,height:width<600?Number(process.env.PHONE_HEIGHT||844):Number(process.env.DESKTOP_HEIGHT||900)},deviceScaleFactor:width<600?Number(process.env.PHONE_DPR||1):1,isMobile:width<600,hasTouch:width<600,reducedMotion:mode==='reduced'?'reduce':'no-preference'}),page=await ctx.newPage();page.on('pageerror',e=>row.pageErrors.push(String(e)));
 try{
   if(mode==='save')await page.addInitScript(()=>{const c=navigator.connection;if(c)Object.defineProperty(c,'saveData',{get:()=>true,configurable:true});else Object.defineProperty(navigator,'connection',{get:()=>({saveData:true}),configurable:true});});
   if(mode==='nogl')await page.addInitScript(()=>{const orig=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/i.test(t)?null:orig.call(this,t,...a);};});
   await page.addInitScript(()=>{window.__qaPerf={};for(const [type,key] of [['largest-contentful-paint','lcp'],['paint','paint']]){try{new PerformanceObserver(l=>{for(const e of l.getEntries())(window.__qaPerf[key]||=[]).push({name:e.name,start:e.startTime,url:e.url});}).observe({type,buffered:true});}catch{} }});
   const cdp=await ctx.newCDPSession(page),ids=new Map();await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   cdp.on('Network.requestWillBeSent',e=>{if(e.request.url.startsWith(base)){const k=e.requestId;ids.set(k,{url:e.request.url,priority:e.request.initialPriority,type:e.type});}});
   cdp.on('Network.responseReceived',e=>{const n=ids.get(e.requestId);if(n)n.status=e.response.status;});
   cdp.on('Network.loadingFinished',e=>{const n=ids.get(e.requestId);if(n)n.encoded=e.encodedDataLength;});
   await page.goto(base.replace(/\/$/,'')+'/v2/projects/'+(mode==='collection'?'?q=Framework#collection':'?capture'),{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('[data-aircraft-poster]').waitFor({state:'attached'});
   if(mode==='normal'){
    await page.locator('[data-aircraft-hero]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>!!window.__v3Aircraft?.flight && !!window.__v3Aircraft?.renderer?.getContext(),null,{timeout:180000});
    for(const [i,[type,v]] of shots.entries()){
      await page.evaluate(([t,v])=>{const a=window.__v3Aircraft;a[t==='landing'?'seekLanding':'seekProgress'](v);},[type,v]);
      await page.waitForFunction(([t,v])=>{const h=document.querySelector('[data-aircraft-hero]'),s=h.dataset,c=h.querySelector('canvas');
       return h.classList.contains('is-ready')&&getComputedStyle(c).visibility!=='hidden'&&s.aircraftWarmMask==='false'&&s.aircraftGPUPending==='false'&&s.aircraftPoseRevision===s.aircraftPresentedRevision&&Number(getComputedStyle(c).opacity)>=.995&&(t!=='progress'||Math.abs(Number(s.aircraftRenderedProgress)-v)<1e-5);
      },[type,v],{timeout:180000});
      const stat=await page.evaluate(({pattern})=>{
       const a=window.__v3Aircraft,r=a.renderer,c=a.camera,s=a.scene,T=window.THREE,h=document.querySelector('[data-aircraft-hero]'),rx=new RegExp(pattern,'i'),geo=[];
       s.updateMatrixWorld(true);c.updateMatrixWorld(true);s.traverse(o=>{
         if(!o.isMesh||!o.geometry?.attributes?.position||geo.length>=180)return;
         let n=o,chain=[];while(n&&n!==s){chain.push(n.name||n.type);n=n.parent;}const key=chain.reverse().join('/');if(!rx.test(key))return;
         const g=o.geometry,pos=g.attributes.position,points=[];const instances=o.isInstancedMesh&&o.count?[...new Set([0,Math.floor(o.count*.3),Math.floor(o.count*.65)])]:[null];for(const inst of instances){const m=new T.Matrix4();if(inst!==null)o.getMatrixAt(inst,m);for(const i of Array.from({length:Math.min(73,pos.count)},(_,j)=>Math.floor(j*pos.count/Math.min(73,pos.count)))){const v=new T.Vector3().fromBufferAttribute(pos,i);if(inst!==null)v.applyMatrix4(m);o.localToWorld(v);const w=v.toArray();v.project(c);points.push({i,inst,w,screen:v.toArray()});}}
         geo.push({name:key,type:o.type,vertices:pos.count,instances:o.isInstancedMesh?o.count:1,visible:o.visible,opacity:o.material?.opacity,points});
       });
       const rect=h.querySelector('canvas').getBoundingClientRect(),gl=r.getContext();
       return {state:h.dataset.aircraftState,phase:h.dataset.aircraftPhase,landing:h.dataset.aircraftLanding,progress:h.dataset.aircraftRenderedProgress,renderer:r instanceof T.WebGLRenderer && r.domElement===h.querySelector('canvas'),activeGL:!!gl&&!gl.isContextLost(),calls:r.info.render.calls,triangles:r.info.render.triangles,programs:r.info.programs?.length,geometry:r.info.memory.geometries,textures:r.info.memory.textures,mask:h.dataset.aircraftWarmMask,completionEvidence:h.dataset.aircraftLiveCompletionEvidence,completedFrames:h.dataset.aircraftCompletedFrames,firstLiveMs:h.dataset.aircraftFirstLiveMs,lastFrame:JSON.parse(h.dataset.aircraftLastFrame||'null'),presentedOpacity:Number(getComputedStyle(h.querySelector('canvas')).opacity),posterHidden:getComputedStyle(h.querySelector('[data-aircraft-poster]')).visibility==='hidden',canvas:[rect.width,rect.height],posterOpacity:getComputedStyle(h.querySelector('[data-aircraft-picture]')).opacity,modelMatrix:a.flight.carrier.matrixWorld.toArray(),camera:c.matrixWorld.toArray(),projection:c.projectionMatrix.toArray(),geo,oldPhotoElement:!!h.querySelector('picture.v2-trainer-field')};
      },{pattern:geom});
      if(tag==='after' && (type==='landing' && v===0 || type==='progress' && v===0 && i===4)) {
       const raw=await page.evaluate(()=>{const a=window.__v3Aircraft, r=a.renderer; r.render(a.scene,a.camera); return r.domElement.toDataURL('image/png');});
       fs.writeFileSync(path.join(out,id+'-canvas-'+(type==='landing'?'approach':'stopped')+'.png'),Buffer.from(raw.split(',')[1],'base64'));
      }
      const file=id+'-'+i+'-'+type+'-'+v+'.png';await page.screenshot({path:path.join(out,file),animations:'allow'});row.frames.push({i,type,v,file,stat});save();
    }
   }else{
    await page.waitForFunction(()=>{const p=document.querySelector('[data-aircraft-poster]');return p?.complete&&p.naturalWidth>0;},null,{timeout:20000});await page.waitForTimeout(2200);
    row.fallback=await page.evaluate(()=>{const h=document.querySelector('[data-aircraft-hero]'),p=h.querySelector('[data-aircraft-poster]');return {heroState:h.dataset.aircraftState,rendered:!!window.__v3Aircraft?.flight,mask:h.dataset.aircraftWarmMask,poster:p.currentSrc,decoded:p.complete&&p.naturalWidth>0,saveData:navigator.connection?.saveData,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,scrollY,hash:location.hash,h1:document.querySelector('h1')?.textContent};});
    await page.screenshot({path:path.join(out,id+'.png')});if(row.fallback.rendered)throw Error('Unexpected mounted 3D in fallback: '+mode);
   }
   row.perf=await page.evaluate(()=>({paint:window.__qaPerf,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,start:r.startTime,encoded:r.encodedBodySize,transfer:r.transferSize}))}));
   row.network.requests=[...ids.values()];row.network.scene=row.network.requests.filter(r=>/sonoran|tucson|terrain|desert|trainer-(stopped|approach)|v3-aircraft/.test(r.url));
   if(tag==='after' && mode!=='normal'){
      if(row.network.requests.some(r=>/v2-tucson-relief\.js|tucson-mountains\/|trainer-sonoran-field/.test(r.url)))throw Error('Fallback fetched active or retired scenery');
      if(!/tucson-trainer-stopped(?:-mobile)?\.webp/.test(row.fallback.poster))throw Error('Fallback did not select the promised new stopped image');
      if(mode==='collection' && (row.fallback.hash!=='#collection'||row.fallback.scrollY<100))throw Error('Direct collection navigation did not bypass the hero');
   }
   if(mode==='normal'){
      if(!row.frames.every(f=>f.stat.renderer&&f.stat.activeGL&&f.stat.posterHidden&&f.stat.triangles>0))throw Error('No actual WebGL frames');
      if(tag==='after'&&(!row.frames.some(f=>f.stat.geo.length)||row.frames.some(f=>f.stat.oldPhotoElement)||row.network.requests.some(r=>/trainer-sonoran-field(?:-mobile)?\.webp/i.test(r.url))))throw Error('Candidate environment not proved or still shows old plate; inspect scene names / resource report');
   }
 }catch(e){row.problem=String(e);errors.push({id,error:String(e)});await page.screenshot({path:path.join(out,id+'-error.png'),timeout:5000}).catch(()=>{});}
 finally{await ctx.close();save();}
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{for(const t of tags)for(const w of widths)for(const m of cases)await run(browser,t==='before'?before:after,t,w,m);}finally{await browser.close();save();}if(errors.length)process.exitCode=1;
})().catch(e=>{errors.push({launcher:String(e)});save();console.error(e);process.exitCode=1;});

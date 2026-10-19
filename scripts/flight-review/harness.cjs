'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {execFileSync}=require('node:child_process');
const {ROOT,payload,flatTerrainPng}=require('./fixtures.cjs');
const ROUTE='/shared/flight-review/';
const VIEWPORTS={desktop1440:{width:1440,height:900},phone390:{width:390,height:844},phone320:{width:320,height:780},tablet768:{width:768,height:1024},tablet1024:{width:1024,height:768},tablet1180:{width:1180,height:820}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function revision(root=ROOT) {try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return 'unknown';}}
function dirty(root=ROOT) {try{return !!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}}
async function server(root=ROOT) {
  root=path.resolve(root);
  const app=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname), file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.stat(file,(error,stat)=>{
      if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(0,'127.0.0.1',resolve);});
  return {base:`http://127.0.0.1:${app.address().port}`,close:()=>new Promise(resolve=>app.close(resolve))};
}
function installProbe() {
  const p=window.__flightProbe={raf:0,drawCalls:0,chartClears:0,longTasks:[],heartbeats:[],workers:[],contexts:[],timeline:[],clipboard:null,maps:[],customLayers:[],started:performance.now()};
  // Passively retain actual public renderer/layer objects, without changing
  // production state or replacing geometry. Libraries still execute normally.
  let maplibre;
  Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>maplibre,set:value=>{
    maplibre=value;if(!value?.Map)return;
    const Original=value.Map;value.Map=class extends Original{constructor(...args){super(...args);p.maps.push(this);const add=this.addLayer;this.addLayer=function(layer,...rest){if(layer.type==='custom')p.customLayers.push(layer);return add.call(this,layer,...rest);};}};
  }});
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(t=>{p.raf++;callback(t);});
  try {new PerformanceObserver(list=>p.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});} catch {}
  let previous=performance.now();
  setInterval(()=>{const now=performance.now();p.heartbeats.push({at:now,gap:now-previous});previous=now;},20);
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){const c=getContext.call(this,type,...args);if(c&&/webgl/.test(type)&&!p.contexts.some(x=>x.context===c))p.contexts.push({context:c,canvas:this,type});return c;};
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas?.dataset?.chart)p.chartClears++;return clear.apply(this,args);};
  for(const Klass of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(Klass)for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
    const original=Klass.prototype[method];if(original)Klass.prototype[method]=function(...args){p.drawCalls++;return original.apply(this,args);};
  }
  if(window.Worker){const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);p.workers.push({url:String(args[0]),at:performance.now()});}};}
  try {Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{p.clipboard=text;}}});}catch{}
  addEventListener('DOMContentLoaded',()=>{
    const node=document.querySelector('[data-current-time]');if(node)new MutationObserver(()=>p.timeline.push({at:performance.now(),text:node.textContent})).observe(node,{childList:true,subtree:true,characterData:true});
  });
}
async function launch(engine='chromium') {
  const playwright=require('playwright');
  const options={headless:true};
  if(engine==='chromium')options.args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
  if(process.env.FLIGHT_BROWSER_PATH)options.executablePath=process.env.FLIGHT_BROWSER_PATH;
  return playwright[engine].launch(options);
}
async function open(browser,base,{viewport='desktop1440',noWebGL=false,noWorker=false,failWorker=false,blockDependencies=[],mockMap=true,flatTerrain=false,externalPolicy='block'}={}) {
  const size=typeof viewport==='string'?VIEWPORTS[viewport]:viewport;
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,hasTouch:size.width<800,isMobile:size.width<800,acceptDownloads:true,serviceWorkers:'block'});
  const network=[], errors=[],faults={dependencies:new Set(blockDependencies),worker:failWorker,delayWorkerMs:0};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),local=url.origin===new URL(base).origin;
    network.push({url:url.href,method:req.method(),type:req.resourceType(),local,at:Date.now()});
    if(!local){
      if(externalPolicy==='allow')return route.continue();
      if(mockMap&&url.href.includes('tiles.openfreemap.org/styles/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:8,name:'Deterministic test style; provider imagery is not exercised',glyphs:base+'/__fixture_glyphs/{fontstack}/{range}.pbf',sources:{openmaptiles:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#091b36'}}]})});
      if(mockMap&&url.href.includes('tiles.mapterhorn.com/tilejson'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tilejson:'3.0.0',tiles:[base+'/__fixture_empty_dem/{z}/{x}/{y}.png'],minzoom:0,maxzoom:0,encoding:'mapbox'})});
      return route.abort('blockedbyclient');
    }
    if(url.pathname.includes('/__fixture_empty_dem/'))return flatTerrain?route.fulfill({status:200,contentType:'image/png',body:flatTerrainPng()}):route.fulfill({status:404,body:'Terrain intentionally absent: unavailable elevation fixture'});
    if(url.pathname.includes('/__fixture_glyphs/'))return route.fulfill({status:200,contentType:'application/x-protobuf',body:Buffer.alloc(0)});
    if(/flight-review.*worker/.test(url.pathname)){
      if(faults.worker)return route.abort('failed');
      if(faults.delayWorkerMs)await sleep(faults.delayWorkerMs);
    }
    if([...faults.dependencies].some(pattern=>url.pathname.includes(pattern)))return route.abort('failed');
    return route.continue();
  });
  await context.addInitScript(installProbe);
  if(noWebGL)await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
  if(noWorker)await context.addInitScript(()=>{window.Worker=undefined;});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  return {browser,context,page,base,network,errors,faults,size};
}
async function go(run) {const response=await run.page.goto(run.base+ROUTE,{waitUntil:'load',timeout:60000});assert.equal(response.status(),200);await run.page.locator('[data-choose-file]').first().waitFor();}
async function loaded(run,fixture,{timeout=60000}={}) {
  await run.page.locator('[data-flight-file]').setInputFiles(payload(fixture));
  await run.page.waitForFunction(name=>{const w=document.querySelector('[data-workspace]');return w&&!w.hidden&&document.querySelector('[data-file-name]')?.textContent===name;},fixture.name,{timeout});
  await run.page.waitForFunction(()=>document.querySelector('[data-loading]').hidden);
  return run.page.locator('[data-summary-records]').textContent();
}
function seconds(text) {return text.trim().split(':').reduce((a,n)=>a*60+Number(n),0);}
async function readTime(page){return seconds(await page.locator('[data-current-time]').textContent());}
async function index(page){return Number((await page.locator('[data-sample-readout]').textContent()).split('/')[0].replace(/[^\d]/g,''))-1;}
async function seekIndex(page,value) {await page.locator('[data-timeline]').evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);await page.waitForTimeout(35);}
async function download(page,selector='[data-download-csv]') {
  const [file]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
  return {name:file.suggestedFilename(),text:fs.readFileSync(await file.path(),'utf8')};
}
function parseCsv(text) {const lines=text.trim().split(/\r?\n/),headers=lines.shift().split(',');return {headers,rows:lines.map(line=>Object.fromEntries(line.split(',').map((value,i)=>[headers[i],value])))};}
async function snapshot(run) {
  return run.page.evaluate(()=>{
    const p=window.__flightProbe;
    return {at:performance.now(),url:location.href,viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1,raf:p.raf,drawCalls:p.drawCalls,chartClears:p.chartClears,longTasks:p.longTasks,heartbeats:p.heartbeats,workers:p.workers,timeline:p.timeline,readout:document.querySelector('[data-sample-readout]')?.textContent,currentTime:document.querySelector('[data-current-time]')?.textContent,selectedView:document.querySelector('[data-view-button][aria-selected="true"]')?.dataset.viewButton,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,initiatorType:e.initiatorType,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize})),navigation:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,load:e.loadEventEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),webgl:p.contexts.map(({context,canvas,type})=>{let renderer;try{const ext=context.getExtension('WEBGL_debug_renderer_info');renderer=context.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:context.RENDERER);}catch{}return {type,renderer,lost:context.isContextLost(),width:canvas.width,height:canvas.height,host:canvas.parentElement?.id};})};
  });
}
async function screenshot(run,out,name,{fullPage=false}={}) {
  fs.mkdirSync(out,{recursive:true});await run.page.screenshot({path:path.join(out,name+'.png'),fullPage,animations:'disabled'});
  const data={...(await snapshot(run)),network:run.network,errors:run.errors};
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));
  assert.equal(data.overflow,false,'No horizontal overflow at '+name);return data;
}
async function target(page,selector) {
  const item=page.locator(selector).first();await item.scrollIntoViewIfNeeded();
  const bounds=await item.evaluate(node=>{const b=node.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {width:b.width,height:b.height,left:b.left,right:b.right,viewport:innerWidth,hit:hit===node||node.contains(hit)};});
  assert.ok(bounds.width>=24&&bounds.height>=24&&bounds.left>=-1&&bounds.right<=bounds.viewport+1&&bounds.hit,'Visible operable target '+selector+' '+JSON.stringify(bounds));return bounds;
}
function noExternal(run) {assert.deepEqual(run.network.filter(x=>!x.local),[],'No external requests before explicit terrain selection');assert.deepEqual(run.network.filter(x=>x.method!=='GET'),[],'No log uploads or non-GET requests');}
function metadata(browser,extra={}) {return {candidateSha:revision(),dirtyWorkingTree:dirty(),recordedAt:new Date().toISOString(),node:process.version,playwright:require('playwright/package.json').version,browser:browser?.version(),environment:'Headless browser viewport emulation. Chromium uses software ANGLE/SwiftShader; not physical-device/GPU evidence.',...extra};}
module.exports={ROOT,ROUTE,VIEWPORTS,sleep,revision,dirty,server,launch,open,go,loaded,readTime,index,seekIndex,download,parseCsv,snapshot,screenshot,target,noExternal,metadata};

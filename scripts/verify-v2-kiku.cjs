#!/usr/bin/env node
/* Exact v2 Kiku scope + native browser interaction. Chromium/SwiftShader and
 * WebKit emulation establish browser behavior, not physical-device speed. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),baseline='3263d8987dab6cdacdf5ff87775838ef567ca06d';
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080',out=process.env.KIKU_OUT||'/tmp/kiku-evidence',args=process.argv.slice(2);
const route='/v2/projects/kiku/',viewports={desktop1440:{width:1440,height:900},phone320:{width:320,height:780,touch:true},phone390:{width:390,height:844,touch:true},ipad768:{width:768,height:1024,touch:true},ipad1024:{width:1024,height:768,touch:true},ipad1180:{width:1180,height:820,touch:true}};
const source=()=>{
 const allowed=new Set(['v2/projects/kiku/index.html','assets/v2-kiku.js','assets/v2-kiku.css','assets/v2-kiku-model.js','assets/v2-kiku-explorer.js','assets/v2-kiku-simulator.js','assets/v2-kiku-audio.js','assets/images/kiku/v2-populated-assembly.png','assets/images/kiku/v2-populated-pcb.png','assets/images/kiku/v2-product-assembly.png','scripts/build-v2-cases.py','docs/v2-kiku-audio.md','scripts/build-v3-pages.py','scripts/audit-v3.py','scripts/v3_interior_source.py','scripts/content/v3-kiku-source.html','scripts/content/v2-kiku-hero.html','scripts/content/v2-kiku-page.html','scripts/verify-v2-kiku.cjs','.github/workflows/verify-v2-kiku.yml']);
 const changed=execFileSync('git',['diff',baseline,'--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const file of changed)assert.ok(allowed.has(file)||file.startsWith('assets/models/kiku-pcb/')||file.startsWith('scripts/kiku-pcb/')||file.startsWith('assets/models/kiku-hardware/')||file.startsWith('scripts/kiku-hardware/')||file.startsWith('assets/kiku/audio/')||['scripts/kiku-simulator/compose-audio.py','scripts/kiku-simulator/verify-audio.cjs'].includes(file),'Unrelated file changed: '+file);
 for(const file of ['assets/models/kiku/assembly.json','assets/models/kiku/assembly.bin','assets/kiku-simulator.js','assets/kiku.js','assets/kiku.css','assets/kiku/firmware-ui.wasm','projects/kiku/index.html','v3/projects/kiku/index.html','v2/index.html'])assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:20e6}),'Preserve '+file);
 assert.deepEqual(fs.readFileSync(path.join(root,'scripts/content/v3-kiku-source.html')),execFileSync('git',['show',baseline+':scripts/content/v3-kiku-source.html'],{cwd:root,maxBuffer:1e6}),'Exact frozen v3 source');
 for(const item of JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku-pcb/poster-provenance.json'),'utf8')).captures)assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,item.path))).digest('hex'),item.sha256,'Reviewed WebGL poster hash');
 for(const file of ['assets/v2-kiku.js','assets/v2-kiku-explorer.js']){const script=fs.readFileSync(path.join(root,file),'utf8');if(script.includes('v2-kiku-model.js'))assert.match(script,/from '\.\/v2-kiku-model\.js\?v=finish-20261018'/,'Current shared-loader cache key');}
 const html=fs.readFileSync(path.join(root,'v2/projects/kiku/index.html'),'utf8');
 assert.equal((html.match(/data-kiku-story(?:\s|>)/g)||[]).length,1,'One consolidated product stage');
 assert.equal((html.match(/data-model-canvas(?:\s|>)/g)||[]).length,1,'One CAD canvas');
 assert.doesNotMatch(html,/\/(?:concepts|desk|stand|battery-cable|display-section)\.webp/,'Retired studies and repeated CAD galleries are absent');
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku-pcb/pcb-provenance.json'),'utf8'));
 assert.equal(provenance.components.length,133,'Preserve all133 placed components');
 const ranges=Object.values(provenance.componentTriangleRangesByMesh).flat();
 for(const ref of ['SW2','SW3','SW4','J1','U1','U10','FPC1']){const component=provenance.components.find(item=>item.ref===ref);assert.ok(component,'Required component '+ref);const triangles=ranges.filter(item=>item.ref===ref).reduce((n,item)=>n+item.triangleCount,0);assert.ok(triangles>12,'Major component has topology beyond one box: '+ref);assert.ok(['source-dimensioned-reconstruction','official-compatible-package-model'].includes(component.fidelity),'Honest geometry fidelity category: '+ref);assert.ok(component.sourceDocuments?.length||component.librarySource,'Traceable component source: '+ref);}
 const regenerated=execFileSync('python3',['-c',`import runpy; from pathlib import Path; m=runpy.run_path('scripts/build-v2-cases.py'); p=Path('projects/kiku/index.html').resolve(); print(m['normalized'](m['enrich_case'](m['make_case'](p),'kiku')),end='')`],{cwd:root,encoding:'utf8'});assert.equal(html,regenerated,'V2 regeneration');
 console.log('PASS exact Kiku-only production boundary, original meshes/firmware and root/v3 preservation, regeneration');
};
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out after '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}}
async function failure(run,name,error){
 console.error('FAILED '+name+': '+String(error));
 try{await run.page.screenshot({path:path.join(out,name+'-failure.png'),timeout:5000});}catch(_){}
 let state;try{state=await bounded(run.page.evaluate(()=>({url:location.href,y:scrollY,story:{...document.querySelector('[data-kiku-story]')?.dataset},stage:{...document.querySelector('[data-model-stage]')?.dataset},focus:document.activeElement?.outerHTML})),2500,'Failure diagnostics');}catch(_){}
 fs.writeFileSync(path.join(out,name+'-failure.json'),JSON.stringify({error:String(error),state,requests:run.requests,requestURLs:run.requestURLs,errors:run.errors},null,2));
}
async function open(browser,v,options={}){
 const context=await browser.newContext({viewport:{width:v.width,height:v.height},hasTouch:!!v.touch,isMobile:!!v.touch,deviceScaleFactor:1,reducedMotion:options.reduced?'reduce':'no-preference',javaScriptEnabled:!options.noJS,serviceWorkers:'block'});
 const requests=[],requestURLs=[],errors=[]; const gates={model:!!options.failModel,pcb:!!options.failPCB,hardware:!!options.failHardware};
 await context.addInitScript(()=>{const contexts=[];window.__kikuWebGL=contexts;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){const result=original.call(this,type,...rest);if(/^(webgl2?|experimental-webgl)$/.test(type)&&result&&!contexts.some(item=>item.context===result))contexts.push({canvas:this,context:result,type});return result;};});
 if(options.saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){}}}));
 if(options.noDecompression)await context.addInitScript(()=>{window.DecompressionStream=undefined;});
 if(options.noGL)await context.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){return /webgl/.test(type)?null:old.call(this,type,...a);};});
 await context.route('**/*',r=>{const u=new URL(r.request().url());requests.push(u.pathname);requestURLs.push(u.pathname+u.search);if(u.origin!==new URL(base).origin||r.request().method()!=='GET'||(gates.model&&u.pathname.endsWith('assembly.bin'))||(gates.pcb&&/\/pcb\.bin(\.gz)?$/.test(u.pathname))||(gates.hardware&&/\/hardware\.bin(\.gz)?$/.test(u.pathname))||(options.failWasm&&u.pathname.endsWith('.wasm')))return r.abort();return r.continue();});
 if(options.diagnosticHideMeshes)await context.route('**/v2-kiku-model.js*',async request=>{
  const response=await request.fetch(),original=await response.text();
  const injected=original.replace('return mesh;',`if(${JSON.stringify(options.diagnosticHideMeshes)}.includes(part.id)){mesh.material.opacity=0;mesh.material.transparent=true;mesh.material.depthWrite=false;}return mesh;`);
  assert.notEqual(injected,original,'Diagnostic injection matched shared mesh constructor');await request.fulfill({response,body:injected});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+route,{waitUntil:'networkidle'});return{context,page,requests,requestURLs,errors,v,gates,options};
}
async function stable(page){await page.evaluate(()=>{window.__kikuStable={value:document.querySelector('[data-kiku-story]').dataset.frames||'0',at:performance.now()};});await page.waitForFunction(()=>{const s=document.querySelector('[data-kiku-story]');const x=s.dataset.frames||'0';window.__kikuStable=window.__kikuStable||{value:x,at:performance.now()};if(window.__kikuStable.value!==x)window.__kikuStable={value:x,at:performance.now()};const r=s.querySelector('.kiku-story-stage').getBoundingClientRect();const current=s.dataset.ready!=='true'||r.bottom<=0||r.top>=innerHeight||Math.abs(Number(s.dataset.progress)-Number(s.dataset.target))<.00006;return current&&performance.now()-window.__kikuStable.at>300;},{},{timeout:30000,polling:50});}
async function viewportProbe(page){return page.evaluate(()=>{const rect=selector=>document.querySelector(selector)?.getBoundingClientRect().toJSON(),v=visualViewport;return{y:scrollY,x:scrollX,innerWidth,innerHeight,devicePixelRatio,header:rect('.v2-header'),nav:rect('.v2-case-nav'),body:document.body.getBoundingClientRect().toJSON(),visualViewport:v?{offsetTop:v.offsetTop,offsetLeft:v.offsetLeft,pageTop:v.pageTop,pageLeft:v.pageLeft,width:v.width,height:v.height,scale:v.scale}:null};});}
async function shot(run,name){
 if(!run.options.noJS)await stable(run.page);
 const viewportBeforeCapture=await viewportProbe(run.page);
 const pixels=await run.page.screenshot({path:path.join(out,name+'.png')});
 const data=await run.page.evaluate(()=>{const s=document.querySelector('[data-kiku-story]'),c=s.querySelector('canvas').getBoundingClientRect();return{width:innerWidth,height:innerHeight,y:scrollY,overflow:document.documentElement.scrollWidth>innerWidth+1,story:{...s.dataset},canvas:{x:c.x,y:c.y,width:c.width,height:c.height},pinned:s.classList.contains('is-pinned'),stage:s.querySelector('.kiku-story-stage').getBoundingClientRect().toJSON(),bounds:[...s.querySelectorAll('h1,.kiku-story-deck,.kiku-story-description,.kiku-actions,.kiku-story-navigation,.kiku-inspector,.kiku-story-caption,.kiku-story-qualification,.kiku-story-scroll')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none').map(e=>({name:e.className||e.tagName,...e.getBoundingClientRect().toJSON()})),active:document.activeElement?.getAttribute('aria-label')};});
 data.viewportBeforeCapture=viewportBeforeCapture;data.viewportAfterCapture=await viewportProbe(run.page);
 assert.equal(data.overflow,false,name+' overflow');
 if(data.pinned&&data.stage.y>=0&&data.stage.y<data.height&&data.stage.bottom<=data.height+2){
  for(const r of data.bounds)assert.ok(r.y>=data.stage.y-1&&r.bottom<=data.height+1,'Pinned '+r.name+' is fully visible at '+name+': '+JSON.stringify(r));
  const caption=data.bounds.find(r=>r.name==='kiku-story-caption'),cue=data.bounds.find(r=>r.name==='kiku-story-scroll');if(caption&&cue)assert.ok(caption.bottom+8<=cue.y,'Caption and scroll cue do not overlap at '+name);
 }

 if(data.story.ready==='true'&&data.canvas.y>=0&&data.canvas.y+data.canvas.height<=data.height+1&&data.canvas.height>150){
  const{PNG}=require('pngjs'),image=PNG.sync.read(pixels),r=data.canvas;let foreground=0,total=0;
  for(let y=Math.ceil(r.y+10);y<Math.floor(r.y+r.height-40);y++)for(let x=Math.ceil(r.x+10);x<Math.floor(r.x+r.width-10);x++){const i=(y*image.width+x)*4;if(image.data[i]>60||image.data[i+1]>60||image.data[i+2]>60)foreground++;total++;}
  data.actualCanvasPixels={foreground,total,fraction:foreground/total};assert.ok(data.actualCanvasPixels.fraction>.025,'Nonblank real CAD screenshot '+name);
 }
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));
}
async function assertFramed(page,label){
 const geometry=await page.evaluate(()=>{const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();return{stage:rect('.kiku-story-stage'),canvas:rect('[data-model-canvas]'),chromeBottom:Math.max(rect('.v2-header').bottom,rect('.v2-case-nav').bottom),height:innerHeight,pinned:document.querySelector('[data-kiku-story]').classList.contains('is-pinned')};});
 if(geometry.pinned)assert.ok(geometry.stage.top>=geometry.chromeBottom-1,'Pinned stage clears sticky navigation: '+label+' '+JSON.stringify(geometry));
 assert.ok(geometry.canvas.top>=geometry.chromeBottom-1&&geometry.canvas.bottom<=geometry.height+1,'Entire model canvas is unobscured: '+label+' '+JSON.stringify(geometry));
 return geometry;
}
async function canvasShot(page,name,{nativeCapture=false}={}){
 await page.waitForTimeout(350);
 const framing=nativeCapture?null:await assertFramed(page,name);
 const pixels=await page.locator('[data-model-canvas]').screenshot({path:path.join(out,name+'.png')});
 const {PNG}=require('pngjs'),im=PNG.sync.read(pixels),bg=Array.from(im.data.slice(0,3)),colors=new Set();let foreground=0;
 for(let i=0;i<im.data.length;i+=4){if(Math.max(...bg.map((v,j)=>Math.abs(im.data[i+j]-v)))>25)foreground++;colors.add(im.data[i]*65536+im.data[i+1]*256+im.data[i+2]);}
 assert.ok(foreground/(im.width*im.height)>.025,'Nonblank real model canvas '+name);assert.ok(colors.size>12,'Actual model shading/material variation '+name);
 const stage=await page.locator('[data-model-stage]').evaluate(e=>({...e.dataset}));assert.ok(Number(stage.visibleMeshes)>0,'Visible render meshes '+name);
 const graphics=await page.locator('[data-model-canvas]').evaluate(canvas=>{const item=window.__kikuWebGL.find(item=>item.canvas===canvas),gl=item.context;return{type:item.type,depthBits:gl.getParameter(gl.DEPTH_BITS),attributes:gl.getContextAttributes()};});
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({width:im.width,height:im.height,foreground,colors:colors.size,stage,framing,graphics},null,2));
}
async function singleRenderer(run,expectedContexts=1){
 const {page}=run;assert.equal(await page.locator('[data-model-canvas]').count(),1,'One consolidated CAD canvas');assert.equal(await page.locator('[data-kiku-story-canvas]').count(),1,'One immersive canvas');
 assert.ok(await page.evaluate(()=>document.querySelector('[data-model-canvas]')===document.querySelector('[data-kiku-story-canvas]')),'Inspector and scroll share their canvas');
 const contexts=await page.evaluate(()=>window.__kikuWebGL.map(item=>({live:!item.context.isContextLost(),connected:item.canvas.isConnected})));
 assert.equal(contexts.length,expectedContexts,'One context per initial load or explicit recovery');assert.equal(contexts.filter(item=>item.live&&item.connected).length,1,'Exactly one live connected WebGL renderer');
}
async function part(page,id){
 await page.locator('[data-part-select]').selectOption(id);
 await page.waitForFunction(id=>{const s=document.querySelector('[data-model-stage]'),groups=JSON.parse(s.dataset.visibleGroups||'[]');return s.dataset.selected===id&&(id?groups.length===1&&groups[0]===id:groups.length===14);},id);
 assert.equal(await page.locator('[data-model-stage]').getAttribute('data-mode'),'inspect','Part selection enters shared inspector');
}
async function camera(page,view){await page.locator('button[data-view="'+view+'"]').click();await page.waitForFunction(view=>document.querySelector('[data-model-stage]').dataset.view===view,view);}
async function loseContext(page){
 await page.locator('[data-model-canvas]').evaluate(canvas=>{const item=window.__kikuWebGL.find(item=>item.canvas===canvas),extension=item.context.getExtension('WEBGL_lose_context');if(!extension)throw new Error('Real context-loss extension unavailable');extension.loseContext();});
 await page.waitForSelector('[data-kiku-story][data-ready="false"]');
}
async function hit(locator){assert.ok(await locator.isVisible(),'Visible '+await locator.innerText());assert.ok(await locator.evaluate(e=>{const r=e.getBoundingClientRect();const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===h||e.contains(h);}), 'Hit target '+await locator.innerText());}
async function scrollPose(page,p){await page.evaluate(p=>{const s=document.querySelector('[data-kiku-story]'),stage=s.querySelector('.kiku-story-stage');scrollTo({top:scrollY+s.getBoundingClientRect().top-parseFloat(getComputedStyle(stage).top)+(s.offsetHeight-stage.clientHeight)*p,behavior:'instant'});},p);await page.waitForFunction(p=>Math.abs(Number(document.querySelector('[data-kiku-story]').dataset.target)-p)<.002,p,{timeout:30000,polling:50});await stable(page);}
async function matrix(browser,name){
 const run=await open(browser,viewports[name]),{page}=run;
 try{
  await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:120000});await stable(page);
  assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-parts'),'9');assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-hardware-items'),'4');assert.ok(Number(await page.locator('[data-kiku-story]').getAttribute('data-pcb-parts'))>0,'Populated board meshes rendered');
  await singleRenderer(run);await shot(run,name+'-exterior');
  for(const b of await page.locator('[data-kiku-pose],[data-model-mode=pcb]').all())await hit(b);
  await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-progress'),'0.50000');await shot(run,name+'-layers');
  await page.locator('[data-kiku-pose="1"]').click();await page.locator('[data-kiku-pose="0"]').click();await page.locator('[data-kiku-pose="1"]').click();await stable(page);await shot(run,name+'-rear');
  await page.locator('[data-kiku-pose="0"]').focus();await page.keyboard.press('Enter');await stable(page);assert.equal(await page.locator('[data-kiku-pose="0"]').getAttribute('aria-pressed'),'true');assert.ok(await page.locator('[data-kiku-pose="0"]').evaluate(e=>e.matches(':focus-visible')&&parseFloat(getComputedStyle(e).outlineWidth)>=2),'Visible keyboard focus');for(const b of await page.locator('[data-kiku-pose]').all())assert.ok((await b.boundingBox()).height>=44,'44px view control');
  if(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned'))){for(const p of [.5,.9,.2]){await scrollPose(page,p);await shot(run,name+'-scroll-'+p);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-p)<.002,'Native requested '+p+' got '+await page.locator('[data-kiku-story]').getAttribute('data-progress')); }const y=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,130);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>scrollY)>y,'Native wheel scroll');}
  if(name.startsWith('ipad')){await scrollPose(page,.4);const native=Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'));await page.setViewportSize({width:run.v.width,height:run.v.height-24});await stable(page);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-native)<.002,'Native pose survives browser chrome height');await page.setViewportSize({width:run.v.height,height:run.v.width});await stable(page);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-native)<.002,'Native pose survives rotation');await shot(run,name+'-native-rotated');await page.setViewportSize({width:run.v.width,height:run.v.height});await stable(page);await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);await page.setViewportSize({width:run.v.height,height:run.v.width});await stable(page);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-target'),'0.50000','Explicit pose target survives orientation');assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-.5)<.00006,'Explicit rendered pose remains within stable interpolation tolerance after orientation');await shot(run,name+'-rotated');await page.setViewportSize({width:run.v.width,height:run.v.height});await stable(page);}
  await page.locator('.kiku-story .kiku-primary').click();await page.waitForURL('**#simulator');await page.waitForSelector('.kiku-sim[data-enhanced="true"]');
  await page.locator('.kiku-sim-device').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await shot(run,name+'-simulator');
  if(name.startsWith('ipad')){await page.waitForTimeout(600);await shot(run,name+'-simulator-settled');}
  await page.locator('.kiku-sim-audio').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await shot(run,name+'-audio-controls');
  for(const control of await page.locator('.kiku-sim-audio button,.kiku-sim-audio input').all()){const r=await control.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=run.v.width+1,'Audio controls remain inside viewport');assert.ok(r.height>=44,'Accessible audio hit target');}
  const looks=page.locator('.kiku-look-choice');assert.equal(await looks.count(),10);for(let i=0;i<10;i++){await looks.nth(i).click();assert.equal(await looks.nth(i).getAttribute('aria-pressed'),'true');}
  await looks.first().click();await page.locator('.kiku-sim-press').scrollIntoViewIfNeeded();const before=await page.locator('.kiku-sim-state').innerText();const d=await page.locator('.kiku-sim-press').boundingBox();await page.mouse.move(d.x+d.width/2,d.y+d.height/2);await page.mouse.down();await page.mouse.move(d.x+d.width/2+28,d.y+d.height/2,{steps:8});await page.mouse.up();assert.notEqual(await page.locator('.kiku-sim-state').innerText(),before,'Dial turns state');assert.equal(await page.locator('.kiku-sim').getAttribute('data-screen'),'0','Drag does not also press');
  if(run.v.touch){
   await page.locator('.kiku-sim-reset').click();await page.locator('.kiku-sim-press').scrollIntoViewIfNeeded();const cdp=await run.context.newCDPSession(page);
   async function gesture(dx,dy){const b=await page.locator('.kiku-sim-press').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);}
   const beforeTouch=await page.locator('.kiku-sim-state').innerText();await gesture(42,0);assert.notEqual(await page.locator('.kiku-sim-state').innerText(),beforeTouch,'Real touch turns dial');assert.equal(await page.locator('.kiku-sim').getAttribute('data-screen'),'0');
   const y=await page.evaluate(()=>scrollY),beforeVertical=await page.locator('.kiku-sim-state').innerText();await gesture(0,-100);assert.ok(await page.evaluate(()=>scrollY)>y,'Vertical dial swipe preserves page scrolling');assert.equal(await page.locator('.kiku-sim-state').innerText(),beforeVertical,'Vertical swipe does not trigger dial');await cdp.detach();
  }
  await page.locator('.kiku-sim-reset').click();await page.locator('.kiku-sim-canvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.notEqual(await page.locator('.kiku-sim').getAttribute('data-screen'),'0');
  await page.locator('[data-source="fm"]').click();assert.equal(await page.locator('[data-signal-input]').innerText(),'FM broadcast');await page.locator('[data-source="bt"]').click();assert.match(await page.locator('[data-signal-description]').innerText(),/no Bluetooth-headphone transmit path/);await shot(run,name+'-signal');
  const f=await page.locator('[data-kiku-story]').getAttribute('data-frames');await page.waitForTimeout(500);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-frames'),f,'No offscreen rendering');
  // Return through the actual section navigation, rather than artificially
  // centering a sticky canvas below the end of its containing scroll range.
  await page.locator('[data-v2-section][href$="#overview"]').click();await page.waitForURL('**#overview');await stable(page);
  await page.locator('[data-kiku-pose="0"]').click();await stable(page);
  const details=page.locator('[data-inspector-details]');
  async function lowerBoundary(){
   const pinned=await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned'));if(!pinned)return null;
   await page.evaluate(()=>{const s=document.querySelector('[data-kiku-story]'),stage=s.querySelector('.kiku-story-stage'),top=parseFloat(getComputedStyle(stage).top),end=scrollY+s.getBoundingClientRect().top-top+s.offsetHeight-stage.clientHeight;scrollTo({top:end+48,behavior:'instant'});});await stable(page);
   const state=await page.evaluate(()=>({y:scrollY,top:document.querySelector('.kiku-story-stage').getBoundingClientRect().top,chrome:document.querySelector('.v2-case-nav').getBoundingClientRect().bottom,selected:document.querySelector('[data-model-stage]').dataset.selected}));
   assert.ok(state.top<state.chrome-20,'Regression begins beyond full sticky range: '+JSON.stringify(state));return state;
  }
  const boundaryBefore=await lowerBoundary();
  if(!(await details.evaluate(e=>e.open))){await hit(details.locator('summary'));await details.locator('summary').click();}
  assert.ok(await details.evaluate(e=>e.open),'Inspector details open');await stable(page);
  const boundaryAfter=await assertFramed(page,name+'-inspector-boundary');
  if(boundaryBefore){assert.equal(await page.locator('[data-model-stage]').getAttribute('data-selected'),boundaryBefore.selected,'Opening inspector preserves selection while reframing');fs.writeFileSync(path.join(out,name+'-inspector-boundary.json'),JSON.stringify({before:boundaryBefore,after:boundaryAfter},null,2));}

  const expected=['',...JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku/assembly.json'))).parts.map(p=>p.id),'pcb',...JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku-hardware/hardware.json'))).items.map(p=>p.id)];
  assert.deepEqual(await page.locator('[data-part-select] option').evaluateAll(options=>options.map(o=>o.value)),expected,'All original enclosure, PCB and four hardware groups remain selectable');
  for(const id of expected.filter(id=>id&&id!=='pcb'&&!JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku-hardware/hardware.json'))).items.some(item=>item.id===id)))await part(page,id);
  await part(page,'display_carrier');assert.match(await page.locator('[data-part-name]').innerText(),/Display cradle/);
  await part(page,'');await page.locator('input[data-explode]').fill('75');await page.waitForFunction(()=>Math.abs(Number(document.querySelector('[data-model-stage]').dataset.explode)-.75)<.001);
  await assertFramed(page,name+'-inspector-open');
  for(const control of await page.locator('[data-inspector-details] summary,[data-part-select],input[data-explode],button[data-view],[data-model-reset]').all())await hit(control);
  const openBounds=await page.locator('[data-model-stage]').boundingBox();assert.ok(openBounds.width>=180&&openBounds.height>=140,'Open inspector keeps a useful model viewport: '+JSON.stringify(openBounds));
  await shot(run,name+'-inspector-open');
  await page.locator('[data-model-mode="pcb"]').click();await page.waitForFunction(()=>document.querySelector('[data-model-stage]').dataset.selected==='pcb');
  const selectedBoundary=await lowerBoundary();if(selectedBoundary){assert.equal(selectedBoundary.selected,'pcb','Native scroll preserves open-inspector selection');await part(page,'pcb');await assertFramed(page,name+'-part-selection-boundary');}
  for(const view of ['front','iso','rear']){await camera(page,view);await canvasShot(page,name+'-pcb-'+view);}
  const hardware=JSON.parse(fs.readFileSync(path.join(root,'assets/models/kiku-hardware/hardware.json'))).items;
  for(const item of hardware){await part(page,item.id);await page.locator('input[data-explode]').fill('0');await camera(page,'iso');await canvasShot(page,name+'-hardware-'+item.id);}
  await page.locator('[data-model-all]').click();await part(page,'');await page.locator('input[data-explode]').fill('0');
  for(const view of ['front','rear']){await camera(page,view);await canvasShot(page,name+'-complete-'+view);}
  await page.locator('input[data-explode]').fill('100');await camera(page,'iso');await canvasShot(page,name+'-complete-exploded');await camera(page,'front');await canvasShot(page,name+'-complete-exploded-front');
  await part(page,'pcb');await camera(page,'iso');const stage=page.locator('[data-model-stage]');await stage.focus();
  const keyboardBefore=await page.locator('[data-model-canvas]').screenshot();const angleBefore=Number(await stage.getAttribute('data-azimuth')),zoomBefore=Number(await stage.getAttribute('data-zoom'));
  await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await page.waitForTimeout(350);
  assert.equal(await stage.getAttribute('data-view'),'custom');assert.notEqual(Number(await stage.getAttribute('data-azimuth')),angleBefore,'Keyboard rotates model');assert.notEqual(Number(await stage.getAttribute('data-zoom')),zoomBefore,'Keyboard zooms model');
  assert.notDeepEqual(await page.locator('[data-model-canvas]').screenshot(),keyboardBefore,'Keyboard changes actual rendered pixels');
  async function modelPoint(){return page.locator('[data-model-canvas]').evaluate(e=>{const b=e.getBoundingClientRect(),top=Math.max(b.top+20,150),bottom=Math.min(b.bottom-20,innerHeight-30),x=b.left+b.width/2,y=(top+bottom)/2;const h=document.elementFromPoint(x,y);if(bottom-top<30||!(h===e||e.contains(h)))throw new Error('Model gesture point is obscured: '+JSON.stringify({b:b.toJSON(),top,bottom,hit:h?.outerHTML}));return{x,y};});}
  if(run.v.touch){
   const cdp=await run.context.newCDPSession(page);
   async function modelGesture(dx,dy){const{x,y}=await modelPoint();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);}
   const azimuth=await stage.getAttribute('data-azimuth');await modelGesture(50,0);assert.notEqual(await stage.getAttribute('data-azimuth'),azimuth,'Real horizontal touch rotates shared model');assert.equal(await stage.getAttribute('data-selected'),'pcb','Touch orbit preserves selected PCB');
   await modelPoint();const y=await page.evaluate(()=>scrollY);await modelGesture(0,-70);assert.ok(await page.evaluate(()=>scrollY)>y+3,'Vertical model swipe preserves native page scrolling');assert.equal(await stage.getAttribute('data-selected'),'pcb');await cdp.detach();
  }else{
   const point=await modelPoint(),azimuth=await stage.getAttribute('data-azimuth');await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+60,point.y+10,{steps:8});await page.mouse.up();await page.waitForTimeout(150);assert.notEqual(await stage.getAttribute('data-azimuth'),azimuth,'Pointer drag orbits shared model');assert.equal(await stage.getAttribute('data-selected'),'pcb');
   await stage.focus();const before=Number(await stage.getAttribute('data-zoom')),y=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,-100);await page.waitForTimeout(250);assert.notEqual(Number(await stage.getAttribute('data-zoom')),before,'Focused model wheel zooms');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<2,'Focused model wheel does not scroll the page');
   await page.locator('[data-part-select]').focus();const p=await modelPoint(),unfocusedY=await page.evaluate(()=>scrollY);await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,120);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>scrollY)>unfocusedY+3,'Unfocused model wheel preserves native scrolling');
  }
  await singleRenderer(run);
  for(const asset of ['/assets/models/kiku/assembly.json','/assets/models/kiku/assembly.bin','/assets/models/kiku-pcb/pcb.json','/assets/models/kiku-hardware/hardware.json'])assert.equal(run.requests.filter(p=>p===asset).length,1,'One shared asset pipeline: '+asset);
  assert.ok(run.requestURLs.includes('/assets/models/kiku-pcb/pcb.json?v=finish-20261018'),'Versioned PCB manifest');assert.ok(run.requestURLs.some(p=>/^\/assets\/models\/kiku-pcb\/pcb\.bin(?:\.gz)?\?v=finish-20261018$/.test(p)),'Matching versioned PCB binary and correct gzip suffix');
  assert.ok(!run.requests.some(p=>/\/(?:concepts|desk|stand|battery-cable|display-section)\.webp$/.test(p)),'No retired gallery requests');
  if(await details.evaluate(e=>e.open))await details.locator('summary').click();await page.locator('[data-kiku-pose="0"]').click();await stable(page);assert.equal(await stage.getAttribute('data-mode'),'story');assert.equal(await stage.getAttribute('data-selected'),'');
  if(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned'))){await scrollPose(page,.5);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-.5)<.002,'Native scroll story still works after inspector');}
  if(name==='desktop1440'){
   if(!(await details.evaluate(e=>e.open)))await details.locator('summary').click();await part(page,'pcb');await stage.focus();await loseContext(page);
   assert.ok(await page.locator('[data-model-load]').evaluate(e=>e===document.activeElement),'Inspector failure focus');await page.keyboard.press('Enter');await page.waitForSelector('[data-model-stage][data-ready="true"]',{timeout:120000});assert.ok(await stage.evaluate(e=>e===document.activeElement),'Inspector retry restores stage keyboard focus');await singleRenderer(run,2);assert.equal(await page.locator('[data-part-select] option').count(),15,'Retry does not duplicate inspector options');
   if(!(await details.evaluate(e=>e.open)))await details.locator('summary').click();await part(page,'pcb');await camera(page,'front');await canvasShot(page,name+'-pcb-retry');
   if(await details.evaluate(e=>e.open))await details.locator('summary').click();await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.querySelector('[data-kiku-story]').classList.contains('is-pinned'),null,{polling:50});await stable(page);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-.5)<.00006,'Live reduced motion keeps selected pose');await shot(run,name+'-live-reduced');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.querySelector('[data-kiku-story]').classList.contains('is-pinned'),null,{polling:50});await page.locator('[data-kiku-pose="0"]').click();await stable(page);
   await page.locator('[data-kiku-pose="0"]').focus();await loseContext(page);assert.ok(await page.locator('[data-kiku-story-load]').evaluate(e=>document.activeElement===e),'Context failure preserves focused control access');assert.equal(await page.locator('[data-kiku-story-poster]').evaluate(e=>getComputedStyle(e).visibility),'visible');await shot(run,name+'-context-loss');await page.locator('[data-kiku-story-load]').focus();await page.keyboard.press('Enter');await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:120000});assert.ok(await page.locator('[data-kiku-pose][aria-pressed="true"]').evaluate(e=>document.activeElement===e),'Retry restores preset keyboard focus');await singleRenderer(run,3);await shot(run,name+'-context-retry');
  }
  assert.deepEqual(run.errors,[],'No uncaught browser errors');fs.writeFileSync(path.join(out,name+'-report.json'),JSON.stringify({requests:run.requests,requestURLs:run.requestURLs,errors:run.errors},null,2));console.log('PASS '+name);
 }catch(error){await failure(run,name,error);throw error;}finally{await bounded(run.context.close(),5000,'Browser context cleanup');}
}
// Fresh initial navigations with CAD deliberately held in flight. No synthetic
// user events: wheel, pointer and key cancellation use browser input dispatch.
async function initialFragments(browser){
 const scenarios=[
  {name:'simulator',hash:'#simulator',restore:true},
  {name:'details',hash:'#details',restore:true},
  {name:'no-hash',hash:''},
  {name:'changed-hash',hash:'#simulator',change:'#details'},
  {name:'wheel-cancel',hash:'#simulator',input:'wheel'},
  {name:'pointer-cancel',hash:'#simulator',input:'pointerdown'},
  {name:'key-cancel',hash:'#simulator',input:'keydown'},
 ];
 async function bound(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out after '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}}
 async function settleScroll(page){
  await page.evaluate(()=>{window.__fragmentScroll={y:scrollY,at:performance.now()};});
  await page.waitForFunction(()=>{const s=window.__fragmentScroll;if(Math.abs(scrollY-s.y)>.5){s.y=scrollY;s.at=performance.now();}return performance.now()-s.at>300;},null,{polling:50,timeout:15000});
 }
 for(const scenario of scenarios){
  console.error('Checking delayed-CAD initial fragment: '+scenario.name);
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
  context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(30000);
  let release,markRequested;const held=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{markRequested=resolve;});
  const guard=setTimeout(release,45000),errors=[],requests=[];let page;
  try{
   await context.addInitScript(()=>{
    window.__kikuFragmentProbe={calls:[],input:[]};
    const original=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){window.__kikuFragmentProbe.calls.push({id:this.id,hash:location.hash,ready:document.querySelector('[data-kiku-story]')?.dataset.ready,options,time:performance.now()});return original.call(this,options);};
    for(const type of ['wheel','pointerdown','keydown'])addEventListener(type,event=>window.__kikuFragmentProbe.input.push({type,trusted:event.isTrusted,time:performance.now()}),{capture:true,passive:true});
   });
   await context.route('**/*',async request=>{
    const url=new URL(request.request().url());requests.push(url.pathname);
    if(url.origin!==new URL(base).origin||request.request().method()!=='GET')return request.abort();
    if(url.pathname==='/assets/models/kiku/assembly.bin'){markRequested();await held;}
    await request.continue();
   });
   page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
   await page.goto(base+route+scenario.hash,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('[data-kiku-story]')?.dataset.target!==undefined,{}, {timeout:15000});
   await bound(requested,15000,'Initial assembly request');
   await page.evaluate(async()=>{await document.fonts.ready;});await settleScroll(page);
   assert.notEqual(await page.locator('[data-kiku-story]').getAttribute('data-ready'),'true','CAD remains gated before test input');
   assert.equal(await page.evaluate(()=>window.__kikuFragmentProbe.calls.length),0,'No initial restoration before CAD finishes');
   if(scenario.change){await page.evaluate(hash=>{location.hash=hash;},scenario.change);await settleScroll(page);}
   if(scenario.input==='wheel'){await page.mouse.move(720,450);await page.mouse.wheel(0,250);}
   else if(scenario.input==='pointerdown')await page.mouse.click(1420,450);
   else if(scenario.input==='keydown')await page.keyboard.press('Escape');
   if(scenario.input){await page.waitForFunction(type=>window.__kikuFragmentProbe.input.some(event=>event.type===type&&event.trusted),scenario.input,{timeout:15000});await settleScroll(page);}
   if(!scenario.restore){
    // Deliberately leave the original anchor before the async layout completes.
    // Any stale scrollIntoView is both observable and an unwanted pullback.
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.waitForFunction(()=>scrollY<2,{}, {timeout:15000});await settleScroll(page);
   }
   release();clearTimeout(guard);
   await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:60000});
   if(scenario.restore)await page.waitForFunction(hash=>window.__kikuFragmentProbe.calls.some(call=>call.id===hash.slice(1)),scenario.hash,{timeout:15000});
   // The production restoration runs two animation frames after successful CAD
   // layout. Observe later than those frames without depending on image loading.
   await bound(page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))),5000,'Post-layout frames');
   await page.waitForTimeout(150);
   const snapshot=await page.evaluate(hash=>{const target=hash?document.getElementById(hash.slice(1)):null;return{hash:location.hash,y:scrollY,height:innerHeight,topChrome:(document.querySelector('.v2-header')?.offsetHeight||0)+(document.querySelector('.v2-case-nav')?.offsetHeight||0),ready:document.querySelector('[data-kiku-story]').dataset.ready,target:target?.getBoundingClientRect().toJSON(),probe:window.__kikuFragmentProbe};},scenario.hash);
   if(scenario.restore){
    assert.equal(snapshot.hash,scenario.hash);assert.equal(snapshot.probe.calls.length,1,'Restore exactly once: '+scenario.name);
    assert.equal(snapshot.probe.calls[0].id,scenario.hash.slice(1));assert.equal(snapshot.probe.calls[0].ready,'true','Restore follows successful CAD layout');
    assert.ok(snapshot.target.top>=-1&&snapshot.target.top<snapshot.height-100&&snapshot.target.bottom>0,'Initial fragment remains in viewport after pinning: '+scenario.name+' '+JSON.stringify(snapshot.target));
   }else{
    assert.equal(snapshot.hash,scenario.change||scenario.hash,'Preserve latest hash');
    assert.equal(snapshot.probe.calls.length,0,'No stale fragment restore after '+scenario.name);
    if(!scenario.hash)assert.ok(snapshot.y<2,'No-hash load stays at top');else{
     // Browser-native anchoring can retain a header-sized offset during pinning.
     // A stale application restore would instead jump to the old distant target.
     assert.ok(snapshot.y<=snapshot.topChrome+2&&snapshot.target.top>=snapshot.height,'No delayed pullback to old target after '+scenario.name+': '+JSON.stringify({y:snapshot.y,topChrome:snapshot.topChrome,target:snapshot.target.top}));
    }
   }
   // Resize performs another layout. Scroll back without an input event first,
   // so this proves the restoration itself is one-shot, not merely cancelled.
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.setViewportSize({width:1440,height:880});await page.setViewportSize({width:1440,height:900});
   await page.waitForTimeout(250);
   const after=await page.evaluate(()=>({y:scrollY,calls:window.__kikuFragmentProbe.calls,hash:location.hash}));
   assert.equal(after.calls.length,snapshot.probe.calls.length,'Later layout cannot repeat restoration');
   assert.ok(after.y<2,'Later layout cannot pull the reader back');assert.deepEqual(errors,[]);
   fs.writeFileSync(path.join(out,'initial-fragment-'+scenario.name+'.json'),JSON.stringify({scenario,snapshot,after,requests,errors},null,2));
   console.log('PASS initial fragment '+scenario.name+' (delayed real CAD, browser input and one-shot scroll evidence)');
  }catch(error){
   if(page&&!page.isClosed()){
    try{await page.screenshot({path:path.join(out,'initial-fragment-'+scenario.name+'-failure.png'),timeout:5000});}catch(_){}
    try{const state=await bound(page.evaluate(()=>({hash:location.hash,y:scrollY,story:{...document.querySelector('[data-kiku-story]')?.dataset},probe:window.__kikuFragmentProbe})),2500,'Fragment diagnostic');fs.writeFileSync(path.join(out,'initial-fragment-'+scenario.name+'-failure.json'),JSON.stringify({error:String(error),state,errors,requests},null,2));}catch(_){}
   }
   throw error;
  }finally{release();clearTimeout(guard);await bound(context.close(),5000,'Fragment context cleanup');}
 }
}
async function fallbacks(browser,webkit=false){
 for(const [name,options] of Object.entries(webkit?{webkit:{},'webkit-reduced':{reduced:true}}:{'no-js':{noJS:true},reduced:{reduced:true},'save-data':{saveData:true},'no-webgl':{noGL:true},'model-failure':{failModel:true},'pcb-failure':{failPCB:true},'hardware-failure':{failHardware:true},'raw-binary':{noDecompression:true},'wasm-failure':{failWasm:true},'short-landscape':{}})){
  const run=await open(browser,name==='short-landscape'?{width:844,height:390,touch:true}:viewports.phone390,options),{page}=run;
  try{
   if(options.noJS||options.reduced||options.saveData)assert.ok(!run.requests.includes('/assets/models/kiku/assembly.bin'),'No unsolicited CAD');
   if(options.noGL||options.failModel||options.failPCB||options.failHardware)await page.waitForSelector('[data-kiku-story][data-ready="false"]');
   if(!options.noJS&&!options.reduced&&!options.saveData&&!options.noGL&&!options.failModel&&!options.failPCB&&!options.failHardware)await page.waitForFunction(()=>['true','false'].includes(document.querySelector('[data-kiku-story]').dataset.ready));
   if(!options.noJS&&name==='short-landscape')assert.equal(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned')),false);
   await shot(run,name+'-hero');if(options.noDecompression){assert.ok(run.requests.includes('/assets/models/kiku-pcb/pcb.bin'));assert.ok(!run.requests.includes('/assets/models/kiku-pcb/pcb.bin.gz'));}
   if(options.reduced||options.saveData||options.failModel||options.failPCB||options.failHardware){run.gates.model=false;run.gates.pcb=false;run.gates.hardware=false;await page.locator('[data-kiku-story-load]').focus();await page.keyboard.press('Enter');await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:120000});assert.ok(await page.locator('[data-kiku-pose][aria-pressed="true"]').evaluate(e=>document.activeElement===e),'Explicit load restores keyboard control focus');await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-progress'),'0.50000');if(!options.failModel&&!options.failPCB&&!options.failHardware)assert.equal(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned')),false);await shot(run,name+'-manual-load');}
   if(options.noGL){await page.locator('[data-kiku-story-load]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('[data-kiku-story-load]').disabled);assert.ok(await page.locator('[data-kiku-story-load]').evaluate(e=>document.activeElement===e),'Failed explicit retry retains keyboard focus');}
   await page.locator('.kiku-story .kiku-primary').click();await page.waitForURL('**#simulator');
   if(!options.noJS){await page.waitForSelector(options.failWasm?'[data-kiku-mounted="error"]':'.kiku-sim');if(!options.failWasm){await page.locator('.kiku-sim-canvas').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.kiku-look-choice').count(),10);}}
   await shot(run,name+'-simulator');await page.locator('[data-model-stage]').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForFunction(()=>document.querySelector('[data-model-poster]').complete&&document.querySelector('[data-model-poster]').naturalWidth===1200);assert.match(await page.locator('[data-model-poster]').getAttribute('src'),/v2-product-assembly\.png\?v=finish-20261018$/);assert.equal(await page.locator('[data-model-poster]').evaluate(e=>getComputedStyle(e).mixBlendMode),'normal');const ready=await page.locator('[data-kiku-story]').getAttribute('data-ready');assert.equal(await page.locator('[data-model-load]').isVisible(),!options.noJS&&ready!=='true','Only an unavailable renderer exposes load control');assert.equal(await page.locator('[data-model-canvas]').count(),1);if(ready==='true')await singleRenderer(run);await shot(run,name+'-single-stage-fallback');assert.deepEqual(run.errors,[]);console.log('PASS '+name);
  }catch(error){await failure(run,name,error);throw error;}finally{await bounded(run.context.close(),5000,'Fallback context cleanup');}
 }
}
// Evidence capture uses the same real renderer and assets, with only page layout
// made deterministic. It runs first so geometry review survives later failures.
async function capturePoster(browser,diagnostic=null){
 const run=await open(browser,{width:1440,height:1500},diagnostic?{diagnosticHideMeshes:diagnostic.ids}:{}),{page}=run;
 try{
  await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:120000});await singleRenderer(run);
  await page.evaluate(()=>{
   const story=document.querySelector('[data-kiku-story]');story.style.height='1100px';
   for(const e of story.querySelectorAll('.kiku-story-copy,.kiku-story-scroll,.kiku-story-qualification'))e.style.display='none';
   Object.assign(story.querySelector('.kiku-story-stage').style,{display:'block',position:'fixed',top:'0',left:'0',zIndex:'99999',width:'1200px',height:'1000px',maxWidth:'none',minHeight:'0',padding:'0',margin:'0'});
   Object.assign(story.querySelector('[data-model-stage]').style,{width:'1200px',height:'1000px',maxWidth:'none',aspectRatio:'auto',border:'0',margin:'0'});
  });
  await page.locator('[data-model-stage]').scrollIntoViewIfNeeded();await page.locator('[data-kiku-pose="0"]').evaluate(e=>e.click());await stable(page);await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-progress'),'0.00000','Assembled product capture');
  async function capture(name,pose){
   const bounds=await page.locator('[data-model-canvas]').boundingBox();assert.deepEqual(bounds,{x:0,y:0,width:1200,height:1000},'Integer, unobscured native capture viewport');
   await canvasShot(page,name,{nativeCapture:true});
   const pixels=fs.readFileSync(path.join(out,name+'.png')),{PNG}=require('pngjs'),im=PNG.sync.read(pixels);assert.equal(im.width,1200);assert.equal(im.height,1000);
   const evidence=JSON.parse(fs.readFileSync(path.join(out,name+'.json')));
   fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({...evidence,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sha256:require('node:crypto').createHash('sha256').update(pixels).digest('hex'),pose,renderer:'Chromium ANGLE SwiftShader, native WebGL canvas capture',diagnostic:diagnostic?{label:diagnostic.name,hiddenNativeBatches:diagnostic.ids,publishable:false,scope:'Response-only material opacity override; geometry and camera bounds unchanged'}:null,errors:run.errors},null,2));
  }
  if(!diagnostic){
   await capture('kiku-product-poster','assembled, progress 0');
   await page.locator('input[data-explode]').evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('button[data-view="iso"]').evaluate(e=>e.click());
   await capture('kiku-populated-poster','complete assembly, full separation, iso');
  }
  await page.locator('[data-part-select]').evaluate(e=>{e.value='pcb';e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('[data-model-stage]').dataset.selected==='pcb');
  for(const view of (diagnostic?['iso','rear']:['front','iso','rear'])){await page.locator('button[data-view="'+view+'"]').evaluate(e=>e.click());await capture((diagnostic?'diagnostic-only-'+diagnostic.name:'early-pcb')+'-'+view,'PCB isolation, '+view);}
  if(!diagnostic){fs.copyFileSync(path.join(out,'early-pcb-front.png'),path.join(out,'kiku-pcb-poster.png'));fs.copyFileSync(path.join(out,'early-pcb-front.json'),path.join(out,'kiku-pcb-poster.json'));}
  assert.deepEqual(run.errors,[]);console.log('PASS '+(diagnostic?'nonpublishable layer diagnostic '+diagnostic.name:'native assembled poster and early PCB geometry captures'));
 }catch(error){await failure(run,'poster',error);throw error;}finally{await bounded(run.context.close(),5000,'Poster context cleanup');}
}
(async()=>{
 source();if(args.includes('--source-only'))return;fs.mkdirSync(out,{recursive:true});
 const watchdog=setTimeout(()=>{console.error('Browser verification exceeded 840 seconds');process.exit(1);},840000);watchdog.unref();
 const{chromium,webkit}=require('playwright'),isWK=args.includes('--webkit');
 const browser=await(isWK?webkit:chromium).launch({headless:true,...(isWK?{}:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})});
 try{if(args.includes('--capture-poster')){await capturePoster(browser);for(const diagnostic of [{name:'no-mask',ids:['pcb_soldermask']},{name:'no-copper',ids:['pcb_copper']},{name:'no-vias-pads',ids:['pcb_via','pcb_pad']}])await capturePoster(browser,diagnostic);}else if(isWK||args.includes('--fallbacks'))await fallbacks(browser,isWK);else{const viewport=args.find(a=>a.startsWith('--viewport='))?.split('=')[1]||'desktop1440';await matrix(browser,viewport);if(viewport==='desktop1440')await initialFragments(browser);}}
 finally{try{await bounded(browser.close(),30000,'Browser process cleanup');}finally{clearTimeout(watchdog);}}
})().catch(e=>{console.error(e);process.exitCode=1;});

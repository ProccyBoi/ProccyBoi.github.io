/* Navigation is foreground content; the existing real CAD is decorative.
 * Browser evidence uses native scrolling and the production owned GPU queues.
 * V2_NAV_OUT=/tmp/v2-navigation node scripts/verify-v2-navigation-clarity.cjs
 * --group=desktop|mobile390|mobile320|fallbacks|lifecycle|routes|profile
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'v2/index.html'),'utf8');
const routes=['framework-expansion-card','framework-dual-usb','framework-raspberry-pi','framework-logic-analyser','metroboard','tramtrace','skylabs'].map(x=>'/v2/projects/'+x+'/');
const ids=['work','work-framework','work-transit','skylabs-aircraft','skylabs-telemetry','about'];
function sourceChecks(){
 for(const attr of ['data-assembly-background','data-selected-background-scene','data-aircraft-ambient'])assert.ok(html.includes(attr),attr);
 for(const id of ids)assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' is a genuine unique anchor');
 for(const href of routes)assert.equal((html.match(new RegExp('href="'+href+'"','g'))||[]).length,1,href+' has one homepage project entry');
 assert.doesNotMatch(html,/data-assembly-select|data-assembly-explore|data-assembly-caption|data-aircraft-go|data-aircraft-skip|v2-work-browse|Skip animation|Explore the transition/);
 assert.equal((html.match(/<button\b/g)||[]).length,1,'Only the global mobile menu is a homepage button');
 const nav=html.match(/<nav class="v2-nav"[\s\S]*?<\/nav>/)[0];
 assert.deepEqual([...nav.matchAll(/<a[^>]+href="([^"]+)"/g)].map(x=>x[1]),['/v2/projects/','/v2/about/','/assets/documents/Andrew_Chung_Public_CV.pdf','/v2/about/#contact']);
 for(const file of ['assets/v2-selected-scene.js','assets/v3-aircraft-scene.js','assets/v3-aircraft-electronics.js','assets/v3-aircraft-atmosphere.js','assets/v2-gpu-preparation.js']){
  const old=require('node:child_process').execFileSync('git',['show','649bc32ccbabf1c67cbf19628da42b6dbd836be1:'+file],{cwd:root});
  assert.ok(old.equals(fs.readFileSync(path.join(root,file))),file+' accepted geometry and queue helper preserved');
 }
 console.log('PASS source: single routes, genuine anchors, simple primary navigation, no scene controls, unchanged scene geometry/helper');
}
sourceChecks();if(process.argv.includes('--source-only'))process.exit(0);
const {chromium}=require('playwright');
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080',out=process.env.V2_NAV_OUT||'/tmp/v2-navigation';fs.mkdirSync(out,{recursive:true});
const group=(process.argv.find(x=>x.startsWith('--group='))||'--group=desktop').split('=')[1],results=[];
let activePage;
function probe(){
 const p=window.__navProbe={contexts:[],events:[],longTasks:[],mutations:[],prevented:[],holds:{},fences:[],drawsWhilePending:[],errors:[]};
 try{new PerformanceObserver(list=>list.getEntries().forEach(x=>p.longTasks.push({start:x.startTime,duration:x.duration}))).observe({type:'longtask',buffered:true});}catch{}
 const original=HTMLCanvasElement.prototype.getContext,byContext=new WeakMap();
 HTMLCanvasElement.prototype.getContext=function(type,...args){const gl=original.call(this,type,...args);if(gl&&/webgl/.test(type)&&!byContext.has(gl)){
  const name=this.hasAttribute('data-assembly-canvas')?'hero':this.hasAttribute('data-selected-canvas')?'selected':this.hasAttribute('data-aircraft-canvas')?'aircraft':'other';
  const record={name,at:performance.now(),draws:0,pending:0,maxPending:0};byContext.set(gl,record);p.contexts.push(record);
  if(gl.fenceSync){const owned=new Map(),make=gl.fenceSync.bind(gl),poll=gl.clientWaitSync.bind(gl),drop=gl.deleteSync.bind(gl);
   gl.fenceSync=(...a)=>{const sync=make(...a);if(sync){const r={name,at:performance.now(),deleted:0,polls:0};owned.set(sync,r);p.fences.push(r);record.pending++;record.maxPending=Math.max(record.pending,record.maxPending);}return sync;};
   gl.clientWaitSync=(sync,flags,timeout)=>{assertNoBlock(timeout);const r=owned.get(sync);if(r)r.polls++;const status=poll(sync,flags,timeout);if(p.holds[name])return gl.TIMEOUT_EXPIRED;return status;};
   gl.deleteSync=sync=>{const r=owned.get(sync);if(r){r.deleted++;r.end=performance.now();record.pending--;}drop(sync);};
  }
  for(const method of ['drawElements','drawArrays']){const draw=gl[method].bind(gl);gl[method]=(...a)=>{record.draws++;if(record.pending)p.drawsWhilePending.push({name,at:performance.now(),pending:record.pending});return draw(...a);};}
 }return gl;};
 function assertNoBlock(timeout){if(timeout!==0)p.errors.push('Blocking fence timeout '+timeout);}
 const prevent=Event.prototype.preventDefault;Event.prototype.preventDefault=function(){if(['wheel','touchstart','touchmove'].includes(this.type))p.prevented.push(this.type);return prevent.call(this);};
 for(const type of ['wheel','touchstart','touchmove','keydown','click'])addEventListener(type,e=>{if(e.isTrusted)p.events.push({type,at:performance.now(),y:scrollY,key:e.key||null});},{passive:true});
 addEventListener('DOMContentLoaded',()=>{const observed=['[data-assembly]','[data-selected-work]','[data-aircraft-hero]'];for(const selector of observed){const node=document.querySelector(selector);if(!node)continue;new MutationObserver(records=>{for(const r of records){if(/(frames|pending|ready|state|foreground|visible|models|progress)/i.test(r.attributeName)){const h=document.querySelector('[data-assembly]');p.mutations.push({at:performance.now(),selector,attr:r.attributeName,value:node.getAttribute(r.attributeName),y:scrollY,heroSettled:h?.dataset.assemblyForegroundSettled,heroVisible:h?.dataset.assemblyReadableVisible});}}}).observe(node,{attributes:true});}});
}
async function context(browser,options={}){const c=await browser.newContext({viewport:{width:1440,height:1000},...options});await c.addInitScript(probe);const p=await c.newPage();activePage=p;p._errors=[];p.on('pageerror',e=>p._errors.push(String(e)));return{c,p};}
async function open(p,hash=''){await p.goto(base+'/v2/'+hash,{waitUntil:'domcontentloaded'});await p.evaluate(()=>document.fonts.ready);}
async function decode(p){await p.locator('img').evaluateAll(images=>Promise.all(images.filter(x=>x.currentSrc||x.src).map(x=>x.decode().catch(()=>{}))));}
async function shot(p,name){await decode(p);await p.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running'),null,{timeout:10000});await p.screenshot({path:path.join(out,name+'.png')});}
async function saveFailure(p){if(p&&!p.isClosed()){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(await state(p).catch(()=>({})),null,2));}}
async function state(p){return p.evaluate(()=>({y:scrollY,height:innerHeight,docHeight:document.documentElement.scrollHeight,hero:{...document.querySelector('[data-assembly]').dataset},selected:{...document.querySelector('[data-selected-work]').dataset},aircraft:{...document.querySelector('[data-aircraft-hero]').dataset},probe:window.__navProbe}));}
async function waitHero(p){await p.waitForFunction(()=>{const d=document.querySelector('[data-assembly]').dataset;return d.assemblyModelsReady==='3'&&d.assemblyGPUPending!=='true'&&d.assemblyForegroundSettled==='true';},{},{timeout:120000});}
async function settled(p,scene){await p.waitForFunction(scene=>{const n=document.querySelector(scene==='selected'?'[data-selected-work]':'[data-aircraft-hero]'),d=n.dataset,k=scene==='selected'?'selected':'aircraft';return d[k+'State']==='ready'&&d[k+'GPUPending']!=='true'&&d[k+'WarmMask']!=='true'&&Number(d[k+'CompletedFrames'])>0&&Math.abs(Number(d[k+'Progress'])-Number(d[k+'RenderedProgress']))<.001;},scene,{timeout:150000});}
async function scrollSection(p,id,offset=0){await p.evaluate(({id,offset})=>{const n=document.getElementById(id),header=document.querySelector('.v2-header').getBoundingClientRect().bottom;scrollTo({top:scrollY+n.getBoundingClientRect().top-header+offset,behavior:'instant'});},{id,offset});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function readable(p){const report=await p.evaluate(()=>{
 const links=[...document.querySelectorAll('[data-selected-chapter] a,[data-aircraft-copy] a')];return{overflow:document.documentElement.scrollWidth>innerWidth,links:links.map(n=>({href:new URL(n.href).pathname,inert:!!n.closest('[inert]'),hidden:!!n.closest('[aria-hidden="true"]'),display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,tabIndex:n.tabIndex,height:n.getBoundingClientRect().height})),controls:document.querySelectorAll('.v2-selected-nav,.v2-selected-skip,.v2-framework-interaction,[data-assembly-select],[data-aircraft-go],[data-aircraft-skip]').length,anchors:['work-framework','work-transit','skylabs-aircraft','skylabs-telemetry'].map(id=>({id,tag:document.getElementById(id)?.tagName}))};});
 assert.equal(report.overflow,false,'No horizontal overflow');assert.equal(report.controls,0,'No decorative scene controls generated');assert.deepEqual(report.links.map(x=>x.href),routes);for(const l of report.links){assert.equal(l.inert||l.hidden,false,'Project never hidden/inert');assert.notEqual(l.display,'none');assert.equal(l.visibility,'visible');assert.equal(l.tabIndex,0);assert.ok(l.height>=44,'Project tap target');}assert.ok(report.anchors.every(x=>['SECTION','ARTICLE'].includes(x.tag)),'Hashes belong to real content');return report;
}
async function assertions(p){assert.deepEqual(p._errors,[]);const s=await state(p);assert.deepEqual(s.probe.errors,[]);assert.deepEqual(s.probe.prevented,[]);assert.deepEqual(s.probe.drawsWhilePending,[],'One outstanding draw per context');assert.ok(s.probe.contexts.length<=3,'At most the existing three WebGL contexts');assert.ok(s.probe.contexts.every(x=>x.maxPending<=1));return s;}
async function journey(browser,width){const {c,p}=await context(browser,{viewport:{width,height:width<500?900:1000},isMobile:width<500,hasTouch:width<500});try{
 await open(p);await waitHero(p);await readable(p);await shot(p,'hero-'+width);const initial=await state(p);
 const early=initial.probe.mutations.filter(x=>x.selector!=='[data-assembly]'&&/warm-frames|preparation-frames/.test(x.attr)&&Number(x.value)>0&&x.heroVisible==='true'&&x.heroSettled!=='true');assert.deepEqual(early,[],'No offscreen secondary warm competes with initial visible hero');
 await scrollSection(p,'work-framework');await settled(p,'selected');await shot(p,'framework-'+width);await readable(p);
 await p.mouse.move(width/2,480);const before=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,120);await p.waitForFunction(y=>scrollY>y,before);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settled(p,'selected');await p.mouse.wheel(0,-120);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settled(p,'selected');
 await scrollSection(p,'work-transit');await settled(p,'selected');await shot(p,'transit-'+width);await readable(p);
 // Ordinary Tab order is allowed to scroll to its focused link, but scene
 // updates must never redirect focus or hide a remaining project entry.
 const projectLinks=p.locator('[data-selected-chapter] a,[data-aircraft-copy] a');await projectLinks.first().focus();for(let i=0;i<routes.length;i++){assert.equal(await p.evaluate(()=>new URL(document.activeElement.href).pathname),routes[i]);await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>new URL(document.activeElement.href).pathname),routes[i]);if(i<routes.length-1)await p.keyboard.press('Tab');}
 await scrollSection(p,'skylabs-aircraft');await settled(p,'aircraft');await shot(p,'aircraft-'+width);await readable(p);
 await scrollSection(p,'skylabs-telemetry');await settled(p,'aircraft');await shot(p,'telemetry-'+width);await readable(p);
 await scrollSection(p,'about');await shot(p,'about-'+width);const off1=await state(p);await p.waitForTimeout(1200);const off2=await state(p);assert.equal(off1.selected.selectedSubmittedFrames,off2.selected.selectedSubmittedFrames,'Selected stops offscreen');
 await p.evaluate(()=>{scrollTo({top:0,behavior:'instant'});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await waitHero(p);await shot(p,'hero-return-'+width);const final=await assertions(p);results.push({name:'journey-'+width,initial,final});
 }catch(error){await saveFailure(p);throw error;}finally{await c.close();}}
async function fallback(browser,name,options,init){const {c,p}=await context(browser,options);try{if(init)await p.addInitScript(init);await open(p);await decode(p);await readable(p);await shot(p,'fallback-'+name);if(options.javaScriptEnabled!==false){await p.waitForTimeout(200);assert.equal((await state(p)).probe.contexts.length,0,name+' no WebGL context');}await scrollSection(p,'work-framework');await shot(p,'fallback-'+name+'-work');await scrollSection(p,'skylabs-aircraft');await shot(p,'fallback-'+name+'-skylabs');assert.deepEqual(p._errors,[]);results.push({name});}catch(error){await saveFailure(p);throw error;}finally{await c.close();}}
async function routeChecks(browser){const {c,p}=await context(browser,{viewport:{width:390,height:844},reducedMotion:'reduce'});try{
 await open(p);await p.locator('[data-v2-menu]').click();assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');await p.locator('[data-v2-menu]').click();await p.locator('[data-v2-nav] a').filter({hasText:/^Work$/}).click();await p.waitForURL('**/v2/projects/');assert.equal(await p.locator('[data-v2-project][href^="/v2/projects/"]').count(),15);
 await p.locator('[data-v2-search]').fill('Framework');assert.equal(await p.locator('[data-v2-project]:visible').count(),4);await p.locator('[data-v2-search]').press('Escape');assert.equal(await p.locator('[data-v2-project]:visible').count(),15);
 for(const route of routes){await p.goto(base+route,{waitUntil:'domcontentloaded'});assert.equal(await p.locator('h1').count(),1);assert.deepEqual(await p.locator('[data-v2-nav] a').evaluateAll(items=>items.map(x=>x.textContent.trim().replace(/\s+/g,' '))),['Work','About','CV','Contact ↗']);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await p.goto(base+'/v2/about/#contact',{waitUntil:'domcontentloaded'});assert.equal(await p.locator('a[href="/v2/book/"]').count(),1);const cv=await c.request.get(base+'/assets/documents/Andrew_Chung_Public_CV.pdf');assert.equal(cv.status(),200);assert.ok((await cv.body()).subarray(0,4).toString()==='%PDF');results.push({name:'routes',errors:p._errors});assert.deepEqual(p._errors,[]);
 }catch(error){await saveFailure(p);throw error;}finally{await c.close();}}
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 if(group==='desktop')await journey(browser,1440);else if(group==='mobile390')await journey(browser,390);else if(group==='mobile320')await journey(browser,320);
 else if(group==='fallbacks'){
  await fallback(browser,'reduced',{viewport:{width:390,height:844},reducedMotion:'reduce'});
  await fallback(browser,'no-js',{viewport:{width:320,height:800},javaScriptEnabled:false});
  await fallback(browser,'short',{viewport:{width:844,height:390}});
  await fallback(browser,'save-data',{viewport:{width:390,height:844}},()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
 }
 else if(group==='routes')await routeChecks(browser);
 else throw new Error('Unknown group '+group);
 fs.writeFileSync(path.join(out,group+'.json'),JSON.stringify({group,results},null,2));console.log('PASS '+group);
 }catch(e){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(await state(activePage).catch(()=>({})),null,2));}throw e;}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

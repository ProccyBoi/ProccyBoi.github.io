#!/usr/bin/env node
/* Exact v2 Kiku scope + native browser interaction. Chromium/SwiftShader and
 * WebKit emulation establish browser behavior, not physical-device speed. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),baseline='3a582960c2d1e4d5efac313691f3b697501c5451';
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080',out=process.env.KIKU_OUT||'/tmp/kiku-evidence',args=process.argv.slice(2);
const route='/v2/projects/kiku/',viewports={desktop1440:{width:1440,height:900},phone320:{width:320,height:780,touch:true},phone390:{width:390,height:844,touch:true},ipad768:{width:768,height:1024,touch:true},ipad1024:{width:1024,height:768,touch:true},ipad1180:{width:1180,height:820,touch:true}};
const source=()=>{
 const allowed=new Set(['v2/projects/kiku/index.html','assets/v2-kiku.js','assets/v2-kiku.css','scripts/build-v2-cases.py','scripts/build-v3-pages.py','scripts/audit-v3.py','scripts/v3_interior_source.py','scripts/content/v3-kiku-source.html','scripts/content/v2-kiku-hero.html','scripts/verify-v2-kiku.cjs','.github/workflows/verify-v2-kiku.yml']);
 const changed=execFileSync('git',['diff',baseline,'--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const file of changed)assert.ok(allowed.has(file),'Unrelated file changed: '+file);
 for(const file of ['assets/models/kiku/assembly.json','assets/models/kiku/assembly.bin','assets/kiku-simulator.js','assets/kiku.js','assets/kiku.css','assets/kiku/firmware-ui.wasm','projects/kiku/index.html','v3/projects/kiku/index.html','v2/index.html'])assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:20e6}),'Preserve '+file);
 assert.deepEqual(fs.readFileSync(path.join(root,'scripts/content/v3-kiku-source.html')),execFileSync('git',['show',baseline+':v2/projects/kiku/index.html'],{cwd:root,maxBuffer:1e6}),'Exact frozen v3 source');
 const html=fs.readFileSync(path.join(root,'v2/projects/kiku/index.html'),'utf8');assert.match(html,/data-kiku-story/);assert.match(html,/Nine printed parts · P2 CAD study/);
 const regenerated=execFileSync('python3',['-c',`import runpy; from pathlib import Path; m=runpy.run_path('scripts/build-v2-cases.py'); p=Path('projects/kiku/index.html').resolve(); print(m['normalized'](m['enrich_case'](m['make_case'](p),'kiku')),end='')`],{cwd:root,encoding:'utf8'});assert.equal(html,regenerated,'V2 regeneration');
 console.log('PASS exact Kiku-only production boundary, original meshes/firmware and root/v3 preservation, regeneration');
};
async function open(browser,v,options={}){
 const context=await browser.newContext({viewport:{width:v.width,height:v.height},hasTouch:!!v.touch,isMobile:!!v.touch,deviceScaleFactor:1,reducedMotion:options.reduced?'reduce':'no-preference',javaScriptEnabled:!options.noJS,serviceWorkers:'block'});
 const requests=[],errors=[];
 if(options.saveData)await context.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){}}}));
 if(options.noGL)await context.addInitScript(()=>{const old=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...a){return /webgl/.test(type)?null:old.call(this,type,...a);};});
 await context.route('**/*',r=>{const u=new URL(r.request().url());requests.push(u.pathname);if(u.origin!==new URL(base).origin||r.request().method()!=='GET'||(options.failModel&&u.pathname.endsWith('assembly.bin'))||(options.failWasm&&u.pathname.endsWith('.wasm')))return r.abort();return r.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+route,{waitUntil:'networkidle'});return{context,page,requests,errors,v};
}
async function stable(page){await page.waitForFunction(()=>{const s=document.querySelector('[data-kiku-story]');const x=s.dataset.frames||'0';window.__kikuStable=window.__kikuStable||{value:x,at:performance.now()};if(window.__kikuStable.value!==x)window.__kikuStable={value:x,at:performance.now()};return performance.now()-window.__kikuStable.at>220;},{},{timeout:30000});}
async function shot(run,name){await stable(run.page);await run.page.screenshot({path:path.join(out,name+'.png')});const data=await run.page.evaluate(()=>({width:innerWidth,height:innerHeight,y:scrollY,overflow:document.documentElement.scrollWidth>innerWidth+1,story:{...document.querySelector('[data-kiku-story]').dataset},active:document.activeElement?.getAttribute('aria-label')}));assert.equal(data.overflow,false,name+' overflow');fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));}
async function hit(locator){assert.ok(await locator.isVisible(),'Visible '+await locator.innerText());assert.ok(await locator.evaluate(e=>{const r=e.getBoundingClientRect();const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===h||e.contains(h);}), 'Hit target '+await locator.innerText());}
async function scrollPose(page,p){await page.evaluate(p=>{const s=document.querySelector('[data-kiku-story]'),stage=s.querySelector('.kiku-story-stage');scrollTo({top:scrollY+s.getBoundingClientRect().top-parseFloat(getComputedStyle(stage).top)+(s.offsetHeight-stage.clientHeight)*p,behavior:'instant'});},p);await stable(page);}
async function matrix(browser,name){
 const run=await open(browser,viewports[name]),{page}=run;
 try{
  await page.waitForSelector('[data-kiku-story][data-ready="true"]',{timeout:120000});await stable(page);
  assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-parts'),'9');
  await shot(run,name+'-exterior');
  for(const b of await page.locator('[data-kiku-pose]').all())await hit(b);
  await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-progress'),'0.50000');await shot(run,name+'-layers');
  await page.locator('[data-kiku-pose="1"]').click();await page.locator('[data-kiku-pose="0"]').click();await page.locator('[data-kiku-pose="1"]').click();await stable(page);await shot(run,name+'-rear');
  await page.locator('[data-kiku-pose="0"]').focus();await page.keyboard.press('Enter');await stable(page);assert.equal(await page.locator('[data-kiku-pose="0"]').getAttribute('aria-pressed'),'true');
  if(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned'))){for(const p of [.5,.9,.2]){await scrollPose(page,p);assert.ok(Math.abs(Number(await page.locator('[data-kiku-story]').getAttribute('data-progress'))-p)<.002);await shot(run,name+'-scroll-'+p);}const y=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,130);await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>scrollY)>y,'Native wheel scroll');}
  if(name.startsWith('ipad')){await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);await page.setViewportSize({width:run.v.height,height:run.v.width});await stable(page);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-progress'),'0.50000','Explicit pose survives orientation');await shot(run,name+'-rotated');await page.setViewportSize({width:run.v.width,height:run.v.height});await stable(page);}
  await page.locator('.kiku-story .kiku-primary').click();await page.waitForURL('**#simulator');await page.waitForSelector('.kiku-sim[data-enhanced="true"]');
  await page.locator('.kiku-sim-display').scrollIntoViewIfNeeded();await shot(run,name+'-simulator');
  const looks=page.locator('.kiku-look-choice');assert.equal(await looks.count(),10);for(let i=0;i<10;i++){await looks.nth(i).click();assert.equal(await looks.nth(i).getAttribute('aria-pressed'),'true');}
  await looks.first().click();const before=await page.locator('.kiku-sim-state').innerText();const d=await page.locator('.kiku-sim-press').boundingBox();await page.mouse.move(d.x+d.width/2,d.y+d.height/2);await page.mouse.down();await page.mouse.move(d.x+d.width/2+28,d.y+d.height/2,{steps:8});await page.mouse.up();assert.notEqual(await page.locator('.kiku-sim-state').innerText(),before,'Dial turns state');assert.equal(await page.locator('.kiku-sim').getAttribute('data-screen'),'0','Drag does not also press');
  await page.locator('.kiku-sim-reset').click();await page.locator('.kiku-sim-canvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.notEqual(await page.locator('.kiku-sim').getAttribute('data-screen'),'0');
  await page.locator('[data-source="fm"]').click();assert.equal(await page.locator('[data-signal-input]').innerText(),'FM broadcast');await page.locator('[data-source="bt"]').click();assert.match(await page.locator('[data-signal-description]').innerText(),/no Bluetooth-headphone transmit path/);await shot(run,name+'-signal');
  const f=await page.locator('[data-kiku-story]').getAttribute('data-frames');await page.waitForTimeout(500);assert.equal(await page.locator('[data-kiku-story]').getAttribute('data-frames'),f,'No offscreen rendering');
  await page.locator('[data-model-load]').click();await page.waitForSelector('[data-model-stage][data-ready="true"]',{timeout:120000});assert.equal(await page.locator('[data-part-list] button').count(),9);await page.locator('[data-part-list] button').nth(5).click();assert.equal(await page.locator('[data-part-name]').innerText(),'Display cradle');await page.locator('[data-model-all]').click();await page.locator('[data-explode]').fill('75');await shot(run,name+'-inspector');
  if(name==='desktop1440'){
   await page.locator('[data-kiku-pose="0.5"]').click();await stable(page);await page.emulateMedia({reducedMotion:'reduce'});await stable(page);assert.equal(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned')),false);await shot(run,name+'-live-reduced');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-kiku-pose="0"]').click();await stable(page);
   await page.locator('[data-kiku-story-canvas]').evaluate(c=>c.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());await page.waitForSelector('[data-kiku-story][data-ready="false"]');assert.equal(await page.locator('[data-kiku-story-poster]').evaluate(e=>getComputedStyle(e).visibility),'visible');await shot(run,name+'-context-loss');
  }
  assert.deepEqual(run.errors,[],'No uncaught browser errors');fs.writeFileSync(path.join(out,name+'-report.json'),JSON.stringify({requests:run.requests,errors:run.errors},null,2));console.log('PASS '+name);
 }finally{await run.context.close();}
}
async function fallbacks(browser,webkit=false){
 for(const [name,options] of Object.entries(webkit?{webkit:{},'webkit-reduced':{reduced:true}}:{'no-js':{noJS:true},reduced:{reduced:true},'save-data':{saveData:true},'no-webgl':{noGL:true},'model-failure':{failModel:true},'wasm-failure':{failWasm:true},'short-landscape':{}})){
  const run=await open(browser,name==='short-landscape'?{width:844,height:390,touch:true}:viewports.phone390,options),{page}=run;
  try{
   if(options.noJS||options.reduced||options.saveData)assert.ok(!run.requests.includes('/assets/models/kiku/assembly.bin'),'No unsolicited CAD');
   if(options.noGL||options.failModel)await page.waitForSelector('[data-kiku-story][data-ready="false"]');
   if(!options.noJS&&!options.reduced&&!options.saveData&&!options.noGL&&!options.failModel)await page.waitForFunction(()=>['true','false'].includes(document.querySelector('[data-kiku-story]').dataset.ready));
   if(!options.noJS&&name==='short-landscape')assert.equal(await page.locator('[data-kiku-story]').evaluate(e=>e.classList.contains('is-pinned')),false);
   await shot(run,name+'-hero');
   await page.locator('.kiku-story .kiku-primary').click();await page.waitForURL('**#simulator');
   if(!options.noJS){await page.waitForSelector(options.failWasm?'[data-kiku-mounted="error"]':'.kiku-sim');if(!options.failWasm){await page.locator('.kiku-sim-canvas').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.kiku-look-choice').count(),10);}}
   await shot(run,name+'-simulator');assert.deepEqual(run.errors,[]);console.log('PASS '+name);
  }finally{await run.context.close();}
 }
}
(async()=>{source();if(args.includes('--source-only'))return;fs.mkdirSync(out,{recursive:true});const{chromium,webkit}=require('playwright');const isWK=args.includes('--webkit');const browser=await(isWK?webkit:chromium).launch({headless:true,...(isWK?{}:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})});try{if(isWK||args.includes('--fallbacks'))await fallbacks(browser,isWK);else await matrix(browser,args.find(a=>a.startsWith('--viewport='))?.split('=')[1]||'desktop1440');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

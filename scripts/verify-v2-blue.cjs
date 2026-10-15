#!/usr/bin/env node
/* Blue v2 background acceptance. Native inputs and real completed CAD frames.
 * Chromium/SwiftShader and WebKit viewport emulation are not physical devices.
 * No production seek/capture APIs, substituted geometry or real form submits. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),baseline='d4066586dde0c971bd2fa0d4563be21b44c8c0ef';
const base=process.env.V2_BASE_URL||'http://127.0.0.1:8080';
const output=path.resolve(process.env.V2_BLUE_OUT||'.codex-temp/v2-blue');
const args=process.argv.slice(2),timeout=180000;
const {installProbe,currentFrame}=require('./verify-v3-product-browser.cjs');
const viewports={desktop1440:{width:1440,height:900},phone320:{width:320,height:780,touch:true},phone390:{width:390,height:844,touch:true},ipad768:{width:768,height:1024,touch:true},ipad820:{width:820,height:1180,touch:true},ipad1024:{width:1024,height:768,touch:true},ipad1180:{width:1180,height:820,touch:true},ipadpro1024:{width:1024,height:1366,touch:true}};
const routes=['tramtrace','skylabs/boards/telemetry','framework-raspberry-pi'].map(slug=>'/v2/projects/'+slug+'/');
const labels=['TramTrace','Telemetry','Raspberry Pi'];
const cases=['framework-expansion-card','framework-dual-usb','framework-raspberry-pi','framework-logic-analyser'];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function source(){
  const allowed=new Set(['v2/index.html','assets/v2.css','assets/v2-selected-work.js','assets/v2-home-controls.css','assets/v2-framework-scene.js']);
  const changed=execFileSync('git',['diff',baseline,'--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  for(const file of changed)assert.ok(allowed.has(file)||file.startsWith('scripts/')||file.startsWith('.github/'),'Production boundary: '+file);
  for(const file of execFileSync('git',['ls-tree','-r','--name-only',baseline],{cwd:root,encoding:'utf8'}).trim().split('\n')){
    if(file.startsWith('scripts/')||file.startsWith('.github/')||allowed.has(file))continue;
    assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:100*1024*1024}),'Byte-preserved '+file);
  }
  const html=read('v2/index.html'),controller=read('assets/v2-selected-work.js');
  assert.match(html,/data-framework-background/);assert.equal((html.match(/data-selected-chapter=/g)||[]).length,1);
  for(const text of ['v2-transport-collection','work-transit','data-assembly-kind','data-assembly-link'])assert.ok(!html.includes(text),'Removed homepage chrome: '+text);
  assert.ok(!controller.includes('data-framework-inspect'));assert.ok(!controller.includes("createElement('nav')"));
  for(const slug of cases)assert.ok(html.includes('href="/v2/projects/'+slug+'/"'),'Native Framework case remains: '+slug);
  assert.match(html,/href="\/v2\/projects\/">All projects/);assert.match(html,/aria-label="Preview featured project scenes"/);
  assert.match(read('assets/v2.css'),/body\.v2:not\(\.v3-product\)\{--v2-accent:#7bbcff/);
  const original=execFileSync('git',['show',baseline+':assets/v2-selected-scene.js'],{cwd:root,encoding:'utf8'}),scene=read('assets/v2-framework-scene.js');
  const factory=text=>text.slice(text.indexOf('  const dualRanges'),text.indexOf('  function create('));assert.equal(factory(scene),factory(original),'Original part ranges, transforms and assembly timing remain exact');
  console.log('PASS exact root/v3/cases/geometry/materials/hero/aircraft preservation; Framework-only homepage and scoped blue UI');
}
async function open(browser,viewport,options={}){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:!!viewport.touch,isMobile:!!viewport.touch,deviceScaleFactor:1,javaScriptEnabled:!options.noJS,reducedMotion:options.reduced?'reduce':'no-preference',serviceWorkers:'block',acceptDownloads:true});
  const requests=[],blocked=[];await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());requests.push(url.pathname);if(url.origin===new URL(base).origin&&request.method()==='GET')return route.continue();blocked.push({url:url.href,method:request.method()});return route.abort();});
  if(!options.noJS)await context.addInitScript({content:`(${installProbe.toString()})(); window.__v3ProductProbe.matches=(${currentFrame.toString()}); const read=window.__v3ProductProbe.read; window.__v3ProductProbe.read=kind=>{const sample=read(kind); if(kind==='selected' && sample?.dataset?.selectedInspectionRevision===undefined){delete sample.inspectionRevision;delete sample.inspectionPresentedRevision;delete sample.inspectionTarget;} return sample;};`});
  if(!options.noJS)await context.addInitScript(()=>{const original=window.scrollTo;window.__v2ScrollCommands=[];window.scrollTo=function(...args){window.__v2ScrollCommands.push({at:performance.now(),args});return original.apply(this,args);};});
  if(options.saveData)await context.addInitScript(()=>{Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){}}});});
  if(options.noWebGL)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...params){return /webgl/.test(type)?null:original.call(this,type,...params);};});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  return {context,page,viewport,options,errors,blocked,requests};
}
async function go(run,route='/v2/'){const response=await run.page.goto(base+route,{waitUntil:'domcontentloaded',timeout});assert.equal(response.status(),200);}
async function settled(page){
  // Driver-side observation also works when the page has JavaScript disabled;
  // Chromium correctly suppresses that page's requestAnimationFrame callbacks.
  let previous=NaN,since=Date.now();const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const y=await page.evaluate(()=>scrollY);if(!Number.isFinite(previous)||Math.abs(previous-y)>.1){previous=y;since=Date.now();}else if(Date.now()-since>180)return;await page.waitForTimeout(50);}
  throw new Error('Native scroll did not settle');
}
async function frame(page,kind){
  // A click can return before its native smooth scroll begins. Establish the
  // final scroll position before accepting that position's completed frame.
  await settled(page);
  await page.waitForFunction(kind=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind)),kind,{timeout,polling:50});
  await page.waitForTimeout(300);
  await page.waitForFunction(kind=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind)),kind,{timeout,polling:50});
  assert.ok(await page.evaluate(kind=>window.__v3ProductProbe.matches(window.__v3ProductProbe.read(kind)),kind),'Fresh completed current '+kind+' frame');
}
async function hit(locator){
  const value=await locator.evaluate(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);let opacity=1;for(let n=node;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);return{text:node.textContent.trim(),label:node.getAttribute('aria-label'),x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,viewport:{width:innerWidth,height:innerHeight},hit:hit===node||node.contains(hit),opacity,font:parseFloat(s.fontSize),visibility:s.visibility};});
  assert.ok(value.height>=43.5&&value.width>=24&&value.font>=12,'Usable target '+JSON.stringify(value));
  assert.ok(value.x>=-1&&value.right<=value.viewport.width+1&&value.y>=0&&value.bottom<=value.viewport.height+1&&value.hit&&value.opacity>.95,'Visible unobscured target '+JSON.stringify(value));return value;
}
async function shot(run,name,kind){
  if(kind)await frame(run.page,kind);
  await run.page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(image=>{const b=image.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight&&b.width>0;}).map(image=>image.decode().catch(()=>{})));});
  const state=await run.page.evaluate(()=>({url:location.href,overflow:document.documentElement.scrollWidth>innerWidth+1,state:window.__v3ProductProbe?.snapshot(),text:document.querySelector('main')?.innerText}));
  assert.equal(state.overflow,false,'No horizontal overflow');assert.deepEqual(run.errors,[],'No page errors');
  await run.page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({...state,errors:run.errors,blocked:run.blocked},null,2));console.log('PASS '+name);
}
async function press(run,selector){const node=run.page.locator(selector);await hit(node);if(run.viewport.touch)await node.tap();else await node.click();}
async function menu(run,prefix){
  const page=run.page,menu=page.locator('[data-v2-menu]'),nav=page.locator('[data-v2-nav]');
  if(run.viewport.width<=540){await hit(menu);await menu.tap();assert.equal(await menu.getAttribute('aria-expanded'),'true');for(const node of await nav.locator('a').all())await hit(node);await shot(run,prefix+'-menu');await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(n=>n===document.activeElement),true);}
  await page.setViewportSize({width:390,height:844});await menu.focus();await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>document.activeElement?.matches('[data-v2-nav] a'));await hit(nav.locator('a').first());
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('[data-v2-menu]').getAttribute('aria-expanded')==='true');await hit(nav.locator('a').first());
  await page.keyboard.press('Escape');await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});
}
async function review(browser,name){
  const run=await open(browser,viewports[name]),page=run.page;
  try{
    await go(run);assert.equal(await page.locator('body').evaluate(n=>getComputedStyle(n).getPropertyValue('--v2-accent').trim()),'#7bbcff');await page.locator('[data-assembly-models-ready="3"]').waitFor({timeout});await shot(run,name+'-hero','hero');
    for(const selector of ['[data-assembly-intro] a[download]','[data-assembly-intro] a[href="/v2/projects/"]','[data-assembly-explore]','.v2-assembly-jump'])await hit(page.locator(selector));
    await menu(run,name);await go(run);await page.locator('[data-assembly-models-ready="3"]').waitFor({timeout});
    for(const index of [0,1,2]){
      const control=page.locator(`[data-assembly-select="${index}"]`);await hit(control);
      if(run.viewport.touch)await control.tap();else{await control.focus();await page.keyboard.press(index===1?'Space':'Enter');}
      await frame(page,'hero');assert.equal(await control.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-assembly-explore]').getAttribute('href'),routes[index]);
      assert.equal(await page.locator('[data-assembly-open-label]').innerText(),'Open '+labels[index]);await hit(page.locator('[data-assembly-explore]'));
      const caption=await page.locator('[data-assembly-caption]').boundingBox(),choices=await page.locator('[data-assembly-choices]').boundingBox();assert.ok(caption.y+caption.height<=choices.y-12,'Project description has breathing room above preview controls');
      assert.equal(new URL(page.url()).pathname,'/v2/');await shot(run,name+'-preview-'+index,'hero');
    }
    if(name.startsWith('ipad')){
      // Safari taps may not focus a button. Explicit intent must not depend
      // on Chromium's focus behavior; no scene state is modified here.
      await page.locator('[data-assembly-select="2"]').evaluate(node=>node.blur());
      await page.setViewportSize({width:run.viewport.height,height:run.viewport.width});await frame(page,'hero');
      const selected=await page.locator('[data-assembly-select][aria-pressed="true"]').getAttribute('data-assembly-select');
      assert.equal(selected,'2','An explicit preview survives rotation even without button focus');
      assert.equal(await page.locator('[data-assembly-explore]').getAttribute('href'),routes[Number(selected)]);
      for(const node of await page.locator('[data-assembly-select]').all())await hit(node);await hit(page.locator('[data-assembly-explore]'));await shot(run,name+'-rotated-preview','hero');
      await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});await page.locator('[data-assembly-select="2"]').tap();await frame(page,'hero');
      if(name==='ipad1024'){
        const count=()=>page.evaluate(()=>window.__v2ScrollCommands.length);
        let before=await count();await page.setViewportSize({width:run.viewport.width,height:run.viewport.height-24});await frame(page,'hero');assert.equal(await count(),before,'Height-only resize does not seek');
        await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});await frame(page,'hero');assert.equal(await count(),before,'Restoring height does not seek');
        for(const input of ['wheel','touch']){
          await page.locator('[data-assembly-select="2"]').tap();await frame(page,'hero');
          if(input==='wheel')await page.mouse.wheel(0,-120);
          else{const cdp=await run.context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:360}]});for(let step=1;step<=6;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:360+step*20}]});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
          await frame(page,'hero');before=await count();await page.setViewportSize({width:run.viewport.height,height:run.viewport.width});await frame(page,'hero');assert.equal(await count(),before,'Real '+input+' clears old preview before rotation');
          await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});await frame(page,'hero');assert.equal(await count(),before,'Cleared '+input+' intent stays cleared');
        }
        const events=await page.evaluate(()=>window.__v3ProductProbe.input);for(const type of ['wheel','touchmove'])assert.ok(events.some(event=>event.type===type&&event.trusted&&!event.prevented),'Native '+type+' remains uncaptured');
        await page.locator('[data-assembly-select="2"]').tap();await frame(page,'hero');
      }
    }
    await press(run,'[data-assembly-explore]');await page.waitForURL('**'+routes[2]);assert.equal(await page.locator('h1').count(),1);await page.goBack({waitUntil:'domcontentloaded'});await page.waitForURL('**/v2/');
    // Back may rebuild the document. Observe its restored native position and
    // completed scene before measuring the sticky controls; never force scroll.
    await frame(page,'hero');assert.equal(await page.locator('[data-assembly-explore]').getAttribute('href'),routes[2],'Back restores the opened project preview');
    await press(run,'.v2-assembly-jump');await page.waitForURL('**#work');
    await page.locator('#work-framework').evaluate(node=>node.scrollIntoView({behavior:'instant',block:'start'}));await frame(page,'selected');
    assert.equal(await page.locator('.v2-selected-nav,.v2-transport-card,[data-framework-inspection-ui]').count(),0,'No transit selector or inspection menu');
    assert.deepEqual(await page.locator('.v2-framework-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),cases.map(slug=>'/v2/projects/'+slug+'/'));
    assert.equal(await page.locator('[data-selected-work]').getAttribute('data-selected-models-ready'),'4');
    assert.deepEqual(await page.locator('[data-selected-work]').evaluate(node=>JSON.parse(node.dataset.selectedModelStatistics).map(x=>x.name)),['esp32','dual','pi','logic']);
    assert.equal(run.requests.some(url=>url.includes('/selected/metro')||url.includes('/hardware/metroboard/')),false,'Removed Metro scene is neither requested nor prepared');
    assert.equal(await page.locator('[data-selected-canvas]').evaluate(node=>getComputedStyle(node).pointerEvents),'none');
    for(const node of await page.locator('.v2-framework-card').all())await hit(node);
    await hit(page.locator('.v2-selected-skip'));await shot(run,name+'-framework-exploded','selected');
    const scrollFramework=async value=>{await page.evaluate(value=>{const stage=document.querySelector('.v2-selected-stage'),track=document.querySelector('.v2-selected-track');scrollTo({top:scrollY+track.getBoundingClientRect().top-parseFloat(getComputedStyle(stage).top)+(parseFloat(track.style.height)-stage.clientHeight)*value,behavior:'instant'});},value);await frame(page,'selected');};
    const beforeInput=await page.evaluate(()=>scrollY);if(run.viewport.touch){const cdp=await run.context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:450}]});for(let step=1;step<=5;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:450-step*20}]});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.wheel(0,120);await frame(page,'selected');assert.ok(await page.evaluate(()=>scrollY)>beforeInput,'Background leaves native scroll available');await scrollFramework(0);
    const first=await page.locator('[data-selected-work]').getAttribute('data-selected-rendered-progress');
    for(const progress of [.45,.84,.15]){await scrollFramework(progress);for(const node of await page.locator('.v2-framework-card').all())await hit(node);await shot(run,name+'-framework-'+progress,'selected');}
    assert.ok(Number(first)<.05,'Framework starts exploded');
    if(name.startsWith('ipad')){await page.setViewportSize({width:run.viewport.height,height:run.viewport.width});await frame(page,'selected');for(const node of await page.locator('.v2-framework-card').all())await hit(node);await shot(run,name+'-framework-rotated','selected');await page.setViewportSize({width:run.viewport.width,height:run.viewport.height});await frame(page,'selected');}
    await page.locator('.v2-framework-card').first().focus();await page.keyboard.press('Enter');await page.waitForURL('**/v2/projects/framework-expansion-card/');assert.equal(await page.locator('h1').count(),1);
    await page.goBack({waitUntil:'domcontentloaded'});await frame(page,'selected');
    if(name==='desktop1440'){
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('[data-selected-work]').classList.contains('is-scene'));assert.equal(await page.locator('.v2-framework-card').count(),4);await shot(run,name+'-motion-disabled');
      await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#work-framework').evaluate(node=>node.scrollIntoView({behavior:'instant',block:'start'}));await frame(page,'selected');await shot(run,name+'-motion-restored','selected');
    }
    await press(run,'.v2-selected-skip');await page.waitForURL('**#skylabs-aircraft');await frame(page,'aircraft');await shot(run,name+'-aircraft','aircraft');
    await press(run,'[data-aircraft-go="1"]');await page.waitForURL('**#skylabs-telemetry');await frame(page,'aircraft');await hit(page.locator('.v2-aircraft-actions a'));await hit(page.locator('.v3-story-skip'));
    if(run.viewport.width>760&&run.viewport.width/run.viewport.height<=.9){const copy=await page.locator('article[data-aircraft-chapter="1"]').boundingBox(),stage=await page.locator('[data-aircraft-stage]').boundingBox();assert.ok(copy.y+copy.height<stage.y+stage.height*.35,'Portrait tablet copy stays above the model region; actual pixels are also reviewed');}
    await shot(run,name+'-telemetry','aircraft');
    await press(run,'.v3-story-skip');await page.waitForURL('**#about');await settled(page);await shot(run,name+'-about');
    await page.goBack();await page.waitForURL('**#skylabs-telemetry');await page.goForward();await page.waitForURL('**#about');
    assert.ok(await page.locator('a[href="/v2/book/"]').count());assert.ok(await page.locator('a[href="mailto:andrew.noah.chung@gmail.com"]').count());
    assert.deepEqual(run.errors,[]);assert.equal(run.blocked.filter(x=>x.method!=='GET').length,0);console.log('PASS '+name+' native preview, case open, chapters, bypasses, history and responsive focus');
  }catch(error){await shot(run,name+'-failure').catch(()=>{});fs.writeFileSync(path.join(output,name+'-error.txt'),error.stack);throw error;}finally{await run.context.close();}
}
async function fallbacks(browser,webkit=false){
  for(const [name,options,viewport]of [['no-js',{noJS:true},viewports.phone320],['reduced-motion',{reduced:true},viewports.phone390],['save-data',{saveData:true},viewports.phone390],['no-webgl',{noWebGL:true},viewports.ipad1024],['short-landscape',{}, {width:844,height:390,touch:true}]]){
    const run=await open(browser,viewport,options);
    try{await go(run);if(!options.noJS)await run.page.waitForFunction(()=>document.querySelector('[data-assembly]').dataset.assemblyState==='static'||document.querySelector('[data-assembly]').dataset.assemblyState==='unavailable',null,{timeout});await shot(run,(webkit?'webkit-':'')+name);
      assert.equal(await run.page.locator('[data-assembly-select]:visible').count(),0);await run.page.locator('.v2-assembly-jump').click();await run.page.waitForURL('**#work');
      const cards=run.page.locator('.v2-framework-card,.v2-transport-card');assert.equal(await cards.count(),4);if(options.noWebGL)await run.page.waitForFunction(()=>document.querySelector('[data-selected-work]').dataset.selectedState==='unavailable',null,{timeout});await settled(run.page);await cards.first().focus();await settled(run.page);await run.page.keyboard.press('Enter');await run.page.waitForURL('**/v2/projects/framework-expansion-card/');assert.equal(await run.page.locator('h1').count(),1);assert.deepEqual(run.errors,[]);
    }catch(error){await shot(run,name+'-failure').catch(()=>{});throw error;}finally{await run.context.close();}
  }
}
(async()=>{
  source();if(args.includes('--source-only'))return;fs.mkdirSync(output,{recursive:true});
  const webkit=args.includes('--webkit'),{chromium,webkit:webkitEngine}=require('playwright');const browser=await(webkit?webkitEngine:chromium).launch({headless:true,...(webkit?{}:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})});
  try{if(args.includes('--fallbacks')||webkit)await fallbacks(browser,webkit);else await review(browser,args.find(a=>a.startsWith('--viewport='))?.split('=')[1]||'desktop1440');}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

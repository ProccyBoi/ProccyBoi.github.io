/* Recruiter-first v2 review acceptance. A real browser, real documents, native
 * links, wheel/touch and production controllers are used. --source-only does
 * not launch Chromium and does not claim UX/performance validation.
 * --profile-only measures a matched 15s initial window and separate entry;
 * V2_REVIEW_LEGACY=1 collects the same profile without new-policy assertions.
 * --group=first-screen|navigation|mobile|fallbacks|sources partitions browser
 * work. V2_REVIEW_OUT preserves measured geometry, screenshots and failures.
 * Software-WebGL observations are not Core Web Vitals or device benchmarks. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const base=(process.env.V2_BASE_URL||'http://127.0.0.1:8080').replace(/\/$/,'').replace(/\/v2$/,'');
const output=process.env.V2_REVIEW_OUT||'.codex-temp/v2-review-browsing';
const timeout=Number(process.env.V2_BROWSER_TIMEOUT||120000);
const baseline='d725a378806eb05c8d5b981f8e54d33dde502cac';
const evidence=[];let browserExecuted=false;
const routes=['/v2/projects/tramtrace/','/v2/projects/skylabs/boards/telemetry/','/v2/projects/framework-raspberry-pi/'];
const cases=['framework-expansion-card','framework-dual-usb','framework-raspberry-pi','framework-logic-analyser','metroboard','tramtrace'];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pass=(name,details={})=>{evidence.push({name,...details});console.log('PASS '+name);};
function sourceContract(){
  const html=read('v2/index.html'),hero=html.match(/<section class="v2-assembly"[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero);assert.match(hero,/embedded systems, power electronics and avionics/);assert.match(hero,/Designing hardware from PCB to firmware/);
  assert.match(hero,/<a[^>]*href="\/v2\/projects\/"[^>]*>View projects/);
  assert.match(hero,/<a[^>]*href="\/assets\/documents\/Andrew_Chung_Public_CV\.pdf"[^>]*\bdownload\b[^>]*>Download CV/);
  assert.match(hero,/<a[^>]*data-assembly-explore[^>]*href="\/v2\/projects\/tramtrace\/"[^>]*><span data-assembly-open-label>Open TramTrace/);
  assert.match(hero,/<a[^>]*href="#work"[^>]*>Skip intro/);
  const selectors=[...hero.matchAll(/<(\w+)\b([^>]*data-assembly-select="([0-2])"[^>]*)>/g)];
  assert.equal(selectors.length,3);
  for(const [_,tag,attributes]of selectors){assert.equal(tag,'button');assert.match(attributes,/type="button"/);assert.match(attributes,/aria-pressed="false"/);assert.doesNotMatch(attributes,/\bhref=/);}
  assert.ok(!html.includes('v2-work-browse'),'The duplicate shortcut row is removed');
  for(const name of cases)assert.ok(html.includes('href="/v2/projects/'+name+'/"'),name+' has a native project card');
  assert.match(html,/href="\/v2\/projects\/">All projects/);
  assert.match(read('assets/v2-selected-work.js'),/skipScene.href='#skylabs-aircraft'/);
  assert.match(html,/<a class="v3-story-skip" href="#about">Skip animation/);
  assert.match(html,/class="v2-nav-contact" href="\/v2\/about\/#contact"/);
  assert.doesNotMatch(read('v2/about/index.html'),/href="\/book\/"/);
  assert.match(read('v2/about/index.html'),/href="\/v2\/book\/"/);
  for(const file of ['assets/v2-hero-motion.js','v3/index.html']){
    const before=execFileSync('git',['show',(file==='v3/index.html'?'733416b21ecb8725e75d2eea1699d52dd1e8498e':baseline)+':'+file],{cwd:root,encoding:'utf8'});
    assert.equal(read(file),before,file+' is unchanged from the accepted baseline');
  }
  const cv=fs.readFileSync(path.join(root,'assets/documents/Andrew_Chung_Public_CV.pdf'));
  assert.equal(cv.subarray(0,5).toString(),'%PDF-');assert.ok(cv.length>1000);
  const records=JSON.parse(read('scripts/content/v2-case-evidence.json'));
  assert.equal(Object.keys(records).length,9,'Nine reviewed case studies have source-backed engineering notes');
  for(const [slug,record]of Object.entries(records)){
    const file='v2/projects/'+slug+'/index.html',document=read(file),block=document.match(/<section[^>]*data-v2-engineering-evidence[^>]*>[\s\S]*?<\/section>/)?.[0];
    assert.ok(block,slug+' has an engineering evidence section');assert.ok(record.maturity&&record.media_label&&record.role,slug+' identifies stage, media type and contribution');
    assert.ok(record.sources?.length>0&&record.sources.every(source=>new URL(source.href).protocol==='https:'),'Every case note records its public source');
    for(const [key,heading]of [['problem','Problem'],['decisions','Design decisions'],['challenges','Challenges and troubleshooting'],['validation','Evidence and validation'],['outcome','Outcome']])if(record[key])assert.ok(block.includes('<h3>'+heading+'</h3>'),slug+' retains '+heading);
    for(const link of record.links||[]){
      assert.ok(document.includes('href="'+link.href+'"'),slug+' publishes its stated evidence link');
      if(link.href.startsWith('/')){const url=new URL(link.href,'https://example.invalid'),target=read(url.pathname.replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));if(url.hash)assert.ok(target.includes('id="'+decodeURIComponent(url.hash.slice(1))+'"'),'Evidence link points to a real local section: '+link.href);}
    }
  }
  pass('source-copy-native-navigation-direct-browse-preserved-v3-and-real-cv',{cvBytes:cv.length,evidenceCases:Object.keys(records)});
}
function instrument(){
  const data=window.__reviewProbe={inputs:[],prevention:[],contexts:[]};
  const native=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    if(/webgl/i.test(type)){
      const section=this.closest('[data-selected-work],[data-aircraft-hero],[data-assembly]'),box=section?.getBoundingClientRect();
      data.contexts.push({type,kind:section?.hasAttribute('data-selected-work')?'selected':section?.hasAttribute('data-aircraft-hero')?'aircraft':'hero',t:performance.now(),y:scrollY,top:box?.top,bottom:box?.bottom,viewportHeight:innerHeight});
    }
    return native.call(this,type,...args);
  };
  for(const type of ['wheel','touchstart','touchmove','touchend'])addEventListener(type,event=>{
    const sample={type,trusted:event.isTrusted,prevented:event.defaultPrevented,t:performance.now(),y:scrollY};data.inputs.push(sample);queueMicrotask(()=>{sample.prevented=event.defaultPrevented;});
  },{capture:true,passive:true});
  const prevent=Event.prototype.preventDefault;
  Event.prototype.preventDefault=function(){if(['wheel','touchstart','touchmove','touchend'].includes(this.type))data.prevention.push({type:this.type,t:performance.now()});return prevent.call(this);};
}
async function open(browser,options={}){
  const context=await browser.newContext({viewport:options.viewport||{width:1440,height:900},hasTouch:!!options.touch,isMobile:!!options.touch,javaScriptEnabled:options.js!==false,reducedMotion:options.reduced?'reduce':'no-preference',acceptDownloads:true});
  await context.addInitScript(instrument);
  const page=await context.newPage(),errors=[],responses=[];
  page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.request().isNavigationRequest())responses.push({url:response.url(),status:response.status()});});
  return {context,page,errors,responses};
}
async function save(run,name,details={}){
  assert.deepEqual(run.errors,[],'No unhandled browser errors');
  const state=await run.page.evaluate(()=>({url:location.href,y:scrollY,width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,probe:window.__reviewProbe,hero:{...document.querySelector('[data-assembly]')?.dataset},selected:{...document.querySelector('[data-selected-work]')?.dataset},aircraft:{...document.querySelector('[data-aircraft-hero]')?.dataset}}));
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({...details,state,responses:run.responses},null,2)+'\n');
  pass(name,details);
}
async function diagnose(run,name,error){
  const report={error:error.stack,errors:run.errors,responses:run.responses};
  try{report.state=await run.page.evaluate(()=>({url:location.href,y:scrollY,probe:window.__reviewProbe,html:document.querySelector('main')?.outerHTML}));}catch(e){report.collectionError=e.message;}
  fs.writeFileSync(path.join(output,name+'-failure.json'),JSON.stringify(report,null,2)+'\n');
  await run.page.screenshot({path:path.join(output,name+'-failure.png'),animations:'disabled'}).catch(()=>{});
}
async function safely(browser,name,options,body){
  const run=await open(browser,options);
  try{await body(run);}
  catch(error){await diagnose(run,name,error);throw error;}
  finally{await run.context.close();}
}
async function hitProof(locator,{minimumHeight=24,inside=true}={}){
  assert.equal(await locator.count(),1,'A unique intended action exists');assert.equal(await locator.isVisible(),true);
  const result=await locator.evaluate(node=>{
    const r=node.getBoundingClientRect(),style=getComputedStyle(node),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    let opacity=1;for(let current=node;current;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);
    return {text:node.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,viewportWidth:innerWidth,viewportHeight:innerHeight,hit:hit===node||node.contains(hit),opacity,fontSize:parseFloat(style.fontSize)};
  });
  assert.ok(result.width>=24&&result.height>=minimumHeight-1,'Comfortable native target: '+JSON.stringify(result));
  assert.ok(result.opacity>.95,'Action is not hidden behind a transparent ancestor');
  if(inside){assert.ok(result.x>=-1&&result.right<=result.viewportWidth+1&&result.y>=0&&result.bottom<=result.viewportHeight+1,'Action is available in the current viewport: '+JSON.stringify(result));assert.equal(result.hit,true,'Action is not covered by another layer: '+result.text);}
  return result;
}
async function firstScreenProof(page){
  const introduction=page.locator('[data-assembly-intro]');
  const copy=await introduction.innerText();assert.match(copy,/Andrew\s+Chung/);assert.match(copy,/embedded systems, power electronics and avionics/);assert.match(copy,/PCB to firmware/);
  const bounds=await introduction.boundingBox(),viewport=page.viewportSize();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height,'Engineering introduction fits on first screen');
  const actions=[];
  for(const selector of ['[data-assembly-intro] a[href="/v2/projects/"]','[data-assembly-intro] a[download]','[data-assembly-explore]','.v2-assembly-jump'])actions.push(await hitProof(page.locator(selector),{minimumHeight:44}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'First screen has no horizontal overflow');
  return {copy,actions,bounds};
}
async function firstScreen(browser,viewport){
  await safely(browser,'first-screen-'+viewport.width,{viewport},async run=>{
    const {page,context}=run;let release;const gate=new Promise(resolve=>{release=resolve;});let held=0;
    await context.route(/\/assets\/models\/.*\.(?:gz|bin|glb)(?:\?|$)/,async route=>{held++;await gate;await route.continue().catch(()=>{});});
    try{
      await page.goto(base+'/v2/?review=first-screen',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.classList.contains('v2-ready'));
      const initial=await firstScreenProof(page);assert.equal(await page.evaluate(()=>scrollY),0);
      await page.screenshot({path:path.join(output,'first-screen-'+viewport.width+'.png'),animations:'disabled'});
      const downloadPromise=page.waitForEvent('download');await page.locator('[data-assembly-intro] a[download]').click();const download=await downloadPromise;
      assert.match(download.suggestedFilename(),/\.pdf$/i);assert.equal(await download.failure(),null,'CV is a real successful native download');
      await download.saveAs(path.join(output,'cv-'+viewport.width+'.pdf'));assert.equal(fs.readFileSync(path.join(output,'cv-'+viewport.width+'.pdf')).subarray(0,5).toString(),'%PDF-');
      assert.ok(held>0,'First-screen navigation is tested while actual CAD transports are held');
      const response=page.waitForResponse(response=>response.request().isNavigationRequest()&&new URL(response.url()).pathname===routes[0]);
      await page.locator('[data-assembly-explore]').click();assert.equal((await response).status(),200);await page.waitForURL('**'+routes[0]);await page.locator('h1').waitFor({state:'visible'});
      assert.equal(new URL(page.url()).pathname,routes[0],'Explore is a genuine document navigation while CAD is loading');
      await save(run,'first-screen-'+viewport.width,{initial,heldTransports:held,download:download.suggestedFilename()});
    }finally{release();}
  });
}
async function trackLengths(page){
  await page.locator('.v2-assembly.is-enhanced').waitFor();await page.locator('.v2-selected-work.is-scene').waitFor();await page.locator('.v3-aircraft.is-story').waitFor();
  const lengths=await page.evaluate(()=>{
    const hero=document.querySelector('[data-assembly]'),selected=document.querySelector('[data-selected-work]'),air=document.querySelector('[data-aircraft-hero]');
    const s=selected.querySelector('.v2-selected-stage'),a=air.querySelector('[data-aircraft-stage]');
    return {viewport:{width:innerWidth,height:innerHeight},documentHeight:document.documentElement.scrollHeight,hero:hero.offsetHeight,selectedStage:s.clientHeight,selectedDistance:parseFloat(selected.querySelector('.v2-selected-track').style.height)-s.clientHeight,aircraftStage:a.clientHeight,aircraftDistance:parseFloat(air.querySelector('.v3-aircraft-track').style.height)-a.clientHeight};
  });
  const mobile=lengths.viewport.width<=760,heroRatio=lengths.viewport.width<=900?2.3:2.4;
  assert.ok(Math.abs(lengths.hero/lengths.viewport.height-heroRatio)<.01,'Hero has the requested shorter total scroll length');
  assert.ok(Math.abs(lengths.selectedDistance/lengths.selectedStage-(mobile?1.9:1.7))<.003,'Selected preserves normalized choreography over the shorter track');
  assert.ok(Math.abs(lengths.aircraftDistance/lengths.aircraftStage-(mobile?2.1:1.8))<.003,'Only v2 aircraft uses the shorter track');
  const oldHero=lengths.viewport.width<=600?3.5:lengths.viewport.width<=900?3.6:3.8;
  lengths.removedTrackPixels=(oldHero*lengths.viewport.height-lengths.hero)+lengths.selectedStage*((mobile?2.8:2.5)-(mobile?1.9:1.7))+lengths.aircraftStage*((mobile?3.7:3.1)-(mobile?2.1:1.8));
  lengths.equivalentOldDocumentHeight=lengths.documentHeight+lengths.removedTrackPixels;
  assert.ok(lengths.removedTrackPixels>2.7*lengths.viewport.height,'Combined cinematic scrolling is reduced by more than 2.7 viewport heights');
  assert.ok(lengths.documentHeight<(mobile?14:12)*lengths.viewport.height,'Full homepage has a bounded real document height');
  return lengths;
}
async function selectorsAndNavigation(browser){
  await safely(browser,'selectors-genuine-navigation',{},async run=>{
    const {page}=run;await page.goto(base+'/v2/?review=selectors',{waitUntil:'domcontentloaded'});
    await page.locator('[data-assembly-models-settled="3"]').waitFor();
    const lengths=await trackLengths(page),original=page.url();
    for(const [index,position]of [[2,.88],[0,.265],[1,.565]]){
      const button=page.locator('[data-assembly-select="'+index+'"]');assert.equal(await button.evaluate(node=>node.tagName),'BUTTON');assert.equal(await button.isEnabled(),true);
      await button.focus();await page.keyboard.press(index===0?'Space':'Enter');
      await page.waitForFunction(position=>Math.abs(Number(document.querySelector('[data-assembly]').dataset.assemblyProgress)-position)<.001,position);
      assert.equal(page.url(),original,'Scene selection never navigates to another document or fabricates a project URL');
      assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-assembly-explore]').getAttribute('href'),routes[index]);
      assert.equal(await button.evaluate(node=>node===document.activeElement&&node.matches(':focus-visible')&&getComputedStyle(node).outlineStyle!=='none'),true,'Native keyboard selection retains visible focus');
    }
    const response=page.waitForResponse(response=>response.request().isNavigationRequest()&&new URL(response.url()).pathname===routes[1]);
    await page.locator('[data-assembly-explore]').click();assert.equal((await response).status(),200);await page.waitForURL('**'+routes[1]);await page.locator('h1').waitFor({state:'visible'});
    await page.goBack({waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/v2/');
    await page.goForward({waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,routes[1]);
    await save(run,'native-selectors-vs-genuine-case-navigation',{lengths});
  });
}
async function bypasses(browser){
  await safely(browser,'native-skip-hash-history',{},async run=>{
    const {page}=run;await page.goto(base+'/v2/?review=bypasses',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.classList.contains('v2-ready'));
    await page.locator('.v2-assembly-jump').click();await page.waitForURL('**#work');
    await page.waitForFunction(()=>{const r=document.getElementById('work').getBoundingClientRect();return r.top>=0&&r.top<innerHeight/2;});
    assert.equal(await page.locator('.v2-work-browse').count(),0);
    assert.deepEqual(await page.locator('.v2-framework-card,.v2-transport-card').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),cases.map(name=>'/v2/projects/'+name+'/'));
    await page.locator('.v2-selected-skip').click();await page.waitForURL('**#skylabs-aircraft');
    await page.locator('.v3-story-skip').click();await page.waitForURL('**#about');
    const aboutReady=()=>page.waitForFunction(()=>{const about=document.getElementById('about').getBoundingClientRect(),selected=document.querySelector('[data-selected-work]').getBoundingClientRect(),air=document.querySelector('[data-aircraft-hero]').getBoundingClientRect();return about.top>=-1&&about.top<innerHeight/2&&selected.bottom<innerHeight&&air.bottom<innerHeight/2;});
    await aboutReady();
    await page.goBack();await page.waitForURL('**#skylabs-aircraft');
    await page.goForward();await page.waitForURL('**#about');await aboutReady();
    await save(run,'skip-intro-and-all-secondary-tracks-with-native-back-forward');
    for(const [hash,rootSelector,attribute,chapter]of [['work-transit','[data-selected-work]','selectedChapter','1'],['skylabs-telemetry','[data-aircraft-hero]','aircraftChapter','1']]){
      await page.goto(base+'/v2/?review=direct-hash#'+hash,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(({rootSelector,attribute,chapter})=>document.querySelector(rootSelector)?.dataset[attribute]===chapter,{rootSelector,attribute,chapter});
      assert.equal(new URL(page.url()).hash,'#'+hash);
      await page.waitForFunction(hash=>{let opacity=1;const node=document.getElementById('copy-'+hash);if(!node)return false;for(let current=node;current;current=current.parentElement)opacity*=Number(getComputedStyle(current).opacity);return opacity>.95;},hash);
      const copy=page.locator('#copy-'+hash);assert.equal(await copy.isVisible(),true);assert.notEqual(await copy.getAttribute('aria-hidden'),'true');
      const link=copy.locator('a[href^="/v2/projects/"]').first();await hitProof(link);
      if(hash==='work-transit')await hitProof(page.locator('.v2-selected-skip'),{minimumHeight:44});
      else await hitProof(page.locator('.v3-story-skip'),{minimumHeight:44});
      await save(run,'direct-hash-'+hash+'-bypasses-prior-chapters');
    }
  });
}
async function mobile(browser,viewport){
  await safely(browser,'mobile-'+viewport.width,{viewport,touch:true},async run=>{
    const {page,context}=run;await page.goto(base+'/v2/?review=mobile',{waitUntil:'domcontentloaded'});await page.locator('[data-assembly-models-settled="3"]').waitFor();
    const initial=await firstScreenProof(page),lengths=await trackLengths(page);
    for(const button of await page.locator('[data-assembly-select]').all())await hitProof(button,{minimumHeight:44});
    const before=await page.evaluate(()=>scrollY),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:viewport.width*.65,y:viewport.height*.72}]});
    for(const fraction of [.63,.54,.45]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:viewport.width*.65,y:viewport.height*fraction}]});await page.waitForTimeout(30);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(y=>scrollY>y+50,before);
    const touchInput=await page.evaluate(()=>window.__reviewProbe);assert.ok(touchInput.inputs.some(input=>input.type==='touchmove'&&input.trusted),'Real touch scrolling reaches the hero');assert.ok(touchInput.inputs.every(input=>input.trusted&&!input.prevented));assert.deepEqual(touchInput.prevention,[]);
    await page.goto(base+'/v2/?review=mobile-cards#work-framework',{waitUntil:'domcontentloaded'});
    await page.locator('[data-selected-background-ready="true"][data-selected-warm-mask="false"]').waitFor();
    const descriptions=await page.locator('.v2-framework-copy p').evaluateAll(nodes=>nodes.map(node=>{const style=getComputedStyle(node),r=node.getBoundingClientRect();return{text:node.textContent.trim(),fontSize:parseFloat(style.fontSize),clip:style.clipPath,width:r.width,height:r.height,top:r.top,bottom:r.bottom,visible:style.visibility==='visible'&&Number(style.opacity)>0};}));
    assert.equal(descriptions.length,4);
    for(const item of descriptions){assert.ok(item.text&&item.visible&&item.width>20&&item.height>12&&item.clip==='none','Concise Framework descriptions remain visually readable: '+JSON.stringify(item));assert.ok(item.fontSize>=13,'Mobile description type is at least13px');assert.ok(item.top>=0&&item.bottom<=viewport.height+1,'Description stays inside portrait viewport');}
    for(const locator of [page.locator('.v2-selected-skip'),page.locator('.v2-selected-nav a').first()])await hitProof(locator,{minimumHeight:44});
    await page.screenshot({path:path.join(output,'mobile-'+viewport.width+'-descriptions.png'),animations:'disabled'});
    const y=await page.evaluate(()=>scrollY);await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.wheel(0,100);await page.waitForFunction(y=>scrollY>y+30,y);
    const native=await page.evaluate(()=>window.__reviewProbe);assert.ok(native.inputs.some(input=>input.type==='wheel'&&input.trusted),'Actual wheel input reaches the scene');assert.ok(native.inputs.every(input=>input.trusted&&!input.prevented));assert.deepEqual(native.prevention,[],'Native scrolling is not intercepted');
    await page.locator('.v2-selected-skip').tap();await page.waitForURL('**#skylabs-aircraft');
    await page.waitForFunction(()=>document.querySelector('[data-aircraft-hero]').getBoundingClientRect().top<innerHeight/2);
    await page.locator('.v3-story-skip').tap();await page.waitForURL('**#about');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await save(run,'mobile-'+viewport.width+'-descriptions-taps-native-scroll',{initial,lengths,descriptions,touchInput,nativeWheel:native});
  });
}
function compactPreparationProbe(){
  const data=window.__compactPreparation={foregroundTimers:[],contexts:[],phases:[]},seen=new WeakSet();
  const nativeTimeout=setTimeout.bind(window),nativeContext=HTMLCanvasElement.prototype.getContext;
  window.setTimeout=(callback,delay,...args)=>{
    if(delay===12000){const stack=new Error().stack||'';if(/foregroundSettled/.test(stack)&&/v2-selected-work\.js|v3-aircraft-hero\.js/.test(stack))data.foregroundTimers.push({t:performance.now(),delay,hero:document.querySelector('[data-assembly]')?.dataset.assemblyState,owner:stack.includes('v2-selected-work.js')?'selected':'aircraft'});}
    return nativeTimeout(callback,delay,...args);
  };
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    const context=nativeContext.call(this,type,...args);
    if(context&&/webgl/i.test(type)&&!seen.has(context)){
      seen.add(context);const section=this.closest('[data-assembly],[data-selected-work],[data-aircraft-hero]'),box=section?.getBoundingClientRect();
      data.contexts.push({t:performance.now(),kind:section?.hasAttribute('data-assembly')?'hero':section?.hasAttribute('data-selected-work')?'selected':section?.hasAttribute('data-aircraft-hero')?'aircraft':'other',hero:document.querySelector('[data-assembly]')?.dataset.assemblyState,top:box?.top,bottom:box?.bottom,viewportHeight:innerHeight});
    }
    return context;
  };
  new MutationObserver(records=>{for(const record of records)data.phases.push({t:performance.now(),attribute:record.attributeName,value:record.target.getAttribute(record.attributeName)});}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-assembly-state','data-selected-models-ready','data-selected-background-ready','data-aircraft-background-ready','data-aircraft-cpu-phase']});
}
async function compactStaticHeroPreparation(browser){
  await safely(browser,'compact-static-hero-secondary-preparation',{viewport:{width:390,height:621},touch:true},async run=>{
    const {page,context}=run;await context.addInitScript(compactPreparationProbe);
    await page.goto(base+'/v2/?review=compact-static-hero-preparation',{waitUntil:'domcontentloaded'});
    await page.locator('[data-assembly-state="static"]').waitFor();
    await page.locator('[data-selected-work].is-scene').waitFor();
    const initial=await page.evaluate(()=>{const root=document.querySelector('[data-selected-work]'),box=root.getBoundingClientRect();return{t:performance.now(),y:scrollY,top:box.top,bottom:box.bottom,height:innerHeight,hero:{...document.querySelector('[data-assembly]').dataset},visible:window.V2SelectedWork.isVisible(),eligible:root.dataset.selectedPreparationEligible};});
    assert.equal(initial.y,0);assert.equal(initial.hero.assemblyState,'static');
    assert.ok(initial.top>=initial.height&&initial.top<2*initial.height,'Compact layout places Selected genuinely near but outside the viewport');
    assert.equal(initial.visible,false);assert.equal(initial.eligible,'true');
    await page.locator('[data-selected-background-ready="true"][data-selected-models-ready="6"][data-selected-warm-poses-completed="2"]').waitFor();
    const selected=await page.evaluate(()=>({t:performance.now(),y:scrollY,hero:{...document.querySelector('[data-assembly]').dataset},selected:{...document.querySelector('[data-selected-work]').dataset},probe:window.__compactPreparation}));
    assert.equal(selected.y,0);assert.equal(selected.hero.assemblyState,'static');assert.equal(Number(selected.hero.assemblyFrames||0),0);
    assert.equal(Number(selected.selected.selectedFrames||0),0,'Near Selected preparation has not played live frames');
    assert.deepEqual(selected.probe.foregroundTimers,[],'A terminal static hero schedules no12-second Selected foreground fallback');
    assert.deepEqual(selected.probe.contexts.map(item=>item.kind),['selected'],'Only the required Selected context exists; the static hero has none');
    const aircraftRequested=await page.evaluate(()=>performance.now());
    await page.locator('[data-aircraft-hero]').evaluate(root=>scrollTo({top:scrollY+root.getBoundingClientRect().bottom+1,behavior:'instant'}));
    await page.waitForFunction(()=>{const root=document.querySelector('[data-aircraft-hero]'),box=root.getBoundingClientRect(),pinned=parseFloat(getComputedStyle(root.querySelector('[data-aircraft-stage]')).top)||0,header=document.querySelector('.v2-header'),headerBox=header.getBoundingClientRect(),hit=box.bottom>0?document.elementFromPoint(innerWidth/2,box.bottom/2):null;const covered=box.bottom<=0||(headerBox.top<=0&&headerBox.bottom>=box.bottom&&(hit===header||header.contains(hit)));return box.bottom<=pinned&&covered&&!window.V2AircraftPreparation.isVisible()&&box.bottom>-innerHeight&&!window.V2AircraftPreparation.isVisible()&&!window.V2SelectedWork.isVisible();});
    await page.locator('[data-aircraft-background-ready="true"][data-aircraft-warm-poses-completed="2"]').waitFor();
    const completed=await page.evaluate(()=>({t:performance.now(),hero:{...document.querySelector('[data-assembly]').dataset},selected:{...document.querySelector('[data-selected-work]').dataset},aircraft:{...document.querySelector('[data-aircraft-hero]').dataset},probe:window.__compactPreparation}));
    assert.equal(completed.hero.assemblyState,'static');assert.equal(Number(completed.hero.assemblyFrames||0),0);assert.equal(await page.locator('.v2-assembly.is-enhanced').count(),0);
    assert.deepEqual(completed.probe.foregroundTimers,[],'Neither offscreen secondary helper waits12seconds for an intentionally static opening hero');
    assert.deepEqual(completed.probe.contexts.map(item=>item.kind).sort(),['aircraft','selected'],'Exactly the two requested secondary contexts exist, with no extra hero or replacement renderer');
    assert.ok(completed.probe.contexts.every(item=>item.hero==='static'&&item.top<2*item.viewportHeight&&item.bottom>-item.viewportHeight),'Both real renderers were created while near and the hero was static');
    assert.equal(Number(completed.aircraft.aircraftFrames||0),0);assert.equal(completed.selected.selectedWarmPosesCompleted,'2');
    await save(run,'compact-390x621-static-hero-without-secondary-foreground-delay',{initial,selected,aircraftRequested,completed,selectedPreparationMs:selected.t-initial.t,aircraftPreparationMs:completed.t-aircraftRequested,measurementNote:'Real390x621 geometry and actual model/GPU completion. Timer instrumentation observes the production foregroundSettled helpers without replacing them. No12-second hero fallback may be scheduled; real network, CPU and GPU duration is reported without an artificial under12s performance threshold.'});
  });
}
async function fallbacks(browser){
  for(const options of [{js:false,viewport:{width:390,height:844}},{reduced:true,viewport:{width:320,height:740}},{viewport:{width:390,height:667}}]){
    const label=options.js===false?'no-js':options.reduced?'reduced-motion':'short-portrait';
    await safely(browser,label,options,async run=>{
      const {page}=run;await page.goto(base+'/v2/?review='+label,{waitUntil:'load'});await firstScreenProof(page);
      assert.equal(await page.locator('.v2-assembly.is-enhanced').count(),0,'Fallback removes the hero scroll track');
      assert.equal(await page.locator('[data-assembly-select]:visible').count(),0,'Unavailable scene controls do not pretend to be navigation links');
      if(label!=='short-portrait'){
        assert.equal(await page.locator('.v2-selected-track,.v3-aircraft-track').count(),0,'No JS and reduced motion have no secondary cinematic track');
        for(const selector of ['.v2-framework-copy p','.v2-transport-copy p'])assert.equal(await page.locator(selector).evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>20&&r.height>12&&s.visibility==='visible'&&s.clipPath==='none';})),true,'Fallback descriptions are readable');
      }
      await page.locator('.v2-assembly-jump').click();await page.waitForURL('**#work');
      if(await page.locator('.v2-selected-skip:visible').count()) await page.locator('.v2-selected-skip').click();
      await page.locator('.v3-story-skip').click();await page.waitForURL('**#about');
      assert.equal(await page.locator('#about').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await save(run,label+'-readable-native-bypass');
    });
  }
  await compactStaticHeroPreparation(browser);
}
async function sources(browser){
  await safely(browser,'namespace-and-real-documents',{reduced:true},async run=>{
    const {page}=run;
    for(const route of ['/v2/','/v2/about/','/v2/projects/',...cases.map(name=>'/v2/projects/'+name+'/')]){
      const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,route+' loads a genuine document');
      assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.v2-nav-contact').getAttribute('href'),'/v2/about/#contact','Contact destination is consistent at '+route);
      if(route==='/v2/about/')assert.ok(await page.locator('a[href="/v2/book/"]').count()>0,'Book uses the v2 namespace');
    }
    await save(run,'actual-case-documents-and-consistent-namespaced-navigation');
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      for(const [name,route]of [['framework-logic-analyser','/v2/projects/framework-logic-analyser/'],['telemetry','/v2/projects/skylabs/boards/telemetry/']]){
        const response=await page.goto(base+route+'#engineering',{waitUntil:'load'});assert.equal(response.status(),200);
        const notes=page.locator('[data-v2-engineering-evidence]');await notes.waitFor({state:'visible'});
        await notes.evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
        await page.evaluate(()=>document.fonts.ready);
        // Only the static photographs/renders accompanying this evidence are
        // decoded. No CAD capture API or heavy viewer preparation is requested.
        const decodedImages=await page.locator('.project-hero-media img,[data-v2-engineering-evidence] img').evaluateAll(async images=>Promise.all(images.map(async image=>{
          await image.decode();return{src:image.currentSrc||image.src,width:image.naturalWidth,height:image.naturalHeight,complete:image.complete};
        })));
        assert.ok(decodedImages.length>0&&decodedImages.every(image=>image.complete&&image.width>0&&image.height>0),'Case-study presentation imagery is genuinely decoded');
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
        await page.locator('.v2-case-nav-links a[href="'+route+'#engineering"][aria-current="location"]').waitFor({state:'visible'});
        const inspectHeading=node=>{
          const box=node.getBoundingClientRect(),bars=[...document.querySelectorAll('body>header,.v2-header,.v2-case-nav')].map(bar=>{const r=bar.getBoundingClientRect();return{className:bar.className,top:r.top,bottom:r.bottom};});
          const stickyBottom=Math.max(0,...bars.filter(bar=>bar.bottom>0&&bar.top<innerHeight).map(bar=>bar.bottom)),hit=document.elementFromPoint(box.left+box.width/2,box.top+Math.min(10,box.height/2));
          return{text:node.textContent.trim(),top:box.top,bottom:box.bottom,stickyBottom,uncovered:hit===node||node.contains(hit),y:scrollY,hash:location.hash,bars,current:[...document.querySelectorAll('.v2-case-nav-links a[aria-current]')].map(link=>({href:link.getAttribute('href'),current:link.getAttribute('aria-current')}))};
        };
        const headingProof=await notes.locator('h2').evaluate(inspectHeading);
        assert.ok(headingProof.top>=headingProof.stickyBottom-1&&headingProof.bottom<=viewport.height&&headingProof.uncovered,'Engineering heading is fully below both sticky navigation bars and genuinely uncovered: '+JSON.stringify(headingProof));
        assert.deepEqual(headingProof.current,[{href:route+'#engineering',current:'location'}],'Engineering is the sole current section at its native hash');
        const layout=await notes.evaluate(node=>{
          const box=node.getBoundingClientRect();
          return{viewport:{width:innerWidth,height:innerHeight},x:box.x,width:box.width,height:box.height,headings:[...node.querySelectorAll('h3')].map(item=>item.textContent.trim()),links:[...node.querySelectorAll('a[href]')].map(link=>{const r=link.getBoundingClientRect(),style=getComputedStyle(link);return{text:link.textContent.trim(),href:link.getAttribute('href'),x:r.x,right:r.right,width:r.width,height:r.height,visible:style.visibility==='visible'&&Number(style.opacity)>0};})};
        });
        assert.ok(layout.x>=-1&&layout.x+layout.width<=viewport.width+1,'Engineering notes fit the real viewport');
        assert.ok(layout.headings.includes('Problem')&&layout.headings.includes('Design decisions')&&layout.headings.includes('Outcome'));
        assert.ok(layout.links.length>0&&layout.links.every(link=>link.visible&&link.width>=24&&link.height>=24&&link.x>=-1&&link.right<=viewport.width+1),'Evidence links are readable native targets without horizontal clipping');
        const label='case-notes-'+name+'-'+viewport.width;
        await page.screenshot({path:path.join(output,label+'-viewport.png'),animations:'disabled'});
        // Capture the document-coordinate region without locator.screenshot's
        // scroll-into-view behavior. Preserve the verified native hash landing.
        const clip=await notes.evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};});
        const capture=await run.context.newCDPSession(page);
        try{
          const {data}=await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip});
          fs.writeFileSync(path.join(output,label+'-full.png'),Buffer.from(data,'base64'));
        }finally{await capture.detach();}
        const afterCapture=await notes.locator('h2').evaluate(inspectHeading);
        assert.equal(afterCapture.y,headingProof.y,'Full notes capture preserves native hash scroll position');
        assert.equal(afterCapture.hash,'#engineering');
        assert.ok(afterCapture.top>=afterCapture.stickyBottom-1&&afterCapture.bottom<=viewport.height&&afterCapture.uncovered,'Engineering heading remains uncovered after both captures: '+JSON.stringify(afterCapture));
        assert.deepEqual(afterCapture.current,[{href:route+'#engineering',current:'location'}],'Engineering stays the sole current section after capture');
        await save(run,label,{route,viewport,layout,headingProof,afterCapture,decodedImages,scope:'Actual reduced-motion document rendering at the native engineering hash; viewport and complete notes screenshots. No 3D viewer preparation required.'});
      }
    }
  });
}
function labObserver(){
  const data=window.__reviewLab={lcp:[],shifts:[],longTasks:[],eventTiming:[],inputs:[],support:{}};
  for(const [type,key]of [['largest-contentful-paint','lcp'],['layout-shift','shifts'],['longtask','longTasks'],['event','eventTiming']]){
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){
      const value={name:entry.name,start:entry.startTime,duration:entry.duration};
      if(type==='largest-contentful-paint')Object.assign(value,{size:entry.size,renderTime:entry.renderTime,loadTime:entry.loadTime,url:entry.url,tag:entry.element?.tagName});
      if(type==='layout-shift')Object.assign(value,{value:entry.value,hadRecentInput:entry.hadRecentInput});
      if(type==='event')Object.assign(value,{processingStart:entry.processingStart,processingEnd:entry.processingEnd,interactionId:entry.interactionId});
      data[key].push(value);
    }}).observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});data.support[type]=true;}catch(_){data.support[type]=false;}
  }
  for(const type of ['click','keydown'])addEventListener(type,event=>{
    if(!event.isTrusted||type==='click'&&!event.target.closest?.('[data-v2-menu]')||type==='keydown'&&event.key!=='Escape')return;
    const sample={type,key:event.key||null,trusted:event.isTrusted,t:performance.now(),requested:data.requestedInput?{...data.requestedInput}:null};data.inputs.push(sample);
    requestAnimationFrame(()=>{sample.nextFrame=performance.now();sample.expandedAfterFrame=document.querySelector('[data-v2-menu]')?.getAttribute('aria-expanded');requestAnimationFrame(()=>{sample.afterPaintOpportunity=performance.now();});});
  },{capture:true,passive:true});
}
async function profile(browser){
  const legacy=process.env.V2_REVIEW_LEGACY==='1',windowMs=15000,network={latency:40,downloadThroughput:10_000_000/8,uploadThroughput:10_000_000/8,connectionType:'wifi'};
  await safely(browser,'matched-initial-window',{viewport:{width:390,height:844},touch:true},async run=>{
    const {page,context}=run;await context.addInitScript(labObserver);
    const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,...network});
    await page.goto(base+'/v2/?review=matched-initial-window',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.classList.contains('v2-ready'));
    await page.waitForTimeout(Math.max(0,3500-await page.evaluate(()=>performance.now())));
    await page.evaluate(()=>{window.__reviewLab.requestedInput={action:'open menu',t:performance.now()};});
    const clickStarted=Date.now();await page.locator('[data-v2-menu]').click();const menuPromiseMs=Date.now()-clickStarted;
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'true');
    await page.evaluate(()=>{window.__reviewLab.requestedInput={action:'close menu with Escape',t:performance.now()};});
    const keyStarted=Date.now();await page.keyboard.press('Escape');const escapePromiseMs=Date.now()-keyStarted;
    assert.equal(await page.locator('[data-v2-menu]').getAttribute('aria-expanded'),'false');
    await page.waitForFunction(duration=>performance.now()>=duration,windowMs);
    const observed=await page.evaluate(duration=>{
      const section=selector=>{const root=document.querySelector(selector),box=root?.getBoundingClientRect();return root?{top:box.top,bottom:box.bottom,near:box.top<2*innerHeight&&box.bottom>-innerHeight,visible:box.top<innerHeight&&box.bottom>0,data:{...root.dataset}}:null;};
      const lab=window.__reviewLab,inside=items=>items.filter(item=>(item.start??item.t)<duration);
      return {observedAt:performance.now(),windowMs:duration,y:scrollY,viewport:{width:innerWidth,height:innerHeight},support:lab.support,lcp:inside(lab.lcp),shifts:inside(lab.shifts),longTasks:inside(lab.longTasks),eventTiming:inside(lab.eventTiming),inputs:lab.inputs,contexts:window.__reviewProbe.contexts.filter(item=>item.t<duration),selected:section('[data-selected-work]'),aircraft:section('[data-aircraft-hero]'),hero:section('[data-assembly]')};
    },windowMs);
    assert.equal(observed.y,0,'Both matched initial profiles remain at the actual page top');
    assert.ok(observed.inputs.some(input=>input.type==='click'&&input.trusted)&&observed.inputs.some(input=>input.type==='keydown'&&input.trusted),'Real native menu and Escape events were delivered');
    if(!legacy){
      for(const [name,section]of [['selected',observed.selected],['aircraft',observed.aircraft]])if(!section.near){
        assert.equal(observed.contexts.filter(context=>context.kind===name).length,0,'Distant '+name+' allocates no renderer during the matched window');
        const keys=name==='selected'?['selectedModelsReady','selectedPreparationFrames','selectedWarmFrames','selectedFrames']:['aircraftWarmFrames','aircraftFrames'];
        for(const key of keys)assert.equal(Number(section.data[key]||0),0,'Distant '+key+' stays zero');
      }
    }
    let sessionStart=0,previousShift=0,sessionValue=0,maxSessionValue=0;
    for(const shift of observed.shifts.filter(item=>!item.hadRecentInput).sort((a,b)=>a.start-b.start)){
      if(!sessionValue||shift.start-previousShift>=1000||shift.start-sessionStart>=5000){sessionStart=shift.start;sessionValue=0;}
      sessionValue+=shift.value;previousShift=shift.start;maxSessionValue=Math.max(maxSessionValue,sessionValue);
    }
    const summary={legacy,network,cacheDisabled:true,windowMs,actualCollectionAtMs:observed.observedAt,lastLCPCandidate:observed.lcp.at(-1)||null,layoutShiftSessionMax:maxSessionValue,longTasks:{count:observed.longTasks.length,totalMs:observed.longTasks.reduce((sum,item)=>sum+item.duration,0),longestMs:Math.max(0,...observed.longTasks.map(item=>item.duration))},menuPromiseMs,escapePromiseMs,inputTiming:observed.inputs.map(input=>({...input,inWindow:input.t<windowMs,requestToEventMs:input.requested?input.t-input.requested.t:null,eventToNextFrameMs:input.nextFrame?input.nextFrame-input.t:null,eventToAfterPaintOpportunityMs:input.afterPaintOpportunity?input.afterPaintOpportunity-input.t:null}))};
    await save(run,'matched-15s-initial-window',{summary,observed,measurementNote:'Exactly the same 15-second navigation-relative entry window is filtered on baseline and final. LCP candidates may stop at the first input; CLS excludes recent-input shifts. These are single-run lab observations, not field CWV, INP, real-device FPS or a speedup comparison against an all-scenes-ready horizon. Asset prefetch/decompression may still occur; only reconstruction/renderers/GPU work are gated.'});
    // The initial window is now closed. Later deliberate work has a separate
    // horizon and is never folded into initial loading metrics.
    const requestedAt=await page.evaluate(()=>performance.now());
    await page.locator('[data-selected-work]').evaluate(root=>scrollTo({top:scrollY+root.getBoundingClientRect().top-innerHeight*1.5,behavior:'instant'}));
    await page.waitForFunction(()=>{const root=document.querySelector('[data-selected-work]'),box=root.getBoundingClientRect();return box.top>=innerHeight&&box.top<2*innerHeight&&root.dataset.selectedBackgroundReady==='true';});
    const prepared=await page.locator('[data-selected-work]').evaluate(root=>({t:performance.now(),top:root.getBoundingClientRect().top,bottom:root.getBoundingClientRect().bottom,viewportHeight:innerHeight,data:{...root.dataset}}));
    assert.equal(prepared.data.selectedModelsReady,'6');assert.equal(prepared.data.selectedWarmPosesCompleted,'2');
    await save(run,'separate-near-selected-preparation',{legacy,requestedAt,completionMs:prepared.t-requestedAt,prepared,measurementNote:'Deliberate offscreen proximity approach after the fixed initial window; an already prepared baseline can correctly complete immediately.'});
  });
  await safely(browser,'separate-direct-aircraft-entry',{viewport:{width:390,height:844},touch:true},async run=>{
    const {page,context}=run,cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,...network});
    await page.goto(base+'/v2/?review=matched-direct-entry#skylabs-telemetry',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{const root=document.querySelector('[data-aircraft-hero]');return root.dataset.aircraftTelemetryReady==='true'&&root.dataset.aircraftState==='ready'&&root.dataset.aircraftWarmMask==='false'&&Number(root.dataset.aircraftRenderedProgress)===1&&Number(root.dataset.aircraftFrames)>0;});
    const current=await page.locator('[data-aircraft-hero]').evaluate(root=>({completedAt:performance.now(),hash:location.hash,data:{...root.dataset},top:root.getBoundingClientRect().top,bottom:root.getBoundingClientRect().bottom}));
    assert.equal(current.hash,'#skylabs-telemetry');assert.equal(current.data.aircraftChapter,'1');
    await save(run,'separate-cold-direct-aircraft-entry',{legacy,network,current,measurementNote:'A fresh cold context enters the telemetry hash directly. This navigation-to-current-frame completion is separate from the matched top-of-page loading window.'});
  });
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});const profileOnly=process.argv.includes('--profile-only');
  assert.ok(process.env.V2_REVIEW_LEGACY!=='1'||profileOnly,'Legacy acceptance is only valid for explicit matched profiling');
  if(process.env.V2_REVIEW_LEGACY!=='1')sourceContract();if(process.argv.includes('--source-only'))return;
  const group=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8);
  assert.ok(!group||['first-screen','navigation','mobile','fallbacks','sources'].includes(group),'Unknown review browser group: '+group);
  const {chromium}=require('playwright'),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  browserExecuted=true;
  try{
    if(profileOnly){await profile(browser);return;}
    if(!group||group==='first-screen')for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:740}])await firstScreen(browser,viewport);
    if(!group||group==='navigation'){await selectorsAndNavigation(browser);await bypasses(browser);}
    if(!group||group==='mobile')for(const viewport of [{width:390,height:844},{width:320,height:740}])await mobile(browser,viewport);
    if(!group||group==='fallbacks')await fallbacks(browser);
    if(!group||group==='sources')await sources(browser);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);evidence.push({name:'failure',error:error.stack});process.exitCode=1;}).finally(()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify({browserExecuted,environment:'Chromium software WebGL, not a real-device benchmark',evidence},null,2)+'\n');});
